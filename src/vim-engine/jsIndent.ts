/**
 * JavaScript 파일의 `=` 들여쓰기: Neovim runtime/indent/javascript.vim (pangloss/vim-javascript,
 * `GetJavascriptIndent()`) 를 옮긴 것.
 *
 * 원본은 커서를 움직이며 `searchpair()` 로 감싸는 괄호를 찾고, 그 괄호가 블록(`{` 뒤 문장)인지 식(객체·인자)인지,
 * 이전 줄이 이어지는 식인지(`s:Continues`), 중괄호 없는 `if`/`for`/`=>` 본문인지(`s:IsContOne`) 를 따집니다.
 * 함수 이름·흐름을 원본과 1:1 로 맞춰 두었습니다. 문자열·주석 판단은 `synID()` 대신 `jsIndentSyntax.ts` 를 쓰고,
 * 'cinoptions' 는 비어 있다고 봅니다(Neovim 기본값). b:js_cache 는 한 번의 `=` 안에서만 유지합니다.
 */
import { CBuffer } from './cindentScan';
import { getCIndent } from './cindent';
import { defaultCino } from './cindentRules';
import { JsSyntax, SynCls } from './jsIndentSyntax';
import { JS_FTPLUGIN_COMMENTS, type JsIndentOptions } from './tsIndent';

interface Pos {
  lnum: number;
  col: number;
}

class OutOfBounds extends Error {}

type CharTest = (c: string) => boolean;

const isK = (c: string | undefined): boolean => {
  if (!c) return false;
  if (/[A-Za-z0-9_À-ÿ]/.test(c)) return true;
  return c.charCodeAt(0) >= 0x100 && !/[\s\p{P}\p{S}]/u.test(c);
};

const BLOCK_PREFIX_WORDS =
  'return const let import export extends yield default delete var await void typeof throw case new in instanceof'.split(' ');
const OPFIRST = /^(?:[<>=,.?^%|/&]|([-:+])(?!\1)|\*+|!=|in(?:stanceof)?(?![A-Za-z0-9_]))/;
const CONTINUATION = /(?:[<=,.~!?/*^%|&:]|(?<!\+)\+|(?<!-)-|(?<!=)>|(?<![A-Za-z0-9_])(?:typeof|new|delete|void|in|instanceof|await))$/;

class JsIndenter {
  private readonly syn: JsSyntax;
  private readonly cb: CBuffer;
  private readonly sw: number;
  private cur: Pos = { lnum: 1, col: 1 };
  private cache: [number, number, number] = [0, 0, 0];
  private l1 = 0;
  private looksyn = 0;
  private topCol = 0;
  private checkIn = false;

  constructor(
    private readonly lines: string[],
    opts: JsIndentOptions
  ) {
    this.syn = new JsSyntax(lines, 'javascript');
    this.cb = new CBuffer(lines, opts.tabstop > 0 ? opts.tabstop : 8);
    this.sw = opts.shiftwidth > 0 ? opts.shiftwidth : this.cb.ts;
  }

  // ---- Vim 기본 함수 흉내 ----

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

  private lookingAt(): string {
    return this.getline(this.cur.lnum)[this.cur.col - 1] ?? '';
  }

  private charBefore(): string {
    return this.getline(this.cur.lnum)[this.cur.col - 2] ?? '';
  }

  private isStrcom(p: Pos = this.cur): boolean {
    const c = this.syn.at(p.lnum, p.col);
    return c !== SynCls.None;
  }

  private inComm(p: Pos = this.cur): boolean {
    const c = this.syn.at(p.lnum, p.col);
    return c === SynCls.Comment || c === SynCls.LineComment;
  }

  private pure<T>(f: () => T): T {
    const save = { ...this.cur };
    const r = f();
    this.cur = save;
    return r;
  }

  /**
   * searchpair(start, '', end, 'bW', skip, s:l1): 커서 앞에서 짝이 없는 start 를 찾습니다.
   * `end` 가 null 이면 끝 패턴이 없는 s:SearchLoop 입니다. 성공하면 커서를 옮기고 줄 번호를 돌려줍니다.
   */
  private searchpair(start: (p: Pos) => boolean, end: ((p: Pos) => boolean) | null, skip: (p: Pos) => boolean): number {
    let nest = 1;
    let lnum = this.cur.lnum;
    let col = this.cur.col - 1;
    const stop = this.l1;
    for (;;) {
      while (col < 1) {
        lnum--;
        if (lnum < 1 || (stop > 0 && lnum < stop)) return 0;
        col = this.getline(lnum).length;
      }
      const p = { lnum, col };
      const isStart = start(p);
      const isEnd = !isStart && end !== null && end(p);
      if (isStart || isEnd) {
        const save = this.cur;
        this.cur = p;
        const skipped = skip(p);
        this.cur = save;
        if (!skipped) {
          if (isEnd) nest++;
          else if (--nest === 0) {
            this.cur = p;
            return lnum;
          }
        }
      }
      col--;
    }
  }

  private charAt(p: Pos): string {
    return this.getline(p.lnum)[p.col - 1] ?? '';
  }

  private chars(test: CharTest): (p: Pos) => boolean {
    return (p) => {
      const c = this.charAt(p);
      return c !== '' && test(c);
    };
  }

  private skipExpr = (p: Pos): boolean => this.isStrcom(p);

  /** s:SkipFunc(): 성능용 근사와 '1열 괄호를 만나면 최상위' 규칙. */
  private skipFunc = (p: Pos): boolean => {
    if (this.topCol === 1) throw new OutOfBounds();
    if (this.checkIn) {
      if (this.isStrcom(p)) return true;
      this.checkIn = false;
    } else if (this.lineHasSkipHint(p)) {
      if (this.isStrcom(p)) return true;
    } else if (this.searchForwardHint(p)) {
      if (this.isStrcom(p)) {
        this.checkIn = true;
        return true;
      }
    }
    this.looksyn = p.lnum;
    this.topCol = p.col;
    return false;
  };

  /** getline('.') =~ '\%<Nc\/.\{-}\/\|\%>Nc[''"]\|\\$' */
  private lineHasSkipHint(p: Pos): boolean {
    const line = this.getline(p.lnum);
    const firstSlash = line.indexOf('/');
    if (firstSlash >= 0 && firstSlash + 1 < p.col && line.indexOf('/', firstSlash + 1) >= 0) return true;
    for (let i = p.col; i < line.length; i++) if (line[i] === "'" || line[i] === '"') return true;
    return line.endsWith('\\');
  }

  /** search('\m`\|\${\|\*\/', 'nW', s:looksyn): 커서 뒤부터 looksyn 줄까지. */
  private searchForwardHint(p: Pos): boolean {
    for (let l = p.lnum; l <= this.looksyn && l <= this.lines.length; l++) {
      const line = this.getline(l);
      for (let i = l === p.lnum ? p.col : 0; i < line.length; i++) {
        const c = line[i];
        if (c === '`' || (c === '$' && line[i + 1] === '{') || (c === '*' && line[i + 1] === '/')) return true;
      }
    }
    return false;
  }

  private getPair(open: string, close: string, useSkipFunc: boolean): number {
    const o = this.chars((c) => open.includes(c));
    const e = this.chars((c) => close.includes(c));
    return this.searchpair(o, e, useSkipFunc ? this.skipFunc : this.skipExpr);
  }

  private searchLoop(test: (p: Pos) => boolean, skip: (p: Pos) => boolean): number {
    return this.searchpair(test, null, skip);
  }

  // ---- 토큰 ----

  /** search('\m\k\{1,}\|\S', 'ebW'): 커서 앞에서 끝나는 마지막 토큰의 끝으로. */
  private searchTokenBack(): boolean {
    for (let lnum = this.cur.lnum; lnum >= 1; lnum--) {
      const line = this.getline(lnum);
      let best = -1;
      let i = 0;
      while (i < line.length) {
        const c = line[i];
        if (/\s/.test(c)) {
          i++;
          continue;
        }
        let j = i + 1;
        if (isK(c)) while (j < line.length && isK(line[j])) j++;
        // 끝 글자 열(1부터) = j
        if (lnum < this.cur.lnum || j < this.cur.col) best = j;
        else break;
        i = j;
      }
      if (best > 0) {
        this.cur = { lnum, col: best };
        return true;
      }
    }
    return false;
  }

  private token(): string {
    const c = this.lookingAt();
    if (!isK(c)) return c;
    const line = this.getline(this.cur.lnum);
    let s = this.cur.col - 1;
    let e = this.cur.col - 1;
    while (s > 0 && isK(line[s - 1])) s--;
    while (e + 1 < line.length && isK(line[e + 1])) e++;
    return line.slice(s, e + 1);
  }

  private previousToken(recursive = false): string {
    const pos = { ...this.cur };
    let tok = '';
    if (this.searchTokenBack()) {
      const line = this.getline(this.cur.lnum);
      if (line.slice(this.cur.col - 2, this.cur.col) === '*/') {
        if (this.inComm() && !this.searchLoop(this.beforeCommentStart, (p) => this.inComm(p))) {
          this.cur = pos;
        } else {
          tok = this.token();
        }
      } else {
        const two = recursive || this.cur.lnum !== pos.lnum ? line.slice(0, this.cur.col + 1).lastIndexOf('//') + 1 : 0;
        if (two && this.inComm()) {
          this.cur = { lnum: this.cur.lnum, col: two };
          tok = this.previousToken(true);
          if (tok === '') this.cur = pos;
        } else {
          tok = this.token();
        }
      }
    }
    return tok;
  }

  /** '\S\ze\_s*\/[/*]' 가 p 에서 시작하는지. */
  private beforeCommentStart = (p: Pos): boolean => {
    const c = this.charAt(p);
    if (c === '' || /\s/.test(c)) return false;
    let lnum = p.lnum;
    let i = p.col; // 다음 글자 (0부터)
    for (;;) {
      const line = this.getline(lnum);
      while (i < line.length && /\s/.test(line[i])) i++;
      if (i < line.length) return line[i] === '/' && (line[i + 1] === '/' || line[i + 1] === '*');
      lnum++;
      if (lnum > this.lines.length) return false;
      i = 0;
    }
  };

  // ---- 원본 보조 함수 ----

  private alternatePair(): void {
    let pat = '[](){};';
    let forCount = 2;
    while (this.searchLoop(this.chars((c) => pat.includes(c)), this.skipFunc)) {
      const at = this.lookingAt();
      if (at === ';') {
        if (!forCount) {
          if (this.getPair('{', '}', true)) return;
          break;
        }
        pat = '{}();';
        forCount--;
      } else {
        const idx = '])}'.indexOf(at);
        if (idx === -1) return;
        if (!this.getPair('[({'[idx], '])}'[idx], true)) break;
      }
    }
    throw new OutOfBounds();
  }

  private exprCol(): boolean {
    if (this.charBefore() === ':') return true;
    let bal = 0;
    while (this.searchLoop(this.chars((c) => '{}?:'.includes(c)), this.skipExpr)) {
      const at = this.lookingAt();
      if (at === ':') {
        if (this.charBefore() === ':') {
          this.cur = { lnum: this.cur.lnum, col: this.cur.col - 1 };
          continue;
        }
        bal -= 1;
      } else if (at === '?') {
        const after = this.getline(this.cur.lnum).slice(this.cur.col, this.cur.col + 2);
        if (/^\.(?!\d)/.test(after)) continue;
        if (!bal) return true;
        bal += 1;
      } else if (at === '{') {
        return !this.isBlock();
      } else if (!this.getPair('{', '}', false)) {
        break;
      }
    }
    return false;
  }

  private continues(): boolean {
    const line = this.getline(this.cur.lnum);
    const part = line.slice(Math.max(0, this.cur.col - 15), this.cur.col);
    const m = CONTINUATION.exec(part);
    const tok = m ? m[0] : '';
    if (/[a-z:]/.test(tok)) return tok === ':' ? this.exprCol() : this.previousToken() !== '.';
    if (!/[/>]/.test(tok)) return tok !== '';
    if (tok === '>') return true;
    return this.syn.at(this.cur.lnum, this.cur.col) !== SynCls.Regex;
  }

  private balanced(lnum: number, line: string): boolean {
    let open = 0;
    let pos = line.search(/[[\](){}]/);
    while (pos !== -1) {
      if (!this.isStrcom({ lnum, col: pos + 1 })) {
        open += '[({'.includes(line[pos]) ? 1 : -1;
        if (open < 0) return false;
      }
      const c = line[pos];
      const set = !open ? '[](){}' : '()'.includes(c) ? '()' : '{}'.includes(c) ? '{}' : '[]';
      let next = -1;
      for (let i = pos + 1; i < line.length; i++) {
        if (set.includes(line[i])) {
          next = i;
          break;
        }
      }
      pos = next;
    }
    return !open;
  }

  private oneScope(): boolean {
    if (this.lookingAt() === ')' && this.getPair('(', ')', false)) {
      const tok = this.previousToken();
      return (
        (['for', 'if', 'let', 'while', 'with'].includes(tok) ||
          ((tok === 'await' || tok === 'each') && this.previousToken() === 'for')) &&
        this.pure(() => this.previousToken()) !== '.' &&
        !(tok === 'while' && this.doWhile())
      );
    }
    const t = this.token();
    if (t === 'else' || t === 'do') return this.pure(() => this.previousToken()) !== '.';
    if (this.getline(this.cur.lnum).slice(this.cur.col - 2, this.cur.col) === '=>') {
      this.cur = { lnum: this.cur.lnum, col: this.cur.col - 1 };
      if (this.previousToken() === ')') return this.getPair('(', ')', false) > 0;
      return true;
    }
    return false;
  }

  private doWhile(): boolean {
    // searchpos('\m\<', 'cbW'): 커서 또는 그 앞의 단어 시작
    const line0 = this.getline(this.cur.lnum);
    let wc = this.cur.col;
    while (wc > 1 && isK(line0[wc - 1]) && isK(line0[wc - 2])) wc--;
    const cpos = { lnum: this.cur.lnum, col: wc };
    this.cur = cpos;
    const isDoWhileWord = (p: Pos): boolean => {
      const line = this.getline(p.lnum);
      const i = p.col - 1;
      if (isK(line[i - 1])) return false;
      for (const w of ['do', 'while']) if (line.startsWith(w, i) && !isK(line[i + w.length])) return true;
      return false;
    };
    const test = (p: Pos): boolean => {
      const c = this.charAt(p);
      return c === '{' || c === '}' || isDoWhileWord(p);
    };
    while (this.searchLoop(test, this.skipExpr)) {
      const at = this.lookingAt();
      if (/[A-Za-z]/.test(at)) {
        if (this.pure(() => this.isBlock())) {
          if (at === 'd') return true;
          break;
        }
      } else if (at !== '}' || !this.getPair('{', '}', false)) {
        break;
      }
    }
    this.cur = cpos;
    return false;
  }

  private isContOne(cont: boolean): number {
    const firstline = this.cur.lnum;
    const num = this.cache[1] + (this.cache[1] ? 0 : 1);
    let bl = 0;
    const pind = this.cache[1] ? this.indent(this.cache[1]) + this.sw : 0;
    let ind = this.indent(this.cur.lnum) + (cont ? 0 : 1);
    while ((this.cur.lnum > num && ind > pind) || this.cur.lnum === num) {
      if (this.indent(this.cur.lnum) < ind && this.oneScope()) {
        bl += 1;
      } else if (!cont || bl || ind < this.indent(firstline)) {
        break;
      } else {
        this.cur = { lnum: this.cur.lnum, col: 1 };
      }
      ind = Math.min(ind, this.indent(this.cur.lnum));
      if (this.previousToken() === '') break;
    }
    return bl;
  }

  private isSwitch(): boolean {
    this.cur = { lnum: this.cache[1], col: this.cache[2] };
    let lnum = this.cur.lnum;
    let i = this.cur.col; // `{` 다음 글자 (0부터)
    for (;;) {
      const line = this.getline(lnum);
      if (i >= line.length) {
        lnum++;
        if (lnum > this.lines.length) return false;
        i = 0;
        continue;
      }
      if (/\s/.test(line[i])) {
        i++;
        continue;
      }
      if (line.startsWith('//', i)) {
        i = line.length;
        continue;
      }
      if (line.startsWith('/*', i)) {
        let l = lnum;
        let j = line.indexOf('*/', i + 2);
        while (j < 0) {
          l++;
          if (l > this.lines.length) return false;
          j = this.getline(l).indexOf('*/');
        }
        lnum = l;
        i = j + 2;
        continue;
      }
      const m = /^(?:case|default)(?![A-Za-z0-9_])/.exec(line.slice(i));
      return m !== null;
    }
  }

  private isBlock(): boolean {
    const firstline = this.cur.lnum;
    const tok = this.previousToken();
    if ([...tok].some((c) => isK(c))) {
      if (tok === 'type') {
        return this.pure(() => !/^(?:im|ex)port$/.test(this.previousToken()) || this.previousToken() === '.');
      }
      if (tok === 'of') {
        return this.pure(
          () =>
            !this.getPair('[({', '])}', false) ||
            this.lookingAt() !== '(' ||
            (this.previousToken() === 'await' ? this.previousToken() : this.token()) !== 'for' ||
            this.previousToken() === '.'
        );
      }
      const idx = BLOCK_PREFIX_WORDS.indexOf(tok);
      return idx < (this.cur.lnum !== firstline ? 1 : 0) || this.pure(() => this.previousToken()) === '.';
    }
    if (tok === '>') return this.charBefore() === '=';
    if (tok === '*') return this.pure(() => this.previousToken()) === ':';
    if (tok === ':') {
      return this.pure(() => /^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ]*$/.test(this.previousToken()) && !this.exprCol());
    }
    if (tok === '/') return this.syn.at(this.cur.lnum, this.cur.col) === SynCls.Regex;
    if (!/[=~!<,.?^%|&([]/.test(tok)) {
      return !/[-+]/.test(tok) || (this.cur.lnum !== firstline && this.charBefore() === tok);
    }
    return false;
  }

  private cindent(lnum: number): number {
    return getCIndent(new CBuffer(this.lines, this.cb.ts), { ...defaultCino(this.sw), comments: JS_FTPLUGIN_COMMENTS }, lnum);
  }

  private nat(n: number): number {
    return n > 0 ? n : 0;
  }

  /** GetJavascriptIndent() — -1 이면 들여쓰기를 바꾸지 않습니다. */
  getIndent(vlnum: number): number {
    this.cur = { lnum: vlnum, col: 1 };
    let line = this.getline(vlnum);
    const top = this.syn.at(vlnum, 1);
    if (top === SynCls.Comment || top === SynCls.LineComment) {
      if (/^\s*\*/.test(line)) return this.cindent(vlnum);
      if (!/^\s*\/[/*]/.test(line)) return -1;
    } else if (top !== SynCls.None) {
      if (this.cache[0] === vlnum - 1 && this.balanced(vlnum - 1, this.getline(vlnum - 1))) this.cache[0] = vlnum;
      return -1;
    }

    this.l1 = Math.max(0, this.prevnonblank(vlnum) - 2000);
    this.cur = { lnum: vlnum, col: 1 };
    if (this.previousToken() === '') return 0;
    const lnum = this.cur.lnum;
    const pline = this.getline(lnum).slice(0, this.cur.col);

    line = line.replace(/^\s*/, '');
    if (line.startsWith('/*')) line = line.replace(/^(?:\/\*.*?\*\/\s*)*/, '');
    if (/^\/[/*]/.test(line)) line = '';

    this.cur = { lnum: vlnum, col: 1 };
    const idx = [']', ')', '}'].indexOf(line[0] ?? '');
    if ((this.cache[0] > lnum && this.cache[0] < vlnum) || (this.cache[0] === lnum && this.balanced(lnum, pline))) {
      if (this.cache[1] > 0) this.cur = { lnum: this.cache[1], col: this.cache[2] };
    } else {
      this.looksyn = vlnum - 1;
      this.topCol = 0;
      this.checkIn = false;
      this.l1 = Math.max(this.l1, 1);
      try {
        if (idx !== -1) this.getPair('[({'[idx], '])}'[idx], true);
        else this.alternatePair();
      } catch (e) {
        if (!(e instanceof OutOfBounds)) throw e;
        this.cur = { lnum: vlnum, col: 1 };
      }
      this.cache[1] = this.cur.lnum === vlnum ? 0 : this.cur.lnum;
      this.cache[2] = this.cur.lnum === vlnum ? 0 : this.cur.col;
    }
    this.cache[0] = vlnum;
    let num = this.cache[1];

    let numInd = this.nat(this.indent(num));
    let isOp = 0;
    let bl = 0;
    let switchOffset = 0;
    if (!num || (this.lookingAt() === '{' && this.isBlock())) {
      const ilnum = this.cur.lnum;
      if (num && this.lookingAt() === ')' && this.getPair('(', ')', false)) {
        if (ilnum === num) {
          num = this.cur.lnum;
          numInd = this.indent(this.cur.lnum);
        }
        if (idx === -1 && this.previousToken() === 'switch' && this.isSwitch()) {
          switchOffset = this.sw;
          if (!pline.endsWith('.') && /^(?:default|case)(?![A-Za-z0-9_])/.test(line)) return this.nat(numInd + switchOffset);
        }
      }
      if (idx === -1 && !/[{;]$/.test(pline)) {
        this.cur = { lnum, col: pline.length };
        const sm = OPFIRST.exec(line);
        const sol = sm ? sm[0] : '';
        const vline = this.getline(vlnum);
        if (sol === '' || (sol === '/' && this.syn.at(vlnum, 1 + vline.length - line.length) === SynCls.Regex)) {
          if (this.continues()) isOp = this.sw;
        } else if (num && /^(?:in(?:stanceof)?|\*)$/.test(sol) && this.inFunctionBodyOperand()) {
          return numInd + this.sw;
        } else {
          isOp = this.sw;
        }
        this.cur = { lnum, col: pline.length };
        bl = this.nat(this.isContOne(isOp > 0) - (!isOp && line.startsWith('{') ? 1 : 0)) * this.sw;
      }
    }

    if (/^[\])}]|^\|}/.test(line)) return numInd;
    if (num) return this.nat(numInd + this.sw + switchOffset + bl + isOp);
    return bl + isOp;
  }

  /** `in`/`instanceof`/`*` 로 시작하는 줄의 특수 경우 (원본의 긴 && 조건). */
  private inFunctionBodyOperand(): boolean {
    if (this.lookingAt() !== '}' || !this.getPair('{', '}', false)) return false;
    if (this.previousToken() !== ')' || !this.getPair('(', ')', false)) return false;
    if (this.previousToken() === ']') return true;
    if (!isK(this.lookingAt())) return false;
    return (this.previousToken() === '*' ? this.previousToken() : this.token()) !== 'function';
  }
}

export function createJsIndenter(lines: string[], opts: JsIndentOptions): (lnum: number) => number {
  const t = new JsIndenter(lines, opts);
  return (lnum) => t.getIndent(lnum);
}
