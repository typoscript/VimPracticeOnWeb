import { CursorPosition, SearchMatch, SearchOffset } from '../types/vim';

/**
 * 정규식 특수문자를 안전하게 이스케이프 처리합니다.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SearchOptions {
  ignorecase?: boolean;
  smartcase?: boolean;
}

/**
 * 버퍼 전체 줄에서 검색어(query)와 일치하는 모든 위치를 찾습니다.
 * 순정 Vim 정규식과 일반 문자열 모두 안전하게 처리합니다.
 */
export function findMatches(
  lines: string[],
  query: string,
  options?: SearchOptions
): SearchMatch[] {
  if (!query || query.length === 0) {
    return [];
  }

  const matches: SearchMatch[] = [];
  const escaped = escapeRegExp(query);

  let isCaseInsensitive = options?.ignorecase ?? false;
  if (isCaseInsensitive && options?.smartcase) {
    // smartcase: 만약 검색어에 대문자가 하나라도 포함되어 있다면 대소문자를 구분합니다.
    if (/[A-Z]/.test(query)) {
      isCaseInsensitive = false;
    }
  }

  const flags = isCaseInsensitive ? 'gi' : 'g';
  const regex = new RegExp(escaped, flags);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx] ?? '';
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const matchLen = match[0].length;
      matches.push({
        line: lineIdx,
        col: match.index,
        length: matchLen > 0 ? matchLen : 1,
      });

      // 0글자 매칭 무한 루프 방지
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
}

/**
 * 검색 커맨드라인 문자열(raw)에서 패턴과 오프셋을 분리 파싱합니다.
 * 예: 'foo/e' -> pattern: 'foo', offset: { type: 'end', offset: 0 }
 *     'foo/s+2' -> pattern: 'foo', offset: { type: 'start', offset: 2 }
 *     'TODO/+1' -> pattern: 'TODO', offset: { type: 'line', offset: 1 }
 */
export function parseSearchQuery(raw: string): {
  pattern: string;
  offset: SearchOffset | null;
} {
  if (!raw) {
    return { pattern: '', offset: null };
  }

  // 패턴과 오프셋을 구분하는 첫 번째 unescaped '/' 탐색
  let delimIdx = -1;
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\\') {
      i += 2;
      continue;
    }
    if (raw[i] === '/') {
      delimIdx = i;
      break;
    }
    i++;
  }

  if (delimIdx === -1) {
    return { pattern: raw, offset: null };
  }

  const pattern = raw.slice(0, delimIdx);
  const offsetStr = raw.slice(delimIdx + 1).trim();

  if (offsetStr.length === 0) {
    return { pattern, offset: null };
  }

  // 1. 끝(end) 오프셋: e, e+N, e-N, e+, e-
  const endMatch = offsetStr.match(/^e([+-]?\d*)?$/);
  if (endMatch) {
    let off = 0;
    const numPart = endMatch[1];
    if (numPart === '+' || numPart === '') off = numPart === '+' ? 1 : 0;
    else if (numPart === '-') off = -1;
    else if (numPart) off = parseInt(numPart, 10);
    return { pattern, offset: { type: 'end', offset: off } };
  }

  // 2. 시작(start/begin) 오프셋: s, s+N, s-N, b, b+N, b-N
  const startMatch = offsetStr.match(/^[sb]([+-]?\d*)?$/);
  if (startMatch) {
    let off = 0;
    const numPart = startMatch[1];
    if (numPart === '+' || numPart === '') off = numPart === '+' ? 1 : 0;
    else if (numPart === '-') off = -1;
    else if (numPart) off = parseInt(numPart, 10);
    return { pattern, offset: { type: 'start', offset: off } };
  }

  // 3. 라인(line) 오프셋: +N, -N, +, -, 또는 부호 있는 숫자
  const lineMatch = offsetStr.match(/^([+-])(\d+)?$/);
  if (lineMatch) {
    const sign = lineMatch[1] === '-' ? -1 : 1;
    const num = lineMatch[2] ? parseInt(lineMatch[2], 10) : 1;
    return { pattern, offset: { type: 'line', offset: sign * num } };
  }

  const numMatch = offsetStr.match(/^([+-]?\d+)$/);
  if (numMatch) {
    return { pattern, offset: { type: 'line', offset: parseInt(numMatch[1], 10) } };
  }

  return { pattern, offset: null };
}

/**
 * 매칭 정보와 검색 오프셋(/e, /s+2, /+1)을 바탕으로 커서 목표 위치를 계산합니다.
 */
export function applySearchOffset(
  lines: string[],
  match: SearchMatch,
  offset?: SearchOffset | null
): CursorPosition {
  if (lines.length === 0) {
    return { line: match.line, col: match.col };
  }

  if (!offset || offset.type === 'start') {
    const line = Math.max(0, Math.min(lines.length - 1, match.line));
    const lineText = lines[line] ?? '';
    const rawCol = match.col + (offset?.offset ?? 0);
    const maxCol = Math.max(0, lineText.length - 1);
    const col = Math.max(0, Math.min(maxCol, rawCol));
    return { line, col };
  }

  if (offset.type === 'end') {
    const line = Math.max(0, Math.min(lines.length - 1, match.line));
    const lineText = lines[line] ?? '';
    const endCol = match.col + Math.max(0, match.length - 1);
    const rawCol = endCol + offset.offset;
    const maxCol = Math.max(0, lineText.length - 1);
    const col = Math.max(0, Math.min(maxCol, rawCol));
    return { line, col };
  }

  if (offset.type === 'line') {
    const targetLine = Math.max(0, Math.min(lines.length - 1, match.line + offset.offset));
    const lineText = lines[targetLine] ?? '';
    const firstNonBlank = lineText.search(/\S/);
    const col = firstNonBlank >= 0 ? firstNonBlank : 0;
    return { line: targetLine, col };
  }

  return { line: match.line, col: match.col };
}

/**
 * 현재 커서 위치 이후의 다음 매치 위치를 찾습니다. (마지막 이후에는 첫 번째로 순환)
 */
export function findNextMatch(
  matches: SearchMatch[],
  cursor: CursorPosition
): SearchMatch | null {
  if (matches.length === 0) return null;

  // 커서보다 뒤에 있는 첫 번째 일치 항목 탐색
  const next = matches.find(
    (m) =>
      m.line > cursor.line ||
      (m.line === cursor.line && m.col > cursor.col)
  );

  // 없으면 첫 번째 항목으로 순환 (wrap-around)
  return next ?? matches[0];
}

/**
 * 현재 커서 위치 이전의 직전 매치 위치를 찾습니다. (첫 번째 이전에는 마지막으로 순환)
 */
export function findPrevMatch(
  matches: SearchMatch[],
  cursor: CursorPosition
): SearchMatch | null {
  if (matches.length === 0) return null;

  // 커서보다 앞에 있는 일치 항목들 중 가장 마지막 항목 탐색
  const prevList = matches.filter(
    (m) =>
      m.line < cursor.line ||
      (m.line === cursor.line && m.col < cursor.col)
  );

  if (prevList.length > 0) {
    return prevList[prevList.length - 1];
  }

  // 없으면 가장 마지막 항목으로 순환 (wrap-around)
  return matches[matches.length - 1];
}

/**
 * 커서가 이미 일치 항목 내부(inside match)에 있는지 검사하고,
 * 그렇지 않다면 다음(또는 이전) 매치 항목을 반환합니다. (gn / gN 텍스트 객체용)
 */
export function findCurrentOrNextMatch(
  matches: SearchMatch[],
  cursor: CursorPosition,
  forward = true
): { match: SearchMatch; isCurrent: boolean } | null {
  if (matches.length === 0) return null;

  // 1. 커서가 현재 일치 항목 내부에 위치하는지 확인
  const current = matches.find(
    (m) =>
      m.line === cursor.line &&
      cursor.col >= m.col &&
      cursor.col < m.col + Math.max(1, m.length)
  );

  if (current) {
    return { match: current, isCurrent: true };
  }

  // 2. 내부가 아니라면 다음(forward) 또는 이전(backward) 매치 선택
  if (forward) {
    const next = findNextMatch(matches, cursor);
    return next ? { match: next, isCurrent: false } : null;
  } else {
    const prev = findPrevMatch(matches, cursor);
    return prev ? { match: prev, isCurrent: false } : null;
  }
}

/**
 * 커서 위치에 있는 단어를 추출합니다. ('*' 검색 단어 자동 추출용)
 */
export function getWordAtCursor(lineText: string, col: number): string | null {
  if (!lineText || col < 0 || col >= lineText.length) {
    return null;
  }

  // 커서가 공백에 있으면 null
  if (/\s/.test(lineText[col])) {
    return null;
  }

  const isWordChar = (ch: string) => /\w/.test(ch);
  const targetIsWord = isWordChar(lineText[col]);

  let start = col;
  while (start > 0 && isWordChar(lineText[start - 1]) === targetIsWord) {
    start--;
  }

  let end = col;
  while (end < lineText.length - 1 && isWordChar(lineText[end + 1]) === targetIsWord) {
    end++;
  }

  const word = lineText.slice(start, end + 1);
  return word.length > 0 ? word : null;
}
