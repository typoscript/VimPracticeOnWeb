/**
 * `=` 의 JavaScript / TypeScript 들여쓰기(`jsIndent.ts`, `tsIndent.ts`)가 쓰는 구문 분류.
 *
 * Neovim 의 들여쓰기 스크립트(runtime/indent/javascript.vim, typescript.vim)는 괄호가 문자열·주석·정규식 안에
 * 있는지를 `synID()` 의 구문 그룹 이름으로 판단합니다. 여기서는 그 구문 파일(runtime/syntax/javascript.vim,
 * runtime/syntax/shared/typescriptcommon.vim)이 문자열·주석·정규식·템플릿을 나누는 규칙만 옮겨, 글자마다
 * 아래 분류 하나를 붙입니다. 두 구문 파일은 규칙이 달라(예: JS 문자열은 줄 끝에서 끝나고 정규식은 `,(=+` 뒤에서만
 * 시작, TS 템플릿 본문은 문자열 그룹이 아님) 방언을 따로 둡니다.
 */

/** 글자 분류: 코드, 따옴표 문자열, 템플릿 본문, 정규식, 줄 주석, 블록 주석. */
export const enum SynCls {
  None = 0,
  Str = 1,
  Tpl = 2,
  Regex = 3,
  LineComment = 4,
  Comment = 5,
}

export type JsSyntaxDialect = 'javascript' | 'typescript';

interface LineSyn {
  /** 줄 앞 공백의 분류 (줄을 시작할 때의 영역). */
  lead: SynCls;
  /** 줄 앞 공백 뒤 글자들의 분류. */
  body: SynCls[];
}

type Frame =
  | { k: 'code'; depth: number; tsSub: boolean }
  | { k: 'jsEmbed' }
  | { k: 'tpl' }
  | { k: 'str'; q: string }
  | { k: 'comment' };

function leadingWs(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return i;
}

/** JS 정규식(javaScriptRegexpString)이 `slash` 에서 시작하면 끝(포함하지 않음)을, 아니면 -1. */
function jsRegexEnd(line: string, slash: number): number {
  let p = slash - 1;
  while (p >= 0 && /\s/.test(line[p])) p--;
  if (p < 0 || !',(=+'.includes(line[p])) return -1;
  const next = line[slash + 1];
  if (next === undefined || next === '/' || next === '*') return -1;
  let i = slash + 1;
  while (i < line.length) {
    if (line[i] === '\\' && (line[i + 1] === '\\' || line[i + 1] === '/')) {
      i += 2;
      continue;
    }
    if (line[i] === '/') {
      let j = i + 1;
      let flags = 0;
      while (flags < 2 && j < line.length && 'gimuys'.includes(line[j])) {
        j++;
        flags++;
      }
      let k = j;
      while (k < line.length && /\s/.test(line[k])) k++;
      if (k >= line.length) return line.length;
      if ('+;.,)]}'.includes(line[k])) return k;
      if (k > j && line[k] === '/') return k;
    }
    i++;
  }
  return -1;
}

/** TS 정규식(typescriptRegexpString)이 `slash` 에서 시작하면 끝(포함하지 않음)을, 아니면 -1. */
function tsRegexEnd(line: string, slash: number): number {
  const next = line[slash + 1];
  if (next === undefined || next === '/' || next === '*') return -1;
  let p = slash - 1;
  while (p >= 0 && (line[p] === ' ' || line[p] === '\t')) p--;
  if (p >= 0) {
    const c = line[p];
    const excluded = c === ')' || c === ']' || c === "'" || c === '"' || /[\sA-Za-z0-9_$]/.test(c);
    if (excluded) {
      const before = line.slice(0, p + 1);
      const m = /(?:^|[^A-Za-z0-9_])(return|typeof)$/.exec(before);
      if (!m) return -1;
    }
  }
  let i = slash + 1;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      let j = i + 1;
      while (j < line.length && line[j] !== ']') j += line[j] === '\\' ? 2 : 1;
      if (j >= line.length) return -1;
      i = j + 1;
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      let flags = 0;
      while (flags < 6 && j < line.length && 'gimyus'.includes(line[j])) {
        j++;
        flags++;
      }
      return j;
    }
    i++;
  }
  return -1;
}

/** 버퍼 전체를 위에서부터 훑어 줄마다 글자 분류를 만듭니다. */
function classify(lines: readonly string[], dialect: JsSyntaxDialect): LineSyn[] {
  const ts = dialect === 'typescript';
  const stack: Frame[] = [{ k: 'code', depth: 0, tsSub: false }];
  const out: LineSyn[] = [];
  for (const line of lines) {
    // 문자열은 줄 끝에서 끝납니다 (TS 는 줄 끝 `\` 이면 이어짐).
    const cls: SynCls[] = new Array(line.length).fill(SynCls.None);
    const top0 = stack[stack.length - 1];
    let lead: SynCls =
      top0.k === 'str' ? SynCls.Str : top0.k === 'tpl' ? SynCls.Tpl : top0.k === 'comment' ? SynCls.Comment : SynCls.None;
    let i = 0;
    // javaScriptCommentSkip: 코드 영역에서 줄이 `*` 로 시작하면 주석 그룹입니다.
    if (!ts && top0.k === 'code' && stack.length === 1) {
      const m = /^[ \t]*\*(?:$|[ \t]+)/.exec(line);
      if (m) {
        for (let j = 0; j < m[0].length; j++) cls[j] = SynCls.Comment;
        lead = SynCls.Comment;
        i = m[0].length;
      }
    }
    while (i < line.length) {
      const top = stack[stack.length - 1];
      const c = line[i];
      if (top.k === 'comment') {
        cls[i] = SynCls.Comment;
        if (c === '*' && line[i + 1] === '/') {
          cls[i + 1] = SynCls.Comment;
          i += 2;
          stack.pop();
          continue;
        }
        i++;
        continue;
      }
      if (top.k === 'str') {
        cls[i] = SynCls.Str;
        if (c === '\\') {
          if (i + 1 < line.length) cls[i + 1] = SynCls.Str;
          i += 2;
          continue;
        }
        i++;
        if (c === top.q) stack.pop();
        continue;
      }
      if (top.k === 'tpl') {
        if (c === '\\') {
          cls[i] = SynCls.Tpl;
          if (i + 1 < line.length) cls[i + 1] = SynCls.Tpl;
          i += 2;
          continue;
        }
        if (c === '`') {
          cls[i] = SynCls.Tpl;
          i++;
          stack.pop();
          continue;
        }
        if (c === '$' && line[i + 1] === '{') {
          cls[i] = SynCls.None;
          cls[i + 1] = SynCls.None;
          i += 2;
          stack.push(ts ? { k: 'code', depth: 0, tsSub: true } : { k: 'jsEmbed' });
          continue;
        }
        cls[i] = SynCls.Tpl;
        i++;
        continue;
      }
      if (top.k === 'jsEmbed') {
        // javaScriptEmbed: `${` 부터 처음 나오는 `}` 까지 (안의 문자열만 따로 인식)
        if (c === '}') {
          i++;
          stack.pop();
          continue;
        }
        if (c === '"' || c === "'") {
          cls[i] = SynCls.Str;
          stack.push({ k: 'str', q: c });
          i++;
          continue;
        }
        if (c === '`') {
          cls[i] = SynCls.Tpl;
          stack.push({ k: 'tpl' });
          i++;
          continue;
        }
        i++;
        continue;
      }
      // code
      if (c === '/' && line[i + 1] === '/') {
        for (let j = i; j < line.length; j++) cls[j] = SynCls.LineComment;
        i = line.length;
        continue;
      }
      if (c === '/' && line[i + 1] === '*') {
        cls[i] = SynCls.Comment;
        cls[i + 1] = SynCls.Comment;
        i += ts && line[i + 2] === '*' ? 3 : 2;
        if (i - 1 < line.length) cls[i - 1] = SynCls.Comment;
        stack.push({ k: 'comment' });
        continue;
      }
      if (c === '"' || c === "'") {
        cls[i] = SynCls.Str;
        stack.push({ k: 'str', q: c });
        i++;
        continue;
      }
      if (c === '`') {
        cls[i] = SynCls.Tpl;
        stack.push({ k: 'tpl' });
        i++;
        continue;
      }
      if (c === '/') {
        const end = ts ? tsRegexEnd(line, i) : jsRegexEnd(line, i);
        if (end > i) {
          for (let j = i; j < end; j++) cls[j] = SynCls.Regex;
          i = end;
          continue;
        }
      }
      if (top.k === 'code' && top.tsSub) {
        if (c === '{') top.depth++;
        else if (c === '}') {
          if (top.depth === 0) {
            stack.pop();
            i++;
            continue;
          }
          top.depth--;
        }
      }
      i++;
    }
    // 줄 끝: JS 문자열은 항상, TS 문자열은 줄 끝이 `\` 가 아니면 끝납니다.
    const top = stack[stack.length - 1];
    if (top.k === 'str' && (!ts || !line.endsWith('\\') || isEscapedBackslashEnd(line))) stack.pop();
    const ws = leadingWs(line);
    out.push({ lead: ws > 0 ? cls[0] ?? lead : lead, body: cls.slice(ws) });
  }
  return out;
}

/** 줄 끝의 `\` 가 앞의 `\` 와 짝을 이룬 이스케이프(`\\`)이면 참. */
function isEscapedBackslashEnd(line: string): boolean {
  let n = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) n++;
  return n % 2 === 0;
}

/**
 * 줄별 구문 분류. `=` 가 줄 앞 공백을 바꿔도 공백 뒤 글자의 분류는 그대로이므로,
 * 현재 줄 내용(앞 공백 길이)에 맞춰 열 → 분류를 돌려줍니다.
 */
export class JsSyntax {
  private readonly syn: LineSyn[];

  constructor(
    private readonly lines: string[],
    dialect: JsSyntaxDialect
  ) {
    this.syn = classify(lines, dialect);
  }

  /** `lnum`(1부터) 줄 `col`(1부터) 글자의 분류. 줄 밖이면 None. */
  at(lnum: number, col: number): SynCls {
    const line = this.lines[lnum - 1];
    const s = this.syn[lnum - 1];
    if (line === undefined || s === undefined || col < 1 || col > line.length) return SynCls.None;
    const ws = leadingWs(line);
    if (col <= ws) return s.lead;
    return s.body[col - 1 - ws] ?? SynCls.None;
  }
}
