import { CursorPosition } from '../types/vim';
import { getSentenceStarts } from './textObjects';

/**
 * 보조 모션 (:help motion.txt)
 * - ( )        : 이전 / 다음 문장 시작 (exclusive)
 * - ge gE      : 이전 단어 / WORD 의 끝 (inclusive, 뒤로)
 * - g_         : [count-1] 줄 아래의 마지막 공백 아닌 문자 (inclusive)
 * - + Enter -  : [count] 줄 아래 / 위의 첫 공백 아닌 문자 (linewise)
 * - |          : [count] 번째 칸 (exclusive)
 * - [( [{ ]) ]}: [count] 번째로 감싸고 있는 짝 없는 괄호 (exclusive)
 *
 * 이동할 수 없으면 null (Vim 의 beep) 을 반환합니다.
 */

export type MotionKind = 'exclusive' | 'inclusive' | 'linewise';

export interface MotionResult {
  target: CursorPosition;
  kind: MotionKind;
}

export const EXTRA_MOTION_KEYS = new Set(['(', ')', '+', '-', 'Enter', '|', 'ge', 'gE', 'g_', '[(', '[{', '])', ']}']);

function firstNonBlankCol(text: string): number {
  const m = text.match(/^\s*/);
  const col = m ? m[0].length : 0;
  return col >= text.length ? Math.max(0, text.length - 1) : col;
}

function comparePos(a: CursorPosition, b: CursorPosition): number {
  return a.line - b.line || a.col - b.col;
}

// ---- ge / gE ----------------------------------------------------------------

type CharClass = 'space' | 'word' | 'punct' | 'empty';

function charClass(ch: string | undefined, bigWord: boolean): CharClass {
  if (ch === undefined || /\s/.test(ch)) return 'space';
  if (bigWord) return 'word';
  return /\w/.test(ch) ? 'word' : 'punct';
}

/** 뒤로 한 칸 이동. 줄 경계는 공백 한 칸으로 취급하며 빈 줄은 하나의 단어로 봅니다. */
function stepBack(lines: string[], pos: CursorPosition & { virtualEol?: boolean }): (CursorPosition & { virtualEol?: boolean }) | null {
  if (pos.virtualEol) {
    // 가상 줄 끝 → 그 줄의 마지막 문자 (빈 줄이면 빈 줄 자체)
    const len = (lines[pos.line] ?? '').length;
    return { line: pos.line, col: Math.max(0, len - 1) };
  }
  if (pos.col > 0) return { line: pos.line, col: pos.col - 1 };
  if (pos.line === 0) return null;
  return { line: pos.line - 1, col: 0, virtualEol: true };
}

function classAt(lines: string[], pos: CursorPosition & { virtualEol?: boolean }, bigWord: boolean): CharClass {
  if (pos.virtualEol) return 'space';
  const text = lines[pos.line] ?? '';
  if (text.length === 0) return 'empty';
  return charClass(text[pos.col], bigWord);
}

function wordEndBackward(lines: string[], cursor: CursorPosition, bigWord: boolean): CursorPosition | null {
  const startClass = classAt(lines, cursor, bigWord);
  let pos = stepBack(lines, cursor);
  // 1. 현재 단어를 벗어날 때까지 뒤로
  if (startClass === 'word' || startClass === 'punct') {
    while (pos && classAt(lines, pos, bigWord) === startClass) pos = stepBack(lines, pos);
  }
  // 2. 공백(줄 경계 포함)을 건너뛰면 이전 단어의 끝
  while (pos && classAt(lines, pos, bigWord) === 'space') pos = stepBack(lines, pos);
  return pos ? { line: pos.line, col: pos.col } : null;
}

// ---- [( ]) ------------------------------------------------------------------

function findUnmatched(
  lines: string[],
  cursor: CursorPosition,
  open: string,
  close: string,
  forward: boolean,
  count: number
): CursorPosition | null {
  let depth = 0;
  let found = 0;
  let { line, col } = cursor;
  for (;;) {
    // 한 칸 이동 (커서 위치의 문자는 제외)
    if (forward) {
      col++;
      while (line < lines.length && col >= (lines[line] ?? '').length) {
        line++;
        col = 0;
      }
      if (line >= lines.length) return null;
    } else {
      col--;
      while (col < 0) {
        line--;
        if (line < 0) return null;
        col = (lines[line] ?? '').length - 1;
      }
    }
    const ch = lines[line][col];
    const opener = forward ? open : close;
    const target = forward ? close : open;
    if (ch === opener) {
      depth++;
    } else if (ch === target) {
      if (depth === 0) {
        if (++found === count) return { line, col };
      } else {
        depth--;
      }
    }
  }
}

// ---- 공통 진입점 ----------------------------------------------------------------

/**
 * @param count 반복 횟수 (| 에서는 칸 번호). 생략하면 1.
 */
export function evaluateExtraMotion(
  lines: string[],
  cursor: CursorPosition,
  key: string,
  count = 1
): MotionResult | null {
  const n = Math.max(1, count);
  const last = lines.length - 1;

  switch (key) {
    case '+':
    case 'Enter': {
      if (cursor.line >= last) return null;
      const line = Math.min(last, cursor.line + n);
      return { target: { line, col: firstNonBlankCol(lines[line] ?? '') }, kind: 'linewise' };
    }
    case '-': {
      if (cursor.line <= 0) return null;
      const line = Math.max(0, cursor.line - n);
      return { target: { line, col: firstNonBlankCol(lines[line] ?? '') }, kind: 'linewise' };
    }
    case '|': {
      const len = (lines[cursor.line] ?? '').length;
      return { target: { line: cursor.line, col: Math.max(0, Math.min(n - 1, len - 1)) }, kind: 'exclusive' };
    }
    case 'g_': {
      const line = cursor.line + n - 1;
      if (line > last) return null;
      const text = lines[line] ?? '';
      const trimmedLen = text.replace(/\s+$/, '').length;
      return { target: { line, col: Math.max(0, trimmedLen - 1) }, kind: 'inclusive' };
    }
    case 'ge':
    case 'gE': {
      let pos: CursorPosition | null = cursor;
      for (let i = 0; i < n && pos; i++) pos = wordEndBackward(lines, pos, key === 'gE');
      return pos ? { target: pos, kind: 'inclusive' } : null;
    }
    case ')':
    case '(': {
      const starts = getSentenceStarts(lines);
      let pos = cursor;
      for (let i = 0; i < n; i++) {
        if (key === ')') {
          const next = starts.find((s) => comparePos(s, pos) > 0);
          if (next) {
            pos = next;
            continue;
          }
          // 마지막 문장 뒤에서는 버퍼의 마지막 문자로
          const end = { line: last, col: Math.max(0, (lines[last] ?? '').length - 1) };
          if (comparePos(end, pos) <= 0) return i === 0 ? null : { target: pos, kind: 'exclusive' };
          pos = end;
        } else {
          const prev = [...starts].reverse().find((s) => comparePos(s, pos) < 0);
          if (!prev) {
            if (pos.line === 0 && pos.col === 0) return i === 0 ? null : { target: pos, kind: 'exclusive' };
            pos = { line: 0, col: 0 };
            continue;
          }
          pos = prev;
        }
      }
      return { target: pos, kind: 'exclusive' };
    }
    case '[(':
    case '[{':
    case '])':
    case ']}': {
      const open = key[1] === '(' || key[1] === ')' ? '(' : '{';
      const close = open === '(' ? ')' : '}';
      const target = findUnmatched(lines, cursor, open, close, key[0] === ']', n);
      return target ? { target, kind: 'exclusive' } : null;
    }
  }
  return null;
}
