import { VimScriptFuncref, VimScriptValue } from './types';
import { msg } from './messages';
import {
  VimScriptError,
  EvalContext,
  isList,
  isDict,
  isFuncref,
  makeDict,
  makeFuncref,
  toNumber,
  toVimString,
  isTruthy,
  formatValue,
  displayValue,
  addValues,
  typeCode,
  valuesEqual,
  compileVimPattern,
  getIn,
  setIn,
  removeIn,
  resolveVariableName,
  readRegister,
  readVariable,
  writeVariable,
  deleteVariable,
} from './vimscriptValues';
import { createBuiltinRegistry, MutationResult } from './vimscriptBuiltins';
import { Token, tokenize } from './vimscriptLexer';

export {
  VimScriptError,
  isList,
  isDict,
  isFuncref,
  makeDict,
  makeFuncref,
  toNumber,
  toVimString,
  isTruthy,
  formatValue,
  displayValue,
  addValues,
  compileVimPattern,
  resolveVariableName,
  readVariable,
  writeVariable,
};
export type { EvalContext };

// ---------------------------------------------------------------------------
// 대입 대상 (lvalue): 변수 / 레지스터 + [인덱스] / .키 경로
// ---------------------------------------------------------------------------

export interface LValue {
  /** 변수 이름(g:x, x) 또는 레지스터(@a) */
  base: string;
  /** 인덱스 경로 (리스트 인덱스는 number, 딕셔너리 키는 string) */
  path: (number | string)[];
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


const { BUILTINS, invokeFuncref: invokeFuncrefImpl } = createBuiltinRegistry((source, ctx) =>
  evaluateVimScript(source, ctx)
);

/** Funcref 또는 람다를 호출합니다 */
export function invokeFuncref(
  ctx: EvalContext,
  funcref: VimScriptFuncref,
  passedArgs: VimScriptValue[]
): VimScriptValue {
  return invokeFuncrefImpl(ctx, funcref, passedArgs);
}

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
