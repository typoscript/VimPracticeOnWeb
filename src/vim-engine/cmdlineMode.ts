import { VimEditorState } from './types';
import { getRegisterContent } from './registers';
import { evaluateVimExpression } from './expressionParser';
import { executeCommandLine } from './commandLine';
import { addHistory, navigateHistory, openCommandLineWindow } from './cmdlineWindow';
import { handleTabCompletion, cancelWildmenu, acceptWildmenu } from './wildmenu';
import { expandCmdlineAbbrev } from './abbrevEngine';
import { cancelFunctionDraft } from './vimscriptEngine';
import { insertTextAtCursor, RunHandleKeyFn } from './engineHelpers';
import { msg } from './messages';

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
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      const returnMode = state.expressionReturnContext?.mode ?? 'INSERT';
      return {
        ...state,
        mode: returnMode,
        commandBuffer: undefined,
        commandType: undefined,
        expressionReturnContext: undefined,
        insertRegisterPending: undefined,
      };
    }

    if (key === 'Backspace') {
      if (state.commandBuffer && state.commandBuffer.length > 0) {
        return {
          ...state,
          commandBuffer: state.commandBuffer.slice(0, -1),
        };
      }
      const returnMode = state.expressionReturnContext?.mode ?? 'INSERT';
      return {
        ...state,
        mode: returnMode,
        commandBuffer: undefined,
        commandType: undefined,
        expressionReturnContext: undefined,
        insertRegisterPending: undefined,
      };
    }

    if (key === 'Enter') {
      const evalRes = evaluateVimExpression(state.commandBuffer ?? '');
      const returnCtx = state.expressionReturnContext;
      const returnMode = returnCtx?.mode ?? 'INSERT';

      if (!evalRes.success) {
        return {
          ...state,
          mode: returnMode,
          commandBuffer: undefined,
          commandType: undefined,
          expressionReturnContext: undefined,
          commandMessage: msg('E15: {v}', { v: evalRes.error ?? msg('잘못된 수식입니다') }),
        };
      }

      // 성공 시 '=' 레지스터에 결과값 저장
      const newRegisters = {
        ...(state.registers ?? {}),
        '=': {
          type: 'char' as const,
          content: evalRes.result,
        },
      };

      if (returnMode === 'COMMAND') {
        const prevCmd = returnCtx?.commandBuffer ?? '';
        return {
          ...state,
          mode: 'COMMAND',
          commandType: ':',
          commandBuffer: prevCmd + evalRes.result,
          registers: newRegisters,
          expressionReturnContext: undefined,
        };
      } else if (returnMode === 'NORMAL') {
        // NORMAL 모드 복귀: '=' 레지스터 저장 및 activeRegister 를 '=' 로 설정 (바로 p 로 붙여넣기 가능)
        return {
          ...state,
          mode: 'NORMAL',
          registers: newRegisters,
          activeRegister: '=',
          commandBuffer: undefined,
          commandType: undefined,
          expressionReturnContext: undefined,
          cursor: returnCtx?.cursor ?? state.cursor,
        };
      } else {
        // INSERT 모드 복귀 및 계산 결과 즉시 삽입
        const stateWithRegisters: VimEditorState = {
          ...state,
          mode: 'INSERT',
          registers: newRegisters,
          commandBuffer: undefined,
          commandType: undefined,
          expressionReturnContext: undefined,
          cursor: returnCtx?.cursor ?? state.cursor,
        };

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

    // 일반 수식 문자 타이핑
    if (key.length === 1) {
      return {
        ...state,
        commandBuffer: (state.commandBuffer ?? '') + key,
      };
    }

    return state;
  }

  // 2. 일반 COMMAND (:) 모드 내 Ctrl+r {reg} 처리
  if (state.insertRegisterPending) {
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      return { ...state, insertRegisterPending: undefined };
    }

    if (key === '=') {
      return {
        ...state,
        commandType: '=',
        expressionReturnContext: {
          mode: 'COMMAND',
          commandBuffer: state.commandBuffer,
        },
        commandBuffer: '',
        insertRegisterPending: undefined,
      };
    }

    const regKey = key.length === 1 ? key : undefined;
    if (regKey) {
      const regClip = getRegisterContent(state, regKey);
      const textToInsert = regClip?.content ?? '';
      return {
        ...state,
        commandBuffer: (state.commandBuffer ?? '') + textToInsert,
        insertRegisterPending: undefined,
      };
    }

    return { ...state, insertRegisterPending: undefined };
  }

  if (key === 'Ctrl-r' || key === 'Ctrl+r' || key === 'ctrl-r' || key === '<C-r>') {
    return {
      ...state,
      insertRegisterPending: true,
    };
  }

  // 2.5. Ctrl-v 리터럴 다음 문자 (커맨드라인 약어 확장 억제)
  if (state.literalNextPending) {
    if (key.length === 1 || key === 'Tab') {
      const ch = key === 'Tab' ? '\t' : key;
      const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
      return {
        ...s,
        commandBuffer: (s.commandBuffer ?? '') + ch,
        literalNextPending: undefined,
      };
    }
    state = { ...state, literalNextPending: undefined };
  }

  if (key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>') {
    return {
      ...state,
      literalNextPending: true,
    };
  }

  // Ctrl-] 수동 커맨드라인 약어 확장 (트리거 문자 삽입 없음)
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const expanded = expandCmdlineAbbrev(s, s.commandBuffer ?? '', 'Ctrl-]');
    return {
      ...s,
      commandBuffer: expanded,
    };
  }

  // Ctrl+f: 커맨드라인 윈도우(q:) 열기
  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    return openCommandLineWindow(state, ':', state.commandBuffer);
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

  // 3. 기존 콜론 커맨드라인 키 처리
  if (key === 'Escape') {
    if (state.wildmenu?.active) {
      return cancelWildmenu(state, true);
    }
    // :function 본문 입력 중 Esc: 정의 취소
    if (state.functionDraft) {
      return cancelFunctionDraft(state);
    }
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      insertRegisterPending: undefined,
      literalNextPending: undefined,
      filterOperatorKeys: undefined,
      wildmenu: null,
    };
  }

  if (key === 'Backspace') {
    const s = state.wildmenu?.active ? cancelWildmenu(state, false) : state;
    if (s.commandBuffer && s.commandBuffer.length > 0) {
      return {
        ...s,
        commandBuffer: s.commandBuffer.slice(0, -1),
      };
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
      insertRegisterPending: undefined,
      literalNextPending: undefined,
      filterOperatorKeys: undefined,
      wildmenu: null,
    };
  }

  if (key === 'Enter') {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const rawCmd = s.commandBuffer ?? '';
    const cmd = expandCmdlineAbbrev(s, rawCmd, 'Enter');
    const nextState = addHistory(s, cmd, ':');
    const res = executeCommandLine(nextState, cmd, runHandleKey);
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
      filterOperatorKeys: undefined,
    };
  }

  // 일반 타이핑 문자 누적 (비단어 문자 입력 시 커맨드라인 약어 확장)
  if (key.length === 1) {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const rawBuf = s.commandBuffer ?? '';
    const buf = !/\w/.test(key) ? expandCmdlineAbbrev(s, rawBuf, key) : rawBuf;
    return {
      ...s,
      commandBuffer: buf + key,
    };
  }

  return state;
}
