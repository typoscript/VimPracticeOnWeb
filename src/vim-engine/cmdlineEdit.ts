import { VimEditorState } from './types';
import { isKeywordChar } from './wordMotion';
import { lookupDigraph } from './digraphs';
import { getRegisterContent } from './registers';
import { extractFileTargetAtCursor } from './gotoFileEngine';

/**
 * 현재 커맨드라인(:, =, /, ?) 내의 커서 열 인덱스를 반환합니다 (0 ~ commandBuffer.length).
 */
export function getCmdlineCursorCol(state: VimEditorState): number {
  const len = (state.commandBuffer ?? '').length;
  if (state.commandCursorCol === undefined) return len;
  return Math.max(0, Math.min(len, state.commandCursorCol));
}

/**
 * 커맨드라인 현재 커서 위치에 텍스트를 삽입하고 커서를 전진시킵니다.
 */
export function insertTextIntoCmdline(state: VimEditorState, text: string): VimEditorState {
  const buf = state.commandBuffer ?? '';
  const col = getCmdlineCursorCol(state);
  const nextBuf = buf.slice(0, col) + text + buf.slice(col);
  return {
    ...state,
    commandBuffer: nextBuf,
    commandCursorCol: col + text.length,
  };
}

/**
 * 커맨드라인 커서 앞 1글자를 삭제합니다 (커서가 0열이면 상태 유지).
 */
export function deleteCmdlineCharBackward(state: VimEditorState): VimEditorState {
  const buf = state.commandBuffer ?? '';
  const col = getCmdlineCursorCol(state);
  if (col <= 0) {
    return { ...state, commandCursorCol: 0 };
  }
  return {
    ...state,
    commandBuffer: buf.slice(0, col - 1) + buf.slice(col),
    commandCursorCol: col - 1,
  };
}

/**
 * 커맨드라인(:, =, /, ?) 내 Ctrl-k 다이그래프 대기 및 조합 입력을 처리합니다.
 * 해당 없으면 null을 반환합니다.
 */
export function handleCmdlineDigraphStep(
  state: VimEditorState,
  key: string
): VimEditorState | null {
  if (state.digraphPending !== undefined && state.digraphPending !== null) {
    if (
      key === 'Escape' ||
      key === 'Ctrl-c' ||
      key === 'Ctrl+c' ||
      key === 'ctrl-c' ||
      key === '<C-c>' ||
      key === 'Backspace' ||
      key === 'Ctrl-h' ||
      key === 'Ctrl+h'
    ) {
      return { ...state, digraphPending: undefined };
    }
    if (state.digraphPending === '') {
      if (key.length === 1) {
        return { ...state, digraphPending: key };
      }
      return { ...state, digraphPending: undefined };
    }
    const c1 = state.digraphPending;
    if (key.length === 1) {
      const { char } = lookupDigraph(c1, key, state.userDigraphs);
      return insertTextIntoCmdline({ ...state, digraphPending: undefined }, char);
    }
    return { ...state, digraphPending: undefined };
  }

  if (key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ctrl-k' || key === '<C-k>') {
    return {
      ...state,
      digraphPending: '',
    };
  }

  return null;
}

/**
 * 커맨드라인(:, =, /, ?) 공통 커서 이동 및 단어/줄 삭제 단축키를 처리합니다.
 * 해당 없으면 null을 반환합니다.
 */
export function handleCmdlineCommonEditKey(
  state: VimEditorState,
  key: string
): VimEditorState | null {
  const buf = state.commandBuffer ?? '';
  const col = getCmdlineCursorCol(state);

  if (key === 'ArrowLeft') {
    return { ...state, commandCursorCol: Math.max(0, col - 1) };
  }
  if (key === 'ArrowRight') {
    return { ...state, commandCursorCol: Math.min(buf.length, col + 1) };
  }
  if (
    key === 'Ctrl-b' ||
    key === 'Ctrl+b' ||
    key === 'ctrl-b' ||
    key === '<C-b>' ||
    key === 'Home'
  ) {
    return { ...state, commandCursorCol: 0 };
  }
  if (
    key === 'Ctrl-e' ||
    key === 'Ctrl+e' ||
    key === 'ctrl-e' ||
    key === '<C-e>' ||
    key === 'End'
  ) {
    return { ...state, commandCursorCol: buf.length };
  }
  if (key === 'Delete') {
    if (col >= buf.length) return state;
    return {
      ...state,
      commandBuffer: buf.slice(0, col) + buf.slice(col + 1),
      commandCursorCol: col,
    };
  }
  if (
    key === 'Ctrl-u' ||
    key === 'Ctrl+u' ||
    key === 'ctrl-u' ||
    key === '<C-u>'
  ) {
    return {
      ...state,
      commandBuffer: buf.slice(col),
      commandCursorCol: 0,
    };
  }
  if (
    key === 'Ctrl-w' ||
    key === 'Ctrl+w' ||
    key === 'ctrl-w' ||
    key === '<C-w>'
  ) {
    if (col <= 0) return state;
    let start = col;
    while (start > 0 && /\s/.test(buf[start - 1])) {
      start--;
    }
    if (start > 0) {
      const isWordChar = /\w/.test(buf[start - 1]);
      while (
        start > 0 &&
        (isWordChar
          ? /\w/.test(buf[start - 1])
          : !/\w/.test(buf[start - 1]) && !/\s/.test(buf[start - 1]))
      ) {
        start--;
      }
    }
    return {
      ...state,
      commandBuffer: buf.slice(0, start) + buf.slice(col),
      commandCursorCol: start,
    };
  }

  return null;
}

export function isBackspaceKey(key: string): boolean {
  return (
    key === 'Backspace' ||
    key === 'Ctrl-h' ||
    key === 'Ctrl+h' ||
    key === 'ctrl-h' ||
    key === '<C-h>'
  );
}

export function isCmdlineCancelKey(key: string): boolean {
  return (
    key === 'Escape' ||
    key === 'Ctrl-c' ||
    key === 'Ctrl+c' ||
    key === 'ctrl-c' ||
    key === '<C-c>'
  );
}

/**
 * 커서 위치(또는 오른쪽 첫 비공백 위치)에서 커맨드라인 <C-r><C-w> 용 단어(<cword>)를 추출합니다.
 */
export function extractCwordAtCursor(line: string, col: number): string {
  if (!line) return '';
  let idx = Math.max(0, Math.min(col, line.length - 1));
  while (idx < line.length && /\s/.test(line[idx])) {
    idx++;
  }
  if (idx >= line.length) return '';

  const isIdent = isKeywordChar(line[idx]);
  const isSameKind = (c: string) => !/\s/.test(c) && isKeywordChar(c) === isIdent;
  let start = idx;
  while (start > 0 && isSameKind(line[start - 1])) start--;
  let end = idx;
  while (end + 1 < line.length && isSameKind(line[end + 1])) end++;
  return line.slice(start, end + 1);
}

/**
 * 커서 위치(또는 오른쪽 첫 비공백 위치)에서 커맨드라인 <C-r><C-a> 용 WORD(<cWORD>)를 추출합니다.
 */
export function extractCWORDAtCursor(line: string, col: number): string {
  if (!line) return '';
  let idx = Math.max(0, Math.min(col, line.length - 1));
  while (idx < line.length && /\s/.test(line[idx])) {
    idx++;
  }
  if (idx >= line.length) return '';

  let start = idx;
  while (start > 0 && !/\s/.test(line[start - 1])) start--;
  let end = idx;
  while (end + 1 < line.length && !/\s/.test(line[end + 1])) end++;
  return line.slice(start, end + 1);
}

/**
 * 커서 위치(또는 오른쪽 첫 비공백 위치)에서 커맨드라인 <C-r><C-f> 용 파일명(<cfile>)을 추출합니다.
 */
export function extractCfileAtCursor(line: string, col: number): string {
  if (!line) return '';
  let target = extractFileTargetAtCursor(line, col, false);
  if (!target && col < line.length && /\s/.test(line[col])) {
    let idx = col;
    while (idx < line.length && /\s/.test(line[idx])) idx++;
    if (idx < line.length) {
      target = extractFileTargetAtCursor(line, idx, false);
    }
  }
  return target?.filename ?? '';
}

/**
 * 커맨드라인(:, /, ?) 공통 Ctrl-r 대기 및 레지스터·컨텍스트(<C-w>/<C-a>/<C-l>/<C-f>/=) 삽입을 처리합니다.
 * 해당 없으면 null을 반환합니다.
 */
export function handleCmdlineCtrlRStep(
  state: VimEditorState,
  key: string,
  promptType: ':' | '/' | '?'
): VimEditorState | null {
  if (state.insertRegisterPending) {
    if (isCmdlineCancelKey(key)) {
      return { ...state, insertRegisterPending: undefined };
    }

    if (key === '=') {
      return {
        ...state,
        mode: 'COMMAND',
        commandType: '=',
        expressionReturnContext: {
          mode: promptType === ':' ? 'COMMAND' : 'SEARCH',
          commandBuffer: state.commandBuffer,
          commandType: promptType,
          commandCursorCol: state.commandCursorCol,
        },
        commandBuffer: '',
        commandCursorCol: undefined,
        insertRegisterPending: undefined,
      };
    }

    const curLine = state.lines[state.cursor.line] ?? '';
    const curCol = state.cursor.col;

    if (key === 'Ctrl-w' || key === 'Ctrl+w' || key === 'ctrl-w' || key === '<C-w>') {
      const text = extractCwordAtCursor(curLine, curCol);
      return insertTextIntoCmdline({ ...state, insertRegisterPending: undefined }, text);
    }
    if (key === 'Ctrl-a' || key === 'Ctrl+a' || key === 'ctrl-a' || key === '<C-a>') {
      const text = extractCWORDAtCursor(curLine, curCol);
      return insertTextIntoCmdline({ ...state, insertRegisterPending: undefined }, text);
    }
    if (key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'ctrl-l' || key === '<C-l>') {
      return insertTextIntoCmdline({ ...state, insertRegisterPending: undefined }, curLine);
    }
    if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f' || key === '<C-f>') {
      const text = extractCfileAtCursor(curLine, curCol);
      return insertTextIntoCmdline({ ...state, insertRegisterPending: undefined }, text);
    }

    if (key.length === 1) {
      const regClip = getRegisterContent(state, key);
      const textToInsert = regClip?.content ?? '';
      return insertTextIntoCmdline(
        { ...state, insertRegisterPending: undefined },
        textToInsert
      );
    }

    return { ...state, insertRegisterPending: undefined };
  }

  if (key === 'Ctrl-r' || key === 'Ctrl+r' || key === 'ctrl-r' || key === '<C-r>') {
    return {
      ...state,
      insertRegisterPending: true,
    };
  }

  return null;
}
