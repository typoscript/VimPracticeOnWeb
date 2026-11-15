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

export function typeCode(v: VimScriptValue): number {
  return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : isList(v) ? 3 : isDict(v) ? 4 : isFuncref(v) ? 2 : 0;
}

/** == 비교 (리스트·딕셔너리는 내용 비교) */
export function valuesEqual(a: VimScriptValue, b: VimScriptValue, ignoreCase: boolean): boolean {
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

export function indexError(index: number): VimScriptError {
  return new VimScriptError(msg('E684: 리스트 인덱스가 범위를 벗어났습니다: {index}', { index }));
}

export function getIn(container: VimScriptValue, key: number | string): VimScriptValue {
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

export function setIn(container: VimScriptValue, path: (number | string)[], value: VimScriptValue): VimScriptValue {
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

export function removeIn(container: VimScriptValue, path: (number | string)[]): VimScriptValue {
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

export function readRegister(state: VimEditorState, reg: string): string {
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

export function deleteVariable(ctx: EvalContext, name: string, force: boolean): void {
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
