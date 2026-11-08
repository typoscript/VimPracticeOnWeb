import { VimEditorState, VimScriptDict, VimScriptFuncref, VimScriptValue } from './types';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';

/**
 * Vim script 표현식 평가기 (eval / Function 미사용, 재귀 하강 파서)
 *
 * 지원 범위 (:help expression-syntax 의 부분 집합):
 * - 값: 정수(10진, 0x16진), "문자열"(\n \t \" \\ 이스케이프), '문자열'('' 이스케이프),
 *       리스트 [1, 'a'], 딕셔너리 {'k': v}, 리터럴 딕셔너리 #{k: v}
 * - 변수: g:x, l:x, a:x, a:000, x(함수 안에서는 l:, 밖에서는 g:), @r(레지스터), v:true / v:false / v:val / v:key
 * - 연산자 (우선순위 순): ?: / || / && / == != > >= < <= =~ !~ is isnot (#: 대소문자 구분, ?: 무시)
 *   / + - . .. / * / % / ! - + (단항) / 인덱스 x[i], 슬라이스 x[a:b], 멤버 d.key, 함수 호출
 * - 내장 함수: BUILTINS 참고 (리스트·딕셔너리·문자열·버퍼 함수, substitute, printf, map, filter ...)
 *
 * Vim과 같이 숫자와 문자열은 연산에 따라 자동 변환되며, 리스트·딕셔너리를 숫자·문자열로 쓰면 에러입니다.
 *
 * ⚠ 리스트·딕셔너리는 불변 상태 규약에 맞춰 값(value) 의미론으로 동작합니다. 대신 add(), sort() 처럼 인자를
 *   제자리에서 바꾸는 내장 함수는 첫 인자가 변수이면 결과를 그 변수에 다시 저장하므로 `call add(l, x)` 같은
 *   관용구는 Vim과 같게 동작합니다. (let b = a 로 만든 별칭은 함께 바뀌지 않습니다)
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
  /** map() / filter() 표현식 안의 v:val, v:key */
  vvars?: Record<string, VimScriptValue>;
  /** :s 의 \= 치환식에서 submatch(n) 이 돌려줄 값 (0: 전체 일치, 1~9: 그룹) */
  submatches?: string[];
  /** 사용자 함수 호출. ctx.state 를 갱신할 수 있습니다. */
  callUserFunction: (ctx: EvalContext, name: string, args: VimScriptValue[]) => VimScriptValue;
}

// ---------------------------------------------------------------------------
// 값 판별·변환 (:help expr-conversion)
// ---------------------------------------------------------------------------

export function isList(value: VimScriptValue): value is VimScriptValue[] {
  return Array.isArray(value);
}

export function isDict(value: VimScriptValue): value is VimScriptDict {
  return typeof value === 'object' && !Array.isArray(value) && value.kind === 'dict';
}

export function isFuncref(value: VimScriptValue): value is VimScriptFuncref {
  return typeof value === 'object' && !Array.isArray(value) && value.kind === 'funcref';
}

export function makeDict(items: Record<string, VimScriptValue> = {}): VimScriptDict {
  return { kind: 'dict', items };
}

export function makeFuncref(
  target: string | VimScriptFuncref,
  extraArgs?: VimScriptValue[],
  dict?: VimScriptDict
): VimScriptFuncref {
  if (typeof target === 'string') {
    return {
      kind: 'funcref',
      name: target,
      args: extraArgs ? (isList(extraArgs) ? [...extraArgs] : [extraArgs]) : undefined,
      dict,
    };
  }
  if (isFuncref(target)) {
    const mergedArgs = [
      ...(target.args ?? []),
      ...(extraArgs ? (isList(extraArgs) ? extraArgs : [extraArgs]) : []),
    ];
    return {
      ...target,
      args: mergedArgs.length > 0 ? mergedArgs : undefined,
      dict: dict ?? target.dict,
    };
  }
  throw new VimScriptError(msg('E129: 함수 이름 또는 funcref 가 필요합니다'));
}

/** 문자열 → 숫자: 앞부분의 정수만 해석하고 나머지는 무시 ("12abc" → 12, "abc" → 0) */
export function toNumber(value: VimScriptValue): number {
  if (typeof value === 'number') return value;
  if (isList(value)) throw new VimScriptError(msg('E745: 리스트를 숫자로 사용할 수 없습니다'));
  if (isDict(value)) throw new VimScriptError(msg('E728: 딕셔너리를 숫자로 사용할 수 없습니다'));
  if (isFuncref(value)) throw new VimScriptError(msg('E703: Funcref를 숫자로 사용할 수 없습니다'));
  const m = value.match(/^\s*([-+]?)(0[xX][0-9a-fA-F]+|\d+)/);
  if (!m) return 0;
  const n = m[2].toLowerCase().startsWith('0x') ? parseInt(m[2], 16) : parseInt(m[2], 10);
  return m[1] === '-' ? -n : n;
}

export function toVimString(value: VimScriptValue): string {
  if (typeof value === 'number') return String(value);
  if (isList(value)) throw new VimScriptError(msg('E730: 리스트를 문자열로 사용할 수 없습니다'));
  if (isDict(value)) throw new VimScriptError(msg('E731: 딕셔너리를 문자열로 사용할 수 없습니다'));
  if (isFuncref(value)) throw new VimScriptError(msg('E729: Funcref를 문자열로 사용할 수 없습니다'));
  return value;
}

export function isTruthy(value: VimScriptValue): boolean {
  if (isFuncref(value)) return true;
  return toNumber(value) !== 0;
}

/** string() 처럼 값을 다시 읽을 수 있는 표현으로 바꿉니다. (문자열은 작은따옴표로 감쌈) */
export function formatValue(value: VimScriptValue): string {
  if (typeof value === 'number') return String(value);
  if (isList(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (isDict(value)) {
    const entries = Object.entries(value.items).map(([k, v]) => `${formatValue(k)}: ${formatValue(v)}`);
    return `{${entries.join(', ')}}`;
  }
  if (isFuncref(value)) {
    if (value.lambda) {
      return `{${value.lambda.params.join(', ')} -> ${value.lambda.bodyExpr}}`;
    }
    if (value.name) {
      return value.args && value.args.length > 0
        ? `function('${value.name}', [${value.args.map(formatValue).join(', ')}])`
        : `function('${value.name}')`;
    }
    return '<funcref>';
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** :echo 출력 형식: 최상위 문자열은 그대로, 리스트·딕셔너리는 string() 형식 */
export function displayValue(value: VimScriptValue): string {
  return typeof value === 'string' ? value : formatValue(value);
}

/** + 연산: 리스트끼리는 연결, 그 밖에는 숫자 덧셈 */
export function addValues(a: VimScriptValue, b: VimScriptValue): VimScriptValue {
  if (isList(a) && isList(b)) return [...a, ...b];
  return toNumber(a) + toNumber(b);
}

function typeCode(v: VimScriptValue): number {
  return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : isList(v) ? 3 : isDict(v) ? 4 : isFuncref(v) ? 2 : 0;
}

/** == 비교 (리스트·딕셔너리는 내용 비교) */
function valuesEqual(a: VimScriptValue, b: VimScriptValue, ignoreCase: boolean): boolean {
  if (isFuncref(a) || isFuncref(b)) {
    if (!isFuncref(a) || !isFuncref(b)) return false;
    if (a.name !== b.name) return false;
    if (a.lambda?.bodyExpr !== b.lambda?.bodyExpr) return false;
    return true;
  }
  if (isList(a) || isList(b)) {
    if (!isList(a) || !isList(b)) throw new VimScriptError(msg('E691: 리스트는 리스트와만 비교할 수 있습니다'));
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i], ignoreCase));
  }
  if (isDict(a) || isDict(b)) {
    if (!isDict(a) || !isDict(b)) throw new VimScriptError(msg('E735: 딕셔너리는 딕셔너리와만 비교할 수 있습니다'));
    const ka = Object.keys(a.items);
    return ka.length === Object.keys(b.items).length && ka.every((k) => k in b.items && valuesEqual(a.items[k], b.items[k], ignoreCase));
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
  }
  return toNumber(a) === toNumber(b);
}

/** Vim 패턴을 JS RegExp 로 변환합니다. 패턴 안의 \c / \C 는 대소문자 무시 여부를 덮어씁니다. (=~ 는 smartcase 미적용) */
export function compileVimPattern(pattern: string, ignoreCase: boolean, flags = ''): RegExp {
  try {
    return compileVimRegex(pattern, { ignorecase: ignoreCase, flags });
  } catch {
    throw new VimScriptError(msg('E383: 잘못된 검색 패턴입니다: {pattern}', { pattern }));
  }
}

// ---------------------------------------------------------------------------
// 렉서
// ---------------------------------------------------------------------------

type Token = (
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'name'; value: string }
  | { type: 'reg'; value: string }
  | { type: 'op'; value: string }
  | { type: 'eof'; value?: undefined }
) & { space: boolean; start: number; end: number };

const OPERATORS = [
  '==#', '==?', '!=#', '!=?', '>=#', '>=?', '<=#', '<=?', '=~#', '=~?', '!~#', '!~?',
  '..', '==', '!=', '>=', '<=', '=~', '!~', '&&', '||', '#{',
  '>#', '>?', '<#', '<?',
  '->',
  '+', '-', '*', '/', '%', '.', '!', '<', '>', '(', ')', '[', ']', '{', '}', ',', '?', ':',
];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let space = false;
  const push = (t: Omit<Token, 'space' | 'start' | 'end'>, start: number, end: number) => {
    tokens.push({ ...t, space, start, end } as Token);
    space = false;
  };
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      space = true;
      i++;
      continue;
    }
    // 숫자
    const num = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+)/);
    if (num) {
      const len = num[1].length;
      push({ type: 'num', value: toNumber(num[1]) }, i, i + len);
      i += len;
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
      if (j >= src.length) throw new VimScriptError(msg('E114: 큰따옴표가 닫히지 않았습니다: {v}', { v: src.slice(i) }));
      push({ type: 'str', value: out }, i, j + 1);
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
      if (j >= src.length) throw new VimScriptError(msg('E115: 작은따옴표가 닫히지 않았습니다: {v}', { v: src.slice(i) }));
      push({ type: 'str', value: out }, i, j + 1);
      i = j + 1;
      continue;
    }
    // @r 레지스터
    if (ch === '@' && i + 1 < src.length) {
      push({ type: 'reg', value: src[i + 1] }, i, i + 2);
      i += 2;
      continue;
    }
    // a:0, a:1, a:000 (가변 인자)
    const argIdx = src.slice(i).match(/^a:\d+/);
    if (argIdx) {
      const len = argIdx[0].length;
      push({ type: 'name', value: argIdx[0] }, i, i + len);
      i += len;
      continue;
    }
    // 이름 (g:x, a:name, v:true, Func)
    const name = src.slice(i).match(/^([gblwtsav]:)?[A-Za-z_][A-Za-z0-9_]*/);
    if (name) {
      const len = name[0].length;
      push({ type: 'name', value: name[0] }, i, i + len);
      i += len;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      push({ type: 'op', value: op }, i, i + op.length);
      i += op.length;
      continue;
    }
    throw new VimScriptError(msg('E15: 잘못된 표현식입니다: "{src}"', { src }));
  }
  push({ type: 'eof' }, i, i);
  return tokens;
}

// ---------------------------------------------------------------------------
// 대입 대상 (lvalue): 변수 / 레지스터 + [인덱스] / .키 경로
// ---------------------------------------------------------------------------

export interface LValue {
  /** 변수 이름(g:x, x) 또는 레지스터(@a) */
  base: string;
  /** 인덱스 경로 (리스트 인덱스는 number, 딕셔너리 키는 string) */
  path: (number | string)[];
}

function indexError(index: number): VimScriptError {
  return new VimScriptError(msg('E684: 리스트 인덱스가 범위를 벗어났습니다: {index}', { index }));
}

function getIn(container: VimScriptValue, key: number | string): VimScriptValue {
  if (isList(container)) {
    const n = toNumber(key);
    const idx = n < 0 ? container.length + n : n;
    if (idx < 0 || idx >= container.length) throw indexError(n);
    return container[idx];
  }
  if (isDict(container)) {
    const k = toVimString(key);
    if (!(k in container.items)) throw new VimScriptError(msg('E716: 딕셔너리에 키가 없습니다: "{k}"', { k }));
    return container.items[k];
  }
  throw new VimScriptError(msg('E689: 리스트나 딕셔너리만 인덱스로 접근할 수 있습니다'));
}

function setIn(container: VimScriptValue, path: (number | string)[], value: VimScriptValue): VimScriptValue {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (isList(container)) {
    const n = toNumber(key);
    const idx = n < 0 ? container.length + n : n;
    if (idx < 0 || idx >= container.length) throw indexError(n);
    const copy = [...container];
    copy[idx] = setIn(container[idx], rest, value);
    return copy;
  }
  if (isDict(container)) {
    const k = toVimString(key);
    if (rest.length > 0 && !(k in container.items)) throw new VimScriptError(msg('E716: 딕셔너리에 키가 없습니다: "{k}"', { k }));
    return makeDict({ ...container.items, [k]: setIn(container.items[k], rest, value) });
  }
  throw new VimScriptError(msg('E689: 리스트나 딕셔너리만 인덱스로 접근할 수 있습니다'));
}

function removeIn(container: VimScriptValue, path: (number | string)[]): VimScriptValue {
  const [key, ...rest] = path;
  if (rest.length > 0) {
    return setIn(container, [key], removeIn(getIn(container, key), rest));
  }
  if (isList(container)) {
    const n = toNumber(key);
    const idx = n < 0 ? container.length + n : n;
    if (idx < 0 || idx >= container.length) throw indexError(n);
    return container.filter((_, i) => i !== idx);
  }
  if (isDict(container)) {
    const k = toVimString(key);
    if (!(k in container.items)) throw new VimScriptError(msg('E716: 딕셔너리에 키가 없습니다: "{k}"', { k }));
    const items = { ...container.items };
    delete items[k];
    return makeDict(items);
  }
  throw new VimScriptError(msg('E689: 리스트나 딕셔너리만 인덱스로 접근할 수 있습니다'));
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

function readRegister(state: VimEditorState, reg: string): string {
  const entry = state.registers?.[reg === '"' ? '"' : reg.toLowerCase()];
  if (entry) return Array.isArray(entry.content) ? entry.content.join('') : entry.content;
  if (reg === '"') return state.clipboard?.content ?? '';
  return '';
}

export function readVariable(ctx: EvalContext, name: string): VimScriptValue {
  const { scope, key } = resolveVariableName(ctx, name);
  if (scope === 'v') {
    if (key === 'true') return 1;
    if (key === 'false') return 0;
    if (key === 'exception') return ctx.vvars?.['exception'] ?? '';
    if (key === 'throwpoint') return ctx.vvars?.['throwpoint'] ?? '';
    if (ctx.vvars && key in ctx.vvars) return ctx.vvars[key];
  } else if (scope === 'a') {
    if (ctx.args && key in ctx.args) return ctx.args[key];
  } else if (scope === 'l') {
    if (ctx.locals && key in ctx.locals) return ctx.locals[key];
  } else {
    const globals = ctx.state.globalVars ?? {};
    if (key in globals) return globals[key];
  }
  throw new VimScriptError(msg('E121: 정의되지 않은 변수입니다: {name}', { name }));
}

/** 변수에 값을 씁니다. (a: / v: 는 읽기 전용) */
export function writeVariable(ctx: EvalContext, name: string, value: VimScriptValue): void {
  const { scope, key } = resolveVariableName(ctx, name);
  if (scope === 'a' || scope === 'v') throw new VimScriptError(msg('E46: 읽기 전용 변수는 바꿀 수 없습니다: {name}', { name }));
  if (scope === 'l') {
    ctx.locals![key] = value;
  } else {
    ctx.state = { ...ctx.state, globalVars: { ...(ctx.state.globalVars ?? {}), [key]: value } };
  }
}

function deleteVariable(ctx: EvalContext, name: string, force: boolean): void {
  const { scope, key } = resolveVariableName(ctx, name);
  const store = scope === 'l' ? ctx.locals : scope === 'g' ? ctx.state.globalVars : undefined;
  if (!store || !(key in store)) {
    if (force) return;
    throw new VimScriptError(msg('E108: 해당 변수가 없습니다: {name}', { name }));
  }
  if (scope === 'l') {
    delete ctx.locals![key];
  } else {
    const globals = { ...(ctx.state.globalVars ?? {}) };
    delete globals[key];
    ctx.state = { ...ctx.state, globalVars: globals };
  }
}

/** 대입 대상의 현재 값을 읽습니다. */
export function readLValue(ctx: EvalContext, lv: LValue): VimScriptValue {
  let value: VimScriptValue = lv.base.startsWith('@') ? readRegister(ctx.state, lv.base[1]) : readVariable(ctx, lv.base);
  for (const key of lv.path) value = getIn(value, key);
  return value;
}

/** 대입 대상에 값을 씁니다. (l[0] = x, d.key = x 는 리스트·딕셔너리를 복사해 바꾼 뒤 변수에 다시 저장) */
export function writeLValue(ctx: EvalContext, lv: LValue, value: VimScriptValue): void {
  if (lv.base.startsWith('@')) {
    if (lv.path.length > 0) throw new VimScriptError(msg('E15: 레지스터에는 인덱스를 쓸 수 없습니다: {base}', { base: lv.base }));
    const reg = lv.base[1] === '"' ? '"' : lv.base[1].toLowerCase();
    ctx.state = {
      ...ctx.state,
      registers: { ...(ctx.state.registers ?? {}), [reg]: { type: 'char', content: toVimString(value) } },
    };
    return;
  }
  const next = lv.path.length === 0 ? value : setIn(readVariable(ctx, lv.base), lv.path, value);
  writeVariable(ctx, lv.base, next);
}

/** :unlet 대상(변수, 리스트 항목, 딕셔너리 키)을 지웁니다. */
export function unsetLValue(ctx: EvalContext, lv: LValue, force: boolean): void {
  if (lv.path.length === 0) {
    deleteVariable(ctx, lv.base, force);
    return;
  }
  writeVariable(ctx, lv.base, removeIn(readVariable(ctx, lv.base), lv.path));
}

/** "g:list[0]", "d.key", "@a" 같은 대입 대상 문자열을 해석합니다. (인덱스 표현식은 평가) */
export function parseLValue(source: string, ctx: EvalContext): LValue {
  const trimmed = source.trim();
  return new Evaluator(tokenize(trimmed), trimmed, ctx).lvalue();
}

// ---------------------------------------------------------------------------
// 파서 + 평가기
// ---------------------------------------------------------------------------

class Evaluator {
  private pos = 0;

  constructor(private tokens: Token[], private source: string, private ctx: EvalContext) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === value;
  }

  private invalid(): VimScriptError {
    return new VimScriptError(msg('E15: 잘못된 표현식입니다: "{source}"', { source: this.source }));
  }

  private expectOp(value: string, error?: () => VimScriptError): void {
    if (!this.isOp(value)) throw error ? error() : this.invalid();
    this.pos++;
  }

  evaluateAll(): VimScriptValue {
    const value = this.ternary();
    if (this.peek().type !== 'eof') throw this.invalid();
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

  lvalue(): LValue {
    const t = this.peek();
    let base: string;
    if (t.type === 'reg') base = `@${t.value}`;
    else if (t.type === 'name') base = t.value;
    else throw new VimScriptError(msg('E475: 잘못된 대입 대상입니다: {source}', { source: this.source }));
    this.pos++;
    const path: (number | string)[] = [];
    for (;;) {
      if (this.isOp('[')) {
        this.pos++;
        const key = this.ternary();
        this.expectOp(']');
        path.push(typeof key === 'number' ? key : toVimString(key));
      } else if (this.isOp('.') && this.peek(1).type === 'name' && !this.peek(1).space) {
        this.pos++;
        path.push(String(this.peek().value));
        this.pos++;
      } else {
        break;
      }
    }
    if (this.peek().type !== 'eof') throw new VimScriptError(msg('E475: 잘못된 대입 대상입니다: {source}', { source: this.source }));
    return { base, path };
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
    let op: string | null = null;
    if (t.type === 'op' && /^(==|!=|>=|<=|>|<|=~|!~)[#?]?$/.test(t.value)) op = t.value;
    else if (t.type === 'name' && (t.value === 'is' || t.value === 'isnot')) op = t.value;
    if (!op) return left;
    this.pos++;
    const right = this.additive();

    const base = op.replace(/[#?]$/, '');
    const ignoreCase = op.endsWith('?') || (!op.endsWith('#') && !!this.ctx.state.options?.ignorecase);

    if (base === '=~' || base === '!~') {
      const matched = compileVimPattern(toVimString(right), ignoreCase).test(toVimString(left));
      return matched === (base === '=~') ? 1 : 0;
    }
    if (base === 'is' || base === 'isnot') {
      // 값 의미론이므로 같은 종류·같은 내용이면 같은 것으로 봅니다
      const same = typeCode(left) === typeCode(right) && valuesEqual(left, right, false);
      return same === (base === 'is') ? 1 : 0;
    }
    if (base === '==' || base === '!=') {
      const eq = valuesEqual(left, right, ignoreCase);
      return eq === (base === '==') ? 1 : 0;
    }

    if (isList(left) || isList(right) || isDict(left) || isDict(right)) {
      throw new VimScriptError(msg('E692: 리스트·딕셔너리에는 크기 비교를 쓸 수 없습니다'));
    }
    let cmp: number;
    if (typeof left === 'string' && typeof right === 'string') {
      const l = ignoreCase ? left.toLowerCase() : left;
      const r = ignoreCase ? right.toLowerCase() : right;
      cmp = l < r ? -1 : l > r ? 1 : 0;
    } else {
      cmp = toNumber(left) - toNumber(right);
    }
    const result = base === '>' ? cmp > 0 : base === '>=' ? cmp >= 0 : base === '<' ? cmp < 0 : cmp <= 0;
    return result ? 1 : 0;
  }

  private additive(): VimScriptValue {
    let left = this.multiplicative();
    for (;;) {
      if (this.isOp('+')) {
        this.pos++;
        left = addValues(left, this.multiplicative());
      } else if (this.isOp('-')) {
        this.pos++;
        left = toNumber(left) - toNumber(this.multiplicative());
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
      const op = String(this.peek().value);
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
    return this.postfix();
  }

  /** 인덱스 x[i], 슬라이스 x[a:b], 멤버 d.key, 함수/람다 호출 () */
  private postfix(): VimScriptValue {
    let value = this.primary();
    for (;;) {
      if (this.isOp('[') && !this.peek().space) {
        this.pos++;
        value = this.subscript(value);
      } else if (
        this.isOp('.') && !this.peek().space && isDict(value) &&
        this.peek(1).type === 'name' && !this.peek(1).space
      ) {
        this.pos++;
        const key = String(this.peek().value);
        this.pos++;
        const member = getIn(value, key);
        if (isFuncref(member)) {
          value = { ...member, dict: value };
        } else {
          value = member;
        }
      } else if (this.isOp('(') && !this.peek().space && (isFuncref(value) || typeof value === 'string')) {
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
        if (isFuncref(value)) {
          value = invokeFuncref(this.ctx, value, args);
        } else {
          value = this.call(value, args, null);
        }
      } else {
        return value;
      }
    }
  }

  private isLambdaAhead(): boolean {
    if (this.peek().type !== 'op' || this.peek().value !== '{') return false;
    let k = this.pos + 1;
    const t = this.tokens[k];
    if (!t || t.type === 'eof') return false;
    if (t.type === 'op' && t.value === '->') return true;

    while (k < this.tokens.length) {
      const cur = this.tokens[k];
      if (cur.type === 'name') {
        k++;
      } else if (
        cur.type === 'op' && cur.value === '.' &&
        this.tokens[k + 1]?.type === 'op' && this.tokens[k + 1]?.value === '.' &&
        this.tokens[k + 2]?.type === 'op' && this.tokens[k + 2]?.value === '.'
      ) {
        k += 3;
      } else {
        return false;
      }

      const next = this.tokens[k];
      if (!next) return false;
      if (next.type === 'op' && next.value === '->') return true;
      if (next.type === 'op' && next.value === ',') {
        k++;
        continue;
      }
      return false;
    }
    return false;
  }

  private parseLambda(): VimScriptFuncref {
    this.expectOp('{');
    const params: string[] = [];
    if (!this.isOp('->')) {
      for (;;) {
        const t = this.peek();
        if (t.type === 'name') {
          params.push(t.value);
          this.pos++;
        } else if (
          t.type === 'op' && t.value === '.' &&
          this.peek(1).type === 'op' && this.peek(1).value === '.' &&
          this.peek(2).type === 'op' && this.peek(2).value === '.'
        ) {
          params.push('...');
          this.pos += 3;
        } else {
          throw this.invalid();
        }

        if (this.isOp('->')) break;
        this.expectOp(',');
      }
    }
    this.expectOp('->');

    const bodyTokens: Token[] = [];
    let braceDepth = 0;
    while (this.pos < this.tokens.length) {
      const cur = this.peek();
      if (cur.type === 'eof') {
        throw new VimScriptError(msg('E15: 람다 끝에 } 가 없습니다: {source}', { source: this.source }));
      }
      if (cur.type === 'op' && (cur.value === '{' || cur.value === '#{')) {
        braceDepth++;
      } else if (cur.type === 'op' && cur.value === '}') {
        if (braceDepth === 0) {
          break;
        }
        braceDepth--;
      }
      bodyTokens.push(cur);
      this.pos++;
    }
    this.expectOp('}');

    const bodyExpr =
      bodyTokens.length > 0
        ? this.source.slice(bodyTokens[0].start, bodyTokens[bodyTokens.length - 1].end).trim()
        : '';

    const closureVars: Record<string, VimScriptValue> = {
      ...(this.ctx.locals ?? {}),
    };
    const closureArgs: Record<string, VimScriptValue> = {
      ...(this.ctx.args ?? {}),
    };

    return {
      kind: 'funcref',
      lambda: {
        params,
        bodyExpr,
        closureVars,
        closureArgs,
      },
    };
  }

  private subscript(value: VimScriptValue): VimScriptValue {
    // [:b] / [a:] / [a:b] / [i]
    let start: VimScriptValue | undefined;
    if (!this.isOp(':')) {
      start = this.or();
      if (this.isOp('?')) {
        this.pos++;
        const a = this.ternary();
        this.expectOp(':');
        const b = this.ternary();
        start = isTruthy(start) ? a : b;
      }
    }
    if (this.isOp(':')) {
      this.pos++;
      const end = this.isOp(']') ? undefined : this.or();
      this.expectOp(']');
      return slice(value, start, end);
    }
    this.expectOp(']');
    if (typeof value === 'number' || typeof value === 'string') {
      // 문자열 인덱스는 범위를 벗어나면 빈 문자열
      const s = toVimString(value);
      const n = toNumber(start!);
      return n >= 0 && n < s.length ? s[n] : '';
    }
    return getIn(value, isDict(value) ? toVimString(start!) : toNumber(start!));
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
    if (t.type === 'op' && t.value === '[') {
      this.pos++;
      const items: VimScriptValue[] = [];
      while (!this.isOp(']')) {
        items.push(this.ternary());
        if (!this.isOp(',')) break;
        this.pos++;
      }
      this.expectOp(']', () => new VimScriptError(msg('E697: 리스트 끝에 ] 가 없습니다: {source}', { source: this.source })));
      return items;
    }
    if (t.type === 'op' && t.value === '{' && this.isLambdaAhead()) {
      return this.parseLambda();
    }
    if (t.type === 'op' && (t.value === '{' || t.value === '#{')) {
      const literalKeys = t.value === '#{';
      this.pos++;
      const items: Record<string, VimScriptValue> = {};
      while (!this.isOp('}')) {
        let key: string;
        const kt = this.peek();
        if (literalKeys && (kt.type === 'name' || kt.type === 'num')) {
          key = String(kt.value);
          this.pos++;
        } else {
          key = toVimString(this.or());
        }
        this.expectOp(':', () => new VimScriptError(msg('E720: 딕셔너리 키 뒤에 : 가 없습니다: {source}', { source: this.source })));
        items[key] = this.ternary();
        if (!this.isOp(',')) break;
        this.pos++;
      }
      this.expectOp('}', () => new VimScriptError(msg('E723: 딕셔너리 끝에 } 가 없습니다: {source}', { source: this.source })));
      return makeDict(items);
    }
    if (t.type === 'name') {
      this.pos++;
      if (this.isOp('(')) {
        this.pos++;
        const args: VimScriptValue[] = [];
        // 제자리 변경 내장 함수(add, sort ...)의 결과를 되돌려 쓸 첫 인자 변수 이름
        let firstArgVar: string | null = null;
        if (!this.isOp(')')) {
          const startPos = this.pos;
          args.push(this.ternary());
          const consumed = this.tokens.slice(startPos, this.pos);
          if (consumed.length === 1 && consumed[0].type === 'name') firstArgVar = String(consumed[0].value);
          while (this.isOp(',')) {
            this.pos++;
            args.push(this.ternary());
          }
        }
        this.expectOp(')');
        return this.call(t.value, args, firstArgVar);
      }
      return readVariable(this.ctx, t.value);
    }
    throw this.invalid();
  }

  private call(name: string, args: VimScriptValue[], firstArgVar: string | null): VimScriptValue {
    let varVal: VimScriptValue | undefined;
    try {
      varVal = readVariable(this.ctx, name);
    } catch {}
    if (varVal && isFuncref(varVal)) {
      return invokeFuncref(this.ctx, varVal, args);
    }
    if (/^[A-Z]/.test(name) || name.startsWith('g:') || name.startsWith('s:')) {
      return this.ctx.callUserFunction(this.ctx, name.replace(/^g:/, ''), args);
    }
    const builtin = BUILTINS[name];
    if (!builtin) throw new VimScriptError(msg('E117: 알 수 없는 함수입니다: {name}', { name }));
    if (args.length < builtin.min) throw new VimScriptError(msg('E119: 함수의 인자가 부족합니다: {name}', { name }));
    if (args.length > builtin.max) throw new VimScriptError(msg('E118: 함수의 인자가 너무 많습니다: {name}', { name }));
    const result = builtin.fn(this.ctx, args);
    if (builtin.mutates) {
      const { value, updated } = result as MutationResult;
      if (firstArgVar && !firstArgVar.startsWith('a:')) writeVariable(this.ctx, firstArgVar, updated);
      return value;
    }
    return result as VimScriptValue;
  }
}

function slice(value: VimScriptValue, start: VimScriptValue | undefined, end: VimScriptValue | undefined): VimScriptValue {
  if (isDict(value)) throw new VimScriptError(msg('E719: 딕셔너리에는 [:] 슬라이스를 쓸 수 없습니다'));
  const seq = isList(value) ? value : toVimString(value);
  const len = seq.length;
  const norm = (v: VimScriptValue | undefined, fallback: number) => {
    if (v === undefined) return fallback;
    const n = toNumber(v);
    return n < 0 ? len + n : n;
  };
  const s = Math.max(0, norm(start, 0));
  const e = Math.min(len - 1, norm(end, len - 1)); // Vim 슬라이스는 끝 인덱스를 포함
  if (isList(seq)) return e < s ? [] : seq.slice(s, e + 1);
  return e < s ? '' : seq.slice(s, e + 1);
}

// ---------------------------------------------------------------------------
// 내장 함수
// ---------------------------------------------------------------------------

interface MutationResult {
  value: VimScriptValue;
  updated: VimScriptValue;
}

interface Builtin {
  min: number;
  max: number;
  /** 첫 인자를 제자리에서 바꾸는 함수 (add, sort ...): { value, updated } 를 반환 */
  mutates?: boolean;
  fn: (ctx: EvalContext, args: VimScriptValue[]) => VimScriptValue | MutationResult;
}

function asList(value: VimScriptValue, fn: string): VimScriptValue[] {
  if (!isList(value)) throw new VimScriptError(msg('E714: {fn}() 의 인자는 리스트여야 합니다', { fn }));
  return value;
}

function asDict(value: VimScriptValue, fn: string): VimScriptDict {
  if (!isDict(value)) throw new VimScriptError(msg('E715: {fn}() 의 인자는 딕셔너리여야 합니다', { fn }));
  return value;
}

/** line('.'), getline('$') 등 줄 지정 인자를 0-based 줄 번호로 변환합니다. (범위 밖이면 -1) */
function resolveLineArg(state: VimEditorState, arg: VimScriptValue): number {
  if (arg === '.') return state.cursor.line;
  if (arg === '$') return state.lines.length - 1;
  const n = toNumber(arg);
  return n >= 1 && n <= state.lines.length ? n - 1 : -1;
}

/** Funcref 또는 람다를 호출합니다 */
export function invokeFuncref(
  ctx: EvalContext,
  funcref: VimScriptFuncref,
  passedArgs: VimScriptValue[]
): VimScriptValue {
  const allArgs = [...(funcref.args ?? []), ...passedArgs];
  if (funcref.lambda) {
    const { params, bodyExpr, closureVars, closureArgs } = funcref.lambda;
    const lambdaLocals: Record<string, VimScriptValue> = {
      ...(closureVars ?? {}),
      ...(closureArgs ?? {}),
    };
    const lambdaArgs: Record<string, VimScriptValue> = {
      ...(closureArgs ?? {}),
    };

    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (p === '...') {
        const extra = allArgs.slice(i);
        lambdaArgs['0'] = extra.length;
        lambdaArgs['000'] = extra;
        extra.forEach((v, idx) => (lambdaArgs[String(idx + 1)] = v));
        break;
      }
      const val = allArgs[i] ?? 0;
      lambdaLocals[p] = val;
      lambdaArgs[p] = val;
    }
    if (funcref.dict) {
      lambdaLocals['self'] = funcref.dict;
    }

    const lambdaCtx: EvalContext = {
      state: ctx.state,
      locals: lambdaLocals,
      args: lambdaArgs,
      vvars: ctx.vvars,
      submatches: ctx.submatches,
      callUserFunction: ctx.callUserFunction,
    };

    const result = evaluateVimScript(bodyExpr, lambdaCtx);
    ctx.state = lambdaCtx.state;
    return result;
  }

  if (funcref.name) {
    const name = funcref.name;
    if (/^[A-Z]/.test(name) || name.startsWith('g:') || name.startsWith('s:')) {
      const subCtx = funcref.dict ? { ...ctx, locals: { ...(ctx.locals ?? {}), self: funcref.dict } } : ctx;
      return subCtx.callUserFunction(subCtx, name.replace(/^g:/, ''), allArgs);
    }
    const builtin = BUILTINS[name];
    if (builtin) {
      if (allArgs.length < builtin.min) throw new VimScriptError(msg('E119: 함수의 인자가 부족합니다: {name}', { name }));
      if (allArgs.length > builtin.max) throw new VimScriptError(msg('E118: 함수의 인자가 너무 많습니다: {name}', { name }));
      const res = builtin.fn(ctx, allArgs);
      if (builtin.mutates) {
        return (res as MutationResult).value;
      }
      return res as VimScriptValue;
    }
    throw new VimScriptError(msg('E117: 알 수 없는 함수입니다: {name}', { name }));
  }

  throw new VimScriptError(msg('E129: 잘못된 funcref 호출입니다'));
}

/** map() / filter() 의 표현식을 평가합니다. (람다/funcref 또는 v:val, v:key 문자열) */
function evalWithItem(ctx: EvalContext, expr: VimScriptValue, val: VimScriptValue, key: VimScriptValue): VimScriptValue {
  if (isFuncref(expr)) {
    return invokeFuncref(ctx, expr, [key, val]);
  }
  const inner: EvalContext = { ...ctx, vvars: { ...(ctx.vvars ?? {}), val, key } };
  const result = evaluateVimScript(toVimString(expr), inner);
  ctx.state = inner.state;
  return result;
}

/** substitute() 의 치환 문자열: & / \0 (전체), \1~\9 (그룹), \n, \\, \u \U \l \L \e \E (대소문자) */
function expandReplacement(rep: string, groups: string[]): string {
  let out = '';
  let caseMode: 'u' | 'l' | null = null;
  let oneShot: 'u' | 'l' | null = null;
  const emit = (text: string) => {
    for (const ch of text) {
      let c = caseMode === 'u' ? ch.toUpperCase() : caseMode === 'l' ? ch.toLowerCase() : ch;
      if (oneShot) {
        c = oneShot === 'u' ? c.toUpperCase() : c.toLowerCase();
        oneShot = null;
      }
      out += c;
    }
  };
  for (let i = 0; i < rep.length; i++) {
    const ch = rep[i];
    if (ch === '&') {
      emit(groups[0] ?? '');
    } else if (ch === '\\' && i + 1 < rep.length) {
      const next = rep[++i];
      if (/[0-9]/.test(next)) emit(groups[Number(next)] ?? '');
      else if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === 'u' || next === 'l') oneShot = next;
      else if (next === 'U' || next === 'L') caseMode = next === 'U' ? 'u' : 'l';
      else if (next === 'e' || next === 'E') caseMode = null;
      else emit(next);
    } else {
      emit(ch);
    }
  }
  return out;
}

/** printf() 서식: %[-0][폭][.정밀도](d s x X o c %) */
function formatPrintf(fmt: string, args: VimScriptValue[]): string {
  let argIdx = 0;
  const next = (): VimScriptValue => {
    if (argIdx >= args.length) throw new VimScriptError(msg('E766: printf() 의 인자가 부족합니다: {fmt}', { fmt }));
    return args[argIdx++];
  };
  const out = fmt.replace(/%([-0]*)(\d*)(?:\.(\d+))?([dsxXocS%])/g, (_m, flags: string, width: string, prec: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    let body: string;
    if (conv === 'd') body = String(toNumber(next()));
    else if (conv === 'x' || conv === 'X') {
      body = toNumber(next()).toString(16);
      if (conv === 'X') body = body.toUpperCase();
    } else if (conv === 'o') body = toNumber(next()).toString(8);
    else if (conv === 'c') body = String.fromCharCode(toNumber(next()));
    else {
      const v = next();
      body = typeof v === 'string' ? v : formatValue(v);
      if (prec !== undefined) body = body.slice(0, Number(prec));
    }
    const w = width ? Number(width) : 0;
    if (body.length >= w) return body;
    if (flags.includes('-')) return body.padEnd(w);
    if (flags.includes('0') && conv !== 's' && conv !== 'S') {
      const neg = body.startsWith('-');
      return (neg ? '-' : '') + body.slice(neg ? 1 : 0).padStart(w - (neg ? 1 : 0), '0');
    }
    return body.padStart(w);
  });
  if (argIdx < args.length) throw new VimScriptError(msg('E767: printf() 의 인자가 너무 많습니다: {fmt}', { fmt }));
  return out;
}

function compareForSort(ctx: EvalContext, how: VimScriptValue | undefined) {
  if (how && isFuncref(how)) {
    return (a: VimScriptValue, b: VimScriptValue): number => {
      const res = invokeFuncref(ctx, how, [a, b]);
      return toNumber(res);
    };
  }
  const mode = how === undefined ? '' : typeof how === 'number' ? (how ? 'i' : '') : how;
  return (a: VimScriptValue, b: VimScriptValue): number => {
    if (mode === 'n' || mode === 'N') return toNumber(a) - toNumber(b);
    const sa = typeof a === 'string' ? a : formatValue(a);
    const sb = typeof b === 'string' ? b : formatValue(b);
    const x = mode === 'i' ? sa.toLowerCase() : sa;
    const y = mode === 'i' ? sb.toLowerCase() : sb;
    return x < y ? -1 : x > y ? 1 : 0;
  };
}

const BUILTINS: Record<string, Builtin> = {
  // ---- 버퍼·커서 ----
  line: { min: 1, max: 1, fn: (ctx, [a]) => resolveLineArg(ctx.state, a) + 1 },
  col: {
    min: 1,
    max: 1,
    fn: (ctx, [a]) =>
      a === '.' ? ctx.state.cursor.col + 1 : a === '$' ? (ctx.state.lines[ctx.state.cursor.line] ?? '').length + 1 : 0,
  },
  getline: {
    min: 1,
    max: 2,
    fn: (ctx, [a, b]) => {
      const start = resolveLineArg(ctx.state, a);
      if (b === undefined) return start >= 0 ? ctx.state.lines[start] ?? '' : '';
      const end = resolveLineArg(ctx.state, b);
      return start < 0 || end < start ? [] : ctx.state.lines.slice(start, end + 1);
    },
  },
  setline: {
    min: 2,
    max: 2,
    fn: (ctx, [a, text]) => {
      const l = resolveLineArg(ctx.state, a);
      // 마지막 줄 바로 다음 줄 번호는 줄 추가로 처리 (Vim 과 동일)
      const at = l >= 0 ? l : toNumber(a) === ctx.state.lines.length + 1 ? ctx.state.lines.length : -1;
      if (at < 0) return 1;
      const newLines = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const lines = [...ctx.state.lines];
      newLines.forEach((t, i) => (lines[at + i] = t));
      ctx.state = { ...ctx.state, lines };
      return 0;
    },
  },
  append: {
    min: 2,
    max: 2,
    fn: (ctx, [a, text]) => {
      const n = a === '.' ? ctx.state.cursor.line + 1 : a === '$' ? ctx.state.lines.length : toNumber(a);
      if (n < 0 || n > ctx.state.lines.length) return 1;
      const newLines = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const lines = [...ctx.state.lines.slice(0, n), ...newLines, ...ctx.state.lines.slice(n)];
      ctx.state = { ...ctx.state, lines };
      return 0;
    },
  },

  // ---- :s 의 \= 치환식 ----
  submatch: {
    min: 1,
    max: 1,
    fn: (ctx, [n]) => {
      if (!ctx.submatches) throw new VimScriptError(msg('E935: submatch() 는 :s 의 \\= 치환식 안에서만 쓸 수 있습니다'));
      return ctx.submatches[toNumber(n)] ?? '';
    },
  },

  // ---- 문자열 ----
  strlen: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).length },
  toupper: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toUpperCase() },
  tolower: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toLowerCase() },
  trim: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).trim() },
  str2nr: { min: 1, max: 1, fn: (_c, [s]) => toNumber(toVimString(s)) },
  string: { min: 1, max: 1, fn: (_c, [v]) => formatValue(v) },
  stridx: {
    min: 2,
    max: 3,
    fn: (_c, [s, sub, start]) => toVimString(s).indexOf(toVimString(sub), start === undefined ? 0 : toNumber(start)),
  },
  escape: {
    min: 2,
    max: 2,
    fn: (_c, [s, chars]) => {
      const set = toVimString(chars);
      return [...toVimString(s)].map((c) => (set.includes(c) || c === '\\' ? `\\${c}` : c)).join('');
    },
  },
  repeat: {
    min: 2,
    max: 2,
    fn: (_c, [v, n]) => {
      const times = Math.max(0, toNumber(n));
      if (isList(v)) return Array.from({ length: times }, () => v).flat();
      return toVimString(v).repeat(times);
    },
  },
  substitute: {
    min: 4,
    max: 4,
    fn: (ctx, [s, pat, rep, flags]) => {
      const global = toVimString(flags).includes('g');
      const re = compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase, global ? 'g' : '');
      const template = toVimString(rep);
      return toVimString(s).replace(re, (...m: unknown[]) => {
        const groups = m.slice(0, -2).filter((g) => typeof g === 'string' || g === undefined).map((g) => (g as string) ?? '');
        return expandReplacement(template, groups);
      });
    },
  },
  matchstr: {
    min: 2,
    max: 2,
    fn: (ctx, [s, pat]) => compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase).exec(toVimString(s))?.[0] ?? '',
  },
  match: {
    min: 2,
    max: 2,
    fn: (ctx, [s, pat]) => {
      if (isList(s)) {
        const re = compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
        return s.findIndex((item) => re.test(toVimString(item)));
      }
      return toVimString(s).search(compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase));
    },
  },
  split: {
    min: 1,
    max: 3,
    fn: (ctx, [s, pat, keepEmpty]) => {
      const text = toVimString(s);
      const re = pat === undefined || toVimString(pat) === ''
        ? /\s+/
        : compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
      const parts = text.split(re);
      if (keepEmpty !== undefined && isTruthy(keepEmpty)) return parts;
      // keepempty 가 아니면 맨 앞·맨 뒤의 빈 항목을 버림 (Vim 동작)
      while (parts.length > 0 && parts[0] === '') parts.shift();
      while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      return parts;
    },
  },
  printf: { min: 1, max: 20, fn: (_c, [fmt, ...rest]) => formatPrintf(toVimString(fmt), rest) },

  // ---- 공통 ----
  len: {
    min: 1,
    max: 1,
    fn: (_c, [v]) => (isList(v) ? v.length : isDict(v) ? Object.keys(v.items).length : toVimString(v).length),
  },
  empty: {
    min: 1,
    max: 1,
    fn: (_c, [v]) => (isFuncref(v) ? false : isList(v) ? v.length === 0 : isDict(v) ? Object.keys(v.items).length === 0 : typeof v === 'number' ? v === 0 : v === '') ? 1 : 0,
  },
  function: {
    min: 1,
    max: 3,
    fn: (_ctx, [target, args, dict]) => {
      const argList = args !== undefined ? asList(args, 'function') : undefined;
      const d = dict !== undefined ? asDict(dict, 'function') : undefined;
      return makeFuncref(target as string | VimScriptFuncref, argList, d);
    },
  },
  funcref: {
    min: 1,
    max: 3,
    fn: (_ctx, [target, args, dict]) => {
      const argList = args !== undefined ? asList(args, 'funcref') : undefined;
      const d = dict !== undefined ? asDict(dict, 'funcref') : undefined;
      return makeFuncref(target as string | VimScriptFuncref, argList, d);
    },
  },
  call: {
    min: 2,
    max: 3,
    fn: (ctx, [func, argsList, dict]) => {
      if (!isList(argsList)) throw new VimScriptError(msg('E714: call() 에는 인자 리스트가 필요합니다'));
      const d = dict !== undefined ? asDict(dict, 'call') : undefined;
      if (isFuncref(func)) {
        return invokeFuncref(ctx, d ? { ...func, dict: d } : func, argsList);
      }
      if (typeof func === 'string') {
        const fn = makeFuncref(func, undefined, d);
        return invokeFuncref(ctx, fn, argsList);
      }
      throw new VimScriptError(msg('E129: 함수 이름 또는 funcref 가 필요합니다'));
    },
  },
  type: { min: 1, max: 1, fn: (_c, [v]) => typeCode(v) },
  copy: { min: 1, max: 1, fn: (_c, [v]) => v },
  deepcopy: { min: 1, max: 1, fn: (_c, [v]) => v },
  abs: { min: 1, max: 1, fn: (_c, [n]) => Math.abs(toNumber(n)) },
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
  get: {
    min: 2,
    max: 3,
    fn: (_c, [container, key, def]) => {
      if (isList(container)) {
        const n = toNumber(key);
        const idx = n < 0 ? container.length + n : n;
        return idx >= 0 && idx < container.length ? container[idx] : def ?? 0;
      }
      const k = toVimString(key);
      const dict = asDict(container, 'get');
      return k in dict.items ? dict.items[k] : def ?? 0;
    },
  },
  count: {
    min: 2,
    max: 3,
    fn: (_c, [container, needle, ic]) => {
      const items = isDict(container) ? Object.values(container.items) : asList(container, 'count');
      return items.filter((v) => typeCode(v) === typeCode(needle) && valuesEqual(v, needle, !!ic && isTruthy(ic))).length;
    },
  },

  // ---- 리스트 ----
  range: {
    min: 1,
    max: 3,
    fn: (_c, [a, b, c]) => {
      const start = b === undefined ? 0 : toNumber(a);
      const end = b === undefined ? toNumber(a) - 1 : toNumber(b);
      const step = c === undefined ? 1 : toNumber(c);
      if (step === 0) throw new VimScriptError(msg('E726: range() 의 간격은 0 일 수 없습니다'));
      const out: number[] = [];
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
        out.push(i);
        if (out.length > 100000) break;
      }
      return out;
    },
  },
  join: {
    min: 1,
    max: 2,
    fn: (_c, [l, sep]) => asList(l, 'join').map((v) => (typeof v === 'string' ? v : formatValue(v))).join(sep === undefined ? ' ' : toVimString(sep)),
  },
  index: {
    min: 2,
    max: 2,
    fn: (_c, [l, needle]) => asList(l, 'index').findIndex((v) => typeCode(v) === typeCode(needle) && valuesEqual(v, needle, false)),
  },
  max: {
    min: 1,
    max: 1,
    fn: (_c, [l]) => {
      const items = isDict(l) ? Object.values(l.items) : asList(l, 'max');
      return items.length === 0 ? 0 : Math.max(...items.map(toNumber));
    },
  },
  min: {
    min: 1,
    max: 1,
    fn: (_c, [l]) => {
      const items = isDict(l) ? Object.values(l.items) : asList(l, 'min');
      return items.length === 0 ? 0 : Math.min(...items.map(toNumber));
    },
  },
  add: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (_c, [l, item]) => {
      const updated = [...asList(l, 'add'), item];
      return { value: updated, updated };
    },
  },
  insert: {
    min: 2,
    max: 3,
    mutates: true,
    fn: (_c, [l, item, at]) => {
      const list = asList(l, 'insert');
      const n = at === undefined ? 0 : toNumber(at);
      const idx = n < 0 ? list.length + n : n;
      if (idx < 0 || idx > list.length) throw indexError(n);
      const updated = [...list.slice(0, idx), item, ...list.slice(idx)];
      return { value: updated, updated };
    },
  },
  extend: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (_c, [a, b]) => {
      const updated = isDict(a) ? makeDict({ ...a.items, ...asDict(b, 'extend').items }) : [...asList(a, 'extend'), ...asList(b, 'extend')];
      return { value: updated, updated };
    },
  },
  remove: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (_c, [container, key]) => {
      const removed = getIn(container, isDict(container) ? toVimString(key) : toNumber(key));
      return { value: removed, updated: removeIn(container, [isDict(container) ? toVimString(key) : toNumber(key)]) };
    },
  },
  reverse: {
    min: 1,
    max: 1,
    mutates: true,
    fn: (_c, [l]) => {
      const updated = [...asList(l, 'reverse')].reverse();
      return { value: updated, updated };
    },
  },
  sort: {
    min: 1,
    max: 2,
    mutates: true,
    fn: (ctx, [l, how]) => {
      const updated = [...asList(l, 'sort')].sort(compareForSort(ctx, how));
      return { value: updated, updated };
    },
  },
  uniq: {
    min: 1,
    max: 1,
    mutates: true,
    fn: (_c, [l]) => {
      // Vim 의 uniq() 는 연속으로 반복되는 항목만 하나로 줄입니다
      const updated = asList(l, 'uniq').filter((v, i, arr) => i === 0 || !(typeCode(v) === typeCode(arr[i - 1]) && valuesEqual(v, arr[i - 1], false)));
      return { value: updated, updated };
    },
  },
  map: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (ctx, [container, expr]) => {
      const updated = isDict(container)
        ? makeDict(Object.fromEntries(Object.entries(container.items).map(([k, v]) => [k, evalWithItem(ctx, expr, v, k)])))
        : asList(container, 'map').map((v, i) => evalWithItem(ctx, expr, v, i));
      return { value: updated, updated };
    },
  },
  filter: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (ctx, [container, expr]) => {
      const updated = isDict(container)
        ? makeDict(Object.fromEntries(Object.entries(container.items).filter(([k, v]) => isTruthy(evalWithItem(ctx, expr, v, k)))))
        : asList(container, 'filter').filter((v, i) => isTruthy(evalWithItem(ctx, expr, v, i)));
      return { value: updated, updated };
    },
  },

  // ---- 딕셔너리 ----
  keys: { min: 1, max: 1, fn: (_c, [d]) => Object.keys(asDict(d, 'keys').items) },
  values: { min: 1, max: 1, fn: (_c, [d]) => Object.values(asDict(d, 'values').items) },
  items: { min: 1, max: 1, fn: (_c, [d]) => Object.entries(asDict(d, 'items').items).map(([k, v]) => [k, v]) },
  has_key: { min: 2, max: 2, fn: (_c, [d, k]) => (toVimString(k) in asDict(d, 'has_key').items ? 1 : 0) },
};

/** 표현식 문자열을 평가합니다. 실패하면 VimScriptError를 던집니다. ctx.state 는 setline 등으로 갱신될 수 있습니다. */
export function evaluateVimScript(source: string, ctx: EvalContext): VimScriptValue {
  const trimmed = source.trim();
  if (trimmed.length === 0) throw new VimScriptError(msg('E15: 표현식이 비어 있습니다'));
  return new Evaluator(tokenize(trimmed), trimmed, ctx).evaluateAll();
}

/** :echo 처럼 공백으로 구분된 여러 표현식을 평가합니다. ("echo 'a' 1+2" → ['a', 3]) */
export function evaluateVimScriptList(source: string, ctx: EvalContext): VimScriptValue[] {
  const trimmed = source.trim();
  if (trimmed.length === 0) return [];
  return new Evaluator(tokenize(trimmed), trimmed, ctx).evaluateSequence();
}
