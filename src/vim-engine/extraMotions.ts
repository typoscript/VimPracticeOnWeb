import { CursorPosition } from './types';
import { isKeywordChar } from './wordMotion';
import { getSentenceStarts, findFunctionJumpTarget } from './textObjects';

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

export const EXTRA_MOTION_KEYS = new Set([
  '(', ')', '+', '-', '_', 'Enter', '|', 'ge', 'gE', 'g_', 'g^', '[(', '[{', '])', ']}',
  '[[', ']]', '[]', '][', '[m', ']m', '[M', ']M', '[f', ']f', '[F', ']F',
  '[/', ']/', '[*', ']*',
  'g0', 'g$', 'gm', 'gM', 'go',
]);

/**
 * [count]% 점프 대상 계산 (1..100 범위, Neovim 기본 nostartofline 규칙에 따라 열 유지/클램프). 범위를 벗어나면 null.
 */
export function computePercentJumpTarget(
  lines: string[],
  percent: number,
  currentCol = 0,
  startOfLine = false
): CursorPosition | null {
  if (percent < 1 || percent > 100 || lines.length === 0) return null;
  const line1Based = Math.floor((percent * lines.length + 99) / 100);
  const line = Math.max(0, Math.min(lines.length - 1, line1Based - 1));
  if (startOfLine) {
    return { line, col: firstNonBlankCol(lines[line] ?? '') };
  }
  const maxCol = Math.max(0, (lines[line] ?? '').length - 1);
  return { line, col: Math.max(0, Math.min(currentCol, maxCol)) };
}

function utf8CharByteLen(cp: number): number {
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

/**
 * [count]go 바이트 오프셋 점프 (1-based UTF-8 바이트 위치, 줄바꿈 '\n' 1바이트 포함).
 */
export function computeByteOffsetTarget(lines: string[], byteOffset1Based: number): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };
  let rem = Math.max(0, byteOffset1Based - 1);
  for (let l = 0; l < lines.length; l++) {
    const text = lines[l] ?? '';
    for (let col = 0; col < text.length; ) {
      const cp = text.codePointAt(col) ?? 0;
      const step = cp > 0xffff ? 2 : 1;
      const bLen = utf8CharByteLen(cp);
      if (rem < bLen) {
        return { line: l, col };
      }
      rem -= bLen;
      col += step;
    }
    // 줄바꿈('\n') 1바이트
    if (rem === 0) {
      return { line: l, col: Math.max(0, text.length - 1) };
    }
    rem -= 1;
  }
  const lastLine = lines.length - 1;
  return { line: lastLine, col: Math.max(0, (lines[lastLine] ?? '').length - 1) };
}

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
  return isKeywordChar(ch) ? 'word' : 'punct';
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
    case '_': {
      const line = cursor.line + n - 1;
      if (line > last) return null;
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
          // Vim: count 만큼 움직일 수 없으면 모션 전체가 실패합니다 (5) 가 끝에서 멈추지 않음).
          if (comparePos(end, pos) <= 0) return null;
          pos = end;
        } else {
          const prev = [...starts].reverse().find((s) => comparePos(s, pos) < 0);
          if (!prev) {
            if (pos.line === 0 && pos.col === 0) return null;
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
    case '[[':
    case ']]':
    case '[]':
    case '][': {
      const targetChar = key === '[[' || key === ']]' ? '{' : '}';
      const forward = key === ']]' || key === '][';
      let found = 0;
      if (forward) {
        for (let line = cursor.line + 1; line <= last; line++) {
          if ((lines[line] ?? '').startsWith(targetChar) && ++found === n) {
            return { target: { line, col: 0 }, kind: 'exclusive' };
          }
        }
        if (cursor.line === last && cursor.col === 0) return null;
        return { target: { line: last, col: 0 }, kind: 'exclusive' };
      }
      if (cursor.col > 0 && (lines[cursor.line] ?? '').startsWith(targetChar) && ++found === n) {
        return { target: { line: cursor.line, col: 0 }, kind: 'exclusive' };
      }
      for (let line = cursor.line - 1; line >= 0; line--) {
        if ((lines[line] ?? '').startsWith(targetChar) && ++found === n) {
          return { target: { line, col: 0 }, kind: 'exclusive' };
        }
      }
      if (cursor.line === 0 && cursor.col === 0) return null;
      return { target: { line: 0, col: 0 }, kind: 'exclusive' };
    }
    // ]m, [m: 다음/이전 메서드·블록 여는 중괄호 '{' 로 이동 (:help ]m / [m)
    // ]M, [M: 다음/이전 메서드·블록 닫는 중괄호 '}' 로 이동 (:help ]M / [M)
    case ']m':
    case '[m':
    case ']M':
    case '[M': {
      const targetChar = key === ']m' || key === '[m' ? '{' : '}';
      const forward = key === ']m' || key === ']M';
      let found = 0;
      if (forward) {
        for (let line = cursor.line; line <= last; line++) {
          const text = lines[line] ?? '';
          const startCol = line === cursor.line ? cursor.col + 1 : 0;
          for (let col = startCol; col < text.length; col++) {
            if (text[col] === targetChar && ++found === n) {
              return { target: { line, col }, kind: 'exclusive' };
            }
          }
        }
        return null;
      }
      for (let line = cursor.line; line >= 0; line--) {
        const text = lines[line] ?? '';
        const startCol = line === cursor.line ? cursor.col - 1 : text.length - 1;
        for (let col = startCol; col >= 0; col--) {
          if (text[col] === targetChar && ++found === n) {
            return { target: { line, col }, kind: 'exclusive' };
          }
        }
      }
      return null;
    }
    // ]f, [f, ]F, [F: Treesitter 스타일 다음/이전 함수 시작·끝 점프
    case ']f':
    case '[f':
    case ']F':
    case '[F': {
      const target = findFunctionJumpTarget(lines, cursor, key, n);
      return target ? { target, kind: 'exclusive' } : null;
    }
    // [/ / [* : 이전 C 블록 주석 시작(/*) 점프, ]/ / ]* : 다음 C 블록 주석 끝(*/) 점프
    case '[/':
    case '[*':
    case ']/':
    case ']*': {
      const forward = key[0] === ']';
      const token = forward ? '*/' : '/*';
      let found = 0;
      if (forward) {
        for (let line = cursor.line; line <= last; line++) {
          const text = lines[line] ?? '';
          let searchFrom = line === cursor.line ? cursor.col + 1 : 0;
          while (searchFrom <= text.length - 2) {
            const idx = text.indexOf(token, searchFrom);
            if (idx === -1) break;
            if (++found === n) {
              return { target: { line, col: idx }, kind: 'exclusive' };
            }
            searchFrom = idx + 1;
          }
        }
        return null;
      }
      for (let line = cursor.line; line >= 0; line--) {
        const text = lines[line] ?? '';
        const maxStart = line === cursor.line ? cursor.col - 1 : text.length - 2;
        for (let col = Math.min(maxStart, text.length - 2); col >= 0; col--) {
          if (text.slice(col, col + 2) === token && ++found === n) {
            return { target: { line, col }, kind: 'exclusive' };
          }
        }
      }
      return null;
    }
    case 'g0':
      return { target: { line: cursor.line, col: 0 }, kind: 'exclusive' };
    case 'g^':
      return { target: { line: cursor.line, col: firstNonBlankCol(lines[cursor.line] ?? '') }, kind: 'exclusive' };
    case 'g$': {
      const len = (lines[cursor.line] ?? '').length;
      return { target: { line: cursor.line, col: Math.max(0, len - 1) }, kind: 'inclusive' };
    }
    case 'gm': {
      const len = (lines[cursor.line] ?? '').length;
      const halfScreenCol = Math.max(0, 40 * n - 1);
      return { target: { line: cursor.line, col: Math.min(Math.max(0, len - 1), halfScreenCol) }, kind: 'exclusive' };
    }
    case 'gM': {
      const len = (lines[cursor.line] ?? '').length;
      return { target: { line: cursor.line, col: Math.min(Math.max(0, len - 1), Math.floor(len / 2)) }, kind: 'exclusive' };
    }
    case 'go':
      return { target: computeByteOffsetTarget(lines, n), kind: 'exclusive' };
  }
  return null;
}
