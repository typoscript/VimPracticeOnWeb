import { msg } from './messages';
import { VimScriptError, toNumber } from './vimscriptValues';

export type Token = (
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'name'; value: string }
  | { type: 'reg'; value: string }
  | { type: 'opt'; value: string }
  | { type: 'op'; value: string }
  | { type: 'eof'; value?: undefined }
) & { space: boolean; start: number; end: number };

const OPERATORS = [
  '==#', '==?', '!=#', '!=?', '>=#', '>=?', '<=#', '<=?', '=~#', '=~?', '!~#', '!~?',
  '..', '==', '!=', '>=', '<=', '=~', '!~', '&&', '||', '#{',
  '>#', '>?', '<#', '<?',
  '->',
  '+', '-', '*', '/', '%', '.', '!', '<', '>', '(', ')', '[', ']', '{', '}', ',', '?', ':',
];

/** Vim script 표현식 문자열을 토큰 배열로 분리합니다. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let space = false;
  const push = (t: Omit<Token, 'space' | 'start' | 'end'>, start: number, end: number) => {
    tokens.push({ ...t, space, start, end } as Token);
    space = false;
  };
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      space = true;
      i++;
      continue;
    }
    // 숫자
    const num = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+)/);
    if (num) {
      const len = num[1].length;
      push({ type: 'num', value: toNumber(num[1]) }, i, i + len);
      i += len;
      continue;
    }
    // "문자열"
    if (ch === '"') {
      let out = '';
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) {
          const esc = src[j + 1];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'e' ? '\x1b' : esc;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new VimScriptError(msg('E114: 큰따옴표가 닫히지 않았습니다: {v}', { v: src.slice(i) }));
      push({ type: 'str', value: out }, i, j + 1);
      i = j + 1;
      continue;
    }
    // '문자열'
    if (ch === "'") {
      let out = '';
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            out += "'";
            j += 2;
            continue;
          }
          break;
        }
        out += src[j++];
      }
      if (j >= src.length) throw new VimScriptError(msg('E115: 작은따옴표가 닫히지 않았습니다: {v}', { v: src.slice(i) }));
      push({ type: 'str', value: out }, i, j + 1);
      i = j + 1;
      continue;
    }
    // @r 레지스터
    if (ch === '@' && i + 1 < src.length) {
      push({ type: 'reg', value: src[i + 1] }, i, i + 2);
      i += 2;
      continue;
    }
    // &option / &g:option / &l:option
    if (ch === '&' && src[i + 1] !== '&') {
      const optMatch = src.slice(i).match(/^&(?:[gl]:)?[A-Za-z_][A-Za-z0-9_]*/);
      if (optMatch) {
        const len = optMatch[0].length;
        push({ type: 'opt', value: optMatch[0] }, i, i + len);
        i += len;
        continue;
      }
    }
    // a:0, a:1, a:000 (가변 인자)
    const argIdx = src.slice(i).match(/^a:\d+/);
    if (argIdx) {
      const len = argIdx[0].length;
      push({ type: 'name', value: argIdx[0] }, i, i + len);
      i += len;
      continue;
    }
    // 이름 (g:x, a:name, v:true, Func)
    const name = src.slice(i).match(/^([gblwtsav]:)?[A-Za-z_][A-Za-z0-9_]*/);
    if (name) {
      const len = name[0].length;
      push({ type: 'name', value: name[0] }, i, i + len);
      i += len;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      push({ type: 'op', value: op }, i, i + op.length);
      i += op.length;
      continue;
    }
    throw new VimScriptError(msg('E15: 잘못된 표현식입니다: "{src}"', { src }));
  }
  push({ type: 'eof' }, i, i);
  return tokens;
}
