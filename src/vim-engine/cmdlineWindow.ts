import { CommandLineWindowSession, VimEditorState } from './types';

/**
 * 실행된 명령어 또는 검색어를 히스토리에 기록합니다. (연속된 중복 항목은 방지)
 */
export function addHistory(
  state: VimEditorState,
  text: string,
  type: ':' | '/' | '?'
): VimEditorState {
  const clean = text.trim();
  if (!clean) return state;

  if (type === ':') {
    const history = state.commandHistory ? [...state.commandHistory] : [];
    if (history.length === 0 || history[history.length - 1] !== clean) {
      history.push(clean);
    }
    return {
      ...state,
      commandHistory: history,
      historyIndex: undefined,
      historyDraft: undefined,
    };
  } else {
    const history = state.searchHistory ? [...state.searchHistory] : [];
    if (history.length === 0 || history[history.length - 1] !== clean) {
      history.push(clean);
    }
    return {
      ...state,
      searchHistory: history,
      historyIndex: undefined,
      historyDraft: undefined,
    };
  }
}

/**
 * 커맨드라인(:) 및 검색(/) 입력 중 방향키(↑/↓) 또는 Ctrl+p/Ctrl+n 히스토리 탐색
 * 사용자가 이미 타이핑한 텍스트가 있는 경우, 해당 접두사(prefix)로 시작하는 항목만 필터링하여 순회합니다.
 */
export function navigateHistory(
  state: VimEditorState,
  direction: 'up' | 'down',
  type: ':' | '/' | '?'
): VimEditorState {
  const history =
    type === ':' ? state.commandHistory ?? [] : state.searchHistory ?? [];
  if (history.length === 0) return state;

  // 히스토리 탐색 시작 시 기존 타이핑 중이던 텍스트(Draft) 보존
  const draft =
    state.historyDraft !== undefined
      ? state.historyDraft
      : (state.commandBuffer ?? '');

  // draft 접두사로 시작하는 히스토리 인덱스 추출
  const matchingIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (!draft || history[i].startsWith(draft)) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) return state;

  let currentIdx = state.historyIndex;

  if (direction === 'up') {
    if (currentIdx === undefined) {
      // 가장 최근(맨 끝) 매칭 항목 선택
      currentIdx = matchingIndices[matchingIndices.length - 1];
    } else {
      // 이전(더 오래된) 항목으로 이동
      const pos = matchingIndices.indexOf(currentIdx);
      if (pos > 0) {
        currentIdx = matchingIndices[pos - 1];
      }
    }
    return {
      ...state,
      historyIndex: currentIdx,
      historyDraft: draft,
      commandBuffer: history[currentIdx],
    };
  } else {
    // down (더 최신으로 이동)
    if (currentIdx === undefined) {
      return state;
    }
    const pos = matchingIndices.indexOf(currentIdx);
    if (pos >= 0 && pos < matchingIndices.length - 1) {
      currentIdx = matchingIndices[pos + 1];
      return {
        ...state,
        historyIndex: currentIdx,
        commandBuffer: history[currentIdx],
      };
    } else {
      // 최신 항목을 넘어가면 원래 타이핑 중이던 draft 복구
      return {
        ...state,
        historyIndex: undefined,
        commandBuffer: draft,
      };
    }
  }
}

/**
 * 순정 Vim 커맨드라인 윈도우(q:, q/, q?, Ctrl-f)를 엽니다.
 */
export function openCommandLineWindow(
  state: VimEditorState,
  type: ':' | '/' | '?',
  initialDraft?: string
): VimEditorState {
  const history =
    type === ':' ? state.commandHistory ?? [] : state.searchHistory ?? [];
  const lines = history.length > 0 ? [...history] : [''];

  if (initialDraft && initialDraft.trim().length > 0) {
    if (lines[lines.length - 1] !== initialDraft) {
      lines.push(initialDraft);
    }
  } else if (lines.length === 0 || lines[lines.length - 1] !== '') {
    lines.push('');
  }

  const lastLineIdx = lines.length - 1;
  const lastLineLen = lines[lastLineIdx].length;

  const session: CommandLineWindowSession = {
    type,
    lines,
    cursor: { line: lastLineIdx, col: lastLineLen },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };

  return {
    ...state,
    mode: 'NORMAL',
    commandBuffer: undefined,
    commandType: undefined,
    cmdlineWindow: session,
    commandMessage: `[커맨드라인 윈도우 ${type}] Enter: 실행, Esc: 취소`,
  };
}

/**
 * 커맨드라인 윈도우를 닫고 원래 에디터 화면으로 복귀합니다.
 */
export function closeCommandLineWindow(state: VimEditorState): VimEditorState {
  if (!state.cmdlineWindow) return state;
  return {
    ...state,
    cmdlineWindow: null,
    commandMessage: '커맨드라인 윈도우 닫힘',
  };
}

/**
 * 커맨드라인 윈도우의 현재 줄(Cursor) 내용을 실행합니다.
 */
export function executeCommandLineWindow(
  state: VimEditorState,
  executeEx: (s: VimEditorState, cmd: string) => VimEditorState,
  executeSearch: (s: VimEditorState, query: string) => VimEditorState
): VimEditorState {
  if (!state.cmdlineWindow) return state;

  const { type, lines, cursor } = state.cmdlineWindow;
  const currentLine = (lines[cursor.line] ?? '').trim();

  // 1. 커맨드라인 윈도우 닫기
  let nextState: VimEditorState = {
    ...state,
    cmdlineWindow: null,
  };

  // 2. 히스토리에 기록
  if (currentLine) {
    nextState = addHistory(nextState, currentLine, type);
  } else {
    return nextState;
  }

  // 3. 커맨드 또는 검색 실행
  if (type === ':') {
    return executeEx(nextState, currentLine);
  } else {
    return executeSearch(nextState, currentLine);
  }
}

/**
 * 커맨드라인 윈도우가 열려 있을 때의 키 입력을 처리합니다.
 */
export function handleCommandLineWindowKey(
  state: VimEditorState,
  key: string,
  rawKeyHandler: (s: VimEditorState, k: string) => VimEditorState,
  executeEx: (s: VimEditorState, cmd: string) => VimEditorState,
  executeSearch: (s: VimEditorState, query: string) => VimEditorState
): VimEditorState {
  const session = state.cmdlineWindow;
  if (!session) return state;

  // 1. Enter: 현재 커서 줄의 명령어 실행
  if (key === 'Enter') {
    return executeCommandLineWindow(state, executeEx, executeSearch);
  }

  // 2. NORMAL 모드에서 Escape 또는 Ctrl-c: 창 닫기 및 취소
  if (
    session.mode === 'NORMAL' &&
    (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c')
  ) {
    return closeCommandLineWindow(state);
  }

  // 3. 미니 VimEditorState를 구성하여 일반 Vim 키스트로크 실행 위임
  const miniState: VimEditorState = {
    lines: [...session.lines],
    cursor: { ...session.cursor },
    mode: session.mode,
    visualAnchor: session.visualAnchor ? { ...session.visualAnchor } : undefined,
    pendingKeys: session.pendingKeys,
    undoStack: session.undoStack ? [...session.undoStack] : [],
    redoStack: session.redoStack ? [...session.redoStack] : [],
    registers: state.registers,
    clipboard: state.clipboard,
  };

  const nextMiniState = rawKeyHandler(miniState, key);

  // 미니 상태에서 :q 실행 등으로 창 닫기 요청이 발생한 경우
  if (nextMiniState.commandBuffer === 'q' && key === 'Enter') {
    return closeCommandLineWindow(state);
  }

  const updatedSession: CommandLineWindowSession = {
    ...session,
    lines: nextMiniState.lines,
    cursor: nextMiniState.cursor,
    mode: nextMiniState.mode,
    visualAnchor: nextMiniState.visualAnchor,
    pendingKeys: nextMiniState.pendingKeys,
    undoStack: nextMiniState.undoStack,
    redoStack: nextMiniState.redoStack,
  };

  return {
    ...state,
    registers: nextMiniState.registers,
    clipboard: nextMiniState.clipboard,
    cmdlineWindow: updatedSession,
  };
}
