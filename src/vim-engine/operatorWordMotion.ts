import { CursorPosition } from './types';
import { isKeywordChar } from './wordMotion';
import { vimPositionOps } from './vimPosition';

/**
 * 연산자와 함께 쓴 `w` / `W` / `e` / `E` 의 끝 위치 (Vim normal.c nv_wordcmd + textobject.c fwd_word / end_word 이식).
 *
 * - `w`/`W` 는 배타적이고 fwd_word(eol=TRUE): 마지막으로 건너는 단어가 줄 끝이면 다음 줄로 넘어가지 않고 줄 끝(NUL)에서 멈춥니다.
 * - `e`/`E` 와 비공백 위의 `cw`/`cW`(= `ce`, end_word 의 stop=TRUE) 는 포함 모션입니다.
 * - 끝이 줄 끝(NUL) 너머면 한 칸 당기고 포함 모션이 됩니다 (adjust_cursor).
 * - 연산자가 있으면 FAIL(버퍼 끝)도 오류가 아니고, 움직인 데까지가 범위입니다.
 */
export function operatorWordMotionEnd(
  lines: string[],
  cursor: CursorPosition,
  key: 'w' | 'W' | 'e' | 'E',
  count: number,
  op: 'd' | 'c' | 'y'
): { end: CursorPosition; inclusive: boolean } {
  const ops = vimPositionOps(lines);
  const bigword = key === 'W' || key === 'E';
  const len = (l: number) => (lines[l] ?? '').length;
  let cur: CursorPosition = { line: cursor.line, col: Math.min(cursor.col, len(cursor.line)) };
  const start = { ...cur };
  const cls = (): number => {
    const ch = ops.gchar(cur);
    if (ch === '' || ch === ' ' || ch === '\t') return 0;
    if (bigword) return 1;
    return isKeywordChar(ch) ? 2 : 1;
  };
  const inc = (): number => {
    const [q, r] = ops.inc(cur);
    cur = q;
    return r;
  };
  const dec = () => {
    cur = ops.dec(cur)[0];
  };
  const emptyLine = () => cur.col === 0 && len(cur.line) === 0;

  /** fwd_word(count, bigword, eol=TRUE) */
  const fwdWord = (n: number) => {
    while (--n >= 0) {
      const sclass = cls();
      const lastLine = cur.line === ops.lastLine;
      let i = inc();
      if (i === -1 || (i >= 1 && lastLine)) return;
      if (i >= 1 && n === 0) return;
      if (sclass !== 0) {
        while (cls() === sclass) {
          i = inc();
          if (i === -1 || (i >= 1 && n === 0)) return;
        }
      }
      while (cls() === 0) {
        if (emptyLine()) break;
        i = inc();
        if (i === -1 || (i >= 1 && n === 0)) return;
      }
    }
  };
  /** skip_chars(cclass, FORWARD): 버퍼 끝에 닿으면 true */
  const skipChars = (cclass: number): boolean => {
    while (cls() === cclass) if (inc() === -1) return true;
    return false;
  };
  /** end_word(count, bigword, stop, empty=FALSE) */
  const endWord = (n: number, stop: boolean) => {
    while (--n >= 0) {
      const sclass = cls();
      if (inc() === -1) return;
      if (cls() === sclass && sclass !== 0) {
        if (skipChars(sclass)) return;
      } else if (!stop || sclass === 0) {
        while (cls() === 0) {
          if (inc() === -1) return;
        }
        if (skipChars(cls())) return;
      }
      dec();
      stop = false;
    }
  };

  let wordEnd = key === 'e' || key === 'E';
  let inclusive = wordEnd;
  let stop = false;
  // cw / cW 는 비공백 위에서 ce / cE 처럼 동작합니다 (공백 위에서는 'cpoptions' 에 w 가 없으면 dw 와 같음).
  if (!wordEnd && op === 'c') {
    const ch = ops.gchar(cur);
    if (ch !== '' && ch !== ' ' && ch !== '\t') {
      wordEnd = true;
      inclusive = true;
      stop = true;
    }
  }
  const n = Math.max(1, count);
  if (wordEnd) endWord(n, stop);
  else fwdWord(n);

  // adjust_cursor: 앞으로 움직였고 줄 끝(NUL)에 섰으면 한 칸 당기고 포함 범위로
  const moved = cur.line > start.line || (cur.line === start.line && cur.col > start.col);
  if (moved && cur.col > 0 && cur.col >= len(cur.line)) {
    cur = { line: cur.line, col: cur.col - 1 };
    inclusive = true;
  }
  return { end: cur, inclusive };
}
