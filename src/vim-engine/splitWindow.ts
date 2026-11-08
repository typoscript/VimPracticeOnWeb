import { SplitPaneState, VimEditorState } from './types';
import { openNewTab } from './tabEngine';
import { msg } from './messages';

/**
 * 에디터 창을 가로(:sp, :new) 또는 세로(:vsp, :vnew)로 분할합니다.
 */
export function splitWindow(
  state: VimEditorState,
  direction: 'horizontal' | 'vertical',
  secondaryLines?: string[],
  secondaryFilename?: string
): VimEditorState {
  if (state.splitDirection && state.splitDirection !== 'none' && state.splitPanes) {
    // 이미 분할된 상태인 경우 분할 방향 전환
    return {
      ...state,
      splitDirection: direction,
      commandMessage:
        direction === 'vertical'
          ? msg('창을 세로로 분할했습니다 (:vsp)')
          : msg('창을 가로로 분할했습니다 (:sp)'),
    };
  }

  const primaryName = state.primaryFilename || 'source.ts';
  const secondaryName = secondaryFilename || state.secondaryFilename || 'target.ts';

  const pane0: SplitPaneState = {
    filename: primaryName,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
    locationList: state.locationList,
  };

  const p1Lines = secondaryLines ?? state.secondaryLines ?? [...state.lines];
  const pane1: SplitPaneState = {
    filename: secondaryName,
    lines: [...p1Lines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    viewport: { topRow: 0, visibleRows: 10 },
    undoStack: [],
    redoStack: [],
  };

  return {
    ...state,
    splitDirection: direction,
    activePaneIndex: 0,
    previousPaneIndex: undefined,
    splitPanes: [pane0, pane1],
    splitRatio: 50,
    primaryFilename: primaryName,
    secondaryFilename: secondaryName,
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
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return {
      ...state,
      commandMessage: msg('E444: 마지막 창을 닫을 수 없습니다 (:close)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;

  if (curIdx === 1) {
    // 보조 창(1) 닫기: 주 창(0)으로 복귀
    const p0 = state.splitPanes[0];
    return {
      ...state,
      lines: [...p0.lines],
      cursor: { ...p0.cursor },
      mode: p0.mode,
      visualAnchor: p0.visualAnchor,
      viewport: p0.viewport,
      undoStack: p0.undoStack ? [...p0.undoStack] : [],
      redoStack: p0.redoStack ? [...p0.redoStack] : [],
      splitDirection: 'none',
      activePaneIndex: 0,
      previousPaneIndex: undefined,
      splitPanes: undefined,
      splitRatio: undefined,
      locationList: p0.locationList,
      commandMessage: msg('분할 창을 닫았습니다 (:close)'),
    };
  }

  // 주 창(0) 닫기: 보조 창(1)이 단일 창으로 승격
  const p1 = state.splitPanes[1];
  return {
    ...state,
    lines: [...p1.lines],
    cursor: { ...p1.cursor },
    mode: p1.mode,
    visualAnchor: p1.visualAnchor,
    viewport: p1.viewport,
    undoStack: p1.undoStack ? [...p1.undoStack] : [],
    redoStack: p1.redoStack ? [...p1.redoStack] : [],
    primaryFilename: p1.filename,
    splitDirection: 'none',
    activePaneIndex: 0,
    previousPaneIndex: undefined,
    splitPanes: undefined,
    splitRatio: undefined,
    locationList: p1.locationList,
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
    splitRatio: undefined,
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
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return state;
  }

  const curIdx = state.activePaneIndex ?? 0;
  if (curIdx === targetPaneIndex) {
    return state;
  }

  // 1. 현재 활성 창의 작업 상태를 splitPanes에 저장
  const currentPane: SplitPaneState = {
    filename:
      curIdx === 0
        ? state.primaryFilename || 'source.ts'
        : state.secondaryFilename || 'target.ts',
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
    locationList: state.locationList,
  };

  const newPanes: [SplitPaneState, SplitPaneState] = [
    state.splitPanes[0],
    state.splitPanes[1],
  ];
  newPanes[curIdx] = currentPane;

  // 2. 대상 창 상태를 최상위 버퍼로 로드
  const targetPane = newPanes[targetPaneIndex];
  return {
    ...state,
    lines: [...targetPane.lines],
    cursor: { ...targetPane.cursor },
    mode: targetPane.mode ?? 'NORMAL',
    visualAnchor: targetPane.visualAnchor,
    viewport: targetPane.viewport,
    undoStack: targetPane.undoStack ? [...targetPane.undoStack] : [],
    redoStack: targetPane.redoStack ? [...targetPane.redoStack] : [],
    pendingKeys: undefined,
    activePaneIndex: targetPaneIndex,
    previousPaneIndex: curIdx,
    splitPanes: newPanes,
    locationList: targetPane.locationList,
  };
}

/**
 * 두 분할 창의 위치와 내용을 서로 맞바꿉니다 (Ctrl+w x).
 */
export function exchangePanes(state: VimEditorState): VimEditorState {
  const synced = syncActivePane(state);
  if (!synced.splitDirection || synced.splitDirection === 'none' || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const p0 = synced.splitPanes[0];
  const p1 = synced.splitPanes[1];

  const swappedPanes: [SplitPaneState, SplitPaneState] = [p1, p0];
  const newActive = swappedPanes[curIdx];

  return {
    ...synced,
    lines: [...newActive.lines],
    cursor: { ...newActive.cursor },
    mode: newActive.mode ?? 'NORMAL',
    visualAnchor: newActive.visualAnchor,
    viewport: newActive.viewport,
    undoStack: newActive.undoStack ? [...newActive.undoStack] : [],
    redoStack: newActive.redoStack ? [...newActive.redoStack] : [],
    primaryFilename: swappedPanes[0].filename,
    secondaryFilename: swappedPanes[1].filename,
    splitPanes: swappedPanes,
    commandMessage: msg('두 창의 위치를 맞바꿨습니다 (Ctrl-w x)'),
  };
}

/**
 * 분할 창을 시계 방향 또는 반시계 방향으로 회전합니다 (Ctrl+w r / Ctrl+w R).
 */
export function rotatePanes(
  state: VimEditorState,
  counterClockwise = false
): VimEditorState {
  const synced = syncActivePane(state);
  if (!synced.splitDirection || synced.splitDirection === 'none' || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const p0 = synced.splitPanes[0];
  const p1 = synced.splitPanes[1];

  const rotatedPanes: [SplitPaneState, SplitPaneState] = [p1, p0];
  const nextActiveIdx = (curIdx + 1) % 2;
  const newActive = rotatedPanes[nextActiveIdx];

  return {
    ...synced,
    lines: [...newActive.lines],
    cursor: { ...newActive.cursor },
    mode: newActive.mode ?? 'NORMAL',
    visualAnchor: newActive.visualAnchor,
    viewport: newActive.viewport,
    undoStack: newActive.undoStack ? [...newActive.undoStack] : [],
    redoStack: newActive.redoStack ? [...newActive.redoStack] : [],
    primaryFilename: rotatedPanes[0].filename,
    secondaryFilename: rotatedPanes[1].filename,
    activePaneIndex: nextActiveIdx,
    splitPanes: rotatedPanes,
    commandMessage: counterClockwise
      ? msg('창을 반시계 방향으로 회전했습니다 (Ctrl-w R)')
      : msg('창을 시계 방향으로 회전했습니다 (Ctrl-w r)'),
  };
}

/**
 * 현재 창을 지정된 방향의 끝으로 이동하고 레이아웃을 전환합니다 (Ctrl+w H / J / K / L).
 * H: 수직 분할로 변경 후 현재 창을 맨 왼쪽(0)으로 이동
 * L: 수직 분할로 변경 후 현재 창을 맨 오른쪽(1)으로 이동
 * K: 수평 분할로 변경 후 현재 창을 맨 위쪽(0)으로 이동
 * J: 수평 분할로 변경 후 현재 창을 맨 아래쪽(1)으로 이동
 */
export function movePaneToDirection(
  state: VimEditorState,
  dir: 'H' | 'J' | 'K' | 'L'
): VimEditorState {
  const synced = syncActivePane(state);
  if (!synced.splitDirection || synced.splitDirection === 'none' || !synced.splitPanes) {
    return synced;
  }

  const curIdx = synced.activePaneIndex ?? 0;
  const isVertical = dir === 'H' || dir === 'L';
  const targetIndex = dir === 'H' || dir === 'K' ? 0 : 1;

  let panes = synced.splitPanes;
  if (curIdx !== targetIndex) {
    panes = [panes[1], panes[0]];
  }

  const activePane = panes[targetIndex];

  return {
    ...synced,
    splitDirection: isVertical ? 'vertical' : 'horizontal',
    activePaneIndex: targetIndex,
    splitPanes: panes,
    primaryFilename: panes[0].filename,
    secondaryFilename: panes[1].filename,
    lines: [...activePane.lines],
    cursor: { ...activePane.cursor },
    mode: activePane.mode ?? 'NORMAL',
    commandMessage: msg('창 레이아웃을 {v}로 재배치했습니다 (Ctrl-w {dir})', { v: isVertical ? msg('세로') : msg('가로'), dir }),
  };
}

/**
 * 분할 창의 크기를 조절합니다 (Ctrl+w =, Ctrl+w +, Ctrl+w -, Ctrl+w >, Ctrl+w <, Ctrl+w _, Ctrl+w |).
 */
export function resizeSplit(
  state: VimEditorState,
  delta: number | '=' | '_' | '|'
): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return state;
  }

  if (delta === '=') {
    return {
      ...state,
      splitRatio: 50,
      commandMessage: msg('창 크기를 균등하게 맞췄습니다 (Ctrl-w =)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;

  if (delta === '_' || delta === '|') {
    const maxRatio = curIdx === 0 ? 80 : 20;
    return {
      ...state,
      splitRatio: maxRatio,
      commandMessage: msg('현재 창을 최대화했습니다'),
    };
  }

  // 숫자 증감
  const currentRatio = state.splitRatio ?? 50;
  // 주 창(0) 기준이면 + 시 ratio 증가, 보조 창(1) 기준이면 + 시 ratio 감소 (창 확대)
  const effectiveDelta = curIdx === 0 ? delta : -delta;
  const newRatio = Math.max(20, Math.min(80, currentRatio + effectiveDelta));

  return {
    ...state,
    splitRatio: newRatio,
    commandMessage: msg('창 크기 조절: {newRatio}% / {v}%', { newRatio, v: 100 - newRatio }),
  };
}

/**
 * 현재 활성 분할 창을 독립된 새 탭 페이지로 떼어냅니다 (Ctrl+w T).
 */
export function moveWindowToNewTab(state: VimEditorState): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return {
      ...state,
      commandMessage: msg('E444: 이미 단일 창입니다 (Ctrl-w T)'),
    };
  }

  const curIdx = state.activePaneIndex ?? 0;
  const activePane = state.splitPanes[curIdx];
  const otherPane = state.splitPanes[curIdx === 0 ? 1 : 0];

  // 1. 현재 탭에서는 나머지 창을 단일 창으로 유지
  const remainingState: VimEditorState = {
    ...state,
    lines: [...otherPane.lines],
    cursor: { ...otherPane.cursor },
    mode: otherPane.mode ?? 'NORMAL',
    visualAnchor: otherPane.visualAnchor,
    viewport: otherPane.viewport,
    undoStack: otherPane.undoStack ? [...otherPane.undoStack] : [],
    redoStack: otherPane.redoStack ? [...otherPane.redoStack] : [],
    primaryFilename: otherPane.filename,
    splitDirection: 'none',
    activePaneIndex: 0,
    previousPaneIndex: undefined,
    splitPanes: undefined,
    splitRatio: undefined,
  };

  // 2. 새 탭을 열고 떼어낸 활성 창 내용 적재
  const stateWithNewTab = openNewTab(remainingState, activePane.filename);

  return {
    ...stateWithNewTab,
    lines: [...activePane.lines],
    cursor: { ...activePane.cursor },
    mode: activePane.mode ?? 'NORMAL',
    visualAnchor: activePane.visualAnchor,
    viewport: activePane.viewport,
    undoStack: activePane.undoStack ? [...activePane.undoStack] : [],
    redoStack: activePane.redoStack ? [...activePane.redoStack] : [],
    commandMessage: msg('"{filename}" 창을 새 탭으로 분리했습니다 (Ctrl-w T)', { filename: activePane.filename }),
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
  const newPanes: [SplitPaneState, SplitPaneState] = [
    state.splitPanes[0],
    state.splitPanes[1],
  ];

  newPanes[curIdx] = {
    ...newPanes[curIdx],
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
    locationList: state.locationList,
  };

  return {
    ...state,
    splitPanes: newPanes,
  };
}
