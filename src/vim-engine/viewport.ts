import { VimEditorState, ViewportState } from './types';
import { moveToFirstNonBlank } from './motions';
import { clampCursor } from './cursor';
import { getOptions } from './setEngine';

export const DEFAULT_VISIBLE_ROWS = 15;

/**
 * 상태에 저장된 뷰포트 정보 또는 기본 뷰포트 정보를 반환합니다.
 */
export function getViewport(state: VimEditorState): ViewportState {
  return state.viewport ?? { topRow: 0, visibleRows: DEFAULT_VISIBLE_ROWS };
}

/**
 * 상태의 scrolloff 옵션을 읽습니다.
 */
export function getScrolloff(state: VimEditorState): number {
  return Math.max(0, getOptions(state).scrolloff ?? 0);
}

/**
 * 화면 높이를 고려한 유효 scrolloff 값을 계산합니다.
 * scrolloff가 visibleRows / 2 이상이면 커서는 항상 화면 중앙에 머무릅니다.
 */
export function getEffectiveScrolloff(visibleRows: number, scrolloff = 0): number {
  return Math.max(0, Math.min(scrolloff, Math.floor(Math.max(0, visibleRows - 1) / 2)));
}

/**
 * 커서 위치와 scrolloff 여백을 기준으로 뷰포트 topRow를 보정합니다.
 */
export function adjustViewport(
  viewport: ViewportState,
  cursorLine: number,
  totalLines: number,
  scrolloff = 0
): ViewportState {
  let { topRow, visibleRows } = viewport;
  const effSo = getEffectiveScrolloff(visibleRows, scrolloff);

  if (cursorLine < topRow + effSo) {
    topRow = Math.max(0, cursorLine - effSo);
  } else if (cursorLine >= topRow + visibleRows - effSo) {
    const desired = cursorLine - (visibleRows - 1 - effSo);
    const softMax = Math.max(topRow, Math.max(0, totalLines - visibleRows));
    topRow = Math.min(desired, softMax);
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
 * zt: 현재 커서 행이 화면 최상단(scrolloff 적용)에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToTop(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  return {
    ...state,
    viewport: {
      ...vp,
      topRow: Math.max(0, state.cursor.line - effSo),
    },
    pendingKeys: undefined,
  };
}

/**
 * zb: 현재 커서 행이 화면 최하단(scrolloff 적용)에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToBottom(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  const newTop = Math.max(0, state.cursor.line - (vp.visibleRows - 1 - effSo));
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
 * H (High): 현재 화면 뷰포트 기준 최상단 행(scrolloff 적용)으로 커서를 이동합니다.
 */
export function cursorToHigh(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  const offset = vp.topRow === 0 ? 0 : effSo;
  const targetLine = Math.max(0, Math.min(vp.topRow + offset, state.lines.length - 1));
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
 * L (Low): 현재 화면 뷰포트 기준 최하단 행(scrolloff 적용)으로 커서를 이동합니다.
 */
export function cursorToLow(state: VimEditorState): VimEditorState {
  const vp = getViewport(state);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  const bot = Math.min(vp.topRow + vp.visibleRows - 1, state.lines.length - 1);
  const targetLine = Math.max(0, bot >= state.lines.length - 1 ? bot : bot - effSo);
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

/**
 * Ctrl+f: 화면을 한 페이지(visibleRows - 2줄) 아래로 스크롤합니다.
 */
export function scrollFullPageDown(state: VimEditorState, count = 1): VimEditorState {
  const vp = getViewport(state);
  const total = state.lines.length;
  const page = Math.max(1, vp.visibleRows - 2);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));

  const newTop = Math.min(total - 1, vp.topRow + count * page);
  const targetLine = Math.min(total - 1, newTop + effSo);
  const mode = state.mode.startsWith('VISUAL') ? 'VISUAL' : 'NORMAL';
  const newCursor = clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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
 * Ctrl+b: 화면을 한 페이지(visibleRows - 2줄) 위로 스크롤합니다.
 */
export function scrollFullPageUp(state: VimEditorState, count = 1): VimEditorState {
  const vp = getViewport(state);
  const total = state.lines.length;
  const page = Math.max(1, vp.visibleRows - 2);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));

  let newTop: number;
  if (vp.topRow >= total - 1 && total > 1) {
    const firstBot = Math.max(0, total - 2);
    const firstTop = Math.max(0, firstBot - vp.visibleRows + 1);
    newTop = Math.max(0, firstTop - Math.max(0, count - 1) * page);
  } else {
    newTop = Math.max(0, vp.topRow - count * page);
  }

  const bot = Math.min(total - 1, newTop + vp.visibleRows - 1);
  const targetLine =
    newTop === 0 && vp.topRow === 0 ? 0 : Math.max(0, Math.min(total - 1, bot - effSo));
  const mode = state.mode.startsWith('VISUAL') ? 'VISUAL' : 'NORMAL';
  const newCursor = clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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
 * Ctrl+e: 커서는 유지하고 화면을 아래로 count줄 스크롤합니다 (커서가 상단을 벗어나면 함께 내려옴).
 */
export function scrollLineDown(state: VimEditorState, count = 1): VimEditorState {
  const vp = getViewport(state);
  const total = state.lines.length;
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));

  const newTop = Math.min(total - 1, vp.topRow + count);
  const minCur = Math.min(total - 1, newTop + effSo);
  const targetLine = Math.max(state.cursor.line, minCur);
  const mode = state.mode.startsWith('VISUAL') ? 'VISUAL' : 'NORMAL';
  const newCursor = clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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
 * Ctrl+y: 커서는 유지하고 화면을 위로 count줄 스크롤합니다 (커서가 하단을 벗어나면 함께 올라옴).
 */
export function scrollLineUp(state: VimEditorState, count = 1): VimEditorState {
  const vp = getViewport(state);
  const total = state.lines.length;
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));

  const newTop = Math.max(0, vp.topRow - count);
  const bot = Math.min(total - 1, newTop + vp.visibleRows - 1);
  const maxCur = newTop === 0 && total <= vp.visibleRows ? total - 1 : Math.max(0, bot - effSo);
  const targetLine = Math.min(state.cursor.line, maxCur);
  const mode = state.mode.startsWith('VISUAL') ? 'VISUAL' : 'NORMAL';
  const newCursor = clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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
