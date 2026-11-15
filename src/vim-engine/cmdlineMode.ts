import { VimEditorState } from './types';
import { evaluateVimExpression } from './expressionParser';
import { executeCommandLine } from './commandLine';
import { addHistory, navigateHistory, openCommandLineWindow } from './cmdlineWindow';
import { handleTabCompletion, cancelWildmenu, acceptWildmenu } from './wildmenu';
import { expandCmdlineAbbrev } from './abbrevEngine';
import { cancelFunctionDraft } from './vimscriptEngine';
import { insertTextAtCursor, RunHandleKeyFn } from './engineHelpers';
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

/**
 * COMMAND 모드(: 또는 =) 키 입력 처리
 */
export function handleCommandLineModeKey(
  state: VimEditorState,
  key: string,
  runHandleKey: RunHandleKeyFn
): VimEditorState {
  // 1. 표현식 레지스터(=) 프롬프트 처리
  if (state.commandType === '=') {
    const digraphRes = handleCmdlineDigraphStep(state, key);
    if (digraphRes) return digraphRes;

    if (isCmdlineCancelKey(key)) {
      return restoreFromExpressionPrompt(state);
    }

    if (isBackspaceKey(key)) {
      if (state.commandBuffer && state.commandBuffer.length > 0) {
        return deleteCmdlineCharBackward(state);
      }
      return restoreFromExpressionPrompt(state);
    }

    const commonEdit = handleCmdlineCommonEditKey(state, key);
    if (commonEdit) return commonEdit;

    if (key === 'Enter') {
      const evalRes = evaluateVimExpression(state.commandBuffer ?? '');
      const returnCtx = state.expressionReturnContext;
      const returnMode = returnCtx?.mode ?? 'INSERT';

      if (!evalRes.success) {
        return restoreFromExpressionPrompt(state, {
          commandMessage: msg('E15: {v}', { v: evalRes.error ?? msg('잘못된 수식입니다') }),
        });
      }

      // 성공 시 '=' 레지스터에 결과값 저장
      const newRegisters = {
        ...(state.registers ?? {}),
        '=': {
          type: 'char' as const,
          content: evalRes.result,
        },
      };

      if (returnMode === 'COMMAND' || returnMode === 'SEARCH') {
        const prevState = restoreFromExpressionPrompt(state, { registers: newRegisters });
        return insertTextIntoCmdline(prevState, evalRes.result);
      } else if (returnMode === 'NORMAL') {
        // NORMAL 모드 복귀: '=' 레지스터 저장 및 activeRegister 를 '=' 로 설정 (바로 p 로 붙여넣기 가능)
        return restoreFromExpressionPrompt(state, {
          registers: newRegisters,
          activeRegister: '=',
          cursor: returnCtx?.cursor ?? state.cursor,
        });
      } else {
        // INSERT 모드 복귀 및 계산 결과 즉시 삽입
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
    }

    // 일반 수식 문자 타이핑 (커서 위치 삽입)
    if (key.length === 1) {
      return insertTextIntoCmdline(state, key);
    }

    return state;
  }

  // 2. 일반 COMMAND (:) 모드 내 Ctrl+r ({reg}, =, <C-w>, <C-a>, <C-l>, <C-f>) 처리
  const cmdCtrlR = handleCmdlineCtrlRStep(state, key, ':');
  if (cmdCtrlR) {
    return cmdCtrlR;
  }

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
    return {
      ...state,
      literalNextPending: true,
    };
  }

  // 2.6. Ctrl-k 다이그래프 입력 (:help c_CTRL-K)
  const cmdDigraph = handleCmdlineDigraphStep(
    state.wildmenu?.active ? acceptWildmenu(state) : state,
    key
  );
  if (cmdDigraph) {
    return cmdDigraph;
  }

  // Ctrl-] 수동 커맨드라인 약어 확장 (트리거 문자 삽입 없음)
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const expanded = expandCmdlineAbbrev(s, s.commandBuffer ?? '', 'Ctrl-]');
    return {
      ...s,
      commandBuffer: expanded,
      commandCursorCol: undefined,
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

  // 히스토리 순회 (↑/↓ 및 Ctrl+p/Ctrl+n)
  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p') {
    return navigateHistory(state, 'up', ':');
  }
  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n') {
    return navigateHistory(state, 'down', ':');
  }

  // 와일드메뉴 자동완성 키 처리 (Tab / Shift-Tab 및 활성 상태에서의 ArrowLeft/ArrowRight)
  if (key === 'Tab') {
    return handleTabCompletion(state, false);
  }
  if (key === 'Shift-Tab' || key === '<S-Tab>') {
    return handleTabCompletion(state, true);
  }
  if (state.wildmenu?.active) {
    if (key === 'ArrowRight') {
      return handleTabCompletion(state, false);
    }
    if (key === 'ArrowLeft') {
      return handleTabCompletion(state, true);
    }
  }

  // 3. 기존 콜론 커맨드라인 취소(Esc / Ctrl-c), 이동·편집, 실행
  if (isCmdlineCancelKey(key)) {
    if (key === 'Escape' && state.wildmenu?.active) {
      return cancelWildmenu(state, true);
    }
    // :function 본문 입력 중 Esc/Ctrl-c: 정의 취소
    if (state.functionDraft) {
      return cancelFunctionDraft(state);
    }
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      insertRegisterPending: undefined,
      literalNextPending: undefined,
      filterOperatorKeys: undefined,
      wildmenu: null,
    };
  }

  if (isBackspaceKey(key)) {
    const s = state.wildmenu?.active ? cancelWildmenu(state, false) : state;
    if (s.commandBuffer && s.commandBuffer.length > 0) {
      return deleteCmdlineCharBackward(s);
    }
    // :function 본문 입력 중에는 빈 줄에서 Backspace 를 눌러도 커맨드라인을 떠나지 않음
    if (s.functionDraft) {
      return s;
    }
    return {
      ...s,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      insertRegisterPending: undefined,
      literalNextPending: undefined,
      filterOperatorKeys: undefined,
      wildmenu: null,
    };
  }

  const baseForCommon = state.wildmenu?.active ? acceptWildmenu(state) : state;
  const commonEdit = handleCmdlineCommonEditKey(baseForCommon, key);
  if (commonEdit) {
    return commonEdit;
  }

  if (key === 'Enter') {
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
          lastChangeKeys: [...s.filterOperatorKeys, ...shellTail.split(''), 'Enter'],
        };
      }
    }
    return {
      ...res,
      commandCursorCol: undefined,
      digraphPending: undefined,
      filterOperatorKeys: undefined,
    };
  }

  // 일반 타이핑 문자 누적 (비단어 문자 입력 시 커맨드라인 약어 확장, 중간 삽입 지원)
  if (key.length === 1) {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const rawBuf = s.commandBuffer ?? '';
    const isAtEnd = s.commandCursorCol === undefined || s.commandCursorCol >= rawBuf.length;
    if (isAtEnd) {
      const buf = !/\w/.test(key) ? expandCmdlineAbbrev(s, rawBuf, key) : rawBuf;
      return {
        ...s,
        commandBuffer: buf + key,
        commandCursorCol: undefined,
      };
    }
    return insertTextIntoCmdline(s, key);
  }

  return state;
}
