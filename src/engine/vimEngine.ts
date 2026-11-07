import { VimEditorState, CursorPosition, FoldRange } from '../types/vim';
import { clampCursor, getMaxCol } from './cursor';
import {
  moveLeft,
  moveRight,
  moveDown,
  moveUp,
  moveToLineStart,
  moveToLineEnd,
  moveToFirstNonBlank,
  moveToFirstLine,
  moveToLastLine,
  moveToNextWord,
  moveToPrevWord,
  moveToWordEnd,
  moveToNextWORD,
  moveToPrevWORD,
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
import {
  syncRegisters,
  putFromRegister,
  getRegisterContent,
} from './registers';
import { evaluateVimExpression } from './expressionParser';
import { alternateBuffer } from './bufferEngine';
import { nextTab, prevTab } from './tabEngine';
import {
  addHistory,
  navigateHistory,
  openCommandLineWindow,
  handleCommandLineWindowKey,
} from './cmdlineWindow';
import { handleNetrwKey } from './netrwEngine';
import {
  handleTabCompletion,
  cancelWildmenu,
  acceptWildmenu,
} from './wildmenu';
import {
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  syncActivePane,
  exchangePanes,
  rotatePanes,
  movePaneToDirection,
  resizeSplit,
  moveWindowToNewTab,
} from './splitWindow';
import {
  deleteVisualSelection,
  yankVisualSelection,
  startVisualBlockInsert,
} from './visual';
import {
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
} from './completion';
import {
  findMatchingBracket,
} from './bracketMatch';
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
  recordChangePosition,
} from './advancedMotions';
export {
  moveToNextParagraph,
  moveToPrevParagraph,
  deleteParagraph,
  changeParagraph,
  yankParagraph,
  goToDeclaration,
  goToLastInsert,
  reselectLastVisual,
  traverseChangeList,
  recordChangePosition,
} from './advancedMotions';
import { deepFreeze, assertValidVimState } from './invariants';

export { withInvariantCheck, assertValidVimState, deepFreeze } from './invariants';
import {
  moveFind,
  executeFindOperator,
} from './findChar';
import {
  executeTextObjectOperator,
  TextObjectType,
} from './textObjects';
import {
  findMatches,
  findNextMatch,
  findPrevMatch,
  getWordAtCursor,
  parseSearchQuery,
  applySearchOffset,
  findCurrentOrNextMatch,
} from './search';
import { executeCommandLine, handleConfirmSubstituteKey } from './commandLine';
import {
  scrollToCenter,
  scrollToTop,
  scrollToBottom,
  cursorToHigh,
  cursorToMiddle,
  cursorToLow,
  scrollHalfPageDown,
  scrollHalfPageUp,
  adjustViewport,
  getViewport,
} from './viewport';
import {
  recordJump,
  jumpOlder,
  jumpNewer,
  setMark,
  jumpToMark,
  executeMarkOperator,
} from './marks';
import {
  joinLines,
  toggleCaseChar,
  changeCaseVisual,
  indentLines,
  indentVisual,
  modifyNumberAtCursor,
  modifyNumberVisual,
  formatIndentLines,
  formatIndentVisual,
  formatIndentRange,
} from './lineOperators';
import {
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  getNextVisibleLine,
  getPrevVisibleLine,
  deleteFoldOrLine,
  yankFoldOrLine,
} from './folding';
export {
  foldClose,
  foldOpen,
  foldToggle,
  foldCloseAll,
  foldOpenAll,
  detectFoldBlocks,
  findFoldForCursor,
  getNextVisibleLine,
  getPrevVisibleLine,
  deleteFoldOrLine,
  yankFoldOrLine,
} from './folding';

/**
 * 대기 중인 키(pendingKeys)에서 숫자 카운트와 연산자를 분해 파싱합니다.
 * 예: "3" -> count: 3
 *     "2d" -> count1: 2, op: 'd', total: 2
 *     "d2" -> count2: 2, op: 'd', total: 2
 *     "2d3" -> count1: 2, op: 'd', count2: 3, total: 6
 */
export interface ParsedPending {
  count1?: number;
  operator?: string;
  count2?: number;
  totalCount: number;
}

export function parsePending(pendingKeys?: string): ParsedPending {
  if (!pendingKeys) {
    return { totalCount: 1 };
  }

  // 1. 숫자만 있는 경우: "3", "12"
  const numOnly = pendingKeys.match(/^([1-9][0-9]*)$/);
  if (numOnly) {
    const c = parseInt(numOnly[1], 10);
    return { count1: c, totalCount: c };
  }

  // 2. 연산자 및 카운트 조합: "d", "2d", "d2", "2d3", "c", "r", "y", "v", "g", "@", ">", "<", "=", "m", "'", "`"
  const opMatch = pendingKeys.match(/^([1-9][0-9]*)?([a-zA-Z@'`><=])([0-9]*)$/);
  if (opMatch) {
    const count1 = opMatch[1] ? parseInt(opMatch[1], 10) : undefined;
    const operator = opMatch[2];
    const count2 = opMatch[3] && opMatch[3].length > 0 ? parseInt(opMatch[3], 10) : undefined;
    const c1 = count1 ?? 1;
    const c2 = count2 ?? 1;
    return { count1, operator, count2, totalCount: c1 * c2 };
  }

  return { totalCount: 1 };
}

/**
 * Vim 키 입력 처리 순수 함수: (state, key) => newState
 */
export function rawHandleKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  macroDepth = 0
): VimEditorState {
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
    nextState = handleCommandLineModeKey(state, key);
  } else if (state.mode === 'REPLACE') {
    nextState = handleReplaceModeKey(state, key, isReplayingDot, macroDepth);
  } else if (state.mode === 'INSERT') {
    nextState = handleInsertModeKey(state, key, isReplayingDot);
  } else if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
    nextState = handleVisualModeKey(state, key);
  } else if (state.mode === 'NORMAL') {
    nextState = handleNormalModeKey(state, key, isReplayingDot, macroDepth);
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

  // 커서 이동 시 화면 뷰포트 자동 동기화 (커서가 화면을 벗어나지 않도록 보정)
  if (nextState.cursor && nextState.lines) {
    const vp = adjustViewport(getViewport(nextState), nextState.cursor.line, nextState.lines.length);
    if (!nextState.viewport || nextState.viewport.topRow !== vp.topRow || nextState.viewport.visibleRows !== vp.visibleRows) {
      nextState = {
        ...nextState,
        viewport: vp,
      };
    }
  }

  return syncActivePane(nextState);
}

/**
 * 검색 모션과 결합된 연산자(d/pat/e, c/pat/e, d/TODO/+1 등)를 실행합니다.
 */
function executeSearchOperator(
  state: VimEditorState,
  op: string,
  from: CursorPosition,
  to: CursorPosition,
  isLinewise: boolean,
  isEndInclusive: boolean
): VimEditorState {
  if (isLinewise) {
    const startLine = Math.min(from.line, to.line);
    const endLine = Math.max(from.line, to.line);
    const deletedLines = state.lines.slice(startLine, endLine + 1).join('\n');

    if (op === 'y') {
      return {
        ...state,
        clipboard: { type: 'line', content: deletedLines },
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);

    if (op === 'c') {
      const nextLines = [
        ...state.lines.slice(0, startLine),
        '',
        ...state.lines.slice(endLine + 1),
      ];
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line: startLine, col: 0 },
        mode: 'INSERT',
        clipboard: { type: 'line', content: deletedLines },
      };
    }

    // op === 'd'
    const nextLines = [
      ...state.lines.slice(0, startLine),
      ...state.lines.slice(endLine + 1),
    ];
    if (nextLines.length === 0) nextLines.push('');
    const firstNonBlank = (nextLines[startLine] ?? '').search(/\S/);
    const targetCol = firstNonBlank >= 0 ? firstNonBlank : 0;
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: Math.min(startLine, nextLines.length - 1), col: targetCol }, 'NORMAL'),
      clipboard: { type: 'line', content: deletedLines },
    };
  }

  // Character-wise operator
  let start = from;
  let end = to;
  if (from.line > to.line || (from.line === to.line && from.col > to.col)) {
    start = to;
    end = from;
  }

  if (start.line === end.line) {
    const lineText = state.lines[start.line] ?? '';
    const endOffset = isEndInclusive ? 1 : 0;
    const sCol = Math.max(0, Math.min(lineText.length, start.col));
    const eCol = Math.max(sCol, Math.min(lineText.length, end.col + endOffset));
    const textFragment = lineText.slice(sCol, eCol);

    if (op === 'y') {
      return {
        ...state,
        clipboard: { type: 'text', content: textFragment },
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    const newLine = lineText.slice(0, sCol) + lineText.slice(eCol);
    const nextLines = [...state.lines];
    nextLines[start.line] = newLine;

    if (op === 'c') {
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        mode: 'INSERT',
        cursor: { line: start.line, col: sCol },
        clipboard: { type: 'text', content: textFragment },
      };
    }

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: start.line, col: Math.min(sCol, Math.max(0, newLine.length - 1)) }, 'NORMAL'),
      clipboard: { type: 'text', content: textFragment },
    };
  }

  // Multi-line character-wise
  const firstLineText = state.lines[start.line] ?? '';
  const lastLineText = state.lines[end.line] ?? '';
  const endOffset = isEndInclusive ? 1 : 0;
  const sCol = Math.max(0, Math.min(firstLineText.length, start.col));
  const eCol = Math.max(0, Math.min(lastLineText.length, end.col + endOffset));

  const textFragments = [
    firstLineText.slice(sCol),
    ...state.lines.slice(start.line + 1, end.line),
    lastLineText.slice(0, eCol),
  ].join('\n');

  if (op === 'y') {
    return {
      ...state,
      clipboard: { type: 'text', content: textFragments },
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const mergedLine = firstLineText.slice(0, sCol) + lastLineText.slice(eCol);
  const nextLines = [
    ...state.lines.slice(0, start.line),
    mergedLine,
    ...state.lines.slice(end.line + 1),
  ];

  if (op === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      mode: 'INSERT',
      cursor: { line: start.line, col: sCol },
      clipboard: { type: 'text', content: textFragments },
    };
  }

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: start.line, col: Math.min(sCol, Math.max(0, mergedLine.length - 1)) }, 'NORMAL'),
    clipboard: { type: 'text', content: textFragments },
  };
}

/**
 * 검색 매치 텍스트 객체(gn, gN) 및 연산자 결합(cgn, dgn, ygn)을 실행합니다.
 */
function executeGn(
  state: VimEditorState,
  isForward: boolean,
  op?: string,
  isReplayingDot = false
): VimEditorState {
  if (!state.lastSearchQuery) {
    return {
      ...state,
      commandMessage: 'E35: 이전 정규식이 없습니다',
      pendingKeys: undefined,
    };
  }

  const matches = findMatches(state.lines, state.lastSearchQuery, state.options);
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${state.lastSearchQuery}`,
      pendingKeys: undefined,
    };
  }

  const res = findCurrentOrNextMatch(matches, state.cursor, isForward);
  if (!res) {
    return { ...state, pendingKeys: undefined };
  }

  const target = res.match;

  // 1. 단독 gn / gN (연산자 없음)
  if (!op) {
    if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
      const nextMatch = isForward ? findNextMatch(matches, state.cursor) : findPrevMatch(matches, state.cursor);
      if (nextMatch) {
        return {
          ...state,
          cursor: { line: nextMatch.line, col: nextMatch.col + Math.max(0, nextMatch.length - 1) },
          pendingKeys: undefined,
        };
      }
      return { ...state, pendingKeys: undefined };
    }

    const anchor = isForward
      ? { line: target.line, col: target.col }
      : { line: target.line, col: target.col + Math.max(0, target.length - 1) };
    const cur = isForward
      ? { line: target.line, col: target.col + Math.max(0, target.length - 1) }
      : { line: target.line, col: target.col };

    return {
      ...state,
      mode: 'VISUAL',
      visualAnchor: anchor,
      cursor: cur,
      pendingKeys: undefined,
    };
  }

  // 2. 연산자 결합 (cgn, dgn, ygn)
  const targetLine = target.line;
  const startCol = target.col;
  const endCol = target.col + target.length;
  const lineText = state.lines[targetLine] ?? '';
  const matchText = lineText.slice(startCol, endCol);

  if (op === 'y') {
    const nextState = {
      ...state,
      clipboard: { type: 'text' as const, content: matchText },
      pendingKeys: undefined,
    };
    return syncRegisters(state, nextState, true);
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const newLine = lineText.slice(0, startCol) + lineText.slice(endCol);
  const nextLines = [...state.lines];
  nextLines[targetLine] = newLine;

  const keyName = isForward ? 'n' : 'N';
  const opKeys = [op, 'g', keyName];

  if (op === 'c') {
    const resState: VimEditorState = {
      ...stateWithSnapshot,
      lines: nextLines,
      mode: 'INSERT',
      cursor: { line: targetLine, col: startCol },
      clipboard: { type: 'text' as const, content: matchText },
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
    };
    return syncRegisters(state, resState, false);
  }

  // op === 'd'
  const resState: VimEditorState = {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: targetLine, col: Math.min(startCol, Math.max(0, newLine.length - 1)) }, 'NORMAL'),
    clipboard: { type: 'text' as const, content: matchText },
    pendingKeys: undefined,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
  };
  return syncRegisters(state, resState, false);
}

/**
 * 검색 쿼리 문자열을 파싱 및 실행합니다.
 */
export function executeSearchQuery(
  state: VimEditorState,
  rawQuery: string,
  isReplayingDot = false
): VimEditorState {
  if (rawQuery.length === 0) {
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
      searchOperator: undefined,
    };
  }

  const { pattern, offset } = parseSearchQuery(rawQuery);
  const matches = findMatches(state.lines, pattern, state.options);
  if (matches.length === 0) {
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${pattern}`,
      searchOperator: undefined,
    };
  }

  const fromLine = state.searchOperator ? state.searchOperator.initialCursor.line : state.cursor.line;
  const fromCol = state.searchOperator ? state.searchOperator.initialCursor.col : state.cursor.col;
  const targetMatch =
    findNextMatch(matches, { line: fromLine, col: fromCol - 1 }) ??
    matches[0];

  const targetPos = applySearchOffset(state.lines, targetMatch, offset);

  // 연산자(d/pat/e, c/pat/e, y/pat/e 등) 결합 처리
  if (state.searchOperator) {
    const op = state.searchOperator.op;
    const startPos = state.searchOperator.initialCursor;
    const isLinewise = offset?.type === 'line';

    const res = executeSearchOperator(state, op, startPos, targetPos, isLinewise, offset?.type === 'end');
    const synced = syncRegisters(state, res, op === 'y');
    const opKeys = [op, '/', ...rawQuery.split(''), 'Enter'];

    if (op === 'c') {
      return {
        ...synced,
        lastSearchQuery: pattern,
        lastSearchOffset: offset,
        commandBuffer: undefined,
        commandType: undefined,
        searchOperator: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
      };
    }

    return {
      ...synced,
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      commandBuffer: undefined,
      commandType: undefined,
      searchOperator: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
    };
  }

  const matchIdx = matches.findIndex(
    (m) => m.line === targetMatch.line && m.col === targetMatch.col
  );

  const stateWithJump = recordJump(state);

  return {
    ...stateWithJump,
    mode: 'NORMAL',
    cursor: targetPos,
    lastSearchQuery: pattern,
    lastSearchOffset: offset,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `검색 일치 (${matchIdx + 1}/${matches.length}): ${pattern}`,
  };
}

/**
 * SEARCH 모드(/) 키 입력 처리
 */
function handleSearchModeKey(state: VimEditorState, key: string, isReplayingDot = false): VimEditorState {
  if (key === 'Escape') {
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      commandBuffer: undefined,
      commandType: undefined,
      searchOperator: undefined,
    };
  }

  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    return openCommandLineWindow(state, '/', state.commandBuffer);
  }

  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p') {
    return navigateHistory(state, 'up', '/');
  }

  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n') {
    return navigateHistory(state, 'down', '/');
  }

  if (key === 'Backspace') {
    if (state.commandBuffer && state.commandBuffer.length > 0) {
      return {
        ...state,
        commandBuffer: state.commandBuffer.slice(0, -1),
      };
    }
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      commandBuffer: undefined,
      commandType: undefined,
      searchOperator: undefined,
    };
  }

  if (key === 'Enter') {
    const rawQuery = state.commandBuffer ?? '';
    const nextState = addHistory(state, rawQuery, '/');
    return executeSearchQuery(nextState, rawQuery, isReplayingDot);
  }

  // 일반 타이핑 문자 누적
  if (key.length === 1) {
    return {
      ...state,
      commandBuffer: (state.commandBuffer ?? '') + key,
    };
  }

  return state;
}

/**
 * 현재 커서 위치에 텍스트를 즉시 삽입하고 커서를 끝 위치로 전진시킵니다.
 */
export function insertTextAtCursor(
  state: VimEditorState,
  text: string
): VimEditorState {
  if (text.length === 0) {
    return state;
  }

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (state.blockInsertSession) {
    const updatedChars = [...state.blockInsertSession.typedChars, ...text.split('')];
    state = {
      ...state,
      blockInsertSession: {
        ...state.blockInsertSession,
        typedChars: updatedChars,
      },
    };
  }

  if (!text.includes('\n')) {
    const newLine = currentLine.slice(0, col) + text + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + text.length },
    };
  }

  const parts = text.split('\n');
  const prefix = currentLine.slice(0, col);
  const suffix = currentLine.slice(col);

  const newLines = [
    ...state.lines.slice(0, line),
    prefix + parts[0],
    ...parts.slice(1, -1),
    parts[parts.length - 1] + suffix,
    ...state.lines.slice(line + 1),
  ];

  const finalLine = line + parts.length - 1;
  const finalCol = (parts[parts.length - 1] ?? '').length;

  return {
    ...state,
    lines: newLines,
    cursor: { line: finalLine, col: finalCol },
  };
}

/**
 * COMMAND 모드(: 또는 =) 키 입력 처리
 */
function handleCommandLineModeKey(state: VimEditorState, key: string): VimEditorState {
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
          commandMessage: `E15: ${evalRes.error ?? '잘못된 수식입니다'}`,
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
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      insertRegisterPending: undefined,
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
    return {
      ...s,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      insertRegisterPending: undefined,
      wildmenu: null,
    };
  }

  if (key === 'Enter') {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    const cmd = s.commandBuffer ?? '';
    const nextState = addHistory(s, cmd, ':');
    return executeCommandLine(nextState, cmd, handleKey);
  }

  // 일반 타이핑 문자 누적
  if (key.length === 1) {
    const s = state.wildmenu?.active ? acceptWildmenu(state) : state;
    return {
      ...s,
      commandBuffer: (s.commandBuffer ?? '') + key,
    };
  }

  return state;
}

/**
 * INSERT 모드 키 입력 처리
 */
function handleInsertModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // 타임아웃 발생 시 대기 버퍼 초기화
  if (key === 'Timeout') {
    return { ...state, pendingKeys: undefined, insertRegisterPending: undefined };
  }

  // Ctrl+r 레지스터 대기 상태 (INSERT_REGISTER_PENDING)
  if (state.insertRegisterPending) {
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      return { ...state, insertRegisterPending: undefined };
    }

    // Ctrl+r = (표현식 레지스터 입력 프롬프트)
    if (key === '=') {
      return {
        ...state,
        mode: 'COMMAND',
        commandType: '=',
        commandBuffer: '',
        insertRegisterPending: undefined,
        expressionReturnContext: {
          mode: 'INSERT',
          cursor: state.cursor,
        },
      };
    }

    // 레지스터 키 입력 (", 0~9, a~z, %, /, _, =)
    const regKey = key.length === 1 ? key : undefined;
    if (regKey) {
      const regClip = getRegisterContent(state, regKey);
      const textToInsert = regClip?.content ?? '';

      let nextState: VimEditorState = {
        ...state,
        insertRegisterPending: undefined,
      };

      if (textToInsert.length > 0) {
        nextState = insertTextAtCursor(nextState, textToInsert);
        if (!isReplayingDot && state.currentChangeKeys) {
          nextState.currentChangeKeys = [...state.currentChangeKeys, 'Ctrl-r', regKey];
        }
      }

      return nextState;
    }

    return { ...state, insertRegisterPending: undefined };
  }

  // Ctrl+r: 레지스터 즉시 삽입 대기 상태 진입
  if (key === 'Ctrl-r' || key === 'Ctrl+r' || key === 'ctrl-r' || key === '<C-r>') {
    return {
      ...state,
      insertRegisterPending: true,
    };
  }

  // 커스텀 키매핑 검사 (예: Insert 모드 jk 또는 jj -> <Esc>)
  if (state.pendingKeys) {
    const combined = `${state.pendingKeys}${key}`;
    const mapped =
      state.userKeymaps?.[`i:${combined}`] ||
      state.userKeymaps?.[combined];

    if (mapped === '<Esc>' || mapped === '<esc>') {
      // 직전에 입력되어 버퍼에 기록된 pendingKeys 문자(예: 'j')를 삭제
      const cleanedLine =
        currentLine.slice(0, Math.max(0, col - 1)) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = cleanedLine;
      const nextCol = Math.max(0, col - 2);

      let nextLastChange = state.lastChangeKeys;
      if (!isReplayingDot && state.currentChangeKeys) {
        nextLastChange = [...state.currentChangeKeys.slice(0, -1), 'Escape'];
      }

      const lastPos = { line, col: nextCol, row: line };
      const changeRecord = recordChangePosition(state.changeList, { line, col: nextCol });

      return {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line, col: nextCol }, 'NORMAL'),
        pendingKeys: undefined,
        lastChangeKeys: nextLastChange,
        currentChangeKeys: undefined,
        lastInsertPos: lastPos,
        changeList: changeRecord.changeList,
        changeIndex: changeRecord.changeIndex,
        marks: { ...(state.marks ?? {}), '^': { row: line, col: nextCol } },
      };
    }
  }


  // 자동완성 (Ctrl+n / Ctrl+p / Ctrl+e / Ctrl+y)
  if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'Alt-n' || key === 'Alt+n') {
    return startOrCycleCompletion(state, 'next');
  }
  if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'Alt-p' || key === 'Alt+p') {
    return startOrCycleCompletion(state, 'prev');
  }
  if (key === 'Ctrl-e' || key === 'Ctrl+e') {
    if (state.completionSession) {
      return cancelCompletion(state);
    }
  }
  if (key === 'Ctrl-y' || key === 'Ctrl+y') {
    if (state.completionSession) {
      return acceptCompletion(state);
    }
  }

  // 자동완성 이외의 키가 입력되면 활성 자동완성 세션 해제
  if (state.completionSession) {
    state = { ...state, completionSession: null };
  }

  // Ctrl+o: 단 1회의 Normal 명령 실행 (INSERT (normal))
  if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'Alt-o' || key === 'Alt+o') {
    return {
      ...state,
      mode: 'NORMAL',
      insertNormalSession: true,
      cursor: clampCursor(state.lines, state.cursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // ESC: NORMAL 모드로 복귀 (커서 1칸 좌측 보정)
  if (key === 'Escape') {
    // 비주얼 블록(Ctrl+v) 삽입 세션 중인 경우 나머지 행에 일괄 복제 반영
    if (state.blockInsertSession) {
      const insertedText = state.blockInsertSession.typedChars.join('');
      const targetLines = state.blockInsertSession.lines;
      const insertCol = state.blockInsertSession.col;
      const nextLines = [...state.lines];

      for (let i = 1; i < targetLines.length; i++) {
        const lineIdx = targetLines[i];
        let lineText = nextLines[lineIdx] ?? '';
        if (lineText.length < insertCol) {
          lineText = lineText.padEnd(insertCol, ' ');
        }
        nextLines[lineIdx] = lineText.slice(0, insertCol) + insertedText + lineText.slice(insertCol);
      }

      const firstLineIdx = targetLines[0];
      const nextCol = Math.max(0, col - 1);
      const lastPos = { line: firstLineIdx, col: insertCol, row: firstLineIdx };
      const changeRecord = recordChangePosition(state.changeList, { line: firstLineIdx, col: insertCol });

      return {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line: firstLineIdx, col: nextCol }, 'NORMAL'),
        blockInsertSession: null,
        pendingKeys: undefined,
        currentChangeKeys: undefined,
        lastInsertPos: lastPos,
        changeList: changeRecord.changeList,
        changeIndex: changeRecord.changeIndex,
        marks: { ...(state.marks ?? {}), '^': { row: firstLineIdx, col: insertCol } },
      };
    }

    const nextCol = Math.max(0, col - 1);

    let nextLastChange = state.lastChangeKeys;
    if (!isReplayingDot && state.currentChangeKeys) {
      nextLastChange = [...state.currentChangeKeys, 'Escape'];
    }

    const lastPos = { line, col, row: line };
    const changeRecord = recordChangePosition(state.changeList, { line, col });

    return {
      ...state,
      mode: 'NORMAL',
      cursor: clampCursor(state.lines, { line, col: nextCol }, 'NORMAL'),
      pendingKeys: undefined,
      lastChangeKeys: nextLastChange,
      currentChangeKeys: undefined,
      lastInsertPos: lastPos,
      changeList: changeRecord.changeList,
      changeIndex: changeRecord.changeIndex,
      marks: { ...(state.marks ?? {}), '^': { row: line, col } },
    };

  }


  // 키 입력 기록 (Dot Repeat 용)
  const appendCurrentChange = (k: string) => {
    if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
    return [...state.currentChangeKeys, k];
  };

  // Ctrl+w: 커서 앞의 단어 하나 즉시 삭제
  if (key === 'Ctrl-w' || key === 'Ctrl+w' || key === 'Alt-w' || key === 'Alt+w') {
    const nextChangeKeys = appendCurrentChange('Ctrl-w');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }
    if (col > 0) {
      let start = col;
      while (start > 0 && /\s/.test(currentLine[start - 1])) {
        start--;
      }
      if (start > 0) {
        const isWordChar = /\w/.test(currentLine[start - 1]);
        while (
          start > 0 &&
          (isWordChar
            ? /\w/.test(currentLine[start - 1])
            : !/\w/.test(currentLine[start - 1]) && !/\s/.test(currentLine[start - 1]))
        ) {
          start--;
        }
      }
      const newLine = currentLine.slice(0, start) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: start },
        currentChangeKeys: nextChangeKeys,
      };
    }
    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Ctrl+u: 현재 줄의 커서 앞쪽 내용을 줄 시작까지 통째로 삭제
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'Alt-u' || key === 'Alt+u') {
    const nextChangeKeys = appendCurrentChange('Ctrl-u');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }
    const newLine = currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: 0 },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // Backspace 또는 Ctrl+h: 이전 문자 삭제 또는 윗줄과 병합
  if (
    key === 'Backspace' ||
    key === 'Ctrl-h' ||
    key === 'Ctrl+h' ||
    key === 'Alt-h' ||
    key === 'Alt+h'
  ) {
    if (state.blockInsertSession) {
      const updatedChars = state.blockInsertSession.typedChars.slice(0, -1);
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange('Backspace');

    if (col > 0) {
      const newLine = currentLine.slice(0, col - 1) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col - 1 },
        currentChangeKeys: nextChangeKeys,
      };
    }

    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }

    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Enter: 줄 분할 및 다음 줄 맨 앞으로 이동
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange('Enter');
    const firstPart = currentLine.slice(0, col);
    const secondPart = currentLine.slice(col);

    const nextLines = [
      ...state.lines.slice(0, line),
      firstPart,
      secondPart,
      ...state.lines.slice(line + 1),
    ];

    return {
      ...state,
      lines: nextLines,
      cursor: { line: line + 1, col: 0 },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // Tab: 2칸 공백 들여쓰기 삽입
  if (key === 'Tab') {
    const nextChangeKeys = appendCurrentChange('Tab');
    const indent = '  ';
    const newLine = currentLine.slice(0, col) + indent + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + indent.length },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // 방향키 이동 지원
  if (key === 'ArrowLeft') {
    return {
      ...state,
      cursor: { line, col: Math.max(0, col - 1) },
    };
  }

  if (key === 'ArrowRight') {
    return {
      ...state,
      cursor: { line, col: Math.min(currentLine.length, col + 1) },
    };
  }

  if (key === 'ArrowUp') {
    const targetLine = Math.max(0, line - 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  if (key === 'ArrowDown') {
    const targetLine = Math.min(state.lines.length - 1, line + 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  // 일반 타이핑 문자 입력 (길이가 1인 모든 문자 및 공백)
  if (key.length === 1) {
    if (state.blockInsertSession) {
      const updatedChars = [...state.blockInsertSession.typedChars, key];
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange(key);
    const newLine = currentLine.slice(0, col) + key + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    // 현재 입력된 문자가 Insert 모드 다중 키 매핑의 접두사인지 확인 (예: 'jk'의 'j')
    const isMappingPrefix = Object.keys(state.userKeymaps ?? {}).some((k) => {
      const from = k.startsWith('i:') ? k.slice(2) : k;
      return from.length > 1 && from.startsWith(key);
    });

    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
      pendingKeys: isMappingPrefix ? key : undefined,
      currentChangeKeys: nextChangeKeys,
    };
  }

  return state;
}

/**
 * REPLACE (R) 모드 키 입력 처리:
 * 1:1 글자 덮어쓰기 및 Backspace 시 원본 글자 복원
 */
function handleReplaceModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  _macroDepth = 0
): VimEditorState {
  if (key === 'Escape') {
    const curLine = state.lines[state.cursor.line] ?? '';
    const maxCol = getMaxCol(curLine, 'NORMAL');
    const newCol = Math.max(0, Math.min(state.cursor.col - 1, maxCol));
    const nextLastChange = state.currentChangeKeys ? [...state.currentChangeKeys, 'Escape'] : undefined;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: { line: state.cursor.line, col: newCol },
      replaceStack: undefined,
      currentChangeKeys: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : nextLastChange,
    };
  }

  if (key === 'Backspace') {
    const stack = state.replaceStack ?? [];
    if (stack.length === 0) {
      // 교체 모드 진입 지점 이전으로는 백스페이스 이동 불가
      return state;
    }
    const last = stack[stack.length - 1];
    const newStack = stack.slice(0, -1);
    const lineIdx = last.line;
    const curLine = state.lines[lineIdx] ?? '';
    let newLine: string;

    if (last.char === '') {
      // 줄 끝을 초과하여 덧붙여졌던 문자 삭제
      newLine = curLine.slice(0, last.col) + curLine.slice(last.col + 1);
    } else {
      // 덮어써졌던 원본 문자 복구
      newLine = curLine.slice(0, last.col) + last.char + curLine.slice(last.col + 1);
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Backspace'] : undefined;

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: last.col },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'Enter') {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const before = curLine.slice(0, col);
    const after = curLine.slice(col);
    const nextLines = [
      ...state.lines.slice(0, lineIdx),
      before,
      after,
      ...state.lines.slice(lineIdx + 1),
    ];
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Enter'] : undefined;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx + 1, col: 0 },
      replaceStack: [],
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'ArrowLeft') {
    return { ...state, cursor: { line: state.cursor.line, col: Math.max(0, state.cursor.col - 1) } };
  }
  if (key === 'ArrowRight') {
    return { ...state, cursor: { line: state.cursor.line, col: state.cursor.col + 1 } };
  }
  if (key === 'ArrowUp') {
    return { ...state, cursor: { line: Math.max(0, state.cursor.line - 1), col: state.cursor.col } };
  }
  if (key === 'ArrowDown') {
    return { ...state, cursor: { line: Math.min(state.lines.length - 1, state.cursor.line + 1), col: state.cursor.col } };
  }

  // 단일 입력 문자 1:1 덮어쓰기
  if (key.length === 1) {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const stack = state.replaceStack ?? [];

    let newLine: string;
    let oldChar = '';

    if (col < curLine.length) {
      oldChar = curLine[col];
      newLine = curLine.slice(0, col) + key + curLine.slice(col + 1);
    } else {
      const padding = ' '.repeat(col - curLine.length);
      newLine = curLine + padding + key;
      oldChar = '';
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const newStack = [...stack, { char: oldChar, line: lineIdx, col }];
    const nextChangeKeys = state.currentChangeKeys
      ? [...state.currentChangeKeys, key]
      : ['R', key];

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: col + 1 },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  return state;
}

/**
 * 순정 Vim 윈도우/스플릿 제어 키스트로크 (Ctrl-w) 처리
 */
function handleCtrlWKey(
  state: VimEditorState,
  key: string,
  count?: number
): VimEditorState {
  // 창 생성: s, v, n
  if (key === 's' || key === 'Ctrl-s' || key === 'Ctrl+s') {
    return { ...splitWindow(state, 'horizontal', state.secondaryLines), pendingKeys: undefined };
  }
  if (key === 'v' || key === 'Ctrl-v' || key === 'Ctrl+v') {
    return { ...splitWindow(state, 'vertical', state.secondaryLines), pendingKeys: undefined };
  }
  if (key === 'n' || key === 'Ctrl-n' || key === 'Ctrl+n') {
    return { ...splitWindow(state, 'horizontal', [''], '[No Name]'), pendingKeys: undefined };
  }

  // 창 포커스 이동: w, W, h, l, k, j, t, b, p
  if (key === 'w' || key === 'Ctrl-w' || key === 'Ctrl+w') {
    return { ...switchPaneFocus(state, (state.activePaneIndex ?? 0) === 0 ? 1 : 0), pendingKeys: undefined };
  }
  if (key === 'W') {
    return { ...switchPaneFocus(state, (state.activePaneIndex ?? 0) === 0 ? 1 : 0), pendingKeys: undefined };
  }
  if (key === 'h' || key === 'Ctrl-h' || key === 'Ctrl+h' || key === 'ArrowLeft') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'l' || key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'ArrowRight') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 'k' || key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ArrowUp') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'j' || key === 'Ctrl-j' || key === 'Ctrl+j' || key === 'ArrowDown') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 't' || key === 'Ctrl-t' || key === 'Ctrl+t') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'b' || key === 'Ctrl-b' || key === 'Ctrl+b') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 'p' || key === 'Ctrl-p' || key === 'Ctrl+p') {
    const prev = state.previousPaneIndex ?? ((state.activePaneIndex ?? 0) === 0 ? 1 : 0);
    return { ...switchPaneFocus(state, prev), pendingKeys: undefined };
  }

  // 창 닫기 및 유일 창: c, q, o
  if (key === 'c' || key === 'q') {
    return { ...closeSplitWindow(state), pendingKeys: undefined };
  }
  if (key === 'o' || key === 'Ctrl-o' || key === 'Ctrl+o') {
    return { ...closeOtherPanes(state), pendingKeys: undefined };
  }

  // 창 위치 맞바꾸기 및 회전: x, r, R
  if (key === 'x' || key === 'Ctrl-x' || key === 'Ctrl+x') {
    return { ...exchangePanes(state), pendingKeys: undefined };
  }
  if (key === 'r' || key === 'Ctrl-r' || key === 'Ctrl+r') {
    return { ...rotatePanes(state, false), pendingKeys: undefined };
  }
  if (key === 'R') {
    return { ...rotatePanes(state, true), pendingKeys: undefined };
  }

  // 레이아웃 이동 및 전환: H, J, K, L, T
  if (key === 'H') {
    return { ...movePaneToDirection(state, 'H'), pendingKeys: undefined };
  }
  if (key === 'L') {
    return { ...movePaneToDirection(state, 'L'), pendingKeys: undefined };
  }
  if (key === 'K') {
    return { ...movePaneToDirection(state, 'K'), pendingKeys: undefined };
  }
  if (key === 'J') {
    return { ...movePaneToDirection(state, 'J'), pendingKeys: undefined };
  }
  if (key === 'T') {
    return { ...moveWindowToNewTab(state), pendingKeys: undefined };
  }

  // 창 크기 조절: =, +, -, >, <, _, |
  if (key === '=') {
    return { ...resizeSplit(state, '='), pendingKeys: undefined };
  }
  if (key === '_' || key === '|') {
    return { ...resizeSplit(state, key), pendingKeys: undefined };
  }
  if (key === '+' || key === '>') {
    return { ...resizeSplit(state, count ?? 5), pendingKeys: undefined };
  }
  if (key === '-' || key === '<') {
    return { ...resizeSplit(state, -(count ?? 5)), pendingKeys: undefined };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}

/**
 * VISUAL / VISUAL_LINE 모드 키 입력 처리
 */
function handleVisualModeKey(state: VimEditorState, key: string): VimEditorState {
  const parsed = parsePending(state.pendingKeys);

  if (key === 'Escape') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
      activeRegister: undefined,
      lastVisualSelection: state.visualAnchor
        ? {
            mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
            anchor: { ...state.visualAnchor },
            cursor: { ...state.cursor },
          }
        : state.lastVisualSelection,
    };
  }

  // Visual 모드 내 gn / gN (다음/이전 검색 매치로 선택 영역 확장) 및 gt / gT (탭 전환)
  if (state.pendingKeys === 'g') {
    if (key === 'n' || key === 'N') {
      return executeGn(state, key === 'n');
    }
    if (key === 't') {
      return { ...nextTab(state), pendingKeys: undefined };
    }
    if (key === 'T') {
      return { ...prevTab(state), pendingKeys: undefined };
    }
  }


  // 명명된 레지스터 지정 ("{register})
  if (state.pendingKeys === '"') {
    if (/^[a-zA-Z0-9"+_]$/.test(key)) {
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

  // 윈도우 분할 및 포커스 제어 (Ctrl-w)
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

  // 비주얼 모드 커스텀 키매핑 (예: H -> ^, L -> $)
  if (!state.pendingKeys) {
    const visualMapped =
      state.userKeymaps?.[`v:${key}`] || state.userKeymaps?.[key];
    if (visualMapped === '^') {
      return { ...state, cursor: moveToFirstNonBlank(state.lines, state.cursor) };
    }
    if (visualMapped === '$') {
      return { ...state, cursor: moveToLineEnd(state.lines, state.cursor) };
    }
  }

  // 숫자 누적 (카운트 모션 지원)
  if (key === '0') {
    if (state.pendingKeys && /[0-9]$/.test(state.pendingKeys)) {
      return {
        ...state,
        pendingKeys: state.pendingKeys + '0',
      };
    }
    // 단독 0: 줄 맨 앞으로 이동
    if (!state.pendingKeys) {
      return {
        ...state,
        cursor: moveToLineStart(state.lines, state.cursor),
      };
    }
  }

  if (/^[1-9]$/.test(key)) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  // 'g' 접두사 대기 상태 (gg, gv, gd, g;, g,, g Ctrl-a, g Ctrl-x 등)
  if (state.pendingKeys?.endsWith('g') || parsed.operator === 'g') {
    if (key === 'g') {
      const targetLine = parsed.count1 !== undefined
        ? Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1))
        : 0;
      return {
        ...state,
        cursor: { line: targetLine, col: Math.min(state.cursor.col, getMaxCol(state.lines[targetLine], 'VISUAL')) },
        pendingKeys: undefined,
      };
    }
    if (key === 'v') {
      return reselectLastVisual(state);
    }
    if (key === 'd') {
      return goToDeclaration(state);
    }
    if (key === ';') {
      return traverseChangeList(state, 'prev', parsed.totalCount);
    }
    if (key === ',') {
      return traverseChangeList(state, 'next', parsed.totalCount);
    }
    if (
      key === 'Ctrl-a' ||
      key === 'Ctrl+a' ||
      key === 'ctrl-a' ||
      key === '<C-a>'
    ) {
      return modifyNumberVisual(state, true, true, parsed.totalCount);
    }
    if (
      key === 'Ctrl-x' ||
      key === 'Ctrl+x' ||
      key === 'ctrl-x' ||
      key === '<C-x>'
    ) {
      return modifyNumberVisual(state, false, true, parsed.totalCount);
    }
    if (key === 'J') {
      if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      const joinCount = maxLine - minLine;
      const tempState: VimEditorState = {
        ...state,
        cursor: { line: minLine, col: 0 },
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
      };
      return joinLines(tempState, Math.max(1, joinCount), false);
    }
    return { ...state, pendingKeys: undefined };
  }

  // 복합 키 표현 (g<Ctrl-a>, g<C-a>, g Ctrl-a, g Ctrl+a, g<Ctrl-x>, g<C-x>, g Ctrl-x, g Ctrl+x)
  if (
    key === 'g<Ctrl-a>' ||
    key === 'g<C-a>' ||
    key === 'g Ctrl-a' ||
    key === 'g Ctrl+a'
  ) {
    return modifyNumberVisual(state, true, true, parsed.totalCount);
  }
  if (
    key === 'g<Ctrl-x>' ||
    key === 'g<C-x>' ||
    key === 'g Ctrl-x' ||
    key === 'g Ctrl+x'
  ) {
    return modifyNumberVisual(state, false, true, parsed.totalCount);
  }

  // VISUAL 모드 직접 Ctrl-a / Ctrl-x (모든 선택 숫자 일괄 증감)
  if (
    key === 'Ctrl-a' ||
    key === 'Ctrl+a' ||
    key === 'ctrl-a' ||
    key === '<C-a>'
  ) {
    return modifyNumberVisual(state, true, false, parsed.totalCount);
  }
  if (
    key === 'Ctrl-x' ||
    key === 'Ctrl+x' ||
    key === 'ctrl-x' ||
    key === '<C-x>'
  ) {
    return modifyNumberVisual(state, false, false, parsed.totalCount);
  }

  if (key === 'gv') {
    return reselectLastVisual(state);
  }

  if (key === 'g') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'g',
    };
  }

  // 'v': VISUAL 모드 토글 또는 전환
  if (key === 'v') {
    if (state.mode === 'VISUAL') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL',
      pendingKeys: undefined,
    };
  }

  // 'V': VISUAL_LINE 모드 토글 또는 전환
  if (key === 'V') {
    if (state.mode === 'VISUAL_LINE') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL_LINE',
      pendingKeys: undefined,
    };
  }

  // 'Ctrl+v' / 'Ctrl-v': VISUAL_BLOCK 모드 토글 또는 전환
  if (key === 'Ctrl+v' || key === 'Ctrl-v' || key === 'ctrl-v') {
    if (state.mode === 'VISUAL_BLOCK') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL_BLOCK',
      pendingKeys: undefined,
    };
  }


  // VISUAL_BLOCK 전용 모드 삽입 연산자 (I, A, c)
  if (state.mode === 'VISUAL_BLOCK') {
    if (key === 'I') {
      return startVisualBlockInsert(state, 'I');
    }
    if (key === 'A') {
      return startVisualBlockInsert(state, 'A');
    }
    if (key === 'c') {
      return startVisualBlockInsert(state, 'c');
    }
  }

  // ':' 키: VISUAL 선택 영역 범위를 포함하여 커맨드라인 모드 진입 (:'<,'>)
  if (key === ':') {
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: "'<,'>",
      pendingKeys: undefined,
    };
  }

  // 화면 뷰포트 기준 이동 및 스크롤 (H, M, L, Ctrl-d, Ctrl-u)
  if (key === 'H') {
    const res = cursorToHigh(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'M') {
    const res = cursorToMiddle(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'L') {
    const res = cursorToLow(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') {
    const res = scrollHalfPageDown(state);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') {
    const res = scrollHalfPageUp(state);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }

  // '%' 키: 짝이 되는 괄호로 선택 영역 확장
  if (key === '%') {
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      return {
        ...state,
        cursor: matchPos,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // ';' 및 ',' 키: 줄 내 문자 탐색 반복
  if (key === ';') {
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
    return { ...state, pendingKeys: undefined };
  }

  if (key === ',') {
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
    return { ...state, pendingKeys: undefined };
  }

  // 텍스트 객체 선택 (i 또는 a 대기 상태: iw, aw, i", a", i(, a(, i{, a{ 등)
  const visualObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ia])$/);
  if (visualObjMatch) {
    const count = visualObjMatch[1] ? parseInt(visualObjMatch[1], 10) : 1;
    const modifier = visualObjMatch[2] as 'i' | 'a';
    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';

      const objType: TextObjectType = `${modifier}${targetChar}` as TextObjectType;
      return executeTextObjectOperator(state, 'v', objType, count);
    }
    return { ...state, pendingKeys: undefined };
  }

  if (key === 'i' || key === 'a') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  // 문자 탐색 대기 상태 (f, F, t, T)
  const visualFindMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ftFT])$/);
  if (visualFindMatch) {
    const count = visualFindMatch[1] ? parseInt(visualFindMatch[1], 10) : 1;
    const motion = visualFindMatch[2] as 'f' | 't' | 'F' | 'T';
    if (key.length === 1) {
      const nextPos = moveFind(state.lines, state.cursor, motion, key, count);
      return {
        ...state,
        cursor: nextPos ?? state.cursor,
        lastCharSearch: { type: motion, char: key },
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  const visualSnapshot = state.visualAnchor
    ? {
        mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
        anchor: { ...state.visualAnchor },
        cursor: { ...state.cursor },
      }
    : state.lastVisualSelection;

  // 선택 영역 삭제 (d / x)
  if (key === 'd' || key === 'x') {
    const res = deleteVisualSelection(state);
    const synced = syncRegisters(state, res, false);
    return { ...synced, lastVisualSelection: visualSnapshot };
  }

  // 선택 영역 복사 (y)
  if (key === 'y') {
    const res = yankVisualSelection(state);
    const synced = syncRegisters(state, res, true);
    return { ...synced, lastVisualSelection: visualSnapshot };
  }

  // 선택 영역 붙여넣기 (p / P)
  if (key === 'p' || key === 'P') {
    const delRes = deleteVisualSelection(state);
    const synced = syncRegisters(state, delRes, false);
    const res = putFromRegister(synced, state.activeRegister, false);
    return { ...res, lastVisualSelection: visualSnapshot };
  }

  // * 및 # : 현재 커서 아래 단어로 검색 후 비주얼 커서 이동
  if (key === '*' || key === '#') {
    const word = getWordAtCursor(state.lines[state.cursor.line] ?? '', state.cursor.col);
    if (word) {
      const matches = findMatches(state.lines, word, state.options);
      const match =
        key === '*'
          ? findNextMatch(matches, state.cursor) ?? matches[0]
          : findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      if (match) {
        return {
          ...state,
          cursor: { line: match.line, col: match.col },
          lastSearchQuery: word,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }


  // J: 선택 영역 모든 행 이어 붙이기
  if (key === 'J') {
    if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
    const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
    const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
    const joinCount = maxLine - minLine;
    const tempState: VimEditorState = {
      ...state,
      cursor: { line: minLine, col: 0 },
      mode: 'NORMAL',
      visualAnchor: undefined,
    };
    return joinLines(tempState, Math.max(1, joinCount));
  }

  // 대소문자 변환 (~, u, U)
  if (key === '~') {
    return changeCaseVisual(state, 'toggle');
  }
  if (key === 'u') {
    return changeCaseVisual(state, 'lower');
  }
  if (key === 'U') {
    return changeCaseVisual(state, 'upper');
  }

  // 들여쓰기 / 내어쓰기 / 정렬 (>, <, =)
  if (key === '>') {
    return indentVisual(state, 'in');
  }
  if (key === '<') {
    return indentVisual(state, 'out');
  }
  if (key === '=') {
    return formatIndentVisual(state);
  }

  // 마크 설정 (m{a-z})
  if (state.pendingKeys === 'm') {
    if (/^[a-z]$/.test(key)) {
      return setMark(state, key);
    }
    return { ...state, pendingKeys: undefined };
  }
  if (key === 'm' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'm' };
  }

  // 마크 점프 ('{a-z}, `{a-z}) - 선택 영역 확장
  if (state.pendingKeys === "'" || state.pendingKeys === '`') {
    const quote = state.pendingKeys;
    if (/^[a-z]$/.test(key)) {
      const mark = state.marks?.[key];
      if (mark) {
        const targetLine = Math.max(0, Math.min(mark.row, state.lines.length - 1));
        let targetCursor: CursorPosition;
        if (quote === "'") {
          targetCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });
        } else {
          const lineLen = (state.lines[targetLine] ?? '').length;
          targetCursor = { line: targetLine, col: Math.max(0, Math.min(mark.col, Math.max(0, lineLen - 1))) };
        }
        return {
          ...state,
          cursor: targetCursor,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }
  if ((key === "'" || key === '`') && !state.pendingKeys) {
    return { ...state, pendingKeys: key };
  }

  // VISUAL 모드 내 커서 이동 (모션 평가 및 카운트 반영)
  const motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount,
    state.folds
  );

  if (motionCursor) {
    return {
      ...state,
      cursor: motionCursor,
      pendingKeys: undefined,
    };
  }

  return state;
}

function getOppositeMotion(motion: 'f' | 'F' | 't' | 'T'): 'f' | 'F' | 't' | 'T' {
  switch (motion) {
    case 'f': return 'F';
    case 'F': return 'f';
    case 't': return 'T';
    case 'T': return 't';
  }
}

/**
 * NORMAL 모드 키 입력 처리
 */
function handleNormalModeKey(
  state: VimEditorState,
  key: string,
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
  if (state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])g$/)) {
    // cg, dg, yg 대기 상태에서 n/N이 아닌 다른 키가 들어오면 pending 취소
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
        return executeCommandLine(
          { ...state, pendingKeys: undefined },
          mapped.slice(1),
          handleKey
        );
      }
      let s: VimEditorState = { ...state, pendingKeys: undefined };
      for (const ch of mapped.split('')) {
        s = handleKey(s, ch, isReplayingDot, macroDepth);
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

  // 1-0-3. 단일 키 매핑 처리 (H -> ^, L -> $, Ctrl-h -> Ctrl-w h 등)
  if (!state.pendingKeys) {
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
        return executeCommandLine(state, singleMapped.slice(1), handleKey);
      }
      let s: VimEditorState = state;
      for (const ch of singleMapped.split('')) {
        s = handleKey(s, ch, isReplayingDot, macroDepth);
      }
      return s;
    }
  }

  // 1-0-a. 명명된 레지스터 지정 ("{register})
  if (state.pendingKeys === '"') {
    if (/^[a-zA-Z0-9"+_]$/.test(key)) {
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
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-2. 연산자 결합: d;, c;, y;, d,, c,, y,
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y') &&
    (key === ';' || key === ',')
  ) {
    if (state.lastCharSearch) {
      const op = parsed.operator;
      const motion = key === ';' ? state.lastCharSearch.type : getOppositeMotion(state.lastCharSearch.type);
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
    return state;
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
    return state;
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
    return state;
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
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-a'] : ['Ctrl-a'];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if ((key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, -parsed.totalCount);
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

  // Ctrl-d / Ctrl-u: 반 페이지 아래/위 스크롤
  if ((key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') && !parsed.operator) {
    return scrollHalfPageDown(state);
  }
  if ((key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') && !parsed.operator) {
    return scrollHalfPageUp(state);
  }

  // zz, zt, zb: 뷰포트 정렬 및 zc, zo, za, zM, zR: 코드 폴딩
  if (state.pendingKeys === 'z' || parsed.operator === 'z') {
    if (key === 'z') return scrollToCenter(state);
    if (key === 't') return scrollToTop(state);
    if (key === 'b') return scrollToBottom(state);
    if (key === 'c') return foldClose(state);
    if (key === 'o') return foldOpen(state);
    if (key === 'a') return foldToggle(state);
    if (key === 'M') return foldCloseAll(state);
    if (key === 'R') return foldOpenAll(state);
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-7. J: 줄 이어 붙이기
  if (key === 'J' && !parsed.operator) {
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
    if (/^[a-z]$/.test(key)) {
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

  // 1-0-10. 단독 마크 점프 ('{a-z}, `{a-z})
  const standaloneMarkMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?(['`])$/);
  if (standaloneMarkMatch) {
    const quote = standaloneMarkMatch[2];
    if (/^[a-z]$/.test(key)) {
      return jumpToMark(state, key, quote === "'");
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-11. 마크 설정 (m{a-z})
  if (state.pendingKeys === 'm' || parsed.operator === 'm') {
    if (/^[a-z]$/.test(key)) {
      return setMark(state, key);
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-0-12. 들여쓰기 / 내어쓰기 / 정렬 (>>, <<, ==)
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

  // 1-0-13. g 대소문자 변환 (guu, gUU, g~~)
  const gCaseMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?g([~uU])$/);
  if (gCaseMatch) {
    const gType = gCaseMatch[2];
    if (key === gType || (gType === 'u' && key === 'u') || (gType === 'U' && key === 'U') || (gType === '~' && key === '~')) {
      const visualState: VimEditorState = {
        ...state,
        mode: 'VISUAL_LINE',
        visualAnchor: { line: state.cursor.line, col: 0 },
        cursor: { line: state.cursor.line, col: 0 },
      };
      const caseType = gType === '~' ? 'toggle' : gType === 'u' ? 'lower' : 'upper';
      return changeCaseVisual(visualState, caseType);
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

    const macroKeys = Array.isArray(regEntry.content) ? regEntry.content : [regEntry.content];
    let curState: VimEditorState = {
      ...state,
      pendingKeys: undefined,
      lastPlayedMacro: targetReg,
    };

    const repeatCount = parsed.totalCount;
    for (let c = 0; c < repeatCount; c++) {
      if (macroDepth >= 100) break;
      curState = macroKeys.reduce((accState, mk) => {
        if (macroDepth >= 100) return accState;
        return handleKey(accState, mk, false, macroDepth + 1);
      }, curState);
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
      curState = handleKey(curState, rk, true);
    }
    return {
      ...curState,
      lastChangeKeys: replayKeys,
    };
  }

  // 3. 'r' (단일 문자 교체) 대기 상태
  if (parsed.operator === 'r') {
    if (key.length === 1) {
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

  // 4. 텍스트 객체 대기 상태 (di, da, ci, ca, yi, ya, vi, va, =i, =a 및 카운트 조합)
  const textObjPendingMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv=])([ia])$/);
  if (textObjPendingMatch) {
    const count = textObjPendingMatch[1] ? parseInt(textObjPendingMatch[1], 10) : 1;
    const op = textObjPendingMatch[2] as 'd' | 'c' | 'y' | 'v' | '=';
    const modifier = textObjPendingMatch[3] as 'i' | 'a';

    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';

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
      if (op === 'd') {
        return {
          ...synced,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
        };
      }
      if (op === '=') {
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
        ...state,
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

  // 8. 연산자 대기 처리 (d, c, y, g, v)

  if (parsed.operator === 'd') {
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

    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g') {
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
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g') {
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

    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`' || key === 'g') {
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
    if (key === 'i') {
      return goToLastInsert(state);
    }
    if (key === 'v') {
      return reselectLastVisual(state);
    }
    if (key === ';') {
      return traverseChangeList(state, 'prev', parsed.totalCount);
    }
    if (key === ',') {
      return traverseChangeList(state, 'next', parsed.totalCount);
    }
    if (key === 'J') {
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
    if (key === '~' || key === 'u' || key === 'U') {

      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }

  // 9. 연산자 및 매크로 키 등록 (d, c, r, g, y, f, F, t, T, @, q, m, ', `, >, <, =, z)
  if (
    key === 'd' || key === 'c' || key === 'r' || key === 'g' || key === 'y' ||
    key === '@' || key === '>' || key === '<' || key === '=' || key === 'm' ||
    key === "'" || key === '`' || key === 'z'
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
          commandMessage: `E486: 패턴을 찾을 수 없습니다: ${state.lastSearchQuery}`,
          pendingKeys: undefined,
        };
      }
      const nextMatch = findNextMatch(matches, state.cursor) ?? matches[0];
      const matchIdx = matches.findIndex((m) => m.line === nextMatch.line && m.col === nextMatch.col);
      const targetPos = applySearchOffset(state.lines, nextMatch, state.lastSearchOffset);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: targetPos,
        commandMessage: `다음 검색 결과 (${matchIdx + 1}/${matches.length}): ${state.lastSearchQuery}`,
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
          commandMessage: `E486: 패턴을 찾을 수 없습니다: ${state.lastSearchQuery}`,
          pendingKeys: undefined,
        };
      }
      const prevMatch = findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      const matchIdx = matches.findIndex((m) => m.line === prevMatch.line && m.col === prevMatch.col);
      const targetPos = applySearchOffset(state.lines, prevMatch, state.lastSearchOffset);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: targetPos,
        commandMessage: `이전 검색 결과 (${matchIdx + 1}/${matches.length}): ${state.lastSearchQuery}`,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // *: 커서 아래 단어로 검색어 설정 후 다음 결과로 점프
  if (key === '*') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (word) {
      const matches = findMatches(state.lines, word, state.options);
      const nextMatch = findNextMatch(matches, state.cursor) ?? matches[0];
      const matchIdx = nextMatch
        ? matches.findIndex((m) => m.line === nextMatch.line && m.col === nextMatch.col)
        : -1;
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: nextMatch ? { line: nextMatch.line, col: nextMatch.col } : state.cursor,
        lastSearchQuery: word,
        commandMessage: `단어 '${word}' 검색 (${matchIdx + 1}/${matches.length})`,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // #: 커서 아래 단어로 검색어 설정 후 이전 결과로 점프
  if (key === '#') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (word) {
      const matches = findMatches(state.lines, word, state.options);
      const prevMatch = findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      const matchIdx = prevMatch
        ? matches.findIndex((m) => m.line === prevMatch.line && m.col === prevMatch.col)
        : -1;
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: prevMatch ? { line: prevMatch.line, col: prevMatch.col } : state.cursor,
        lastSearchQuery: word,
        commandMessage: `단어 '${word}' 역방향 검색 (${matchIdx + 1}/${matches.length})`,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }


  // 실행 취소 (Undo)
  if (key === 'u') {
    return undo(state);
  }

  // 다시 실행 (Redo)
  if (key === 'Ctrl-r' || key === 'ctrl+r') {
    return redo(state);
  }

  // p: 레지스터/클립보드 붙여넣기 (커서 뒤)
  if (key === 'p') {
    const res = putFromRegister(state, state.activeRegister, false);
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['p'],
    };
  }

  // P: 레지스터/클립보드 붙여넣기 (커서 앞)
  if (key === 'P') {
    const res = putFromRegister(state, state.activeRegister, true);
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['P'],
    };
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
  if (process.env.NODE_ENV !== 'production') {
    deepFreeze(state);
    const nextState = rawHandleKey(state, key, isReplayingDot, macroDepth);
    assertValidVimState(state, nextState, key);
    return nextState;
  }
  return rawHandleKey(state, key, isReplayingDot, macroDepth);
}

/**
 * 카운트 배수를 적용하여 단일 모션을 여러 번 반복 평가합니다.
 */
function evaluateMotionWithCount(
  lines: string[],
  cursor: { line: number; col: number },
  key: string,
  count = 1,
  folds?: FoldRange[]
): { line: number; col: number } | null {
  let cur = { ...cursor };
  let matched = true;

  switch (key) {
    case 'h':
    case 'ArrowLeft':
      for (let i = 0; i < count; i++) cur = moveLeft(lines, cur);
      break;

    case 'l':
    case 'ArrowRight':
      for (let i = 0; i < count; i++) cur = moveRight(lines, cur);
      break;

    case 'j':
    case 'ArrowDown':
      for (let i = 0; i < count; i++) {
        if (folds && folds.length > 0) {
          const nextLine = getNextVisibleLine(folds, cur.line, lines.length - 1);
          const maxCol = getMaxCol(lines[nextLine]);
          cur = { line: nextLine, col: Math.min(cur.col, maxCol) };
        } else {
          cur = moveDown(lines, cur);
        }
      }
      break;

    case 'k':
    case 'ArrowUp':
      for (let i = 0; i < count; i++) {
        if (folds && folds.length > 0) {
          const prevLine = getPrevVisibleLine(folds, cur.line);
          const maxCol = getMaxCol(lines[prevLine]);
          cur = { line: prevLine, col: Math.min(cur.col, maxCol) };
        } else {
          cur = moveUp(lines, cur);
        }
      }
      break;

    case '0':
      cur = moveToLineStart(lines, cur);
      break;

    case '$':
      if (count > 1) {
        cur.line = Math.min(lines.length - 1, cur.line + count - 1);
      }
      cur = moveToLineEnd(lines, cur);
      break;

    case '^':
      cur = moveToFirstNonBlank(lines, cur);
      break;

    case 'w':
      for (let i = 0; i < count; i++) cur = moveToNextWord(lines, cur);
      break;

    case 'W':
      for (let i = 0; i < count; i++) cur = moveToNextWORD(lines, cur);
      break;

    case 'b':
      for (let i = 0; i < count; i++) cur = moveToPrevWord(lines, cur);
      break;

    case 'B':
      for (let i = 0; i < count; i++) cur = moveToPrevWORD(lines, cur);
      break;

    case 'e':
      for (let i = 0; i < count; i++) cur = moveToWordEnd(lines, cur);
      break;

    case 'E':
      for (let i = 0; i < count; i++) cur = moveToWORDEnd(lines, cur);
      break;

    case '}':
      cur = moveToNextParagraph(lines, cur, count);
      break;

    case '{':
      cur = moveToPrevParagraph(lines, cur, count);
      break;

    default:
      matched = false;

  }

  if (!matched) {
    return null;
  }

  return clampCursor(lines, cur, 'NORMAL');
}
