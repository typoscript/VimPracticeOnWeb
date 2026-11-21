import { VimEditorState } from './types';
import { evaluateVimExpression } from './expressionParser';
import { executeCommandLine } from './commandLine';
import { computeIncCommandPreview } from './exSubstitute';
import { addHistory, navigateHistory, openCommandLineWindow } from './cmdlineWindow';
import { handleTabCompletion, cancelWildmenu, acceptWildmenu, listCmdlineCompletions } from './wildmenu';
import { expandCmdlineAbbrev } from './abbrevEngine';
import { cancelFunctionDraft } from './vimscriptEngine';
import { DispatchKeyFn, insertTextAtCursor, RunHandleKeyFn } from './engineHelpers';
import {
  MAX_REMAP_DEPTH,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
  runKeymapTokens,
} from './keymapEngine';
import {
  insertTextIntoCmdline,
  deleteCmdlineCharBackward,
  handleCmdlineDigraphStep,
  handleCmdlineCtrlRStep,
  handleCmdlineCommonEditKey,
  isBackspaceKey,
  isCmdlineCancelKey,
} from './cmdlineEdit';
import { msg } from './messages';

/** 표현식 레지스터(=) 프롬프트에서 원래 모드로 복귀할 때 상태 복원 */
function restoreFromExpressionPrompt(
  state: VimEditorState,
  overrides: Partial<VimEditorState> = {}
): VimEditorState {
  const returnCtx = state.expressionReturnContext;
  const returnMode = returnCtx?.mode ?? 'INSERT';
  if (returnMode === 'COMMAND' || returnMode === 'SEARCH') {
    return {
      ...state,
      mode: returnMode,
      commandBuffer: returnCtx?.commandBuffer ?? '',
      commandType: returnCtx?.commandType ?? (returnMode === 'COMMAND' ? ':' : '/'),
      commandCursorCol: returnCtx?.commandCursorCol ?? returnCtx?.commandBuffer?.length,
      digraphPending: undefined,
      expressionReturnContext: undefined,
      insertRegisterPending: undefined,
      ...overrides,
    };
  }
  return {
    ...state,
    mode: returnMode,
    commandBuffer: undefined,
    commandType: undefined,
    commandCursorCol: undefined,
    digraphPending: undefined,
    expressionReturnContext: undefined,
    insertRegisterPending: undefined,
    ...overrides,
  };
}

/** 일반 COMMAND(:) 모드를 취소하고 NORMAL 모드로 복귀합니다. */
function exitCommandLineToNormal(state: VimEditorState): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    commandBuffer: undefined,
    commandType: undefined,
    commandCursorCol: undefined,
    digraphPending: undefined,
    insertRegisterPending: undefined,
    literalNextPending: undefined,
    pendingKeymapPrefix: undefined,
    filterOperatorKeys: undefined,
    incCommandPreview: undefined,
    wildmenu: null,
  };
}

/** COMMAND 모드(:) 상태에서 inccommand 미리보기를 최신화합니다. */
function syncIncCommandPreview(state: VimEditorState): VimEditorState {
  if (state.mode !== 'COMMAND' || (state.commandType && state.commandType !== ':')) {
    return state.incCommandPreview !== undefined ? { ...state, incCommandPreview: undefined } : state;
  }
  const preview = computeIncCommandPreview(state);
  return {
    ...state,
    incCommandPreview: preview,
  };
}

/** 표현식 레지스터(=) 프롬프트 키 입력 처리 */
function handleExpressionRegisterKey(state: VimEditorState, key: string): VimEditorState {
  const digraphRes = handleCmdlineDigraphStep(state, key);
  if (digraphRes) return digraphRes;

  if (isCmdlineCancelKey(key)) {
    return restoreFromExpressionPrompt(state);
  }

  if (isBackspaceKey(key)) {
    return state.commandBuffer && state.commandBuffer.length > 0
      ? deleteCmdlineCharBackward(state)
      : restoreFromExpressionPrompt(state);
  }

  const commonEdit = handleCmdlineCommonEditKey(state, key);
  if (commonEdit) return commonEdit;

  if (key === 'Enter') {
    const evalRes = evaluateVimExpression(state.commandBuffer ?? '', state);
    const returnCtx = state.expressionReturnContext;
    const returnMode = returnCtx?.mode ?? 'INSERT';

    if (!evalRes.success) {
      return restoreFromExpressionPrompt(state, {
        commandMessage: msg('E15: {v}', { v: evalRes.error ?? msg('잘못된 수식입니다') }),
      });
    }

    const newRegisters = {
      ...(state.registers ?? {}),
      '=': { type: 'char' as const, content: evalRes.result },
    };

    if (returnMode === 'COMMAND' || returnMode === 'SEARCH') {
      const prevState = restoreFromExpressionPrompt(state, { registers: newRegisters });
      return insertTextIntoCmdline(prevState, evalRes.result);
    }
    if (returnMode === 'NORMAL') {
      return restoreFromExpressionPrompt(state, {
        registers: newRegisters,
        activeRegister: '=',
        cursor: returnCtx?.cursor ?? state.cursor,
      });
    }

    const stateWithRegisters = restoreFromExpressionPrompt(state, {
      registers: newRegisters,
      cursor: returnCtx?.cursor ?? state.cursor,
    });
    const insertedState = insertTextAtCursor(stateWithRegisters, evalRes.result);
    if (insertedState.currentChangeKeys) {
      insertedState.currentChangeKeys = [
        ...insertedState.currentChangeKeys,
        'Ctrl-r',
        '=',
        ...(state.commandBuffer?.split('') ?? []),
        'Enter',
      ];
    }
    return insertedState;
  }

  return key.length === 1 ? insertTextIntoCmdline(state, key) : state;
}

/** 명령행 모드 키매핑(:cmap / :cnoremap) 해석 및 접두어 플러시 처리 */
function tryHandleCmdlineKeymap(
  state: VimEditorState,
  key: string,
  runHandleKey: RunHandleKeyFn,
  dispatchKey: DispatchKeyFn | undefined,
  macroDepth: number
): VimEditorState | null {
  if (
    state.keymapsDisabled ||
    state.literalNextPending ||
    state.digraphPending !== undefined ||
    state.insertRegisterPending ||
    state.confirmSubstitute ||
    macroDepth > MAX_REMAP_DEPTH
  ) {
    return null;
  }

  const leaderKey = state.leaderKey || ' ';
  const prefix = state.pendingKeymapPrefix ?? '';
  if (prefix && isCmdlineCancelKey(key)) {
    return handleCommandLineModeKey(
      { ...state, pendingKeymapPrefix: undefined },
      key,
      runHandleKey,
      dispatchKey,
      macroDepth
    );
  }

  const stepToken = (s: VimEditorState, tok: string, depth: number) =>
    s.mode === 'COMMAND'
      ? handleCommandLineModeKey(s, tok, runHandleKey, dispatchKey, depth)
      : dispatchKey
        ? dispatchKey(s, tok, false, depth)
        : runHandleKey(s, tok);

  const combined = `${prefix}${key}`;
  const resolved = resolveKeymapWithMeta(state, 'c', combined);
  const hasLongerPrefix = isKeymapPrefix(state, 'c', combined);
  if (resolved && (!hasLongerPrefix || resolved.nowait)) {
    const cleanState: VimEditorState = { ...state, pendingKeymapPrefix: undefined };
    const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, runHandleKey);
    return runKeymapTokens(
      cleanState,
      resolved,
      macroDepth,
      (runState, rhs, _isNoremap, nextDepth) => {
        const tokens = parseKeySequence(rhs, leaderKey);
        let s: VimEditorState = runState;
        for (const tok of tokens) {
          s = stepToken(s, tok, nextDepth);
          if (s.bell) break;
        }
        return s;
      },
      runEx
    );
  }

  if (hasLongerPrefix) {
    return { ...state, pendingKeymapPrefix: combined };
  }

  if (prefix) {
    const prevResolved = resolveKeymapWithMeta(state, 'c', prefix);
    if (prevResolved) {
      const cleanState: VimEditorState = { ...state, pendingKeymapPrefix: undefined };
      const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, runHandleKey);
      const afterPrev = runKeymapTokens(
        cleanState,
        prevResolved,
        macroDepth,
        (runState, rhs, _isNoremap, nextDepth) => {
          const tokens = parseKeySequence(rhs, leaderKey);
          let s: VimEditorState = runState;
          for (const tok of tokens) {
            s = stepToken(s, tok, nextDepth);
            if (s.bell) break;
          }
          return s;
        },
        runEx
      );
      return stepToken(afterPrev, key, macroDepth);
    }
    const prevDisabled = state.keymapsDisabled;
    const flushTokens = parseKeySequence(prefix, leaderKey);
    let s: VimEditorState = { ...state, pendingKeymapPrefix: undefined, keymapsDisabled: true };
    for (const tok of flushTokens) {
      s = stepToken(s, tok, macroDepth);
      if (s.bell) break;
    }
    const restored = s.keymapsDisabled === prevDisabled ? s : { ...s, keymapsDisabled: prevDisabled };
    return stepToken(restored, key, macroDepth);
  }

  return null;
}

/** COMMAND 모드(:) Enter 실행 및 필터 도트 반복 키 기록 */
function handleCommandLineEnter(
  state: VimEditorState,
  runHandleKey: RunHandleKeyFn
): VimEditorState {
  const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
  const rawCmd = s.commandBuffer ?? '';
  const cmd = expandCmdlineAbbrev(s, rawCmd, 'Enter');
  const nextState = addHistory(s, cmd, ':');
  const res = executeCommandLine(
    { ...nextState, commandCursorCol: undefined, digraphPending: undefined },
    cmd,
    runHandleKey
  );
  if (s.filterOperatorKeys && !res.bell) {
    const bangIdx = cmd.indexOf('!');
    if (bangIdx >= 0) {
      const shellTail = cmd.slice(bangIdx + 1);
      return {
        ...res,
        filterOperatorKeys: undefined,
        incCommandPreview: undefined,
        lastChangeKeys: [...s.filterOperatorKeys, ...shellTail.split(''), 'Enter'],
      };
    }
  }
  return {
    ...res,
    commandCursorCol: undefined,
    digraphPending: undefined,
    pendingKeymapPrefix: undefined,
    filterOperatorKeys: undefined,
    incCommandPreview: undefined,
  };
}

/**
 * COMMAND 모드(: 또는 =) 키 입력 처리
 */
export function handleCommandLineModeKey(
  state: VimEditorState,
  key: string,
  runHandleKey: RunHandleKeyFn,
  dispatchKey?: DispatchKeyFn,
  macroDepth = 0
): VimEditorState {
  return syncIncCommandPreview(
    handleCommandLineModeKeyInner(state, key, runHandleKey, dispatchKey, macroDepth)
  );
}

function handleCommandLineModeKeyInner(
  state: VimEditorState,
  key: string,
  runHandleKey: RunHandleKeyFn,
  dispatchKey?: DispatchKeyFn,
  macroDepth = 0
): VimEditorState {
  // 1. 표현식 레지스터(=) 프롬프트 처리
  if (state.commandType === '=') {
    return handleExpressionRegisterKey(state, key);
  }

  // 1.5. 명령행 모드 키매핑 (:cmap / :cnoremap)
  const mappedRes = tryHandleCmdlineKeymap(state, key, runHandleKey, dispatchKey, macroDepth);
  if (mappedRes) return mappedRes;

  // 2. 일반 COMMAND (:) 모드 내 Ctrl+r ({reg}, =, <C-w>, <C-a>, <C-l>, <C-f>) 처리
  const cmdCtrlR = handleCmdlineCtrlRStep(state, key, ':');
  if (cmdCtrlR) return cmdCtrlR;

  // 2.5. Ctrl-v 리터럴 다음 문자 (커맨드라인 약어 확장 억제)
  if (state.literalNextPending) {
    if (key.length === 1 || key === 'Tab') {
      const ch = key === 'Tab' ? '\t' : key;
      const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
      return insertTextIntoCmdline({ ...s, literalNextPending: undefined }, ch);
    }
    state = { ...state, literalNextPending: undefined };
  }
  if (key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>') {
    return { ...state, literalNextPending: true };
  }

  // 2.6. Ctrl-k 다이그래프 입력 (:help c_CTRL-K)
  const cmdDigraph = handleCmdlineDigraphStep(
    state.wildmenu?.active ? acceptWildmenu(state) : state,
    key
  );
  if (cmdDigraph) return cmdDigraph;

  // Ctrl-] 수동 커맨드라인 약어 확장
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const rawBuf = s.commandBuffer ?? '';
    const col = s.commandCursorCol !== undefined ? Math.min(rawBuf.length, s.commandCursorCol) : rawBuf.length;
    const head = expandCmdlineAbbrev(s, rawBuf.slice(0, col), 'Ctrl-]');
    const tail = rawBuf.slice(col);
    return {
      ...s,
      commandBuffer: head + tail,
      commandCursorCol: tail.length > 0 ? head.length : undefined,
    };
  }

  // Ctrl+f: 커맨드라인 윈도우(q:) 열기
  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    return openCommandLineWindow(
      { ...state, commandCursorCol: undefined, digraphPending: undefined },
      ':',
      state.commandBuffer
    );
  }

  // 히스토리 순회 및 와일드메뉴 자동완성
  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p') {
    return navigateHistory(state, 'up', ':');
  }
  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n') {
    return navigateHistory(state, 'down', ':');
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d' || key === '<C-d>') {
    return listCmdlineCompletions(state);
  }
  if (key === 'Tab') return handleTabCompletion(state, false);
  if (key === 'Shift-Tab' || key === '<S-Tab>') return handleTabCompletion(state, true);
  if (state.wildmenu?.active) {
    if (key === 'ArrowRight') return handleTabCompletion(state, false);
    if (key === 'ArrowLeft') return handleTabCompletion(state, true);
  }

  // 3. 커맨드라인 취소(Esc / Ctrl-c), Backspace, 공통 편집, Enter 실행
  if (isCmdlineCancelKey(key)) {
    if (key === 'Escape' && state.wildmenu?.active) return cancelWildmenu(state, true);
    if (state.functionDraft) return cancelFunctionDraft(state);
    return exitCommandLineToNormal(state);
  }

  if (isBackspaceKey(key)) {
    const s = state.wildmenu?.active ? cancelWildmenu(state, false) : state;
    if (s.commandBuffer && s.commandBuffer.length > 0) return deleteCmdlineCharBackward(s);
    if (s.functionDraft) return s;
    return exitCommandLineToNormal(s);
  }

  const baseForCommon = state.wildmenu?.active ? acceptWildmenu(state) : state;
  const commonEdit = handleCmdlineCommonEditKey(baseForCommon, key);
  if (commonEdit) return commonEdit;

  if (key === 'Enter') {
    return handleCommandLineEnter(state, runHandleKey);
  }

  // 일반 타이핑 문자 누적 (비단어 문자 입력 시 커맨드라인 약어 확장, 중간 삽입 지원)
  if (key.length === 1) {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const rawBuf = s.commandBuffer ?? '';
    const col = s.commandCursorCol !== undefined ? Math.min(rawBuf.length, s.commandCursorCol) : rawBuf.length;
    const headRaw = rawBuf.slice(0, col);
    const tail = rawBuf.slice(col);
    const head = !/\w/.test(key) ? expandCmdlineAbbrev(s, headRaw, key) : headRaw;
    return {
      ...s,
      commandBuffer: head + key + tail,
      commandCursorCol: tail.length > 0 ? head.length + key.length : undefined,
    };
  }

  return state;
}
