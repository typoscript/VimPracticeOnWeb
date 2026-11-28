/**
 * C 들여쓰기 판정 함수 모음 (Neovim `indent_c.c` 의 cin_* 함수 이식).
 * 문자열 인자는 C 포인터가 가리키는 위치부터의 부분 문자열입니다.
 */
import {
  CBuffer,
  CPos,
  ch,
  cinEndsIn,
  cinIscomment,
  cinNocode,
  cinSkipcomment,
  cinStartsWith,
  isIDc,
  isWhite,
  skipString,
  skiptowhite,
  skipwhite,
} from './cindentScan';

/** 'cinoptions' 기본값을 shiftwidth 로 풀어 둔 값 */
export interface Cino {
  level: number;
  openImag: number;
  noBrace: number;
  firstOpen: number;
  openExtra: number;
  closeExtra: number;
  openLeftImag: number;
  case: number;
  caseCode: number;
  scopedecl: number;
  scopedeclCode: number;
  param: number;
  funcType: number;
  cppBaseclass: number;
  continuation: number;
  unclosed: number;
  unclosed2: number;
  inComment: number;
  maxparen: number;
  /** 'comments' (없으면 Vim 기본값). 주석 안 줄의 세 부분 주석 정렬에 씁니다. */
  comments?: string;
}

export function defaultCino(sw: number): Cino {
  return {
    level: sw,
    openImag: 0,
    noBrace: 0,
    firstOpen: 0,
    openExtra: 0,
    closeExtra: 0,
    openLeftImag: 0,
    case: sw,
    caseCode: sw,
    scopedecl: sw,
    scopedeclCode: sw,
    param: sw,
    funcType: sw,
    cppBaseclass: sw,
    continuation: sw,
    unclosed: sw * 2,
    unclosed2: sw,
    inComment: 3,
    maxparen: 20,
  };
}

/** cin_skipcomment 뒤의 부분 문자열 */
export function sk(s: string): string {
  return s.slice(cinSkipcomment(s, 0));
}

/** skipwhite 뒤의 부분 문자열 */
export function sw(s: string): string {
  return s.slice(skipwhite(s, 0));
}

const CINWORDS = ['if', 'else', 'while', 'do', 'for', 'switch'];
const SCOPEDECLS = ['public', 'protected', 'private'];

export function cinIsCinword(line: string): boolean {
  const l = sw(line);
  for (const w of CINWORDS) {
    if (l.startsWith(w) && (!isIDc(ch(l, w.length)) || !isIDc(ch(l, w.length - 1)))) return true;
  }
  return false;
}

export function cinIsif(p: string): boolean {
  return p.startsWith('if') && !isIDc(ch(p, 2));
}

export function cinIselse(p: string): boolean {
  if (p[0] === '}') p = sk(p.slice(1));
  return p.startsWith('else') && !isIDc(ch(p, 4));
}

export function cinIsdo(p: string): boolean {
  return p.startsWith('do') && !isIDc(ch(p, 2));
}

export function cinIspreproc(s: string): boolean {
  return ch(s, skipwhite(s, 0)) === '#';
}

export function cinIsdefault(s: string): boolean {
  if (!s.startsWith('default')) return false;
  const i = cinSkipcomment(s, 7);
  return ch(s, i) === ':' && ch(s, i + 1) !== ':';
}

export function cinIsscopedecl(p: string): boolean {
  const s = sk(p);
  for (const w of SCOPEDECLS) {
    if (s.startsWith(w)) {
      const i = cinSkipcomment(s, w.length);
      if (ch(s, i) === ':' && ch(s, i + 1) !== ':') return true;
    }
  }
  return false;
}

export function cinIscase(p: string, strict: boolean): boolean {
  const s = sk(p);
  if (cinStartsWith(s, 0, 'case')) {
    for (let i = 4; i < s.length; i++) {
      i = cinSkipcomment(s, i);
      if (i >= s.length) break;
      if (s[i] === ':') {
        if (ch(s, i + 1) === ':') i++;
        else return true;
      }
      if (s[i] === "'" && ch(s, i + 1) !== '' && ch(s, i + 2) === "'") {
        i += 2;
      } else if (s[i] === '/' && (ch(s, i + 1) === '*' || ch(s, i + 1) === '/')) {
        return false;
      } else if (s[i] === '"') {
        return !strict;
      }
    }
    return false;
  }
  return cinIsdefault(s);
}

/** "label:" 이면 ':' 다음 인덱스, 아니면 -1 */
export function cinIslabelSkip(s: string, i: number): number {
  if (!isIDc(ch(s, i))) return -1;
  while (isIDc(ch(s, i))) i++;
  i = cinSkipcomment(s, i);
  if (ch(s, i) === ':' && ch(s, i + 1) !== ':') return i + 1;
  return -1;
}

/** 커서 줄이 점프 레이블("label:")인지 */
export function cinIslabel(b: CBuffer): boolean {
  const line = b.curLine();
  const s = sk(line);
  if (cinIsdefault(s)) return false;
  if (cinIsscopedecl(s)) return false;
  if (cinIslabelSkip(s, 0) < 0) return false;

  const save = { ...b.cur };
  while (b.cur.lnum > 1) {
    b.cur.lnum--;
    b.cur.col = 0;
    const t = b.findStartCORS();
    if (t) b.cur = { ...t };
    const l2 = b.curLine();
    if (cinIspreproc(l2)) continue;
    const p = sk(l2);
    if (p === '') continue;
    b.cur = save;
    if (cinIsterminated(p, true, false) || cinIsscopedecl(p) || cinIscase(p, true)) return true;
    const q = cinIslabelSkip(p, 0);
    return q >= 0 && cinNocode(p, q);
  }
  b.cur = save;
  return true;
}

/** ';' '}' (선택적으로 '{' ',') 로 끝나는 줄이면 그 문자, 아니면 '' */
export function cinIsterminated(str: string, inclOpen: boolean, inclComma: boolean): string {
  let found = '';
  let nOpen = 0;
  let isElse = false;
  let i = cinSkipcomment(str, 0);
  const first = ch(str, i);
  if (first === '{' || (first === '}' && !cinIselse(str.slice(i)))) found = first;
  if (!found) isElse = cinIselse(str.slice(i));

  while (ch(str, i) !== '') {
    i = skipString(str, cinSkipcomment(str, i));
    const c = ch(str, i);
    if (c === '}' && nOpen > 0) nOpen--;
    if ((!isElse || nOpen === 0) && (c === ';' || c === '}' || (inclComma && c === ',')) && cinNocode(str, i + 1)) {
      return c;
    } else if (c === '{') {
      if (inclOpen && cinNocode(str, i + 1)) return c;
      nOpen++;
    }
    if (c !== '') i++;
  }
  return found;
}

/** ':' 다음 첫 코드 문자 (case 234:  a = b;) 의 부분 문자열, 없으면 null */
export function afterLabel(l: string): string | null {
  let i = 0;
  for (; i < l.length; i++) {
    if (l[i] === ':') {
      if (ch(l, i + 1) === ':') i++;
      else if (!cinIscase(l.slice(i + 1), false)) break;
    } else if (l[i] === "'" && ch(l, i + 1) !== '' && ch(l, i + 2) === "'") {
      i += 2;
    }
  }
  if (i >= l.length) return null;
  const j = cinSkipcomment(l, i + 1);
  if (j >= l.length) return null;
  return l.slice(j);
}

function afterLabelIndex(l: string): number {
  const rest = afterLabel(l);
  return rest === null ? -1 : l.length - rest.length;
}

export function getIndentNolabel(b: CBuffer, lnum: number): number {
  const l = b.ml(lnum);
  const p = afterLabelIndex(l);
  if (p < 0) return 0;
  return b.getvcol({ lnum, col: p });
}

/** 레이블을 건너뛴 들여쓰기와, 레이블 뒤 본문 (줄 문자열과 인덱스) */
export function skipLabel(b: CBuffer, lnum: number): { amount: number; line: string; idx: number } {
  const save = { ...b.cur };
  b.cur.lnum = lnum;
  const l = b.curLine();
  let amount: number;
  let idx = 0;
  if (cinIscase(l, false) || cinIsscopedecl(l) || cinIslabel(b)) {
    amount = getIndentNolabel(b, lnum);
    const p = afterLabelIndex(l);
    idx = p < 0 ? 0 : p;
  } else {
    amount = b.getIndent();
  }
  b.cur = save;
  return { amount, line: l, idx };
}

export function cinFirstIdAmount(b: CBuffer): number {
  const line = b.curLine();
  let p = skipwhite(line, 0);
  let len = skiptowhite(line, p) - p;
  const word = (n: number, w: string) => len === n && line.startsWith(w, p);
  if (word(6, 'static')) {
    p = skipwhite(line, p + 6);
    len = skiptowhite(line, p) - p;
  }
  if (word(6, 'struct')) {
    p = skipwhite(line, p + 6);
  } else if (word(4, 'enum')) {
    p = skipwhite(line, p + 4);
  } else if (word(8, 'unsigned') || word(6, 'signed')) {
    const s = skipwhite(line, p + len);
    if (
      (line.startsWith('int', s) && isWhite(ch(line, s + 3))) ||
      (line.startsWith('long', s) && isWhite(ch(line, s + 4))) ||
      (line.startsWith('short', s) && isWhite(ch(line, s + 5))) ||
      (line.startsWith('char', s) && isWhite(ch(line, s + 4)))
    ) {
      p = s;
    }
  }
  for (len = 0; isIDc(ch(line, p + len)); len++);
  if (len === 0 || !isWhite(ch(line, p + len)) || cinNocode(line, p)) return 0;
  p = skipwhite(line, p + len);
  return b.getvcol({ lnum: b.cur.lnum, col: p });
}

export function cinGetEqualAmount(b: CBuffer, lnum: number): number {
  if (lnum > 1) {
    const prev = b.ml(lnum - 1);
    if (prev.length > 0 && prev[prev.length - 1] === '\\') return -1;
  }
  const line = b.ml(lnum);
  let s = 0;
  while (s < line.length && !'=;{}"\''.includes(line[s])) {
    if (cinIscomment(line, s)) s = cinSkipcomment(line, s);
    else s++;
  }
  if (ch(line, s) !== '=') return 0;
  s = skipwhite(line, s + 1);
  if (cinNocode(line, s)) return 0;
  if (line[s] === '"') s++;
  return b.getvcol({ lnum, col: s });
}

/** cin_ispreproc_cont: 전처리 줄(또는 그 연속 줄)이면 시작 줄·들여쓰기를 돌려줍니다. */
export function preprocCont(
  b: CBuffer,
  line: string,
  lnum: number,
  amount: number
): { is: boolean; line: string; lnum: number; amount: number } {
  let cand = amount;
  if (line.length > 0 && line[line.length - 1] === '\\') cand = b.getIndentLnum(lnum);
  let l = line;
  let ln = lnum;
  for (;;) {
    if (cinIspreproc(l)) {
      return { is: true, line: ln !== lnum ? b.ml(ln) : line, lnum: ln, amount: cand };
    }
    if (ln === 1) break;
    l = b.ml(--ln);
    if (l.length === 0 || l[l.length - 1] !== '\\') break;
  }
  return { is: false, line, lnum, amount };
}

/** 커서 줄이 enum / 구조체 초기화인지 */
export function cinIsinit(b: CBuffer): boolean {
  let s = sk(b.curLine());
  if (cinStartsWith(s, 0, 'typedef')) s = sk(s.slice(7));
  for (;;) {
    let skipped = false;
    for (const w of ['static', 'public', 'protected', 'private']) {
      if (cinStartsWith(s, 0, w)) {
        s = sk(s.slice(w.length));
        skipped = true;
        break;
      }
    }
    if (!skipped) break;
  }
  if (cinStartsWith(s, 0, 'enum')) return true;
  return cinEndsIn(s, 0, '=', '{');
}

/** 함수 선언처럼 보이는지: 여는 괄호가 있고 닫는 괄호로 줄이 끝나며 ';' 가 없음 */
export function cinIsfuncdecl(b: CBuffer, sp: string | null, firstLnum: number, minLnum: number): boolean {
  let lnum = firstLnum;
  const saveLnum = b.cur.lnum;
  let s = sp ?? b.ml(lnum);
  b.cur.lnum = lnum;
  if (b.findLastParen(s, '(', ')')) {
    const t = b.findMatchParen(b.maxparen);
    if (t !== null) {
      lnum = t.lnum;
      if (lnum < minLnum) {
        b.cur.lnum = saveLnum;
        return false;
      }
      s = b.ml(lnum);
    }
  }
  b.cur.lnum = saveLnum;
  if (cinIspreproc(s)) return false;

  let i = 0;
  while (i < s.length && !'(;\'"'.includes(s[i])) {
    if (cinIscomment(s, i)) {
      i = cinSkipcomment(s, i);
    } else if (s[i] === ':') {
      if (ch(s, i + 1) === ':') i += 2;
      else return false;
    } else {
      i++;
    }
  }
  if (ch(s, i) !== '(') return false;

  let justStarted = true;
  while (i < s.length && !';\'"'.includes(s[i])) {
    if (s[i] === ')' && cinNocode(s, i + 1)) {
      const prev = b.ml(firstLnum - 1);
      return prev.length === 0 || prev[prev.length - 1] !== '\\';
    }
    if ((s[i] === ',' && cinNocode(s, i + 1)) || i + 1 >= s.length || cinNocode(s, i)) {
      const comma = s[i] === ',';
      for (;;) {
        if (lnum >= b.lineCount) break;
        s = b.ml(++lnum);
        if (!cinIspreproc(s)) break;
      }
      if (lnum >= b.lineCount) break;
      i = skipwhite(s, 0);
      if (!justStarted && !comma && ch(s, i) !== ',' && ch(s, i) !== ')') break;
      justStarted = false;
    } else if (cinIscomment(s, i)) {
      i = cinSkipcomment(s, i);
    } else {
      i++;
      justStarted = false;
    }
  }
  return false;
}

/** "while (cond);" 로 do 와 짝을 이루는 while 인지 */
export function cinIswhileofdo(b: CBuffer, p: string, lnum: number): boolean {
  let s = sk(p);
  if (s[0] === '}') s = sk(s.slice(1));
  if (!cinStartsWith(s, 0, 'while')) return false;
  const save = { ...b.cur };
  const line = b.ml(lnum);
  let col = 0;
  while (col < line.length && line[col] !== 'w') col++;
  b.cur = { lnum, col };
  const t = b.findmatchlimit('', {}, b.maxparen);
  const ok = t !== null && ch(b.ml(t.lnum), cinSkipcomment(b.ml(t.lnum), t.col + 1)) === ';';
  b.cur = save;
  return ok;
}

/** do-while 의 끝 "while (...);" 줄인지. 맞으면 커서를 while 줄로 옮깁니다. */
export function cinIswhileofdoEnd(b: CBuffer, terminated: string): boolean {
  if (terminated !== ';') return false;
  const line = b.curLine();
  let p = 0;
  while (p < line.length) {
    p = cinSkipcomment(line, p);
    if (ch(line, p) === ')') {
      const s = skipwhite(line, p + 1);
      if (ch(line, s) === ';' && cinNocode(line, s + 1)) {
        b.cur.col = p;
        const t = b.findMatchParen(b.maxparen);
        if (t !== null) {
          let w = sk(b.ml(t.lnum));
          if (w[0] === '}') w = sk(w.slice(1));
          if (cinStartsWith(w, 0, 'while')) {
            b.cur.lnum = t.lnum;
            return true;
          }
        }
      }
    }
    if (p < line.length) p++;
  }
  return false;
}

export interface BaseclassCache {
  found: boolean;
  lpos: CPos;
}

/** C++ 기반 클래스 선언/생성자 초기화 목록인지 (`class A :` / `A::A() :`) */
export function cinIsCppBaseclass(b: CBuffer, cached: BaseclassCache): boolean {
  const pos = cached.lpos;
  let lnum = b.cur.lnum;
  let line = b.curLine();
  if (pos.lnum <= lnum) return cached.found;
  pos.col = 0;

  let si = skipwhite(line, 0);
  if (ch(line, si) === '#') return false;
  si = cinSkipcomment(line, si);
  if (si >= line.length) return false;

  let cppBaseClass = false;
  let lookforCtorInit = false;
  let classOrStruct = false;

  while (lnum > 1) {
    line = b.ml(lnum - 1);
    let s = skipwhite(line, 0);
    if (ch(line, s) === '#' || s >= line.length) break;
    while (s < line.length) {
      s = cinSkipcomment(line, s);
      const c = ch(line, s);
      if (c === '{' || c === '}' || (c === ';' && cinNocode(line, s + 1))) break;
      if (s < line.length) s++;
    }
    if (s < line.length) break;
    lnum--;
  }

  pos.lnum = lnum;
  line = b.ml(lnum);
  let s = 0;
  for (;;) {
    if (s >= line.length) {
      if (lnum === b.cur.lnum) break;
      line = b.ml(++lnum);
      s = 0;
    }
    if (s === 0) {
      if (cinIscase(line, false)) break;
      s = cinSkipcomment(line, 0);
      if (s >= line.length) continue;
    }
    const c = line[s];
    if (c === '"' || (c === 'R' && ch(line, s + 1) === '"')) {
      s = skipString(line, s) + 1;
    } else if (c === ':') {
      if (ch(line, s + 1) === ':') {
        lookforCtorInit = false;
        s = cinSkipcomment(line, s + 2);
      } else if (lookforCtorInit || classOrStruct) {
        cppBaseClass = true;
        lookforCtorInit = classOrStruct = false;
        pos.col = 0;
        s = cinSkipcomment(line, s + 1);
      } else {
        s = cinSkipcomment(line, s + 1);
      }
    } else if (
      (line.startsWith('class', s) && !isIDc(ch(line, s + 5))) ||
      (line.startsWith('struct', s) && !isIDc(ch(line, s + 6)))
    ) {
      classOrStruct = true;
      lookforCtorInit = false;
      s = cinSkipcomment(line, s + (c === 'c' ? 5 : 6));
    } else {
      if (c === '{' || c === '}' || c === ';') {
        cppBaseClass = lookforCtorInit = classOrStruct = false;
      } else if (c === ')') {
        classOrStruct = false;
        lookforCtorInit = true;
      } else if (c === '?') {
        return false;
      } else if (!isIDc(c)) {
        classOrStruct = false;
        lookforCtorInit = false;
      } else if (pos.col === 0) {
        lookforCtorInit = false;
        if (cppBaseClass) pos.col = s;
      }
      if (lnum === b.cur.lnum && c === ',' && cinNocode(line, s + 1)) pos.col = 0;
      s = cinSkipcomment(line, s + 1);
    }
  }

  cached.found = cppBaseClass;
  if (cppBaseClass) pos.lnum = lnum;
  return cppBaseClass;
}

export function getBaseclassAmount(b: CBuffer, o: Cino, col: number): number {
  let amount: number;
  if (col === 0) {
    amount = b.getIndent();
    if (b.findLastParen(b.curLine(), '(', ')')) {
      const t = b.findMatchParen(o.maxparen);
      if (t !== null) amount = b.getIndentLnum(t.lnum);
    }
    if (!cinEndsIn(b.curLine(), 0, ',')) amount += o.cppBaseclass;
  } else {
    b.cur.col = col;
    amount = b.getvcol(b.cur);
  }
  if (amount < o.cppBaseclass) amount = o.cppBaseclass;
  return amount;
}

export const LOOKFOR_IF = 1;
export const LOOKFOR_DO = 2;

/** else 에 맞는 if, while 에 맞는 do 를 찾습니다. 찾으면 커서가 그 줄에 있습니다. */
export function findMatch(b: CBuffer, lookfor: number, ourscope: number): boolean {
  let elselevel = lookfor === LOOKFOR_IF ? 1 : 0;
  let whilelevel = lookfor === LOOKFOR_IF ? 0 : 1;
  b.cur.col = 0;
  while (b.cur.lnum > ourscope + 1) {
    b.cur.lnum--;
    b.cur.col = 0;
    let look = sk(b.curLine());
    if (!cinIselse(look) && !cinIsif(look) && !cinIsdo(look) && !cinIswhileofdo(b, look, b.cur.lnum)) continue;

    const theirscope = b.findStartBrace();
    if (theirscope === null) break;
    if (theirscope.lnum < ourscope) break;
    if (theirscope.lnum > ourscope) continue;

    look = sk(b.curLine());
    if (cinIselse(look)) {
      const mightbeif = sk(look.slice(4));
      if (!cinIsif(mightbeif)) elselevel++;
      continue;
    }
    if (cinIswhileofdo(b, look, b.cur.lnum)) {
      whilelevel++;
      continue;
    }
    if (cinIsif(look)) {
      elselevel--;
      if (elselevel === 0 && lookfor === LOOKFOR_IF) whilelevel = 0;
    }
    if (cinIsdo(look)) whilelevel--;
    if (elselevel <= 0 && whilelevel <= 0) return true;
  }
  return false;
}
