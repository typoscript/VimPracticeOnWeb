// 변경 목록(changelist, `g;` `g,` `:changes`)과 `'.` 마크. Neovim change.c 의 changed_common(), mark.c 의
// mark_adjust()/mark_col_adjust()/get_changelist()/ex_changes() 를 따릅니다.
//
// Vim 은 텍스트를 바꾸는 함수마다 changed_common(lnum, col) 을 불러 위치를 남깁니다. 엔진은 키 하나를 처리한
// 앞뒤 버퍼를 비교해(recordChangeList) 같은 위치를 다시 만듭니다. 줄 비교만으로 정해지지 않는 명령(:s, 대소문자·
// 들여쓰기 연산자, p, 실행 취소)은 state.changeListHint 로 위치를 알려 줍니다.
import type { ChangeListHint, ChangeListItem, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { getOptions } from './setOptionsCore';
import { msg } from './messages';

/** Vim JUMPLISTSIZE: 변경 목록 최대 길이 */
export const CHANGELIST_SIZE = 100;

interface Work {
  list: ChangeListItem[];
  newChange: boolean;
  last: { row: number; col: number } | null;
  cols: number;
  /** 실행 취소 때 마지막으로 기록할 줄 (Vim 이 이 변경을 여러 번 u_save 했을 때 가장 먼저 저장한 항목의 top + 1) */
  undoLine?: number;
}

const item = (row: number, col: number): ChangeListItem => ({ row, col, line: row });

/** changed_common(): '. 를 옮기고, 새 실행 취소 단위의 첫 변경이 마지막 항목과 멀면 새 항목을 만듭니다. */
function noteChange(w: Work, row: number, col: number): void {
  w.last = { row, col };
  if (w.newChange || w.list.length === 0) {
    let add = true;
    const p = w.list[w.list.length - 1];
    if (p && p.row === row) add = p.col + w.cols < col || col + w.cols < p.col;
    if (add) {
      w.newChange = false;
      if (w.list.length >= CHANGELIST_SIZE) w.list.shift();
      w.list.push(item(row, col));
    }
  }
  w.list[w.list.length - 1] = item(row, col);
}

/**
 * mark_adjust(): line1..line2 줄(0 기준, 포함)을 amount 만큼 옮기거나(amount === null 이면 지움) 그 뒤 줄을
 * after 만큼 옮깁니다. 변경 목록은 지운 줄에 있던 항목을 line1 로 모으고(ONE_ADJUST_NODEL), '. 는 지웁니다.
 */
function adjustLines(w: Work, line1: number, line2: number, amount: number | null, after: number): void {
  const map = (row: number, nodel: boolean): number | null => {
    if (row >= line1 && row <= line2) return amount === null ? (nodel ? line1 : null) : row + amount;
    if (after && row > line2) return row + after;
    return row;
  };
  w.list = w.list.map((e) => {
    const row = map(e.row, true) as number;
    return row === e.row ? e : item(row, e.col);
  });
  if (w.last) {
    const row = map(w.last.row, false);
    w.last = row === null ? null : row === w.last.row ? w.last : { row, col: w.last.col };
  }
}

/** mark_col_adjust(): `row` 줄의 항목을 `toRow` 줄로 옮기고 열에 `colAmount` 를 더합니다 (J 가 이어 붙인 줄). */
function moveRowInto(w: Work, row: number, toRow: number, colAmount: number): void {
  const move = (p: { row: number; col: number }) =>
    p.row === row ? { row: toRow, col: colAmount < 0 && p.col <= -colAmount ? 0 : p.col + colAmount } : p;
  w.list = w.list.map((e) => (e.row === row ? (({ row: r, col }) => item(r, col))(move(e)) : e));
  if (w.last) w.last = move(w.last);
}

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

interface Hunk {
  /** 바뀐 덩어리의 시작 (이전 버퍼 기준) */
  oldStart: number;
  oldCount: number;
  /** 바뀐 덩어리의 시작 (새 버퍼 기준) */
  newStart: number;
  newCount: number;
}

const MAX_LCS_CELLS = 250_000;

/** 두 줄 배열의 차이를 덩어리로 나눕니다 (앞뒤 공통 부분을 떼고 가운데는 LCS). */
export function diffLineHunks(a: readonly string[], b: readonly string[]): Hunk[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const n = a.length - pre - suf;
  const m = b.length - pre - suf;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) return [{ oldStart: pre, oldCount: n, newStart: pre, newCount: m }];
  // dp[i][j] = a[pre+i..] 와 b[pre+j..] 의 LCS 길이
  const w = m + 1;
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[pre + i] === b[pre + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const hunks: Hunk[] = [];
  let i = 0;
  let j = 0;
  let cur: Hunk | null = null;
  const flush = () => {
    if (cur) hunks.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[pre + i] === b[pre + j]) {
      flush();
      i++;
      j++;
      continue;
    }
    if (!cur) cur = { oldStart: pre + i, oldCount: 0, newStart: pre + j, newCount: 0 };
    if (j < m && (i >= n || dp[i * w + j + 1] >= dp[(i + 1) * w + j])) {
      cur.newCount++;
      j++;
    } else {
      cur.oldCount++;
      i++;
    }
  }
  flush();
  return hunks;
}

/** 줄만 더하거나 지운 덩어리는 같은 줄이 이어지면 위치가 모호합니다. 커서 줄에 가장 가까운 자리로 옮깁니다. */
function slidePureHunk(h: Hunk, a: readonly string[], b: readonly string[], cursorLine: number): Hunk {
  if (h.oldCount > 0 && h.newCount > 0) return h;
  const arr = h.oldCount > 0 ? a : b;
  const start = h.oldCount > 0 ? h.oldStart : h.newStart;
  const count = h.oldCount + h.newCount;
  let lo = start;
  while (lo > 0 && arr[lo - 1] === arr[lo - 1 + count]) lo--;
  let hi = start;
  while (hi + count < arr.length && arr[hi] === arr[hi + count]) hi++;
  const target = Math.max(lo, Math.min(hi, cursorLine));
  const shift = target - start;
  return shift === 0 ? h : { ...h, oldStart: h.oldStart + shift, newStart: h.newStart + shift };
}

/** 커서 왼쪽을 지우는 키 (X, 입력 모드 BS·Ctrl-w·Ctrl-u, db·dh·d0·dF …): 지운 자리가 연산 뒤 커서입니다 */
function deletesLeftward(prev: VimEditorState, key: string | undefined): boolean {
  if (!key) return false;
  if (prev.mode === 'INSERT') return /^(Backspace|BS|Ctrl[-+][hwu])$/.test(key);
  if (key === 'X') return true;
  const pend = prev.pendingKeys ?? '';
  return /[dc]$/.test(pend) ? /^[bBh0^]$/.test(key) : /[dc][FT]$/.test(pend);
}

/** 한 줄 안의 변경 열: 지우기·넣기는 위치가 모호하면 커서(앞·뒤) 쪽으로, 바꾸기는 처음 달라진 글자. */
function lineChangeCol(before: string, after: string, preCol: number | null, postCol: number | null, leftward: boolean): number {
  const p = commonPrefix(before, after);
  if (before.length === after.length) return p;
  const lo = Math.max(0, Math.min(before.length, after.length) - commonSuffix(before, after));
  const inRange = (c: number | null) => c !== null && c >= lo && c <= p;
  const anchors = after.length < before.length && leftward ? [postCol, preCol] : [preCol, postCol];
  for (const c of anchors) if (inRange(c)) return c as number;
  return p;
}

interface Ctx {
  prev: VimEditorState;
  next: VimEditorState;
  key?: string;
}

/** 덩어리 하나를 Vim 처럼 반영합니다: 마크 이동과 changed_common() 위치. `at` 은 덩어리 시작(현재 좌표). */
function applyHunk(w: Work, ctx: Ctx, h: Hunk, at: number, events: boolean): void {
  const { prev, next } = ctx;
  const o = h.oldCount;
  const n = h.newCount;
  if (o === 0) {
    // 줄 추가 (appended_lines_mark): 추가된 첫 줄 0열
    adjustLines(w, at, Number.MAX_SAFE_INTEGER, n, 0);
    if (events) noteChange(w, at, 0);
    return;
  }
  if (n === 0) {
    // 줄 삭제 (deleted_lines_mark): 지운 첫 줄 0열
    adjustLines(w, at, at + o - 1, null, -o);
    if (events) noteChange(w, at, 0);
    return;
  }
  const before = prev.lines[h.oldStart] ?? '';
  const after = next.lines[h.newStart] ?? '';
  if (o >= 2 && n === 1 && isLinewiseChange(prev, next)) {
    // 줄 단위 바꾸기([count]cc, Vjc): 첫 줄 아래를 지우고(del_lines) 첫 줄을 비움. 실행 취소는 지운 줄을 마지막에 되살림
    adjustLines(w, at + 1, at + o - 1, null, -(o - 1));
    w.undoLine = at + 1;
    if (events) noteChange(w, at + 1, 0);
    if (events) noteChange(w, at, commonPrefix(before, after));
    return;
  }
  if (o >= 2 && n === 1) {
    // 줄 잇기: 이어 붙인 줄의 항목은 남은 첫 줄 길이만큼 밀려 첫 줄로, 첫 줄 끝·다음 줄 0열에 기록
    // (do_join(insert_space = false)). 문자 단위 삭제는 그 전에 첫 줄 끝을 지우고(changed_bytes) 가운데 줄을
    // 지운(del_lines) 뒤 마지막 줄 앞부분을 지웁니다 (op_delete).
    const keep = commonPrefix(before, after);
    if (events && isCharwiseLineDelete(prev, next)) {
      applyCharwiseDeleteJoin(w, at, o - 1, keep);
      return;
    }
    for (let k = 1; k < o; k++) moveRowInto(w, at + k, at, keep);
    if (events) noteChange(w, at, keep);
    adjustLines(w, at + 1, at + o - 1, null, -(o - 1));
    if (events) noteChange(w, at + 1, 0);
    return;
  }
  if (n !== o) adjustLines(w, at + Math.min(o, n), at + o - 1, o > n ? null : n - o, n - o);
  if (!events) return;
  if (o === 1 && n === 1) {
    const preCol = prev.cursor.line === h.oldStart ? prev.cursor.col : null;
    const postCol = next.cursor.line === h.newStart ? next.cursor.col : null;
    noteChange(w, at, lineChangeCol(before, after, preCol, postCol, deletesLeftward(prev, ctx.key)));
    return;
  }
  // 한 줄을 여러 줄로 나눔(입력 모드 Enter, 문자 단위 여러 줄 붙여넣기)은 나눈 열, 여러 줄을 고침은 0열
  noteChange(w, at, o === 1 ? commonPrefix(before, after) : 0);
}

function isSpecialBuffer(s: VimEditorState): boolean {
  return Boolean(s.cmdlineWindow || s.helpSession?.isOpen || s.oilSession?.isOpen || s.netrw?.isOpen);
}

/**
 * 키 하나(또는 Ex 명령 하나) 전후의 버퍼를 비교해 변경 목록·`'.` 마크를 갱신합니다.
 * 안쪽 키 재생(`.`, `@q`, `:normal`)이 이미 기록했다면(changeListTick 이 바뀜) 다시 기록하지 않습니다.
 */
export function recordChangeList(prev: VimEditorState, next: VimEditorState, key?: string): VimEditorState {
  const hint = next.changeListHint !== prev.changeListHint ? next.changeListHint : undefined;
  let out = next.changeListHint ? { ...next, changeListHint: undefined } : next;
  const sameBuffer =
    (prev.primaryFilename || '') === (next.primaryFilename || '') && (prev.currentBufferId ?? 1) === (next.currentBufferId ?? 1);
  const typedRun = trackTypedRun(prev, out, key);
  if (typedRun !== out.insertTypedRun) out = { ...out, insertTypedRun: typedRun };
  const forced = hint?.kind === 'at' && hint.force;
  if (hint?.kind === 'undoOnly') return withUndoLine(prev, out, hint.undoLine);
  if ((prev.lines === next.lines && !forced) || !sameBuffer || isSpecialBuffer(prev) || isSpecialBuffer(next)) return out;
  if ((next.changeListTick ?? 0) !== (prev.changeListTick ?? 0)) return out;
  const undoing = hint?.kind === 'undo' || hint?.kind === 'redo';
  const hunks = changedHunks(prev, next, undoing);
  if (hunks.length === 0 && !forced && !undoing) return out;

  const tw = getOptions(next).textwidth ?? 0;
  const w: Work = {
    list: [...(out.changeList ?? [])],
    newChange: Boolean(out.changeListNewChange),
    last: out.lastChangeMark ? { ...out.lastChangeMark } : null,
    cols: tw > 0 ? tw : 79,
  };
  const ctx: Ctx = { prev, next, key };
  if (undoing && hunks.length === 0) {
    if ((next.undoStack?.length ?? 0) === (prev.undoStack?.length ?? 0) && (next.redoStack?.length ?? 0) === (prev.redoStack?.length ?? 0)) return out;
    // 내용이 그대로인 실행 취소 단위(빈 >> 등)도 Vim 은 그 줄을 기록합니다
    noteChange(w, hint.kind === 'undo' && hint.thenLine !== undefined ? hint.thenLine : next.cursor.line, 0);
  } else if (hint?.kind === 'undo') {
    // u_undoredo(): 새 항목부터(아래에서 위로) 줄을 되돌리고 각 덩어리 시작 0열을 기록
    for (let k = hunks.length - 1; k >= 0; k--) undoHunk(w, hunks[k], hunks[k].oldStart);
    if (hint.thenLine !== undefined) noteChange(w, hint.thenLine, 0);
  } else if (hint?.kind === 'redo') {
    for (const h of hunks) undoHunk(w, h, h.newStart);
  } else if (hint?.kind === 'join') {
    applyJoin(w, ctx, hint.line, hint.count, hint.col, false);
    w.undoLine = hint.line;
  } else if (hint?.kind === 'deletedLines') {
    // :g/pat/d: 줄마다 del_lines → 지운 줄 0열
    hint.lines.forEach((row, k) => {
      adjustLines(w, row - k, row - k, null, -1);
      noteChange(w, row - k, 0);
    });
  } else if (hint?.kind === 'move') {
    applyMove(w, prev.lines.length, hint.line1, hint.line2, hint.dest);
    // 실행 취소는 옮겨 넣은 줄(u_save(dest, dest + 1))을 마지막에 지웁니다
    w.undoLine = hint.undoLine;
  } else if (!hint && hunks.length === 1 && hunks[0].oldCount === 1 && hunks[0].newCount === 1 && repeatedInsertCol(prev, next, key) !== null) {
    // [count]i…<Esc> / [count]R…<Esc>: Esc 가 남은 횟수만큼 다시 넣고, 마지막으로 넣은 자리가 남습니다
    noteChange(w, hunks[0].newStart, repeatedInsertCol(prev, next, key) as number);
  } else if (prev.mode === 'INSERT' && next.mode === 'INSERT' && next.lines.length > prev.lines.length && next.cursor.line > prev.cursor.line) {
    // 입력 모드에서 줄을 나눔 (Enter, 줄 바꿈이 든 Ctrl-r): 마지막으로 나눈 줄 끝, 그 뒤에 넣은 글자가 있으면 다음 줄 0열
    const s = prev.cursor.line;
    applyHunk(w, ctx, { oldStart: s, oldCount: 1, newStart: s, newCount: 1 + next.lines.length - prev.lines.length }, s, false);
    const L = next.cursor.line;
    noteChange(w, L - 1, (next.lines[L - 1] ?? '').length);
    if (next.cursor.col > 0) noteChange(w, L, 0);
  } else if (insertJoinsLine(prev, next, key, hunks)) {
    // 입력 모드 BS·Ctrl-w·Ctrl-u 가 줄 처음에서 윗줄과 이음 (do_join(2, insert_space = false))
    const line = prev.cursor.line - 1;
    applyJoin(w, ctx, line, 1, (prev.lines[line] ?? '').length, true);
  } else if ((key === 'Ctrl-t' || key === 'Ctrl-d') && prev.mode === 'INSERT' && hunks.length === 1 && hunks[0].newCount === 1 && indentChanged(prev, next, hunks[0])) {
    // 입력 모드 Ctrl-t / Ctrl-d (change_indent): 들여쓰기를 바꾼 줄의 0열
    applyHunk(w, ctx, hunks[0], hunks[0].newStart, false);
    noteChange(w, hunks[0].newStart, 0);
  } else if (typedRun && typedRun === prev.insertTypedRun && hunks.length === 1 && hunks[0].oldCount === 1 && hunks[0].newCount === 1) {
    // 이어 친 글자: Vim 은 묶음 전체를 첫 글자 자리에 한 번에 넣습니다
    noteChange(w, typedRun.line, typedRun.col);
  } else if (!hint && hunks.length === 1 && hunks[0].newCount === 0 && isLinewiseChange(prev, next)) {
    // 줄 단위 바꾸기에서 비운 첫 줄이 이웃 빈 줄과 같아 줄 삭제처럼 보이는 경우: 커서 줄이 남는 첫 줄입니다
    const s = Math.min(next.cursor.line, next.lines.length - 1);
    const count = hunks[0].oldCount;
    adjustLines(w, s + 1, s + count, null, -count);
    noteChange(w, s + 1, 0);
    noteChange(w, s, commonPrefix(prev.lines[s] ?? '', next.lines[s] ?? ''));
    w.undoLine = s + 1;
  } else if (!hint && hunks[0]?.newCount === 0 && isCharwiseLineDelete(prev, next)) {
    // 줄 바꿈까지 지운 문자 단위 삭제(v 빈 줄 d, d/pat)는 줄 잇기(do_join)로 끝납니다. 줄이 통째로 지워진 것처럼
    // 보여도 삭제를 시작한 자리(연산 뒤 커서)가 이음 줄·열입니다.
    const h = hunks[0];
    const atCursor = next.cursor.line === h.newStart || next.cursor.line === h.newStart - 1;
    const line = atCursor ? next.cursor.line : h.newStart;
    applyCharwiseDeleteJoin(w, line, h.oldCount, atCursor ? next.cursor.col : 0);
    hunks.slice(1).forEach((rest) => applyHunk(w, ctx, rest, rest.newStart, false));
  } else if (hint?.kind === 'at' && hint.undoLine !== undefined && !hint.force) {
    hunks.forEach((h) => applyHunk(w, ctx, h, h.newStart, false));
    noteChange(w, hint.line, hint.col);
    w.undoLine = hint.undoLine;
  } else if (hint?.kind === 'at' && hint.keepRange) {
    // :sort 는 범위 안 줄을 바꿔 쓰기만 하고, 줄이 줄면(u) 범위 끝에서 지운 것으로 봅니다
    const deleted = prev.lines.length - next.lines.length;
    if (deleted > 0) adjustLines(w, hint.keepRange.end - deleted, hint.keepRange.end, null, -deleted);
    noteChange(w, hint.line, hint.col);
  } else {
    hunks.forEach((h, k) => applyHunk(w, ctx, h, h.newStart, hint?.kind === 'each' || (!hint && k === 0)));
    if (hint?.kind === 'at') {
      for (const e of hint.before ?? []) noteChange(w, e.line, e.col);
      noteChange(w, hint.line, hint.col);
    }
  }
  const recorded: VimEditorState = {
    ...out,
    changeList: w.list,
    changeIndex: w.list.length,
    changeListNewChange: w.newChange || undefined,
    lastChangeMark: w.last,
    changeListTick: (out.changeListTick ?? 0) + 1,
  };
  // 실행 취소 때 마지막 기록 줄: 따로 정하지 않았으면 한 덩어리 변경의 시작 줄 (Vim u_undoredo 의 top + 1)
  const undoLine = w.undoLine ?? (hint?.kind === 'at' ? hint.line : !undoing && !hint && hunks.length === 1 ? hunks[0].newStart : undefined);
  return undoLine === undefined ? recorded : withUndoLine(prev, recorded, undoLine);
}

/** 이번 키가 새로 만든 실행 취소 기록에 '실행 취소 때 마지막으로 기록할 줄'을 적어 둡니다 (undoHistory.ts 의 undo 가 읽음). */
function withUndoLine(prev: VimEditorState, next: VimEditorState, line: number): VimEditorState {
  const stack = next.undoStack ?? [];
  const top = stack[stack.length - 1];
  if (!top || top === prev.undoStack?.[prev.undoStack.length - 1]) return next;
  return { ...next, undoStack: [...stack.slice(0, -1), { ...top, changeListUndoLine: line }] };
}

/**
 * op_delete 의 여러 줄 문자 단위 삭제: 첫 줄 끝을 지우고(changed_bytes) 가운데 줄을 지운(del_lines) 뒤 마지막 줄 앞부분을
 * 지우고, 두 줄을 공백 없이 잇습니다(do_join). `line` 은 남는 첫 줄, `count` 는 사라지는 줄 수, `col` 은 남은 첫 줄 길이.
 */
function applyCharwiseDeleteJoin(w: Work, line: number, count: number, col: number): void {
  noteChange(w, line, col);
  if (count > 1) {
    adjustLines(w, line + 1, line + count - 1, null, -(count - 1));
    noteChange(w, line + 1, 0);
  }
  noteChange(w, line + 1, 0);
  moveRowInto(w, line + 1, line, col);
  noteChange(w, line, col);
  adjustLines(w, line + 1, line + 1, null, -1);
  noteChange(w, line + 1, 0);
}

function insertJoinsLine(prev: VimEditorState, next: VimEditorState, key: string | undefined, hunks: Hunk[]): boolean {
  if (prev.mode !== 'INSERT' || !key || !/^(Backspace|BS|Ctrl[-+][hwu])$/.test(key)) return false;
  return prev.cursor.line > 0 && next.lines.length === prev.lines.length - 1 && next.cursor.line === prev.cursor.line - 1 && hunks.length === 1;
}

function indentChanged(prev: VimEditorState, next: VimEditorState, h: Hunk): boolean {
  const ws = (s: string) => /^[ \t]*/.exec(s)?.[0] ?? '';
  return ws(prev.lines[h.oldStart] ?? '') !== ws(next.lines[h.newStart] ?? '');
}

/**
 * Esc 가 [count] 만큼 입력을 되풀이할 때 마지막으로 기록되는 열. 입력 모드는 마지막 묶음의 시작(한 번에 넣음),
 * 바꾸기 모드는 글자마다 기록하므로 마지막으로 바꾼 글자(= Esc 뒤 커서)입니다. 해당하지 않으면 null.
 */
function repeatedInsertCol(prev: VimEditorState, next: VimEditorState, key: string | undefined): number | null {
  const count = prev.insertRepeatCount ?? 1;
  if (key !== 'Escape' || count < 2 || prev.insertRepeatNewline || prev.blockInsertSession) return null;
  if (prev.mode === 'REPLACE') {
    // 마지막 되풀이에서 글자는 그 자리, BS 는 되살린 자리에 기록됩니다
    const keys = prev.currentChangeKeys ?? [];
    const r = keys.indexOf('R');
    let col = prev.cursor.col;
    let last: number | null = null;
    for (let pass = 1; pass < count; pass++) {
      for (const k of r >= 0 ? keys.slice(r + 1) : []) {
        if (k.length === 1) last = col++;
        else if (k === 'Backspace' || k === 'BS') last = col = Math.max(0, col - 1);
      }
    }
    return last ?? next.cursor.col;
  }
  if (prev.mode !== 'INSERT') return null;
  const added = (next.lines[prev.cursor.line] ?? '').length - (prev.lines[prev.cursor.line] ?? '').length;
  const unit = added / (count - 1);
  return added > 0 && Number.isInteger(unit) ? prev.cursor.col + added - unit : null;
}

/** 바뀐 덩어리. 버퍼를 모두 지워 빈 줄 하나가 남으면 Vim 처럼 모든 줄 삭제로 봅니다 (ML_EMPTY). */
function changedHunks(prev: VimEditorState, next: VimEditorState, splitHunks: boolean): Hunk[] {
  const wasEmpty = prev.lines.length === 1 && prev.lines[0] === '';
  // 빈 줄 하나뿐인 버퍼의 dd 도 줄을 지운 것 (del_lines → ML_EMPTY)
  if (wasEmpty && !splitHunks && next.lines.length === 1 && next.lines[0] === '' && next.registers?.['"'] !== prev.registers?.['"'] && next.registers?.['"']?.type === 'line' && next.mode === 'NORMAL') {
    return [{ oldStart: 0, oldCount: 1, newStart: 0, newCount: 0 }];
  }
  // 한 줄뿐인 버퍼는 줄 단위 삭제(dd, "_dd, :d, 줄 단위 레지스터)일 때만 줄을 지운 것으로 봅니다 (x·dw 는 글자 삭제)
  const linewiseDelete = /d$/.test(prev.pendingKeys ?? '') || (next.registers?.['"'] !== prev.registers?.['"'] && next.registers?.['"']?.type === 'line');
  const cleared = next.lines.length === 1 && next.lines[0] === '' && (prev.lines.length > 1 || linewiseDelete);
  if (cleared && next.mode !== 'INSERT' && !splitHunks) return [{ oldStart: 0, oldCount: prev.lines.length, newStart: 0, newCount: 0 }];
  // 실행 취소만 떨어진 여러 덩어리로 나눕니다. 명령 하나의 변경은 이어진 한 덩어리로 봅니다 (빈 줄 등이 우연히 맞춰지지 않게).
  const hunks = splitHunks ? diffLineHunks(prev.lines, next.lines) : trimmedHunk(prev.lines, next.lines);
  return hunks.map((h) => slidePureHunk(h, prev.lines, next.lines, next.cursor.line));
}

function trimmedHunk(a: readonly string[], b: readonly string[]): Hunk[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const oldCount = a.length - pre - suf;
  const newCount = b.length - pre - suf;
  return oldCount === 0 && newCount === 0 ? [] : [{ oldStart: pre, oldCount, newStart: pre, newCount }];
}

/** 무명 레지스터가 줄 단위로 바뀌었고 입력 모드에 들어갔는지 (줄 단위 바꾸기) */
function isLinewiseChange(prev: VimEditorState, next: VimEditorState): boolean {
  const reg = next.registers?.['"'];
  return next.mode === 'INSERT' && Boolean(reg) && reg !== prev.registers?.['"'] && reg?.type === 'line';
}

/** 무명 레지스터가 줄 바꿈을 품은 문자 단위 텍스트로 바뀌었는지 (여러 줄 문자 단위 삭제·변경) */
function isCharwiseLineDelete(prev: VimEditorState, next: VimEditorState): boolean {
  const reg = next.registers?.['"'];
  if (!reg || reg === prev.registers?.['"'] || reg.type !== 'char') return false;
  return typeof reg.content === 'string' && reg.content.includes('\n');
}

/**
 * do_join(): line 줄 아래 count 줄의 항목을 이어 붙인 자리로 옮기고(mark_col_adjust), 첫 줄의 이음 열에 기록한 뒤
 * 줄을 지우고(del_lines) 다음 줄 0열에 한 번 더 기록합니다. `raw` 는 문자 단위 삭제 끝의 잇기(공백 처리 없이
 * 남은 첫 줄 길이만큼 열을 밀기), 아니면 J 처럼 붙은 줄의 글자가 옮겨 간 자리를 찾습니다.
 */
function applyJoin(w: Work, ctx: Ctx, line: number, count: number, col: number, raw: boolean): void {
  const joined = ctx.next.lines[line] ?? '';
  let pos = Math.min(col, joined.length);
  for (let k = 1; k <= count; k++) {
    const old = ctx.prev.lines[line + k] ?? '';
    const body = old.replace(/^\s+/, '');
    const at = body ? joined.indexOf(body, pos) : -1;
    const start = at >= 0 ? at : pos;
    moveRowInto(w, line + k, line, raw ? col : start - (old.length - body.length));
    pos = start + body.length;
  }
  noteChange(w, line, col);
  adjustLines(w, line + 1, line + count, null, -count);
  noteChange(w, line + 1, 0);
}

/** do_move() (:m): 옮긴 줄의 항목은 줄을 따라가고, 기록은 임시 위치(버퍼 끝) 두 번과 최종 위치 한 번입니다. 모두 1 기준. */
function applyMove(w: Work, lineCount: number, line1: number, line2: number, dest: number): void {
  const num = line2 - line1 + 1;
  const last = lineCount + num;
  const extra = dest < line1 ? num : 0;
  // adjustLines 는 0 기준
  adjustLines(w, line1 - 1, line2 - 1, last - line2, 0);
  noteChange(w, last - num, 0);
  if (dest >= line2) adjustLines(w, line2, dest - 1, -num, 0);
  else adjustLines(w, dest, line1 - 2, num, 0);
  adjustLines(w, last - num, last - 1, -(last - dest - extra), 0);
  noteChange(w, last - num, 0);
  noteChange(w, line1 < dest ? line1 - 1 : dest, 0);
}

function undoHunk(w: Work, h: Hunk, at: number): void {
  if (h.oldCount !== h.newCount) {
    adjustLines(w, at, at + h.oldCount - 1, null, h.newCount - h.oldCount);
  }
  noteChange(w, at, 0);
}

/**
 * Vim insertchar(): 미리 입력된(타이프어헤드) 보통 글자는 모아서 한 번에 넣으므로 변경 위치가 묶음의 첫 글자 자리입니다.
 * 매크로·`.`·`:normal`·붙여넣은 키가 이렇게 들어가고, 엔진은 입력 모드에서 이어 친 보통 글자를 한 묶음으로 봅니다.
 * 묶음은 특수 키(BS, Ctrl-w, Enter, 화살표 …)나 입력 모드를 벗어나면 끝납니다.
 */
function trackTypedRun(prev: VimEditorState, next: VimEditorState, key?: string): VimEditorState['insertTypedRun'] {
  if (prev.mode === 'INSERT' && next.mode === 'INSERT' && prev.insertRegisterPending) {
    // Ctrl-r 은 레지스터 내용을 입력으로 밀어 넣으므로 뒤이어 친 글자와 한 묶음이 됩니다
    if (next.lines === prev.lines) return undefined;
    return next.cursor.line > prev.cursor.line ? { line: next.cursor.line, col: 0 } : { line: prev.cursor.line, col: prev.cursor.col };
  }
  const typing = prev.mode === 'INSERT' && next.mode === 'INSERT' && key !== undefined && key.length === 1 && !prev.insertRegisterPending;
  if (!typing || next.lines === prev.lines) return undefined;
  const run = prev.insertTypedRun;
  if (run && run.line === next.cursor.line) return run;
  return { line: prev.cursor.line, col: prev.cursor.col };
}

/** `g;` / `g,` (Vim nv_pcmark → get_changelist): count 만큼 이동, 끝을 넘으면 처음·마지막 항목에서 멈춥니다. */
export function traverseChangeList(state: VimEditorState, direction: 'prev' | 'next', count = 1): VimEditorState {
  const list = state.changeList ?? [];
  const fail = (message: string): VimEditorState => ({ ...state, pendingKeys: undefined, bell: true, commandMessage: message });
  if (state.mode !== 'NORMAL') return { ...state, pendingKeys: undefined, bell: true };
  if (list.length === 0) return fail(msg('E664: 변경 목록이 비어 있습니다 (changelist is empty)'));
  let n = Math.min(state.changeIndex ?? list.length, list.length);
  const delta = direction === 'prev' ? -Math.max(1, count) : Math.max(1, count);
  if (n + delta < 0) {
    if (n === 0) return fail(msg('E662: 변경 목록의 시작입니다 (At start of changelist)'));
    n = 0;
  } else if (n + delta >= list.length) {
    if (n === list.length - 1) return fail(msg('E663: 변경 목록의 끝입니다 (At end of changelist)'));
    n = list.length - 1;
  } else {
    n += delta;
  }
  const target = list[n];
  if (target.row < 0 || target.row >= state.lines.length) {
    return { ...fail(msg('E19: 마크의 줄 번호가 잘못되었습니다')), changeIndex: n };
  }
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: target.row, col: target.col }, 'NORMAL'),
    changeIndex: n,
    pendingKeys: undefined,
  };
}

/** `:changes` (Vim ex_changes): 현재 위치와의 거리, 줄(1 기준), 열(0 기준), 줄 내용(앞 공백 제외). */
export function formatChangeList(state: VimEditorState): string {
  const list = state.changeList ?? [];
  const idx = Math.min(state.changeIndex ?? list.length, list.length);
  const rows = list.map((e, i) => {
    const text = e.row >= 0 && e.row < state.lines.length ? (state.lines[e.row] ?? '').replace(/^[ \t]+/, '') : '-invalid-';
    return `${i === idx ? '>' : ' '} ${String(Math.abs(i - idx)).padStart(3)} ${String(e.row + 1).padStart(5)} ${String(e.col).padStart(4)} ${text}`;
  });
  return ['change line  col text', ...rows, ...(idx === list.length ? ['>'] : [])].join('\n');
}

/** `=` (Vim op_reindent): 처음 바뀐 줄 0열에 한 번 기록합니다. 바뀐 줄이 없으면 기록하지 않습니다. */
export function reindentChangeHint(before: readonly string[], after: readonly string[], rangeStart: number): Pick<VimEditorState, 'changeListHint'> {
  const first = after.findIndex((line, i) => line !== before[i]);
  // 실행 취소는 u_save 한 범위의 첫 줄을 기록합니다
  return first < 0 ? {} : { changeListHint: { kind: 'at', line: first, col: 0, undoLine: rangeStart } };
}

/** 변경 위치 힌트를 남깁니다 (changelist.ts 가 다음 기록 때 씀). */
export function withChangeListHint(state: VimEditorState, hint: ChangeListHint): VimEditorState {
  return { ...state, changeListHint: hint };
}

/**
 * 여러 변경을 한 실행 취소 단위로 묶는 명령(@q 매크로 실행)의 시작: 첫 변경만 변경 목록에 새 항목을 만들 수 있게 합니다
 * (Vim 은 레지스터 실행 중 u_sync 를 하지 않음). 이미 묶는 중이면 그대로 둡니다.
 */
export function beginChangeListUndoJoin(state: VimEditorState): VimEditorState {
  return state.changeListUndoJoin ? state : { ...state, changeListUndoJoin: true, changeListNewChange: true };
}

/** beginChangeListUndoJoin 의 끝: 묶음 표시를 되돌리고, 아무것도 기록하지 않았으면 새 항목 표시도 되돌립니다. */
export function endChangeListUndoJoin(before: VimEditorState, after: VimEditorState): VimEditorState {
  if (before.changeListUndoJoin) return after;
  const recorded = (after.changeListTick ?? 0) !== (before.changeListTick ?? 0);
  return { ...after, changeListUndoJoin: undefined, ...(recorded ? {} : { changeListNewChange: before.changeListNewChange }) };
}
