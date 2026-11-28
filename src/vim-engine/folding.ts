/**
 * 폴딩 진입점: 수동 폴드 만들기·지우기(`zf zd zD zE`)와 폴드 사이 이동(`zj zk [z ]z`).
 * 열기·닫기 명령은 `foldCommands.ts`, 줄 이동·`dd`/`yy`·폴드 이동 보정은 `foldLines.ts`,
 * 폴드 감지는 `foldingDetection.ts` 에 있으며 기존 import 경로를 위해 여기서 다시 export 합니다.
 */
import { FoldRange, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { resolveCommentString } from './commentEngine';
import { parseFoldMarker } from './foldingDetection';
import { getClosedFoldStartingAt } from './foldLines';
import { collectKnownFolds } from './foldCommands';

export {
  detectIndentFoldBlocks,
  detectExprFoldBlocks,
  parseFoldMarker,
  detectMarkerFoldBlocks,
  detectFoldBlocks,
} from './foldingDetection';
export {
  findFoldForCursor,
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  foldMore,
  foldReduce,
  foldOpenCursorLine,
  foldUpdate,
  foldRecursive,
  toggleFoldEnable,
} from './foldCommands';
export {
  getClosedFoldStartingAt,
  isLineHiddenByFold,
  getNextVisibleLine,
  getPrevVisibleLine,
  deleteFoldOrLine,
  yankFoldOrLine,
  generateFoldText,
  adjustFoldsForLineChange,
} from './foldLines';

/**
 * zf: 시작 줄부터 끝 줄까지 수동 폴드 생성 (Visual 모드 또는 Normal zf{motion})
 */
export function createFold(
  state: VimEditorState,
  startRow: number,
  endRow: number
): VimEditorState {
  const start = Math.max(0, Math.min(startRow, endRow));
  const end = Math.min(state.lines.length - 1, Math.max(startRow, endRow));

  let baseState = state;
  let nextLines = state.lines;

  if (state.options?.foldmethod === 'marker' && end > start) {
    const [startMarker, endMarker] = parseFoldMarker(state.options?.foldmarker);
    const cms = resolveCommentString(state);
    const formatMarker = (marker: string) =>
      cms.includes('%s') ? cms.replace('%s', marker) : `${cms} ${marker}`.trim();
    const updatedLines = [...state.lines];
    if (!(updatedLines[start] ?? '').includes(startMarker)) {
      updatedLines[start] = `${updatedLines[start] ?? ''}${formatMarker(startMarker)}`;
    }
    if (!(updatedLines[end] ?? '').includes(endMarker)) {
      updatedLines[end] = `${updatedLines[end] ?? ''}${formatMarker(endMarker)}`;
    }
    if (updatedLines[start] !== state.lines[start] || updatedLines[end] !== state.lines[end]) {
      baseState = pushUndoSnapshot(state);
      nextLines = updatedLines;
    }
  }

  const existingFolds = [...(baseState.folds ?? [])];
  const idx = existingFolds.findIndex(
    (f) => f.startRow === start && f.endRow === end
  );

  if (idx >= 0) {
    existingFolds[idx] = { ...existingFolds[idx], closed: true, manual: true };
  } else {
    existingFolds.push({
      startRow: start,
      endRow: end,
      closed: true,
      manual: true,
    });
  }

  const sortedFolds = existingFolds.sort((a, b) => a.startRow - b.startRow);

  return {
    ...baseState,
    lines: nextLines,
    folds: sortedFolds,
    cursor: clampCursor(nextLines, { line: start, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * zd: 현재 커서 위치의 폴드 1개 삭제
 */
export function deleteFoldAtCursor(state: VimEditorState): VimEditorState {
  const folds = state.folds ?? [];
  const cursorRow = state.cursor.line;

  let targetIdx = -1;
  let minSpan = Infinity;

  for (let i = 0; i < folds.length; i++) {
    const f = folds[i];
    if (f.startRow <= cursorRow && cursorRow <= f.endRow) {
      const span = f.endRow - f.startRow;
      if (span < minSpan) {
        minSpan = span;
        targetIdx = i;
      }
    }
  }

  if (targetIdx === -1) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
    };
  }

  const nextFolds = folds.filter((_, idx) => idx !== targetIdx);

  return {
    ...state,
    folds: nextFolds,
    pendingKeys: undefined,
  };
}

/**
 * zD: 현재 커서 위치를 포함하는 모든 폴드 삭제 (재귀적 삭제)
 */
export function deleteAllFoldsAtCursor(state: VimEditorState): VimEditorState {
  const folds = state.folds ?? [];
  const cursorRow = state.cursor.line;

  const nextFolds = folds.filter(
    (f) => !(f.startRow <= cursorRow && cursorRow <= f.endRow)
  );

  if (nextFolds.length === folds.length) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
    };
  }

  return {
    ...state,
    folds: nextFolds,
    pendingKeys: undefined,
  };
}

/**
 * zE: 버퍼 내의 모든 수동 생성 폴드 제거
 */
export function eliminateAllFolds(state: VimEditorState): VimEditorState {
  return {
    ...state,
    folds: [],
    pendingKeys: undefined,
  };
}

/**
 * zj: 다음 폴드 시작 줄로 점프합니다.
 */
export function jumpToNextFold(state: VimEditorState, count = 1): VimEditorState {
  const folds = collectKnownFolds(state);
  let row = state.cursor.line;
  const curFold = getClosedFoldStartingAt(state.folds, row);
  let searchFrom = curFold ? curFold.endRow : row;

  let target: FoldRange | undefined;
  let moved = 0;
  for (let i = 0; i < count; i++) {
    const next = folds.find((f) => f.startRow > searchFrom);
    if (!next) break;
    target = next;
    moved++;
    searchFrom = next.closed ? next.endRow : next.startRow;
  }
  if (!target || moved === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  row = target.startRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: row, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * zk: 이전 폴드 끝 줄(닫혀 있으면 시작 줄)로 점프합니다.
 */
export function jumpToPrevFold(state: VimEditorState, count = 1): VimEditorState {
  const folds = collectKnownFolds(state);
  let searchBefore = state.cursor.line;
  let target: FoldRange | undefined;
  let moved = 0;

  for (let i = 0; i < count; i++) {
    const candidates = folds.filter((f) => f.endRow < searchBefore);
    if (candidates.length === 0) break;
    // endRow가 가장 큰 폴드 선택
    target = candidates.reduce((best, cur) => (cur.endRow > best.endRow ? cur : best));
    moved++;
    searchBefore = target.startRow;
  }
  if (!target || moved === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  const destRow = target.closed ? target.startRow : target.endRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: destRow, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * [z / ]z: 현재 열려 있는 폴드의 시작([z) 또는 끝(]z) 줄로 점프합니다.
 */
export function jumpToFoldEdge(state: VimEditorState, edge: 'start' | 'end'): VimEditorState {
  const folds = collectKnownFolds(state);
  const row = state.cursor.line;
  const enclosing = folds
    .filter((f) => f.startRow <= row && row <= f.endRow && (edge === 'start' ? f.startRow < row : f.endRow > row))
    .sort((a, b) => (a.endRow - a.startRow) - (b.endRow - b.startRow));

  if (enclosing.length === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  const targetRow = edge === 'start' ? enclosing[0].startRow : enclosing[0].endRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: targetRow, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}
