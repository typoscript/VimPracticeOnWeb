import { CursorPosition, VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';

export type TextObjectType = 'iw' | 'i"' | 'i(' | 'i)';

export interface TextObjectRange {
  startCol: number;
  endCol: number;
  isEmpty?: boolean;
}

type CharClass = 'word' | 'space' | 'punct';

function getCharClass(ch: string | undefined): CharClass {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/\w/.test(ch)) return 'word';
  return 'punct';
}

/**
 * 주어진 텍스트 객체 타입에 따라 현재 커서 위치의 inner 범위를 구합니다.
 */
export function getTextObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: TextObjectType
): TextObjectRange | null {
  const lineText = lines[cursor.line] ?? '';
  if (lineText.length === 0) {
    return null;
  }

  const col = Math.min(cursor.col, lineText.length - 1);

  // 1. iw: 단어 내부 (Inner Word)
  if (objectType === 'iw') {
    const targetClass = getCharClass(lineText[col]);

    let startCol = col;
    while (startCol > 0 && getCharClass(lineText[startCol - 1]) === targetClass) {
      startCol--;
    }

    let endCol = col;
    while (endCol < lineText.length - 1 && getCharClass(lineText[endCol + 1]) === targetClass) {
      endCol++;
    }

    return { startCol, endCol };
  }

  // 2. i": 큰따옴표 내부 (Inner Double Quotes)
  if (objectType === 'i"') {
    const quoteIndices: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] === '"') {
        quoteIndices.push(i);
      }
    }

    if (quoteIndices.length < 2) {
      return null;
    }

    // 인접한 두 따옴표 쌍 구성: [0, 1], [2, 3], ...
    const pairs: { start: number; end: number }[] = [];
    for (let i = 0; i < quoteIndices.length - 1; i += 2) {
      pairs.push({ start: quoteIndices[i], end: quoteIndices[i + 1] });
    }

    // 커서를 포함하는 따옴표 쌍 찾기
    let targetPair = pairs.find((p) => p.start <= col && col <= p.end);

    // 커서를 포함하는 쌍이 없다면, 커서 이후에 처음 나타나는 따옴표 쌍 탐색
    if (!targetPair) {
      targetPair = pairs.find((p) => p.start >= col);
    }

    if (!targetPair) {
      return null;
    }

    // 빈 큰따옴표 ("") 처리
    if (targetPair.start + 1 === targetPair.end) {
      return {
        startCol: targetPair.start + 1,
        endCol: targetPair.start,
        isEmpty: true,
      };
    }

    return {
      startCol: targetPair.start + 1,
      endCol: targetPair.end - 1,
    };
  }

  // 3. i( / i): 소괄호 내부 (Inner Parentheses)
  if (objectType === 'i(' || objectType === 'i)') {
    const pairs: { open: number; close: number }[] = [];
    const stack: number[] = [];

    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] === '(') {
        stack.push(i);
      } else if (lineText[i] === ')') {
        if (stack.length > 0) {
          pairs.push({ open: stack.pop()!, close: i });
        }
      }
    }

    if (pairs.length === 0) {
      return null;
    }

    // 커서를 둘러싸고 있는 쌍들 중 가장 안쪽(범위가 가장 작은) 쌍 찾기
    const enclosing = pairs
      .filter((p) => p.open <= col && col <= p.close)
      .sort((a, b) => a.close - a.open - (b.close - b.open));

    let target = enclosing[0];

    // 커서를 감싸는 쌍이 없으면, 커서 뒤에 있는 첫 번째 괄호 쌍 선택
    if (!target) {
      const upcoming = pairs
        .filter((p) => p.open >= col)
        .sort((a, b) => a.open - b.open);
      target = upcoming[0];
    }

    if (!target) {
      return null;
    }

    // 빈 소괄호 (()) 처리
    if (target.open + 1 === target.close) {
      return {
        startCol: target.open + 1,
        endCol: target.open,
        isEmpty: true,
      };
    }

    return {
      startCol: target.open + 1,
      endCol: target.close - 1,
    };
  }

  return null;
}

/**
 * 텍스트 객체와 연산자(d, c, y, v)를 조합하여 실행합니다.
 */
export function executeTextObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v',
  objectType: TextObjectType
): VimEditorState {
  const range = getTextObjectRange(state.lines, state.cursor, objectType);
  if (!range) {
    return { ...state, pendingKeys: undefined };
  }

  const lineText = state.lines[state.cursor.line] ?? '';

  // VISUAL 모드 영역 지정 (v)
  if (operator === 'v') {
    return {
      ...state,
      mode: 'VISUAL',
      visualAnchor: { line: state.cursor.line, col: range.startCol },
      cursor: {
        line: state.cursor.line,
        col: Math.max(range.startCol, range.endCol),
      },
      pendingKeys: undefined,
    };
  }

  const content = range.isEmpty
    ? ''
    : lineText.slice(range.startCol, range.endCol + 1);

  // 복사 (y)
  if (operator === 'y') {
    return {
      ...state,
      clipboard: {
        type: 'text',
        content,
      },
      pendingKeys: undefined,
    };
  }

  // 삭제(d) 또는 수정(c)
  const stateWithSnapshot = pushUndoSnapshot(state);

  let newLine: string;
  if (range.isEmpty) {
    newLine = lineText;
  } else {
    newLine = lineText.slice(0, range.startCol) + lineText.slice(range.endCol + 1);
  }

  const nextLines = [...state.lines];
  nextLines[state.cursor.line] = newLine;

  if (operator === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: state.cursor.line, col: range.startCol },
      mode: 'INSERT',
      clipboard: {
        type: 'text',
        content,
      },
      pendingKeys: undefined,
    };
  }

  // operator === 'd'
  const clampedCursor = clampCursor(
    nextLines,
    { line: state.cursor.line, col: range.startCol },
    'NORMAL'
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    clipboard: {
      type: 'text',
      content,
    },
    pendingKeys: undefined,
  };
}
