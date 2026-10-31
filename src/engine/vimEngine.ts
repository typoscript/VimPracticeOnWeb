import { VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
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
 * VISUAL / VISUAL_LINE 모드 키 입력 처리
 */
function handleVisualModeKey(state: VimEditorState, key: string): VimEditorState {
  if (key === 'Escape') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      pendingKeys: undefined,
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

  // VISUAL 모드 내 커서 이동 (모션 평가)
  const motionResult = evaluateMotion(
    state.lines,
    state.cursor,
    key,
    state.pendingKeys
  );

  if (motionResult) {
    return {
      ...state,
      cursor: motionResult.cursor,
      pendingKeys: motionResult.pendingKeys,
    };
  }

  return state;
}

/**
 * 모션 키 평가 순수 헬퍼 (NORMAL 및 VISUAL 모드 공통 사용)
 */
function evaluateMotion(
  lines: string[],
  cursor: { line: number; col: number },
  key: string,
  pendingKeys?: string
): { cursor: { line: number; col: number }; pendingKeys?: string } | null {
  if (pendingKeys === 'g') {
    if (key === 'g') {
      const nextCursor = moveToFirstLine(lines, cursor);
      return {
        cursor: clampCursor(lines, nextCursor, 'NORMAL'),
        pendingKeys: undefined,
      };
    }
  }

  if (key === 'g') {
    return {
      cursor,
      pendingKeys: 'g',
    };
  }

  let nextCursor = { ...cursor };
  let matched = true;

  switch (key) {
    case 'h':
    case 'ArrowLeft':
      nextCursor = moveLeft(lines, cursor);
      break;

    case 'l':
    case 'ArrowRight':
      nextCursor = moveRight(lines, cursor);
      break;

    case 'j':
    case 'ArrowDown':
      nextCursor = moveDown(lines, cursor);
      break;

    case 'k':
    case 'ArrowUp':
      nextCursor = moveUp(lines, cursor);
      break;

    case '0':
      nextCursor = moveToLineStart(lines, cursor);
      break;

    case '$':
      nextCursor = moveToLineEnd(lines, cursor);
      break;

    case '^':
      nextCursor = moveToFirstNonBlank(lines, cursor);
      break;

    case 'G':
      nextCursor = moveToLastLine(lines, cursor);
      break;

    case 'w':
      nextCursor = moveToNextWord(lines, cursor);
      break;

    case 'b':
      nextCursor = moveToPrevWord(lines, cursor);
      break;

    case 'e':
      nextCursor = moveToWordEnd(lines, cursor);
      break;

    default:
      matched = false;
  }

  if (!matched) {
    return null;
  }

  return {
    cursor: clampCursor(lines, nextCursor, 'NORMAL'),
    pendingKeys: undefined,
  };
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
 * NORMAL 모드 키 입력 처리
 */
function handleNormalModeKey(state: VimEditorState, key: string): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';

  // 실행 취소 (Undo)
  if (key === 'u') {
    return undo(state);
  }

  // 다시 실행 (Redo)
  if (key === 'Ctrl-r' || key === 'ctrl+r') {
    return redo(state);
  }

  // 'p': 클립보드 붙여넣기
  if (key === 'p') {
    return putClipboard(state);
  }

  // 'i': 현재 위치에서 INSERT 모드 진입 (Undo 스냅샷 보관)
  if (key === 'i') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      pendingKeys: undefined,
    };
  }

  // 'a': 다음 칸에서 INSERT 모드 진입 (Undo 스냅샷 보관)
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

  // 'x': 현재 커서 위치의 문자 1개 삭제
  if (key === 'x') {
    if (currentLine.length === 0) {
      return {
        ...state,
        pendingKeys: undefined,
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    const { line, col } = state.cursor;
    const deletedChar = currentLine[col] ?? '';
    const newLine = currentLine.slice(0, col) + currentLine.slice(col + 1);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;

    const clampedCursor = clampCursor(nextLines, state.cursor, 'NORMAL');
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampedCursor,
      clipboard: {
        type: 'text',
        content: deletedChar,
      },
      pendingKeys: undefined,
    };
  }

  // dd / dw 연산자 처리
  if (state.pendingKeys === 'd') {
    if (key === 'd') {
      return deleteLine(state);
    }
    if (key === 'w') {
      return deleteWord(state);
    }
    // 다른 키가 오면 pendingKeys를 취소하고 아래에서 일반 모션 평가
  }

  // 'd' 첫 입력 시 대기
  if (key === 'd') {
    return {
      ...state,
      pendingKeys: 'd',
    };
  }

  // 'v': 문자 단위 VISUAL 모드 진입
  if (key === 'v') {
    return {
      ...state,
      mode: 'VISUAL',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // 'V': 행 단위 VISUAL_LINE 모드 진입
  if (key === 'V') {
    return {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { ...state.cursor },
      pendingKeys: undefined,
    };
  }

  // 모션 평가
  const motionResult = evaluateMotion(
    state.lines,
    state.cursor,
    key,
    state.pendingKeys
  );

  if (motionResult) {
    return {
      ...state,
      cursor: motionResult.cursor,
      pendingKeys: motionResult.pendingKeys,
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}
