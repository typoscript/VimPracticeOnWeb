import type { CursorPosition, VimEditorState, VimMode } from './types';

let activeCursorMode: VimMode = 'NORMAL';
let activeVirtualEdit = '';

export function setActiveCursorContext(mode: VimMode, virtualedit?: string): void {
  activeCursorMode = mode;
  activeVirtualEdit = virtualedit ?? '';
}

export function getActiveVirtualEdit(): string {
  return activeVirtualEdit;
}

export function hasVirtualEdit(
  virtualedit: string | undefined,
  target: 'onemore' | 'block' | 'all' | 'insert'
): boolean {
  if (!virtualedit) return false;
  const parts = virtualedit
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.includes('all')) return true;
  return parts.includes(target);
}

/**
 * 줄의 최대 허용 열 인덱스를 반환합니다.
 * NORMAL 모드에서는 마지막 문자(length - 1)를 넘을 수 없으며,
 * INSERT 모드나 virtualedit=onemore 에서는 줄 길이(length)까지 허용합니다.
 * virtualedit=all 또는 VISUAL_BLOCK + virtualedit=block 에서는 줄 끝 너머 가상 열까지 허용합니다.
 */
export function getMaxCol(
  lineText: string | undefined,
  mode: VimMode = activeCursorMode,
  virtualedit: string = activeVirtualEdit
): number {
  const len = lineText ? lineText.length : 0;
  if (
    hasVirtualEdit(virtualedit, 'all') ||
    ((mode === 'VISUAL_BLOCK' || mode === 'SELECT_BLOCK') && hasVirtualEdit(virtualedit, 'block'))
  ) {
    return Math.max(len + 1000, 10000);
  }
  if (len === 0) {
    return 0;
  }
  if (
    mode === 'INSERT' ||
    mode === 'REPLACE' ||
    mode === 'TERMINAL' ||
    // Vim 비주얼 모드('selection' 기본값)는 줄 끝 다음 칸(NUL)에 커서를 둘 수 있습니다 (v$ · vl · 짧은 줄로 내려온 j).
    mode === 'VISUAL' ||
    mode === 'VISUAL_LINE' ||
    mode === 'VISUAL_BLOCK' ||
    mode === 'SELECT' ||
    mode === 'SELECT_LINE' ||
    mode === 'SELECT_BLOCK' ||
    hasVirtualEdit(virtualedit, 'onemore')
  ) {
    return len;
  }
  return Math.max(0, len - 1);
}

/**
 * 줄의 첫 번째 공백이 아닌 문자의 열 인덱스(^)를 반환합니다. 빈 줄은 0 입니다.
 * 공백만 있는 줄은 Vim beginline(BL_WHITE | BL_FIX) 처럼 NUL 에 서지 않고 마지막 공백(길이 - 1)입니다
 * (`^`, 줄 단위 `p`, `'a`, sol 의 `dd`·`G`). 들여쓰기 폭이 필요하면 `search(/\S/)` 를 직접 쓰세요.
 */
export function getFirstNonBlankCol(lineText: string | undefined): number {
  if (!lineText || lineText.length === 0) {
    return 0;
  }
  const match = lineText.search(/\S/);
  return match !== -1 ? match : lineText.length - 1;
}

/**
 * 커서가 유효한 버퍼 범위(줄 수 및 줄의 마지막 문자)를 벗어나지 않도록 클램프합니다.
 */
export function clampCursor(
  lines: string[],
  cursor: CursorPosition,
  mode: VimMode = activeCursorMode,
  virtualedit: string = activeVirtualEdit
): CursorPosition {
  if (lines.length === 0) {
    return { line: 0, col: 0 };
  }

  const line = Math.max(0, Math.min(cursor.line, lines.length - 1));
  const currentLineText = lines[line] ?? '';
  const maxCol = getMaxCol(currentLineText, mode, virtualedit);
  const col = Math.max(0, Math.min(cursor.col, maxCol));

  return { line, col };
}

/**
 * Vim 이 NORMAL 모드에서 고치지 않고 두는 줄 끝 다음 칸(NUL) 커서를 놓습니다 (`:>` 가 공백만 남은 줄의 첫 비공백으로,
 * 블록 `<` 가 줄 끝이 된 블록 왼쪽 열로 보낼 때). `col` 이 줄 길이와 같으면 `cursorPastEnd` 를 켜고, 더 크면 줄 길이로 줄입니다.
 * 다음 키를 처리하기 전에 `settleCursorPastEnd` 가 마지막 글자로 돌립니다 (Vim 은 다음 명령 전에 check_cursor_col).
 */
export function placeCursorMaybePastEnd(state: VimEditorState, cursor: CursorPosition): VimEditorState {
  const lineText = state.lines[cursor.line] ?? '';
  if (lineText.length === 0 || cursor.col < lineText.length) {
    const next = { ...state, cursor: clampCursor(state.lines, cursor, 'NORMAL') };
    delete next.cursorPastEnd;
    return next;
  }
  return { ...state, cursor: { line: cursor.line, col: lineText.length }, cursorPastEnd: true };
}

/** `cursorPastEnd` 표시를 지우고, NORMAL 모드 커서가 줄 끝 다음 칸에 있으면 마지막 글자로 옮깁니다. */
export function settleCursorPastEnd(state: VimEditorState): VimEditorState {
  if (!state.cursorPastEnd) return state;
  const next = { ...state };
  delete next.cursorPastEnd;
  if (next.mode === 'NORMAL') {
    const clamped = clampCursor(next.lines, next.cursor, 'NORMAL');
    if (clamped.col !== next.cursor.col || clamped.line !== next.cursor.line) next.cursor = clamped;
  }
  return next;
}
