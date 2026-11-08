import { CursorPosition, VimMode } from './types';

/**
 * 줄의 최대 허용 열 인덱스를 반환합니다.
 * NORMAL 모드에서는 마지막 문자(length - 1)를 넘을 수 없으며,
 * INSERT 모드에서는 새 문자를 추가할 수 있도록 줄 길이(length)까지 허용합니다.
 * 빈 줄인 경우 0을 반환합니다.
 */
export function getMaxCol(lineText: string | undefined, mode: VimMode = 'NORMAL'): number {
  if (!lineText || lineText.length === 0) {
    return 0;
  }
  if (mode === 'INSERT' || mode === 'REPLACE') {
    return lineText.length;
  }
  return Math.max(0, lineText.length - 1);
}

/**
 * 줄의 첫 번째 공백이 아닌 문자의 열 인덱스(^)를 반환합니다.
 * 공백만 있거나 빈 줄인 경우 0을 반환합니다.
 */
export function getFirstNonBlankCol(lineText: string | undefined): number {
  if (!lineText || lineText.length === 0) {
    return 0;
  }
  const match = lineText.search(/\S/);
  return match !== -1 ? match : 0;
}

/**
 * 커서가 유효한 버퍼 범위(줄 수 및 줄의 마지막 문자)를 벗어나지 않도록 클램프합니다.
 */
export function clampCursor(
  lines: string[],
  cursor: CursorPosition,
  mode: VimMode = 'NORMAL'
): CursorPosition {
  if (lines.length === 0) {
    return { line: 0, col: 0 };
  }

  const line = Math.max(0, Math.min(cursor.line, lines.length - 1));
  const currentLineText = lines[line] ?? '';
  const maxCol = getMaxCol(currentLineText, mode);
  const col = Math.max(0, Math.min(cursor.col, maxCol));

  return { line, col };
}
