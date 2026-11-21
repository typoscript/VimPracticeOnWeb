import { SplitPaneState, SplitPlacement, VimEditorState, WindowLayoutNode } from './types';
import { openNewTab } from './tabEngine';
import { msg } from './messages';
import { getGlobalOptions, getOptions } from './setEngine';
import {
  allocateNextWinId,
  exchangeLeafInTree,
  findNeighborPane,
  getEffectiveWindowTree,
  getPaneWinId,
  moveLeafToEdgeInTree,
  normalizeWindowLayout,
  removeLeafFromTree,
  resizeLeafInTree,
  rotateSiblingsInTree,
  splitLeafInTree,
  switchPaneFocusCore,
  syncSharedBufferPanes,
} from './windowTree';

function withPaneLocalOptions(
  state: VimEditorState,
  pane: SplitPaneState
): VimEditorState['options'] {
  if (pane.scrollbind === undefined && !pane.localOptions && !state.options) return state.options;
  const base = state.options ?? getOptions(state);
  return {
    ...base,
    ...(pane.localOptions ?? {}),
    scrollbind: pane.scrollbind ?? pane.localOptions?.scrollbind ?? base.scrollbind ?? false,
  };
}

function loadPaneIntoTopLevel(
  state: VimEditorState,
  pane: SplitPaneState
): Partial<VimEditorState> {
  return {
    lines: [...pane.lines],
    cursor: { ...pane.cursor },
    mode: pane.mode ?? 'NORMAL',
    visualAnchor: pane.visualAnchor,
    visualBlockEndOfLine: pane.visualBlockEndOfLine,
    viewport: pane.viewport,
    undoStack: pane.undoStack ? [...pane.undoStack] : [],
    redoStack: pane.redoStack ? [...pane.redoStack] : [],
    pendingKeys: undefined,
    locationList: pane.locationList,
    options: withPaneLocalOptions(state, pane),
  };
}

function allocateDistinctBufferId(
  state: VimEditorState,
  panes: SplitPaneState[] | undefined,
  excludeId: number
): number {
  let maxId = Math.max(excludeId, state.currentBufferId ?? 1);
  if (state.buffers) {
    for (const b of state.buffers) {
      if (b.id > maxId) maxId = b.id;
    }
  }
  if (panes) {
    for (const p of panes) {
      if (p.bufferId !== undefined && p.bufferId > maxId) maxId = p.bufferId;
    }
  }
  return maxId + 1;
}

/**
 * 에디터 창을 가로(:sp, :new) 또는 세로(:vsp, :vnew)로 분할합니다.
 * 이미 분할된 상태에서도 현재 활성 창을 중첩 분할하여 3개 이상의 멀티 윈도우 트리를 구성하며,
 * :topleft / :botright / :aboveleft / :belowright 배치 모디파이어와 동일 버퍼 실시간 동기화를 지원합니다.
 */
export function splitWindow(
  state: VimEditorState,
  direction: 'horizontal' | 'vertical',
  secondaryLines?: string[],
  secondaryFilename?: string,
  placement: SplitPlacement = 'default'
): VimEditorState {
  const isAlreadySplit = Boolean(
    state.splitDirection &&
      state.splitDirection !== 'none' &&
      state.splitPanes &&
      state.splitPanes.length >= 2
  );

  if (isAlreadySplit) {
    const synced = syncActivePane(state);
    const existingPanes = synced.splitPanes!;
    const curIdx = synced.activePaneIndex ?? 0;
    const curPane = existingPanes[curIdx];
    const baseTree = getEffectiveWindowTree(synced)!;

    const panesWithIds = existingPanes.map((p, i) => ({
      ...p,
      winId: p.winId ?? 1000 + i,
      bufferId: p.bufferId ?? (i === curIdx ? (synced.currentBufferId ?? 1) : undefined),
    }));
    const curBufId = panesWithIds[curIdx].bufferId ?? synced.currentBufferId ?? 1;
    const newWinId = allocateNextWinId(panesWithIds, synced.nextWindowId);
    const curScb = curPane.scrollbind ?? getOptions(synced).scrollbind ?? false;
    const newWinScb = secondaryLines ? (getGlobalOptions(synced).scrollbind ?? false) : curScb;

    const newName = secondaryFilename || curPane.filename || 'source.ts';
    let newBufId: number;
    let newLines: string[];

    if (!secondaryFilename && !secondaryLines) {
      // 동일 버퍼 복제 분할 (:sp, :vsp, Ctrl-w s, Ctrl-w v)
      newBufId = curBufId;
      newLines = [...curPane.lines];
    } else if (secondaryFilename && secondaryFilename === curPane.filename && !secondaryLines) {
      newBufId = curBufId;
      newLines = [...curPane.lines];
    } else {
      const existingSamePane =
        secondaryFilename && secondaryFilename !== '[No Name]'
          ? panesWithIds.find((p) => p.filename === secondaryFilename)
          : undefined;
      const matchedBuf =
        secondaryFilename && secondaryFilename !== '[No Name]'
          ? synced.buffers?.find((b) => b.name === secondaryFilename)
          : undefined;

      if (existingSamePane && !secondaryLines) {
        newBufId =
          existingSamePane.bufferId ??
          matchedBuf?.id ??
          allocateDistinctBufferId(synced, panesWithIds, curBufId);
        newLines = [...existingSamePane.lines];
      } else if (existingSamePane && secondaryFilename === existingSamePane.filename && secondaryLines && existingSamePane.bufferId !== undefined) {
        newBufId = existingSamePane.bufferId;
        newLines = [...existingSamePane.lines];
      } else if (matchedBuf) {
        newBufId = matchedBuf.id;
        newLines = secondaryLines ? [...secondaryLines] : [...matchedBuf.lines];
      } else {
        newBufId = allocateDistinctBufferId(synced, panesWithIds, curBufId);
        newLines = secondaryLines ? [...secondaryLines] : [...curPane.lines];
      }
    }

    const newPane: SplitPaneState = {
      winId: newWinId,
      bufferId: newBufId,
      filename: newName,
      lines: newLines,
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      viewport: { topRow: 0, visibleRows: curPane.viewport?.visibleRows ?? 10 },
      undoStack: newBufId === curBufId && curPane.undoStack ? [...curPane.undoStack] : [],
      redoStack: newBufId === curBufId && curPane.redoStack ? [...curPane.redoStack] : [],
      scrollbind: newWinScb,
    };

    const nextRawPanes = [...panesWithIds, newPane];
    const newRawIdx = panesWithIds.length;
    const nextTree = splitLeafInTree(baseTree, curIdx, newRawIdx, direction, placement);

    const normalized = normalizeWindowLayout({
      tree: nextTree,
      panes: nextRawPanes,
      activeOriginalIndex: curIdx,
      prevOriginalIndex: synced.previousPaneIndex,
      windowVars: synced.windowVars,
    });

    return {
      ...synced,
      splitDirection: normalized.splitDirection,
      splitPanes: normalized.splitPanes,
      windowLayout: normalized.windowLayout,
      splitRatio: normalized.splitRatio,
      activePaneIndex: normalized.activePaneIndex,
      previousPaneIndex: normalized.previousPaneIndex,
      windowVars: normalized.windowVars,
      nextWindowId: newWinId + 1,
      primaryFilename: normalized.splitPanes?.[0]?.filename ?? synced.primaryFilename,
      secondaryFilename: normalized.splitPanes?.[1]?.filename ?? synced.secondaryFilename,
      commandMessage:
        direction === 'vertical'
          ? msg('창을 세로로 분할했습니다 (:vsp)')
          : msg('창을 가로로 분할했습니다 (:sp)'),
    };
  }

  const primaryName = state.primaryFilename || 'source.ts';
  const isImplicitSameBuffer =
    !secondaryLines &&
    ((secondaryFilename !== undefined && secondaryFilename === primaryName) ||
      (!secondaryFilename && !state.secondaryFilename && !state.secondaryLines));

  const secondaryName = isImplicitSameBuffer
    ? primaryName
    : secondaryFilename || state.secondaryFilename || 'target.ts';

  const curScb = getOptions(state).scrollbind ?? false;
  const newWinScb = secondaryLines ? (getGlobalOptions(state).scrollbind ?? false) : curScb;

  const winId0 = 1000;
  const winId1 = allocateNextWinId([{ winId: winId0 } as SplitPaneState], state.nextWindowId);
  const bufId0 = state.currentBufferId ?? 1;
  const matchedSecBuf =
    !isImplicitSameBuffer && secondaryName !== '[No Name]'
      ? state.buffers?.find((b) => b.name === secondaryName)
      : undefined;
  const bufId1 = isImplicitSameBuffer
    ? bufId0
    : matchedSecBuf?.id ?? allocateDistinctBufferId(state, undefined, bufId0);

  const pane0: SplitPaneState = {
    winId: winId0,
    bufferId: bufId0,
    filename: primaryName,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    visualBlockEndOfLine: state.visualBlockEndOfLine,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
    locationList: state.locationList,
    scrollbind: curScb,
  };

  const p1Lines = isImplicitSameBuffer
    ? [...state.lines]
    : (secondaryLines ?? state.secondaryLines ?? [...state.lines]);
  const pane1: SplitPaneState = {
    winId: winId1,
    bufferId: bufId1,
    filename: secondaryName,
    lines: [...p1Lines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    viewport: { topRow: 0, visibleRows: 10 },
    undoStack: isImplicitSameBuffer && state.undoStack ? [...state.undoStack] : [],
    redoStack: isImplicitSameBuffer && state.redoStack ? [...state.redoStack] : [],
    scrollbind: newWinScb,
  };

  const placeNewFirst = placement === 'aboveleft' || placement === 'topleft';
  const orderedPanes = placeNewFirst ? [pane1, pane0] : [pane0, pane1];
  const nextActiveIdx = placeNewFirst ? 1 : 0;

  const initialTree: WindowLayoutNode = {
    kind: 'split',
    direction,
    children: [
      { kind: 'leaf', paneIndex: 0 },
      { kind: 'leaf', paneIndex: 1 },
    ],
    weights: [50, 50],
  };

  return {
    ...state,
    splitDirection: direction,
    activePaneIndex: nextActiveIdx,
    previousPaneIndex: undefined,
    splitPanes: orderedPanes,
    windowLayout: initialTree,
    nextWindowId: winId1 + 1,
    splitRatio: 50,
    primaryFilename: orderedPanes[0].filename,
    secondaryFilename: orderedPanes[1].filename,
    commandMessage:
      direction === 'vertical'
        ? msg('창을 세로로 분할했습니다 (:vsp)')
        : msg('창을 가로로 분할했습니다 (:sp)'),
  };
}

/**
 * 현재 활성화된 분할 창을 닫습니다 (:close, :clo, :q, Ctrl+w c, Ctrl+w q).
 */
export function closeSplitWindow(state: VimEditorState): VimEditorState {
  if (
    !state.splitDirection ||
    state.splitDirection === 'none' ||
    !state.splitPanes ||
    state.splitPanes.length < 2
  ) {
    return {
      ...state,
      commandMessage: msg('E444: 마지막 창을 닫을 수 없습니다 (:close)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const panes = state.splitPanes;

  if (panes.length === 2) {
    const keepIdx = curIdx === 1 ? 0 : 1;
    const kept = panes[keepIdx];
    const keptVars =
      state.windowVars && state.windowVars[keepIdx]
        ? { 0: state.windowVars[keepIdx] }
        : undefined;
    return {
      ...state,
      ...loadPaneIntoTopLevel(state, kept),
      ...(curIdx === 0 ? { primaryFilename: kept.filename } : {}),
      splitDirection: 'none',
      activePaneIndex: 0,
      previousPaneIndex: undefined,
      splitPanes: undefined,
      windowLayout: undefined,
      splitRatio: undefined,
      windowVars: keptVars,
      commandMessage: msg('분할 창을 닫았습니다 (:close)'),
    };
  }

  // 3개 이상 분할 창: 현재 창만 트리에서 제거하고 남은 트리 정규화
  const tree = getEffectiveWindowTree(state)!;
  const reducedTree = removeLeafFromTree(tree, curIdx);
  const nextActiveOriginal = curIdx + 1 < panes.length ? curIdx + 1 : curIdx - 1;

  const normalized = normalizeWindowLayout({
    tree: reducedTree,
    panes,
    activeOriginalIndex: nextActiveOriginal,
    prevOriginalIndex: state.previousPaneIndex,
    windowVars: state.windowVars,
  });

  const nextActivePane =
    normalized.splitPanes?.[normalized.activePaneIndex] ?? panes[nextActiveOriginal];

  return {
    ...state,
    ...loadPaneIntoTopLevel(state, nextActivePane),
    splitDirection: normalized.splitDirection,
    splitPanes: normalized.splitPanes,
    windowLayout: normalized.windowLayout,
    splitRatio: normalized.splitRatio,
    activePaneIndex: normalized.activePaneIndex,
    previousPaneIndex: normalized.previousPaneIndex,
    windowVars: normalized.windowVars,
    primaryFilename: normalized.splitPanes?.[0]?.filename ?? nextActivePane.filename,
    secondaryFilename: normalized.splitPanes?.[1]?.filename,
    commandMessage: msg('분할 창을 닫았습니다 (:close)'),
  };
}

/**
 * 현재 활성 창을 제외한 모든 분할 창을 닫습니다 (:only, :on, Ctrl+w o).
 */
export function closeOtherPanes(state: VimEditorState): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return {
      ...state,
      commandMessage: msg('현재 이미 단일 창입니다 (:only)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const activePane = state.splitPanes[curIdx];
  const keptVars =
    state.windowVars && state.windowVars[curIdx]
      ? { 0: state.windowVars[curIdx] }
      : undefined;

  return {
    ...state,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    primaryFilename: activePane.filename,
    splitDirection: 'none',
    activePaneIndex: 0,
    previousPaneIndex: undefined,
    splitPanes: undefined,
    windowLayout: undefined,
    splitRatio: undefined,
    windowVars: keptVars,
    commandMessage: msg('현재 창만 유지되었습니다 (:only)'),
  };
}

/**
 * 분할된 창 간에 포커스를 전환합니다 (Ctrl+w h/j/k/l/w/W/t/b/p).
 */
export function switchPaneFocus(
  state: VimEditorState,
  targetPaneIndex: number
): VimEditorState {
  return switchPaneFocusCore(state, targetPaneIndex);
}

/**
 * 중첩 윈도우 트리의 기하학적 위치 기준으로 h/j/k/l 방향 이웃 창으로 포커스를 이동합니다.
 */
export function moveFocusByDirection(
  state: VimEditorState,
  dir: 'h' | 'j' | 'k' | 'l'
): VimEditorState {
  const tree = getEffectiveWindowTree(state);
  if (!tree || !state.splitPanes) return state;
  const curIdx = state.activePaneIndex ?? 0;
  const targetIdx = findNeighborPane(tree, curIdx, dir);
  if (targetIdx === null) return state;
  return switchPaneFocus(state, targetIdx);
}

/**
 * Ctrl-w w / Ctrl-w W / [count]Ctrl-w w 순환 이동을 처리합니다.
 */
export function cyclePaneFocus(
  state: VimEditorState,
  delta: 1 | -1,
  count?: number
): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return state;
  }
  const n = state.splitPanes.length;
  if (count !== undefined && count >= 1) {
    return switchPaneFocus(state, Math.min(n - 1, count - 1));
  }
  const curIdx = state.activePaneIndex ?? 0;
  const nextIdx = (curIdx + delta + n) % n;
  return switchPaneFocus(state, nextIdx);
}

/**
 * 분할 창의 위치와 내용을 인접 형제 창과 맞바꿉니다 (Ctrl+w x).
 */
export function exchangePanes(state: VimEditorState, count?: number): VimEditorState {
  const synced = syncActivePane(state);
  const tree = getEffectiveWindowTree(synced);
  if (!tree || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const swappedTree = exchangeLeafInTree(tree, curIdx, count);
  const normalized = normalizeWindowLayout({
    tree: swappedTree,
    panes: synced.splitPanes,
    activeOriginalIndex: curIdx,
    prevOriginalIndex: synced.previousPaneIndex,
    windowVars: synced.windowVars,
  });

  // 기존 VimPracticeOnWeb 규약: Ctrl-w x 후 포커스 슬롯(curIdx)에 들어온 창을 활성화
  const targetSlot = Math.min(curIdx, (normalized.splitPanes?.length ?? 1) - 1);
  const newActive = normalized.splitPanes![targetSlot];

  return {
    ...synced,
    ...loadPaneIntoTopLevel(synced, newActive),
    splitDirection: normalized.splitDirection,
    splitPanes: normalized.splitPanes,
    windowLayout: normalized.windowLayout,
    splitRatio: normalized.splitRatio,
    activePaneIndex: targetSlot,
    previousPaneIndex: normalized.previousPaneIndex,
    windowVars: normalized.windowVars,
    primaryFilename: normalized.splitPanes![0].filename,
    secondaryFilename: normalized.splitPanes![1]?.filename,
    commandMessage: msg('두 창의 위치를 맞바꿨습니다 (Ctrl-w x)'),
  };
}

/**
 * 현재 창이 속한 분할 컨테이너의 창들을 시계/반시계 방향으로 회전합니다 (Ctrl+w r / Ctrl+w R).
 */
export function rotatePanes(
  state: VimEditorState,
  counterClockwise = false
): VimEditorState {
  const synced = syncActivePane(state);
  const tree = getEffectiveWindowTree(synced);
  if (!tree || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const rotatedTree = rotateSiblingsInTree(tree, curIdx, counterClockwise);
  const normalized = normalizeWindowLayout({
    tree: rotatedTree,
    panes: synced.splitPanes,
    activeOriginalIndex: curIdx,
    prevOriginalIndex: synced.previousPaneIndex,
    windowVars: synced.windowVars,
  });

  const newActive = normalized.splitPanes![normalized.activePaneIndex];

  return {
    ...synced,
    ...loadPaneIntoTopLevel(synced, newActive),
    splitDirection: normalized.splitDirection,
    splitPanes: normalized.splitPanes,
    windowLayout: normalized.windowLayout,
    splitRatio: normalized.splitRatio,
    activePaneIndex: normalized.activePaneIndex,
    previousPaneIndex: normalized.previousPaneIndex,
    windowVars: normalized.windowVars,
    primaryFilename: normalized.splitPanes![0].filename,
    secondaryFilename: normalized.splitPanes![1]?.filename,
    commandMessage: counterClockwise
      ? msg('창을 반시계 방향으로 회전했습니다 (Ctrl-w R)')
      : msg('창을 시계 방향으로 회전했습니다 (Ctrl-w r)'),
  };
}

/**
 * 현재 창을 지정된 방향의 끝(루트 가장자리)으로 이동하고 레이아웃을 재배치합니다 (Ctrl+w H / J / K / L).
 */
export function movePaneToDirection(
  state: VimEditorState,
  dir: 'H' | 'J' | 'K' | 'L'
): VimEditorState {
  const synced = syncActivePane(state);
  const tree = getEffectiveWindowTree(synced);
  if (!tree || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const isVertical = dir === 'H' || dir === 'L';
  const movedTree = moveLeafToEdgeInTree(tree, curIdx, dir);

  const normalized = normalizeWindowLayout({
    tree: movedTree,
    panes: synced.splitPanes,
    activeOriginalIndex: curIdx,
    prevOriginalIndex: synced.previousPaneIndex,
    windowVars: synced.windowVars,
  });

  const activePane = normalized.splitPanes![normalized.activePaneIndex];

  return {
    ...synced,
    ...loadPaneIntoTopLevel(synced, activePane),
    splitDirection: normalized.splitDirection,
    activePaneIndex: normalized.activePaneIndex,
    previousPaneIndex: normalized.previousPaneIndex,
    splitPanes: normalized.splitPanes,
    windowLayout: normalized.windowLayout,
    splitRatio: normalized.splitRatio,
    windowVars: normalized.windowVars,
    primaryFilename: normalized.splitPanes![0].filename,
    secondaryFilename: normalized.splitPanes![1]?.filename,
    commandMessage: msg('창 레이아웃을 {v}로 재배치했습니다 (Ctrl-w {dir})', {
      v: isVertical ? msg('세로') : msg('가로'),
      dir,
    }),
  };
}

/**
 * 분할 창의 크기를 조절합니다 (Ctrl+w =, Ctrl+w +, Ctrl+w -, Ctrl+w >, Ctrl+w <, Ctrl+w _, Ctrl+w |).
 */
export function resizeSplit(
  state: VimEditorState,
  delta: number | '=' | '_' | '|',
  axis: 'horizontal' | 'vertical' | 'any' = 'any'
): VimEditorState {
  const tree = getEffectiveWindowTree(state);
  if (!tree || !state.splitPanes) {
    return state;
  }

  const curIdx = state.activePaneIndex ?? 0;

  if (delta === '=') {
    const { tree: nextTree } = resizeLeafInTree(tree, curIdx, 'any', 'equal');
    const splitRatio =
      nextTree.kind === 'split' && nextTree.children.length === 2 ? 50 : undefined;
    return {
      ...state,
      windowLayout: nextTree,
      splitRatio,
      commandMessage: msg('창 크기를 균등하게 맞췄습니다 (Ctrl-w =)'),
    };
  }

  if (delta === '_' || delta === '|') {
    const maxAxis = axis !== 'any' ? axis : delta === '_' ? 'horizontal' : 'vertical';
    const { tree: nextTree } = resizeLeafInTree(tree, curIdx, maxAxis, 'max');
    const splitRatio =
      nextTree.kind === 'split' && nextTree.children.length === 2
        ? Math.round(nextTree.weights[0])
        : state.splitRatio;
    return {
      ...state,
      windowLayout: nextTree,
      splitRatio,
      commandMessage: msg('현재 창을 최대화했습니다'),
    };
  }

  const { tree: nextTree, resizedPercent } = resizeLeafInTree(
    tree,
    curIdx,
    axis,
    'delta',
    delta
  );
  const splitRatio =
    nextTree.kind === 'split' && nextTree.children.length === 2
      ? Math.round(nextTree.weights[0])
      : state.splitRatio;
  const shownRatio = splitRatio ?? resizedPercent;

  return {
    ...state,
    windowLayout: nextTree,
    splitRatio,
    commandMessage: msg('창 크기 조절: {newRatio}% / {v}%', {
      newRatio: shownRatio,
      v: 100 - shownRatio,
    }),
  };
}

/**
 * 현재 활성 분할 창을 독립된 새 탭 페이지로 떼어냅니다 (Ctrl+w T).
 */
export function moveWindowToNewTab(state: VimEditorState): VimEditorState {
  if (
    !state.splitDirection ||
    state.splitDirection === 'none' ||
    !state.splitPanes ||
    state.splitPanes.length < 2
  ) {
    return {
      ...state,
      commandMessage: msg('E444: 이미 단일 창입니다 (Ctrl-w T)'),
    };
  }

  const synced = syncActivePane(state);
  const curIdx = synced.activePaneIndex ?? 0;
  const activePane = synced.splitPanes![curIdx];

  // 1. 현재 탭에서는 나머지 창들(단일 또는 남은 멀티 트리)을 유지
  const remainingState = closeSplitWindow(synced);

  // 2. 새 탭을 열고 떼어낸 활성 창 내용 적재
  const stateWithNewTab = openNewTab(remainingState, activePane.filename);

  return {
    ...stateWithNewTab,
    lines: [...activePane.lines],
    cursor: { ...activePane.cursor },
    mode: activePane.mode ?? 'NORMAL',
    visualAnchor: activePane.visualAnchor,
    visualBlockEndOfLine: activePane.visualBlockEndOfLine,
    viewport: activePane.viewport,
    undoStack: activePane.undoStack ? [...activePane.undoStack] : [],
    redoStack: activePane.redoStack ? [...activePane.redoStack] : [],
    locationList: activePane.locationList,
    commandMessage: msg('"{filename}" 창을 새 탭으로 분리했습니다 (Ctrl-w T)', {
      filename: activePane.filename,
    }),
  };
}

/**
 * 활성 창의 최신 상태를 splitPanes에 항상 동기화합니다.
 */
export function syncActivePane(state: VimEditorState): VimEditorState {
  if (!state.splitPanes || !state.splitDirection || state.splitDirection === 'none') {
    return state;
  }

  const curIdx = state.activePaneIndex ?? 0;
  if (curIdx < 0 || curIdx >= state.splitPanes.length) {
    return state;
  }

  const updatedPanes = state.splitPanes.map((pane, idx) =>
    idx === curIdx
      ? {
          ...pane,
          lines: [...state.lines],
          cursor: { ...state.cursor },
          mode: state.mode,
          visualAnchor: state.visualAnchor,
          visualBlockEndOfLine: state.visualBlockEndOfLine,
          viewport: state.viewport,
          undoStack: state.undoStack ? [...state.undoStack] : [],
          redoStack: state.redoStack ? [...state.redoStack] : [],
          pendingKeys: state.pendingKeys,
          blockInsertSession: state.blockInsertSession,
          locationList: state.locationList,
        }
      : pane
  );

  const syncedPanes = syncSharedBufferPanes(
    updatedPanes,
    curIdx,
    state.lines,
    state.undoStack,
    state.redoStack
  );

  return {
    ...state,
    splitPanes: syncedPanes,
  };
}

/**
 * :wincmd {arg} 명령을 실행합니다. (예: :wincmd w, :2wincmd w, :wincmd h/j/k/l/H/J/K/L/r/R/x, :wincmd v/s/n/c/o)
 */
export function executeWincmd(
  state: VimEditorState,
  arg: string,
  count?: number
): VimEditorState {
  const paneCount = state.splitPanes?.length ?? 0;
  switch (arg) {
    case 'w':
      return cyclePaneFocus(state, 1, count);
    case 'W':
      return cyclePaneFocus(state, -1, count);
    case 'h':
    case 'j':
    case 'k':
    case 'l':
      return moveFocusByDirection(state, arg);
    case 't':
      return switchPaneFocus(state, 0);
    case 'b':
      return paneCount > 0 ? switchPaneFocus(state, paneCount - 1) : state;
    case 'p': {
      const fallback = (state.activePaneIndex ?? 0) === 0 ? Math.min(1, paneCount - 1) : 0;
      return switchPaneFocus(state, state.previousPaneIndex ?? fallback);
    }
    case 'c':
    case 'q':
      return closeSplitWindow(state);
    case 'o':
      return closeOtherPanes(state);
    case 's':
      return splitWindow(state, 'horizontal');
    case 'v':
      return splitWindow(state, 'vertical');
    case 'n':
      return splitWindow(state, 'horizontal', [''], '[No Name]');
    case 'x':
      return exchangePanes(state, count);
    case 'r':
      return rotatePanes(state, false);
    case 'R':
      return rotatePanes(state, true);
    case 'H':
    case 'J':
    case 'K':
    case 'L':
      return movePaneToDirection(state, arg);
    case 'T':
      return moveWindowToNewTab(state);
    case '=':
      return resizeSplit(state, '=');
    case '_':
      return resizeSplit(state, '_', 'horizontal');
    case '|':
      return resizeSplit(state, '|', 'vertical');
    case '+':
      return resizeSplit(state, count ?? 5, 'horizontal');
    case '-':
      return resizeSplit(state, -(count ?? 5), 'horizontal');
    case '>':
      return resizeSplit(state, count ?? 5, 'vertical');
    case '<':
      return resizeSplit(state, -(count ?? 5), 'vertical');
    default:
      return state;
  }
}

/**
 * 모든 분할 창에 대해 지정된 Ex 명령어를 일괄 실행합니다 (:windo[!] {cmd}).
 */
export function windo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isBang = false
): VimEditorState {
  const cleanCmd = commandStr.trim();
  if (!cleanCmd) {
    return {
      ...state,
      commandMessage: msg('E471: 인수가 필요합니다'),
      bell: true,
    };
  }

  if (
    !state.splitDirection ||
    state.splitDirection === 'none' ||
    !state.splitPanes ||
    state.splitPanes.length < 2
  ) {
    let currState = executeCmd(state, cleanCmd);
    if (currState.bell) {
      if (!isBang) return currState;
      currState = { ...currState, bell: false };
    }
    return {
      ...currState,
      commandMessage: msg('({count}개 창에 대해 :windo \'{cleanCmd}\' 실행 완료)', {
        count: 1,
        cleanCmd,
      }),
    };
  }

  let currState = syncActivePane(state);
  const origActiveIdx = currState.activePaneIndex ?? 0;
  const origWinId = getPaneWinId(currState.splitPanes, origActiveIdx);
  const targetWinIds = currState.splitPanes!.map((_, idx) =>
    getPaneWinId(currState.splitPanes, idx)
  );

  let executedCount = 0;

  for (const targetWinId of targetWinIds) {
    if (!currState.splitPanes || currState.splitDirection === 'none') {
      break;
    }
    const targetIdx = currState.splitPanes.findIndex(
      (p, idx) => (p.winId ?? 1000 + idx) === targetWinId
    );
    if (targetIdx < 0) continue;

    currState = switchPaneFocus(currState, targetIdx);
    currState = executeCmd(currState, cleanCmd);
    currState = syncActivePane(currState);
    executedCount++;

    if (currState.bell) {
      if (!isBang) {
        return currState;
      }
      currState = { ...currState, bell: false };
    }
  }

  if (currState.splitPanes && currState.splitDirection !== 'none') {
    const restoreIdx = currState.splitPanes.findIndex(
      (p, idx) => (p.winId ?? 1000 + idx) === origWinId
    );
    const safeRestoreIdx =
      restoreIdx >= 0
        ? restoreIdx
        : Math.min(origActiveIdx, currState.splitPanes.length - 1);
    currState = switchPaneFocus(currState, safeRestoreIdx);
  }

  return {
    ...currState,
    commandMessage: msg('({count}개 창에 대해 :windo \'{cleanCmd}\' 실행 완료)', {
      count: executedCount,
      cleanCmd,
    }),
  };
}

/**
 * :syncbind — scrollbind 가 활성화된 다른 모든 분할 창의 상단 행을 현재 창과 맞춥니다.
 */
export function syncScrollbind(state: VimEditorState): VimEditorState {
  const synced = syncActivePane(state);
  if (!synced.splitDirection || synced.splitDirection === 'none' || !synced.splitPanes) {
    return synced;
  }

  const activeIdx = synced.activePaneIndex ?? 0;
  const activeScb =
    synced.splitPanes[activeIdx]?.scrollbind ?? getOptions(synced).scrollbind ?? false;
  if (!activeScb) return synced;

  const activeTop = synced.viewport?.topRow ?? 0;
  let changed = false;

  const nextPanes = synced.splitPanes.map((pane, idx) => {
    if (idx === activeIdx || !pane.scrollbind) return pane;
    const maxTop = Math.max(0, pane.lines.length - 1);
    const nextTop = Math.max(0, Math.min(maxTop, activeTop));
    const vp = pane.viewport ?? { topRow: 0, visibleRows: 15 };
    if (vp.topRow === nextTop) return pane;
    changed = true;
    return {
      ...pane,
      viewport: { ...vp, topRow: nextTop },
    };
  });

  if (!changed) return synced;
  return {
    ...synced,
    splitPanes: nextPanes,
  };
}

/**
 * 키 입력 전후의 뷰포트 topRow 변화량(delta)을 scrollbind 가 켜진 모든 다른 창에 동기화합니다.
 */
export function applyScrollbindDelta(
  prevTopRow: number,
  prevActivePaneIndex: number,
  prevSplitPanes: SplitPaneState[] | undefined,
  state: VimEditorState
): VimEditorState {
  const synced = syncActivePane(state);
  if (
    !prevSplitPanes ||
    !synced.splitPanes ||
    !synced.splitDirection ||
    synced.splitDirection === 'none'
  ) {
    return synced;
  }

  const activeIdx = synced.activePaneIndex ?? 0;
  if (activeIdx !== prevActivePaneIndex) return synced;
  if (prevSplitPanes.length !== synced.splitPanes.length) return synced;

  const activeScb =
    synced.splitPanes[activeIdx]?.scrollbind ?? getOptions(synced).scrollbind ?? false;
  if (!activeScb) return synced;

  const nextTopRow = synced.viewport?.topRow ?? 0;
  const delta = nextTopRow - prevTopRow;
  if (delta === 0) return synced;

  let changed = false;
  const nextPanes = synced.splitPanes.map((pane, idx) => {
    if (idx === activeIdx) return pane;
    if (pane !== prevSplitPanes[idx]) return pane;
    if (!pane.scrollbind) return pane;

    const vp = pane.viewport ?? { topRow: 0, visibleRows: 15 };
    const maxTop = Math.max(0, pane.lines.length - 1);
    const newTop = Math.max(0, Math.min(maxTop, vp.topRow + delta));
    if (newTop === vp.topRow) return pane;
    changed = true;
    return {
      ...pane,
      viewport: { ...vp, topRow: newTop },
    };
  });

  if (!changed) return synced;
  return {
    ...synced,
    splitPanes: nextPanes,
  };
}
