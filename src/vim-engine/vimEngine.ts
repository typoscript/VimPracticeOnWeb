import { getVimEngineConfig } from './config';
import { VimEditorState } from './types';
import { setActiveCursorContext } from './cursor';
import { setActiveIskeyword } from './wordMotion';
import { setActiveMatchpairs } from './bracketMatch';
import { getOptions } from './setEngine';
import { msg } from './messages';
import { deepFreeze, assertValidVimState } from './invariants';
import { executeCommandLine, handleConfirmSubstituteKey } from './commandLine';
import { triggerAutocmd, triggerWindowAndTabAutocmds } from './autocmdEngine';
import { handleCommandLineWindowKey } from './cmdlineWindow';
import { handleNetrwKey } from './netrwEngine';
import { handleOilNavigationKey } from './oilEngine';
import { handleHarpoonMenuKey } from './harpoonEngine';
import {
  handleYankyMenuKey,
  cycleYankRing,
  isYankRingCycleKey,
  updateYankRing,
} from './yankRingEngine';
import { handleFuzzyFinderKey } from './fuzzyFinder';
import { handleHelpKey } from './helpEngine';
import { syncLiveLspDiagnostics } from './lspEngine';
import { handleLspRenameKey, handleLspCodeActionKey } from './lspRefactorEngine';
import { handleFlashJumpKey } from './flashJumpEngine';
import { handleMultiCursorKey } from './multiCursorEngine';
import { handleSpellSuggestKey } from './spellEngine';
import { recordUndoTreeChange } from './undoTreeEngine';
import { computeSpecialMarksUpdate } from './marks';
import { applyScrollbindDelta } from './splitWindow';
import {
  adjustViewport,
  getViewport,
  getScrolloff,
  getSidescroll,
  getSidescrolloff,
  isWrapEnabled,
} from './viewport';
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
import { handleVisualModeKey, handleSelectModeKey } from './visualMode';
import { handleNormalModeKey } from './normalMode';

export type { ParsedPending } from './engineHelpers';
export { parsePending, withoutBell, insertTextAtCursor, executeSearchQuery };
export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';

/**
 * Ctrl-o 일회성 노멀/커맨드/검색 세션 종료 시 조건을 확인해 INSERT 모드로 복귀합니다.
 */
function finishInsertNormalSession(
  nextState: VimEditorState,
  allowStickyDollar = false
): VimEditorState {
  if (
    nextState.mode === 'NORMAL' &&
    !nextState.cmdlineWindow &&
    !nextState.netrw?.isOpen &&
    !nextState.fuzzyFinder?.isOpen &&
    !nextState.helpSession?.isOpen &&
    !nextState.flashJump?.isOpen &&
    !nextState.harpoonMenu?.isOpen &&
    !nextState.yankyMenu?.isOpen &&
    !nextState.multiCursor?.isOpen &&
    !nextState.functionDraft
  ) {
    const currentLineText = nextState.lines[nextState.cursor.line] ?? '';
    const targetCol = allowStickyDollar && nextState.stickyDollar
      ? currentLineText.length
      : Math.min(nextState.cursor.col, currentLineText.length);
    return {
      ...nextState,
      mode: 'INSERT',
      cursor: { line: nextState.cursor.line, col: targetCol },
      insertNormalSession: undefined,
    };
  }
  return { ...nextState, insertNormalSession: undefined };
}

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
  const effectiveOpts = getOptions(state);
  setActiveIskeyword(effectiveOpts.iskeyword);
  setActiveMatchpairs(effectiveOpts.matchpairs);
  setActiveCursorContext(state.mode, effectiveOpts.virtualedit);

  // z= 맞춤법 교체 추천 세션 처리
  if (state.spellSuggest) {
    return handleSpellSuggestKey(state, key);
  }

  // flash.nvim 스타일 화면 라벨 점프 세션 처리 (gs, dgs/cgs/ygs, :Flash)
  if (state.flashJump?.isOpen) {
    return handleFlashJumpKey(state, key);
  }

  // harpoon.nvim 빠른 파일 전환 팝업 메뉴 처리 (:HarpoonMenu)
  if (state.harpoonMenu?.isOpen) {
    return handleHarpoonMenuKey(state, key);
  }

  // yanky.nvim 복사 이력 팝업 메뉴 처리 (:YankyRingHistory / :Yanks)
  if (state.yankyMenu?.isOpen) {
    return handleYankyMenuKey(state, key, rawHandleKey);
  }

  // vim-visual-multi 다중 커서 세션 처리 (g Ctrl-n / :MultiCursor)
  if (state.multiCursor?.isOpen) {
    return handleMultiCursorKey(state, key);
  }

  // LSP 심볼 이름 변경 프롬프트 (grn) 처리
  if (state.lspRename?.isOpen) {
    return handleLspRenameKey(state, key);
  }

  // LSP 코드 액션 선택 팝업 (gra) 처리
  if (state.lspCodeActionMenu?.isOpen) {
    const res = handleLspCodeActionKey(state, key);
    return syncLiveLspDiagnostics(state, res);
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

  // oil.nvim 스타일 디렉터리 버퍼 탐색 키(Enter/-) 처리 (편집 키는 일반 Vim 엔진으로 통과)
  if (state.oilSession?.isOpen) {
    const oilHandled = handleOilNavigationKey(state, key);
    if (oilHandled !== null) {
      return oilHandled;
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
        lastRecordedMacro: targetReg,
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

  // yanky.nvim: p/P 직후 Ctrl-p / Ctrl-n 으로 붙여넣은 텍스트를 이전/다음 복사본으로 제자리 교체
  if (
    state.yankRing &&
    state.mode === 'NORMAL' &&
    !state.pendingKeys &&
    macroDepth === 0 &&
    !isReplayingDot &&
    isYankRingCycleKey(key)
  ) {
    const cycled = cycleYankRing(state, key, rawHandleKey);
    if (cycled) return cycled;
  }

  const prevTopRow = getViewport(state).topRow;
  const prevActivePaneIndex = state.activePaneIndex ?? 0;
  const prevSplitPanes = state.splitPanes;

  let nextState: VimEditorState;
  if (state.mode === 'SEARCH') {
    nextState = handleSearchModeKey(state, key, isReplayingDot);
    if (state.insertNormalSession && nextState.mode === 'NORMAL') {
      nextState = finishInsertNormalSession(nextState);
    }
  } else if (state.mode === 'COMMAND') {
    nextState = handleCommandLineModeKey(state, key, handleKey, rawHandleKey, macroDepth);
    if (state.insertNormalSession && nextState.mode === 'NORMAL') {
      nextState = finishInsertNormalSession(nextState);
    }
  } else if (state.mode === 'REPLACE') {
    nextState = handleReplaceModeKey(state, key, isReplayingDot, macroDepth);
  } else if (state.mode === 'INSERT') {
    nextState = handleInsertModeKey(state, key, rawHandleKey, isReplayingDot, macroDepth, abbrevCtx);
  } else if (state.mode === 'SELECT' || state.mode === 'SELECT_LINE' || state.mode === 'SELECT_BLOCK') {
    nextState = handleSelectModeKey(state, key, rawHandleKey, macroDepth);
  } else if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
    nextState = handleVisualModeKey(state, key, rawHandleKey, macroDepth);
    // Select 모드 Ctrl-o 일회성 Visual 명령 완료 시 다시 Select 모드로 복귀 (gV 로 취소 가능)
    if (state.selectVisualOneShot) {
      if (key === 'Escape' || !nextState.selectVisualOneShot) {
        nextState = { ...nextState, selectVisualOneShot: undefined };
      } else if (!nextState.pendingKeys) {
        if (
          nextState.mode === 'VISUAL' ||
          nextState.mode === 'VISUAL_LINE' ||
          nextState.mode === 'VISUAL_BLOCK'
        ) {
          const backToSelect =
            nextState.mode === 'VISUAL_LINE'
              ? 'SELECT_LINE'
              : nextState.mode === 'VISUAL_BLOCK'
                ? 'SELECT_BLOCK'
                : 'SELECT';
          nextState = {
            ...nextState,
            mode: backToSelect,
            selectVisualOneShot: undefined,
          };
        } else {
          nextState = { ...nextState, selectVisualOneShot: undefined };
        }
      } else {
        nextState = { ...nextState, selectVisualOneShot: true };
      }
    }
  } else if (state.mode === 'NORMAL') {
    nextState = handleNormalModeKey(state, key, rawHandleKey, handleKey, isReplayingDot, macroDepth);
    // 일회성 NORMAL 모드 명령 (Ctrl+o) 완료 여부 검사
    if (state.insertNormalSession) {
      if (key === 'Escape') {
        // Escape 입력 시 세션 취소하고 NORMAL 모드로 잔류
        nextState = { ...nextState, insertNormalSession: undefined };
      } else if (!nextState.pendingKeys) {
        if (nextState.mode === 'COMMAND' || nextState.mode === 'SEARCH') {
          nextState = {
            ...nextState,
            insertNormalSession: true,
          };
        } else {
          // pendingKeys가 없으면 단일 normal 명령이 완결되었으므로 다시 INSERT 모드로 자동 복귀
          nextState = finishInsertNormalSession(nextState, true);
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

  // :set nomodifiable (noma) 상태에서 현재 버퍼 수정 또는 INSERT/REPLACE 진입 차단 (E21)
  if (effectiveOpts.modifiable === false) {
    const sameContext =
      (nextState.currentBufferId ?? 1) === (state.currentBufferId ?? 1) &&
      (nextState.activePaneIndex ?? 0) === (state.activePaneIndex ?? 0) &&
      (nextState.currentTabId ?? 1) === (state.currentTabId ?? 1) &&
      !nextState.netrw?.isOpen &&
      !nextState.helpSession?.isOpen &&
      !nextState.cmdlineWindow;
    const triedToEnterEditMode =
      state.mode !== 'INSERT' &&
      state.mode !== 'REPLACE' &&
      (nextState.mode === 'INSERT' || nextState.mode === 'REPLACE');
    const triedToMutateLines = nextState.lines !== state.lines;

    if (sameContext && (triedToEnterEditMode || triedToMutateLines)) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        pendingKeys: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        bell: true,
        commandMessage: msg('E21: \'modifiable\' 옵션이 꺼져 있어 변경할 수 없습니다'),
      };
    }
  }

  setActiveCursorContext(nextState.mode, getOptions(nextState).virtualedit);

  // INSERT 모드 신규 진입(Ctrl-o 일회성 복귀 제외) 시 직전 입력 텍스트 버퍼 및 시작 열 초기화
  if (state.mode !== 'INSERT' && nextState.mode === 'INSERT' && !state.insertNormalSession) {
    nextState = {
      ...nextState,
      currentInsertText: undefined,
      digraphPending: undefined,
      insertCtrlGPending: undefined,
      insertStartCol: nextState.cursor.col,
    };
  }

  // 커서 이동 시 화면 뷰포트 자동 동기화 (커서가 화면 및 scrolloff/sidescrolloff 여백을 벗어나지 않도록 보정)
  if (nextState.cursor && nextState.lines) {
    const vp = adjustViewport(
      getViewport(nextState),
      nextState.cursor.line,
      nextState.lines.length,
      getScrolloff(nextState),
      nextState.cursor.col,
      getSidescroll(nextState),
      getSidescrolloff(nextState),
      isWrapEnabled(nextState)
    );
    if (
      !nextState.viewport ||
      nextState.viewport.topRow !== vp.topRow ||
      nextState.viewport.visibleRows !== vp.visibleRows ||
      (nextState.viewport.leftCol ?? 0) !== (vp.leftCol ?? 0)
    ) {
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

  // 줄 단위 실행 취소(U) 스냅샷 자동 갱신
  if (
    state.mode === 'NORMAL' &&
    (key === 'u' || key === 'Ctrl+r') &&
    nextState.lines !== state.lines
  ) {
    if (nextState.lineUndoSnapshot) {
      nextState = { ...nextState, lineUndoSnapshot: null };
    }
  } else if (
    key !== 'U' &&
    nextState.lines !== state.lines &&
    (nextState.currentBufferId ?? 1) === (state.currentBufferId ?? 1)
  ) {
    if (nextState.lines.length === state.lines.length) {
      let changedLine = -1;
      let multiChanged = false;
      for (let i = 0; i < state.lines.length; i++) {
        if (state.lines[i] !== nextState.lines[i]) {
          if (changedLine === -1) changedLine = i;
          else {
            multiChanged = true;
            break;
          }
        }
      }
      if (!multiChanged && changedLine >= 0) {
        const curBufId = nextState.currentBufferId ?? 1;
        const prevSnap = nextState.lineUndoSnapshot;
        if (prevSnap && prevSnap.line === changedLine && (prevSnap.bufferId ?? 1) === curBufId) {
          if (prevSnap.toggledText !== undefined) {
            nextState = { ...nextState, lineUndoSnapshot: { ...prevSnap, toggledText: undefined } };
          }
        } else {
          nextState = {
            ...nextState,
            lineUndoSnapshot: {
              line: changedLine,
              originalText: state.lines[changedLine],
              originalCol: state.cursor.col,
              bufferId: curBufId,
            },
          };
        }
      } else if (multiChanged && nextState.lineUndoSnapshot) {
        nextState = { ...nextState, lineUndoSnapshot: null };
      }
    } else if (nextState.lineUndoSnapshot) {
      nextState = { ...nextState, lineUndoSnapshot: null };
    }
  }

  // yanky.nvim 복사 이력 기록 및 p/P 링 세션 갱신
  nextState = updateYankRing(state, nextState, key, isReplayingDot || macroDepth > 0);

  // 특수 마크('., '[, ']) 자동 갱신 (버퍼 변경 시)
  const specialMarksPatch = computeSpecialMarksUpdate(state, nextState);
  if (specialMarksPatch) {
    nextState = {
      ...nextState,
      ...specialMarksPatch,
    };
  }

  // Gitsigns 기준선(gitBaseLines) 최초 버퍼 편집 시 자동 캡처
  if (
    !state.gitBaseLines &&
    !nextState.gitBaseLines &&
    nextState.lines !== state.lines &&
    (nextState.currentBufferId ?? 1) === (state.currentBufferId ?? 1) &&
    !nextState.netrw?.isOpen &&
    !nextState.oilSession?.isOpen &&
    !nextState.helpSession?.isOpen &&
    !nextState.cmdlineWindow
  ) {
    nextState = { ...nextState, gitBaseLines: [...state.lines] };
  }

  // 실시간 LSP 진단 재계산 및 커서 이동/모드 전환 시 열린 LSP 호버·Git Hunk 미리보기 자동 닫기
  nextState = syncLiveLspDiagnostics(state, nextState);
  if (
    state.lspHover?.isOpen &&
    nextState.lspHover?.isOpen &&
    (nextState.cursor.line !== state.cursor.line ||
      nextState.cursor.col !== state.cursor.col ||
      nextState.mode !== 'NORMAL')
  ) {
    nextState = { ...nextState, lspHover: null };
  }
  if (
    state.gitHunkPreview?.isOpen &&
    nextState.gitHunkPreview?.isOpen &&
    (key === 'Escape' ||
      nextState.cursor.line !== state.cursor.line ||
      nextState.lines !== state.lines ||
      nextState.mode !== 'NORMAL')
  ) {
    nextState = { ...nextState, gitHunkPreview: null };
  }

  return applyScrollbindDelta(prevTopRow, prevActivePaneIndex, prevSplitPanes, nextState);
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
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, handleKey);

  // 0. 창/탭 전환 이벤트 (WinLeave/WinEnter/WinNew/WinClosed/TabLeave/TabEnter)
  // COMMAND/cmdlineWindow 경로는 executeCommandLine 내부에서 이미 처리하므로 중복 발화를 방지합니다.
  if (prev.mode !== 'COMMAND' && !prev.cmdlineWindow) {
    res = triggerWindowAndTabAutocmds(prev, res, runEx);
  }

  // 1. InsertEnter (인서트 모드 진입)
  if (prev.mode !== 'INSERT' && curr.mode === 'INSERT') {
    res = triggerAutocmd(res, 'InsertEnter', undefined, runEx);
    res = { ...res, mode: originalMode, cursor: originalCursor };
  }
  // 2. InsertLeave (인서트 모드 탈출)
  else if (prev.mode === 'INSERT' && curr.mode !== 'INSERT') {
    res = triggerAutocmd(res, 'InsertLeave', undefined, runEx);
    res = { ...res, mode: originalMode };
  }

  // 3. CursorMoved (커서 이동 감지)
  if (
    (prev.cursor.line !== curr.cursor.line || prev.cursor.col !== curr.cursor.col) &&
    (curr.mode === 'NORMAL' || curr.mode.startsWith('VISUAL'))
  ) {
    res = triggerAutocmd(res, 'CursorMoved', undefined, runEx);
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
