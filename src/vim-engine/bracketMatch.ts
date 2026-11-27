import { CursorPosition } from './types';

export const DEFAULT_MATCHPAIRS = '(:),{:},[:]';

interface CompiledMatchpairs {
  openSet: Set<string>;
  allSet: Set<string>;
  matchMap: Record<string, string>;
}

export function parseMatchpairs(raw?: string): {
  ok: true;
  pairs: Array<[string, string]>;
} | {
  ok: false;
} {
  const effective = raw !== undefined ? raw : DEFAULT_MATCHPAIRS;
  if (effective.trim() === '') {
    return { ok: true, pairs: [] };
  }
  const pairs: Array<[string, string]> = [];
  for (const token of effective.split(',')) {
    const t = token.trim();
    if (!t) continue;
    if (t.length !== 3 || t[1] !== ':' || t[0] === t[2]) {
      return { ok: false };
    }
    pairs.push([t[0], t[2]]);
  }
  return { ok: true, pairs };
}

function compileMatchpairs(raw?: string): CompiledMatchpairs {
  const parsed = parseMatchpairs(raw);
  const pairs = parsed.ok
    ? parsed.pairs
    : [
        ['(', ')'],
        ['{', '}'],
        ['[', ']'],
      ];
  const openSet = new Set<string>();
  const allSet = new Set<string>();
  const matchMap: Record<string, string> = {};
  for (const [open, close] of pairs) {
    openSet.add(open);
    allSet.add(open);
    allSet.add(close);
    matchMap[open] = close;
    matchMap[close] = open;
  }
  return { openSet, allSet, matchMap };
}

let activeMatchpairsStr = DEFAULT_MATCHPAIRS;
let activeMatchpairs: CompiledMatchpairs = compileMatchpairs(DEFAULT_MATCHPAIRS);

export function setActiveMatchpairs(raw?: string): void {
  const next = raw !== undefined ? raw : DEFAULT_MATCHPAIRS;
  if (next === activeMatchpairsStr) return;
  activeMatchpairsStr = next;
  activeMatchpairs = compileMatchpairs(next);
}

/**
 * 커서가 C 주석의 여는 경계(슬래시+별표)나 닫는 경계(별표+슬래시) 위에 있으면
 * 짝 경계의 슬래시 위치를 돌려줍니다 (Vim % 의 C 주석 짝 이동).
 * Vim 처럼 커서가 경계 문자 위에 있을 때만 동작하고, 커서 뒤를 훑어 찾지는 않습니다.
 * 주석 경계 위가 아니면 undefined, 경계 위인데 짝이 없으면 null 을 돌려줍니다.
 */
function findMatchingCommentDelimiter(
  lines: string[],
  cursor: CursorPosition
): CursorPosition | null | undefined {
  const line = lines[cursor.line] ?? '';
  const c = cursor.col;
  const ch = line[c];
  let startCol = -1; // 여는 경계의 슬래시 위치
  let endCol = -1; // 닫는 경계의 슬래시 위치
  if (ch === '/' && line[c + 1] === '*') startCol = c;
  else if (ch === '*' && line[c - 1] === '/') startCol = c - 1;
  else if (ch === '*' && line[c + 1] === '/') endCol = c + 1;
  else if (ch === '/' && line[c - 1] === '*') endCol = c;
  else return undefined;

  if (startCol >= 0) {
    let from = startCol + 2;
    for (let l = cursor.line; l < lines.length; l++) {
      const idx = (lines[l] ?? '').indexOf('*/', l === cursor.line ? from : 0);
      if (idx >= 0) return { line: l, col: idx + 1 };
      from = 0;
    }
    return null;
  }
  for (let l = cursor.line; l >= 0; l--) {
    const text = lines[l] ?? '';
    const limit = l === cursor.line ? endCol - 2 : text.length;
    const idx = limit < 0 ? -1 : text.lastIndexOf('/*', limit);
    if (idx >= 0) return { line: l, col: idx };
  }
  return null;
}

/**
 * 현재 커서 위치 또는 현재 줄에서 커서 뒤로 가장 가까운 괄호의 짝(Matching Pair)을 찾습니다.
 * (단일 줄 및 여러 줄에 걸친 멀티라인 중첩 매칭, :set matchpairs 지원)
 */
export function findMatchingBracket(
  lines: string[],
  cursor: CursorPosition,
  matchpairsOverride?: string
): CursorPosition | null {
  if (lines.length === 0 || cursor.line < 0 || cursor.line >= lines.length) {
    return null;
  }

  const { openSet, allSet, matchMap } =
    matchpairsOverride !== undefined ? compileMatchpairs(matchpairsOverride) : activeMatchpairs;

  const commentMatch = findMatchingCommentDelimiter(lines, cursor);
  if (commentMatch !== undefined) return commentMatch;

  const currentLine = lines[cursor.line] ?? '';
  let bracketCol = cursor.col;
  let targetBracket = currentLine[bracketCol];

  // 커서 위치가 괄호가 아니라면, 현재 줄에서 커서 이후의 첫 괄호를 탐색
  if (!targetBracket || !allSet.has(targetBracket)) {
    let found = false;
    for (let c = cursor.col; c < currentLine.length; c++) {
      if (allSet.has(currentLine[c])) {
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

  const isOpening = openSet.has(targetBracket);
  const partnerBracket = matchMap[targetBracket];

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
