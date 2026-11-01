import { CursorPosition } from '../types/vim';

const OPEN_BRACKETS = ['(', '[', '{'] as const;
const CLOSE_BRACKETS = [')', ']', '}'] as const;
const ALL_BRACKETS = [...OPEN_BRACKETS, ...CLOSE_BRACKETS];

const MATCH_MAP: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
};

/**
 * 현재 커서 위치 또는 현재 줄에서 커서 뒤로 가장 가까운 괄호의 짝(Matching Pair)을 찾습니다.
 * (단일 줄 및 여러 줄에 걸친 멀티라인 중첩 매칭 지원)
 */
export function findMatchingBracket(
  lines: string[],
  cursor: CursorPosition
): CursorPosition | null {
  if (lines.length === 0 || cursor.line < 0 || cursor.line >= lines.length) {
    return null;
  }

  const currentLine = lines[cursor.line] ?? '';
  let bracketCol = cursor.col;
  let targetBracket = currentLine[bracketCol];

  // 커서 위치가 괄호가 아니라면, 현재 줄에서 커서 이후의 첫 괄호를 탐색
  if (!targetBracket || !ALL_BRACKETS.includes(targetBracket as any)) {
    let found = false;
    for (let c = cursor.col; c < currentLine.length; c++) {
      if (ALL_BRACKETS.includes(currentLine[c] as any)) {
        bracketCol = c;
        targetBracket = currentLine[c];
        found = true;
        break;
      }
    }
    if (!found) {
      return null;
    }
  }

  const isOpening = OPEN_BRACKETS.includes(targetBracket as any);
  const partnerBracket = MATCH_MAP[targetBracket];

  if (isOpening) {
    // 순방향(Forward/Downward) 탐색
    let depth = 1;

    // 1. 현재 줄의 bracketCol + 1 부터 탐색
    for (let c = bracketCol + 1; c < currentLine.length; c++) {
      const ch = currentLine[c];
      if (ch === targetBracket) depth++;
      else if (ch === partnerBracket) {
        depth--;
        if (depth === 0) {
          return { line: cursor.line, col: c };
        }
      }
    }

    // 2. 다음 줄들 탐색
    for (let l = cursor.line + 1; l < lines.length; l++) {
      const lineText = lines[l] ?? '';
      for (let c = 0; c < lineText.length; c++) {
        const ch = lineText[c];
        if (ch === targetBracket) depth++;
        else if (ch === partnerBracket) {
          depth--;
          if (depth === 0) {
            return { line: l, col: c };
          }
        }
      }
    }
  } else {
    // 역방향(Backward/Upward) 탐색
    let depth = 1;

    // 1. 현재 줄의 bracketCol - 1 부터 역방향 탐색
    for (let c = bracketCol - 1; c >= 0; c--) {
      const ch = currentLine[c];
      if (ch === targetBracket) depth++;
      else if (ch === partnerBracket) {
        depth--;
        if (depth === 0) {
          return { line: cursor.line, col: c };
        }
      }
    }

    // 2. 이전 줄들 역방향 탐색
    for (let l = cursor.line - 1; l >= 0; l--) {
      const lineText = lines[l] ?? '';
      for (let c = lineText.length - 1; c >= 0; c--) {
        const ch = lineText[c];
        if (ch === targetBracket) depth++;
        else if (ch === partnerBracket) {
          depth--;
          if (depth === 0) {
            return { line: l, col: c };
          }
        }
      }
    }
  }

  return null;
}
