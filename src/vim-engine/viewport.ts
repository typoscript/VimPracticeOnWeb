import { VimEditorState, ViewportState } from './types';
import { moveToFirstNonBlank } from './motions';
import { clampCursor } from './cursor';
import { getOptions } from './setEngine';

export const DEFAULT_VISIBLE_ROWS = 15;
export const DEFAULT_VISIBLE_COLS = 80;

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
 * 상태의 sidescroll / sidescrolloff / wrap 옵션을 읽습니다.
 */
export function getSidescroll(state: VimEditorState): number {
  return Math.max(0, getOptions(state).sidescroll ?? 0);
}

export function getSidescrolloff(state: VimEditorState): number {
  return Math.max(0, getOptions(state).sidescrolloff ?? 0);
}

export function isWrapEnabled(state: VimEditorState): boolean {
  return getOptions(state).wrap !== false;
}

/**
 * 화면 높이를 고려한 유효 scrolloff 값을 계산합니다.
 * scrolloff가 visibleRows / 2 이상이면 커서는 항상 화면 중앙에 머무릅니다.
 */
export function getEffectiveScrolloff(visibleRows: number, scrolloff = 0): number {
  return Math.max(0, Math.min(scrolloff, Math.floor(Math.max(0, visibleRows - 1) / 2)));
}

/**
 * 커서 위치와 scrolloff / sidescrolloff 여백을 기준으로 뷰포트 topRow 및 (nowrap 시) leftCol을 보정합니다.
 */
export function adjustViewport(
  viewport: ViewportState,
  cursorLine: number,
  totalLines: number,
  scrolloff = 0,
  cursorCol = 0,
  sidescroll = 0,
  sidescrolloff = 0,
  wrap = true
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

  let nextLeftCol = 0;
  if (!wrap) {
    const visCols = Math.max(1, viewport.visibleCols ?? DEFAULT_VISIBLE_COLS);
    nextLeftCol = Math.max(0, viewport.leftCol ?? 0);
    const effSiso = getEffectiveScrolloff(visCols, sidescrolloff);
    if (cursorCol < nextLeftCol + effSiso) {
      if (sidescroll > 0) {
        const delta = nextLeftCol + effSiso - cursorCol;
        nextLeftCol = Math.max(0, nextLeftCol - Math.ceil(delta / sidescroll) * sidescroll);
      } else {
        nextLeftCol = cursorCol <= effSiso ? 0 : Math.max(0, cursorCol - Math.floor(visCols / 2));
      }
    } else if (cursorCol >= nextLeftCol + visCols - effSiso) {
      if (sidescroll > 0) {
        const delta = cursorCol - (nextLeftCol + visCols - 1 - effSiso);
        nextLeftCol = nextLeftCol + Math.ceil(delta / sidescroll) * sidescroll;
      } else {
        nextLeftCol = Math.max(0, cursorCol - Math.floor(visCols / 2));
      }
    }
  }

  return {
    topRow,
    visibleRows,
    ...(nextLeftCol > 0 ? { leftCol: nextLeftCol } : {}),
    ...(viewport.visibleCols !== undefined ? { visibleCols: viewport.visibleCols } : {}),
  };
}

function resolveScrollAnchor(
  state: VimEditorState,
  moveFirstNonBlank: boolean,
  targetLine1Based?: number
): { line: number; cursor: VimEditorState['cursor'] } {
  const line =
    targetLine1Based !== undefined
      ? Math.max(0, Math.min(state.lines.length - 1, targetLine1Based - 1))
      : state.cursor.line;
  const cursor = moveFirstNonBlank
    ? moveToFirstNonBlank(state.lines, { line, col: 0 })
    : clampCursor(state.lines, { line, col: state.cursor.col }, 'NORMAL');
  return { line, cursor };
}

/**
 * zz / z.: 현재(또는 [count]) 행이 화면 정중앙에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToCenter(
  state: VimEditorState,
  moveFirstNonBlank = false,
  targetLine1Based?: number
): VimEditorState {
  const vp = getViewport(state);
  const { line, cursor } = resolveScrollAnchor(state, moveFirstNonBlank, targetLine1Based);
  const midOffset = Math.floor(vp.visibleRows / 2);
  const newTop = Math.max(0, line - midOffset);

  return {
    ...state,
    cursor,
    viewport: {
      ...vp,
      topRow: newTop,
    },
    pendingKeys: undefined,
  };
}

/**
 * zt / z<CR>: 현재(또는 [count]) 행이 화면 최상단(scrolloff 적용)에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToTop(
  state: VimEditorState,
  moveFirstNonBlank = false,
  targetLine1Based?: number
): VimEditorState {
  const vp = getViewport(state);
  const { line, cursor } = resolveScrollAnchor(state, moveFirstNonBlank, targetLine1Based);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  return {
    ...state,
    cursor,
    viewport: {
      ...vp,
      topRow: Math.max(0, line - effSo),
    },
    pendingKeys: undefined,
  };
}

/**
 * zb / z-: 현재(또는 [count]) 행이 화면 최하단(scrolloff 적용)에 오도록 뷰포트를 스크롤합니다.
 */
export function scrollToBottom(
  state: VimEditorState,
  moveFirstNonBlank = false,
  targetLine1Based?: number
): VimEditorState {
  const vp = getViewport(state);
  const { line, cursor } = resolveScrollAnchor(state, moveFirstNonBlank, targetLine1Based);
  const effSo = getEffectiveScrolloff(vp.visibleRows, getScrolloff(state));
  const newTop = Math.max(0, line - (vp.visibleRows - 1 - effSo));
  return {
    ...state,
    cursor,
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
  const newCursor = getOptions(state).startofline
    ? moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 })
    : clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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
  const newCursor = getOptions(state).startofline
    ? moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 })
    : clampCursor(state.lines, { line: targetLine, col: state.cursor.col }, mode);

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

function buildUpdatedViewport(vp: ViewportState, leftCol: number): ViewportState {
  const { leftCol: _ignored, ...rest } = vp;
  return leftCol > 0 ? { ...rest, leftCol } : rest;
}

function scrollHorizontalBy(state: VimEditorState, deltaCols: number): VimEditorState {
  if (isWrapEnabled(state)) {
    return { ...state, pendingKeys: undefined };
  }
  const vp = getViewport(state);
  const visCols = Math.max(1, vp.visibleCols ?? DEFAULT_VISIBLE_COLS);
  const effSiso = getEffectiveScrolloff(visCols, getSidescrolloff(state));
  const curLine = state.lines[state.cursor.line] ?? '';
  const maxCol = Math.max(0, curLine.length - 1);
  const curLeft = Math.max(0, vp.leftCol ?? 0);
  const nextLeft = Math.max(0, Math.min(maxCol, curLeft + deltaCols));

  let nextCol = state.cursor.col;
  if (nextCol < nextLeft + effSiso) {
    nextCol = Math.min(maxCol, nextLeft + effSiso);
  } else if (nextCol >= nextLeft + visCols - effSiso) {
    nextCol = Math.max(0, Math.min(maxCol, nextLeft + visCols - 1 - effSiso));
  }

  const mode = state.mode.startsWith('VISUAL') ? 'VISUAL' : 'NORMAL';
  const clamped = clampCursor(state.lines, { line: state.cursor.line, col: nextCol }, mode);

  return {
    ...state,
    cursor: clamped,
    viewport: buildUpdatedViewport(vp, nextLeft),
    pendingKeys: undefined,
  };
}

/** zh: 화면을 왼쪽으로 count열 스크롤 (텍스트 오른쪽 이동, nowrap 전용) */
export function scrollColsLeft(state: VimEditorState, count = 1): VimEditorState {
  return scrollHorizontalBy(state, -Math.max(1, count));
}

/** zl: 화면을 오른쪽으로 count열 스크롤 (텍스트 왼쪽 이동, nowrap 전용) */
export function scrollColsRight(state: VimEditorState, count = 1): VimEditorState {
  return scrollHorizontalBy(state, Math.max(1, count));
}

/** zH: 화면을 왼쪽으로 반 화면(visibleCols / 2) 스크롤 (nowrap 전용) */
export function scrollHalfColsLeft(state: VimEditorState, count = 1): VimEditorState {
  const visCols = Math.max(1, getViewport(state).visibleCols ?? DEFAULT_VISIBLE_COLS);
  return scrollHorizontalBy(state, -Math.max(1, count) * Math.max(1, Math.floor(visCols / 2)));
}

/** zL: 화면을 오른쪽으로 반 화면(visibleCols / 2) 스크롤 (nowrap 전용) */
export function scrollHalfColsRight(state: VimEditorState, count = 1): VimEditorState {
  const visCols = Math.max(1, getViewport(state).visibleCols ?? DEFAULT_VISIBLE_COLS);
  return scrollHorizontalBy(state, Math.max(1, count) * Math.max(1, Math.floor(visCols / 2)));
}

/** ze: 현재 커서가 화면 오른쪽 끝(sidescrolloff 적용)에 오도록 수평 스크롤 */
export function scrollCursorToRight(state: VimEditorState): VimEditorState {
  if (isWrapEnabled(state)) {
    return { ...state, pendingKeys: undefined };
  }
  const vp = getViewport(state);
  const visCols = Math.max(1, vp.visibleCols ?? DEFAULT_VISIBLE_COLS);
  const effSiso = getEffectiveScrolloff(visCols, getSidescrolloff(state));
  const nextLeft = Math.max(0, state.cursor.col - (visCols - 1 - effSiso));
  return {
    ...state,
    viewport: buildUpdatedViewport(vp, nextLeft),
    pendingKeys: undefined,
  };
}

/** zs: 현재 커서가 화면 왼쪽 끝(sidescrolloff 적용)에 오도록 수평 스크롤 */
export function scrollCursorToLeft(state: VimEditorState): VimEditorState {
  if (isWrapEnabled(state)) {
    return { ...state, pendingKeys: undefined };
  }
  const vp = getViewport(state);
  const visCols = Math.max(1, vp.visibleCols ?? DEFAULT_VISIBLE_COLS);
  const effSiso = getEffectiveScrolloff(visCols, getSidescrolloff(state));
  const nextLeft = Math.max(0, state.cursor.col - effSiso);
  return {
    ...state,
    viewport: buildUpdatedViewport(vp, nextLeft),
    pendingKeys: undefined,
  };
}

/** Normal / Visual z-접두어 수평 스크롤 키(zh, zl, zH, zL, ze, zs) 공통 디스패처 */
export function handleHorizontalViewportKey(
  state: VimEditorState,
  key: string,
  count = 1
): VimEditorState | null {
  if (key === 'h' || key === 'ArrowLeft') return scrollColsLeft(state, count);
  if (key === 'l' || key === 'ArrowRight') return scrollColsRight(state, count);
  if (key === 'H') return scrollHalfColsLeft(state, count);
  if (key === 'L') return scrollHalfColsRight(state, count);
  if (key === 'e') return scrollCursorToRight(state);
  if (key === 's') return scrollCursorToLeft(state);
  return null;
}
