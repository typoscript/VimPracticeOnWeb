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

  // 2. 연산자 및 카운트 조합: "d", "2d", "d2", "2d3", "c", "2cw", "r", "3r"
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
export function handleKey(state: VimEditorState, key: string): VimEditorState {
  if (state.mode === 'INSERT') {
    return handleInsertModeKey(state, key);
  }

  if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE') {
    return handleVisualModeKey(state, key);
  }

  if (state.mode === 'NORMAL') {
    return handleNormalModeKey(state, key);
  }

  return state;
}

/**
 * INSERT 모드 키 입력 처리
 */
function handleInsertModeKey(state: VimEditorState, key: string): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // ESC: NORMAL 모드로 복귀 (커서 1칸 좌측 보정)
  if (key === 'Escape') {
    const nextCol = Math.max(0, col - 1);
    return {
      ...state,
      mode: 'NORMAL',
      cursor: clampCursor(state.lines, { line, col: nextCol }, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // Backspace: 이전 문자 삭제 또는 윗줄과 병합
  if (key === 'Backspace') {
    if (col > 0) {
      const newLine = currentLine.slice(0, col - 1) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col - 1 },
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
      };
    }

    return state;
  }

  // Enter: 줄 분할 및 다음 줄 맨 앞으로 이동
  if (key === 'Enter') {
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
    };
  }

  // Tab: 공백 2칸 삽입
  if (key === 'Tab') {
    const spaces = '  ';
    const newLine = currentLine.slice(0, col) + spaces + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + spaces.length },
    };
  }

  // INSERT 모드 방향키 이동
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
    const newLine = currentLine.slice(0, col) + key + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
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
function handleNormalModeKey(state: VimEditorState, key: string): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const parsed = parsePending(state.pendingKeys);

  // 1. ESC: 대기 중인 모든 키 시퀀스 취소
  if (key === 'Escape') {
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 2. 'r' (단일 문자 교체) 대기 상태
  if (parsed.operator === 'r') {
    if (key.length === 1) {
      return replaceChar(state, key, parsed.totalCount);
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 3. 숫자 입력 처리 ('0' ~ '9')
  if (key === '0') {
    // pendingKeys의 끝 글자가 숫자인 경우(예: '1' -> '10', 'd2' -> 'd20')
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

  // 4. 연산자 대기 처리 (d, c, g)
  if (parsed.operator === 'd') {
    if (key === 'd') {
      return deleteLine(state, parsed.totalCount);
    }
    if (key === 'w') {
      return deleteWord(state, parsed.totalCount);
    }
    // d 뒤에 유효하지 않은 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'c') {
    if (key === 'c') {
      return changeLine(state, parsed.totalCount);
    }
    if (key === 'w') {
      return changeWord(state, parsed.totalCount);
    }
    // c 뒤에 유효하지 않은 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
    state = { ...state, pendingKeys: undefined };
  } else if (parsed.operator === 'g') {
    if (key === 'g') {
      if (parsed.count1 !== undefined) {
        // [count]gg: count번째 줄(1-indexed)로 이동
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
    // g 뒤에 g가 아닌 다른 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
    state = { ...state, pendingKeys: undefined };
  }

  // 5. 연산자 등록 (d, c, r, g)
  if (key === 'd') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'd',
    };
  }

  if (key === 'c') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'c',
    };
  }

  if (key === 'r') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'r',
    };
  }

  if (key === 'g') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'g',
    };
  }

  // 6. 단일 키 명령 및 모드 진입
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
    return putClipboard(state);
  }

  // C: 커서부터 줄 끝까지 수정 후 INSERT
  if (key === 'C') {
    return changeToEndOfLine(state);
  }

  // x: 현재 문자 삭제 ([count]x)
  if (key === 'x') {
    return deleteChar(state, parsed.totalCount);
  }

  // I: 첫 비공백 문자로 이동 후 INSERT
  if (key === 'I') {
    return insertAtFirstNonBlank(state);
  }

  // A: 줄 끝 다음 칸으로 이동 후 INSERT
  if (key === 'A') {
    return appendAtLineEnd(state);
  }

  // o: 아래 줄 생성 후 INSERT
  if (key === 'o') {
    return openLineBelow(state);
  }

  // O: 위 줄 생성 후 INSERT
  if (key === 'O') {
    return openLineAbove(state);
  }

  // i: 현재 위치에서 INSERT
  if (key === 'i') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      pendingKeys: undefined,
    };
  }

  // a: 다음 칸에서 INSERT
  if (key === 'a') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    const newCol = currentLine.length === 0 ? 0 : Math.min(state.cursor.col + 1, currentLine.length);
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      cursor: { line: state.cursor.line, col: newCol },
      pendingKeys: undefined,
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

  // 7. 이동 모션 키 평가 (카운트 반복 반영)
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
