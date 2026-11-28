// 문자·줄 단위 비주얼 `I` / `A` (블록이 아닌 v / V). Neovim normal.c v_visop() 은 이 둘을 줄 단위(V) OP_INSERT /
// OP_APPEND 로 바꾸고, ops.c do_pending_operator()·op_insert() 가 입력 위치를 정합니다.
//
// - 시작 = 앵커 줄의 0열. 커서가 그보다 뒤면 끝 = 커서, 아니면(커서가 위 줄) 시작 = 커서(열 포함), 끝 = 앵커 줄 0열.
// - I: 시작 자리에서 입력 (count 만큼 반복). A: 끝 자리(줄 끝 글자로 제한)에서, 줄이 비지 않았고
//   oparg 의 start_vcol 과 end_vcol 이 다르면 한 칸 뒤에서 입력합니다.
// - start_vcol / end_vcol 은 비주얼 연산마다 갱신되고(한 줄이면 둘 다, 여러 줄이면 end 만, `$` 뒤면 안 바뀜) 그 밖에는
//   이전 값이 남습니다 (state.visualOpVcol, trackVisualOpVcol).
// - `.` 반복(redo_VIsual): 커서 줄부터 같은 줄 수, I 는 커서 자리, A 는 마지막 줄의 커서 열(`$` 였으면 줄 끝)에서
//   남아 있는 vcol 로 같은 판단을 합니다. count 는 처음 것을 씁니다.
import type { CursorPosition, VimEditorState } from './types';
import { pushUndoSnapshot } from './undoHistory';
import { tabstopOf, virtualColumnOf } from './virtualColumn';

const REDO_PREFIX = '<visual-insert ';
/** curswant.ts 의 CURSWANT_EOL (`$` 뒤의 curswant). 이 파일은 vim-engine-editing 청크라 상위 청크를 import 하지 않습니다. */
const CURSWANT_EOL = Number.MAX_SAFE_INTEGER;

/** `.` 반복 기록의 첫 키 (I/A, 줄 수, `$` 여부, count) */
export function visualInsertRedoKey(op: 'I' | 'A', lineCount: number, eol: boolean, count: number): string {
  return `${REDO_PREFIX}${op} ${lineCount} ${eol ? 1 : 0} ${count}>`;
}

export function isVisualInsertRedoKey(key: string | undefined): boolean {
  return Boolean(key && key.startsWith(REDO_PREFIX));
}

function parseRedoKey(key: string): { op: 'I' | 'A'; lineCount: number; eol: boolean; count: number } | null {
  const m = /^<visual-insert ([IA]) (\d+) ([01]) (\d+)>$/.exec(key);
  return m ? { op: m[1] as 'I' | 'A', lineCount: Number(m[2]), eol: m[3] === '1', count: Number(m[4]) } : null;
}

const before = (a: CursorPosition, b: CursorPosition) => a.line < b.line || (a.line === b.line && a.col < b.col);

/** 글자가 시작하는 화면 열 (getvvcol 의 start) */
function startVcol(line: string, col: number, ts: number): number {
  if (col <= 0) return 0;
  return virtualColumnOf(line, col - 1, ts) + 1;
}

/** A 의 입력 위치: 끝 자리를 줄 끝 글자로 제한(check_cursor_col)하고, vcol 이 다르면 한 칸 뒤 (inc_cursor) */
function appendPosition(state: VimEditorState, end: CursorPosition, vcol: { start: number; end: number }): CursorPosition {
  const len = (state.lines[end.line] ?? '').length;
  const col = Math.max(0, Math.min(end.col, len - 1));
  return { line: end.line, col: len > 0 && vcol.start !== vcol.end ? col + 1 : col };
}

function enterInsert(state: VimEditorState, pos: CursorPosition, count: number, redoKey: string): VimEditorState {
  return {
    ...pushUndoSnapshot({ ...state, cursor: pos }),
    mode: 'INSERT',
    cursor: pos,
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    pendingKeys: undefined,
    insertRepeatCount: count > 1 ? count : undefined,
    insertRepeatNewline: undefined,
    currentChangeKeys: [redoKey],
  };
}

/** 비주얼 모드에서 누른 `I` / `A` (문자·줄 단위). */
export function startCharOrLineVisualInsert(state: VimEditorState, op: 'I' | 'A', count: number): VimEditorState | null {
  const anchor = state.visualAnchor;
  if (!anchor || (state.mode !== 'VISUAL' && state.mode !== 'VISUAL_LINE')) return null;
  let start: CursorPosition = { line: anchor.line, col: 0 };
  let end: CursorPosition = state.cursor;
  if (!before(start, end)) {
    end = start;
    start = state.cursor;
  }
  const lineCount = end.line - start.line + 1;
  const eol = state.curswant === CURSWANT_EOL;
  const ts = tabstopOf(state);
  let vcol = state.visualOpVcol ?? { start: 0, end: 0 };
  if (!eol) {
    const endV = virtualColumnOf(state.lines[end.line] ?? '', end.col, ts);
    vcol = { start: lineCount <= 1 ? startVcol(state.lines[start.line] ?? '', start.col, ts) : vcol.start, end: endV };
  }
  const n = Math.max(1, count);
  const pos =
    op === 'I'
      ? { line: start.line, col: Math.min(start.col, (state.lines[start.line] ?? '').length) }
      : appendPosition(state, end, vcol);
  return {
    ...enterInsert(state, pos, n, visualInsertRedoKey(op, lineCount, eol, n)),
    visualOpVcol: vcol,
    lastVisualSelection: { mode: state.mode, anchor: { ...anchor }, cursor: { ...state.cursor } },
  };
}

/**
 * `.` 로 비주얼 I/A 를 반복합니다. 반복 키 첫머리(앞의 count 는 무시)가 visualInsertRedoKey 이면 입력 모드로 들어간
 * 상태와 나머지 키(입력한 글자, Esc)를 돌려줍니다.
 */
export function redoVisualInsert(state: VimEditorState, keys: readonly string[]): { state: VimEditorState; rest: readonly string[] } | null {
  let i = 0;
  while (i < keys.length && /^[0-9]$/.test(keys[i])) i++;
  const info = keys[i] !== undefined ? parseRedoKey(keys[i]) : null;
  if (!info) return null;
  const cur = state.cursor;
  const lastLine = Math.min(state.lines.length - 1, cur.line + info.lineCount - 1);
  const lastText = state.lines[lastLine] ?? '';
  const moved: CursorPosition = { line: lastLine, col: info.eol ? Math.max(0, lastText.length - 1) : cur.col };
  const start = before(cur, moved) ? cur : moved;
  const end = before(cur, moved) ? moved : cur;
  const vcol = state.visualOpVcol ?? { start: 0, end: 0 };
  const pos =
    info.op === 'I'
      ? { line: start.line, col: Math.min(start.col, (state.lines[start.line] ?? '').length) }
      : appendPosition(state, end, vcol);
  return { state: enterInsert(state, pos, info.count, keys[i]), rest: keys.slice(i + 1) };
}

const VISUAL_OP_MODES = new Set(['VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK']);
const LEAVES_WITHOUT_OPERATOR = new Set(['Escape', 'Ctrl-c', 'Ctrl+c', 'Ctrl-[', 'v', 'V', 'Ctrl-v', 'Ctrl+v', 'p', 'P']);

/**
 * do_pending_operator() 가 비주얼 연산마다 남기는 oparg 의 start_vcol / end_vcol 을 따라갑니다 (비주얼 A 가 읽음).
 * 블록은 블록의 왼쪽·오른쪽 화면 열, 문자·줄 단위는 `$` 가 아니면 끝 글자의 마지막 화면 열과(한 줄이면) 시작 화면 열.
 */
export function trackVisualOpVcol(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  if (!VISUAL_OP_MODES.has(prev.mode) || VISUAL_OP_MODES.has(next.mode) || !prev.visualAnchor) return next;
  if (next.visualOpVcol !== prev.visualOpVcol || (!prev.pendingKeys && LEAVES_WITHOUT_OPERATOR.has(key))) return next;
  const ts = tabstopOf(prev);
  const vcolEnd = (p: CursorPosition) => virtualColumnOf(prev.lines[p.line] ?? '', p.col, ts);
  const vcolStart = (p: CursorPosition) => startVcol(prev.lines[p.line] ?? '', p.col, ts);
  const anchor = prev.visualAnchor;
  const old = prev.visualOpVcol ?? { start: 0, end: 0 };
  const eol = prev.curswant === CURSWANT_EOL;
  if (prev.mode === 'VISUAL_BLOCK') {
    const start = Math.min(vcolStart(anchor), vcolStart(prev.cursor));
    const end = eol ? CURSWANT_EOL : Math.max(vcolEnd(anchor), vcolEnd(prev.cursor));
    return { ...next, visualOpVcol: { start, end } };
  }
  if (eol) return next;
  let start: CursorPosition = prev.mode === 'VISUAL_LINE' ? { line: anchor.line, col: 0 } : anchor;
  let end: CursorPosition = prev.cursor;
  if (!before(start, end)) [start, end] = [end, start];
  const single = start.line === end.line;
  return { ...next, visualOpVcol: { start: single ? vcolStart(start) : old.start, end: vcolEnd(end) } };
}
