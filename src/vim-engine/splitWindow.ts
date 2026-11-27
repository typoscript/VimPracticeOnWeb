import { SplitPaneState, VimEditorState } from './types';
import { openNewTab } from './tabEngine';
import { msg } from './messages';
import { getOptions } from './setEngine';
import {
  exchangeLeafInTree,
  getEffectiveWindowTree,
  getPaneWinId,
  moveLeafToEdgeInTree,
  normalizeWindowLayout,
  resizeLeafInTree,
  rotateSiblingsInTree,
} from './windowTree';
import {
  loadPaneIntoTopLevel,
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  moveFocusByDirection,
  cyclePaneFocus,
  syncActivePane,
} from './splitWindowCore';

export {
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  moveFocusByDirection,
  cyclePaneFocus,
  syncActivePane,
};

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
    primaryFilename: newActive.filename,
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
    primaryFilename: newActive.filename,
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
    primaryFilename: activePane.filename,
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

