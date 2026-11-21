import { SplitPaneState, SplitPlacement, VimEditorState, WindowLayoutNode } from './types';
import { msg } from './messages';
import { getGlobalOptions, getOptions } from './setEngine';
import {
  allocateNextWinId,
  findNeighborPane,
  getEffectiveWindowTree,
  normalizeWindowLayout,
  removeLeafFromTree,
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

export function loadPaneIntoTopLevel(
  state: VimEditorState,
  pane: SplitPaneState
): Partial<VimEditorState> {
  const activeTabCwd = state.tabPages?.find((t) => t.id === (state.currentTabId ?? 1))?.cwd;
  const nextCwd = pane.cwd ?? activeTabCwd ?? state.globalCwd ?? state.cwd;
  const nextUsesLocalArgs = pane.localArgList !== undefined;
  const nextArgList = nextUsesLocalArgs
    ? pane.localArgList
    : (state.globalArgList !== undefined ? state.globalArgList : state.argList);
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
    ...(nextCwd !== undefined ? { cwd: nextCwd } : {}),
    windowCwd: pane.cwd,
    argList: nextArgList,
    usesLocalArgList: nextUsesLocalArgs,
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
      cwd: curPane.cwd,
      localArgList: curPane.localArgList
        ? { files: [...curPane.localArgList.files], currentIndex: curPane.localArgList.currentIndex }
        : curPane.localArgList,
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
    cwd: state.windowCwd,
    localArgList: state.usesLocalArgList
      ? (state.argList ? { files: [...state.argList.files], currentIndex: state.argList.currentIndex } : null)
      : undefined,
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
    cwd: state.windowCwd,
    localArgList: state.usesLocalArgList
      ? (state.argList ? { files: [...state.argList.files], currentIndex: state.argList.currentIndex } : null)
      : undefined,
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
    windowCwd: activePane.cwd,
    usesLocalArgList: activePane.localArgList !== undefined,
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

