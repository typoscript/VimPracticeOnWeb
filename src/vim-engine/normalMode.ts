import { VimEditorState } from './types';
import { OPERATOR_MOTION_KEYS } from './operatorMotion';
import { closeLspHover } from './lspEngine';
import { alternateBuffer } from './bufferEngine';
import { getWordAtCursor } from './search';
import { jumpToTag, popTagStack } from './tagEngine';
import { travelUndoTime } from './undoTreeEngine';
import { moveToLineStart } from './motions';
import {
  goToDeclaration,
  goToLastInsert,
  reselectLastVisual,
  traverseChangeList,
} from './advancedMotions';
import { executeGCtrlG } from './visualUtilities';
import { executeCommandLine } from './commandLine';
import { msg } from './messages';
import {
  parsePending,
  applyOperatorMotion,
  handleCtrlWKey,
  DispatchKeyFn,
  RunHandleKeyFn,
} from './engineHelpers';
import { handleNormalZPrefix } from './normalZPrefix';
import { handleNormalBracketPrefix } from './normalBracketPrefix';
import {
  handleNormalOpGPrefix,
  handleNormalCommentFormatOrCaseG,
  handleNormalGOperator,
} from './normalGPrefix';
import { handleNormalUserKeymap } from './normalKeymaps';
import {
  handleNormalSurroundPending,
  handleNormalMarkPending,
  handleNormalFilterShiftEqualPending,
  handleNormalTextObjectAndFindPending,
} from './normalOperatorPending';
import {
  handleNormalDCYCombineShortcut,
  handleNormalDCYOperators,
} from './normalDCYOperators';
import {
  handleNormalMacroAndDot,
  handleNormalViewportAndNavOps,
  handleNormalEditingAndMotionFallback,
} from './normalStandaloneCommands';

const PENDING_STARTERS = new Set([
  'd', 'c', 'r', 'g', 'y', '@', '>', '<', '=', '!', 'm', "'", '`', 'z', ']', '[', 'Z',
  'f', 'F', 't', 'T',
]);

/**
 * NORMAL 모드 키 입력 처리 오케스트레이터
 */
export function handleNormalModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  runHandleKey: RunHandleKeyFn,
  isReplayingDot = false,
  macroDepth = 0
): VimEditorState {
  const parsed = parsePending(state.pendingKeys);

  // 1. ESC 또는 타임아웃: 대기 중인 키매핑 접두사가 있으면 타임아웃 시 짧은 매핑을 해소하고, 그 외에는 대기 상태 초기화
  if (key === 'Timeout' && state.pendingKeymapPrefix) {
    const timeoutKeymapRes = handleNormalUserKeymap(
      state,
      key,
      dispatchKey,
      runHandleKey,
      isReplayingDot,
      macroDepth
    );
    if (timeoutKeymapRes?.handled) return timeoutKeymapRes.state;
  }
  if (key === 'Escape' || key === 'Timeout') {
    return {
      ...state,
      pendingKeys: undefined,
      pendingKeymapPrefix: undefined,
      activeRegister: undefined,
      lspHover: state.lspHover?.isOpen ? null : state.lspHover,
    };
  }

  // LSP 호버 창이 열린 상태에서 q 를 누르면 매크로 녹화 대신 호버 팝업을 닫음
  if (key === 'q' && state.lspHover?.isOpen && !state.pendingKeys) {
    return closeLspHover(state);
  }

  // gn / gN / dge / dgE / dg_ / dgg / dgc 등 연산자+g 접두 처리
  const opGRes = handleNormalOpGPrefix(state, key, isReplayingDot);
  if (opGRes) {
    if (opGRes.handled) return opGRes.state;
    state = opGRes.state;
  }

  // 1-0. 커스텀 키매핑 및 리더 키(Leader Key) 시뮬레이션
  const userKeymapRes = handleNormalUserKeymap(
    state,
    key,
    dispatchKey,
    runHandleKey,
    isReplayingDot,
    macroDepth
  );
  if (userKeymapRes) {
    if (userKeymapRes.handled) return userKeymapRes.state;
    state = userKeymapRes.state;
  }

  // 1-0-a. 명명된 레지스터 지정 ("{register})
  if (state.pendingKeys === '"') {
    if (key === '=') {
      return {
        ...state,
        mode: 'COMMAND',
        commandType: '=',
        commandBuffer: '',
        expressionReturnContext: {
          mode: 'NORMAL',
          cursor: { ...state.cursor },
        },
        pendingKeys: undefined,
      };
    }
    if (/^[a-zA-Z0-9"+*_\-:.%#\/]$/.test(key)) {
      const reg = key === '""' ? '"' : key;
      return { ...state, activeRegister: reg, pendingKeys: undefined };
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-b. 윈도우 분할 및 포커스 제어 ([count]Ctrl-w)
  if (state.pendingKeys?.endsWith('Ctrl-w') || state.pendingKeys?.endsWith('Ctrl+w')) {
    const countMatch = state.pendingKeys.match(/^(\d+)/);
    const wCount = countMatch ? parseInt(countMatch[1], 10) : undefined;
    return handleCtrlWKey(state, key, wCount);
  }
  if (key === '"' && !state.pendingKeys) {
    return { ...state, pendingKeys: '"' };
  }
  if ((key === 'Ctrl-w' || key === 'Ctrl+w') && (!state.pendingKeys || /^\d+$/.test(state.pendingKeys))) {
    return { ...state, pendingKeys: `${state.pendingKeys ?? ''}Ctrl-w` };
  }

  // 1-0-s. 순정 vim-surround 대기 (ds, cs, ys, yss)
  const surroundRes = handleNormalSurroundPending(state, key);
  if (surroundRes) return surroundRes;

  // 1-0-c~e. Ctrl-^ (대안 버퍼), Ctrl-] / Ctrl-t (ctags), Ctrl-v (VISUAL_BLOCK)
  if (
    key === 'Ctrl-^' || key === 'Ctrl+^' || key === 'ctrl-^' ||
    key === 'Ctrl-6' || key === 'Ctrl+6' || key === 'ctrl-6'
  ) {
    return alternateBuffer(state);
  }
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>' || key === 'Ctrl-5') {
    const curLine = state.lines[state.cursor.line] ?? '';
    const word = getWordAtCursor(curLine, state.cursor.col);
    if (!word) {
      return {
        ...state,
        commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
        pendingKeys: undefined,
      };
    }
    return { ...jumpToTag(state, word), pendingKeys: undefined };
  }
  if (key === 'Ctrl-t' || key === 'Ctrl+t' || key === 'ctrl-t' || key === '<C-t>') {
    return { ...popTagStack(state, parsed.count1 || 1), pendingKeys: undefined };
  }
  if (key === 'Ctrl+v' || key === 'Ctrl-v' || key === 'ctrl-v') {
    return {
      ...state,
      mode: 'VISUAL_BLOCK',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // 1-0-1~2. 연산자 결합 단축키 (d%/c%/y%/v% 및 d;/c;/y;/d,/c,/y,)
  const dcyShortcutRes = handleNormalDCYCombineShortcut(state, key, parsed, isReplayingDot);
  if (dcyShortcutRes) return dcyShortcutRes;

  // z 접두 (폴딩, 뷰포트 정렬, 맞춤법)
  const zRes = handleNormalZPrefix(state, key, parsed.operator, parsed.count1);
  if (zRes) return zRes;

  // 1-0-3~8. 뷰포트 스크롤, 점프 리스트, 숫자 증감, %, ;, ,, F1, K, J, ~, &
  const viewportNavRes = handleNormalViewportAndNavOps(state, key, parsed, isReplayingDot, runHandleKey);
  if (viewportNavRes) return viewportNavRes;

  // 1-0-9~11. 마크 연산자·단독 마크 점프·마크 설정 (m{char})
  const markRes = handleNormalMarkPending(state, key, parsed.operator, isReplayingDot);
  if (markRes) return markRes;

  // 1-0-12. gc/gq/gw/gu/gU/g~/g? 연산자
  const gCommentOrFormatRes = handleNormalCommentFormatOrCaseG(
    state,
    key,
    parsed.operator,
    parsed.totalCount,
    isReplayingDot,
    runHandleKey
  );
  if (gCommentOrFormatRes) return gCommentOrFormatRes;

  // 1-0-13. ! 필터, >/< 들여쓰기, = 자동 정렬 대기 상태
  const filterShiftEqualRes = handleNormalFilterShiftEqualPending(
    state,
    key,
    parsed,
    isReplayingDot,
    runHandleKey
  );
  if (filterShiftEqualRes) {
    if (filterShiftEqualRes.handled) return filterShiftEqualRes.state;
    state = filterShiftEqualRes.state;
  }

  // [ / ] 접두 및 연산자 + 괄호/섹션/메서드 모션
  const bracketRes = handleNormalBracketPrefix(state, key, isReplayingDot);
  if (bracketRes) {
    if (bracketRes.handled) return bracketRes.state;
    state = bracketRes.state;
  }

  // 1-1 ~ 3. 매크로(q, @, @@, @:), 도트 반복(.), 단일 문자 교체(r)
  const macroDotRes = handleNormalMacroAndDot(state, key, parsed, isReplayingDot, macroDepth, runHandleKey);
  if (macroDotRes) return macroDotRes;

  // 4 ~ 6. 텍스트 객체 대기 및 문자 탐색(f/t/F/T) 대기
  const textObjFindRes = handleNormalTextObjectAndFindPending(state, key, isReplayingDot);
  if (textObjFindRes) {
    if (textObjFindRes.handled) return textObjFindRes.state;
    state = textObjFindRes.state;
  }

  // 7. 숫자 카운트 입력 ('0' ~ '9')
  if (key === '0') {
    if (state.pendingKeys && /[0-9]$/.test(state.pendingKeys)) {
      return { ...state, pendingKeys: state.pendingKeys + '0' };
    }
    if (!state.pendingKeys) {
      return { ...state, cursor: moveToLineStart(state.lines, state.cursor) };
    }
  }
  if (/^[1-9]$/.test(key) && parsed.operator !== 'g') {
    return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
  }

  // 단일 g* 다중 키 토큰 직접 호출
  if (key === 'gd') return goToDeclaration(state, 'local');
  if (key === 'gD') return goToDeclaration(state, 'global');
  if (key === 'gi') return goToLastInsert(state);
  if (key === 'gv') return reselectLastVisual(state);
  if (key === 'g;') return traverseChangeList(state, 'prev', parsed.totalCount);
  if (key === 'g,') return traverseChangeList(state, 'next', parsed.totalCount);
  if (key === 'g-') return travelUndoTime(state, 'older', parsed.totalCount);
  if (key === 'g+') return travelUndoTime(state, 'newer', parsed.totalCount);

  // 8-0. 연산자 + 일반 모션 (dj, dk, dh, dl, db, dB, d^, dG, cj, yk 등)
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y') &&
    OPERATOR_MOTION_KEYS.has(key)
  ) {
    return applyOperatorMotion(state, parsed.operator, key, parsed, isReplayingDot);
  }

  // 8. 연산자 대기 처리 (d, c, y, g)
  const dcyRes = handleNormalDCYOperators(state, key, parsed, isReplayingDot);
  if (dcyRes) {
    if (dcyRes.handled) return dcyRes.state;
    state = dcyRes.state;
  } else if (parsed.operator === 'g') {
    const gOpRes = handleNormalGOperator(
      state,
      key,
      parsed.count1,
      parsed.totalCount,
      isReplayingDot,
      runHandleKey
    );
    if (gOpRes.handled) return gOpRes.state;
    state = gOpRes.state;
  }

  if (key === 'g<Ctrl-g>' || key === 'g<C-g>' || key === 'g Ctrl-g' || key === 'g Ctrl+g') {
    return executeGCtrlG(state);
  }

  // ZZ / ZQ: 저장 후 닫기(:wq) / 저장 없이 닫기(:q!)
  if (state.pendingKeys === 'Z') {
    if (key === 'Z') return executeCommandLine({ ...state, pendingKeys: undefined }, 'wq', runHandleKey);
    if (key === 'Q') return executeCommandLine({ ...state, pendingKeys: undefined }, 'q!', runHandleKey);
    return { ...state, pendingKeys: undefined };
  }

  // 9. 연산자 및 매크로 키 대기 등록
  if (PENDING_STARTERS.has(key) || (key === 'q' && !state.recordingMacro)) {
    return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
  }

  // 10 ~ 11. 단일 키 편집·모드 진입 및 모션 평가
  return handleNormalEditingAndMotionFallback(state, key, parsed, isReplayingDot);
}
