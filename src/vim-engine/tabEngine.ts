import { VimEditorState, VimTabPage, SplitPaneState, VimMode, CursorPosition } from './types';
import { cloneWindowTree } from './windowTree';
import { clampCursor } from './cursor';
import { syncCurrentBuffer } from './bufferEngine';
import { msg } from './messages';

function clonePanes(panes: SplitPaneState[] | undefined): SplitPaneState[] | undefined {
  return panes
    ? panes.map((pane) => ({
        ...pane,
        lines: [...pane.lines],
        // 저장 당시 INSERT 였을 수 있으므로 복원 시 NORMAL 범위로 맞춤
        cursor: clampCursor(pane.lines, pane.cursor, 'NORMAL'),
      }))
    : undefined;
}

/**
 * 탭 전환 후 모드: Vim 의 모드는 탭에 속하지 않으므로 저장된 탭 모드를 되살리지 않습니다.
 * 입력 중(INSERT)에 탭을 바꾼 경우만 INSERT 를 유지하고, 그 밖에는 NORMAL 입니다.
 */
function modeAfterTabSwitch(current: VimMode): VimMode {
  return current === 'INSERT' ? 'INSERT' : 'NORMAL';
}

function restoredTabCursor(lines: string[], cursor: CursorPosition, mode: VimMode): CursorPosition {
  return clampCursor(lines, cursor, mode);
}

/**
 * 탭 페이지 목록이 초기화되어 있지 않은 경우, 현재 작업 화면을 기반으로 1번 탭을 생성합니다.
 */
export function ensureTabPages(state: VimEditorState): VimEditorState {
  if (state.tabPages && state.tabPages.length > 0 && state.currentTabId !== undefined) {
    return state;
  }

  const initialFilename = state.primaryFilename || 'source.ts';
  const initialMode =
    state.mode === 'COMMAND' || state.mode === 'SEARCH' ? 'NORMAL' : state.mode;
  const initialTab: VimTabPage = {
    id: 1,
    filename: initialFilename,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: initialMode,
    visualAnchor: state.visualAnchor ? { ...state.visualAnchor } : undefined,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    splitDirection: state.splitDirection,
    activePaneIndex: state.activePaneIndex,
    splitPanes: clonePanes(state.splitPanes),
    windowLayout: state.windowLayout ? cloneWindowTree(state.windowLayout) : undefined,
    splitRatio: state.splitRatio,
    primaryFilename: state.primaryFilename,
    secondaryFilename: state.secondaryFilename,
    currentBufferId: state.currentBufferId,
    alternateBufferId: state.alternateBufferId,
    cwd: state.globalCwd && state.globalCwd !== state.cwd ? state.cwd : undefined,
  };

  return {
    ...state,
    tabPages: [initialTab],
    currentTabId: 1,
  };
}

/**
 * 현재 활성 탭 페이지의 변경 상태(lines, cursor, splitPanes 등)를 탭 저장소에 동기화합니다.
 */
export function syncCurrentTab(state: VimEditorState): VimEditorState {
  const s = ensureTabPages(state);
  const curId = s.currentTabId ?? 1;

  const syncMode =
    s.mode === 'COMMAND' || s.mode === 'SEARCH' ? 'NORMAL' : s.mode;

  const nextTabPages = s.tabPages!.map((tab) => {
    if (tab.id === curId) {
      return {
        ...tab,
        filename: s.primaryFilename || tab.filename || 'source.ts',
        lines: [...s.lines],
        cursor: { ...s.cursor },
        mode: syncMode,
        visualAnchor: s.visualAnchor ? { ...s.visualAnchor } : undefined,
        undoStack: s.undoStack ? [...s.undoStack] : [],
        redoStack: s.redoStack ? [...s.redoStack] : [],
        splitDirection: s.splitDirection,
        activePaneIndex: s.activePaneIndex,
        splitPanes: clonePanes(s.splitPanes),
        windowLayout: s.windowLayout ? cloneWindowTree(s.windowLayout) : undefined,
        splitRatio: s.splitRatio,
        primaryFilename: s.primaryFilename,
        secondaryFilename: s.secondaryFilename,
        currentBufferId: s.currentBufferId,
        alternateBufferId: s.alternateBufferId,
      };
    }
    return tab;
  });

  return {
    ...s,
    tabPages: nextTabPages,
  };
}

/**
 * 지정된 탭 페이지(ID 기준)로 화면을 전환합니다.
 */
export function switchTab(state: VimEditorState, targetId: number): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  const targetTab = tabPages.find((t) => t.id === targetId);

  if (!targetTab) {
    return {
      ...syncedState,
      commandMessage: msg('E94: 일치하는 탭을 찾을 수 없습니다: {targetId}', { targetId }),
    };
  }

  if (targetTab.id === syncedState.currentTabId) {
    return syncedState;
  }

  const targetPane =
    targetTab.splitPanes && targetTab.splitDirection && targetTab.splitDirection !== 'none'
      ? targetTab.splitPanes[targetTab.activePaneIndex ?? 0]
      : undefined;
  const restoredCwd = targetPane?.cwd ?? targetTab.cwd ?? syncedState.globalCwd ?? syncedState.cwd;
  const nextUsesLocalArgs = targetPane ? targetPane.localArgList !== undefined : false;
  const restoredArgList =
    targetPane && targetPane.localArgList !== undefined
      ? targetPane.localArgList
      : (syncedState.globalArgList !== undefined ? syncedState.globalArgList : syncedState.argList);

  return {
    ...syncedState,
    lines: [...targetTab.lines],
    cursor: restoredTabCursor(targetTab.lines, targetTab.cursor, modeAfterTabSwitch(state.mode)),
    mode: modeAfterTabSwitch(state.mode),
    visualAnchor: undefined,
    undoStack: targetTab.undoStack ? [...targetTab.undoStack] : [],
    redoStack: targetTab.redoStack ? [...targetTab.redoStack] : [],
    splitDirection: targetTab.splitDirection,
    activePaneIndex: targetTab.activePaneIndex,
    splitPanes: clonePanes(targetTab.splitPanes),
    windowLayout: targetTab.windowLayout ? cloneWindowTree(targetTab.windowLayout) : undefined,
    splitRatio: targetTab.splitRatio,
    primaryFilename: targetTab.primaryFilename ?? targetTab.filename,
    secondaryFilename: targetTab.secondaryFilename,
    currentBufferId: targetTab.currentBufferId,
    alternateBufferId: targetTab.alternateBufferId,
    currentTabId: targetTab.id,
    cwd: restoredCwd,
    windowCwd: undefined,
    argList: restoredArgList,
    usesLocalArgList: nextUsesLocalArgs,
    commandMessage: msg('탭 {id}: {filename}', { id: targetTab.id, filename: targetTab.filename }),
  };
}

/**
 * 새 탭 페이지를 열어 전환합니다 (:tabnew, :tabedit, :tabe [filename]).
 */
export function openNewTab(state: VimEditorState, filename?: string): VimEditorState {
  // 버퍼 목록을 먼저 만들어 두어야 현재 탭 스냅샷에 버퍼 번호가 함께 저장됩니다
  const syncedState = syncCurrentTab(syncCurrentBuffer(state));
  const tabPages = syncedState.tabPages!;
  const curId = syncedState.currentTabId ?? 1;
  const curIdx = tabPages.findIndex((t) => t.id === curId);
  const insertIdx = curIdx >= 0 ? curIdx + 1 : tabPages.length;

  const nextId =
    tabPages.length > 0 ? Math.max(...tabPages.map((t) => t.id)) + 1 : 1;

  let tabLines = [''];
  let tabName = filename ? filename.trim() : '[No Name]';

  // 현재 버퍼 내용을 버퍼 목록에 저장한 뒤, 새 탭이 표시할 버퍼를 정합니다
  // (Vim :tabnew 처럼 기존 파일이면 그 버퍼를, 아니면 새 빈 버퍼를 만들어 currentBufferId 와 화면을 일치시킴)
  const withBuffers = syncedState;
  const buffers = withBuffers.buffers ?? [];
  const existingBuf = filename
    ? buffers.find((b) => b.name === tabName || b.name.includes(tabName))
    : undefined;
  let tabBufferId: number;
  let nextBuffers = buffers;
  if (existingBuf) {
    tabLines = [...existingBuf.lines];
    tabName = existingBuf.name;
    tabBufferId = existingBuf.id;
  } else {
    tabBufferId = buffers.reduce((max, b) => Math.max(max, b.id), 0) + 1;
    nextBuffers = [
      ...buffers,
      { id: tabBufferId, name: tabName, lines: [...tabLines], cursor: { line: 0, col: 0 }, undoStack: [], redoStack: [], isModified: false },
    ];
  }
  const prevBufferId = withBuffers.currentBufferId;

  const newTab: VimTabPage = {
    id: nextId,
    filename: tabName,
    lines: tabLines,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    primaryFilename: tabName,
    currentBufferId: tabBufferId,
    alternateBufferId: prevBufferId,
  };

  const nextTabPages = [...tabPages];
  nextTabPages.splice(insertIdx, 0, newTab);

  return {
    ...syncedState,
    buffers: nextBuffers,
    currentBufferId: tabBufferId,
    alternateBufferId: prevBufferId,
    tabPages: nextTabPages,
    currentTabId: nextId,
    lines: [...newTab.lines],
    cursor: { ...newTab.cursor },
    mode: 'NORMAL',
    visualAnchor: undefined,
    undoStack: [],
    redoStack: [],
    splitDirection: 'none',
    activePaneIndex: 0,
    splitPanes: undefined,
    windowLayout: undefined,
    splitRatio: undefined,
    primaryFilename: tabName,
    secondaryFilename: undefined,
    cwd: syncedState.globalCwd ?? syncedState.cwd,
    windowCwd: undefined,
    argList: syncedState.globalArgList !== undefined ? syncedState.globalArgList : syncedState.argList,
    usesLocalArgList: false,
    commandMessage: msg('"{tabName}" [새 탭 {nextId}]', { tabName, nextId }),
  };
}

/**
 * 현재 탭(또는 지정된 번호 탭)을 닫습니다 (:tabclose, :tabc [count]).
 * 순정 Vim 스펙: 마지막 1개 남은 탭은 닫을 수 없습니다 (E784).
 */
export function closeTab(state: VimEditorState, targetIdx?: number): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;

  if (tabPages.length <= 1) {
    return {
      ...syncedState,
      commandMessage: msg('E784: 마지막 탭 페이지를 닫을 수 없습니다'),
    };
  }

  const curId = syncedState.currentTabId ?? 1;
  let closeIndex: number;

  if (targetIdx !== undefined && targetIdx > 0 && targetIdx <= tabPages.length) {
    closeIndex = targetIdx - 1;
  } else {
    closeIndex = tabPages.findIndex((t) => t.id === curId);
    if (closeIndex < 0) closeIndex = 0;
  }

  const closingTab = tabPages[closeIndex];
  const isClosingCurrent = closingTab.id === curId;
  const nextTabPages = tabPages.filter((_, idx) => idx !== closeIndex);

  if (!isClosingCurrent) {
    return {
      ...syncedState,
      tabPages: nextTabPages,
      commandMessage: msg('탭 {id} 닫힘', { id: closingTab.id }),
    };
  }

  // 닫은 탭이 현재 활성 탭이었던 경우, 같은 인덱스(또는 이전 인덱스)의 탭으로 전환
  const fallbackIndex = Math.min(closeIndex, nextTabPages.length - 1);
  const fallbackTab = nextTabPages[fallbackIndex];

  return {
    ...syncedState,
    tabPages: nextTabPages,
    currentTabId: fallbackTab.id,
    lines: [...fallbackTab.lines],
    cursor: restoredTabCursor(fallbackTab.lines, fallbackTab.cursor, modeAfterTabSwitch(state.mode)),
    mode: modeAfterTabSwitch(state.mode),
    visualAnchor: undefined,
    undoStack: fallbackTab.undoStack ? [...fallbackTab.undoStack] : [],
    redoStack: fallbackTab.redoStack ? [...fallbackTab.redoStack] : [],
    splitDirection: fallbackTab.splitDirection,
    activePaneIndex: fallbackTab.activePaneIndex,
    splitPanes: clonePanes(fallbackTab.splitPanes),
    windowLayout: fallbackTab.windowLayout ? cloneWindowTree(fallbackTab.windowLayout) : undefined,
    splitRatio: fallbackTab.splitRatio,
    primaryFilename: fallbackTab.primaryFilename ?? fallbackTab.filename,
    secondaryFilename: fallbackTab.secondaryFilename,
    currentBufferId: fallbackTab.currentBufferId,
    alternateBufferId: fallbackTab.alternateBufferId,
    cwd: fallbackTab.cwd ?? syncedState.globalCwd ?? syncedState.cwd,
    commandMessage: msg('탭 {id} 닫힘 -> 탭 {id2}: {filename}', { id: closingTab.id, id2: fallbackTab.id, filename: fallbackTab.filename }),
  };
}

/**
 * 현재 활성 탭을 제외한 나머지 모든 탭을 닫습니다 (:tabonly, :tabo).
 */
export function closeOtherTabs(state: VimEditorState): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const curId = syncedState.currentTabId ?? 1;
  const curTab = syncedState.tabPages!.find((t) => t.id === curId);

  if (!curTab) return syncedState;

  return {
    ...syncedState,
    tabPages: [curTab],
    commandMessage: msg('현재 탭만 유지됨'),
  };
}

/**
 * 다음 탭 페이지로 전환합니다 (gt, [count]gt, :tabnext [count], :tabn [count]).
 * count가 주어지면 1-based 순서에 해당하는 탭으로 직접 이동합니다 (예: 2gt -> 2번째 탭).
 */
export function nextTab(state: VimEditorState, count?: number): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  if (tabPages.length <= 1) return syncedState;

  if (count !== undefined && count > 0) {
    const targetIdx = Math.max(0, Math.min(count - 1, tabPages.length - 1));
    return switchTab(syncedState, tabPages[targetIdx].id);
  }

  const curId = syncedState.currentTabId ?? 1;
  const curIdx = tabPages.findIndex((t) => t.id === curId);
  const safeIdx = curIdx >= 0 ? curIdx : 0;
  const nextIdx = (safeIdx + 1) % tabPages.length;

  return switchTab(syncedState, tabPages[nextIdx].id);
}

/**
 * 이전 탭 페이지로 전환합니다 (gT, [count]gT, :tabprevious, :tabp, :tabprev).
 */
export function prevTab(state: VimEditorState, count = 1): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  if (tabPages.length <= 1) return syncedState;

  const curId = syncedState.currentTabId ?? 1;
  const curIdx = tabPages.findIndex((t) => t.id === curId);
  const safeIdx = curIdx >= 0 ? curIdx : 0;
  const step = Math.max(1, count) % tabPages.length;
  const prevIdx = (safeIdx - step + tabPages.length) % tabPages.length;

  return switchTab(syncedState, tabPages[prevIdx].id);
}

/**
 * 첫 번째 탭 페이지로 점프합니다 (:tabfirst, :tabfir, :tabr, :tabrewind).
 */
export function firstTab(state: VimEditorState): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  if (tabPages.length === 0) return syncedState;
  return switchTab(syncedState, tabPages[0].id);
}

/**
 * 마지막 탭 페이지로 점프합니다 (:tablast, :tabl).
 */
export function lastTab(state: VimEditorState): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  if (tabPages.length === 0) return syncedState;
  return switchTab(syncedState, tabPages[tabPages.length - 1].id);
}

/**
 * 현재 탭 페이지의 위치를 이동합니다 (:tabmove [N], :tabm [N]).
 * :tabm 0 -> 맨 앞으로 이동
 * :tabm 또는 :tabm $ -> 맨 뒤로 이동
 * :tabm +1 / :tabm -1 -> 상대 이동
 */
export function moveTab(state: VimEditorState, targetPos?: string | number): VimEditorState {
  const syncedState = syncCurrentTab(state);
  const tabPages = syncedState.tabPages!;
  if (tabPages.length <= 1) return syncedState;

  const curId = syncedState.currentTabId ?? 1;
  const curIdx = tabPages.findIndex((t) => t.id === curId);
  if (curIdx < 0) return syncedState;

  let destIdx = tabPages.length - 1;

  if (targetPos === undefined || targetPos === '$' || targetPos === '') {
    destIdx = tabPages.length - 1;
  } else if (typeof targetPos === 'string' && targetPos.startsWith('+')) {
    const offset = parseInt(targetPos.slice(1), 10) || 1;
    destIdx = Math.min(tabPages.length - 1, curIdx + offset);
  } else if (typeof targetPos === 'string' && targetPos.startsWith('-')) {
    const offset = parseInt(targetPos.slice(1), 10) || 1;
    destIdx = Math.max(0, curIdx - offset);
  } else {
    const num = typeof targetPos === 'number' ? targetPos : parseInt(String(targetPos), 10);
    if (!isNaN(num)) {
      destIdx = Math.max(0, Math.min(num, tabPages.length - 1));
    }
  }

  const nextTabPages = [...tabPages];
  const [removed] = nextTabPages.splice(curIdx, 1);
  nextTabPages.splice(destIdx, 0, removed);

  return {
    ...syncedState,
    tabPages: nextTabPages,
    commandMessage: msg('탭 {id}을(를) {v}번째 위치로 이동', { id: removed.id, v: destIdx + 1 }),
  };
}

/**
 * 모든 탭 페이지에 대해 지정된 Ex 명령어를 일괄 실행합니다 (:tabdo[!] {cmd}).
 */
export function tabdo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isBang = false
): VimEditorState {
  const cleanCmd = commandStr.trim();
  if (!cleanCmd) {
    return {
      ...state,
      commandMessage: 'E471: Argument required',
      bell: true,
    };
  }

  const s = ensureTabPages(state);
  const tabs = s.tabPages && s.tabPages.length > 0 ? s.tabPages : [];
  if (tabs.length === 0) {
    return executeCmd(state, cleanCmd);
  }

  let currState = s;
  let executedCount = 0;

  for (const t of tabs) {
    currState = switchTab(currState, t.id);
    currState = executeCmd(currState, cleanCmd);
    currState = syncCurrentTab(currState);
    executedCount++;

    if (currState.bell) {
      if (!isBang) {
        break;
      } else {
        currState = { ...currState, bell: false };
      }
    }
  }

  return {
    ...currState,
    commandMessage: msg('({count}개 탭에 대해 :tabdo \'{cleanCmd}\' 실행 완료)', { count: executedCount, cleanCmd }),
  };
}
