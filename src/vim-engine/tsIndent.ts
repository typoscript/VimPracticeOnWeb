/**
 * TypeScript 파일의 `=` 들여쓰기: Neovim runtime/indent/typescript.vim 의 `GetTypescriptIndent()` 를 옮긴 것.
 *
 * Neovim 은 `filetype plugin indent on` 이 기본이라 typescript / typescriptreact 버퍼에서 `=` 가 cindent 대신
 * 이 'indentexpr' 를 씁니다. 원본은 vim-ruby 계열의 줄 단위 휴리스틱(이전 줄이 블록을 열었는지, 이어지는 줄인지,
 * 괄호가 남았는지)이며, 문자열·주석 판단은 `synID()` 대신 `jsIndentSyntax.ts` 의 분류를 씁니다.
 * 결과가 이상해 보여도(예: 여러 줄 인자 뒤 본문이 괄호 열에 맞춰짐) 실제 Neovim 과 같게 두었습니다.
 */
import { CBuffer } from './cindentScan';
import { getCIndent } from './cindent';
import { defaultCino } from './cindentRules';
import { JsSyntax, SynCls } from './jsIndentSyntax';

/** ftplugin/{javascript,typescript}.vim 이 정하는 'comments' (주석 안 줄을 cindent 로 맞출 때 씁니다). */
export const JS_FTPLUGIN_COMMENTS = 'sO:* -,mO:*  ,exO:*/,s1:/*,mb:*,ex:*/,://';

const LINE_TERM = String.raw`\s*(?:\/\/.*)?$`;
const JS_KEYWORDS =
  /^\s*(break|case|catch|continue|debugger|default|delete|do|else|finally|for|function|if|in|instanceof|new|return|switch|this|throw|try|typeof|var|void|while|with)/;
const CONTINUATION = new RegExp(String.raw`(?:[\\*+/.:]|(?<!<%)[=-]|\W[|&?]|\|\||&&|[^=]=[^=].*,)` + LINE_TERM);
const ONE_LINE_SCOPE = new RegExp(String.raw`\b(?:if|else|for|while)\b[^{;]*` + LINE_TERM);
const BLOCK = new RegExp(
  String.raw`[{[]\s*(?:\|(?:[*@]?[A-Za-z_]\w*,?\s*)(?:,\s*[*@]?[A-Za-z_]\w*)*\|)?` + LINE_TERM
);
const VAR_STMT = /^\s*var/;
const COMMA_FIRST = /^\s*,/;
const TERNARY = /^\s+[?|:]/;
const TERNARY_Q = /^\s+\?/;

export interface JsIndentOptions {
  shiftwidth: number;
  tabstop: number;
}

class TsIndenter {
  private readonly syn: JsSyntax;
  private readonly cb: CBuffer;
  private readonly sw: number;
  /** 커서 (1부터). */
  private cur = { lnum: 1, col: 1 };

  constructor(
    private readonly lines: string[],
    opts: JsIndentOptions
  ) {
    this.syn = new JsSyntax(lines, 'typescript');
    this.cb = new CBuffer(lines, opts.tabstop > 0 ? opts.tabstop : 8);
    this.sw = opts.shiftwidth > 0 ? opts.shiftwidth : this.cb.ts;
  }

  private getline(lnum: number): string {
    return this.lines[lnum - 1] ?? '';
  }

  private indent(lnum: number): number {
    if (lnum < 1 || lnum > this.lines.length) return -1;
    return this.cb.getIndentLnum(lnum);
  }

  private prevnonblank(lnum: number): number {
    for (let l = Math.min(lnum, this.lines.length); l >= 1; l--) if (/\S/.test(this.getline(l))) return l;
    return 0;
  }

  private strcom(lnum: number, col: number): boolean {
    const c = this.syn.at(lnum, col);
    return c === SynCls.Str || c === SynCls.Regex || c === SynCls.LineComment || c === SynCls.Comment;
  }

  private inString(lnum: number, col: number): boolean {
    return this.syn.at(lnum, col) === SynCls.Regex;
  }

  private isLineComment(lnum: number, col: number): boolean {
    return this.syn.at(lnum, col) === SynCls.LineComment;
  }

  private inMultilineComment(lnum: number, col: number): boolean {
    return this.syn.at(lnum, col) === SynCls.Comment;
  }

  private prevNonBlankNonString(start: number): number {
    let inBlock = false;
    let lnum = this.prevnonblank(start);
    while (lnum > 0) {
      const line = this.getline(lnum);
      if (line.includes('/*')) {
        if (inBlock) inBlock = false;
        else break;
      } else if (!inBlock && line.includes('*/')) {
        inBlock = true;
      } else if (
        !inBlock &&
        !/^\s*\/\//.test(line) &&
        !(this.strcom(lnum, 1) && this.strcom(lnum, line.length))
      ) {
        break;
      }
      lnum = this.prevnonblank(lnum - 1);
    }
    return lnum;
  }

  /** Vim `s:Match`: 첫 일치가 문자열·주석 밖이면 그 열(1부터), 아니면 0. */
  private match(lnum: number, re: RegExp): number {
    const m = re.exec(this.getline(lnum));
    if (!m) return 0;
    const col = m.index + 1;
    return this.strcom(lnum, col) ? 0 : col;
  }

  private getMSL(start: number, inOneLineScope: boolean): number {
    let msl = start;
    let lnum = this.prevNonBlankNonString(start - 1);
    while (lnum > 0) {
      const line = this.getline(lnum);
      const m = CONTINUATION.exec(line);
      const col = m ? m.index + 1 : 0;
      if ((col > 0 && !this.strcom(lnum, col)) || this.inString(lnum, line.length)) {
        msl = lnum;
      } else {
        if (inOneLineScope) break;
        if (this.match(lnum, ONE_LINE_SCOPE) === 0) break;
      }
      lnum = this.prevNonBlankNonString(lnum - 1);
    }
    return msl;
  }

  private removeTrailingComments(content: string): string {
    return content.replace(/\/\/(.*)\s*$/, '').replace(/\/\*(.*)\*\/\s*$/, '');
  }

  private inMultiVarStatement(start: number): number {
    let lnum = this.prevNonBlankNonString(start - 1);
    while (lnum > 0) {
      const line = this.getline(lnum);
      if (JS_KEYWORDS.test(line)) return VAR_STMT.test(line) ? lnum : 0;
      lnum = this.prevNonBlankNonString(lnum - 1);
    }
    return 0;
  }

  private lineHasOpeningBrackets(lnum: number): [boolean, boolean, boolean] {
    const open = [0, 0, 0];
    const line = this.getline(lnum);
    for (let pos = 0; pos < line.length; pos++) {
      const idx = '(){}[]'.indexOf(line[pos]);
      if (idx < 0 || this.strcom(lnum, pos + 1)) continue;
      if (idx % 2 === 0) open[idx / 2]++;
      else open[(idx - 1) / 2]--;
    }
    return [open[0] > 0, open[1] > 0, open[2] > 0];
  }

  /** searchpair(open, '', close, 'bW', skip): 성공하면 커서를 옮기고 줄 번호, 실패하면 0. */
  private searchpairBack(open: string, close: string): number {
    let nest = 1;
    let { lnum, col } = this.cur;
    col -= 1;
    for (;;) {
      while (col < 1) {
        lnum--;
        if (lnum < 1) return 0;
        col = this.getline(lnum).length;
      }
      const c = this.getline(lnum)[col - 1];
      if ((c === open || c === close) && !this.strcom(lnum, col)) {
        if (c === close) nest++;
        else if (--nest === 0) {
          this.cur = { lnum, col };
          return lnum;
        }
      }
      col--;
    }
  }

  /** searchpair('', '', '', 'bW', skip): 빈 패턴은 모든 위치(줄 끝 포함)에서 맞으므로 커서 바로 앞 위치로. */
  private emptyPairBack(): number {
    let { lnum, col } = this.cur;
    col -= 1;
    for (;;) {
      if (col < 1) {
        lnum--;
        if (lnum < 1) return 0;
        col = this.getline(lnum).length + 1;
      }
      if (!this.strcom(lnum, col)) {
        this.cur = { lnum, col };
        return lnum;
      }
      col--;
    }
  }

  private indentWithContinuation(lnum: number, ind: number, width: number): number {
    const pLnum = lnum;
    const msl = this.getMSL(lnum, true);
    const line = this.getline(msl);
    if (pLnum !== msl) {
      if (this.match(pLnum, CONTINUATION) || this.inString(pLnum, line.length)) return ind;
    }
    const mslInd = this.indent(msl);
    if (this.match(msl, CONTINUATION)) return msl === pLnum ? mslInd + width : mslInd;
    return ind;
  }

  private inOneLineScope(lnum: number): number {
    const msl = this.getMSL(lnum, true);
    return msl > 0 && this.match(msl, ONE_LINE_SCOPE) ? msl : 0;
  }

  private exitingOneLineScope(lnum: number): number {
    const msl = this.getMSL(lnum, true);
    if (msl > 0) {
      if (this.match(msl, ONE_LINE_SCOPE)) return 0;
      const prevMsl = this.getMSL(msl - 1, true);
      if (this.match(prevMsl, ONE_LINE_SCOPE)) return prevMsl;
    }
    return 0;
  }

  private cindent(lnum: number): number {
    const b = new CBuffer(this.lines, this.cb.ts);
    return getCIndent(b, { ...defaultCino(this.sw), comments: JS_FTPLUGIN_COMMENTS }, lnum);
  }

  /** GetTypescriptIndent() — -1 이면 들여쓰기를 바꾸지 않습니다. */
  getIndent(vlnum: number): number {
    this.cur = { lnum: vlnum, col: 1 };
    const vcol = 1;
    let ind = -1;
    let line = this.getline(vlnum);
    const prevline = this.prevnonblank(vlnum - 1);

    const cm = /^\s*[\],})]/.exec(line);
    const col = cm ? cm[0].length : 0;
    if (col > 0 && !this.strcom(vlnum, col)) {
      this.cur = { lnum: vlnum, col };
      const lvar = this.inMultiVarStatement(vlnum);
      if (lvar) {
        const prevContents = this.removeTrailingComments(this.getline(prevline));
        if (line[col - 1] === ',') {
          if (/[;,]\s*$/.test(prevContents)) return this.indent(this.getMSL(this.cur.lnum, false));
          if (COMMA_FIRST.test(prevContents)) return this.indent(prevline);
          return this.indent(lvar) + this.sw;
        }
      }
      const which = ')}]'.indexOf(line[col - 1]);
      // `,` 이면 원본의 짝 패턴이 빈 문자열이 되어 searchpair 가 커서 바로 앞 위치에서 바로 찾습니다.
      const found = which < 0 ? this.emptyPairBack() : this.searchpairBack('(){}[]'[which * 2], '(){}[]'[which * 2 + 1]);
      if (found > 0) {
        const openLine = this.getline(this.cur.lnum);
        if (line[col - 1] === ')' && this.cur.col !== openLine.length) {
          ind = this.virtcol(this.cur.lnum, this.cur.col) - 1;
        } else {
          ind = this.indent(this.getMSL(this.cur.lnum, false));
        }
      }
      return ind;
    }

    if (COMMA_FIRST.test(this.getline(prevline))) return this.indent(prevline) - this.sw;

    if (TERNARY.test(line)) {
      return TERNARY_Q.test(this.getline(prevline)) ? this.indent(prevline) : this.indent(prevline) + this.sw;
    }

    if (this.inMultilineComment(vlnum, 1) && !this.isLineComment(vlnum, 1)) return this.cindent(vlnum);

    if (/^\s*$/.test(line) && this.inMultilineComment(prevline, 1)) return this.indent(prevline) - 1;

    const lnum = this.prevNonBlankNonString(vlnum - 1);
    if (/^\s*$/.test(line) && lnum !== prevline) return this.indent(this.prevnonblank(vlnum));
    if (lnum === 0) return 0;

    line = this.getline(lnum);
    ind = this.indent(lnum);

    if (this.match(lnum, BLOCK)) return this.indent(this.getMSL(lnum, false)) + this.sw;

    if (/[[({]/.test(line)) {
      const counts = this.lineHasOpeningBrackets(lnum);
      if (counts[0] && this.searchpairBack('(', ')') > 0) {
        const pl = this.getline(this.cur.lnum);
        if (this.cur.col === pl.length) return ind + this.sw;
        return this.virtcol(this.cur.lnum, this.cur.col);
      } else if (counts[1] || counts[2]) {
        return ind + this.sw;
      } else {
        this.cur = { lnum: vlnum, col: vcol };
      }
    }

    const indCon = ind;
    ind = this.indentWithContinuation(lnum, indCon, this.sw);

    let ols = this.inOneLineScope(lnum);
    if (ols > 0) {
      ind += this.sw;
    } else {
      ols = this.exitingOneLineScope(lnum);
      while (ols > 0 && ind > 0) {
        ind -= this.sw;
        ols = this.inOneLineScope(ols - 1);
      }
    }
    return ind;
  }

  /** virtcol(): 글자가 끝나는 화면 열 (1부터). */
  private virtcol(lnum: number, col: number): number {
    const line = this.getline(lnum);
    const start = this.cb.getvcol({ lnum, col: col - 1 });
    const c = line[col - 1];
    if (c === '\t') return start + (this.cb.ts - (start % this.cb.ts));
    return this.cb.getvcol({ lnum, col }) || start + 1;
  }
}

export function createTsIndenter(lines: string[], opts: JsIndentOptions): (lnum: number) => number {
  const t = new TsIndenter(lines, opts);
  return (lnum) => t.getIndent(lnum);
}
