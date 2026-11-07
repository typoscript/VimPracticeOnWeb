import { VimEditorState, VimScriptValue } from '../types/vim';

/**
 * Vim script 표현식 평가기 (eval / Function 미사용, 재귀 하강 파서)
 *
 * 지원 범위 (:help expression-syntax 의 부분 집합):
 * - 값: 정수(10진, 0x16진), "문자열"(\n \t \" \\ 이스케이프), '문자열'('' 이스케이프)
 * - 변수: g:x, l:x, a:x, x(함수 안에서는 l:, 밖에서는 g:), @r(레지스터), v:true / v:false
 * - 연산자 (우선순위 순): ?: / || / && / == != > >= < <= (#: 대소문자 구분, ?: 무시) / + - . .. / * / % / ! - + (단항)
 * - 함수 호출: 사용자 함수 Name(...) 및 내장 함수 (line, col, getline, setline, strlen, len, toupper, tolower,
 *   repeat, string, str2nr, abs, exists, trim)
 *
 * Vim과 같이 숫자와 문자열은 연산에 따라 자동 변환됩니다. ("12abc" + 1 == 13, 1 . 2 == "12")
 */

export class VimScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VimScriptError';
  }
}

/** 평가 중 에디터 상태를 읽고(getline) 바꾸며(setline) 사용자 함수를 호출하기 위한 컨텍스트 */
export interface EvalContext {
  state: VimEditorState;
  /** 함수 지역 변수 (l:) — 없으면 함수 밖 */
  locals?: Record<string, VimScriptValue>;
  /** 함수 인자 (a:) */
  args?: Record<string, VimScriptValue>;
  /** 사용자 함수 호출. ctx.state 를 갱신할 수 있습니다. */
  callUserFunction: (ctx: EvalContext, name: string, args: VimScriptValue[]) => VimScriptValue;
}

// ---------------------------------------------------------------------------
// 값 변환 (:help expr-conversion)
// ---------------------------------------------------------------------------

/** 문자열 → 숫자: 앞부분의 정수만 해석하고 나머지는 무시 ("12abc" → 12, "abc" → 0) */
export function toNumber(value: VimScriptValue): number {
  if (typeof value === 'number') return value;
  const m = value.match(/^\s*([-+]?)(0[xX][0-9a-fA-F]+|\d+)/);
  if (!m) return 0;
  const n = m[2].toLowerCase().startsWith('0x') ? parseInt(m[2], 16) : parseInt(m[2], 10);
  return m[1] === '-' ? -n : n;
}

export function toVimString(value: VimScriptValue): string {
  return typeof value === 'number' ? String(value) : value;
}

export function isTruthy(value: VimScriptValue): boolean {
  return toNumber(value) !== 0;
}

/** :echo string() 처럼 값을 표시용 문자열로 바꿉니다. (문자열은 작은따옴표로 감쌈) */
export function formatValue(value: VimScriptValue): string {
  return typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// 렉서
// ---------------------------------------------------------------------------

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'name'; value: string }
  | { type: 'reg'; value: string }
  | { type: 'op'; value: string }
  | { type: 'eof' };

const OPERATORS = [
  '==#', '==?', '!=#', '!=?', '>=#', '>=?', '<=#', '<=?',
  '..', '==', '!=', '>=', '<=', '&&', '||',
  '>#', '>?', '<#', '<?',
  '+', '-', '*', '/', '%', '.', '!', '<', '>', '(', ')', ',', '?', ':',
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // 숫자
    const num = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+)/);
    if (num) {
      tokens.push({ type: 'num', value: toNumber(num[1]) });
      i += num[1].length;
      continue;
    }
    // "문자열"
    if (ch === '"') {
      let out = '';
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) {
          const esc = src[j + 1];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'e' ? '\x1b' : esc;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new VimScriptError(`E114: 큰따옴표가 닫히지 않았습니다: ${src.slice(i)}`);
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }
    // '문자열'
    if (ch === "'") {
      let out = '';
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            out += "'";
            j += 2;
            continue;
          }
          break;
        }
        out += src[j++];
      }
      if (j >= src.length) throw new VimScriptError(`E115: 작은따옴표가 닫히지 않았습니다: ${src.slice(i)}`);
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }
    // @r 레지스터
    if (ch === '@' && i + 1 < src.length) {
      tokens.push({ type: 'reg', value: src[i + 1] });
      i += 2;
      continue;
    }
    // a:0, a:1 ... (가변 인자 개수 / 순번)
    const argIdx = src.slice(i).match(/^a:\d+/);
    if (argIdx) {
      tokens.push({ type: 'name', value: argIdx[0] });
      i += argIdx[0].length;
      continue;
    }
    // 이름 (g:x, a:name, v:true, Func)
    const name = src.slice(i).match(/^([gblwtsav]:)?[A-Za-z_][A-Za-z0-9_]*/);
    if (name) {
      tokens.push({ type: 'name', value: name[0] });
      i += name[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op });
      i += op.length;
      continue;
    }
    throw new VimScriptError(`E15: 잘못된 표현식입니다: "${src}"`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

// ---------------------------------------------------------------------------
// 파서 + 평가기
// ---------------------------------------------------------------------------

class Evaluator {
  private pos = 0;

  constructor(private tokens: Token[], private source: string, private ctx: EvalContext) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }

  private expectOp(value: string): void {
    if (!this.isOp(value)) throw new VimScriptError(`E15: 잘못된 표현식입니다: "${this.source}"`);
    this.pos++;
  }

  evaluateAll(): VimScriptValue {
    const value = this.ternary();
    if (this.peek().type !== 'eof') {
      throw new VimScriptError(`E15: 잘못된 표현식입니다: "${this.source}"`);
    }
    return value;
  }

  /** 이어서 나열된 표현식을 차례로 평가합니다. (:echo 'a' 1+2) */
  evaluateSequence(): VimScriptValue[] {
    const values: VimScriptValue[] = [];
    while (this.peek().type !== 'eof') {
      values.push(this.ternary());
    }
    return values;
  }

  private ternary(): VimScriptValue {
    const cond = this.or();
    if (!this.isOp('?')) return cond;
    this.pos++;
    const a = this.ternary();
    this.expectOp(':');
    const b = this.ternary();
    return isTruthy(cond) ? a : b;
  }

  private or(): VimScriptValue {
    let left = this.and();
    while (this.isOp('||')) {
      this.pos++;
      const right = this.and();
      left = isTruthy(left) || isTruthy(right) ? 1 : 0;
    }
    return left;
  }

  private and(): VimScriptValue {
    let left = this.compare();
    while (this.isOp('&&')) {
      this.pos++;
      const right = this.compare();
      left = isTruthy(left) && isTruthy(right) ? 1 : 0;
    }
    return left;
  }

  private compare(): VimScriptValue {
    const left = this.additive();
    const t = this.peek();
    if (t.type !== 'op' || !/^(==|!=|>=|<=|>|<)[#?]?$/.test(t.value)) return left;
    this.pos++;
    const right = this.additive();
    const base = t.value.replace(/[#?]$/, '');
    const ignoreCase =
      t.value.endsWith('?') || (!t.value.endsWith('#') && !!this.ctx.state.options?.ignorecase);

    let cmp: number;
    if (typeof left === 'string' && typeof right === 'string') {
      const l = ignoreCase ? left.toLowerCase() : left;
      const r = ignoreCase ? right.toLowerCase() : right;
      cmp = l < r ? -1 : l > r ? 1 : 0;
    } else {
      cmp = toNumber(left) - toNumber(right);
    }
    const result =
      base === '==' ? cmp === 0 :
      base === '!=' ? cmp !== 0 :
      base === '>' ? cmp > 0 :
      base === '>=' ? cmp >= 0 :
      base === '<' ? cmp < 0 : cmp <= 0;
    return result ? 1 : 0;
  }

  private additive(): VimScriptValue {
    let left = this.multiplicative();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) {
        const op = (this.peek() as { value: string }).value;
        this.pos++;
        const right = this.multiplicative();
        left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
      } else if (this.isOp('.') || this.isOp('..')) {
        this.pos++;
        const right = this.multiplicative();
        left = toVimString(left) + toVimString(right);
      } else {
        return left;
      }
    }
  }

  private multiplicative(): VimScriptValue {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.peek() as { value: string }).value;
      this.pos++;
      const l = toNumber(left);
      const r = toNumber(this.unary());
      if (op === '*') left = l * r;
      // Vim: 0으로 나누면 에러 대신 특수 값을 돌려줍니다 (정수 나눗셈, 0 방향 버림)
      else if (op === '/') left = r === 0 ? (l === 0 ? -0x7fffffff : l > 0 ? 0x7fffffff : -0x7fffffff) : Math.trunc(l / r);
      else left = r === 0 ? 0 : l % r;
    }
    return left;
  }

  private unary(): VimScriptValue {
    if (this.isOp('!')) {
      this.pos++;
      return isTruthy(this.unary()) ? 0 : 1;
    }
    if (this.isOp('-')) {
      this.pos++;
      return -toNumber(this.unary());
    }
    if (this.isOp('+')) {
      this.pos++;
      return toNumber(this.unary());
    }
    return this.primary();
  }

  private primary(): VimScriptValue {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'str') {
      this.pos++;
      return t.value;
    }
    if (t.type === 'reg') {
      this.pos++;
      return readRegister(this.ctx.state, t.value);
    }
    if (t.type === 'op' && t.value === '(') {
      this.pos++;
      const v = this.ternary();
      this.expectOp(')');
      return v;
    }
    if (t.type === 'name') {
      this.pos++;
      if (this.isOp('(')) {
        this.pos++;
        const args: VimScriptValue[] = [];
        if (!this.isOp(')')) {
          args.push(this.ternary());
          while (this.isOp(',')) {
            this.pos++;
            args.push(this.ternary());
          }
        }
        this.expectOp(')');
        return this.call(t.value, args);
      }
      return readVariable(this.ctx, t.value);
    }
    throw new VimScriptError(`E15: 잘못된 표현식입니다: "${this.source}"`);
  }

  private call(name: string, args: VimScriptValue[]): VimScriptValue {
    if (/^[A-Z]/.test(name) || name.startsWith('g:') || name.startsWith('s:')) {
      return this.ctx.callUserFunction(this.ctx, name.replace(/^g:/, ''), args);
    }
    const builtin = BUILTINS[name];
    if (!builtin) throw new VimScriptError(`E117: 알 수 없는 함수입니다: ${name}`);
    if (args.length < builtin.min) throw new VimScriptError(`E119: 함수의 인자가 부족합니다: ${name}`);
    if (args.length > builtin.max) throw new VimScriptError(`E118: 함수의 인자가 너무 많습니다: ${name}`);
    return builtin.fn(this.ctx, args);
  }
}

function readRegister(state: VimEditorState, reg: string): string {
  const entry = state.registers?.[reg === '"' ? '"' : reg.toLowerCase()];
  if (entry) return Array.isArray(entry.content) ? entry.content.join('') : entry.content;
  if (reg === '"') return state.clipboard?.content ?? '';
  return '';
}

/** 이름의 스코프를 판별합니다. 함수 안에서는 접두어 없는 이름이 l:, 밖에서는 g: 입니다. */
export function resolveVariableName(ctx: Pick<EvalContext, 'locals'>, name: string): { scope: 'g' | 'l' | 'a' | 'v'; key: string } {
  const m = name.match(/^([gblwtsav]):(.+)$/);
  if (m) {
    const scope = m[1];
    if (scope === 'a' || scope === 'l' || scope === 'v') return { scope, key: m[2] };
    // b: w: t: s: 는 단순화를 위해 g: 공간에 접두어를 붙여 저장
    return { scope: 'g', key: scope === 'g' ? m[2] : `${scope}:${m[2]}` };
  }
  return ctx.locals ? { scope: 'l', key: name } : { scope: 'g', key: name };
}

function readVariable(ctx: EvalContext, name: string): VimScriptValue {
  const { scope, key } = resolveVariableName(ctx, name);
  if (scope === 'v') {
    if (key === 'true') return 1;
    if (key === 'false') return 0;
  } else if (scope === 'a') {
    if (ctx.args && key in ctx.args) return ctx.args[key];
  } else if (scope === 'l') {
    if (ctx.locals && key in ctx.locals) return ctx.locals[key];
  } else {
    const globals = ctx.state.globalVars ?? {};
    if (key in globals) return globals[key];
  }
  throw new VimScriptError(`E121: 정의되지 않은 변수입니다: ${name}`);
}

/** line('.'), getline('$') 등 줄 지정 인자를 0-based 줄 번호로 변환합니다. (범위 밖이면 -1) */
function resolveLineArg(state: VimEditorState, arg: VimScriptValue): number {
  if (arg === '.') return state.cursor.line;
  if (arg === '$') return state.lines.length - 1;
  const n = toNumber(arg);
  return n >= 1 && n <= state.lines.length ? n - 1 : -1;
}

interface Builtin {
  min: number;
  max: number;
  fn: (ctx: EvalContext, args: VimScriptValue[]) => VimScriptValue;
}

const BUILTINS: Record<string, Builtin> = {
  line: { min: 1, max: 1, fn: (ctx, [a]) => resolveLineArg(ctx.state, a) + 1 },
  col: {
    min: 1,
    max: 1,
    fn: (ctx, [a]) =>
      a === '.' ? ctx.state.cursor.col + 1 : a === '$' ? (ctx.state.lines[ctx.state.cursor.line] ?? '').length + 1 : 0,
  },
  getline: {
    min: 1,
    max: 1,
    fn: (ctx, [a]) => {
      const l = resolveLineArg(ctx.state, a);
      return l >= 0 ? ctx.state.lines[l] ?? '' : '';
    },
  },
  setline: {
    min: 2,
    max: 2,
    fn: (ctx, [a, text]) => {
      const l = resolveLineArg(ctx.state, a);
      if (l < 0) return 1;
      const lines = [...ctx.state.lines];
      lines[l] = toVimString(text);
      ctx.state = { ...ctx.state, lines };
      return 0;
    },
  },
  strlen: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).length },
  len: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).length },
  toupper: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toUpperCase() },
  tolower: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toLowerCase() },
  repeat: { min: 2, max: 2, fn: (_c, [s, n]) => toVimString(s).repeat(Math.max(0, toNumber(n))) },
  string: { min: 1, max: 1, fn: (_c, [v]) => formatValue(v) },
  str2nr: { min: 1, max: 1, fn: (_c, [s]) => toNumber(toVimString(s)) },
  abs: { min: 1, max: 1, fn: (_c, [n]) => Math.abs(toNumber(n)) },
  trim: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).trim() },
  exists: {
    min: 1,
    max: 1,
    fn: (ctx, [s]) => {
      const name = toVimString(s);
      if (name.startsWith('*')) return ctx.state.userFunctions?.[name.slice(1)] || BUILTINS[name.slice(1)] ? 1 : 0;
      try {
        readVariable(ctx, name);
        return 1;
      } catch {
        return 0;
      }
    },
  },
};

/** 표현식 문자열을 평가합니다. 실패하면 VimScriptError를 던집니다. ctx.state 는 setline 등으로 갱신될 수 있습니다. */
export function evaluateVimScript(source: string, ctx: EvalContext): VimScriptValue {
  const trimmed = source.trim();
  if (trimmed.length === 0) throw new VimScriptError('E15: 표현식이 비어 있습니다');
  return new Evaluator(tokenize(trimmed), trimmed, ctx).evaluateAll();
}

/** :echo 처럼 공백으로 구분된 여러 표현식을 평가합니다. ("echo 'a' 1+2" → ['a', 3]) */
export function evaluateVimScriptList(source: string, ctx: EvalContext): VimScriptValue[] {
  const trimmed = source.trim();
  if (trimmed.length === 0) return [];
  return new Evaluator(tokenize(trimmed), trimmed, ctx).evaluateSequence();
}
