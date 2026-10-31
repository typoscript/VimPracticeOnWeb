import { CursorPosition, SearchMatch } from '../types/vim';

/**
 * 정규식 특수문자를 안전하게 이스케이프 처리합니다.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 버퍼 전체 줄에서 검색어(query)와 일치하는 모든 위치를 찾습니다.
 */
export function findMatches(lines: string[], query: string): SearchMatch[] {
  if (!query || query.length === 0) {
    return [];
  }

  const matches: SearchMatch[] = [];
  const escaped = escapeRegExp(query);
  const regex = new RegExp(escaped, 'g');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx] ?? '';
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      matches.push({
        line: lineIdx,
        col: match.index,
        length: query.length,
      });

      // 무한 루프 방지
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
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
