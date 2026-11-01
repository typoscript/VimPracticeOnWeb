import { SplitPaneState, VimEditorState } from '../types/vim';

/**
 * 에디터 창을 가로(:sp) 또는 세로(:vsp)로 분할합니다.
 */
export function splitWindow(
  state: VimEditorState,
  direction: 'horizontal' | 'vertical',
  secondaryLines?: string[],
  secondaryFilename?: string
): VimEditorState {
  if (state.splitDirection && state.splitDirection !== 'none' && state.splitPanes) {
    // 이미 분할된 상태인 경우 분할 방향만 전환
    return {
      ...state,
      splitDirection: direction,
      commandMessage: direction === 'vertical' ? '창을 세로로 분할했습니다 (:vsp)' : '창을 가로로 분할했습니다 (:sp)',
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
    splitPanes: [pane0, pane1],
    primaryFilename: primaryName,
    secondaryFilename: secondaryName,
    commandMessage: direction === 'vertical' ? '창을 세로로 분할했습니다 (:vsp)' : '창을 가로로 분할했습니다 (:sp)',
  };
}

/**
 * 현재 활성화된 분할 창을 닫습니다 (:q 또는 Ctrl+w c).
 */
export function closeSplitWindow(state: VimEditorState): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return {
      ...state,
      commandMessage: '단일 창 상태입니다 (:q)',
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
      splitPanes: undefined,
      commandMessage: '분할 창을 닫았습니다 (:q)',
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
    splitPanes: undefined,
    commandMessage: '분할 창을 닫았습니다 (:q)',
  };
}

/**
 * 분할된 창 간에 포커스를 전환합니다 (Ctrl+w h/j/k/l/w).
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
    filename: curIdx === 0 ? (state.primaryFilename || 'source.ts') : (state.secondaryFilename || 'target.ts'),
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
  };

  const newPanes: [SplitPaneState, SplitPaneState] = [state.splitPanes[0], state.splitPanes[1]];
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
    splitPanes: newPanes,
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
  const newPanes: [SplitPaneState, SplitPaneState] = [state.splitPanes[0], state.splitPanes[1]];

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
  };

  return {
    ...state,
    splitPanes: newPanes,
  };
}
