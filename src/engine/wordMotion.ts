import { CursorPosition } from '../types/vim';
import { getMaxCol } from './cursor';

type CharType = 'word' | 'punct' | 'space';

function getCharType(ch: string | undefined): CharType {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/\w/.test(ch)) return 'word';
  return 'punct';
}

/**
 * 'w': 다음 단어의 시작 위치로 이동합니다.
 */
export function findNextWord(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));
  const currentLine = lines[line] ?? '';

  // 현재 줄이 빈 줄인 경우: 다음 줄의 첫 단어로 이동
  if (currentLine.length === 0) {
    for (let l = line + 1; l < lines.length; l++) {
      const nextLine = lines[l];
      if (nextLine.length === 0) {
        return { line: l, col: 0 };
      }
      const match = nextLine.search(/\S/);
      if (match !== -1) {
        return { line: l, col: match };
      }
    }
    // 더 이상 단어가 없으면 마지막 줄의 끝
    return { line: lines.length - 1, col: getMaxCol(lines[lines.length - 1]) };
  }

  const startType = getCharType(currentLine[col]);
  let c = col;

  if (startType === 'space') {
    // 이미 공백에 있으면 다음 non-space까지 직진
    while (c < currentLine.length && getCharType(currentLine[c]) === 'space') {
      c++;
    }
  } else {
    // 현재 단어의 끝까지 전진 (같은 타입 건너뜀)
    while (c < currentLine.length && getCharType(currentLine[c]) === startType) {
      c++;
    }
    // 그 뒤에 오는 공백들 건너뜀
    while (c < currentLine.length && getCharType(currentLine[c]) === 'space') {
      c++;
    }
  }

  // 현재 줄 안에서 다음 단어를 찾은 경우
  if (c < currentLine.length) {
    return { line, col: c };
  }

  // 다음 줄들에서 첫 번째 단어 또는 빈 줄 찾기
  for (let l = line + 1; l < lines.length; l++) {
    const nextLine = lines[l];
    if (nextLine.length === 0) {
      return { line: l, col: 0 };
    }
    const match = nextLine.search(/\S/);
    if (match !== -1) {
      return { line: l, col: match };
    }
  }

  // 버퍼 끝에 도달한 경우
  const lastLineIdx = lines.length - 1;
  return { line: lastLineIdx, col: getMaxCol(lines[lastLineIdx]) };
}

/**
 * 'b': 이전 단어의 시작 위치로 이동합니다.
 */
export function findPrevWord(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));

  // 1단계: 이전 문자로 1칸 뒤로 이동 (0열이면 이전 줄로)
  let l = line;
  let c = col - 1;

  while (l >= 0) {
    // c가 -1이면 이전 줄 끝으로 이동
    if (c < 0) {
      l--;
      if (l < 0) break;
      const prevLineText = lines[l] ?? '';
      if (prevLineText.length === 0) {
        // 빈 줄이면 빈 줄에서 멈춤
        return { line: l, col: 0 };
      }
      c = prevLineText.length - 1;
    }

    const currentLineText = lines[l] ?? '';
    if (currentLineText.length === 0) {
      return { line: l, col: 0 };
    }

    // 공백 건너뛰기
    while (c >= 0 && getCharType(currentLineText[c]) === 'space') {
      c--;
    }

    if (c >= 0) {
      // 단어 또는 기호의 끝을 찾음
      const wordType = getCharType(currentLineText[c]);
      // 해당 단어의 시작점까지 왼쪽으로 이동
      while (c > 0 && getCharType(currentLineText[c - 1]) === wordType) {
        c--;
      }
      return { line: l, col: c };
    }
    // 현재 줄의 시작까지 모두 공백이었다면 c는 -1이 되어 다음 반복에서 l-- 처리됨
  }

  return { line: 0, col: 0 };
}

/**
 * 'e': 단어의 끝(마지막 문자)으로 이동합니다.
 */
export function findWordEnd(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));

  let l = line;
  let c = col + 1;

  while (l < lines.length) {
    const lineText = lines[l] ?? '';

    // 현재 줄 끝을 넘겼으면 다음 줄로
    if (c >= lineText.length) {
      l++;
      if (l >= lines.length) break;
      c = 0;
      continue;
    }

    // 공백 건너뛰기
    while (c < lineText.length && getCharType(lineText[c]) === 'space') {
      c++;
    }

    if (c < lineText.length) {
      // 단어 또는 기호 시작 찾음
      const wordType = getCharType(lineText[c]);
      // 해당 단어가 끝나는 마지막 문자까지 전진
      while (c + 1 < lineText.length && getCharType(lineText[c + 1]) === wordType) {
        c++;
      }
      return { line: l, col: c };
    }
    // 줄 끝까지 모두 공백이었으면 다음 루프에서 l++
  }

  // 끝까지 찾지 못하면 파일 끝
  const lastLineIdx = lines.length - 1;
  return { line: lastLineIdx, col: getMaxCol(lines[lastLineIdx]) };
}

function isSpaceChar(ch: string | undefined): boolean {
  if (!ch) return true;
  return /\s/.test(ch);
}

/**
 * 'W': 다음 WORD(공백으로만 구분되는 텍스트 덩어리)의 시작 위치로 이동합니다.
 * 특수문자/기호를 단어 구분의 기준으로 삼지 않고 공백 기준으로만 건너뜁니다.
 */
export function findNextWORD(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));
  const currentLine = lines[line] ?? '';

  if (currentLine.length === 0) {
    for (let l = line + 1; l < lines.length; l++) {
      const nextLine = lines[l];
      if (nextLine.length === 0) {
        return { line: l, col: 0 };
      }
      const match = nextLine.search(/\S/);
      if (match !== -1) {
        return { line: l, col: match };
      }
    }
    return { line: lines.length - 1, col: getMaxCol(lines[lines.length - 1]) };
  }

  let c = col;
  if (isSpaceChar(currentLine[c])) {
    while (c < currentLine.length && isSpaceChar(currentLine[c])) {
      c++;
    }
  } else {
    // 현재 WORD 끝까지 건너뜀 (공백을 만날 때까지)
    while (c < currentLine.length && !isSpaceChar(currentLine[c])) {
      c++;
    }
    // 그 뒤의 공백들을 건너뜀
    while (c < currentLine.length && isSpaceChar(currentLine[c])) {
      c++;
    }
  }

  if (c < currentLine.length) {
    return { line, col: c };
  }

  for (let l = line + 1; l < lines.length; l++) {
    const nextLine = lines[l];
    if (nextLine.length === 0) {
      return { line: l, col: 0 };
    }
    const match = nextLine.search(/\S/);
    if (match !== -1) {
      return { line: l, col: match };
    }
  }

  const lastLineIdx = lines.length - 1;
  return { line: lastLineIdx, col: getMaxCol(lines[lastLineIdx]) };
}

/**
 * 'B': 이전 WORD(공백으로만 구분되는 텍스트 덩어리)의 시작 위치로 이동합니다.
 */
export function findPrevWORD(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));

  let l = line;
  let c = col - 1;

  while (l >= 0) {
    if (c < 0) {
      l--;
      if (l < 0) break;
      const prevLineText = lines[l] ?? '';
      if (prevLineText.length === 0) {
        return { line: l, col: 0 };
      }
      c = prevLineText.length - 1;
    }

    const currentLineText = lines[l] ?? '';
    if (currentLineText.length === 0) {
      return { line: l, col: 0 };
    }

    // 공백 건너뛰기
    while (c >= 0 && isSpaceChar(currentLineText[c])) {
      c--;
    }

    if (c >= 0) {
      // WORD의 시작점까지 왼쪽으로 이동
      while (c > 0 && !isSpaceChar(currentLineText[c - 1])) {
        c--;
      }
      return { line: l, col: c };
    }
  }

  return { line: 0, col: 0 };
}

/**
 * 'E': 현재/다음 WORD(공백으로만 구분되는 텍스트 덩어리)의 끝 위치로 이동합니다.
 */
export function findWORDEnd(lines: string[], cursor: CursorPosition): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };

  let { line, col } = cursor;
  line = Math.max(0, Math.min(line, lines.length - 1));

  let l = line;
  let c = col + 1;

  while (l < lines.length) {
    const lineText = lines[l] ?? '';

    if (c >= lineText.length) {
      l++;
      if (l >= lines.length) break;
      c = 0;
      continue;
    }

    while (c < lineText.length && isSpaceChar(lineText[c])) {
      c++;
    }

    if (c < lineText.length) {
      while (c + 1 < lineText.length && !isSpaceChar(lineText[c + 1])) {
        c++;
      }
      return { line: l, col: c };
    }
  }

  const lastLineIdx = lines.length - 1;
  return { line: lastLineIdx, col: getMaxCol(lines[lastLineIdx]) };
}
