import { getVimEngineConfig } from './config';
import { VimEditorState } from './types';
import { deepFreeze, assertValidVimState } from './invariants';
import { executeCommandLine, handleConfirmSubstituteKey } from './commandLine';
import { triggerAutocmd } from './autocmdEngine';
import { handleCommandLineWindowKey } from './cmdlineWindow';
import { handleNetrwKey } from './netrwEngine';
import { handleFuzzyFinderKey } from './fuzzyFinder';
import { handleHelpKey } from './helpEngine';
import { handleSpellSuggestKey } from './spellEngine';
import { recordUndoTreeChange } from './undoTreeEngine';
import { syncActivePane } from './splitWindow';
import { adjustViewport, getViewport, getScrolloff } from './viewport';
import {
  AbbrevReplayCtx,
  INITIAL_ABBREV_CTX,
  withoutBell,
  parsePending,
  insertTextAtCursor,
} from './engineHelpers';
import { executeSearchQuery, handleSearchModeKey } from './searchMode';
import { handleCommandLineModeKey } from './cmdlineMode';
import { handleInsertModeKey, handleReplaceModeKey } from './insertMode';
import { handleVisualModeKey } from './visualMode';
import { handleNormalModeKey } from './normalMode';

export type { ParsedPending } from './engineHelpers';
export { parsePending, withoutBell, insertTextAtCursor, executeSearchQuery };
export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';

/**
 * Vim 키 입력 처리 순수 함수 (불변성 가드 래퍼 내부 구현)
 */
export function rawHandleKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  macroDepth = 0,
  abbrevCtx: AbbrevReplayCtx = INITIAL_ABBREV_CTX
): VimEditorState {
  // z= 맞춤법 교체 추천 세션 처리
  if (state.spellSuggest) {
    return handleSpellSuggestKey(state, key);
  }

  // 대화형 치환 확인 프롬프트 (:s/.../.../gc) 처리
  if (state.confirmSubstitute) {
    return handleConfirmSubstituteKey(state, key);
  }

  // 커맨드라인 윈도우 (q:, q/, q?, Ctrl-f) 활성화 시 처리
  if (state.cmdlineWindow) {
    return handleCommandLineWindowKey(
      state,
      key,
      (s, k) => rawHandleKey(s, k, isReplayingDot, macroDepth + 1),
      (s, cmd) => executeCommandLine(s, cmd, handleKey),
      (s, query) => executeSearchQuery(s, query, isReplayingDot)
    );
  }

  // Netrw 순정 파일 탐색기 활성화 시 전용 키 처리
  if (state.netrw?.isOpen) {
    const netrwHandled = handleNetrwKey(state, key);
    if (netrwHandled !== null) {
      return netrwHandled;
    }
  }

  // 퍼지 파인더 팝업 (:find, :Files, :Buffers) 활성화 시 전용 키 처리
  if (state.fuzzyFinder?.isOpen) {
    return handleFuzzyFinderKey(state, key);
  }

  // 순정 Vim 내장 도움말 창 (:help, K, F1) 활성화 시 전용 키 처리
  if (state.helpSession?.isOpen) {
    const helpHandled = handleHelpKey(state, key);
    if (helpHandled !== null) {
      return helpHandled;
    }
  }

  // 매크로 기록 중인 상태 처리
  if (state.recordingMacro) {
    // NORMAL 모드에서 대기 키 없이 'q'를 누르면 매크로 기록 종료
    if (state.mode === 'NORMAL' && !state.pendingKeys && key === 'q') {
      const reg = state.recordingMacro.register;
      const targetReg = /^[A-Z]$/.test(reg) ? reg.toLowerCase() : reg;
      const recordedKeys = [...state.recordingMacro.keys];
      const newRegisters = {
        ...(state.registers ?? {}),
        [targetReg]: {
          type: 'macro' as const,
          content: recordedKeys,
        },
      };
      return {
        ...state,
        registers: newRegisters,
        recordingMacro: null,
        pendingKeys: undefined,
      };
    }

    // 매크로 재생 중이 아닌(최상위 입력) 경우에만 키 스트림을 녹화 버퍼에 누적
    if (macroDepth === 0) {
      state = {
        ...state,
        recordingMacro: {
          ...state.recordingMacro,
          keys: [...state.recordingMacro.keys, key],
        },
      };
    }
  }

  let nextState: VimEditorState;
  if (state.mode === 'SEARCH') {
    nextState = handleSearchModeKey(state, key, isReplayingDot);
  } else if (state.mode === 'COMMAND') {
    nextState = handleCommandLineModeKey(state, key, handleKey);
  } else if (state.mode === 'REPLACE') {
    nextState = handleReplaceModeKey(state, key, isReplayingDot, macroDepth);
  } else if (state.mode === 'INSERT') {
    nextState = handleInsertModeKey(state, key, rawHandleKey, isReplayingDot, macroDepth, abbrevCtx);
  } else if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
    nextState = handleVisualModeKey(state, key, rawHandleKey, macroDepth);
  } else if (state.mode === 'NORMAL') {
    nextState = handleNormalModeKey(state, key, rawHandleKey, handleKey, isReplayingDot, macroDepth);
    // 일회성 NORMAL 모드 명령 (Ctrl+o) 완료 여부 검사
    if (state.insertNormalSession) {
      if (key === 'Escape') {
        // Escape 입력 시 세션 취소하고 NORMAL 모드로 잔류
        nextState = { ...nextState, insertNormalSession: undefined };
      } else if (!nextState.pendingKeys) {
        // pendingKeys가 없으면 단일 normal 명령이 완결되었으므로 다시 INSERT 모드로 자동 복귀
        if (nextState.mode === 'NORMAL') {
          const currentLineText = nextState.lines[nextState.cursor.line] ?? '';
          const targetCol = nextState.stickyDollar
            ? currentLineText.length
            : nextState.cursor.col;
          nextState = {
            ...nextState,
            mode: 'INSERT',
            cursor: { line: nextState.cursor.line, col: targetCol },
            insertNormalSession: undefined,
          };
        } else {
          nextState = {
            ...nextState,
            insertNormalSession: undefined,
          };
        }
      } else {
        // pendingKeys가 남아 있는 경우(예: 'z', '2', 'd' 등) 세션 유지
        nextState = {
          ...nextState,
          insertNormalSession: true,
        };
      }
    }
  } else {
    nextState = state;
  }

  // 커서 이동 시 화면 뷰포트 자동 동기화 (커서가 화면 및 scrolloff 여백을 벗어나지 않도록 보정)
  if (nextState.cursor && nextState.lines) {
    const vp = adjustViewport(
      getViewport(nextState),
      nextState.cursor.line,
      nextState.lines.length,
      getScrolloff(nextState)
    );
    if (!nextState.viewport || nextState.viewport.topRow !== vp.topRow || nextState.viewport.visibleRows !== vp.visibleRows) {
      nextState = {
        ...nextState,
        viewport: vp,
      };
    }
  }

  // Undo tree 동기화: NORMAL 모드이고 대기 키가 없을 때 버퍼 내용 변경 감지 및 확정
  if (nextState.mode === 'NORMAL' && !nextState.pendingKeys) {
    nextState = recordUndoTreeChange(nextState);
  }

  return syncActivePane(nextState);
}

/**
 * Vim 키 입력 처리 순수 함수: (state, key) => newState
 * 개발 및 테스트 모드에서는 자동으로 Deep Freeze 및 Invariant Guard가 적용됩니다.
 */
export function handleKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  macroDepth = 0
): VimEditorState {
  // bell은 "직전 키가 실패했다"는 일시적 신호이므로 매 키 입력마다 새로 시작합니다.
  const input = withoutBell(state);
  let nextState: VimEditorState;
  if (getVimEngineConfig().devChecks) {
    deepFreeze(input);
    nextState = rawHandleKey(input, key, isReplayingDot, macroDepth);
    assertValidVimState(input, nextState, key);
  } else {
    nextState = rawHandleKey(input, key, isReplayingDot, macroDepth);
  }
  const withHl = releaseHlsearchSuppression(input, nextState, key);
  return processKeyAutocmds(input, withHl);
}

function processKeyAutocmds(prev: VimEditorState, curr: VimEditorState): VimEditorState {
  if (!curr.autocmds || curr.autocmds.length === 0) return curr;
  let res = curr;
  const originalMode = curr.mode;
  const originalCursor = { ...curr.cursor };

  // 1. InsertEnter (인서트 모드 진입)
  if (prev.mode !== 'INSERT' && curr.mode === 'INSERT') {
    res = triggerAutocmd(res, 'InsertEnter', undefined, (s, cmd) => executeCommandLine(s, cmd, handleKey));
    res = { ...res, mode: originalMode, cursor: originalCursor };
  }
  // 2. InsertLeave (인서트 모드 탈출)
  else if (prev.mode === 'INSERT' && curr.mode !== 'INSERT') {
    res = triggerAutocmd(res, 'InsertLeave', undefined, (s, cmd) => executeCommandLine(s, cmd, handleKey));
    res = { ...res, mode: originalMode };
  }

  // 3. CursorMoved (커서 이동 감지)
  if (
    (prev.cursor.line !== curr.cursor.line || prev.cursor.col !== curr.cursor.col) &&
    (curr.mode === 'NORMAL' || curr.mode.startsWith('VISUAL'))
  ) {
    res = triggerAutocmd(res, 'CursorMoved', undefined, (s, cmd) => executeCommandLine(s, cmd, handleKey));
    res = { ...res, mode: originalMode, cursor: originalCursor };
  }

  return res;
}

/** :noh 로 끈 하이라이트는 다음 검색(/ ? Enter, n, N, *, #, 새 검색 패턴)에서 다시 켜집니다. */
function releaseHlsearchSuppression(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  if (!next.hlsearchSuppressed) return next;
  const searched =
    next.lastSearchQuery !== prev.lastSearchQuery ||
    (prev.mode === 'SEARCH' && key === 'Enter') ||
    (prev.mode === 'NORMAL' && !prev.pendingKeys && ['n', 'N', '*', '#'].includes(key));
  if (!searched) return next;
  const copy = { ...next };
  delete copy.hlsearchSuppressed;
  return copy;
}
