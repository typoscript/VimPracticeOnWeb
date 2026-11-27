import { getVimEngineConfig } from './config';
import { VimEditorState } from './types';
import { setActiveCursorContext, clampCursor } from './cursor';
import { setActiveIskeyword } from './wordMotion';
import { setActiveMatchpairs } from './bracketMatch';
import { getOptions } from './setEngine';
import { msg } from './messages';
import { deepFreeze, assertValidVimState } from './invariants';
import { executeCommandLine, handleConfirmSubstituteKey } from './commandLine';
import { triggerAutocmd, triggerWindowAndTabAutocmds } from './autocmdEngine';
import { handleCommandLineWindowKey } from './cmdlineWindow';
import { handleNetrwKey, isNetrwBufferActive } from './netrwEngine';
import { handleOilNavigationKey } from './oilEngine';
import { handleNeotreeKey } from './neotreeEngine';
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
import { getEffectiveGitBaseLines, syncGitBaseOwnership } from './gitSignsEngine';
import { syncBufferLocalState } from './bufferLocalState';
import { detachDeletedBuffersFromTabs } from './bufferEngine';
import { adjustFoldsForLineChange } from './folding';
import { handleLspRenameKey, handleLspCodeActionKey } from './lspRefactorEngine';
import { handleFlashJumpKey } from './flashJumpEngine';
import { handleMultiCursorKey } from './multiCursorEngine';
import { handleTerminalModeKey } from './terminalEngine';
import { handleSpellSuggestKey } from './spellEngine';
import { handleSurroundTagPromptKey } from './surroundEngine';
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
    !isNetrwBufferActive(nextState) &&
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

  // vim-surround 태그 입력 프롬프트 (cst<p>, ysiw<em>, Visual S<div>)
  if (state.surroundTagPrompt) {
    return handleSurroundTagPromptKey(state, key);
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
  if (isNetrwBufferActive(state) && state.mode === 'NORMAL') {
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

  // neo-tree.nvim 스타일 좌측 파일 트리 사이드바 포커스 시 키 처리
  if (state.mode === 'NORMAL' && state.neotree?.isOpen && state.neotree?.isFocused) {
    const neotreeHandled = handleNeotreeKey(state, key);
    if (neotreeHandled !== null) {
      return neotreeHandled;
    }
  }

  // 퍼지 파인더 팝업 (:find, :Files, :Buffers) 활성화 시 전용 키 처리
  if (state.fuzzyFinder?.isOpen) {
    return handleFuzzyFinderKey(state, key);
  }

  // 순정 Vim 내장 도움말 창 (:help, K, F1) 활성화 시 전용 키 처리
  if (state.helpSession?.isOpen && state.mode === 'NORMAL') {
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
  if (state.mode === 'TERMINAL') {
    nextState = handleTerminalModeKey(state, key);
  } else if (state.mode === 'SEARCH') {
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
  // Netrw 탐색 버퍼도 Vim netrw 처럼 nomodifiable (Netrw 자체 동작 d/%/D/Enter/- 는 netrw 상태를 바꾸므로 허용)
  const inNetrwBuffer = isNetrwBufferActive(state);
  if (effectiveOpts.modifiable === false || inNetrwBuffer) {
    const sameContext =
      (nextState.currentBufferId ?? 1) === (state.currentBufferId ?? 1) &&
      (nextState.activePaneIndex ?? 0) === (state.activePaneIndex ?? 0) &&
      (nextState.currentTabId ?? 1) === (state.currentTabId ?? 1) &&
      (inNetrwBuffer
        ? nextState.netrw === state.netrw && nextState.primaryFilename === state.primaryFilename
        : !isNetrwBufferActive(nextState)) &&
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
    !getEffectiveGitBaseLines(state) &&
    !nextState.gitBaseLines &&
    nextState.lines !== state.lines &&
    (nextState.currentBufferId ?? 1) === (state.currentBufferId ?? 1) &&
    nextState.primaryFilename === state.primaryFilename &&
    !/^[a-z]+:\/\//i.test(nextState.primaryFilename ?? '') &&
    !isNetrwBufferActive(nextState) &&
    !nextState.oilSession?.isOpen &&
    !nextState.helpSession?.isOpen &&
    !nextState.cmdlineWindow
  ) {
    nextState = {
      ...nextState,
      gitBaseLines: [...state.lines],
      gitBaseFilename: state.primaryFilename || 'source.ts',
    };
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
    nextState = keepRepeatOnFailure(input, recordInsertStartCursor(input, recordRepeatRegister(input, recordVisualRepeat(input, applyCurswant(input, syncPerFileState(input, rawHandleKey(input, key, isReplayingDot, macroDepth)), key), key, isReplayingDot), isReplayingDot)), key, isReplayingDot);
    assertValidVimState(input, nextState, key);
  } else {
    nextState = keepRepeatOnFailure(input, recordInsertStartCursor(input, recordRepeatRegister(input, recordVisualRepeat(input, applyCurswant(input, syncPerFileState(input, rawHandleKey(input, key, isReplayingDot, macroDepth)), key), key, isReplayingDot), isReplayingDot)), key, isReplayingDot);
  }
  const withHl = releaseHlsearchSuppression(input, nextState, key);
  return processKeyAutocmds(input, withHl);
}

const VISUAL_REPEAT_MODES = new Set(['VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK']);

function countKeys(n: number, motion: string): string[] {
  return n > 0 ? [...String(n).split(''), motion] : [];
}

/**
 * Vim :help visual-repeat — 비주얼 연산을 `.` 로 반복하면 커서에서 같은 양의 텍스트를 다시 고릅니다.
 * 줄 단위: 같은 줄 수 / 블록: 같은 줄 수·열 수 / 한 줄 안 문자 단위: 같은 글자 수 /
 * 여러 줄 문자 단위: 같은 줄 수, 마지막 줄은 지난번과 같은 열까지.
 */
function visualReselectKeys(prev: VimEditorState): string[] | null {
  const anchor = prev.visualAnchor;
  if (!anchor) return null;
  const cur = prev.cursor;
  const lines = Math.abs(cur.line - anchor.line);
  if (prev.mode === 'VISUAL_LINE') return ['V', ...countKeys(lines, 'j')];
  if (prev.mode === 'VISUAL_BLOCK') {
    const width = Math.abs(cur.col - anchor.col);
    return ['Ctrl-v', ...countKeys(lines, 'j'), ...(prev.visualBlockEndOfLine ? ['$'] : countKeys(width, 'l'))];
  }
  if (lines === 0) return ['v', ...countKeys(Math.abs(cur.col - anchor.col), 'l')];
  const end = cur.line > anchor.line ? cur : anchor;
  return ['v', ...countKeys(lines, 'j'), '0', ...countKeys(end.col, 'l')];
}

/** 비주얼 모드 연산이 끝나면 '.' 가 같은 양의 텍스트에 다시 적용되도록 반복 키를 기록합니다. */
function recordVisualRepeat(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (isReplayingDot || !VISUAL_REPEAT_MODES.has(prev.mode)) return next;
  if (VISUAL_REPEAT_MODES.has(next.mode) || next.pendingKeys) return next;
  const entersInsert = next.mode === 'INSERT';
  if (!entersInsert && next.lines === prev.lines) return next; // 복사·취소 등 변경이 아닌 연산
  const reselect = visualReselectKeys(prev);
  if (!reselect) return next;
  const opKeys = [...(prev.pendingKeys ?? '').split('').filter(Boolean), key];
  const repeatKeys = [...reselect, ...opKeys];
  return entersInsert ? { ...next, currentChangeKeys: repeatKeys } : { ...next, lastChangeKeys: repeatKeys };
}

/**
 * Vim 은 레지스터를 지정한 변경(`"add`, `"acw…`)을 `.` 로 반복할 때 같은 레지스터를 씁니다.
 * 각 명령이 기록한 반복 키에 레지스터 접두사가 없으면 여기서 붙입니다 (비주얼 반복 제외).
 */
function recordRepeatRegister(prev: VimEditorState, next: VimEditorState, isReplayingDot: boolean): VimEditorState {
  const reg = prev.activeRegister;
  if (isReplayingDot || !reg) return next;
  const withReg = (keys: string[] | undefined) =>
    !keys || keys.length === 0 || keys[0] === '"' || ['v', 'V', 'Ctrl-v'].includes(keys[0]) ? keys : ['"', reg, ...keys];
  if (next.lastChangeKeys !== prev.lastChangeKeys) {
    const keys = withReg(next.lastChangeKeys);
    if (keys !== next.lastChangeKeys) return { ...next, lastChangeKeys: keys };
  }
  if (next.currentChangeKeys !== prev.currentChangeKeys) {
    const keys = withReg(next.currentChangeKeys);
    if (keys !== next.currentChangeKeys) return { ...next, currentChangeKeys: keys };
  }
  return next;
}

/**
 * Vim 은 입력 모드로 들어가는 변경(A, a, I, cc, cw …)의 실행 취소 위치로 "입력을 시작한 곳"을 기억합니다.
 * 이번 키로 새 실행 취소 스냅샷이 생기고 입력 모드에 들어갔다면 스냅샷 커서를 입력 시작 위치로 바꿉니다.
 * (o/O 처럼 줄이 늘어나는 경우는 원래 줄을 기억하므로 그대로 둡니다.)
 */
function recordInsertStartCursor(prev: VimEditorState, next: VimEditorState): VimEditorState {
  // 커서 왼쪽을 지우는 변경(X, db, d0, dF…)은 Vim 처럼 지운 범위의 시작(바뀐 뒤 커서)을 기억합니다.
  if (
    prev.mode === 'NORMAL' &&
    next.mode === 'NORMAL' &&
    next.undoStack &&
    next.undoStack.length > 0 &&
    next.undoStack !== prev.undoStack &&
    next.lines.length === prev.lines.length &&
    next.cursor.line === prev.cursor.line &&
    next.cursor.col < prev.cursor.col &&
    next.lines.every((l, i) => i === next.cursor.line || l === prev.lines[i]) &&
    next.registers?.['"']?.type !== 'line'
  ) {
    const top = next.undoStack[next.undoStack.length - 1];
    return { ...next, undoStack: [...next.undoStack.slice(0, -1), { ...top, cursor: { ...next.cursor } }] };
  }
  if (prev.mode !== 'NORMAL' || next.mode !== 'INSERT') return next;
  const stack = next.undoStack;
  if (!stack || stack.length === 0 || stack === prev.undoStack) return next;
  if (next.lines.length !== prev.lines.length) return next;
  const top = stack[stack.length - 1];
  return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: { ...next.cursor } }] };
}

/**
 * Vim 은 실패한 변경(`gUi[` 처럼 대상이 없는 텍스트 객체, `ca{` 등)을 `.` 반복 대상으로 남기지 않습니다.
 * 단 `[count]Ctrl-a` / `Ctrl-x` 는 숫자가 없어 실패해도 반복 대상으로 기록합니다 (nv_addsub 의 prep_redo).
 */
function keepRepeatOnFailure(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (isReplayingDot || !next.bell || prev.mode !== 'NORMAL') return next;
  const pending = prev.pendingKeys ?? '';
  if ((key === 'Ctrl-a' || key === 'Ctrl-x') && /^([1-9][0-9]*)?$/.test(pending)) {
    return { ...next, lastChangeKeys: [...pending.split('').filter(Boolean), key] };
  }
  if (next.lastChangeKeys !== prev.lastChangeKeys) return { ...next, lastChangeKeys: prev.lastChangeKeys };
  return next;
}

/** `$` 뒤의 curswant: 세로 이동이 항상 줄 끝으로 갑니다 (Vim MAXCOL). */
export const CURSWANT_EOL = Number.MAX_SAFE_INTEGER;

const CURSWANT_MODES = new Set(['NORMAL', 'VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK']);
const ALWAYS_VERTICAL_KEYS = new Set(['j', 'k', 'ArrowDown', 'ArrowUp', 'Ctrl-e', 'Ctrl-y']);
/** 'nostartofline' 일 때만 열을 유지하는 세로 이동 */
const NOSOL_VERTICAL_KEYS = new Set(['G', 'H', 'L', 'M', 'Ctrl-d', 'Ctrl-u', 'Ctrl-f', 'Ctrl-b']);

/** 이번 키가 curswant 를 유지하는 세로 이동(또는 커서를 옮기지 않는 화면 정렬)인지 */
function keepsCurswant(prev: VimEditorState, key: string): boolean {
  const pending = prev.pendingKeys ?? '';
  // 사용자가 매핑한 키(:nmap H ^ 등)는 기본 세로 이동이 아닙니다.
  const lhs = pending.replace(/^[1-9][0-9]*/, '') + key;
  const maps = prev.userKeymaps ?? {};
  if (Object.keys(maps).some((m) => m === lhs || m.endsWith(':' + lhs))) return false;
  const countOnly = /^([1-9][0-9]*)?$/.test(pending);
  const nosol = !getOptions(prev).startofline;
  if (countOnly && ALWAYS_VERTICAL_KEYS.has(key)) return true;
  if (countOnly && nosol && NOSOL_VERTICAL_KEYS.has(key)) return true;
  if (/^([1-9][0-9]*)?g$/.test(pending)) return key === 'j' || key === 'k' || (key === 'g' && nosol);
  if (/^([1-9][0-9]*)?z$/.test(pending)) return key === 'z' || key === 't' || key === 'b';
  return false;
}

/**
 * Vim curswant 규칙을 적용합니다.
 * - 세로 이동(j k G gg Ctrl-d … , 'nostartofline' 기준)은 기억한 열로 가고(줄이 짧으면 줄 끝까지) 그 열을 유지합니다.
 * - 실패한 모션(bell, 커서 그대로)도 기억한 열을 유지합니다.
 * - `$` 는 '줄 끝'을 기억하고, 그 밖의 명령이 끝나면 현재 열을 새로 기억합니다.
 */
function applyCurswant(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  const remembered = prev.curswant ?? prev.cursor.col;
  // 아직 명령이 끝나지 않았거나(대기 키), 입력·명령줄 모드 중에는 기억한 열을 그대로 둡니다.
  if (next.pendingKeys || !CURSWANT_MODES.has(next.mode)) {
    return next.curswant === remembered ? next : { ...next, curswant: remembered };
  }
  const sameText = next.lines === prev.lines;
  const sameCursor = next.cursor.line === prev.cursor.line && next.cursor.col === prev.cursor.col;
  if (CURSWANT_MODES.has(prev.mode) && sameText && keepsCurswant(prev, key)) {
    const line = next.lines[next.cursor.line] ?? '';
    const lastCol = Math.max(0, line.length - 1);
    const col = Math.min(remembered, lastCol);
    const cursor = col === next.cursor.col ? next.cursor : clampCursor(next.lines, { line: next.cursor.line, col }, next.mode);
    return { ...next, cursor, curswant: remembered };
  }
  if (next.bell && sameText && sameCursor) {
    return next.curswant === remembered ? next : { ...next, curswant: remembered };
  }
  const isDollar = key === '$' && /^([1-9][0-9]*)?$/.test(prev.pendingKeys ?? '') && CURSWANT_MODES.has(prev.mode);
  const want = isDollar ? CURSWANT_EOL : next.cursor.col;
  return next.curswant === want ? next : { ...next, curswant: want };
}

const VISUAL_LIKE_MODES = new Set(['VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK', 'SELECT', 'SELECT_LINE', 'SELECT_BLOCK']);

/**
 * 현재 파일이 바뀌었으면 파일별 상태를 교체합니다: Gitsigns 기준선과 버퍼 로컬 상태
 * (소문자 마크·변경 목록·gv·gi·폴드). 또한 이전 파일 좌표에 묶인 비주얼 선택·다중 커서·Flash 세션을 닫고
 * 커서를 새 파일·모드 범위로 맞춥니다.
 * `handleKey` 바깥 래퍼(조기 반환 경로 포함)와, 키 입력 없이 엔진 함수를 직접 부르는 UI(버퍼라인·탭·분할 창 클릭)에서 호출합니다.
 */
export function syncPerFileState(prev: VimEditorState, next: VimEditorState): VimEditorState {
  if (prev === next) return next;
  const fileChanged = (prev.primaryFilename || 'source.ts') !== (next.primaryFilename || 'source.ts');
  const bufferChanged = fileChanged || (prev.currentBufferId ?? 1) !== (next.currentBufferId ?? 1);
  let synced = syncBufferLocalState(prev, syncGitBaseOwnership(prev, next));
  // 어떤 경로로든 버퍼가 삭제되면(:bd, Netrw 닫기 등) 그 버퍼를 보여 주던 다른 탭을 남은 버퍼로 바꿈
  if (prev.buffers !== synced.buffers) synced = detachDeletedBuffersFromTabs(prev, synced);

  if (!bufferChanged) {
    // 같은 파일에서 줄이 바뀌었고 이번 동작이 폴드를 직접 고치지 않았다면 폴드를 줄 변화에 맞춰 이동
    if (synced.lines !== prev.lines && synced.folds && synced.folds.length > 0 && synced.folds === prev.folds) {
      const folds = adjustFoldsForLineChange(synced.folds, prev.lines, synced.lines);
      synced = { ...synced, folds: folds.length > 0 ? folds : undefined };
    }
  } else {
    // 다른 버퍼로 바뀜: 이전 버퍼 좌표에 묶인 비주얼 선택·다중 커서·Flash 세션을 닫고 커서를 새 버퍼 범위로
    if (VISUAL_LIKE_MODES.has(synced.mode)) {
      synced = { ...synced, mode: 'NORMAL', visualAnchor: undefined, visualBlockEndOfLine: undefined };
    }
    // 터미널 창에서 다른 파일로 바뀌면 TERMINAL 모드 해제 (일반 파일에 셸 입력이 쓰이지 않도록)
    if (synced.mode === 'TERMINAL' && !(synced.primaryFilename ?? '').startsWith('term://')) {
      synced = { ...synced, mode: 'NORMAL' };
    }
    if (synced.multiCursor?.isOpen || synced.flashJump?.isOpen) {
      synced = { ...synced, multiCursor: null, flashJump: null };
    }
    const clamped = clampCursor(synced.lines, synced.cursor, synced.mode);
    if (clamped.line !== synced.cursor.line || clamped.col !== synced.cursor.col) {
      synced = { ...synced, cursor: clamped };
    }
  }
  return sanitizeWindowState(synced);
}

/** 폴드 범위·분할 창 커서·입력 모드 전용 대기 상태가 현재 버퍼/모드와 어긋나지 않게 맞춥니다 */
function sanitizeWindowState(state: VimEditorState): VimEditorState {
  let s = state;
  const lastRow = s.lines.length - 1;
  if (s.folds?.some((f) => f.endRow > lastRow || f.startRow > f.endRow || f.startRow < 0)) {
    const folds = s.folds
      .map((f) => ({ ...f, startRow: Math.max(0, f.startRow), endRow: Math.min(lastRow, f.endRow) }))
      .filter((f) => f.startRow <= f.endRow);
    s = { ...s, folds: folds.length > 0 ? folds : undefined };
  }
  if (s.splitPanes?.length) {
    let panesChanged = false;
    const panes = s.splitPanes.map((pane) => {
      const c = clampCursor(pane.lines, pane.cursor, pane.mode ?? 'NORMAL');
      if (c.line === pane.cursor.line && c.col === pane.cursor.col) return pane;
      panesChanged = true;
      return { ...pane, cursor: c };
    });
    if (panesChanged) s = { ...s, splitPanes: panes };
  }
  // Ctrl-r 레지스터 대기는 입력·명령행 모드 전용 (탭·버퍼 전환 등으로 NORMAL/VISUAL 이 되면 해제)
  if (s.insertRegisterPending && (s.mode === 'NORMAL' || VISUAL_LIKE_MODES.has(s.mode))) {
    s = { ...s, insertRegisterPending: undefined, insertRegisterMode: undefined };
  }
  return s;
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
