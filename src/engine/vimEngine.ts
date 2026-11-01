import { VimEditorState, CursorPosition } from '../types/vim';
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
} from './motions';
import {
  deleteLine,
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
  putClipboard,
  undo,
  redo,
  pushUndoSnapshot,
} from './operators';
import {
  deleteVisualSelection,
  yankVisualSelection,
  startVisualBlockInsert,
} from './visual';
import { findMatchingBracket } from './bracketMatch';
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
} from './search';
import { executeCommandLine } from './commandLine';
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
  formatIndentLines,
  formatIndentVisual,
} from './lineOperators';

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
export function handleKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  macroDepth = 0
): VimEditorState {
  // 매크로 기록 중인 상태 처리
  if (state.recordingMacro) {
    // NORMAL 모드에서 대기 키 없이 'q'를 누르면 매크로 기록 종료
    if (state.mode === 'NORMAL' && !state.pendingKeys && key === 'q') {
      const reg = state.recordingMacro.register;
      const recordedKeys = [...state.recordingMacro.keys];
      const newRegisters = {
        ...(state.registers ?? {}),
        [reg]: {
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
    nextState = handleSearchModeKey(state, key);
  } else if (state.mode === 'COMMAND') {
    nextState = handleCommandLineModeKey(state, key);
  } else if (state.mode === 'INSERT') {
    nextState = handleInsertModeKey(state, key, isReplayingDot);
  } else if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
    nextState = handleVisualModeKey(state, key);
  } else if (state.mode === 'NORMAL') {
    nextState = handleNormalModeKey(state, key, isReplayingDot, macroDepth);
  } else {
    nextState = state;
  }

  // 커서 이동 시 화면 뷰포트 자동 동기화 (커서가 화면을 벗어나지 않도록 보정)
  if (nextState.cursor && nextState.lines) {
    const vp = adjustViewport(getViewport(nextState), nextState.cursor.line, nextState.lines.length);
    if (!nextState.viewport || nextState.viewport.topRow !== vp.topRow || nextState.viewport.visibleRows !== vp.visibleRows) {
      return {
        ...nextState,
        viewport: vp,
      };
    }
  }

  return nextState;
}

/**
 * SEARCH 모드(/) 키 입력 처리
 */
function handleSearchModeKey(state: VimEditorState, key: string): VimEditorState {
  if (key === 'Escape') {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (key === 'Backspace') {
    if (state.commandBuffer && state.commandBuffer.length > 0) {
      return {
        ...state,
        commandBuffer: state.commandBuffer.slice(0, -1),
      };
    }
    // 글자가 없는 상태에서 백스페이스 누르면 검색 취소
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (key === 'Enter') {
    const query = state.commandBuffer ?? '';
    if (query.length === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: undefined,
      };
    }

    const matches = findMatches(state.lines, query);
    if (matches.length === 0) {
      return {
        ...state,
        mode: 'NORMAL',
        lastSearchQuery: query,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: `E486: 패턴을 찾을 수 없습니다: ${query}`,
      };
    }

    // 현재 커서 위치 또는 그 다음 위치의 매치로 이동
    const targetMatch =
      findNextMatch(matches, { line: state.cursor.line, col: state.cursor.col - 1 }) ??
      matches[0];

    const matchIdx = matches.findIndex(
      (m) => m.line === targetMatch.line && m.col === targetMatch.col
    );

    const stateWithJump = recordJump(state);

    return {
      ...stateWithJump,
      mode: 'NORMAL',
      cursor: { line: targetMatch.line, col: targetMatch.col },
      lastSearchQuery: query,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `검색 일치 (${matchIdx + 1}/${matches.length}): ${query}`,
    };
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
 * COMMAND 모드(:) 키 입력 처리
 */
function handleCommandLineModeKey(state: VimEditorState, key: string): VimEditorState {
  if (key === 'Escape') {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (key === 'Backspace') {
    if (state.commandBuffer && state.commandBuffer.length > 0) {
      return {
        ...state,
        commandBuffer: state.commandBuffer.slice(0, -1),
      };
    }
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (key === 'Enter') {
    return executeCommandLine(state, state.commandBuffer ?? '', handleKey);
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
 * INSERT 모드 키 입력 처리
 */
function handleInsertModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

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

      return {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line: firstLineIdx, col: nextCol }, 'NORMAL'),
        blockInsertSession: null,
        pendingKeys: undefined,
        currentChangeKeys: undefined,
      };
    }

    const nextCol = Math.max(0, col - 1);

    let nextLastChange = state.lastChangeKeys;
    if (!isReplayingDot && state.currentChangeKeys) {
      nextLastChange = [...state.currentChangeKeys, 'Escape'];
    }

    return {
      ...state,
      mode: 'NORMAL',
      cursor: clampCursor(state.lines, { line, col: nextCol }, 'NORMAL'),
      pendingKeys: undefined,
      lastChangeKeys: nextLastChange,
      currentChangeKeys: undefined,
    };
  }

  // 키 입력 기록 (Dot Repeat 용)
  const appendCurrentChange = (k: string) => {
    if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
    return [...state.currentChangeKeys, k];
  };

  // Backspace: 이전 문자 삭제 또는 윗줄과 병합
  if (key === 'Backspace') {
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
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
      currentChangeKeys: nextChangeKeys,
    };
  }

  return state;
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
    };
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

  // 'v': VISUAL 모드 토글 또는 전환
  if (key === 'v') {
    if (state.mode === 'VISUAL') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
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
    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B'];
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

  // 선택 영역 삭제 (d / x)
  if (key === 'd' || key === 'x') {
    return deleteVisualSelection(state);
  }

  // 선택 영역 복사 (y)
  if (key === 'y') {
    return yankVisualSelection(state);
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
    parsed.totalCount
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

  // 1. ESC: 대기 중인 모든 키 시퀀스 취소
  if (key === 'Escape') {
    return {
      ...state,
      pendingKeys: undefined,
    };
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
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, '%'],
        };
      }
      if (op === 'c') {
        const res = deleteVisualSelection(stateWithAnchor);
        return {
          ...res,
          mode: 'INSERT',
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, '%'],
        };
      }
      if (op === 'y') {
        return yankVisualSelection(stateWithAnchor);
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
      if (op === 'c') {
        return {
          ...res,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, key],
        };
      }
      if (op === 'd') {
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, key],
        };
      }
      return res;
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

  // zz, zt, zb: 뷰포트 정렬
  if (state.pendingKeys === 'z' || parsed.operator === 'z') {
    if (key === 'z') return scrollToCenter(state);
    if (key === 't') return scrollToTop(state);
    if (key === 'b') return scrollToBottom(state);
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
      if (op === 'c') {
        return {
          ...res,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, quote, key],
        };
      }
      if (op === 'd') {
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, quote, key],
        };
      }
      return res;
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
  if (parsed.operator === '=') {
    if (key === '=') {
      const res = formatIndentLines(state, parsed.totalCount);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '=', '='] : ['=', '='];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
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

  // 1-1. 매크로 녹화 시작 대기 (q)
  if (state.pendingKeys === 'q' || parsed.operator === 'q') {
    if (/^[a-z0-9]$/.test(key)) {
      return {
        ...state,
        pendingKeys: undefined,
        recordingMacro: {
          register: key,
          keys: [],
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
    } else if (/^[a-z0-9]$/.test(key)) {
      targetReg = key;
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

  // 4. 텍스트 객체 대기 상태 (di, da, ci, ca, yi, ya, vi, va 및 카운트 조합)
  const textObjPendingMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv])([ia])$/);
  if (textObjPendingMatch) {
    const count = textObjPendingMatch[1] ? parseInt(textObjPendingMatch[1], 10) : 1;
    const op = textObjPendingMatch[2] as 'd' | 'c' | 'y' | 'v';
    const modifier = textObjPendingMatch[3] as 'i' | 'a';

    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';

      const objType: TextObjectType = `${modifier}${targetChar}` as TextObjectType;
      const res = executeTextObjectOperator(state, op, objType, count);

      const opKeys = count > 1 ? [String(count), op, modifier, key] : [op, modifier, key];
      if (op === 'c') {
        return {
          ...res,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
        };
      }
      if (op === 'd') {
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
        };
      }
      return res;
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
      if (op === 'c') {
        const cKeys = [op, motion, key];
        return {
          ...resWithSearch,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        };
      }
      if (op === 'd') {
        const lKeys = [op, motion, key];
        return {
          ...resWithSearch,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        };
      }
      return resWithSearch;
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

  // 8. 연산자 대기 처리 (d, c, y, g, v)
  if (parsed.operator === 'd') {
    if (key === 'd') {
      const res = deleteLine(state, parsed.totalCount);
      const lKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'd', 'd']
          : ['d', 'd'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'w') {
      const res = deleteWord(state, parsed.totalCount);
      const lKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'd', 'w']
          : ['d', 'w'];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      };
    }
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    // d 뒤에 유효하지 않은 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'c') {
    if (key === 'c') {
      const res = changeLine(state, parsed.totalCount);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', 'c']
          : ['c', 'c'];
      return {
        ...res,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === 'w') {
      const res = changeWord(state, parsed.totalCount);
      const cKeys =
        parsed.totalCount > 1
          ? [String(parsed.totalCount), 'c', 'w']
          : ['c', 'w'];
      return {
        ...res,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'y') {
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i' || key === 'a' || key === "'" || key === '`') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
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
      const matches = findMatches(state.lines, state.lastSearchQuery);
      if (matches.length === 0) {
        return {
          ...state,
          commandMessage: `E486: 패턴을 찾을 수 없습니다: ${state.lastSearchQuery}`,
          pendingKeys: undefined,
        };
      }
      const nextMatch = findNextMatch(matches, state.cursor) ?? matches[0];
      const matchIdx = matches.findIndex((m) => m.line === nextMatch.line && m.col === nextMatch.col);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: { line: nextMatch.line, col: nextMatch.col },
        commandMessage: `다음 검색 결과 (${matchIdx + 1}/${matches.length}): ${state.lastSearchQuery}`,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // N: 이전 검색 결과로 점프
  if (key === 'N') {
    if (state.lastSearchQuery) {
      const matches = findMatches(state.lines, state.lastSearchQuery);
      if (matches.length === 0) {
        return {
          ...state,
          commandMessage: `E486: 패턴을 찾을 수 없습니다: ${state.lastSearchQuery}`,
          pendingKeys: undefined,
        };
      }
      const prevMatch = findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      const matchIdx = matches.findIndex((m) => m.line === prevMatch.line && m.col === prevMatch.col);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: { line: prevMatch.line, col: prevMatch.col },
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
      const matches = findMatches(state.lines, word);
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

  // 실행 취소 (Undo)
  if (key === 'u') {
    return undo(state);
  }

  // 다시 실행 (Redo)
  if (key === 'Ctrl-r' || key === 'ctrl+r') {
    return redo(state);
  }

  // p: 클립보드 붙여넣기
  if (key === 'p') {
    const res = putClipboard(state);
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['p'],
    };
  }

  // C: 커서부터 줄 끝까지 수정 후 INSERT
  if (key === 'C') {
    const res = changeToEndOfLine(state);
    return {
      ...res,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['C'],
    };
  }

  // x: 현재 문자 삭제 ([count]x)
  if (key === 'x') {
    const res = deleteChar(state, parsed.totalCount);
    const lKeys =
      parsed.totalCount > 1
        ? [String(parsed.totalCount), 'x']
        : ['x'];
    return {
      ...res,
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

  // 11. 이동 모션 키 평가 (카운트 반복 반영)
  const motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount
  );

  if (motionCursor) {
    return {
      ...state,
      cursor: motionCursor,
      pendingKeys: undefined,
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}

/**
 * 카운트 배수를 적용하여 단일 모션을 여러 번 반복 평가합니다.
 */
function evaluateMotionWithCount(
  lines: string[],
  cursor: { line: number; col: number },
  key: string,
  count = 1
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
      for (let i = 0; i < count; i++) cur = moveDown(lines, cur);
      break;

    case 'k':
    case 'ArrowUp':
      for (let i = 0; i < count; i++) cur = moveUp(lines, cur);
      break;

    case '0':
      cur = moveToLineStart(lines, cur);
      break;

    case '$':
      cur = moveToLineEnd(lines, cur);
      break;

    case '^':
      cur = moveToFirstNonBlank(lines, cur);
      break;

    case 'w':
      for (let i = 0; i < count; i++) cur = moveToNextWord(lines, cur);
      break;

    case 'b':
      for (let i = 0; i < count; i++) cur = moveToPrevWord(lines, cur);
      break;

    case 'e':
      for (let i = 0; i < count; i++) cur = moveToWordEnd(lines, cur);
      break;

    default:
      matched = false;
  }

  if (!matched) {
    return null;
  }

  return clampCursor(lines, cur, 'NORMAL');
}
