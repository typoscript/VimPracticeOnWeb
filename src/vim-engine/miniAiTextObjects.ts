import { CursorPosition } from './types';
import { TextObjectRange } from './textObjectsExtended';

export type MiniAiScope = 'n' | 'l';

interface DelimiterPair {
  open: CursorPosition;
  close: CursorPosition;
}

const BRACKET_MAP: Record<string, [string, string]> = {
  '(': ['(', ')'],
  ')': ['(', ')'],
  b: ['(', ')'],
  '[': ['[', ']'],
  ']': ['[', ']'],
  '{': ['{', '}'],
  '}': ['{', '}'],
  B: ['{', '}'],
  '<': ['<', '>'],
  '>': ['<', '>'],
};

const QUOTE_CHARS = new Set(['"', "'", '`']);

function posCompare(a: CursorPosition, b: CursorPosition): number {
  return a.line !== b.line ? a.line - b.line : a.col - b.col;
}

function spanSize(p: DelimiterPair): number {
  return (p.close.line - p.open.line) * 100000 + (p.close.col - p.open.col);
}

function collectQuotePairs(lines: string[], quote: string): DelimiterPair[] {
  const pairs: DelimiterPair[] = [];
  for (let l = 0; l < lines.length; l++) {
    const text = lines[l] ?? '';
    const indices: number[] = [];
    for (let c = 0; c < text.length; c++) {
      if (text[c] === quote && (c === 0 || text[c - 1] !== '\\')) {
        indices.push(c);
      }
    }
    for (let i = 0; i + 1 < indices.length; i += 2) {
      pairs.push({
        open: { line: l, col: indices[i] },
        close: { line: l, col: indices[i + 1] },
      });
    }
  }
  return pairs;
}

function collectBracketPairs(lines: string[], openChar: string, closeChar: string): DelimiterPair[] {
  const pairs: DelimiterPair[] = [];
  const stack: CursorPosition[] = [];
  for (let l = 0; l < lines.length; l++) {
    const text = lines[l] ?? '';
    for (let c = 0; c < text.length; c++) {
      const ch = text[c];
      if (ch === openChar) {
        stack.push({ line: l, col: c });
      } else if (ch === closeChar && stack.length > 0) {
        const open = stack.pop()!;
        pairs.push({ open, close: { line: l, col: c } });
      }
    }
  }
  return pairs;
}

/**
 * mini.ai 스타일 Next(`in`/`an`) 및 Last(`il`/`al`) 텍스트 객체 범위를 계산합니다.
 * 커서가 따옴표·괄호 밖에 있더라도 버퍼 전체에서 다음(`n`) 또는 이전(`l`) 짝을 찾아 범위를 반환합니다.
 */
export function getMiniAiNextLastRange(
  lines: string[],
  cursor: CursorPosition,
  modifier: 'i' | 'a',
  scope: MiniAiScope,
  target: string,
  count = 1
): TextObjectRange | null {
  if (lines.length === 0) return null;

  let pairs: DelimiterPair[];
  if (QUOTE_CHARS.has(target)) {
    pairs = collectQuotePairs(lines, target);
  } else if (target in BRACKET_MAP) {
    const [openChar, closeChar] = BRACKET_MAP[target];
    pairs = collectBracketPairs(lines, openChar, closeChar);
  } else {
    return null;
  }

  if (pairs.length === 0) return null;

  let candidates: DelimiterPair[];
  if (scope === 'n') {
    candidates = pairs
      .filter((p) => posCompare(p.open, cursor) > 0)
      .sort((a, b) => posCompare(a.open, b.open) || spanSize(a) - spanSize(b));
  } else {
    candidates = pairs
      .filter((p) => posCompare(p.close, cursor) < 0)
      .sort((a, b) => posCompare(b.close, a.close) || spanSize(a) - spanSize(b));
  }

  const chosen = candidates[Math.max(0, count - 1)];
  if (!chosen) return null;

  // 단일 줄 짝
  if (chosen.open.line === chosen.close.line) {
    const lineIdx = chosen.open.line;
    if (modifier === 'i') {
      if (chosen.open.col + 1 === chosen.close.col) {
        return {
          startLine: lineIdx,
          startCol: chosen.open.col + 1,
          endLine: lineIdx,
          endCol: chosen.open.col,
          isEmpty: true,
        };
      }
      return {
        startLine: lineIdx,
        startCol: chosen.open.col + 1,
        endLine: lineIdx,
        endCol: chosen.close.col - 1,
      };
    }
    return {
      startLine: lineIdx,
      startCol: chosen.open.col,
      endLine: lineIdx,
      endCol: chosen.close.col,
    };
  }

  // 멀티 라인 괄호 짝
  if (modifier === 'i') {
    const openAtEol = (lines[chosen.open.line] ?? '').slice(chosen.open.col + 1).trim() === '';
    const closeAtSol = (lines[chosen.close.line] ?? '').slice(0, chosen.close.col).trim() === '';
    const start = openAtEol
      ? { line: chosen.open.line + 1, col: 0 }
      : { line: chosen.open.line, col: chosen.open.col + 1 };
    const end = closeAtSol
      ? { line: chosen.close.line - 1, col: Math.max(0, (lines[chosen.close.line - 1] ?? '').length - 1) }
      : { line: chosen.close.line, col: chosen.close.col - 1 };

    if (start.line > end.line) {
      return {
        startLine: chosen.open.line,
        startCol: chosen.open.col + 1,
        endLine: chosen.open.line,
        endCol: chosen.open.col,
        isEmpty: true,
      };
    }
    return {
      startLine: start.line,
      startCol: start.col,
      endLine: end.line,
      endCol: end.col,
      linewise: openAtEol && closeAtSol,
    };
  }

  return {
    startLine: chosen.open.line,
    startCol: chosen.open.col,
    endLine: chosen.close.line,
    endCol: chosen.close.col,
  };
}
