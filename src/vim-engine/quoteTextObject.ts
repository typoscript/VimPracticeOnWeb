/**
 * Vim textobject.c 의 current_quote()·find_next_quote()·find_prev_quote() 이식입니다 (i" a" i' a' i` a`).
 * - a" 는 닫는 따옴표 뒤 공백을, 없으면 여는 따옴표 앞 공백을 함께 고릅니다.
 * - [count]i" (count >= 2) 는 따옴표를 포함하지만 공백은 넣지 않습니다 (vim-surround 의 d2i").
 * - 'quoteescape' 는 기본값 `\` 로 봅니다. 한 줄 안에서만 동작합니다.
 */

const QUOTE_ESCAPE = '\\';

const isWhite = (c: string | undefined) => c === ' ' || c === '\t';

/** Vim find_next_quote: col 부터 앞으로 따옴표를 찾습니다. escape 가 있으면 이스케이프된 글자를 건너뜁니다. */
function findNextQuote(line: string, col: number, quote: string, escape: boolean): number {
  for (;;) {
    const c = line[col];
    if (c === undefined) return -1;
    if (escape && c === QUOTE_ESCAPE) {
      col++;
      if (line[col] === undefined) return -1;
    } else if (c === quote) {
      return col;
    }
    col++;
  }
}

/** Vim find_prev_quote: col 앞에서 뒤로 따옴표를 찾습니다. 못 찾으면 0 을 돌려줍니다 (호출 측이 글자를 확인). */
function findPrevQuote(line: string, colStart: number, quote: string, escape: boolean): number {
  while (colStart > 0) {
    colStart--;
    let n = 0;
    if (escape) {
      while (colStart - n > 0 && line[colStart - n - 1] === QUOTE_ESCAPE) n++;
    }
    if (n & 1) colStart -= n;
    else if (line[colStart] === quote) break;
  }
  return colStart;
}

export type QuoteObjectResult =
  /** 연산자용 범위 (끝 포함). isEmpty 면 startCol 위치의 빈 범위 */
  | { kind: 'operator'; startCol: number; endCol: number; isEmpty: boolean }
  /** 비주얼 모드의 새 선택 (anchorCol 이 undefined 면 기존 앵커 유지) */
  | { kind: 'visual'; anchorCol: number | undefined; cursorCol: number };

/**
 * current_quote(oap, count, include, quotechar).
 * visual 은 비주얼 모드일 때 같은 줄의 앵커 열입니다 (다른 줄이면 호출 측에서 실패 처리).
 */
export function currentQuote(
  line: string,
  cursorCol: number,
  count: number,
  include: boolean,
  quote: string,
  visualAnchorCol?: number
): QuoteObjectResult | null {
  const visualActive = visualAnchorCol !== undefined;
  const anchor = visualAnchorCol ?? cursorCol;
  let colStart = cursorCol;
  let colEnd = 0;
  let visBefCurs = false;
  let visEmpty = true;
  let insideQuotes = false;
  let selectedQuote = false;

  if (visualActive) {
    visBefCurs = anchor < cursorCol;
    visEmpty = anchor === cursorCol;
    if (!visEmpty) {
      let i: number;
      let end: number;
      if (visBefCurs) {
        insideQuotes = anchor > 0 && line[anchor - 1] === quote && line[cursorCol] !== undefined && line[cursorCol + 1] === quote;
        i = anchor;
        end = cursorCol;
      } else {
        insideQuotes = cursorCol > 0 && line[cursorCol - 1] === quote && line[anchor] !== undefined && line[anchor + 1] === quote;
        i = cursorCol;
        end = anchor;
      }
      while (i <= end) {
        if (line[i] === undefined) break;
        if (line[i++] === quote) {
          selectedQuote = true;
          break;
        }
      }
    }
  }

  if (!visEmpty && line[colStart] === quote) {
    // 이미 선택 중이고 따옴표 위: 다음(또는 이전) 따옴표 문자열을 찾습니다.
    if (visBefCurs) {
      colStart = findNextQuote(line, colStart + 1, quote, false);
      if (colStart < 0) return null;
      colEnd = findNextQuote(line, colStart + 1, quote, true);
      if (colEnd < 0) {
        colEnd = colStart;
        colStart = cursorCol;
      }
    } else {
      colEnd = findPrevQuote(line, colStart, quote, false);
      if (line[colEnd] !== quote) return null;
      colStart = findPrevQuote(line, colEnd, quote, true);
      if (line[colStart] !== quote) {
        colStart = colEnd;
        colEnd = cursorCol;
      }
    }
  } else if (line[colStart] === quote || !visEmpty) {
    let firstCol = colStart;
    if (!visEmpty) {
      firstCol = visBefCurs ? findNextQuote(line, colStart, quote, false) : findPrevQuote(line, colStart, quote, false);
    }
    // 따옴표 위: 여는지 닫는지 모르므로 줄 처음부터 짝을 맞춰 찾습니다.
    colStart = 0;
    for (;;) {
      colStart = findNextQuote(line, colStart, quote, false);
      if (colStart < 0 || colStart > firstCol) return null;
      colEnd = findNextQuote(line, colStart + 1, quote, true);
      if (colEnd < 0) return null;
      if (colStart <= firstCol && firstCol <= colEnd) break;
      colStart = colEnd + 1;
    }
  } else {
    // 뒤로 여는 따옴표를 찾고, 없으면 커서 뒤에서 찾습니다.
    colStart = findPrevQuote(line, colStart, quote, true);
    if (line[colStart] !== quote) {
      colStart = findNextQuote(line, colStart, quote, false);
      if (colStart < 0) return null;
    }
    colEnd = findNextQuote(line, colStart + 1, quote, true);
    if (colEnd < 0) return null;
  }

  // a" : 닫는 따옴표 뒤 공백, 없으면 여는 따옴표 앞 공백을 포함합니다.
  if (include) {
    if (isWhite(line[colEnd + 1])) {
      while (isWhite(line[colEnd + 1])) colEnd++;
    } else {
      while (colStart > 0 && isWhite(line[colStart - 1])) colStart--;
    }
  }

  // vi" 뒤의 i" 와 v2i" 는 따옴표를 포함합니다.
  if (!include && count < 2 && (visEmpty || !insideQuotes)) colStart++;
  const includeEnd = include || count > 1 || (!visEmpty && insideQuotes);
  // 끝 위치: 따옴표를 포함하면 colEnd 까지, 아니면 colEnd 바로 앞까지 (exclusive).
  const lastCol = includeEnd ? colEnd : colEnd - 1;

  if (!visualActive) {
    if (lastCol < colStart) return { kind: 'operator', startCol: colStart, endCol: colStart - 1, isEmpty: true };
    return { kind: 'operator', startCol: colStart, endCol: lastCol, isEmpty: false };
  }

  if (visEmpty || visBefCurs) {
    const resetAnchor =
      visEmpty ||
      (visBefCurs &&
        !selectedQuote &&
        (insideQuotes || (line[anchor] !== quote && (anchor === 0 || line[anchor - 1] !== quote))));
    return { kind: 'visual', anchorCol: resetAnchor ? colStart : undefined, cursorCol: lastCol };
  }
  // 커서가 선택 앞쪽 끝: 앵커를 끝으로 옮기고 커서를 시작으로 둡니다.
  let newAnchor: number | undefined;
  if (insideQuotes || (!selectedQuote && line[anchor] !== quote && (line[anchor] === undefined || line[anchor + 1] !== quote))) {
    newAnchor = lastCol;
  }
  return { kind: 'visual', anchorCol: newAnchor, cursorCol: colStart };
}
