import { CursorPosition } from './types';
import { isKeywordChar } from './wordMotion';
import type { TextObjectRange } from './textObjectsExtended';
import { toOperatorRange } from './vimPosition';

/**
 * 연산자와 함께 쓴 `[count]iw` / `[count]aw` / `iW` / `aW` 범위 (Vim textobject.c 의 current_word 이식).
 * 커서 이동 헬퍼(inc/dec/incl/decl, fwd_word, end_word, back_in_line)도 Vim 과 같게 줄바꿈을 한 칸으로 셉니다.
 * 결과의 배타적 끝이 다음 줄 0열이면 :help exclusive-linewise 규칙(시작이 들여쓰기 안이면 줄 단위)을 적용합니다.
 * 실패하면 `{ failed }` 입니다 (Vim 의 FAIL → 연산자 취소, 커서는 움직인 자리에 남음).
 */
export function getCountedWordObjectRange(
  lines: string[],
  cursor: CursorPosition,
  include: boolean,
  bigword: boolean,
  count: number
): TextObjectRange | { failed: CursorPosition } {
  const last = lines.length - 1;
  const len = (l: number) => (lines[l] ?? '').length;
  let cur: CursorPosition = { line: cursor.line, col: Math.min(cursor.col, len(cursor.line)) };

  const clampNormal = (p: CursorPosition): CursorPosition => ({ line: p.line, col: Math.max(0, Math.min(p.col, len(p.line) - 1)) });
  const cls = (p: CursorPosition = cur): number => {
    const ch = (lines[p.line] ?? '')[p.col];
    if (ch === undefined || ch === ' ' || ch === '\t') return 0;
    if (bigword) return 1;
    return isKeywordChar(ch) ? 2 : 1;
  };
  const inc = (): number => {
    if (cur.col < len(cur.line)) {
      cur = { line: cur.line, col: cur.col + 1 };
      return cur.col < len(cur.line) ? 0 : 2;
    }
    if (cur.line < last) {
      cur = { line: cur.line + 1, col: 0 };
      return 1;
    }
    return -1;
  };
  const dec = (): number => {
    if (cur.col > 0) {
      cur = { line: cur.line, col: cur.col - 1 };
      return 0;
    }
    if (cur.line > 0) {
      cur = { line: cur.line - 1, col: len(cur.line - 1) };
      return 1;
    }
    return -1;
  };
  const incl = (): number => {
    let r = inc();
    if (r >= 1 && cur.col) r = inc();
    return r;
  };
  const decl = (): number => {
    let r = dec();
    if (r === 1 && cur.col) r = dec();
    return r;
  };
  const oneleft = (): boolean => {
    if (cur.col === 0) return false;
    cur = { line: cur.line, col: cur.col - 1 };
    return true;
  };
  const backInLine = () => {
    const sclass = cls();
    for (;;) {
      if (cur.col === 0) break;
      dec();
      if (cls() !== sclass) {
        inc();
        break;
      }
    }
  };
  /** fwd_word(1, bigword, eol=TRUE) */
  const fwdWord = (): boolean => {
    const sclass = cls();
    const lastLine = cur.line === last;
    let i = inc();
    if (i === -1 || (i >= 1 && lastLine)) return false;
    if (i >= 1) return true;
    if (sclass !== 0) {
      while (cls() === sclass) {
        i = inc();
        if (i === -1 || i >= 1) return true;
      }
    }
    while (cls() === 0) {
      if (cur.col === 0 && len(cur.line) === 0) break;
      i = inc();
      if (i === -1 || i >= 1) return true;
    }
    return true;
  };
  const skipChars = (cclass: number): boolean => {
    while (cls() === cclass) if (inc() === -1) return true;
    return false;
  };
  /** end_word(1, bigword, stop=TRUE, empty=TRUE) */
  const endWord = (): boolean => {
    const sclass = cls();
    if (inc() === -1) return false;
    if (cls() === sclass && sclass !== 0) {
      if (skipChars(sclass)) return false;
    } else if (sclass === 0) {
      while (cls() === 0) {
        if (cur.col === 0 && len(cur.line) === 0) return true;
        if (inc() === -1) return false;
      }
      if (skipChars(cls())) return false;
    } else {
      // stop: 단어 끝에서 시작하면 그 자리에 머뭅니다.
    }
    dec();
    return true;
  };

  let inclusive = true;
  let includeWhite = false;
  backInLine();
  const startPos = { ...cur };
  let start = { ...cur };
  if ((cls() === 0) === include) {
    if (!endWord()) return { failed: clampNormal(cur) };
  } else {
    fwdWord();
    if (cur.col === 0) decl();
    else oneleft();
    if (include) includeWhite = true;
  }
  let remaining = count - 1;
  while (remaining > 0) {
    inclusive = true;
    if (incl() === -1) return { failed: clampNormal(cur) };
    if (include !== (cls() === 0)) {
      if (!fwdWord() && remaining > 1) return { failed: clampNormal(cur) };
      if (!oneleft()) inclusive = false;
    } else if (!endWord()) {
      return { failed: clampNormal(cur) };
    }
    remaining--;
  }
  if (includeWhite && (cls() !== 0 || (cur.col === 0 && !inclusive))) {
    const pos = cur;
    cur = { ...startPos };
    if (oneleft()) {
      backInLine();
      if (cls() === 0 && cur.col > 0) start = { ...cur };
    }
    cur = pos;
  }

  return toOperatorRange(lines, start, cur, inclusive);
}
