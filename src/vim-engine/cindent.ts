/**
 * `=` 연산자의 C 들여쓰기 (Vim cindent).
 *
 * 'equalprg'·'indentexpr' 가 비어 있고 'lisp' 가 꺼진 Vim/Neovim 의 `=` 는 C 들여쓰기 규칙을 씁니다
 * ('cindent' 옵션과 무관). Neovim `src/nvim/indent_c.c` 의 `get_c_indent()` 를 기본 'cinoptions'·
 * 'cinwords'·'comments' 값 기준으로 옮겼습니다. 빠진 것: raw string(R"(...)") 안 판정,
 * C++ namespace / extern "C" 탐색(기본값에서는 들여쓰기에 영향 없음), 'cinoptions' 사용자 설정.
 * 기준 소스는 이 컴퓨터의 nvim(v0.12.0-dev, 2025-07 의 indent_c.c)입니다. 그 뒤 Neovim 에 들어온
 * 패치(9.1.1626 `return {` 복합 리터럴, 9.2.0447 FM_SKIPCOMM 주석 속 괄호 무시 등)는 넣지 않았습니다.
 */
import {
  CBuffer,
  CPos,
  MAXCOL,
  ch,
  checkLinecomment,
  cinEndsIn,
  cinIscomment,
  cinIslinecomment,
  cinNocode,
  isWhite,
  skipwhite,
} from './cindentScan';
import {
  BaseclassCache,
  Cino,
  LOOKFOR_DO,
  LOOKFOR_IF,
  afterLabel,
  cinFirstIdAmount,
  cinGetEqualAmount,
  cinIsCinword,
  cinIsCppBaseclass,
  cinIscase,
  cinIsdo,
  cinIselse,
  cinIsfuncdecl,
  cinIsinit,
  cinIslabel,
  cinIsscopedecl,
  cinIsterminated,
  cinIswhileofdo,
  cinIswhileofdoEnd,
  defaultCino,
  findMatch,
  getBaseclassAmount,
  getIndentNolabel,
  preprocCont,
  sk,
  skipLabel,
  sw,
} from './cindentRules';

const BRACE_IN_COL0 = 1;
const BRACE_AT_START = 2;
const BRACE_AT_END = 3;

const LOOKFOR_INITIAL = 0;
const LOOKFOR_CASE = 3;
const LOOKFOR_ANY = 4;
const LOOKFOR_TERM = 5;
const LOOKFOR_UNTERM = 6;
const LOOKFOR_SCOPEDECL = 7;
const LOOKFOR_CPP_BASECLASS = 9;
const LOOKFOR_ENUM_OR_INIT = 10;

function lastChar(s: string): string {
  return s.length > 0 ? s[s.length - 1] : '';
}

/** 이전 줄들에서 빈 줄을 건너뛰고 "//" 주석 줄을 찾습니다. */
function findLineComment(b: CBuffer): CPos | null {
  for (let lnum = b.cur.lnum - 1; lnum > 0; lnum--) {
    const line = b.ml(lnum);
    const p = skipwhite(line, 0);
    if (cinIslinecomment(line, p)) return { lnum, col: p };
    if (p < line.length) break;
  }
  return null;
}

/** Vim 'comments' 기본값 (cindent 가 세 부분 주석 정렬에 쓰는 부분). */
export const DEFAULT_COMMENTS = 's1:/*,mb:*,ex:*/,://,b:#,:%,:XCOMM,n:>,fb:-';

interface CommentPart {
  what: string;
  align: string;
  off: number;
  text: string;
}

function parseComments(comments: string): CommentPart[] {
  const parts: CommentPart[] = [];
  let i = 0;
  while (i < comments.length) {
    let what = '';
    let align = '';
    let off = 0;
    while (i < comments.length && comments[i] !== ':') {
      const c = comments[i];
      if (c === 's' || c === 'e' || c === 'm') {
        what = c;
        i++;
      } else if (c === 'l' || c === 'r') {
        align = c;
        i++;
      } else if (/[-0-9]/.test(c)) {
        const m = /^-?\d*/.exec(comments.slice(i))![0];
        off = Number(m) || 0;
        i += Math.max(1, m.length);
      } else {
        i++;
      }
    }
    if (comments[i] === ':') i++;
    let text = '';
    while (i < comments.length && comments[i] !== ',') {
      if (comments[i] === '\\' && i + 1 < comments.length) i++;
      text += comments[i++];
    }
    if (comments[i] === ',') i++;
    parts.push({ what, align, off, text });
  }
  return parts;
}

/** /* 주석 안의 줄: Vim get_c_indent 의 'comments' 세 부분(s/m/e) 정렬 */
function commentLineIndent(b: CBuffer, o: Cino, theline: string, commentPos: CPos, curLnum: number): number {
  let amount = b.getvcol(commentPos);
  // Vim 은 s/m 부분을 만나기 전 빈 문자열을 길이 2·1 로 비교하므로 아무 줄과도 맞지 않습니다.
  let leadStart = '\0\0';
  let leadMiddle = '\0';
  let startOff = 0;
  let startAlign = '';
  let done = false;
  for (const part of parseComments(o.comments ?? DEFAULT_COMMENTS)) {
    if (part.what === 's') {
      leadStart = part.text;
      startOff = part.off;
      startAlign = part.align;
    } else if (part.what === 'm') {
      leadMiddle = part.text;
    } else if (part.what === 'e') {
      const leadEnd = part.text;
      if (theline.startsWith(leadMiddle) && !theline.startsWith(leadEnd)) {
        done = true;
        if (b.cur.lnum > 1) {
          const look = sw(b.ml(b.cur.lnum - 1));
          if (look.startsWith(leadStart)) {
            amount = b.getIndentLnum(b.cur.lnum - 1);
          } else if (look.startsWith(leadMiddle)) {
            amount = b.getIndentLnum(b.cur.lnum - 1);
            break;
          } else if (!b.ml(commentPos.lnum).startsWith(leadStart, commentPos.col)) {
            continue;
          }
        }
        if (startOff !== 0) amount += startOff;
        else if (startAlign === 'r') amount += leadStart.length - leadMiddle.length;
        break;
      }
      if (!theline.startsWith(leadMiddle) && theline.startsWith(leadEnd)) {
        amount = b.getIndentLnum(b.cur.lnum - 1);
        if (part.off !== 0) amount += part.off;
        else if (part.align === 'r') amount += leadStart.length - leadMiddle.length;
        done = true;
        break;
      }
    }
  }
  if (done) return amount;
  if (theline[0] === '*') return amount + 1;

  for (let lnum = curLnum - 1; lnum > commentPos.lnum; lnum--) {
    if (b.linewhite(lnum)) continue;
    return b.getIndentLnum(lnum);
  }
  const start = b.ml(commentPos.lnum);
  const look = commentPos.col + 2;
  const pos = { ...commentPos };
  if (ch(start, look) !== '') pos.col = skipwhite(start, look);
  amount = b.getvcol(pos);
  if (ch(start, look) === '') amount += o.inComment;
  return amount;
}

/** 여는 괄호 '(' 안의 줄 */
function parenIndent(b: CBuffer, o: Cino, theline: string, curCurpos: CPos, parenPos: CPos): number {
  const ourParenPos = { ...parenPos };
  let curAmount = MAXCOL;
  let amount = -1;
  for (let lnum = curCurpos.lnum - 1; lnum > ourParenPos.lnum; lnum--) {
    const l = sw(b.ml(lnum));
    if (cinNocode(l, 0)) continue;
    const pp = preprocCont(b, l, lnum, amount);
    if (pp.is) {
      lnum = pp.lnum;
      amount = pp.amount;
      continue;
    }
    b.cur.lnum = lnum;
    const cors = b.findStartCORS();
    if (cors !== null) {
      lnum = cors.lnum + 1;
      continue;
    }
    const t = b.findMatchParen(b.corrIndMaxparen(curCurpos));
    if (t !== null && t.lnum === ourParenPos.lnum && t.col === ourParenPos.col) {
      amount = b.getIndentLnum(lnum);
      if (theline[0] === ')') {
        if (ourParenPos.lnum !== lnum && curAmount > amount) curAmount = amount;
        amount = -1;
      }
      break;
    }
  }
  if (amount !== -1) return amount;

  let ignoreParenCol = 0;
  const sl = skipLabel(b, ourParenPos.lnum);
  amount = sl.amount;
  const lookLine = sl.line;
  const lookIdx = skipwhite(lookLine, sl.idx);
  if (ch(lookLine, lookIdx) === '(') {
    const saveLnum = b.cur.lnum;
    b.cur.lnum = ourParenPos.lnum;
    b.cur.col = lookIdx + 1;
    const t = b.findmatchlimit(')', {}, o.maxparen);
    if (t !== null && t.lnum === ourParenPos.lnum && t.col < ourParenPos.col) ignoreParenCol = t.col + 1;
    b.cur.lnum = saveLnum;
  }
  const lineUpWithParen = ch(lookLine, lookIdx) === '(' && ignoreParenCol === 0;
  if (theline[0] === ')' || lineUpWithParen) {
    if (theline[0] !== ')') {
      curAmount = MAXCOL;
      const l = b.ml(ourParenPos.lnum);
      let col = ourParenPos.col + 1;
      while (isWhite(ch(l, col))) col++;
      if (ch(l, col) !== '') ourParenPos.col = col;
      else ourParenPos.col++;
    }
    if (ourParenPos.col > 0) {
      const col = b.getvcol(ourParenPos);
      if (curAmount > col) curAmount = col;
    }
  }

  if (lineUpWithParen) {
    if (curAmount !== MAXCOL) amount = curAmount;
    return amount;
  }
  // 우리 '(' 앞의 '(' 마다 unclosed2 를 더합니다.
  const pl = b.ml(ourParenPos.lnum);
  let col = ourParenPos.col;
  while (ourParenPos.col > ignoreParenCol) {
    ourParenPos.col--;
    const c = ch(pl, ourParenPos.col);
    if (c === '(') {
      amount += o.unclosed2;
      col = ourParenPos.col;
    } else if (c === ')') {
      amount -= o.unclosed2;
      col = MAXCOL;
    }
  }
  if (col === MAXCOL) {
    amount += o.unclosed;
  } else {
    b.cur = { lnum: ourParenPos.lnum, col };
    amount += b.findMatchParenAfterBrace(o.maxparen) ? o.unclosed2 : o.unclosed;
  }
  if (curAmount < amount) amount = curAmount;
  return amount;
}

function contOr(amount: number, contAmount: number, indContinuation: number): number {
  return contAmount > 0 ? contAmount : amount + indContinuation;
}

/** 여는 중괄호 '{' 안의 줄 */
function braceIndent(b: CBuffer, o: Cino, theline: string, curCurpos: CPos, bracePos: CPos): number {
  const tb = { ...bracePos };
  const ourscope = tb.lnum;
  const start = b.ml(ourscope);
  let amount: number;
  let startBrace: number;
  if (ch(start, skipwhite(start, 0)) === '{') {
    amount = b.getvcol(tb);
    startBrace = start[0] === '{' ? BRACE_IN_COL0 : BRACE_AT_START;
  } else {
    b.cur.lnum = ourscope;
    let lnum = ourscope;
    if (b.findLastParen(start, '(', ')')) {
      const t = b.findMatchParen(o.maxparen);
      if (t !== null) lnum = t.lnum;
    }
    amount = skipLabel(b, lnum).amount;
    startBrace = BRACE_AT_END;
  }

  if (theline[0] === '}') return amount + o.closeExtra;

  let lookfor = LOOKFOR_INITIAL;
  if (cinIselse(theline)) lookfor = LOOKFOR_IF;
  else if (cinIswhileofdo(b, theline, curCurpos.lnum)) lookfor = LOOKFOR_DO;
  if (lookfor !== LOOKFOR_INITIAL) {
    b.cur.lnum = curCurpos.lnum;
    if (findMatch(b, lookfor, ourscope)) return b.getIndent();
  }

  if (startBrace === BRACE_IN_COL0) {
    amount = o.openLeftImag;
  } else if (startBrace === BRACE_AT_END) {
    amount += o.openImag;
  } else {
    amount -= o.openExtra;
    if (amount < 0) amount = 0;
  }

  const lookforBreak = false;
  if (cinIscase(theline, false)) {
    lookfor = LOOKFOR_CASE;
    amount += o.case;
  } else if (cinIsscopedecl(theline)) {
    lookfor = LOOKFOR_SCOPEDECL;
    amount += o.scopedecl;
  } else {
    lookfor = LOOKFOR_INITIAL;
    amount += o.level;
  }
  let scopeAmount = amount;
  let whilelevel = 0;
  let contAmount = 0;
  let indContinuation = o.continuation;
  let curAmount = MAXCOL;
  const cache: BaseclassCache = { found: false, lpos: { lnum: Number.MAX_SAFE_INTEGER, col: 0 } };

  b.cur = { ...curCurpos };
  outer: for (;;) {
    b.cur.lnum--;
    b.cur.col = 0;

    if (b.cur.lnum <= ourscope) {
      if (lookfor === LOOKFOR_ENUM_OR_INIT) {
        if (b.cur.lnum === 0 || b.cur.lnum < ourscope - o.maxparen) {
          amount = contOr(amount, contAmount, indContinuation);
          break;
        }
        const t = b.findStartCORS();
        if (t !== null) {
          b.cur = { lnum: t.lnum + 1, col: 0 };
          continue;
        }
        let l = b.curLine();
        const pp = preprocCont(b, l, b.cur.lnum, amount);
        if (pp.is) {
          b.cur.lnum = pp.lnum;
          amount = pp.amount;
          continue;
        }
        if (cinNocode(l, 0)) continue;
        const terminated = cinIsterminated(l, false, true);
        if (startBrace !== BRACE_IN_COL0 || !cinIsfuncdecl(b, l, b.cur.lnum, 0)) {
          if (terminated === ',') break;
          if (terminated !== ';' && cinIsinit(b)) break;
          if (terminated === '' || terminated === '{') continue;
        }
        if (terminated !== ';') {
          l = b.curLine();
          let t2: CPos | null = null;
          if (b.findLastParen(l, '(', ')')) t2 = b.findMatchParen(o.maxparen);
          if (t2 === null && b.findLastParen(l, '{', '}')) t2 = b.findStartBrace();
          if (t2 !== null) {
            b.cur = { lnum: t2.lnum + 1, col: 0 };
            continue;
          }
        }
        amount = contOr(amount, contAmount, indContinuation);
      } else if (lookfor === LOOKFOR_UNTERM) {
        amount = contOr(amount, contAmount, indContinuation);
      } else if (lookfor !== LOOKFOR_TERM && lookfor !== LOOKFOR_CPP_BASECLASS) {
        amount = scopeAmount;
        if (theline[0] === '{') amount += o.openExtra;
      }
      break;
    }

    const cors = b.findStartCORS();
    if (cors !== null) {
      b.cur = { lnum: cors.lnum + 1, col: 0 };
      continue;
    }

    let l = b.curLine();
    const iscase = cinIscase(l, false);
    if (iscase || cinIsscopedecl(l)) {
      if (lookfor === LOOKFOR_CPP_BASECLASS) break;
      if (whilelevel > 0) continue;
      if (lookfor === LOOKFOR_UNTERM || lookfor === LOOKFOR_ENUM_OR_INIT) {
        amount = contOr(amount, contAmount, indContinuation);
        break;
      }
      if ((iscase && lookfor === LOOKFOR_CASE) || (iscase && lookforBreak) || (!iscase && lookfor === LOOKFOR_SCOPEDECL)) {
        const t = b.findStartBrace();
        if (t === null || t.lnum === ourscope) {
          amount = b.getIndent();
          break;
        }
        continue;
      }
      const n = getIndentNolabel(b, b.cur.lnum);
      if (lookfor === LOOKFOR_TERM) {
        if (n) amount = n;
        if (!lookforBreak) break;
      }
      if (n) {
        amount = n;
        const al = afterLabel(b.curLine());
        if (al !== null && cinIsCinword(al)) {
          amount += theline[0] === '{' ? o.openExtra : o.level + o.noBrace;
        }
        break;
      }
      scopeAmount = b.getIndent() + (iscase ? o.caseCode : o.scopedeclCode);
      lookfor = LOOKFOR_ANY;
      continue;
    }

    if (lookfor === LOOKFOR_CASE || lookfor === LOOKFOR_SCOPEDECL) {
      if (b.findLastParen(l, '{', '}')) {
        const t = b.findStartBrace();
        if (t !== null) b.cur = { lnum: t.lnum + 1, col: 0 };
      }
      continue;
    }

    if (cinIslabel(b)) {
      const al = afterLabel(b.curLine());
      if (al === null || cinNocode(al, 0)) continue;
    }

    l = b.curLine();
    {
      const pp = preprocCont(b, l, b.cur.lnum, amount);
      if (pp.is) {
        b.cur.lnum = pp.lnum;
        amount = pp.amount;
        continue;
      }
      if (cinNocode(l, 0)) continue;
    }

    let n = false;
    if (lookfor !== LOOKFOR_TERM && o.cppBaseclass > 0) {
      n = cinIsCppBaseclass(b, cache);
      l = b.curLine();
    }
    if (n) {
      if (lookfor === LOOKFOR_UNTERM) {
        amount = contOr(amount, contAmount, indContinuation);
      } else if (theline[0] === '{') {
        lookfor = LOOKFOR_UNTERM;
        indContinuation = 0;
        continue;
      } else {
        amount = getBaseclassAmount(b, o, cache.lpos.col);
      }
      break;
    } else if (lookfor === LOOKFOR_CPP_BASECLASS) {
      if (cinIsterminated(l, true, false)) break;
      continue;
    }

    const terminated = cinIsterminated(l, false, true);

    if (terminated === '' || (lookfor !== LOOKFOR_UNTERM && terminated === ',')) {
      if (lookfor !== LOOKFOR_ENUM_OR_INIT && (sw(l)[0] === '[' || lastChar(l) === '[')) {
        amount += indContinuation;
      }
      b.findLastParen(l, '(', ')');
      let t: CPos | null = b.findMatchParen(b.corrIndMaxparen(curCurpos));
      if (t !== null && (t.lnum < tb.lnum || (t.lnum === tb.lnum && t.col < tb.col))) t = null;
      l = b.curLine();
      if (t === null && terminated === ',') {
        if (b.findLastParen(l, '{', '}')) t = b.findStartBrace();
        l = b.curLine();
      }
      if (t !== null) {
        b.cur = { ...t };
        l = b.curLine();
        if (cinIscase(l, false) || cinIsscopedecl(l)) {
          b.cur.lnum++;
          b.cur.col = 0;
          continue;
        }
      }
      if (terminated === ',') {
        while (b.cur.lnum > 1) {
          if (lastChar(b.ml(b.cur.lnum - 1)) !== '\\') break;
          b.cur.lnum--;
          b.cur.col = 0;
        }
        l = b.curLine();
      }
      const sl = skipLabel(b, b.cur.lnum);
      curAmount = sl.amount;
      l = sl.line.slice(sl.idx);

      if (terminated !== ',' && lookfor !== LOOKFOR_TERM && theline[0] === '{') {
        amount = curAmount;
        if (sw(l)[0] !== '{') amount += o.openExtra;
        if (o.cppBaseclass) {
          lookfor = LOOKFOR_CPP_BASECLASS;
          continue;
        }
        break;
      }

      if (cinIsCinword(l) || cinIselse(sw(l))) {
        if (lookfor === LOOKFOR_UNTERM || lookfor === LOOKFOR_ENUM_OR_INIT) {
          amount = contOr(amount, contAmount, indContinuation);
          break;
        }
        amount = curAmount;
        if (theline[0] === '{') amount += o.openExtra;
        if (lookfor !== LOOKFOR_TERM) {
          amount += o.level + o.noBrace;
          break;
        }
        const cl = b.curLine();
        const wi = skipwhite(cl, 0);
        const lw = cl.slice(wi);
        if (cinIsdo(lw)) {
          if (whilelevel === 0) break;
          whilelevel--;
        }
        if (cinIselse(lw) && whilelevel === 0) {
          if (lw[0] === '}') b.cur.col = wi + 1;
          const t2 = b.findStartBrace();
          if (t2 === null || !findMatch(b, LOOKFOR_IF, t2.lnum)) break;
        }
      } else if (lookfor === LOOKFOR_UNTERM) {
        if (terminated === ',') amount += indContinuation;
        break;
      } else if (lookfor === LOOKFOR_ENUM_OR_INIT) {
        if (terminated === ',') {
          if (o.cppBaseclass === 0) break;
          lookfor = LOOKFOR_CPP_BASECLASS;
          continue;
        }
        if (amount > curAmount) amount = curAmount;
      } else {
        l = b.curLine();
        amount = curAmount;
        if (terminated === ',' && (sw(l)[0] === ']' || (l.length >= 2 && l[l.length - 2] === ']'))) break;
        if (lookfor === LOOKFOR_INITIAL && terminated === ',') {
          lookfor = LOOKFOR_ENUM_OR_INIT;
          contAmount = cinFirstIdAmount(b);
        } else {
          if (lookfor === LOOKFOR_INITIAL && lastChar(l) === '\\') {
            contAmount = cinGetEqualAmount(b, b.cur.lnum);
          }
          if (lookfor !== LOOKFOR_TERM) lookfor = LOOKFOR_UNTERM;
        }
      }
    } else if (cinIswhileofdoEnd(b, terminated)) {
      if (lookfor === LOOKFOR_UNTERM || lookfor === LOOKFOR_ENUM_OR_INIT) {
        amount = contOr(amount, contAmount, indContinuation);
        break;
      }
      if (whilelevel === 0) {
        lookfor = LOOKFOR_TERM;
        amount = b.getIndent();
        if (theline[0] === '{') amount += o.openExtra;
      }
      whilelevel++;
    } else {
      if (whilelevel > 0) {
        if (cinIsdo(sk(b.curLine()))) {
          amount = b.getIndent();
          whilelevel--;
          continue;
        }
      }
      if (lookfor === LOOKFOR_UNTERM || lookfor === LOOKFOR_ENUM_OR_INIT) {
        amount = contOr(amount, contAmount, indContinuation);
        break;
      }
      if (lookfor === LOOKFOR_TERM) {
        if (!lookforBreak && whilelevel === 0) break;
      } else {
        // term_again
        for (;;) {
          l = b.curLine();
          if (b.findLastParen(l, '(', ')')) {
            const t = b.findMatchParen(o.maxparen);
            if (t !== null) {
              b.cur = { ...t };
              l = b.curLine();
              if (cinIscase(l, false) || cinIsscopedecl(l)) {
                b.cur.lnum++;
                b.cur.col = 0;
                continue outer;
              }
            }
          }
          const sl = skipLabel(b, b.cur.lnum);
          amount = sl.amount;
          if (theline[0] === '{') amount += o.openExtra;
          const lw = sw(sl.line.slice(sl.idx));
          if (lw[0] === '{') amount -= o.openExtra;
          lookfor = LOOKFOR_TERM;

          if (lw[0] !== '}' && cinIselse(lw) && whilelevel === 0) {
            const t = b.findStartBrace();
            if (t === null || !findMatch(b, LOOKFOR_IF, t.lnum)) break outer;
            continue outer;
          }

          l = b.curLine();
          if (b.findLastParen(l, '{', '}')) {
            const t = b.findStartBrace();
            if (t !== null) {
              b.cur = { ...t };
              const lk = sk(b.curLine());
              if (lk[0] === '}' || !cinIselse(lk)) continue;
              b.cur.lnum++;
              b.cur.col = 0;
            }
          }
          break;
        }
      }
    }
  }
  return amount;
}

/** 어떤 괄호에도 들어 있지 않은 최상위 줄 */
function topLevelIndent(b: CBuffer, o: Cino, theline: string, curCurpos: CPos): number {
  if (theline[0] === '{') return o.firstOpen;
  if (
    curCurpos.lnum < b.lineCount &&
    !cinNocode(theline, 0) &&
    !theline.includes('{') &&
    !theline.includes('}') &&
    !cinEndsIn(theline, 0, ':') &&
    !cinEndsIn(theline, 0, ',') &&
    cinIsfuncdecl(b, null, curCurpos.lnum + 1, curCurpos.lnum + 1) &&
    !cinIsterminated(theline, false, true)
  ) {
    return o.funcType;
  }

  let amount = 0;
  const cache: BaseclassCache = { found: false, lpos: { lnum: Number.MAX_SAFE_INTEGER, col: 0 } };
  b.cur = { ...curCurpos };
  while (b.cur.lnum > 1) {
    b.cur.lnum--;
    b.cur.col = 0;
    let l = b.curLine();
    const cors = b.findStartCORS();
    if (cors !== null) {
      b.cur = { lnum: cors.lnum + 1, col: 0 };
      continue;
    }
    if (o.cppBaseclass !== 0 && cinIsCppBaseclass(b, cache)) {
      amount = getBaseclassAmount(b, o, cache.lpos.col);
      break;
    }
    l = b.curLine();
    const pp = preprocCont(b, l, b.cur.lnum, amount);
    if (pp.is) {
      b.cur.lnum = pp.lnum;
      amount = pp.amount;
      continue;
    }
    if (cinNocode(l, 0)) continue;

    const endsInComma = cinEndsIn(l, 0, ',');
    if (endsInComma || lastChar(l) === '\\') {
      if (b.findLastParen(l, '(', ')')) {
        const t = b.findMatchParen(o.maxparen);
        if (t !== null) b.cur = { ...t };
      }
      while (endsInComma && b.cur.lnum > 1) {
        if (lastChar(b.ml(b.cur.lnum - 1)) !== '\\') break;
        b.cur.lnum--;
        b.cur.col = 0;
      }
      amount = b.getIndent();
      if (amount === 0) amount = cinFirstIdAmount(b);
      if (amount === 0) amount = o.continuation;
      break;
    }

    if (cinIsfuncdecl(b, null, curCurpos.lnum, 0)) break;
    l = b.curLine();
    if (sw(l)[0] === '}') break;
    if (cinEndsIn(l, 0, '};')) break;
    if (cinEndsIn(l, 0, '[')) {
      amount = b.getIndent() + o.continuation;
      break;
    }

    const lk = sw(l);
    if (lk[0] === ';' && cinNocode(lk, 1)) {
      const save = { ...b.cur };
      let look = lk;
      while (b.cur.lnum > 1) {
        look = b.ml(--b.cur.lnum);
        if (cinNocode(look, 0)) continue;
        const pp2 = preprocCont(b, look, b.cur.lnum, amount);
        if (!pp2.is) break;
        b.cur.lnum = pp2.lnum;
        amount = pp2.amount;
        look = pp2.line;
      }
      if (b.cur.lnum > 0 && cinEndsIn(look, 0, '}')) break;
      b.cur = save;
    }

    if (cinIsfuncdecl(b, l, b.cur.lnum, 0)) {
      amount = o.param;
      break;
    }

    if (cinEndsIn(l, 0, ';')) {
      const pl = b.ml(b.cur.lnum - 1);
      if (cinEndsIn(pl, 0, ',') || lastChar(pl) === '\\') break;
      l = b.curLine();
    }

    b.findLastParen(l, '(', ')');
    const t = b.findMatchParen(o.maxparen);
    if (t !== null) b.cur = { ...t };
    amount = b.getIndent();
    break;
  }

  if (curCurpos.lnum > 1) {
    const pl = b.ml(curCurpos.lnum - 1);
    if (lastChar(pl) === '\\') {
      const ca = cinGetEqualAmount(b, curCurpos.lnum - 1);
      if (ca > 0) amount = ca;
      else if (ca === 0) amount += o.continuation;
    }
  }
  return amount;
}

/** Vim `get_c_indent()`: 줄 `lnum`(1부터)에 줄 들여쓰기(화면 열). */
export function getCIndent(b: CBuffer, o: Cino, lnum: number): number {
  const curCurpos = { lnum, col: 0 };
  b.cur = { ...curCurpos };
  if (lnum === 1) return 0;

  const linecopy = b.ml(lnum);
  const theline = sw(linecopy);
  const originalLineIslabel = cinIslabel(b);
  const cp = b.findStartComment();
  const commentPos = cp ? { ...cp } : null;

  let amount: number;
  if (theline[0] === '#') {
    amount = 0;
  } else if (originalLineIslabel) {
    amount = 0;
  } else {
    let lineComment: CPos | null = null;
    if (cinIslinecomment(theline, 0)) {
      lineComment = findLineComment(b);
      if (lineComment === null && b.cur.lnum > 1) {
        const col = checkLinecomment(b.ml(b.cur.lnum - 1));
        if (col !== MAXCOL) lineComment = { lnum: b.cur.lnum - 1, col };
      }
    }
    if (lineComment !== null) {
      amount = b.getvcol(lineComment);
    } else if (!cinIscomment(theline, 0) && commentPos !== null) {
      amount = commentLineIndent(b, o, theline, commentPos, lnum);
    } else {
      let bracket: CPos | null = null;
      if (theline[0] === ']') bracket = b.findMatchChar('[', o.maxparen);
      if (bracket !== null) {
        amount = b.getIndentLnum(bracket.lnum);
      } else {
        const paren = b.findMatchParen(o.maxparen);
        const brace = paren === null ? b.findStartBrace() : null;
        if (paren !== null) amount = parenIndent(b, o, theline, curCurpos, paren);
        else if (brace !== null) amount = braceIndent(b, o, theline, curCurpos, brace);
        else amount = topLevelIndent(b, o, theline, curCurpos);
      }
    }
  }
  b.cur = { ...curCurpos };
  return amount < 0 ? 0 : amount;
}

export interface CIndentOptions {
  shiftwidth: number;
  tabstop: number;
  expandtab: boolean;
}

function makeIndent(amount: number, opts: CIndentOptions): string {
  if (opts.expandtab) return ' '.repeat(amount);
  const ts = opts.tabstop > 0 ? opts.tabstop : 8;
  return '\t'.repeat(Math.floor(amount / ts)) + ' '.repeat(amount % ts);
}

/**
 * `=` (op_reindent + get_c_indent): 줄 범위 [fromLine, toLine](0부터)를 위에서부터 차례로 다시 들여씁니다.
 * 앞에서 고친 줄의 들여쓰기가 다음 줄 계산에 쓰입니다. 공백뿐인 줄은 빈 줄이 됩니다.
 */
export function cindentLines(lines: string[], fromLine: number, toLine: number, opts: CIndentOptions): string[] {
  const out = [...lines];
  const minLine = Math.max(0, Math.min(fromLine, toLine));
  const maxLine = Math.min(out.length - 1, Math.max(fromLine, toLine));
  const ts = opts.tabstop > 0 ? opts.tabstop : 8;
  const swidth = opts.shiftwidth > 0 ? opts.shiftwidth : ts;
  const b = new CBuffer(out, ts);
  const o = defaultCino(swidth);
  for (let i = minLine; i <= maxLine; i++) {
    const line = out[i];
    const textStart = skipwhite(line, 0);
    const amount = textStart >= line.length ? 0 : getCIndent(b, o, i + 1);
    out[i] = makeIndent(amount, opts) + line.slice(textStart);
  }
  return out;
}
