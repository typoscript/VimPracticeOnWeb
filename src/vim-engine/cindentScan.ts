/**
 * C 들여쓰기(`=` 연산자, Vim cindent) 의 문자열·괄호 탐색 도우미.
 *
 * Neovim `src/nvim/indent_c.c` 와 `search.c` 의 `findmatchlimit()` 를 그대로 옮긴 것입니다.
 * C 의 문자열 포인터는 (문자열, 인덱스) 쌍으로 다루며, 인덱스가 문자열 길이 이상이면 NUL 로 봅니다.
 * 줄 번호(lnum)는 Vim 처럼 1부터, 열(col)은 0부터 셉니다.
 */

export const MAXCOL = 0x7fffffff;

export interface CPos {
  lnum: number;
  col: number;
}

/** s[i] (범위 밖이면 NUL 대신 빈 문자열) */
export function ch(s: string, i: number): string {
  return i >= 0 && i < s.length ? s[i] : '';
}

export function isWhite(c: string): boolean {
  return c === ' ' || c === '\t';
}

export function skipwhite(s: string, i: number): number {
  while (i < s.length && isWhite(s[i])) i++;
  return i;
}

export function skiptowhite(s: string, i: number): number {
  while (i < s.length && !isWhite(s[i])) i++;
  return i;
}

export function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

/** 'isident' / 'iskeyword' 기본값 "@,48-57,_,192-255" */
export function isIDc(c: string): boolean {
  if (!c) return false;
  const code = c.charCodeAt(0);
  if (code >= 256) return true;
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code >= 192
  );
}

/** 문자열 "..." 과 문자 상수 'c' 의 끝(닫는 따옴표)으로 건너뜁니다. 문자열이 아니면 그대로 돌려줍니다. */
export function skipString(s: string, p: number): number {
  for (;; p++) {
    if (ch(s, p) === "'") {
      if (ch(s, p + 1) === '') break;
      let i = 2;
      if (ch(s, p + 1) === '\\' && ch(s, p + 2) !== '') {
        i++;
        while (isDigit(ch(s, p + i - 1))) i++;
      }
      if (ch(s, p + i - 1) !== '' && ch(s, p + i) === "'") {
        p += i;
        continue;
      }
    } else if (ch(s, p) === '"') {
      for (++p; ch(s, p) !== ''; p++) {
        if (ch(s, p) === '\\' && ch(s, p + 1) !== '') {
          p++;
        } else if (ch(s, p) === '"') {
          break;
        }
      }
      if (ch(s, p) === '"') continue;
    } else if (ch(s, p) === 'R' && ch(s, p + 1) === '"') {
      const delimStart = p + 2;
      const paren = s.indexOf('(', delimStart);
      if (paren >= 0) {
        const delim = s.slice(delimStart, paren);
        for (p += 3; ch(s, p) !== ''; p++) {
          if (ch(s, p) === ')' && s.startsWith(delim, p + 1) && ch(s, p + delim.length + 1) === '"') {
            p += delim.length + 1;
            break;
          }
        }
        if (ch(s, p) === '"') continue;
      }
    }
    break;
  }
  if (ch(s, p) === '') p--;
  return p;
}

export function isPosInString(line: string, col: number): boolean {
  let p = 0;
  for (; ch(line, p) !== '' && p < col; p++) {
    p = skipString(line, p);
  }
  return !(p <= col);
}

/** 공백과 C 주석을 건너뜁니다. */
export function cinSkipcomment(s: string, i: number): number {
  while (i < s.length) {
    i = skipwhite(s, i);
    if (ch(s, i) !== '/') break;
    i++;
    if (ch(s, i) === '/') {
      i = s.length;
      break;
    }
    if (ch(s, i) !== '*') break;
    for (++i; i < s.length; i++) {
      if (s[i] === '*' && ch(s, i + 1) === '/') {
        i += 2;
        break;
      }
    }
  }
  return i;
}

export function cinNocode(s: string, i: number): boolean {
  return cinSkipcomment(s, i) >= s.length;
}

export function cinIscomment(s: string, i: number): boolean {
  return ch(s, i) === '/' && (ch(s, i + 1) === '*' || ch(s, i + 1) === '/');
}

export function cinIslinecomment(s: string, i: number): boolean {
  return ch(s, i) === '/' && ch(s, i + 1) === '/';
}

/** 줄 안 `//` 주석의 시작 열 (문자열 안은 무시). 없으면 MAXCOL. */
export function checkLinecomment(line: string): number {
  let p = line.indexOf('/');
  while (p >= 0) {
    if (ch(line, p + 1) === '/' && (p === 0 || line[p - 1] !== '*' || ch(line, p + 2) !== '*') && !isPosInString(line, p)) {
      return p;
    }
    p = line.indexOf('/', p + 1);
  }
  return MAXCOL;
}

/** `s` 가 `find` 로 끝나는지 (뒤에 공백·주석만 허용). */
export function cinEndsIn(s: string, i: number, find: string, ignore?: string): boolean {
  let p = i;
  while (p < s.length) {
    p = cinSkipcomment(s, p);
    if (s.startsWith(find, p)) {
      let r = skipwhite(s, p + find.length);
      if (ignore !== undefined && s.startsWith(ignore, r)) r = skipwhite(s, r + ignore.length);
      if (cinNocode(s, r)) return true;
    }
    if (p < s.length) p++;
  }
  return false;
}

export function cinStartsWith(s: string, i: number, word: string): boolean {
  return s.startsWith(word, i) && !isIDc(ch(s, i + word.length));
}

function charWidth(c: string): number {
  const code = c.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

const PAIRS: Record<string, { other: string; open: boolean }> = {
  '(': { other: ')', open: true },
  ')': { other: '(', open: false },
  '{': { other: '}', open: true },
  '}': { other: '{', open: false },
  '[': { other: ']', open: true },
  ']': { other: '[', open: false },
};

export interface FindMatchFlags {
  backward?: boolean;
  blockstop?: boolean;
}

/**
 * 버퍼와 커서 (Vim 의 curbuf / curwin->w_cursor).
 * 탐색 함수들은 C 원본처럼 커서를 기준으로 동작하고 커서를 원래대로 돌려 놓습니다.
 */
export class CBuffer {
  cur: CPos = { lnum: 1, col: 0 };

  constructor(
    public lines: string[],
    public ts: number,
    public maxparen = 20,
    public maxcomment = 70
  ) {}

  get lineCount(): number {
    return this.lines.length;
  }

  ml(lnum: number): string {
    return this.lines[lnum - 1] ?? '';
  }

  curLine(): string {
    return this.ml(this.cur.lnum);
  }

  /** 줄 안 열 `col` 의 화면 열 (탭은 'tabstop'). */
  getvcol(pos: CPos): number {
    const line = this.ml(pos.lnum);
    let vcol = 0;
    for (let i = 0; i < pos.col && i < line.length; i++) {
      const c = line[i];
      if (c === '\t') vcol += this.ts - (vcol % this.ts);
      else vcol += charWidth(c);
    }
    return vcol;
  }

  getIndentLnum(lnum: number): number {
    const line = this.ml(lnum);
    return this.getvcol({ lnum, col: skipwhite(line, 0) });
  }

  getIndent(): number {
    return this.getIndentLnum(this.cur.lnum);
  }

  linewhite(lnum: number): boolean {
    const line = this.ml(lnum);
    return skipwhite(line, 0) >= line.length;
  }

  /** Vim `findmatchlimit()` (matchpairs 기본값, cpoptions 에 % 없음). */
  findmatchlimit(initcIn: string, flags: FindMatchFlags, maxtravel: number): CPos | null {
    const pos: CPos = { ...this.cur };
    let linep = this.ml(pos.lnum);
    let initc = initcIn;
    let findc = '';
    let count = 0;
    let backwards = false;
    let inquote = false;
    let commentDir = 0;
    let traveled = 0;
    let matchEscaped = 0;
    let commentCol = MAXCOL;

    if (initc === '*') {
      commentDir = flags.backward ? -1 : 0;
      backwards = true;
      initc = '';
    } else if (initc !== '') {
      const pair = PAIRS[initc];
      if (!pair) return null;
      findc = initc;
      initc = pair.other;
      backwards = pair.open;
    } else {
      // 커서 아래 또는 뒤의 괄호를 찾습니다.
      if (pos.col >= linep.length && pos.col) pos.col--;
      for (;;) {
        const c = ch(linep, pos.col);
        if (c === '') break;
        const pair = PAIRS[c];
        if (pair) {
          initc = c;
          findc = pair.other;
          backwards = !pair.open;
          break;
        }
        pos.col++;
      }
      if (!findc) return null;
      let bslcnt = 0;
      for (let col = pos.col - 1; col >= 0 && linep[col] === '\\'; col--) bslcnt++;
      matchEscaped = bslcnt & 1;
    }

    let doQuotes = -1;
    let atStart = 0;
    // -1: 모름(kNone), 0: 거짓, 1: 참
    let startInQuotes = -1;
    let matchPos: CPos = { lnum: 0, col: 0 };

    if (backwards && commentDir) {
      commentCol = checkLinecomment(linep);
    }

    for (;;) {
      if (backwards) {
        if (pos.col === 0) {
          if (pos.lnum === 1) break;
          pos.lnum--;
          if (maxtravel > 0 && ++traveled > maxtravel) break;
          linep = this.ml(pos.lnum);
          pos.col = linep.length;
          doQuotes = -1;
          if (commentDir) commentCol = checkLinecomment(linep);
        } else {
          pos.col--;
        }
      } else if (pos.col >= linep.length) {
        if (pos.lnum === this.lineCount) break;
        pos.lnum++;
        if (maxtravel && traveled++ > maxtravel) break;
        linep = this.ml(pos.lnum);
        pos.col = 0;
        doQuotes = -1;
      } else {
        pos.col++;
      }

      if (pos.col === 0 && flags.blockstop && (ch(linep, 0) === '{' || ch(linep, 0) === '}')) {
        if (linep[0] === findc && count === 0) return pos;
        break;
      }

      if (commentDir) {
        if (pos.col === 0) continue;
        if (
          linep[pos.col - 1] === '/' &&
          ch(linep, pos.col) === '*' &&
          (pos.col === 1 || linep[pos.col - 2] !== '*') &&
          pos.col < commentCol
        ) {
          count++;
          matchPos = { lnum: pos.lnum, col: pos.col - 1 };
        } else if (linep[pos.col - 1] === '*' && ch(linep, pos.col) === '/') {
          if (count > 0) {
            return { ...matchPos };
          } else if (pos.col > 1 && linep[pos.col - 2] === '/' && pos.col <= commentCol) {
            pos.col -= 2;
            return pos;
          }
          return null;
        }
        continue;
      }

      if (doQuotes === -1) {
        atStart = doQuotes;
        let p = 0;
        for (; p < linep.length; p++) {
          if (p === pos.col + (backwards ? 1 : 0)) atStart = doQuotes & 1;
          if (linep[p] === '"' && (p === 0 || linep[p - 1] !== "'" || ch(linep, p + 1) !== "'")) doQuotes++;
          if (linep[p] === '\\' && p + 1 < linep.length) p++;
        }
        doQuotes &= 1;
        if (!doQuotes) {
          inquote = false;
          if (ch(linep, p - 1) === '\\') {
            doQuotes = 1;
            if (startInQuotes === -1) {
              inquote = !!atStart;
              if (inquote) startInQuotes = 1;
            } else if (backwards) {
              inquote = true;
            }
          }
          if (pos.lnum > 1) {
            const prev = this.ml(pos.lnum - 1);
            if (prev.length > 0 && prev[prev.length - 1] === '\\') {
              doQuotes = 1;
              if (startInQuotes === -1) {
                inquote = !!atStart;
                if (inquote) startInQuotes = 1;
              } else if (!backwards) {
                inquote = true;
              }
            }
          }
        }
      }
      if (startInQuotes === -1) startInQuotes = 0;

      const c = ch(linep, pos.col);
      if (c === '') {
        if (pos.col === 0 || linep[pos.col - 1] !== '\\') {
          inquote = false;
          startInQuotes = 0;
        }
        continue;
      }
      if (c === '"') {
        if (doQuotes) {
          let col = pos.col - 1;
          for (; col >= 0; col--) {
            if (linep[col] !== '\\') break;
          }
          if (((pos.col - 1 - col) & 1) === 0) {
            inquote = !inquote;
            startInQuotes = 0;
          }
        }
        continue;
      }
      if (c === "'") {
        if (backwards) {
          if (pos.col > 1) {
            if (linep[pos.col - 2] === "'") {
              pos.col -= 2;
              continue;
            } else if (linep[pos.col - 2] === '\\' && pos.col > 2 && linep[pos.col - 3] === "'") {
              pos.col -= 3;
              continue;
            }
          }
        } else if (ch(linep, pos.col + 1) !== '') {
          if (linep[pos.col + 1] === '\\' && ch(linep, pos.col + 2) !== '' && ch(linep, pos.col + 3) === "'") {
            pos.col += 3;
            continue;
          } else if (ch(linep, pos.col + 2) === "'") {
            pos.col += 2;
            continue;
          }
        }
      }
      if ((!inquote || startInQuotes === 1) && (c === initc || c === findc)) {
        let bslcnt = 0;
        for (let col = pos.col - 1; col >= 0 && linep[col] === '\\'; col--) bslcnt++;
        if ((bslcnt & 1) === matchEscaped) {
          if (c === initc) {
            count++;
          } else {
            if (count === 0) return pos;
            count--;
          }
        }
      }
    }

    if (commentDir === -1 && count > 0) return { ...matchPos };
    return null;
  }

  /** 커서가 /* *\/ 주석 안이면 주석 시작 위치. */
  findStartComment(): CPos | null {
    let curMax = this.maxcomment;
    for (;;) {
      const pos = this.findmatchlimit('*', { backward: true }, curMax);
      if (pos === null) return null;
      if (!isPosInString(this.ml(pos.lnum), pos.col)) return pos;
      curMax = this.cur.lnum - pos.lnum - 1;
      if (curMax <= 0) return null;
    }
  }

  /** 주석(또는 raw string) 시작. raw string 은 다루지 않습니다. */
  findStartCORS(): CPos | null {
    return this.findStartComment();
  }

  /** 줄 처음부터 trypos 까지 문자열·주석을 건너뛴 열. trypos 보다 크면 trypos 는 문자열/주석 안. */
  cinSkip2pos(trypos: CPos): number {
    const line = this.ml(trypos.lnum);
    let p = 0;
    while (p < line.length && p < trypos.col) {
      if (cinIscomment(line, p)) {
        p = cinSkipcomment(line, p);
      } else {
        const np = skipString(line, p);
        p = np === p ? p + 1 : np;
      }
    }
    return p;
  }

  /** 지금 블록을 연 '{' 위치. */
  findStartBrace(): CPos | null {
    const save = { ...this.cur };
    let trypos: CPos | null;
    while ((trypos = this.findmatchlimit('{', { blockstop: true }, 0)) !== null) {
      trypos = { ...trypos };
      this.cur = { ...trypos };
      let pos: CPos | null = null;
      if (this.cinSkip2pos(trypos) === trypos.col && (pos = this.findStartCORS()) === null) break;
      if (pos !== null) this.cur = { ...pos };
    }
    this.cur = save;
    return trypos;
  }

  findMatchParen(maxparen: number): CPos | null {
    return this.findMatchChar('(', maxparen);
  }

  findMatchChar(c: string, maxparen: number): CPos | null {
    const save = { ...this.cur };
    let wk = maxparen;
    let trypos: CPos | null;
    for (;;) {
      trypos = this.findmatchlimit(c, {}, wk);
      if (trypos === null) break;
      if (this.cinSkip2pos(trypos) > trypos.col) {
        wk = maxparen - (save.lnum - trypos.lnum);
        if (wk > 0) {
          this.cur = { lnum: trypos.lnum, col: 0 };
          continue;
        }
        trypos = null;
        break;
      }
      trypos = { ...trypos };
      this.cur = { ...trypos };
      const wkPos = this.findStartCORS();
      if (wkPos !== null) {
        wk = maxparen - (save.lnum - wkPos.lnum);
        if (wk > 0) {
          this.cur = { ...wkPos };
          continue;
        }
        trypos = null;
      }
      break;
    }
    this.cur = save;
    return trypos;
  }

  findMatchParenAfterBrace(maxparen: number): CPos | null {
    let trypos = this.findMatchParen(maxparen);
    if (trypos === null) return null;
    const brace = this.findStartBrace();
    if (
      brace !== null &&
      (trypos.lnum !== brace.lnum ? trypos.lnum < brace.lnum : trypos.col < brace.col)
    ) {
      trypos = null;
    }
    return trypos;
  }

  corrIndMaxparen(startpos: CPos): number {
    const n = startpos.lnum - this.cur.lnum;
    if (n > 0 && n < this.maxparen / 2) return this.maxparen - n;
    return this.maxparen;
  }

  /** 줄에서 짝 없는 마지막 `end` 문자에 커서 열을 둡니다. 찾으면 true. */
  findLastParen(l: string, start: string, end: string): boolean {
    let retval = false;
    let open = 0;
    this.cur.col = 0;
    for (let i = 0; i < l.length; i++) {
      i = cinSkipcomment(l, i);
      i = skipString(l, i);
      const c = ch(l, i);
      if (c === start) {
        open++;
      } else if (c === end) {
        if (open > 0) {
          open--;
        } else {
          this.cur.col = i;
          retval = true;
        }
      }
    }
    return retval;
  }
}
