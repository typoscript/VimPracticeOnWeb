import { CursorPosition, VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';

/**
 * 현재 줄에서 지정한 문자를 오른쪽 방향으로 count번째 찾은 열(col) 인덱스를 반환합니다.
 */
export function findCharForward(
  line: string,
  startCol: number,
  targetChar: string,
  count = 1
): number | null {
  let remaining = count;
  for (let i = startCol + 1; i < line.length; i++) {
    if (line[i] === targetChar) {
      remaining -= 1;
      if (remaining === 0) {
        return i;
      }
    }
  }
  return null;
}

/**
 * 현재 줄에서 지정한 문자를 왼쪽 방향으로 count번째 찾은 열(col) 인덱스를 반환합니다.
 */
export function findCharBackward(
  line: string,
  startCol: number,
  targetChar: string,
  count = 1
): number | null {
  let remaining = count;
  for (let i = startCol - 1; i >= 0; i--) {
    if (line[i] === targetChar) {
      remaining -= 1;
      if (remaining === 0) {
        return i;
      }
    }
  }
  return null;
}

/**
 * 'f', 'F', 't', 'T' 모션에 따른 새 커서 위치를 계산합니다.
 */
export function moveFind(
  lines: string[],
  cursor: CursorPosition,
  motion: 'f' | 'F' | 't' | 'T',
  targetChar: string,
  count = 1
): CursorPosition | null {
  const lineText = lines[cursor.line] ?? '';
  if (lineText.length === 0) return null;

  if (motion === 'f') {
    const idx = findCharForward(lineText, cursor.col, targetChar, count);
    return idx !== null ? { line: cursor.line, col: idx } : null;
  }

  if (motion === 't') {
    const idx = findCharForward(lineText, cursor.col, targetChar, count);
    return idx !== null ? { line: cursor.line, col: Math.max(0, idx - 1) } : null;
  }

  if (motion === 'F') {
    const idx = findCharBackward(lineText, cursor.col, targetChar, count);
    return idx !== null ? { line: cursor.line, col: idx } : null;
  }

  if (motion === 'T') {
    const idx = findCharBackward(lineText, cursor.col, targetChar, count);
    return idx !== null ? { line: cursor.line, col: Math.min(lineText.length - 1, idx + 1) } : null;
  }

  return null;
}

/**
 * 'd', 'c', 'y' 연산자와 'f', 'F', 't', 'T' 모션의 결합 연산을 수행합니다.
 * (예: df), ct", yf,)
 */
export function executeFindOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y',
  motion: 'f' | 'F' | 't' | 'T',
  targetChar: string,
  count = 1
): VimEditorState {
  const lineText = state.lines[state.cursor.line] ?? '';
  const fromCol = state.cursor.col;

  let minCol: number;
  let maxCol: number;

  if (motion === 'f') {
    const targetIdx = findCharForward(lineText, fromCol, targetChar, count);
    if (targetIdx === null) return { ...state, pendingKeys: undefined };
    minCol = fromCol;
    maxCol = targetIdx;
  } else if (motion === 't') {
    const targetIdx = findCharForward(lineText, fromCol, targetChar, count);
    if (targetIdx === null) return { ...state, pendingKeys: undefined };
    const toCol = targetIdx - 1;
    if (toCol < fromCol) return { ...state, pendingKeys: undefined };
    minCol = fromCol;
    maxCol = toCol;
  } else if (motion === 'F') {
    const targetIdx = findCharBackward(lineText, fromCol, targetChar, count);
    if (targetIdx === null) return { ...state, pendingKeys: undefined };
    minCol = targetIdx;
    maxCol = fromCol;
  } else if (motion === 'T') {
    const targetIdx = findCharBackward(lineText, fromCol, targetChar, count);
    if (targetIdx === null) return { ...state, pendingKeys: undefined };
    const toCol = targetIdx + 1;
    if (toCol > fromCol) return { ...state, pendingKeys: undefined };
    minCol = toCol;
    maxCol = fromCol;
  } else {
    return { ...state, pendingKeys: undefined };
  }

  const deletedText = lineText.slice(minCol, maxCol + 1);

  // 복사 (y) 연산
  if (operator === 'y') {
    return {
      ...state,
      clipboard: {
        type: 'text',
        content: deletedText,
      },
      pendingKeys: undefined,
    };
  }

  // 삭제(d) 또는 수정(c) 연산
  const stateWithSnapshot = pushUndoSnapshot(state);
  const newLine = lineText.slice(0, minCol) + lineText.slice(maxCol + 1);
  const nextLines = [...state.lines];
  nextLines[state.cursor.line] = newLine;

  if (operator === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: state.cursor.line, col: minCol },
      mode: 'INSERT',
      clipboard: {
        type: 'text',
        content: deletedText,
      },
      pendingKeys: undefined,
    };
  }

  // operator === 'd'
  const clampedCursor = clampCursor(
    nextLines,
    { line: state.cursor.line, col: minCol },
    'NORMAL'
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    clipboard: {
      type: 'text',
      content: deletedText,
    },
    pendingKeys: undefined,
  };
}
