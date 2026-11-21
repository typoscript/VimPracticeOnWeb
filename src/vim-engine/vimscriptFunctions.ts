import { FunctionDraft, UserFunction, VimEditorState } from './types';
import { msg } from './messages';

export type ExRunner = (state: VimEditorState, command: string) => VimEditorState;

export const FUNC_HEADER = /^fu(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?(!?)(?:\s+(.*))?$/;
export const END_FUNC = /^endf(?:u(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?$/;
export const DEL_FUNC = /^delf(?:u(?:n(?:c(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?(!?)\s+(\S+)$/;

export function finish(state: VimEditorState, commandMessage?: string, bell = false): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage,
    ...(bell ? { bell: true } : {}),
  };
}

export function signature(fn: UserFunction): string {
  const params = [...fn.params, ...(fn.varargs ? ['...'] : [])].join(', ');
  return `function ${fn.name}(${params})${fn.range ? ' range' : ''}${fn.abort ? ' abort' : ''}${fn.dict ? ' dict' : ''}${fn.closure ? ' closure' : ''}`;
}

type Header = Omit<UserFunction, 'body'>;

/** `Name(a, b, ...) range abort` 를 해석합니다. 실패하면 에러 메시지 문자열을 반환합니다. */
export function parseFunctionHeader(rest: string): Header | string {
  const m = rest.match(/^([A-Za-z_:][\w:#]*)\s*\(([^)]*)\)\s*(.*)$/);
  if (!m) return msg('E124: 함수 정의 뒤에 ( 가 필요합니다: {rest}', { rest });

  const name = m[1].replace(/^g:/, '');
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name) && !/^s:\w+$/.test(name)) {
    return msg('E128: 함수 이름은 대문자 또는 "s:" 로 시작해야 합니다: {v}', { v: m[1] });
  }

  const rawParams = m[2].split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  let varargs = false;
  const params: string[] = [];
  for (let i = 0; i < rawParams.length; i++) {
    const p = rawParams[i];
    if (p === '...') {
      if (i !== rawParams.length - 1) return msg('E125: 잘못된 인자입니다: ...');
      varargs = true;
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) {
      return msg('E125: 잘못된 인자입니다: {p}', { p });
    } else if (params.includes(p)) {
      return msg('E853: 중복된 인자 이름입니다: {p}', { p });
    } else {
      params.push(p);
    }
  }

  let range = false;
  let abort = false;
  let dict = false;
  let closure = false;
  for (const word of m[3].split(/\s+/).filter((w) => w.length > 0)) {
    if (word === 'range') range = true;
    else if (word === 'abort') abort = true;
    else if (word === 'dict') dict = true;
    else if (word === 'closure') closure = true;
    else return msg('E488: 불필요한 문자가 있습니다: {word}', { word });
  }

  return {
    name,
    params,
    varargs,
    range,
    abort,
    ...(dict ? { dict: true } : {}),
    ...(closure ? { closure: true } : {}),
  };
}

export function formatFunctionList(state: VimEditorState): string {
  const fns = Object.values(state.userFunctions ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  if (fns.length === 0) return msg('사용자 정의 함수가 없습니다.');
  return fns.map(signature).join('\n');
}

export function formatFunctionBody(fn: UserFunction): string {
  return [
    `   ${signature(fn)}`,
    ...fn.body.map((l, i) => `${String(i + 1).padStart(3)}  ${l}`),
    '   endfunction',
  ].join('\n');
}

/** 함수를 등록합니다. (기존 함수가 있고 overwrite가 아니면 E122) */
export function registerFunction(state: VimEditorState, fn: UserFunction, overwrite: boolean): VimEditorState | string {
  if (state.userFunctions?.[fn.name] && !overwrite) {
    return msg('E122: 함수 {name} 이(가) 이미 있습니다. 덮어쓰려면 ! 를 붙이세요', { name: fn.name });
  }
  return { ...state, userFunctions: { ...(state.userFunctions ?? {}), [fn.name]: fn } };
}

export function draftMessage(draft: FunctionDraft): string {
  return msg('함수 {name} 본문 입력 중 ({bodyCount}줄) · endfunction 으로 끝내기, Esc 취소', { name: draft.name, bodyCount: draft.body.length });
}

/** 커맨드라인 본문 입력 중(functionDraft)에 한 줄을 받습니다. endfunction 이면 함수를 확정합니다. */
export function appendFunctionDraftLine(state: VimEditorState, line: string): VimEditorState {
  const draft = state.functionDraft;
  if (!draft) return state;

  if (END_FUNC.test(line.trim())) {
    const { overwrite, ...fn } = draft;
    const registered = registerFunction({ ...state, functionDraft: undefined }, fn, overwrite);
    if (typeof registered === 'string') return finish({ ...state, functionDraft: undefined }, registered, true);
    return finish(registered, msg('[함수 정의] {v} ({bodyCount}줄)', { v: signature(fn), bodyCount: fn.body.length }));
  }

  const nextDraft: FunctionDraft = { ...draft, body: [...draft.body, line.replace(/^\s*:?/, '')] };
  return {
    ...state,
    mode: 'COMMAND',
    commandType: ':',
    commandBuffer: '',
    functionDraft: nextDraft,
    commandMessage: draftMessage(nextDraft),
  };
}

/** 본문 입력을 취소합니다. (Esc) */
export function cancelFunctionDraft(state: VimEditorState): VimEditorState {
  return finish({ ...state, functionDraft: undefined }, msg('함수 {v} 정의를 취소했습니다.', { v: state.functionDraft?.name ?? '' }));
}

/** .vimrc 소싱처럼 헤더와 본문을 한 번에 받아 함수를 정의합니다. */
export function defineFunctionFromLines(state: VimEditorState, headerLine: string, body: string[]): VimEditorState {
  const m = headerLine.trim().match(FUNC_HEADER);
  const header = m?.[2] ? parseFunctionHeader(m[2].trim()) : msg('E124: 함수 정의가 올바르지 않습니다: {headerLine}', { headerLine });
  if (typeof header === 'string') return finish(state, header, true);
  const registered = registerFunction(state, { ...header, body }, m?.[1] === '!');
  return typeof registered === 'string' ? finish(state, registered, true) : registered;
}

/** 소싱 시 함수 정의 블록의 시작/끝 줄인지 판별합니다. */
export function isFunctionHeaderLine(line: string): boolean {
  const m = line.trim().match(FUNC_HEADER);
  return !!m && !!m[2] && m[2].includes('(');
}

export function isEndFunctionLine(line: string): boolean {
  return END_FUNC.test(line.trim());
}
