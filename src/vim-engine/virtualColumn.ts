import type { VimEditorState } from './types';
import { getOptions } from './setOptionsCore';

/**
 * 화면 열(virtual column) 계산. Vim 의 curswant 는 바이트 열이 아니라 화면 열이라, 탭이 있는 줄 사이를
 * j/k 로 오가거나 들여쓰기를 바꾼 뒤(`>>`) 같은 화면 위치로 돌아갑니다 (Vim getvcol / coladvance).
 * 탭이 없는 줄에서는 바이트 열과 같습니다.
 */

/** col 글자가 차지하는 마지막 화면 열 (NORMAL 모드에서 탭 위 커서는 탭 끝에 보임, Vim getvcol 의 cursor). */
export function virtualColumnOf(line: string, col: number, tabstop: number): number {
  if (!line.includes('\t')) return col;
  const ts = Math.max(1, tabstop);
  let vcol = 0;
  for (let i = 0; i < col && i < line.length; i++) vcol += line[i] === '\t' ? ts - (vcol % ts) : 1;
  if (col < line.length && line[col] === '\t') return vcol + ts - (vcol % ts) - 1;
  return vcol + Math.max(0, col - line.length);
}

/** 화면 열 vcol 을 덮는 글자의 바이트 열 (Vim coladvance). 줄보다 오른쪽이면 line.length 를 돌려줍니다. */
export function columnForVirtual(line: string, vcol: number, tabstop: number): number {
  if (!line.includes('\t')) return Math.min(vcol, line.length);
  const ts = Math.max(1, tabstop);
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const width = line[i] === '\t' ? ts - (start % ts) : 1;
    if (vcol < start + width) return i;
    start += width;
  }
  return line.length;
}

/** 'tabstop' (화면 열 계산용) */
export function tabstopOf(state: VimEditorState): number {
  return getOptions(state).tabstop || 8;
}

/** 지금 커서의 화면 열 */
export function cursorVirtualColumn(state: VimEditorState): number {
  const line = state.lines[state.cursor.line] ?? '';
  const { col } = state.cursor;
  const anchor = state.visualAnchor;
  // Vim getvcol: 비주얼에서 커서가 앵커보다 앞(같음 포함)이면 탭 위 커서는 탭의 첫 화면 열입니다.
  if (line[col] === '\t' && anchor && /^(VISUAL|SELECT)/.test(state.mode) && (state.cursor.line < anchor.line || (state.cursor.line === anchor.line && col <= anchor.col))) {
    return col === 0 ? 0 : virtualColumnOf(line, col - 1, tabstopOf(state)) + 1;
  }
  return virtualColumnOf(line, col, tabstopOf(state));
}

/**
 * 기억한 열(curswant, 화면 열)을 lineIdx 줄의 바이트 열로 바꿉니다. 기억한 열이 없으면 지금 커서의 화면 열을 씁니다.
 * 결과는 줄 길이까지이며, 호출부가 모드에 맞게 줄 끝으로 제한합니다.
 */
export function curswantColumnOn(state: VimEditorState, lines: readonly string[], lineIdx: number): number {
  const want = state.curswant ?? cursorVirtualColumn(state);
  return columnForVirtual(lines[lineIdx] ?? '', want, tabstopOf(state));
}
