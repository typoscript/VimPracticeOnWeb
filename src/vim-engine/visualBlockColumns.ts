import type { CursorPosition, VimEditorState } from './types';
import { tabstopOf } from './virtualColumn';

/**
 * 블록 비주얼 연산의 화면 열(virtual column) 계산 — Neovim ops.c 의 get_op_vcol()·block_prep() 이식.
 * 블록의 왼쪽·오른쪽 끝은 바이트 열이 아니라 화면 열이라, 탭이 든 줄에서는 같은 화면 위치를 덮는 글자가 줄마다 다릅니다.
 * 블록 끝이 탭 가운데를 지나면 Vim 은 그 탭을 공백으로 나눕니다(startspaces / endspaces).
 * 이 파일은 문자열만 다루는 순수 로직입니다 (글자 폭은 탭만 'tabstop' 에 따라 다르고 나머지는 1칸).
 */

export type BlockOpType = 'yank' | 'delete' | 'change' | 'insert' | 'append' | 'replace' | 'lshift' | 'rshift' | 'tilde';

/** Vim oparg_T 의 블록 정보: 줄 범위와 화면 열 범위 (end 포함) */
export interface BlockOperand {
  startLine: number;
  endLine: number;
  startVcol: number;
  endVcol: number;
  /** `$` 로 늘린 블록 (curswant == MAXCOL) */
  isMax: boolean;
  /** oap->start.col: 첫 줄에서 startVcol 을 덮는 글자 (coladvance, 줄보다 오른쪽이면 줄 길이) */
  startCol: number;
  ts: number;
}

/** Vim struct block_def */
export interface BlockDef {
  startspaces: number;
  endspaces: number;
  textlen: number;
  textcol: number;
  startVcol: number;
  endVcol: number;
  isShort: boolean;
  isOneChar: boolean;
  preWhitesp: number;
  preWhitespC: number;
  startCharVcols: number;
  endCharVcols: number;
}

export function charWidthAt(ch: string, vcol: number, ts: number): number {
  return ch === '\t' ? ts - (vcol % ts) : 1;
}

/** 줄 전체의 화면 폭 */
export function lineDisplayWidth(line: string, ts: number): number {
  let v = 0;
  for (let i = 0; i < line.length; i++) v += charWidthAt(line[i], v, ts);
  return v;
}

/** Vim getvvcol: col 글자가 차지하는 화면 열 [시작, 끝]. 줄 끝 다음 칸(NUL)·그 너머(virtualedit)는 한 칸입니다. */
export function charVcolSpan(line: string, col: number, ts: number): [number, number] {
  let v = 0;
  for (let i = 0; i < col && i < line.length; i++) v += charWidthAt(line[i], v, ts);
  if (col >= line.length) {
    const s = v + (col - line.length);
    return [s, s];
  }
  return [v, v + charWidthAt(line[col], v, ts) - 1];
}

/** coladvance (비주얼 중이라 NUL 칸 허용): vcol 을 덮는 글자의 바이트 열, 줄보다 오른쪽이면 줄 길이 */
export function colForVcol(line: string, vcol: number, ts: number): number {
  let v = 0;
  for (let i = 0; i < line.length; i++) {
    const w = charWidthAt(line[i], v, ts);
    if (vcol < v + w) return i;
    v += w;
  }
  return line.length;
}

/** Vim get_op_vcol: 비주얼 블록의 줄·화면 열 범위 */
export function getBlockOperand(
  lines: readonly string[],
  anchor: CursorPosition,
  cursor: CursorPosition,
  isMax: boolean,
  ts: number
): BlockOperand {
  const startLine = Math.min(anchor.line, cursor.line);
  const endLine = Math.max(anchor.line, cursor.line);
  const [as, ae] = charVcolSpan(lines[anchor.line] ?? '', anchor.col, ts);
  const [cs, ce] = charVcolSpan(lines[cursor.line] ?? '', cursor.col, ts);
  const startVcol = Math.min(as, cs);
  let endVcol = Math.max(ae, ce);
  if (isMax) {
    // `$`: 가장 긴 줄의 NUL 칸까지 (getvvcol(MAXCOL))
    endVcol = 0;
    for (let l = startLine; l <= endLine; l++) endVcol = Math.max(endVcol, lineDisplayWidth(lines[l] ?? '', ts));
  }
  return { startLine, endLine, startVcol, endVcol, isMax, startCol: colForVcol(lines[startLine] ?? '', startVcol, ts), ts };
}

/** 상태의 비주얼 블록 범위 (visualAnchor 가 없으면 null) */
export function blockOperandOf(state: VimEditorState): BlockOperand | null {
  if (!state.visualAnchor) return null;
  return getBlockOperand(state.lines, state.visualAnchor, state.cursor, Boolean(state.visualBlockEndOfLine), tabstopOf(state));
}

/** Vim block_prep(): lnum 줄에서 블록이 덮는 바이트 구간과 탭을 나눌 때 채울 공백 수 */
export function blockPrep(line: string, op: Pick<BlockOperand, 'startVcol' | 'endVcol' | 'ts'>, opType: BlockOpType, isDel: boolean): BlockDef {
  const ts = op.ts;
  const bd: BlockDef = {
    startspaces: 0, endspaces: 0, textlen: 0, textcol: 0, startVcol: 0, endVcol: 0, isShort: false, isOneChar: false,
    preWhitesp: 0, preWhitespC: 0, startCharVcols: 0, endCharVcols: 0,
  };
  let incr = 0;
  let vcol = 0;
  let i = 0;
  let prevPstart = 0;
  while (vcol < op.startVcol && i < line.length) {
    incr = charWidthAt(line[i], vcol, ts);
    vcol += incr;
    if (line[i] === ' ' || line[i] === '\t') {
      bd.preWhitesp += incr;
      bd.preWhitespC++;
    } else {
      bd.preWhitesp = 0;
      bd.preWhitespC = 0;
    }
    prevPstart = i;
    i++;
  }
  bd.startVcol = vcol;
  let pstart = i;
  bd.startCharVcols = incr;
  if (bd.startVcol < op.startVcol) {
    // 줄이 블록 왼쪽 끝에 못 미침
    bd.endVcol = bd.startVcol;
    bd.isShort = true;
    if (!isDel || opType === 'append') bd.endspaces = op.endVcol - op.startVcol + 1;
  } else {
    bd.startspaces = bd.startVcol - op.startVcol;
    if (isDel && bd.startspaces) bd.startspaces = bd.startCharVcols - bd.startspaces;
    let pend = pstart;
    bd.endVcol = bd.startVcol;
    if (bd.endVcol > op.endVcol) {
      // 블록 전체가 글자(탭) 하나 안
      bd.isOneChar = true;
      if (opType === 'insert') {
        bd.endspaces = bd.startCharVcols - bd.startspaces;
      } else if (opType === 'append') {
        bd.startspaces += op.endVcol - op.startVcol + 1;
        bd.endspaces = bd.startCharVcols - bd.startspaces;
      } else {
        bd.startspaces = op.endVcol - op.startVcol + 1;
        if (isDel && opType !== 'lshift') {
          bd.startspaces = bd.startCharVcols - (bd.startVcol - op.startVcol);
          bd.endspaces = bd.endVcol - op.endVcol - 1;
        }
      }
    } else {
      let v = bd.endVcol;
      let j = pend;
      let prevPend = pend;
      while (v <= op.endVcol && j < line.length) {
        prevPend = j;
        incr = charWidthAt(line[j], v, ts);
        v += incr;
        j++;
      }
      bd.endVcol = v;
      pend = j;
      if (bd.endVcol <= op.endVcol && (!isDel || opType === 'append' || opType === 'replace')) {
        bd.isShort = true;
        if (opType === 'append') bd.endspaces = op.endVcol - bd.endVcol + 1;
      } else if (bd.endVcol > op.endVcol) {
        bd.endspaces = bd.endVcol - op.endVcol - 1;
        if (!isDel && bd.endspaces) {
          bd.endspaces = incr - bd.endspaces;
          if (pend !== pstart) pend = prevPend;
        }
      }
    }
    bd.endCharVcols = incr;
    if (isDel && bd.startspaces) pstart = prevPstart;
    bd.textlen = pend - pstart;
  }
  bd.textcol = pstart;
  return bd;
}

/** 블록 yank 한 줄 (Vim yank_copy_line): 나눈 탭은 공백으로 */
export function blockYankLine(line: string, op: BlockOperand): string {
  const bd = blockPrep(line, op, 'yank', false);
  return ' '.repeat(bd.startspaces) + line.slice(bd.textcol, bd.textcol + bd.textlen) + ' '.repeat(bd.endspaces);
}

/** Vim op_yank 블록 너비 (y_width + 1) */
export function blockYankWidth(op: BlockOperand): number {
  return op.endVcol - op.startVcol + (op.isMax ? 0 : 1);
}

/** 블록 삭제 한 줄 (Vim op_delete 블록): 바뀐 줄과 커서 열(첫 줄용), 지울 게 없으면 null */
export function blockDeleteLine(line: string, op: BlockOperand, opType: BlockOpType = 'delete'): { text: string; cursorCol: number } | null {
  const bd = blockPrep(line, op, opType, true);
  if (bd.textlen === 0) return null;
  const text = line.slice(0, bd.textcol) + ' '.repeat(bd.startspaces + bd.endspaces) + line.slice(bd.textcol + bd.textlen);
  return { text, cursorCol: bd.textcol + bd.startspaces };
}

/** 블록 r{char} 한 줄 (Vim op_replace 블록), 바꿀 게 없으면 null */
export function blockReplaceLine(line: string, op: BlockOperand, ch: string): string | null {
  const bd = blockPrep(line, op, 'replace', true);
  if (bd.textlen === 0) return null;
  let numc = op.endVcol - op.startVcol + 1;
  if (bd.isShort) numc -= op.endVcol - bd.endVcol + 1;
  let out = line.slice(0, bd.textcol) + ' '.repeat(bd.startspaces) + ch.repeat(Math.max(0, numc));
  if (!bd.isShort) out += ' '.repeat(bd.endspaces) + line.slice(bd.textcol + bd.textlen);
  return out;
}

/** 블록 대소문자 연산 한 줄 (Vim op_tilde 블록): 바꿀 바이트 구간 */
export function blockTextRange(line: string, op: BlockOperand): { start: number; end: number } {
  const bd = blockPrep(line, op, 'tilde', false);
  return { start: bd.textcol, end: bd.textcol + bd.textlen };
}

/** Vim tabstop_fromto: start 화면 열에서 end 까지 채울 탭·공백 수 */
function tabstopFromTo(start: number, end: number, ts: number): { tabs: number; spaces: number } {
  let spaces = end - start;
  let tabs = 0;
  const initspc = ts - (start % ts);
  if (spaces >= initspc) {
    spaces -= initspc;
    tabs++;
  }
  tabs += Math.floor(spaces / ts);
  spaces -= Math.floor(spaces / ts) * ts;
  return { tabs, spaces };
}

/** 블록 >/< 한 줄 (Vim shift_block). 빈 줄·블록에 못 미치는 줄은 그대로 */
export function blockShiftLine(line: string, op: BlockOperand, left: boolean, amount: number, sw: number, expandtab: boolean): string {
  if (line.length === 0) return line;
  const ts = op.ts;
  const bd = blockPrep(line, op, left ? 'lshift' : 'rshift', true);
  if (bd.isShort) return line;
  let total = amount * sw;
  const isWhite = (c: string | undefined) => c === ' ' || c === '\t';
  if (!left) {
    total += bd.preWhitesp;
    const wsVcol = bd.startVcol - bd.preWhitesp;
    let textstart = bd.textcol;
    if (bd.startspaces) textstart++;
    let vcol = bd.startVcol;
    while (isWhite(line[textstart])) {
      const w = charWidthAt(line[textstart], vcol, ts);
      total += w;
      vcol += w;
      textstart++;
    }
    const { tabs, spaces } = expandtab ? { tabs: 0, spaces: total } : tabstopFromTo(wsVcol, wsVcol + total, ts);
    const textcol = bd.textcol - (bd.preWhitespC - (bd.startspaces !== 0 ? 1 : 0));
    return line.slice(0, textcol) + '\t'.repeat(tabs) + ' '.repeat(spaces) + line.slice(textstart);
  }
  let nonWhite = bd.textcol;
  if (bd.startspaces) nonWhite++;
  let nonWhiteCol = bd.startVcol;
  while (isWhite(line[nonWhite])) {
    nonWhiteCol += charWidthAt(line[nonWhite], nonWhiteCol, ts);
    nonWhite++;
  }
  const blockSpaceWidth = nonWhiteCol - op.startVcol;
  const shiftAmount = Math.min(blockSpaceWidth, total);
  const destinationCol = nonWhiteCol - shiftAmount;
  let copyEnd = bd.textcol;
  let copyWidth = bd.startVcol;
  if (bd.startspaces) copyWidth -= bd.startCharVcols;
  while (copyWidth < destinationCol && copyEnd < line.length) {
    const w = charWidthAt(line[copyEnd], copyWidth, ts);
    if (copyWidth + w > destinationCol) break;
    copyWidth += w;
    copyEnd++;
  }
  const fill = destinationCol - copyWidth;
  return line.slice(0, copyEnd) + ' '.repeat(Math.max(0, fill)) + line.slice(nonWhite);
}

/**
 * 블록 I/A 에서 첫 줄에 입력한 글자를 다른 줄에 넣는 방법 (Vim block_insert).
 * 결과 줄 = 앞부분(offset 까지) + 공백 pre + 입력 + 공백 post + 나머지(offset + skip 부터).
 */
export interface BlockInsertPlan {
  offset: number;
  pre: number;
  post: number;
  skip: number;
}

export function blockInsertPlan(line: string, op: BlockOperand, append: boolean): BlockInsertPlan | null {
  const bd = blockPrep(line, op, append ? 'append' : 'insert', true);
  if (bd.isShort && !append) return null;
  let spaces = 0;
  let offset: number;
  let tsVal: number;
  if (!append) {
    tsVal = bd.startCharVcols;
    spaces = bd.startspaces;
    offset = bd.textcol;
  } else {
    tsVal = bd.endCharVcols;
    if (!bd.isShort) {
      spaces = bd.endspaces ? tsVal - bd.endspaces : 0;
      offset = bd.textcol + bd.textlen - (spaces !== 0 ? 1 : 0);
    } else {
      if (!op.isMax) spaces = op.endVcol - bd.endVcol + 1;
      offset = bd.textcol + bd.textlen;
    }
  }
  spaces = Math.max(0, spaces);
  // 탭을 나누면 그 탭 대신 앞뒤 공백을 넣습니다
  const splitTab = spaces > 0 && !bd.isShort && line[offset] === '\t';
  const post = splitTab ? tsVal - spaces : 0;
  const skip = splitTab ? 1 : 0;
  return { offset, pre: spaces, post, skip };
}

export function applyBlockInsertPlan(line: string, plan: BlockInsertPlan, text: string): string {
  return line.slice(0, plan.offset) + ' '.repeat(plan.pre) + text + ' '.repeat(plan.post) + line.slice(plan.offset + plan.skip);
}
