import { SplitPaneState, VimEditorState } from './types';
import { openNewTab } from './tabEngine';
import { msg } from './messages';
import { getGlobalOptions, getOptions } from './setEngine';

function withPaneScrollbindOption(
  state: VimEditorState,
  scrollbind: boolean | undefined
): VimEditorState['options'] {
  if (scrollbind === undefined && !state.options) return state.options;
  const base = state.options ?? getOptions(state);
  return { ...base, scrollbind: scrollbind ?? base.scrollbind ?? false };
}

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

  const curScb = getOptions(state).scrollbind ?? false;
  const newWinScb = secondaryLines ? (getGlobalOptions(state).scrollbind ?? false) : curScb;

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
    scrollbind: curScb,
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
    scrollbind: newWinScb,
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
      options: withPaneScrollbindOption(state, p0.scrollbind),
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
    options: withPaneScrollbindOption(state, p1.scrollbind),
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
    scrollbind: state.splitPanes[curIdx]?.scrollbind ?? getOptions(state).scrollbind ?? false,
    diff: state.splitPanes[curIdx]?.diff,
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
    options: withPaneScrollbindOption(state, targetPane.scrollbind),
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
    previousPaneIndex:
      synced.previousPaneIndex !== undefined ? 1 - synced.previousPaneIndex : undefined,
    splitPanes: swappedPanes,
    locationList: newActive.locationList,
    options: withPaneScrollbindOption(synced, newActive.scrollbind),
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
    previousPaneIndex:
      synced.previousPaneIndex !== undefined ? 1 - synced.previousPaneIndex : undefined,
    splitPanes: rotatedPanes,
    locationList: newActive.locationList,
    options: withPaneScrollbindOption(synced, newActive.scrollbind),
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
  const prevIdx =
    synced.previousPaneIndex !== undefined
      ? curIdx !== targetIndex
        ? 1 - synced.previousPaneIndex
        : synced.previousPaneIndex
      : undefined;

  return {
    ...synced,
    splitDirection: isVertical ? 'vertical' : 'horizontal',
    activePaneIndex: targetIndex,
    previousPaneIndex: prevIdx,
    splitPanes: panes,
    primaryFilename: panes[0].filename,
    secondaryFilename: panes[1].filename,
    lines: [...activePane.lines],
    cursor: { ...activePane.cursor },
    mode: activePane.mode ?? 'NORMAL',
    visualAnchor: activePane.visualAnchor,
    viewport: activePane.viewport,
    undoStack: activePane.undoStack ? [...activePane.undoStack] : [],
    redoStack: activePane.redoStack ? [...activePane.redoStack] : [],
    locationList: activePane.locationList,
    options: withPaneScrollbindOption(synced, activePane.scrollbind),
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

/**
 * :wincmd {arg} 명령을 실행합니다. (예: :wincmd w, :1wincmd w, :wincmd H/J/K/L/r/R/x, :wincmd v/s/c/o)
 */
export function executeWincmd(state: VimEditorState, arg: string, count?: number): VimEditorState {
  if (count !== undefined && count >= 1 && (arg === 'w' || arg === 'W')) {
    return switchPaneFocus(state, Math.min(1, count - 1));
  }
  switch (arg) {
    case 'w':
    case 'W':
      return switchPaneFocus(state, (state.activePaneIndex ?? 0) === 0 ? 1 : 0);
    case 'h':
    case 'k':
    case 't':
      return switchPaneFocus(state, 0);
    case 'l':
    case 'j':
    case 'b':
      return switchPaneFocus(state, 1);
    case 'p':
      return switchPaneFocus(state, state.previousPaneIndex ?? 0);
    case 'c':
    case 'q':
      return closeSplitWindow(state);
    case 'o':
      return closeOtherPanes(state);
    case 's':
      return splitWindow(state, 'horizontal');
    case 'v':
      return splitWindow(state, 'vertical');
    case 'x':
      return exchangePanes(state);
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
    case '|':
      return resizeSplit(state, arg);
    case '+':
    case '>':
      return resizeSplit(state, count ?? 5);
    case '-':
    case '<':
      return resizeSplit(state, -(count ?? 5));
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

  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    let currState = executeCmd(state, cleanCmd);
    if (currState.bell) {
      if (!isBang) return currState;
      currState = { ...currState, bell: false };
    }
    return {
      ...currState,
      commandMessage: msg('({count}개 창에 대해 :windo \'{cleanCmd}\' 실행 완료)', { count: 1, cleanCmd }),
    };
  }

  let currState = syncActivePane(state);
  const origActiveIdx = currState.activePaneIndex ?? 0;
  let executedCount = 0;

  for (let i = 0; i < 2; i++) {
    if (!currState.splitPanes || currState.splitDirection === 'none') {
      break;
    }
    currState = switchPaneFocus(currState, i);
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
    currState = switchPaneFocus(currState, origActiveIdx);
  }

  return {
    ...currState,
    commandMessage: msg('({count}개 창에 대해 :windo \'{cleanCmd}\' 실행 완료)', { count: executedCount, cleanCmd }),
  };
}

/**
 * :syncbind — scrollbind 가 활성화된 다른 분할 창의 상단 행을 현재 창과 맞춥니다.
 */
export function syncScrollbind(state: VimEditorState): VimEditorState {
  const synced = syncActivePane(state);
  if (!synced.splitDirection || synced.splitDirection === 'none' || !synced.splitPanes) {
    return synced;
  }

  const activeIdx = synced.activePaneIndex ?? 0;
  const activeScb = synced.splitPanes[activeIdx]?.scrollbind ?? getOptions(synced).scrollbind ?? false;
  if (!activeScb) return synced;

  const activeTop = synced.viewport?.topRow ?? 0;
  const otherIdx = activeIdx === 0 ? 1 : 0;
  const otherPane = synced.splitPanes[otherIdx];
  if (!otherPane?.scrollbind) return synced;

  const maxOtherTop = Math.max(0, otherPane.lines.length - 1);
  const nextOtherTop = Math.max(0, Math.min(maxOtherTop, activeTop));
  const otherVp = otherPane.viewport ?? { topRow: 0, visibleRows: 15 };
  if (otherVp.topRow === nextOtherTop) return synced;

  const nextPanes: [SplitPaneState, SplitPaneState] = [synced.splitPanes[0], synced.splitPanes[1]];
  nextPanes[otherIdx] = {
    ...otherPane,
    viewport: { ...otherVp, topRow: nextOtherTop },
  };
  return {
    ...synced,
    splitPanes: nextPanes,
  };
}

/**
 * 키 입력 전후의 뷰포트 topRow 변화량(delta)을 scrollbind 가 켜진 상대 창에 동기화합니다.
 */
export function applyScrollbindDelta(
  prevTopRow: number,
  prevActivePaneIndex: number,
  prevSplitPanes: [SplitPaneState, SplitPaneState] | undefined,
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

  const otherIdx = activeIdx === 0 ? 1 : 0;
  if (synced.splitPanes[otherIdx] !== prevSplitPanes[otherIdx]) return synced;

  const activeScb = synced.splitPanes[activeIdx]?.scrollbind ?? getOptions(synced).scrollbind ?? false;
  const otherPane = synced.splitPanes[otherIdx];
  if (!activeScb || !otherPane?.scrollbind) return synced;

  const nextTopRow = synced.viewport?.topRow ?? 0;
  const delta = nextTopRow - prevTopRow;
  if (delta === 0) return synced;

  const otherVp = otherPane.viewport ?? { topRow: 0, visibleRows: 15 };
  const maxOtherTop = Math.max(0, otherPane.lines.length - 1);
  const newOtherTop = Math.max(0, Math.min(maxOtherTop, otherVp.topRow + delta));
  if (newOtherTop === otherVp.topRow) return synced;

  const nextPanes: [SplitPaneState, SplitPaneState] = [synced.splitPanes[0], synced.splitPanes[1]];
  nextPanes[otherIdx] = {
    ...otherPane,
    viewport: { ...otherVp, topRow: newOtherTop },
  };
  return {
    ...synced,
    splitPanes: nextPanes,
  };
}
