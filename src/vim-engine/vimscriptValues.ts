import { VimEditorState, VimScriptDict, VimScriptFuncref, VimScriptValue } from './types';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';
import { getEffectiveCwd } from './vfs';

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

export type VarScope = 'g' | 'b' | 'w' | 't' | 's' | 'l' | 'a' | 'v';

/** 이름의 스코프를 판별합니다. 함수 안에서는 접두어 없는 이름이 l:, 밖에서는 g: 입니다. */
export function resolveVariableName(ctx: Pick<EvalContext, 'locals'>, name: string): { scope: VarScope; key: string } {
  const m = name.match(/^([gblwtsav]):(.*)$/);
  if (m) return { scope: m[1] as VarScope, key: m[2] };
  return ctx.locals ? { scope: 'l', key: name } : { scope: 'g', key: name };
}

function getScopeStore(ctx: EvalContext, scope: VarScope): Record<string, VimScriptValue> {
  const s = ctx.state;
  if (scope === 'v') {
    return { true: 1, false: 0, exception: '', throwpoint: '', ...(ctx.vvars ?? {}) };
  }
  if (scope === 'a') return ctx.args ?? {};
  if (scope === 'l') return ctx.locals ?? {};
  if (scope === 'b') return s.bufferVars?.[s.currentBufferId ?? 1] ?? {};
  if (scope === 'w') return s.windowVars?.[s.activePaneIndex ?? 0] ?? {};
  if (scope === 't') return s.tabVars?.[s.currentTabId ?? 1] ?? {};
  if (scope === 's') return s.scriptVars ?? {};
  return s.globalVars ?? {};
}

function updateScopeStore(ctx: EvalContext, scope: VarScope, next: Record<string, VimScriptValue>): void {
  const s = ctx.state;
  if (scope === 'l') {
    if (!ctx.locals) ctx.locals = {};
    for (const k of Object.keys(ctx.locals)) delete ctx.locals[k];
    Object.assign(ctx.locals, next);
  } else if (scope === 'b') {
    const id = s.currentBufferId ?? 1;
    ctx.state = { ...s, bufferVars: { ...(s.bufferVars ?? {}), [id]: next } };
  } else if (scope === 'w') {
    const id = s.activePaneIndex ?? 0;
    ctx.state = { ...s, windowVars: { ...(s.windowVars ?? {}), [id]: next } };
  } else if (scope === 't') {
    const id = s.currentTabId ?? 1;
    ctx.state = { ...s, tabVars: { ...(s.tabVars ?? {}), [id]: next } };
  } else if (scope === 's') {
    ctx.state = { ...s, scriptVars: next };
  } else {
    ctx.state = { ...s, globalVars: next };
  }
}

export function readRegister(state: VimEditorState, reg: string): string {
  const entry = state.registers?.[reg === '"' ? '"' : reg.toLowerCase()];
  if (entry) return Array.isArray(entry.content) ? entry.content.join('') : entry.content;
  if (reg === '"') return state.clipboard?.content ?? '';
  return '';
}

function defaultEnvMap(state: VimEditorState): Record<string, string> {
  return {
    HOME: '/home/user',
    USER: 'vim',
    PWD: getEffectiveCwd(state),
    SHELL: '/bin/sh',
    TERM: 'xterm-256color',
  };
}

export function hasEnvVar(state: VimEditorState, name: string): boolean {
  if (state.envVars && name in state.envVars) return true;
  return name in defaultEnvMap(state);
}

export function readEnvVar(state: VimEditorState, name: string): string {
  if (state.envVars && name in state.envVars) return state.envVars[name];
  return defaultEnvMap(state)[name] ?? '';
}

export function writeEnvVar(state: VimEditorState, name: string, value: string): VimEditorState {
  return { ...state, envVars: { ...(state.envVars ?? {}), [name]: value } };
}

export function deleteEnvVar(state: VimEditorState, name: string): VimEditorState {
  if (!state.envVars || !(name in state.envVars)) return state;
  const next = { ...state.envVars };
  delete next[name];
  return { ...state, envVars: next };
}

export function readVariable(ctx: EvalContext, name: string): VimScriptValue {
  const { scope, key } = resolveVariableName(ctx, name);
  const store = getScopeStore(ctx, scope);
  if (key === '') return makeDict({ ...store });
  if (key in store) return store[key];
  throw new VimScriptError(msg('E121: 정의되지 않은 변수입니다: {name}', { name }));
}

/** 변수에 값을 씁니다. (a: / v: 는 읽기 전용) */
export function writeVariable(ctx: EvalContext, name: string, value: VimScriptValue): void {
  const { scope, key } = resolveVariableName(ctx, name);
  if (scope === 'a' || scope === 'v') throw new VimScriptError(msg('E46: 읽기 전용 변수는 바꿀 수 없습니다: {name}', { name }));
  if (key === '') {
    if (!isDict(value)) throw new VimScriptError(msg('E738: 스코프 딕셔너리에는 딕셔너리만 대입할 수 있습니다: {name}', { name }));
    updateScopeStore(ctx, scope, { ...value.items });
    return;
  }
  if (scope === 'l' && ctx.locals) {
    ctx.locals[key] = value;
    return;
  }
  updateScopeStore(ctx, scope, { ...getScopeStore(ctx, scope), [key]: value });
}

export function deleteVariable(ctx: EvalContext, name: string, force: boolean): void {
  const { scope, key } = resolveVariableName(ctx, name);
  if (scope === 'a' || scope === 'v') throw new VimScriptError(msg('E46: 읽기 전용 변수는 바꿀 수 없습니다: {name}', { name }));
  const store = getScopeStore(ctx, scope);
  if (!key || !(key in store)) {
    if (force) return;
    throw new VimScriptError(msg('E108: 해당 변수가 없습니다: {name}', { name }));
  }
  if (scope === 'l' && ctx.locals) {
    delete ctx.locals[key];
    return;
  }
  const next = { ...store };
  delete next[key];
  updateScopeStore(ctx, scope, next);
}

/** :redir 세션이 활성화된 경우 출력 문자열을 대상 변수 또는 레지스터에 추가합니다. */
export function appendRedirText(state: VimEditorState, text: string): VimEditorState {
  const session = state.redirSession;
  if (!session) return state;
  if (session.target.startsWith('@')) {
    const reg = session.target[1] === '"' ? '"' : session.target[1].toLowerCase();
    const prev = readRegister(state, reg);
    return {
      ...state,
      registers: {
        ...(state.registers ?? {}),
        [reg]: { type: 'char', content: `${prev}\n${text}` },
      },
    };
  }
  const key = session.target.replace(/^g:/, '');
  const prevRaw = state.globalVars?.[key];
  const prev = typeof prevRaw === 'string' ? prevRaw : prevRaw !== undefined ? toVimString(prevRaw) : '';
  return {
    ...state,
    globalVars: {
      ...(state.globalVars ?? {}),
      [key]: `${prev}\n${text}`,
    },
  };
}

/** :redir => g:var / :redir =>> g:var / :redir @a> / :redir END 명령을 처리합니다. */
export function handleRedirCommand(state: VimEditorState, rawArg: string): VimEditorState {
  const arg = rawArg.trim();
  const baseReturn = (next: VimEditorState): VimEditorState => ({
    ...next,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
  });

  if (/^END$/i.test(arg)) {
    return baseReturn({ ...state, redirSession: null });
  }

  const varMatch = arg.match(/^=>(>?)\s*([gblwts]:)?([A-Za-z_][A-Za-z0-9_]*)$/);
  if (varMatch) {
    const append = varMatch[1] === '>';
    const scope = varMatch[2] ?? '';
    const name = varMatch[3];
    const key = scope && scope !== 'g:' ? `${scope}${name}` : name;
    const prevVars = state.globalVars ?? {};
    const nextVars = append ? prevVars : { ...prevVars, [key]: '' };
    return baseReturn({
      ...state,
      globalVars: nextVars,
      redirSession: { target: key, append },
    });
  }

  const regMatch = arg.match(/^@([a-zA-Z"])>(>?)$/);
  if (regMatch) {
    const rawReg = regMatch[1];
    const isUpperAppend = rawReg >= 'A' && rawReg <= 'Z';
    const append = regMatch[2] === '>' || isUpperAppend;
    const reg = rawReg === '"' ? '"' : rawReg.toLowerCase();
    const nextRegs = append
      ? state.registers
      : { ...(state.registers ?? {}), [reg]: { type: 'char' as const, content: '' } };
    return baseReturn({
      ...state,
      registers: nextRegs,
      redirSession: { target: `@${reg}`, append },
    });
  }

  return baseReturn({
    ...state,
    bell: true,
    commandMessage: msg('E475: 잘못된 인수입니다: {arg}', { arg }),
  });
}

function extractTokenAtCursor(line: string, col: number, charRe: RegExp): string {
  if (!line) return '';
  let idx = Math.max(0, Math.min(col, line.length - 1));
  if (!charRe.test(line[idx])) {
    while (idx < line.length && !charRe.test(line[idx])) idx++;
    if (idx >= line.length) return '';
  }
  let start = idx;
  let end = idx;
  while (start > 0 && charRe.test(line[start - 1])) start--;
  while (end + 1 < line.length && charRe.test(line[end + 1])) end++;
  return line.slice(start, end + 1);
}

export function applyPathModifiers(val: string, mods: string, state: VimEditorState): string {
  let out = val;
  for (const m of mods.matchAll(/:([phtre])/g)) {
    if (!out) break;
    const mod = m[1];
    if (mod === 'p') {
      if (!out.startsWith('/')) out = `${getEffectiveCwd(state).replace(/\/$/, '')}/${out.replace(/^\.\//, '')}`;
    } else if (mod === 'h') {
      const idx = out.lastIndexOf('/');
      out = idx > 0 ? out.slice(0, idx) : idx === 0 ? '/' : '.';
    } else if (mod === 't') {
      const idx = out.lastIndexOf('/');
      out = idx >= 0 ? out.slice(idx + 1) : out;
    } else if (mod === 'r') {
      const slash = out.lastIndexOf('/');
      const dot = out.lastIndexOf('.');
      if (dot > slash && dot > 0) out = out.slice(0, dot);
    } else if (mod === 'e') {
      const slash = out.lastIndexOf('/');
      const dot = out.lastIndexOf('.');
      out = dot > slash && dot > 0 ? out.slice(dot + 1) : '';
    }
  }
  return out;
}

/** expand('%' | '#' | '<cword>' | '<cWORD>' | '<cfile>' ...) 및 :p/:h/:t/:r/:e 모디파이어를 평가합니다. */
export function expandScriptExpr(state: VimEditorState, raw: string): string {
  const m = raw.match(/^(%|#|<(?:cword|cWORD|cfile|slnum|sflnum)>)((?::[phtre])*)$/);
  if (!m) return raw.startsWith('$') || raw.startsWith('<') ? '' : raw;
  const [, token, mods] = m;
  let base = '';
  if (token === '%') {
    base = state.primaryFilename && state.primaryFilename !== '[No Name]' ? state.primaryFilename : '';
  } else if (token === '#') {
    const altId = state.alternateBufferId;
    const alt = altId ? state.buffers?.find((b) => b.id === altId)?.name : state.secondaryFilename;
    base = alt && alt !== '[No Name]' ? alt : '';
  } else if (token === '<cword>') {
    base = extractTokenAtCursor(state.lines[state.cursor.line] ?? '', state.cursor.col, /[A-Za-z0-9_]/);
  } else if (token === '<cWORD>') {
    base = extractTokenAtCursor(state.lines[state.cursor.line] ?? '', state.cursor.col, /\S/);
  } else if (token === '<cfile>') {
    base = extractTokenAtCursor(state.lines[state.cursor.line] ?? '', state.cursor.col, /[A-Za-z0-9_./~-]/);
  } else if (token === '<slnum>' || token === '<sflnum>') {
    base = String(state.cursor.line + 1);
  }
  return mods ? applyPathModifiers(base, mods, state) : base;
}
