/**
 * 파일타입 들여쓰기('indentexpr'): Neovim 은 `filetype plugin indent on` 이 기본이라 JS/TS 버퍼의 `=` 가
 * cindent 대신 runtime/indent/{javascript,typescript}.vim 을 씁니다. 여기서는 그 두 스크립트의 포팅
 * (`jsIndent.ts`, `tsIndent.ts`)을 op_reindent 처럼 위에서부터 한 줄씩 적용합니다.
 * javascriptreact / typescriptreact 는 Neovim 에서도 같은 스크립트를 불러옵니다.
 */
import type { CIndentOptions } from './cindent';
import { createJsIndenter } from './jsIndent';
import { createTsIndenter } from './tsIndent';

export type JsIndentKind = 'javascript' | 'typescript';

/** 'filetype' 값 → 들여쓰기 스크립트. JS/TS 가 아니면 null. */
export function jsIndentKindForFiletype(filetype: string | undefined): JsIndentKind | null {
  const ft = (filetype ?? '').trim().toLowerCase();
  if (ft === 'typescript' || ft === 'typescriptreact' || ft === 'ts' || ft === 'tsx') return 'typescript';
  if (ft === 'javascript' || ft === 'javascriptreact' || ft === 'js' || ft === 'jsx') return 'javascript';
  return null;
}

/** 파일 이름으로 감지한 파일타입 (Neovim filetype.lua 의 확장자 규칙 중 JS/TS). */
export function jsIndentKindForFilename(filename: string | undefined): JsIndentKind | null {
  const m = /\.([A-Za-z]+)$/.exec((filename ?? '').trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'typescript';
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  return null;
}

function makeIndent(amount: number, opts: CIndentOptions): string {
  if (opts.expandtab) return ' '.repeat(amount);
  const ts = opts.tabstop > 0 ? opts.tabstop : 8;
  return '\t'.repeat(Math.floor(amount / ts)) + ' '.repeat(amount % ts);
}

function displayWidth(ws: string, opts: CIndentOptions): number {
  const ts = opts.tabstop > 0 ? opts.tabstop : 8;
  let w = 0;
  for (const c of ws) w = c === '\t' ? w + ts - (w % ts) : w + 1;
  return w;
}

/**
 * op_reindent + get_expr_indent: 줄 범위 [fromLine, toLine](0부터)를 위에서부터 다시 들여씁니다.
 * 공백뿐인 줄은 빈 줄이 되고, 스크립트가 음수를 돌려주면 그 줄의 들여쓰기 폭을 유지합니다.
 */
export function indentexprLines(
  lines: string[],
  fromLine: number,
  toLine: number,
  opts: CIndentOptions,
  kind: JsIndentKind
): string[] {
  const out = [...lines];
  const minLine = Math.max(0, Math.min(fromLine, toLine));
  const maxLine = Math.min(out.length - 1, Math.max(fromLine, toLine));
  const indentOf = kind === 'typescript' ? createTsIndenter(out, opts) : createJsIndenter(out, opts);
  for (let i = minLine; i <= maxLine; i++) {
    const line = out[i];
    const textStart = line.search(/[^ \t]/);
    if (textStart < 0) {
      out[i] = '';
      continue;
    }
    let amount = indentOf(i + 1);
    // get_expr_indent: 음수면 지금 들여쓰기를 유지하지만, set_indent 가 'expandtab' 에 맞춰 공백 문자를 다시 씁니다.
    if (amount < 0) amount = displayWidth(line.slice(0, textStart), opts);
    out[i] = makeIndent(amount, opts) + line.slice(textStart);
  }
  return out;
}
