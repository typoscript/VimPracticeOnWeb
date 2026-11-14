import { VimEditorState } from './types';
import { clampCursor, getMaxCol } from './cursor';
import { starSearchPattern } from './vimRegex';
import { OPERATOR_MOTION_KEYS } from './operatorMotion';
import {
  moveToLineStart,
  moveToLineEnd,
  moveToFirstNonBlank,
  moveToFirstLine,
  moveToLastLine,
  moveToNextWord,
  moveToNextWORD,
  moveToWordEnd,
  moveToWORDEnd,
} from './motions';
import {
  deleteWord,
  deleteChar,
  changeWord,
  changeLine,
  changeToEndOfLine,
  replaceChar,
  insertAtFirstNonBlank,
  appendAtLineEnd,
  openLineBelow,
  openLineAbove,
  undo,
  redo,
  pushUndoSnapshot,
  getCharType,
} from './operators';
import { syncRegisters, parseMacroStringToKeys } from './registers';
import { alternateBuffer } from './bufferEngine';
import { nextTab, prevTab } from './tabEngine';
import { openCommandLineWindow } from './cmdlineWindow';
import { openHelp } from './helpEngine';
import { jumpDiffHunk, diffObtain, diffPut } from './diffEngine';
import { jumpToNextSpellError, jumpToPrevSpellError, startSpellSuggest, addSpellGoodWord, addSpellWrongWord } from './spellEngine';
import { travelUndoTime } from './undoTreeEngine';
import { jumpToTag, popTagStack, tjumpTag } from './tagEngine';
import { switchPaneFocus } from './splitWindow';
import { deleteVisualSelection, yankVisualSelection, executeGCtrlG } from './visual';
import { findMatchingBracket } from './bracketMatch';
import {
  moveToNextParagraph,
  moveToPrevParagraph,
  deleteParagraph,
  changeParagraph,
  yankParagraph,
  goToDeclaration,
  goToLastInsert,
  reselectLastVisual,
  traverseChangeList,
} from './advancedMotions';
import { moveFind, executeFindOperator } from './findChar';
import {
  executeTextObjectOperator,
  TextObjectType,
  executeIndentObjectOperator,
  IndentObjectType,
  executeParagraphObjectOperator,
  ParagraphObjectType,
  getParagraphObjectRange,
  executeLinewiseObjectOperator,
} from './textObjects';
import { toggleCommentRange, getCommentTextObjectRange } from './commentEngine';
import { formatRange } from './formatEngine';
import { gotoFileUnderCursor } from './gotoFileEngine';
import { findMatches, findNextMatch, findPrevMatch, getWordAtCursor, applySearchOffset } from './search';
import { executeCommandLine } from './commandLine';
import { parseKeySequence } from './keymapEngine';
import { executeDeleteSurround, executeChangeSurround, executeYouSurround, executeLineSurround } from './surroundEngine';
import {
  scrollToCenter,
  scrollToTop,
  scrollToBottom,
  cursorToHigh,
  cursorToMiddle,
  cursorToLow,
  scrollHalfPageDown,
  scrollHalfPageUp,
  scrollFullPageDown,
  scrollFullPageUp,
  scrollLineDown,
  scrollLineUp,
} from './viewport';
import { recordJump, jumpOlder, jumpNewer, setMark, jumpToMark, executeMarkOperator } from './marks';
import {
  joinLines,
  toggleCaseChar,
  executeCaseMotion,
  indentLines,
  modifyNumberAtCursor,
  formatIndentLines,
  formatIndentRange,
} from './lineOperators';
import {
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  deleteFoldOrLine,
  yankFoldOrLine,
  createFold,
  deleteFoldAtCursor,
  deleteAllFoldsAtCursor,
  eliminateAllFolds,
  detectFoldBlocks,
} from './folding';
import { msg } from './messages';
import { executeGn } from './searchMode';
import {
  parsePending,
  ringBell,
  NORMAL_EXTRA_KEYS,
  moveByExtraMotion,
  findShiftRange,
  describeCharAt,
  isFailedMotion,
  evaluateMotionWithCount,
  handleCtrlWKey,
  executePutVariant,
  applyOperatorMotion,
  getOppositeMotion,
  DispatchKeyFn,
  RunHandleKeyFn,
} from './engineHelpers';

/**
 * NORMAL 모드 키 입력 처리
 */
export function handleNormalModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  runHandleKey: RunHandleKeyFn,
  isReplayingDot = false,
  macroDepth = 0
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const parsed = parsePending(state.pendingKeys);

  // 1. ESC 또는 타임아웃: 대기 중인 모든 키 시퀀스 취소
  if (key === 'Escape' || key === 'Timeout') {
    return {
      ...state,
      pendingKeys: undefined,
      activeRegister: undefined,
    };
  }

  // gn / gN (검색 매치 텍스트 객체 및 cgn, dgn, ygn 결합)
  const gnMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])?g$/);
  if (gnMatch && (key === 'n' || key === 'N')) {
    const op = gnMatch[2];
    return executeGn(state, key === 'n', op, isReplayingDot);
  }
  // dge / dgE / dg_ (cge, yg_ ...)
  const gMotionOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/);
  if (gMotionOpMatch && (key === 'e' || key === 'E' || key === '_')) {
    const op = gMotionOpMatch[2] as 'd' | 'c' | 'y';
    const total = (gMotionOpMatch[1] ? parseInt(gMotionOpMatch[1], 10) : 1) * (gMotionOpMatch[3] ? parseInt(gMotionOpMatch[3], 10) : 1);
    return applyOperatorMotion(state, op, `g${key}`, { operator: op, count1: total > 1 ? total : undefined, totalCount: total }, isReplayingDot);
  }

  // dgg / cgg / ygg ([count]은 줄 번호)
  const ggOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/);
  if (ggOpMatch && key === 'g') {
    const op = ggOpMatch[2] as 'd' | 'c' | 'y';
    const hasCount = !!(ggOpMatch[1] || ggOpMatch[3]);
    const lineCount = parseInt(ggOpMatch[1] ?? '1', 10) * parseInt(ggOpMatch[3] ?? '1', 10);
    return applyOperatorMotion(state, op, 'gg', { count1: hasCount ? lineCount : undefined, operator: op, totalCount: lineCount }, isReplayingDot);
  }
  // dgc / cgc / ygc (vgc): 연속된 주석 블록 텍스트 객체
  const gcTextObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdyv])([1-9][0-9]*)?g$/);
  if (gcTextObjMatch && key === 'c') {
    const op = gcTextObjMatch[2] as 'd' | 'c' | 'y' | 'v';
    const range = getCommentTextObjectRange(state);
    if (!range) return ringBell(state);
    const res = executeLinewiseObjectOperator(state, op, range);
    const synced = syncRegisters(state, res, op === 'y');
    const opKeys = [op, 'g', 'c'];
    if (op === 'c') {
      return { ...synced, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys };
    }
    if (op === 'd') {
      return { ...synced, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys };
    }
    return synced;
  }
  if (state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/)) {
    // cg, dg, yg 대기 상태에서 유효한 후속 키가 아니면 pending 취소
    state = { ...state, pendingKeys: undefined };
  }

  // 1-0. 커스텀 키매핑 및 리더 키(Leader Key) 시뮬레이션
  const leaderKey = state.leaderKey || ' ';

  // 1-0-1. 대기 중인 리더 키('<leader>') 조합 처리
  if (state.pendingKeys === '<leader>' || state.pendingKeys === leaderKey) {
    const leaderCombo = `<leader>${key}`;
    const mapped =
      state.userKeymaps?.[`n:${leaderCombo}`] ||
      state.userKeymaps?.[leaderCombo] ||
      state.userKeymaps?.[`n:${leaderKey}${key}`] ||
      state.userKeymaps?.[`${leaderKey}${key}`];

    if (mapped) {
      if (mapped.startsWith(':')) {
        const cmd = mapped.slice(1).replace(/<CR>$/i, '');
        return executeCommandLine(
          { ...state, pendingKeys: undefined },
          cmd,
          runHandleKey
        );
      }
      let s: VimEditorState = { ...state, pendingKeys: undefined };
      const tokens = parseKeySequence(mapped, leaderKey);
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, macroDepth + 1);
        if (s.bell) break;
      }
      return s;
    }

    // 일치하는 리더 키 매핑이 없으면 pending 해제 후 일반 키로 처리
    state = { ...state, pendingKeys: undefined };
  }

  // 1-0-2. 리더 키 입력 감지 (대기 상태로 전환)
  const isLeaderKey =
    key === leaderKey || (leaderKey === ' ' && (key === ' ' || key === 'Space'));
  if (isLeaderKey && !state.pendingKeys) {
    const hasLeaderMap = Object.keys(state.userKeymaps ?? {}).some(
      (k) =>
        k.includes('<leader>') ||
        k.startsWith(`n:${leaderKey}`) ||
        k.startsWith(leaderKey)
    );
    if (hasLeaderMap) {
      return {
        ...state,
        pendingKeys: '<leader>',
      };
    }
  }

  // 1-0-3. 단일 키 매핑 처리 (H -> ^, L -> $, Ctrl-h -> Ctrl-w h, Y -> y$ 등)
  if (!state.pendingKeys && macroDepth === 0) {
    const singleMapped =
      state.userKeymaps?.[`n:${key}`] || state.userKeymaps?.[key];
    if (singleMapped) {
      if (singleMapped === '^') {
        return { ...state, cursor: moveToFirstNonBlank(state.lines, state.cursor) };
      }
      if (singleMapped === '$') {
        return { ...state, cursor: moveToLineEnd(state.lines, state.cursor) };
      }
      if (singleMapped === 'Ctrl-w h') {
        return switchPaneFocus(state, 0);
      }
      if (singleMapped === 'Ctrl-w l') {
        return switchPaneFocus(state, 1);
      }
      if (singleMapped === 'Ctrl-w j') {
        return switchPaneFocus(state, 1);
      }
      if (singleMapped === 'Ctrl-w k') {
        return switchPaneFocus(state, 0);
      }
      if (singleMapped.startsWith(':')) {
        const cmd = singleMapped.slice(1).replace(/<CR>$/i, '');
        return executeCommandLine(state, cmd, runHandleKey);
      }
      let s: VimEditorState = state;
      const tokens = parseKeySequence(singleMapped, leaderKey);
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, macroDepth + 1);
        if (s.bell) break;
      }
      return s;
    }
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
      return {
        ...state,
        activeRegister: reg,
        pendingKeys: undefined,
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 1-0-b. 윈도우 분할 및 포커스 제어 (Ctrl-w)
  if (state.pendingKeys === 'Ctrl-w' || state.pendingKeys === 'Ctrl+w') {
    return handleCtrlWKey(state, key, parsed.count1);
  }

  if (key === '"' && !state.pendingKeys) {
    return {
      ...state,
      pendingKeys: '"',
    };
  }

  if ((key === 'Ctrl-w' || key === 'Ctrl+w') && !state.pendingKeys) {
    return {
      ...state,
      pendingKeys: 'Ctrl-w',
    };
  }

  // 1-0-s. 순정 vim-surround 지원 (ds{char}, cs{old}{new}, ys{motion}{char}, yss{char})
  // 1) Delete Surround (ds{char})
  if (state.pendingKeys === 'd' && key === 's') {
    return { ...state, pendingKeys: 'ds' };
  }
  if (state.pendingKeys === 'ds') {
    return executeDeleteSurround(state, key);
  }

  // 2) Change Surround (cs{old}{new})
  if (state.pendingKeys === 'c' && key === 's') {
    return { ...state, pendingKeys: 'cs' };
  }
  if (state.pendingKeys === 'cs') {
    return { ...state, pendingKeys: 'cs' + key };
  }
  if (state.pendingKeys?.startsWith('cs') && state.pendingKeys.length === 3) {
    const oldChar = state.pendingKeys[2];
    return executeChangeSurround(state, oldChar, key);
  }

  // 3) You Surround / Line Surround (ys{motion}{char}, yss{char})
  if (state.pendingKeys === 'y' && key === 's') {
    return { ...state, pendingKeys: 'ys' };
  }
  if (state.pendingKeys === 'ys') {
    if (key === 's' || key === '_') {
      return { ...state, pendingKeys: 'yss' };
    }
    if (key === 'i' || key === 'a') {
      return { ...state, pendingKeys: 'ys' + key };
    }
    if (key === '$' || key === 'e' || key === 'w') {
      return { ...state, pendingKeys: 'ys' + key };
    }
    return { ...state, pendingKeys: undefined };
  }
  if (state.pendingKeys === 'yss') {
    return executeLineSurround(state, key);
  }
  if (state.pendingKeys === 'ysi' || state.pendingKeys === 'ysa') {
    return { ...state, pendingKeys: state.pendingKeys + key };
  }
  if (
    state.pendingKeys?.startsWith('ys') &&
    state.pendingKeys.length >= 3 &&
    state.pendingKeys !== 'yss'
  ) {
    const motion = state.pendingKeys.slice(2);
    return executeYouSurround(state, motion, key);
  }

  // 1-0-c. 직전 대안 버퍼 토글 (Ctrl-^ / Ctrl-6)
  if (
    key === 'Ctrl-^' ||
    key === 'Ctrl+^' ||
    key === 'ctrl-^' ||
    key === 'Ctrl-6' ||
    key === 'Ctrl+6' ||
    key === 'ctrl-6'
  ) {
    return alternateBuffer(state);
  }

  // 1-0-d. 태그 점프: Ctrl+] (또는 Ctrl-] / <C-]>)
  if (
    key === 'Ctrl-]' ||
    key === 'Ctrl+]' ||
    key === 'ctrl-]' ||
    key === '<C-]>' ||
    key === 'Ctrl-5'
  ) {
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

  // 1-0-e. 태그 스택 팝: Ctrl+t (또는 Ctrl-t / <C-t>)
  if (
    key === 'Ctrl-t' ||
    key === 'Ctrl+t' ||
    key === 'ctrl-t' ||
    key === '<C-t>'
  ) {
    const count = parsed.count1 || 1;
    return { ...popTagStack(state, count), pendingKeys: undefined };
  }

  // 1-0. Ctrl+v: VISUAL_BLOCK 모드 진입
  if (key === 'Ctrl+v' || key === 'Ctrl-v' || key === 'ctrl-v') {
    return {
      ...state,
      mode: 'VISUAL_BLOCK',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // 1-0-1. 연산자 결합: d%, c%, y%, v%
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y' || parsed.operator === 'v') &&
    key === '%'
  ) {
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      const op = parsed.operator;
      const start = state.cursor;
      const end = matchPos;
      if (op === 'v') {
        return {
          ...state,
          mode: 'VISUAL',
          visualAnchor: start,
          cursor: end,
          pendingKeys: undefined,
        };
      }
      const stateWithAnchor: VimEditorState = {
        ...state,
        mode: 'VISUAL',
        visualAnchor: start,
        cursor: end,
      };
      if (op === 'd') {
        const res = deleteVisualSelection(stateWithAnchor);
        const synced = syncRegisters(state, res, false);
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, '%'],
        };
      }
      if (op === 'c') {
        const res = deleteVisualSelection(stateWithAnchor);
        const synced = syncRegisters(state, res, false);
        return {
          ...synced,
          mode: 'INSERT',
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, '%'],
        };
      }
      if (op === 'y') {
        const res = yankVisualSelection(stateWithAnchor);
        return syncRegisters(state, res, true);
      }
    }
    return ringBell(state);
  }

  // 1-0-2. 연산자 결합: d;, c;, y;, d,, c,, y,
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y') &&
    (key === ';' || key === ',')
  ) {
    if (state.lastCharSearch) {
      const op = parsed.operator;
      const motion = key === ';' ? state.lastCharSearch.type : getOppositeMotion(state.lastCharSearch.type);
      if (!moveFind(state.lines, state.cursor, motion, state.lastCharSearch.char, parsed.totalCount)) {
        return ringBell(state);
      }
      const res = executeFindOperator(state, op, motion, state.lastCharSearch.char, parsed.totalCount);
      const synced = syncRegisters(state, res, op === 'y');
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, key],
        };
      }
      if (op === 'd') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, key],
        };
      }
      return synced;
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-3. 단독 %: 괄호 짝 점프
  if (key === '%' && !state.pendingKeys) {
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: matchPos,
        pendingKeys: undefined,
      };
    }
    return ringBell(state);
  }

  // 1-0-4. 단독 ; 및 ,: 줄 내 탐색 반복
  if (key === ';' && !state.pendingKeys) {
    if (state.lastCharSearch) {
      const nextPos = moveFind(
        state.lines,
        state.cursor,
        state.lastCharSearch.type,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) {
        return {
          ...state,
          cursor: nextPos,
          pendingKeys: undefined,
        };
      }
    }
    return ringBell(state);
  }

  if (key === ',' && !state.pendingKeys) {
    if (state.lastCharSearch) {
      const oppMotion = getOppositeMotion(state.lastCharSearch.type);
      const nextPos = moveFind(
        state.lines,
        state.cursor,
        oppMotion,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) {
        return {
          ...state,
          cursor: nextPos,
          pendingKeys: undefined,
        };
      }
    }
    return ringBell(state);
  }

  // 1-0-5. Ctrl-o / Ctrl-i: 점프 리스트 탐색
  if ((key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'ctrl-o') && !parsed.operator) {
    return jumpOlder(state);
  }
  if ((key === 'Ctrl-i' || key === 'Ctrl+i' || key === 'ctrl-i') && !parsed.operator) {
    return jumpNewer(state);
  }

  // 1-0-6. Ctrl-a / Ctrl-x: 커서 위치 숫자 증감
  if ((key === 'Ctrl-a' || key === 'Ctrl+a' || key === 'ctrl-a') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, parsed.totalCount);
    // 커서 뒤에 숫자가 없으면 실패 (Vim 의 beep)
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(state);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-a'] : ['Ctrl-a'];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if ((key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, -parsed.totalCount);
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(state);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-x'] : ['Ctrl-x'];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }

  // 뷰포트 스크롤 및 화면 기준 커서 이동:
  // H, M, L: 화면 뷰포트 기준 최상단, 중앙, 최하단 줄로 이동
  if (key === 'H' && !parsed.operator) {
    return cursorToHigh(state);
  }
  if (key === 'M' && !parsed.operator) {
    return cursorToMiddle(state);
  }
  if (key === 'L' && !parsed.operator) {
    return cursorToLow(state);
  }

  // Ctrl-d / Ctrl-u / Ctrl-f / Ctrl-b / Ctrl-e / Ctrl-y: 뷰포트 스크롤
  if ((key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') && !parsed.operator) {
    return scrollHalfPageDown(state);
  }
  if ((key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') && !parsed.operator) {
    return scrollHalfPageUp(state);
  }
  if ((key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') && !parsed.operator) {
    return scrollFullPageDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-b' || key === 'Ctrl+b' || key === 'ctrl-b') && !parsed.operator) {
    return scrollFullPageUp(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-e' || key === 'Ctrl+e' || key === 'ctrl-e') && !parsed.operator) {
    return scrollLineDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-y' || key === 'Ctrl+y' || key === 'ctrl-y') && !parsed.operator) {
    return scrollLineUp(state, parsed.totalCount);
  }

  // zfip / zfap / zfi{ / zfa{ 텍스트 객체 수동 폴드 생성 (startsWith('zf') 보다 먼저 검사)
  if (state.pendingKeys === 'zfa' || state.pendingKeys === 'zfi') {
    const isInner = state.pendingKeys === 'zfi';
    if (key === 'p') {
      const range = getParagraphObjectRange(state.lines, state.cursor.line, isInner ? 'ip' : 'ap', 1);
      if (range) {
        return createFold(state, range.startLine, range.endLine);
      }
      return ringBell({ ...state, pendingKeys: undefined });
    }
    if (key === '{' || key === '}' || key === 'B') {
      const detected = detectFoldBlocks(state.lines, state.options?.foldmethod, state.options?.shiftwidth);
      const found = detected.find((b) => b.startRow <= state.cursor.line && state.cursor.line <= b.endRow);
      if (found) {
        return createFold(state, found.startRow, found.endRow);
      }
      return ringBell({ ...state, pendingKeys: undefined });
    }
    return { ...state, bell: true, pendingKeys: undefined };
  }

  // zf{motion}: 수동 폴드 생성 모션 처리
  if (state.pendingKeys?.startsWith('zf')) {
    const rawCountStr = state.pendingKeys.slice(2);
    // 숫자 누적
    if (/^[0-9]$/.test(key) && (rawCountStr.length > 0 || key !== '0')) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }

    const count = parseInt(rawCountStr || '1', 10);
    const curLine = state.cursor.line;

    if (key === 'j' || key === 'ArrowDown') {
      return createFold(state, curLine, curLine + count);
    }
    if (key === 'k' || key === 'ArrowUp') {
      return createFold(state, curLine - count, curLine);
    }
    if (key === 'G') {
      return createFold(state, curLine, state.lines.length - 1);
    }
    if (key === 'g' && state.pendingKeys === 'zf') {
      return { ...state, pendingKeys: 'zfg' };
    }
    if (key === 'g' && state.pendingKeys === 'zfg') {
      return createFold(state, 0, curLine);
    }
    if (key === '_' || key === 'Enter') {
      return createFold(state, curLine, curLine + count - 1);
    }
    if (key === 'a' || key === 'i') {
      return { ...state, pendingKeys: `zf${key}` };
    }
    return { ...state, bell: true, pendingKeys: undefined };
  }

  // zz, zt, zb: 뷰포트 정렬 및 zc, zo, za, zM, zR, zd, zD, zE, zf: 코드 폴딩
  if (state.pendingKeys === 'z' || parsed.operator === 'z') {
    if (key === 'z') return scrollToCenter(state);
    if (key === 't') return scrollToTop(state);
    if (key === 'b') return scrollToBottom(state);
    if (key === 'c') return foldClose(state);
    if (key === 'o') return foldOpen(state);
    if (key === 'a') return foldToggle(state);
    if (key === 'M') return foldCloseAll(state);
    if (key === 'R') return foldOpenAll(state);
    if (key === 'd') return deleteFoldAtCursor(state);
    if (key === 'D') return deleteAllFoldsAtCursor(state);
    if (key === 'E') return eliminateAllFolds(state);
    if (key === 'f') return { ...state, pendingKeys: 'zf' };
    if (key === '=') return { ...startSpellSuggest(state), pendingKeys: undefined };
    if (key === 'g') return { ...addSpellGoodWord(state), pendingKeys: undefined };
    if (key === 'w') return { ...addSpellWrongWord(state), pendingKeys: undefined };
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-6-1. &: 직전 :s 를 현재 줄에 다시 실행 (플래그 없이, :s 와 동일)
  if (key === '&' && !state.pendingKeys) {
    const res = executeCommandLine({ ...state, pendingKeys: undefined }, 's', runHandleKey);
    return res.bell ? res : { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['&'] };
  }

  // 1-0-6-2. F1: 순정 Vim 메인 도움말 열기
  if (key === 'F1' && !state.pendingKeys) {
    return { ...openHelp(state), pendingKeys: undefined };
  }

  // 1-0-6-3. K: 커서 위치 단어 도움말 열기 (:help <cword>)
  if (key === 'K' && !parsed.operator && !state.pendingKeys) {
    const curLine = state.lines[state.cursor.line] ?? '';
    const word = getWordAtCursor(curLine, state.cursor.col);
    return { ...openHelp(state, word ?? undefined), pendingKeys: undefined };
  }

  // 1-0-7. J: 줄 이어 붙이기
  if (key === 'J' && !parsed.operator) {
    // 마지막 줄에서는 이어 붙일 줄이 없으므로 실패
    if (state.cursor.line >= state.lines.length - 1) return ringBell(state);
    const res = joinLines(state, parsed.totalCount);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'J'] : ['J'];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }

  // 1-0-8. ~: 커서 위치 문자 대소문자 반전
  if (key === '~' && !parsed.operator) {
    const res = toggleCaseChar(state, parsed.totalCount);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '~'] : ['~'];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }

  // 1-0-9. 마크 연산자 결합 (d'a, d`a, c'a, c`a, y'a, y`a, v'a, v`a)
  const markOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv])(['`])$/);
  if (markOpMatch) {
    const op = markOpMatch[2] as 'd' | 'c' | 'y' | 'v';
    const quote = markOpMatch[3] as "'" | '`';
    if (/^[a-zA-Z]$/.test(key)) {
      const isLineWise = quote === "'";
      const res = executeMarkOperator(state, op, key, isLineWise);
      const synced = syncRegisters(state, res, op === 'y');
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, quote, key],
        };
      }
      if (op === 'd') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, quote, key],
        };
      }
      return synced;
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-10. 단독 마크 점프 ('{a-zA-Z}, `{a-zA-Z})
  const standaloneMarkMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?(['`])$/);
  if (standaloneMarkMatch) {
    const quote = standaloneMarkMatch[2];
    if (/^[a-zA-Z]$/.test(key)) {
      return jumpToMark(state, key, quote === "'");
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-11. 마크 설정 (m{a-zA-Z})
  if (state.pendingKeys === 'm' || parsed.operator === 'm') {
    if (/^[a-zA-Z]$/.test(key)) {
      return setMark(state, key);
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-12. 들여쓰기 / 내어쓰기 / 정렬 (>>, <<, ==) 및 주석 토글 (gcc, gc{motion})
  // >{motion} / <{motion} / gc{motion} (>ip, >}, gcip, gcj ...): 항상 줄 단위 적용
  const gcMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?g([cqw])([1-9][0-9]*)?([iagfFtT'`\[\]])?$/);
  if (gcMatch) {
    const [, c1, opChar, c2, prefix] = gcMatch;
    const applyLines = (s: number, e: number): VimEditorState =>
      opChar === 'c' ? toggleCommentRange(state, s, e) : formatRange(state, s, e, opChar === 'w');
    const isLineForm =
      (!prefix && !c2 && key === opChar) || (opChar !== 'c' && prefix === 'g' && !c2 && key === opChar);
    if (isLineForm) {
      const count = c1 ? parseInt(c1, 10) : 1;
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
      const res = applyLines(state.cursor.line, endLine);
      if (res.bell) return res;
      const lKeys = [...(count > 1 ? String(count).split('') : []), 'g', opChar, opChar];
      return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
    }
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [prefix, key] : [key], count, runHandleKey);
    if (!range) return ringBell(state);
    const res = applyLines(range.startLine, range.endLine);
    if (res.bell) return res;
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys };
  }

  // !{motion} / !! : 셸 파이프 필터 연산자 (!!, [count]!!, !G, !ip, !} 등)
  const filterMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?!([1-9][0-9]*)?([iagfFtT'`\[\]])?$/);
  if (filterMatch) {
    const [, c1, c2, prefix] = filterMatch;
    if (!prefix && key === '!') {
      const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
      const delta = endLine - state.cursor.line;
      const cmdBuffer = delta > 0 ? `.,.+${delta}!` : '.!';
      return {
        ...state,
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: cmdBuffer,
        pendingKeys: undefined,
        commandMessage: undefined,
        filterOperatorKeys: [...(state.pendingKeys ?? '').split(''), '!'],
      };
    }
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [prefix, key] : [key], count, runHandleKey);
    if (!range) return ringBell(state);
    const delta = range.endLine - range.startLine;
    const cmdBuffer =
      delta > 0
        ? range.endLine === state.lines.length - 1
          ? '.,$!'
          : `.,.+${delta}!`
        : '.!';
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: cmdBuffer,
      cursor: { line: range.startLine, col: 0 },
      pendingKeys: undefined,
      commandMessage: undefined,
      filterOperatorKeys: [...(state.pendingKeys ?? '').split(''), key],
    };
  }

  // >{motion} / <{motion} / >{텍스트 객체} (>ip, >}, >j, <a{, >3j, >gg ...): 항상 줄 단위 들여쓰기
  const shiftMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([<>])([1-9][0-9]*)?([iagfFtT'`\[\]])?$/);
  if (shiftMatch && key !== shiftMatch[2]) {
    const [, c1, dir, c2, prefix] = shiftMatch;
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [prefix, key] : [key], count, runHandleKey);
    if (!range) return ringBell(state);
    const res = indentLines(
      { ...state, cursor: { line: range.startLine, col: 0 }, pendingKeys: undefined },
      range.endLine - range.startLine + 1,
      dir === '>' ? 'in' : 'out'
    );
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys };
  }

  if (parsed.operator === '>') {
    if (key === '>') {
      const res = indentLines(state, parsed.totalCount, 'in');
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '>', '>'] : ['>', '>'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }
  if (parsed.operator === '<') {
    if (key === '<') {
      const res = indentLines(state, parsed.totalCount, 'out');
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '<', '<'] : ['<', '<'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }
  // =g 대기 상태 (예: =gg 또는 1=gg)
  if (state.pendingKeys?.endsWith('=g')) {
    if (key === 'g') {
      const res = formatIndentRange(state, 0, state.cursor.line);
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['=', 'g', 'g'],
      };
    }
    state = { ...state, pendingKeys: undefined };
  }

  if (parsed.operator === '=') {
    if (key === '=') {
      const res = formatIndentLines(state, parsed.totalCount);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', '='] : ['=', '='];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'G') {
      const res = formatIndentRange(state, state.cursor.line, state.lines.length - 1);
      const lKeys = ['=', 'G'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'g') {
      return {
        ...state,
        pendingKeys: (parsed.count1 ? String(parsed.count1) : '') + '=g',
      };
    }
    if (key === 'j') {
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + parsed.totalCount);
      const res = formatIndentRange(state, state.cursor.line, endLine);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', 'j'] : ['=', 'j'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'k') {
      const startLine = Math.max(0, state.cursor.line - parsed.totalCount);
      const res = formatIndentRange(state, startLine, state.cursor.line);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', 'k'] : ['=', 'k'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'i' || key === 'a') {
      return {
        ...state,
        pendingKeys: (parsed.count1 ? String(parsed.count1) : '') + '=' + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }

  // gugu / gUgU / g~g~ / g?g? (gUgg 포함): 대소문자 연산자 뒤에 g 를 다시 누른 상태
  const caseOpG = state.pendingKeys?.match(/^([1-9][0-9]*)?(g[uU~?])g$/);
  if (caseOpG) {
    const op = caseOpG[2] as 'gu' | 'gU' | 'g~' | 'g?';
    const count = caseOpG[1] ? parseInt(caseOpG[1], 10) : 1;
    if (key === op[1] || key === 'g') {
      const motionKey = key === 'g' ? 'gg' : key;
      const res = executeCaseMotion({ ...state, pendingKeys: undefined }, op, motionKey, count);
      const opKeys = [...(count > 1 ? [String(count)] : []), op, 'g', key];
      return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys, pendingKeys: undefined };
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-13. 순정 Vim 대소문자 변환 연산자 (gu, gU, g~ + 모션 / 텍스트객체 / 라인반복)
  if (parsed.operator === 'gu' || parsed.operator === 'gU' || parsed.operator === 'g~' || parsed.operator === 'g?') {
    const op = parsed.operator as 'gu' | 'gU' | 'g~' | 'g?';
    // 텍스트 객체 대기 (i, a)
    if (key === 'i' || key === 'a') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    // g 재입력 대기 (예: gUg -> gUgg, gUgU)
    if (key === 'g' && !state.pendingKeys?.endsWith('g')) {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    const motionKey = state.pendingKeys?.endsWith('g') ? (key === 'g' ? 'gg' : key) : key;
    const res = executeCaseMotion(state, op, motionKey, parsed.totalCount);
    const opKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), op, motionKey] : [op, motionKey];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
      pendingKeys: undefined,
    };
  }

  // 1-0-14. 순정 Vim Diff 점프 모션 (]c, [c, [count]]c, [count][c)
  const bracketMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([\]\[])$/);
  if (bracketMatch) {
    const bCount = bracketMatch[1] ? parseInt(bracketMatch[1], 10) : 1;
    const bracket = bracketMatch[2];
    if (key === 'c') {
      const dir = bracket === ']' ? 'next' : 'prev';
      return {
        ...jumpDiffHunk(state, dir, bCount),
        pendingKeys: undefined,
      };
    }
    // [( [{ ]) ]}: 감싸고 있는 짝 없는 괄호로 이동
    if ((bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'))) {
      return moveByExtraMotion(state, `${bracket}${key}`, bCount);
    }
    // ]s, [s, ]S, [S: 맞춤법 오류 점프
    if (key === 's' || key === 'S') {
      const res = bracket === ']' ? jumpToNextSpellError(state) : jumpToPrevSpellError(state);
      return {
        ...res,
        pendingKeys: undefined,
      };
    }
    // ]p, [p, ]P, [P: 현재 줄 들여쓰기에 맞춰 붙여넣기
    if (key === 'p' || key === 'P') {
      return executePutVariant(
        state,
        key === 'P' || bracket === '[',
        bCount,
        { adjustIndent: true },
        [bracket, key],
        isReplayingDot
      );
    }
    state = { ...state, pendingKeys: undefined };
  }

  // 연산자 + 괄호 모션 (d[(, c]}, y[{ ...)
  const opBracketMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?([\]\[])$/);
  if (opBracketMatch) {
    const bracket = opBracketMatch[4];
    if ((bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'))) {
      const op = opBracketMatch[2] as 'd' | 'c' | 'y';
      const total = (opBracketMatch[1] ? parseInt(opBracketMatch[1], 10) : 1) * (opBracketMatch[3] ? parseInt(opBracketMatch[3], 10) : 1);
      return applyOperatorMotion(state, op, `${bracket}${key}`, { operator: op, count1: total > 1 ? total : undefined, totalCount: total }, isReplayingDot);
    }
    state = { ...state, pendingKeys: undefined };
  }

  // 1-1. 매크로 녹화 시작 대기 (q) 또는 커맨드라인 윈도우 (q:, q/, q?)
  if (state.pendingKeys === 'q' || parsed.operator === 'q') {
    if (key === ':' || key === '/' || key === '?') {
      return openCommandLineWindow(state, key as ':' | '/' | '?');
    }
    if (/^[a-zA-Z0-9]$/.test(key)) {
      const isAppend = /^[A-Z]$/.test(key);
      const targetReg = isAppend ? key.toLowerCase() : key;
      const existingEntry = isAppend ? state.registers?.[targetReg] : undefined;
      const existingKeys = (existingEntry && Array.isArray(existingEntry.content)) ? [...existingEntry.content] : [];

      return {
        ...state,
        pendingKeys: undefined,
        recordingMacro: {
          register: key,
          keys: existingKeys,
        },
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 1-2. 매크로 실행 (@{reg}, [count]@{reg}, @@)
  if (parsed.operator === '@') {
    let targetReg: string | null = null;
    if (key === '@') {
      targetReg = state.lastPlayedMacro ?? null;
    } else if (/^[a-zA-Z0-9]$/.test(key)) {
      targetReg = key.toLowerCase();
    }

    if (!targetReg) {
      return {
        ...state,
        pendingKeys: undefined,
      };
    }

    const regEntry = state.registers?.[targetReg];
    if (!regEntry || !regEntry.content) {
      return {
        ...state,
        pendingKeys: undefined,
        lastPlayedMacro: targetReg,
      };
    }

    const macroKeys = Array.isArray(regEntry.content)
      ? regEntry.content
      : parseMacroStringToKeys(regEntry.content);
    let curState: VimEditorState = {
      ...state,
      pendingKeys: undefined,
      lastPlayedMacro: targetReg,
    };

    // 실제 Vim과 동일하게 키가 실패(bell)하면 남은 키와 반복 횟수를 모두 버립니다.
    // bell은 결과 상태에 남으므로 중첩 매크로(@b 안의 @a)의 실패도 상위 매크로를 중단시킵니다.
    const repeatCount = parsed.totalCount;
    for (let c = 0; c < repeatCount && !curState.bell; c++) {
      if (macroDepth >= 100) break;
      for (const mk of macroKeys) {
        curState = runHandleKey(curState, mk, false, macroDepth + 1);
        if (curState.bell) break;
      }
    }

    return {
      ...curState,
      lastPlayedMacro: targetReg,
    };
  }

  // 2. 직전 변경 반복 ('.' Dot Repeat)
  if (key === '.' && !state.pendingKeys) {
    if (!state.lastChangeKeys || state.lastChangeKeys.length === 0) {
      return state;
    }
    const replayKeys = [...state.lastChangeKeys];
    let curState: VimEditorState = { ...state, pendingKeys: undefined };
    for (const rk of replayKeys) {
      curState = runHandleKey(curState, rk, true);
      if (curState.bell) break;
    }
    return {
      ...curState,
      lastChangeKeys: replayKeys,
    };
  }

  // 3. 'r' (단일 문자 교체) 대기 상태
  if (parsed.operator === 'r') {
    if (key.length === 1) {
      // 남은 문자 수보다 많이 바꾸려 하면 실패 (5rx 를 3글자 줄에서)
      if (state.cursor.col + parsed.totalCount > currentLine.length) return ringBell(state);
      const res = replaceChar(state, key, parsed.totalCount);
      const changeKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'r', key]
          : ['r', key];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 4. 텍스트 객체 대기 상태 (di, da, ci, ca, yi, ya, vi, va, =i, =a, gui, gua, gUi, gUa, g~i, g~a 및 카운트 조합)
  // 카운트는 연산자 앞(2das)과 뒤(d2as) 모두 가능하며 서로 곱해집니다
  const textObjPendingMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv=]|g[uU~?])([1-9][0-9]*)?([ia])$/);
  if (textObjPendingMatch) {
    const count =
      (textObjPendingMatch[1] ? parseInt(textObjPendingMatch[1], 10) : 1) *
      (textObjPendingMatch[3] ? parseInt(textObjPendingMatch[3], 10) : 1);
    const op = textObjPendingMatch[2] as 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?';
    const modifier = textObjPendingMatch[4] as 'i' | 'a';

    // 인덴트 텍스트 객체 (dii, cai, yii, =ii, gUai, daI 등) / 문단 텍스트 객체 (dap, yip, cip, =ap): 줄 단위 연산
    if (key === 'i' || key === 'I' || key === 'p') {
      const res =
        key === 'p'
          ? executeParagraphObjectOperator(state, op, `${modifier}p` as ParagraphObjectType, count)
          : executeIndentObjectOperator(state, op, `${modifier}${key}` as IndentObjectType, count);
      if (!res) return ringBell(state);
      const synced = syncRegisters(state, res, op === 'y');
      const opKeys = count > 1 ? [String(count), op, modifier, key] : [op, modifier, key];
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
        };
      }
      if (op === 'd' || op === '=' || op === 'gu' || op === 'gU' || op === 'g~') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
        };
      }
      return synced;
    }

    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't', 's', '<', '>'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';
      else if (key === '>') targetChar = '<';

      const objType: TextObjectType = `${modifier}${targetChar}` as TextObjectType;
      const res = executeTextObjectOperator(state, op, objType, count);
      const synced = syncRegisters(state, res, op === 'y');

      const opKeys = count > 1 ? [String(count), op, modifier, key] : [op, modifier, key];
      if (op === 'c') {
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
        };
      }
      if (op === 'd' || op === '=' || op === 'gu' || op === 'gU' || op === 'g~') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
        };
      }
      return synced;
    }
    // 유효한 텍스트 객체가 아니면 pendingKeys 취소 후 일반 키 평가
    state = { ...state, pendingKeys: undefined };
  }

  // 5. 연산자 + 문자 탐색 대기 상태 (df, dt, dF, dT, cf, ct, cF, cT, yf, yt, yF, yT)
  const findOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcy])([0-9]*)([ftFT])$/);
  if (findOpMatch) {
    const c1 = findOpMatch[1] ? parseInt(findOpMatch[1], 10) : 1;
    const op = findOpMatch[2] as 'd' | 'c' | 'y';
    const c2 = findOpMatch[3] && findOpMatch[3].length > 0 ? parseInt(findOpMatch[3], 10) : 1;
    const motion = findOpMatch[4] as 'f' | 't' | 'F' | 'T';
    const totalCount = c1 * c2;

    if (key.length === 1) {
      if (!moveFind(state.lines, state.cursor, motion, key, totalCount)) {
        return { ...ringBell(state), lastCharSearch: { type: motion, char: key } };
      }
      const res = executeFindOperator(state, op, motion, key, totalCount);
      const resWithSearch = {
        ...res,
        lastCharSearch: { type: motion, char: key },
      };
      const synced = syncRegisters(state, resWithSearch, op === 'y');
      if (op === 'c') {
        const cKeys = [op, motion, key];
        return {
          ...synced,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        };
      }
      if (op === 'd') {
        const lKeys = [op, motion, key];
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        };
      }
      return synced;
    }
    state = { ...state, pendingKeys: undefined };
  }

  // 6. 단독 문자 탐색 대기 상태 (f, t, F, T)
  const findMotionMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ftFT])$/);
  if (findMotionMatch) {
    const count = findMotionMatch[1] ? parseInt(findMotionMatch[1], 10) : 1;
    const motion = findMotionMatch[2] as 'f' | 't' | 'F' | 'T';

    if (key.length === 1) {
      const nextPos = moveFind(state.lines, state.cursor, motion, key, count);
      return {
        ...(nextPos ? state : ringBell(state)),
        cursor: nextPos ?? state.cursor,
        lastCharSearch: { type: motion, char: key },
        pendingKeys: undefined,
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 7. 숫자 입력 처리 ('0' ~ '9')
  if (key === '0') {
    // pendingKeys의 끝 글자가 숫자인 경우 (예: '1' -> '10', 'd2' -> 'd20')
    if (state.pendingKeys && /[0-9]$/.test(state.pendingKeys)) {
      return {
        ...state,
        pendingKeys: state.pendingKeys + '0',
      };
    }

    // pendingKeys가 없으면 '줄 맨 앞 이동' 모션으로 작동
    if (!state.pendingKeys) {
      return {
        ...state,
        cursor: moveToLineStart(state.lines, state.cursor),
      };
    }
  }

  // 1-9 숫자 누적
  if (/^[1-9]$/.test(key)) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  // gd, gi, gv, g;, g, 단일 키 입력 시 처리
  if (key === 'gd') return goToDeclaration(state);
  if (key === 'gi') return goToLastInsert(state);
  if (key === 'gv') return reselectLastVisual(state);
  if (key === 'g;') return traverseChangeList(state, 'prev', parsed.totalCount);
  if (key === 'g,') return traverseChangeList(state, 'next', parsed.totalCount);
  if (key === 'g-') return travelUndoTime(state, 'older', parsed.totalCount);
  if (key === 'g+') return travelUndoTime(state, 'newer', parsed.totalCount);

  // 8-0. 연산자 + 일반 모션 (dj, dk, dh, dl, db, dB, d^, dG, cj, yk 등): 줄 단위 / 배타적 문자 단위
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y') &&
    OPERATOR_MOTION_KEYS.has(key)
  ) {
    return applyOperatorMotion(state, parsed.operator, key, parsed, isReplayingDot);
  }

  // 8. 연산자 대기 처리 (d, c, y, g, v)

  if (parsed.operator === 'd') {
    if (key === 'o') {
      return {
        ...diffObtain(state),
        pendingKeys: undefined,
      };
    }
    if (key === 'p') {
      return {
        ...diffPut(state),
        pendingKeys: undefined,
      };
    }
    if (key === 'd') {
      const res = deleteFoldOrLine(state, parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const lKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'd', 'd']
          : ['d', 'd'];
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'w' || key === 'e' || key === 'W' || key === 'E') {
      let target = state.cursor;
      for (let i = 0; i < parsed.totalCount; i++) {
        if (key === 'w') target = moveToNextWord(state.lines, target);
        else if (key === 'W') target = moveToNextWORD(state.lines, target);
        else if (key === 'e') target = moveToWordEnd(state.lines, target);
        else if (key === 'E') target = moveToWORDEnd(state.lines, target);
      }
      if (key === 'e' || key === 'E' || key === 'W') {
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor:
            key === 'W' && target.line === state.cursor.line && target.col > state.cursor.col
              ? { line: target.line, col: target.col - 1 }
              : target,
        };
        const delRes = deleteVisualSelection(stateWithAnchor);
        const synced = syncRegisters(state, delRes, false);
        const lKeys =
          parsed.totalCount > 1
            ? [String(parsed.totalCount), 'd', key]
            : ['d', key];
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        };
      }
      const res = deleteWord(state, parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const lKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'd', 'w']
          : ['d', 'w'];
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const deleted = cur.slice(0, col);
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(col);
      const stateWithDel = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: { line, col: 0 },
        clipboard: { type: 'text' as const, content: deleted },
        pendingKeys: undefined,
      };
      const synced = syncRegisters(state, stateWithDel, false);
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['d', '0'],
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const deleted = cur.slice(0, col);
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(col);
      const stateWithDel = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: { line, col: 0 },
        mode: 'INSERT' as const,
        clipboard: { type: 'text' as const, content: deleted },
        pendingKeys: undefined,
      };
      const synced = syncRegisters(state, stateWithDel, false);
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['c', '0'],
      };
    }
    if (key === '$') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const deleted = cur.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(0, col);
      const clampedCursor = clampCursor(nextLines, { line, col }, 'NORMAL');
      const stateWithDel = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: clampedCursor,
        clipboard: { type: 'text' as const, content: deleted },
        pendingKeys: undefined,
      };
      const synced = syncRegisters(state, stateWithDel, false);
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['d', '$'],
      };
    }
    if (key === '}' || key === '{') {
      const res = deleteParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const lKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'd', key]
          : ['d', key];
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }

    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g' || key === '[' || key === ']') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    if (key === '/') {
      return {
        ...state,
        mode: 'SEARCH',
        commandType: '/',
        commandBuffer: '',
        searchOperator: {
          op: 'd',
          count: parsed.totalCount,
          initialCursor: { ...state.cursor },
        },
        pendingKeys: undefined,
      };
    }
    // d 뒤에 유효하지 않은 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'c') {
    if (key === 'c') {
      const res = changeLine(state, parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', 'c']
          : ['c', 'c'];
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === 'w' || key === 'W') {
      if (key === 'W') {
        let target = state.cursor;
        for (let i = 0; i < parsed.totalCount; i++) {
          target = moveToWORDEnd(state.lines, target);
        }
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor: target,
        };
        const delRes = deleteVisualSelection(stateWithAnchor);
        const synced = syncRegisters(state, delRes, false);
        const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'c', 'W'] : ['c', 'W'];
        return {
          ...synced,
          mode: 'INSERT',
          cursor: { line: state.cursor.line, col: state.cursor.col },
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        };
      }
      const res = changeWord(state, parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', 'w']
          : ['c', 'w'];
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === 'e' || key === 'E') {
      let target = state.cursor;
      for (let i = 0; i < parsed.totalCount; i++) {
        target = key === 'e' ? moveToWordEnd(state.lines, target) : moveToWORDEnd(state.lines, target);
      }
      const stateWithAnchor: VimEditorState = {
        ...state,
        mode: 'VISUAL',
        visualAnchor: state.cursor,
        cursor: target,
      };
      const delRes = deleteVisualSelection(stateWithAnchor);
      const synced = syncRegisters(state, delRes, false);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', key]
          : ['c', key];
      return {
        ...synced,
        mode: 'INSERT',
        cursor: { line: state.cursor.line, col: state.cursor.col },
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const deleted = cur.slice(0, col);
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(col);
      const stateWithDel = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: { line, col: 0 },
        mode: 'INSERT' as const,
        clipboard: { type: 'text' as const, content: deleted },
        pendingKeys: undefined,
      };
      const synced = syncRegisters(state, stateWithDel, false);
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['c', '0'],
      };
    }
    if (key === '$') {
      const res = changeToEndOfLine(state);
      const synced = syncRegisters(state, res, false);
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['c', '$'],
      };
    }
    if (key === '}' || key === '{') {
      const res = changeParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount);
      const synced = syncRegisters(state, res, false);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', key]
          : ['c', key];
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g' || key === '[' || key === ']') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    if (key === '/') {
      return {
        ...state,
        mode: 'SEARCH',
        commandType: '/',
        commandBuffer: '',
        searchOperator: {
          op: 'c',
          count: parsed.totalCount,
          initialCursor: { ...state.cursor },
        },
        pendingKeys: undefined,
      };
    }
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'y') {
    if (key === 'y') {
      const stateWithClip = yankFoldOrLine(state, parsed.totalCount);
      return syncRegisters(state, stateWithClip, true);
    }
    if (key === 'w' || key === 'e' || key === 'W' || key === 'E') {
      let target = state.cursor;
      for (let i = 0; i < parsed.totalCount; i++) {
        if (key === 'w') target = moveToNextWord(state.lines, target);
        else if (key === 'W') target = moveToNextWORD(state.lines, target);
        else if (key === 'e') target = moveToWordEnd(state.lines, target);
        else if (key === 'E') target = moveToWORDEnd(state.lines, target);
      }
      if (key === 'e' || key === 'E' || key === 'W') {
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor:
            key === 'W' && target.line === state.cursor.line && target.col > state.cursor.col
              ? { line: target.line, col: target.col - 1 }
              : target,
        };
        const res = yankVisualSelection(stateWithAnchor);
        return syncRegisters(state, res, true);
      }
      const { line, col } = state.cursor;
      const currentLine = state.lines[line] ?? '';
      if (key === 'w' && currentLine.length === 0 && line < state.lines.length - 1) {
        const stateWithClip: VimEditorState = {
          ...state,
          clipboard: {
            type: 'text',
            content: '\n',
          },
          pendingKeys: undefined,
        };
        return syncRegisters(state, stateWithClip, true);
      }
      let endCol = col;
      for (let step = 0; step < parsed.totalCount; step++) {
        if (endCol >= currentLine.length) break;
        const startType = getCharType(currentLine[endCol]);
        if (startType === 'space') {
          while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') endCol++;
        } else {
          while (endCol < currentLine.length && getCharType(currentLine[endCol]) === startType) endCol++;
          while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') endCol++;
        }
      }
      const yankedText = currentLine.slice(col, endCol);
      const stateWithClip: VimEditorState = {
        ...state,
        clipboard: {
          type: 'text',
          content: yankedText,
        },
        pendingKeys: undefined,
      };
      return syncRegisters(state, stateWithClip, true);
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const yanked = cur.slice(0, col);
      const stateWithClip: VimEditorState = {
        ...state,
        clipboard: { type: 'text', content: yanked },
        pendingKeys: undefined,
      };
      return syncRegisters(state, stateWithClip, true);
    }
    if (key === '$') {
      const { line, col } = state.cursor;
      const currentLine = state.lines[line] ?? '';
      const yankedText = currentLine.slice(col);
      const stateWithClip: VimEditorState = {
        ...state,
        clipboard: {
          type: 'text',
          content: yankedText,
        },
        pendingKeys: undefined,
      };
      return syncRegisters(state, stateWithClip, true);
    }
    if (key === '}' || key === '{') {
      const res = yankParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount);
      return syncRegisters(state, res, true);
    }

    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g' || key === '[' || key === ']') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    if (key === '/') {
      return {
        ...state,
        mode: 'SEARCH',
        commandType: '/',
        commandBuffer: '',
        searchOperator: {
          op: 'y',
          count: parsed.totalCount,
          initialCursor: { ...state.cursor },
        },
        pendingKeys: undefined,
      };
    }
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'g') {
    // ga: 커서 문자의 코드 값 표시 (:help ga)
    if (key === 'a') {
      return { ...state, pendingKeys: undefined, commandMessage: describeCharAt(currentLine, state.cursor.col) };
    }
    // ge / gE / g_: 이전 단어 끝, 이전 WORD 끝, 줄의 마지막 공백 아닌 문자
    if (key === 'e' || key === 'E' || key === '_') {
      return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
    }
    // g&: 직전 치환을 같은 플래그로 모든 줄에 다시 실행 (:%s//~/&)
    if (key === '&') {
      const res = executeCommandLine({ ...state, pendingKeys: undefined }, '%&&', runHandleKey);
      return res.bell ? res : { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['g', '&'] };
    }
    if (key === '-') {
      return travelUndoTime(state, 'older', parsed.totalCount);
    }
    if (key === '+') {
      return travelUndoTime(state, 'newer', parsed.totalCount);
    }
    if (key === 'g') {
      const stateWithJump = recordJump(state);
      if (parsed.count1 !== undefined) {
        const targetLine = Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1));
        const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
        return {
          ...stateWithJump,
          cursor: { line: targetLine, col: Math.min(state.cursor.col, maxCol) },
          pendingKeys: undefined,
        };
      }
      const nextCursor = moveToFirstLine(state.lines, state.cursor);
      return {
        ...stateWithJump,
        cursor: clampCursor(state.lines, nextCursor, 'NORMAL'),
        pendingKeys: undefined,
      };
    }
    if (key === 'd') {
      return goToDeclaration(state);
    }
    if (key === 'f') {
      return gotoFileUnderCursor(state, { withLineNumber: false });
    }
    if (key === 'F') {
      return gotoFileUnderCursor(state, { withLineNumber: true });
    }
    // gp / gP: 붙여넣은 뒤 커서를 삽입 끝 다음으로 이동
    if (key === 'p' || key === 'P') {
      return executePutVariant(
        state,
        key === 'P',
        parsed.totalCount,
        { leaveCursorAfter: true },
        ['g', key],
        isReplayingDot
      );
    }
    if (key === 'i') {
      return goToLastInsert(state);
    }
    if (key === 'v') {
      return reselectLastVisual(state);
    }
    if (
      key === 'Ctrl-g' ||
      key === 'Ctrl+g' ||
      key === 'ctrl-g' ||
      key === '<C-g>'
    ) {
      return executeGCtrlG(state);
    }
    if (key === ';') {
      return traverseChangeList(state, 'prev', parsed.totalCount);
    }
    if (key === ',') {
      return traverseChangeList(state, 'next', parsed.totalCount);
    }
    if (key === 'J') {
      if (state.cursor.line >= state.lines.length - 1) return ringBell(state);
      const res = joinLines(state, parsed.totalCount, false);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'g', 'J'] : ['g', 'J'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 't') {
      return {
        ...nextTab(state, parsed.count1),
        pendingKeys: undefined,
      };
    }
    if (key === 'T') {
      return {
        ...prevTab(state, parsed.count1 ?? 1),
        pendingKeys: undefined,
      };
    }
    if (key === ']' || key === 'Ctrl-]' || key === 'Ctrl+]') {
      const curLine = state.lines[state.cursor.line] ?? '';
      const word = getWordAtCursor(curLine, state.cursor.col);
      if (!word) {
        return {
          ...state,
          commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
          pendingKeys: undefined,
        };
      }
      return { ...tjumpTag(state, word), pendingKeys: undefined };
    }
    if (key === '~' || key === 'u' || key === 'U' || key === '?' || key === 'c' || key === 'q' || key === 'w') {

      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }

  if (
    key === 'g<Ctrl-g>' ||
    key === 'g<C-g>' ||
    key === 'g Ctrl-g' ||
    key === 'g Ctrl+g'
  ) {
    return executeGCtrlG(state);
  }

  // 9. 연산자 및 매크로 키 등록 (d, c, r, g, y, f, F, t, T, @, q, m, ', `, >, <, =, !, z, ], [)
  if (
    key === 'd' || key === 'c' || key === 'r' || key === 'g' || key === 'y' ||
    key === '@' || key === '>' || key === '<' || key === '=' || key === '!' ||
    key === 'm' || key === "'" || key === '`' || key === 'z' || key === ']' || key === '['
  ) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  if (key === 'q' && !state.recordingMacro) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  // 10. 단일 키 명령 및 모드 진입
  // /: 검색 모드 진입
  if (key === '/') {
    if (parsed.operator) {
      return {
        ...state,
        mode: 'SEARCH',
        commandType: '/',
        commandBuffer: '',
        searchOperator: {
          op: parsed.operator,
          count: parsed.totalCount,
          initialCursor: { ...state.cursor },
        },
        pendingKeys: undefined,
        commandMessage: undefined,
      };
    }
    return {
      ...state,
      mode: 'SEARCH',
      commandType: '/',
      commandBuffer: '',
      pendingKeys: undefined,
      commandMessage: undefined,
    };
  }

  // :: 커맨드라인 모드 진입
  if (key === ':') {
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: '',
      pendingKeys: undefined,
      commandMessage: undefined,
    };
  }

  // n: 다음 검색 결과로 점프
  if (key === 'n') {
    if (state.lastSearchQuery) {
      const matches = findMatches(state.lines, state.lastSearchQuery, state.options);
      if (matches.length === 0) {
        return {
          ...state,
          commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {lastSearchQuery}', { lastSearchQuery: state.lastSearchQuery }),
          pendingKeys: undefined,
          bell: true,
        };
      }
      const nextMatch = findNextMatch(matches, state.cursor) ?? matches[0];
      const matchIdx = matches.findIndex((m) => m.line === nextMatch.line && m.col === nextMatch.col);
      const targetPos = applySearchOffset(state.lines, nextMatch, state.lastSearchOffset);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: targetPos,
        commandMessage: msg('다음 검색 결과 ({v}/{matchesCount}): {lastSearchQuery}', { v: matchIdx + 1, matchesCount: matches.length, lastSearchQuery: state.lastSearchQuery }),
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // N: 이전 검색 결과로 점프
  if (key === 'N') {
    if (state.lastSearchQuery) {
      const matches = findMatches(state.lines, state.lastSearchQuery, state.options);
      if (matches.length === 0) {
        return {
          ...state,
          commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {lastSearchQuery}', { lastSearchQuery: state.lastSearchQuery }),
          pendingKeys: undefined,
          bell: true,
        };
      }
      const prevMatch = findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      const matchIdx = matches.findIndex((m) => m.line === prevMatch.line && m.col === prevMatch.col);
      const targetPos = applySearchOffset(state.lines, prevMatch, state.lastSearchOffset);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: targetPos,
        commandMessage: msg('이전 검색 결과 ({v}/{matchesCount}): {lastSearchQuery}', { v: matchIdx + 1, matchesCount: matches.length, lastSearchQuery: state.lastSearchQuery }),
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // *: 커서 아래 단어로 검색어 설정 후 다음 결과로 점프
  if (key === '*') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (word) {
      const query = starSearchPattern(word);
      const matches = findMatches(state.lines, query, state.options);
      const nextMatch = findNextMatch(matches, state.cursor) ?? matches[0];
      const matchIdx = nextMatch
        ? matches.findIndex((m) => m.line === nextMatch.line && m.col === nextMatch.col)
        : -1;
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: nextMatch ? { line: nextMatch.line, col: nextMatch.col } : state.cursor,
        lastSearchQuery: query,
        commandMessage: msg('단어 \'{word}\' 검색 ({v}/{matchesCount})', { word, v: matchIdx + 1, matchesCount: matches.length }),
        pendingKeys: undefined,
      };
    }
    return { ...ringBell(state), commandMessage: msg('E348: 커서 아래에 단어가 없습니다') };
  }

  // #: 커서 아래 단어로 검색어 설정 후 이전 결과로 점프
  if (key === '#') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (word) {
      const query = starSearchPattern(word);
      const matches = findMatches(state.lines, query, state.options);
      const prevMatch = findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      const matchIdx = prevMatch
        ? matches.findIndex((m) => m.line === prevMatch.line && m.col === prevMatch.col)
        : -1;
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: prevMatch ? { line: prevMatch.line, col: prevMatch.col } : state.cursor,
        lastSearchQuery: query,
        commandMessage: msg('단어 \'{word}\' 역방향 검색 ({v}/{matchesCount})', { word, v: matchIdx + 1, matchesCount: matches.length }),
        pendingKeys: undefined,
      };
    }
    return { ...ringBell(state), commandMessage: msg('E348: 커서 아래에 단어가 없습니다') };
  }


  // 실행 취소 (Undo)
  if (key === 'u') {
    return undo(state);
  }

  // 다시 실행 (Redo)
  if (key === 'Ctrl-r' || key === 'ctrl+r') {
    return redo(state);
  }

  // p / P: 레지스터/클립보드 붙여넣기 (p: 뒤, P: 앞)
  if (key === 'p' || key === 'P') {
    return executePutVariant(state, key === 'P', parsed.totalCount, undefined, [key], isReplayingDot);
  }

  // Y: 한 줄 복사 (yy와 동일)
  if (key === 'Y' && !state.pendingKeys) {
    const stateWithClip = yankFoldOrLine(state, 1);
    return syncRegisters(state, stateWithClip, true);
  }

  // D: 줄 끝까지 삭제
  if (key === 'D' && !state.pendingKeys) {
    const { line, col } = state.cursor;
    const cur = state.lines[line] ?? '';
    const deleted = cur.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = cur.slice(0, col);
    const clampedCursor = clampCursor(nextLines, { line, col }, 'NORMAL');
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: clampedCursor,
      clipboard: { type: 'text', content: deleted },
      pendingKeys: undefined,
    };
    const synced = syncRegisters(state, stateWithDel, false);
    return {
      ...synced,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['D'],
    };
  }

  // s: 현재 글자 삭제 후 INSERT 모드 진입
  if (key === 's' && !state.pendingKeys) {
    const { line, col } = state.cursor;
    const curLine = state.lines[line] ?? '';
    if (curLine.length === 0) {
      return {
        ...state,
        mode: 'INSERT',
        pendingKeys: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['s'],
      };
    }
    const deleted = curLine[col] ?? '';
    const nextLines = [...state.lines];
    nextLines[line] = curLine.slice(0, col) + curLine.slice(col + 1);
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: { line, col },
      mode: 'INSERT',
      clipboard: { type: 'text', content: deleted },
      pendingKeys: undefined,
    };
    const synced = syncRegisters(state, stateWithDel, false);
    return {
      ...synced,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['s'],
    };
  }

  // S: 현재 줄 전체를 비우고 INSERT 모드 진입 (cc와 동일)
  if (key === 'S' && !state.pendingKeys) {
    const res = changeLine(state);
    const synced = syncRegisters(state, res, false);
    return {
      ...synced,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['S'],
    };
  }

  // C: 커서부터 줄 끝까지 수정 후 INSERT
  if (key === 'C') {
    const res = changeToEndOfLine(state);
    const synced = syncRegisters(state, res, false);
    return {
      ...synced,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['C'],
    };
  }

  // x: 현재 문자 삭제 ([count]x)
  if (key === 'x') {
    const res = deleteChar(state, parsed.totalCount);
    const synced = syncRegisters(state, res, false);
    const lKeys =
      parsed.totalCount > 1
        ? [String(parsed.totalCount), 'x']
        : ['x'];
    return {
      ...synced,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }

  // I: 첫 비공백 문자로 이동 후 INSERT
  if (key === 'I') {
    const res = insertAtFirstNonBlank(state);
    return {
      ...res,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['I'],
    };
  }

  // A: 줄 끝 다음 칸으로 이동 후 INSERT
  if (key === 'A') {
    const res = appendAtLineEnd(state);
    return {
      ...res,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['A'],
    };
  }

  // o: 아래 줄 생성 후 INSERT
  if (key === 'o') {
    const res = openLineBelow(state);
    return {
      ...res,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['o'],
    };
  }

  // O: 위 줄 생성 후 INSERT
  if (key === 'O') {
    const res = openLineAbove(state);
    return {
      ...res,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['O'],
    };
  }

  // i: 현재 위치에서 INSERT
  if (key === 'i') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['i'],
    };
  }

  // a: 다음 칸에서 INSERT
  if (key === 'a') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    const newCol =
      currentLine.length === 0
        ? 0
        : Math.min(state.cursor.col + 1, currentLine.length);
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      cursor: { line: state.cursor.line, col: newCol },
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['a'],
    };
  }

  // R: REPLACE 모드 진입
  if (key === 'R' && !parsed.operator && !state.pendingKeys) {
    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      mode: 'REPLACE',
      replaceStack: [],
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['R'],
    };
  }

  // v: 문자 단위 VISUAL 모드 진입
  if (key === 'v') {
    return {
      ...state,
      mode: 'VISUAL',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // V: 행 단위 VISUAL_LINE 모드 진입
  if (key === 'V') {
    return {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // G: 버퍼 이동 ([count]G는 count번째 줄, 없으면 마지막 줄)
  if (key === 'G') {
    const stateWithJump = recordJump(state);
    if (parsed.count1 !== undefined) {
      const targetLine = Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1));
      const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
      return {
        ...stateWithJump,
        cursor: { line: targetLine, col: Math.min(state.cursor.col, maxCol) },
        pendingKeys: undefined,
      };
    }
    const nextCursor = moveToLastLine(state.lines, state.cursor);
    return {
      ...stateWithJump,
      cursor: clampCursor(state.lines, nextCursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // 문단 단위 점프 ({, }) - 점프 리스트 등록
  if ((key === '}' || key === '{') && !parsed.operator) {
    const target = key === '}'
      ? moveToNextParagraph(state.lines, state.cursor, parsed.totalCount)
      : moveToPrevParagraph(state.lines, state.cursor, parsed.totalCount);
    const stateWithJump = recordJump(state);
    return {
      ...stateWithJump,
      cursor: clampCursor(state.lines, target, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // 10-1. 보조 모션: ( ) 문장, + - Enter 줄 첫 문자, | 칸 번호
  if (!parsed.operator && NORMAL_EXTRA_KEYS.has(key)) {
    return moveByExtraMotion(state, key, parsed.totalCount);
  }

  // 11. 이동 모션 키 평가 (카운트 반복 반영)

  let motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount,
    state.folds
  );

  if (motionCursor) {
    const isDollar = key === '$';
    const isVertical = key === 'j' || key === 'k' || key === 'ArrowDown' || key === 'ArrowUp';
    // 커서를 전혀 움직이지 못한 모션은 실패(bell): 마지막 줄의 j, 줄 시작의 h, 버퍼 끝의 w 등
    if (isFailedMotion(key, state.cursor, motionCursor)) {
      return ringBell(state);
    }
    if (state.stickyDollar && isVertical) {
      const destLine = state.lines[motionCursor.line] ?? '';
      motionCursor = {
        line: motionCursor.line,
        col: Math.max(0, destLine.length - 1),
      };
    }
    return {
      ...state,
      cursor: motionCursor,
      stickyDollar: isDollar || (state.stickyDollar && isVertical),
      pendingKeys: undefined,
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}
