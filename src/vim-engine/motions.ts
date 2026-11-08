import { CursorPosition } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import {
  findNextWord,
  findPrevWord,
  findWordEnd,
  findNextWORD,
  findPrevWORD,
  findWORDEnd,
} from './wordMotion';

/**
 * 'h': 왼쪽으로 1칸 이동
 */
export function moveLeft(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  return {
    line: clamped.line,
    col: Math.max(0, clamped.col - 1),
  };
}

/**
 * 'l': 오른쪽으로 1칸 이동 (줄 끝을 넘지 않음)
 */
export function moveRight(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const maxCol = getMaxCol(lines[clamped.line]);
  return {
    line: clamped.line,
    col: Math.min(maxCol, clamped.col + 1),
  };
}

/**
 * 'j': 아래로 1줄 이동 (해당 줄의 maxCol로 클램프)
 */
export function moveDown(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const targetLine = Math.min(lines.length - 1, clamped.line + 1);
  const maxCol = getMaxCol(lines[targetLine]);
  return {
    line: targetLine,
    col: Math.min(clamped.col, maxCol),
  };
}

/**
 * 'k': 위로 1줄 이동 (해당 줄의 maxCol로 클램프)
 */
export function moveUp(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const targetLine = Math.max(0, clamped.line - 1);
  const maxCol = getMaxCol(lines[targetLine]);
  return {
    line: targetLine,
    col: Math.min(clamped.col, maxCol),
  };
}

/**
 * '0': 현재 줄의 맨 앞(0번 열)으로 이동
 */
export function moveToLineStart(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  return {
    line: clamped.line,
    col: 0,
  };
}

/**
 * '$': 현재 줄의 맨 끝 문자(열)로 이동
 */
export function moveToLineEnd(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  return {
    line: clamped.line,
    col: getMaxCol(lines[clamped.line]),
  };
}

/**
 * '^': 현재 줄의 첫 번째 공백이 아닌 문자로 이동
 */
export function moveToFirstNonBlank(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const nonBlankCol = getFirstNonBlankCol(lines[clamped.line]);
  return {
    line: clamped.line,
    col: nonBlankCol,
  };
}

/**
 * 'gg': 버퍼의 첫 번째 줄로 이동
 */
export function moveToFirstLine(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const firstLineText = lines[0] ?? '';
  return {
    line: 0,
    col: Math.min(clamped.col, getMaxCol(firstLineText)),
  };
}

/**
 * 'G': 버퍼의 마지막 줄로 이동
 */
export function moveToLastLine(lines: string[], cursor: CursorPosition): CursorPosition {
  const clamped = clampCursor(lines, cursor);
  const lastLine = Math.max(0, lines.length - 1);
  const lastLineText = lines[lastLine] ?? '';
  return {
    line: lastLine,
    col: Math.min(clamped.col, getMaxCol(lastLineText)),
  };
}

/**
 * 'w': 다음 단어 시작
 */
export function moveToNextWord(lines: string[], cursor: CursorPosition): CursorPosition {
  return findNextWord(lines, cursor);
}

/**
 * 'b': 이전 단어 시작
 */
export function moveToPrevWord(lines: string[], cursor: CursorPosition): CursorPosition {
  return findPrevWord(lines, cursor);
}

/**
 * 'e': 단어 끝
 */
export function moveToWordEnd(lines: string[], cursor: CursorPosition): CursorPosition {
  return findWordEnd(lines, cursor);
}

/**
 * 'W': 다음 WORD 시작 (공백 기준으로만 분리)
 */
export function moveToNextWORD(lines: string[], cursor: CursorPosition): CursorPosition {
  return findNextWORD(lines, cursor);
}

/**
 * 'B': 이전 WORD 시작 (공백 기준으로만 분리)
 */
export function moveToPrevWORD(lines: string[], cursor: CursorPosition): CursorPosition {
  return findPrevWORD(lines, cursor);
}

/**
 * 'E': WORD 끝 (공백 기준으로만 분리)
 */
export function moveToWORDEnd(lines: string[], cursor: CursorPosition): CursorPosition {
  return findWORDEnd(lines, cursor);
}
