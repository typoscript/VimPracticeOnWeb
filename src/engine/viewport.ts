import { VimEditorState, ViewportState } from '../types/vim';
import { moveToFirstNonBlank } from './motions';

export const DEFAULT_VISIBLE_ROWS = 15;

/**
 * 상태에 저장된 뷰포트 정보 또는 기본 뷰포트 정보를 반환합니다.
 */
export function getViewport(state: VimEditorState): ViewportState {
  return state.viewport ?? { topRow: 0, visibleRows: DEFAULT_VISIBLE_ROWS };
}

/**
 * 커서 위치가 뷰포트 밖으로 벗어난 경우 뷰포트의 topRow를 스크롤 조정합니다.
 */
export function adjustViewport(
  viewport: ViewportState,
  cursorLine: number,
  totalLines: number
): ViewportState {
  let { topRow, visibleRows } = viewport;
  if (cursorLine < topRow) {
    topRow = cursorLine;
  } else if (cursorLine >= topRow + visibleRows) {
    topRow = cursorLine - visibleRows + 1;
  }
  const maxTop = Math.max(0, totalLines - 1);
  topRow = Math.max(0, Math.min(topRow, maxTop));
  return { topRow, visibleRows };
}

/**
 * zz: 현재 커서 행이 화면 정중앙에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToCenter(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const midOffset = Math.floor(vp.visibleRows / 2);
  const newTop = Math.max(0, state.cursor.line - midOffset);

  return {
    ...state,
    viewport: {
      ...vp,
      topRow: newTop,
    },
    pendingKeys: undefined,
  };
}

/**
 * zt: 현재 커서 행이 화면 최상단에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToTop(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  return {
    ...state,
    viewport: {
      ...vp,
      topRow: state.cursor.line,
    },
    pendingKeys: undefined,
  };
}

/**
 * zb: 현재 커서 행이 화면 최하단에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToBottom(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const newTop = Math.max(0, state.cursor.line - vp.visibleRows + 1);
  return {
    ...state,
    viewport: {
      ...vp,
      topRow: newTop,
    },
    pendingKeys: undefined,
  };
}

/**
 * H (High): 현재 화면 뷰포트 기준 최상단 행으로 커서를 이동합니다.
 */
export function cursorToHigh(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const targetLine = Math.max(0, Math.min(vp.topRow, state.lines.length - 1));
  const newCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });

  return {
    ...state,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * M (Middle): 현재 화면 뷰포트 기준 중앙 행으로 커서를 이동합니다.
 */
export function cursorToMiddle(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const remainingInDoc = Math.max(1, state.lines.length - vp.topRow);
  const effectiveVisible = Math.min(vp.visibleRows, remainingInDoc);
  const midOffset = Math.floor(effectiveVisible / 2);
  const targetLine = Math.max(0, Math.min(vp.topRow + midOffset, state.lines.length - 1));
  const newCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });

  return {
    ...state,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * L (Low): 현재 화면 뷰포트 기준 최하단 행으로 커서를 이동합니다.
 */
export function cursorToLow(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const targetLine = Math.max(
    0,
    Math.min(vp.topRow + vp.visibleRows - 1, state.lines.length - 1)
  );
  const newCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });

  return {
    ...state,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * Ctrl+d: 화면과 커서를 반 페이지 아래로 스크롤합니다.
 */
export function scrollHalfPageDown(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const half = Math.max(1, Math.floor(vp.visibleRows / 2));
  const total = state.lines.length;

  const targetLine = Math.min(total - 1, state.cursor.line + half);
  const maxTop = Math.max(0, total - 1);
  const newTop = Math.min(maxTop, vp.topRow + half);
  const newCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });

  return {
    ...state,
    cursor: newCursor,
    viewport: {
      ...vp,
      topRow: newTop,
    },
    pendingKeys: undefined,
  };
}

/**
 * Ctrl+u: 화면과 커서를 반 페이지 위로 스크롤합니다.
 */
export function scrollHalfPageUp(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const half = Math.max(1, Math.floor(vp.visibleRows / 2));

  const targetLine = Math.max(0, state.cursor.line - half);
  const newTop = Math.max(0, vp.topRow - half);
  const newCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });

  return {
    ...state,
    cursor: newCursor,
    viewport: {
      ...vp,
      topRow: newTop,
    },
    pendingKeys: undefined,
  };
}
