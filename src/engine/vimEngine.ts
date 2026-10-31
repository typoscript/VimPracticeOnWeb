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

/**
 * Vim 키 입력 처리 순수 함수: (state, key) => newState
 */
export function handleKey(state: VimEditorState, key: string): VimEditorState {
  if (state.mode === 'INSERT') {
    return handleInsertModeKey(state, key);
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
 * NORMAL 모드 키 입력 처리
 */
function handleNormalModeKey(state: VimEditorState, key: string): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';

  // 'i': 현재 위치에서 INSERT 모드 진입
  if (key === 'i') {
    return {
      ...state,
      mode: 'INSERT',
      pendingKeys: undefined,
    };
  }

  // 'a': 다음 칸에서 INSERT 모드 진입
  if (key === 'a') {
    const newCol = currentLine.length === 0 ? 0 : Math.min(state.cursor.col + 1, currentLine.length);
    return {
      ...state,
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

    const { line, col } = state.cursor;
    const newLine = currentLine.slice(0, col) + currentLine.slice(col + 1);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;

    const clampedCursor = clampCursor(nextLines, state.cursor, 'NORMAL');
    return {
      ...state,
      lines: nextLines,
      cursor: clampedCursor,
      pendingKeys: undefined,
    };
  }

  // gg 시퀀스 처리
  if (state.pendingKeys === 'g') {
    if (key === 'g') {
      const nextCursor = moveToFirstLine(state.lines, state.cursor);
      return {
        ...state,
        cursor: clampCursor(state.lines, nextCursor, 'NORMAL'),
        pendingKeys: undefined,
      };
    }
    // 'g' 다음에 다른 키가 오면 pendingKeys를 취소하고 아래에서 해당 키를 정상 평가
  }

  // 'g' 첫 입력 시 대기
  if (key === 'g') {
    return {
      ...state,
      pendingKeys: 'g',
    };
  }

  let nextCursor = { ...state.cursor };

  switch (key) {
    case 'h':
    case 'ArrowLeft':
      nextCursor = moveLeft(state.lines, state.cursor);
      break;

    case 'l':
    case 'ArrowRight':
      nextCursor = moveRight(state.lines, state.cursor);
      break;

    case 'j':
    case 'ArrowDown':
      nextCursor = moveDown(state.lines, state.cursor);
      break;

    case 'k':
    case 'ArrowUp':
      nextCursor = moveUp(state.lines, state.cursor);
      break;

    case '0':
      nextCursor = moveToLineStart(state.lines, state.cursor);
      break;

    case '$':
      nextCursor = moveToLineEnd(state.lines, state.cursor);
      break;

    case '^':
      nextCursor = moveToFirstNonBlank(state.lines, state.cursor);
      break;

    case 'G':
      nextCursor = moveToLastLine(state.lines, state.cursor);
      break;

    case 'w':
      nextCursor = moveToNextWord(state.lines, state.cursor);
      break;

    case 'b':
      nextCursor = moveToPrevWord(state.lines, state.cursor);
      break;

    case 'e':
      nextCursor = moveToWordEnd(state.lines, state.cursor);
      break;

    default:
      // 지원하지 않는 키는 상태를 유지
      return {
        ...state,
        pendingKeys: undefined,
      };
  }

  return {
    ...state,
    cursor: clampCursor(state.lines, nextCursor, 'NORMAL'),
    pendingKeys: undefined,
  };
}
