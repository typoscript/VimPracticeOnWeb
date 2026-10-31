import { VimEditorState } from '../types/vim';
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
} from './visual';
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

  // 2. 연산자 및 카운트 조합: "d", "2d", "d2", "2d3", "c", "r", "y", "v", "g"
  const opMatch = pendingKeys.match(/^([1-9][0-9]*)?([a-zA-Z])([0-9]*)$/);
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
  isReplayingDot = false
): VimEditorState {
  if (state.mode === 'SEARCH') {
    return handleSearchModeKey(state, key);
  }

  if (state.mode === 'COMMAND') {
    return handleCommandLineModeKey(state, key);
  }

  if (state.mode === 'INSERT') {
    return handleInsertModeKey(state, key, isReplayingDot);
  }

  if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
    return handleVisualModeKey(state, key);
  }

  if (state.mode === 'NORMAL') {
    return handleNormalModeKey(state, key, isReplayingDot);
  }

  return state;
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
      };
    }

    const matches = findMatches(state.lines, query);
    // 현재 커서 위치 또는 그 다음 위치의 매치로 이동
    const targetMatch =
      findNextMatch(matches, { line: state.cursor.line, col: state.cursor.col - 1 }) ??
      matches[0];

    const nextCursor = targetMatch
      ? { line: targetMatch.line, col: targetMatch.col }
      : state.cursor;

    return {
      ...state,
      mode: 'NORMAL',
      cursor: nextCursor,
      lastSearchQuery: query,
      commandBuffer: undefined,
      commandType: undefined,
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
    return executeCommandLine(state, state.commandBuffer ?? '');
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

  // 텍스트 객체 선택 (i 대기 상태: iw, i", i(, i))
  if (state.pendingKeys === 'i') {
    if (key === 'w' || key === '"' || key === '(' || key === ')') {
      const objType: TextObjectType =
        key === 'w' ? 'iw' : key === '"' ? 'i"' : 'i(';
      return executeTextObjectOperator(state, 'v', objType);
    }
    return { ...state, pendingKeys: undefined };
  }

  if (key === 'i') {
    return {
      ...state,
      pendingKeys: 'i',
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

/**
 * NORMAL 모드 키 입력 처리
 */
function handleNormalModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false
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

  // 4. 텍스트 객체 대기 상태 (di, ci, yi, vi)
  const innerMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcyv])i$/);
  if (innerMatch) {
    const op = innerMatch[2] as 'd' | 'c' | 'y' | 'v';
    if (key === 'w' || key === '"' || key === '(' || key === ')') {
      const objType: TextObjectType =
        key === 'w' ? 'iw' : key === '"' ? 'i"' : 'i(';
      const res = executeTextObjectOperator(state, op, objType);

      if (op === 'c') {
        const cKeys = [op, 'i', key];
        return {
          ...res,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        };
      }
      if (op === 'd') {
        const lKeys = [op, 'i', key];
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        };
      }
      return res;
    }
    // w, ", (, ) 가 아니면 pendingKeys 취소 후 일반 키 평가
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
      if (op === 'c') {
        const cKeys = [op, motion, key];
        return {
          ...res,
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        };
      }
      if (op === 'd') {
        const lKeys = [op, motion, key];
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        };
      }
      return res;
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
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i') {
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
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'y') {
    if (key === 'f' || key === 'F' || key === 't' || key === 'T' || key === 'i') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'g') {
    if (key === 'g') {
      if (parsed.count1 !== undefined) {
        const targetLine = Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1));
        const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
        return {
          ...state,
          cursor: { line: targetLine, col: Math.min(state.cursor.col, maxCol) },
          pendingKeys: undefined,
        };
      }
      const nextCursor = moveToFirstLine(state.lines, state.cursor);
      return {
        ...state,
        cursor: clampCursor(state.lines, nextCursor, 'NORMAL'),
        pendingKeys: undefined,
      };
    }
    state = { ...state, pendingKeys: undefined };
  }

  // 9. 연산자 등록 (d, c, r, g, y, f, F, t, T)
  if (key === 'd' || key === 'c' || key === 'r' || key === 'g' || key === 'y') {
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
    };
  }

  // n: 다음 검색 결과로 점프
  if (key === 'n') {
    if (state.lastSearchQuery) {
      const matches = findMatches(state.lines, state.lastSearchQuery);
      const nextMatch = findNextMatch(matches, state.cursor);
      if (nextMatch) {
        return {
          ...state,
          cursor: { line: nextMatch.line, col: nextMatch.col },
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }

  // N: 이전 검색 결과로 점프
  if (key === 'N') {
    if (state.lastSearchQuery) {
      const matches = findMatches(state.lines, state.lastSearchQuery);
      const prevMatch = findPrevMatch(matches, state.cursor);
      if (prevMatch) {
        return {
          ...state,
          cursor: { line: prevMatch.line, col: prevMatch.col },
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }

  // *: 커서 아래 단어로 검색어 설정 후 다음 결과로 점프
  if (key === '*') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (word) {
      const matches = findMatches(state.lines, word);
      const nextMatch = findNextMatch(matches, state.cursor);
      return {
        ...state,
        cursor: nextMatch ? { line: nextMatch.line, col: nextMatch.col } : state.cursor,
        lastSearchQuery: word,
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
    if (parsed.count1 !== undefined) {
      const targetLine = Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1));
      const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
      return {
        ...state,
        cursor: { line: targetLine, col: Math.min(state.cursor.col, maxCol) },
        pendingKeys: undefined,
      };
    }
    const nextCursor = moveToLastLine(state.lines, state.cursor);
    return {
      ...state,
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
