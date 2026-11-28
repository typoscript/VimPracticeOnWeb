// 실행 취소 기록(pushUndoSnapshot)과 u / Ctrl-r 실행 취소·다시 실행. operators.ts 에서 분리.
import { CursorPosition, StateSnapshot, VimEditorState } from './types';
import { columnForVirtual, cursorVirtualColumn, tabstopOf } from './virtualColumn';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { getOptions } from './setOptionsCore';
import { areLinesEqual, ensureUndoTreeInitialized, recordUndoTreeChange, jumpUndoSeq } from './undoTreeEngine';
import { msg } from './messages';

const MAX_HISTORY = 50;

/**
 * 상태 변경 전 실행 취소(Undo) 스냅샷을 푸시하고 Redo 스택을 초기화합니다.
 */
export function pushUndoSnapshot(state: VimEditorState): VimEditorState {
  if (state.pendingUndoJoin) {
    return {
      ...state,
      pendingUndoJoin: undefined,
      undoJoinMerged: true,
      lastActionWasUndo: undefined,
    };
  }
  // 상태 변경 전 Undo Tree 루트 및 기존 버퍼 변경사항 확정 기록
  const treeState = recordUndoTreeChange(ensureUndoTreeInitialized(state));

  const currentSnapshot: StateSnapshot = {
    lines: [...treeState.lines],
    cursor: { ...treeState.cursor },
  };

  const nextUndo = [...(treeState.undoStack ?? []), currentSnapshot];
  if (nextUndo.length > MAX_HISTORY) {
    nextUndo.shift();
  }

  return {
    ...treeState,
    undoStack: nextUndo,
    redoStack: [],
    // Vim u_savecommon: 새 실행 취소 단위가 시작되면 다음 변경이 변경 목록에 새 항목을 만들 수 있습니다 (changelist.ts)
    changeListNewChange: treeState.changeListUndoJoin ? treeState.changeListNewChange : true,
    pendingUndoJoin: undefined,
    lastActionWasUndo: undefined,
  };
}

/**
 * pushUndoSnapshot 과 같지만, 실행 취소 때 돌아갈 커서(Vim `uh_cursor`)를 `cursor` 로 기록합니다.
 * `savedRange` 는 Vim 이 한 번의 u_save 로 저장한 줄 범위입니다 (StateSnapshot.savedRange).
 * Vim 은 변경 묶음의 첫 u_save 때 커서를 저장하는데, Ex 명령은 그 전에 커서를 옮깁니다
 * (`:d`·`:>` 는 첫 줄의 curswant 열, `:s` 는 처음 바꾼 줄의 0열, `:j` 는 첫 줄의 원래 열).
 * `:undojoin` 으로 새 기록이 생기지 않으면 이전 기록을 건드리지 않습니다.
 */
export function pushUndoSnapshotAt(
  state: VimEditorState,
  cursor: CursorPosition,
  savedRange?: { start: number; end: number }
): VimEditorState {
  return setLastUndoCursor(pushUndoSnapshot(state), state, cursor, savedRange);
}

/** 실행 취소 기록의 맨 위 항목(방금 넣은 변경)의 커서·u_save 범위를 바꿉니다. 기록이 `before` 보다 늘지 않았으면 그대로 둡니다. */
export function setLastUndoCursor(
  state: VimEditorState,
  before: VimEditorState,
  cursor: CursorPosition,
  savedRange?: { start: number; end: number }
): VimEditorState {
  const stack = state.undoStack ?? [];
  const top = stack[stack.length - 1];
  if (!top || top === before.undoStack?.[before.undoStack.length - 1]) return state;
  const entry: StateSnapshot = { ...top, cursor: { line: cursor.line, col: cursor.col }, ...(savedRange ? { savedRange } : {}) };
  return { ...state, undoStack: [...stack.slice(0, -1), entry] };
}

/**
 * Vim `beginline(BL_SOL | BL_FIX)`: 'startofline' 이면 첫 비공백, 아니면 기억한 열(curswant)로 갑니다
 * (줄이 짧으면 줄 끝). Ex 주소 이동·`:d`/`:>` 의 시작 위치·`:t`/`:m` 뒤·실행 취소가 씁니다.
 */
export function beginlineSolCol(state: VimEditorState, lineText: string): number {
  if (getOptions(state).startofline) return getFirstNonBlankCol(lineText);
  const want = columnForVirtual(lineText, state.curswant ?? cursorVirtualColumn(state), tabstopOf(state));
  return Math.max(0, Math.min(want, lineText.length - 1));
}

/** 커서를 옮긴 Ex 명령이 Vim 처럼 curswant 를 바꾸지 않게 표시합니다 ('startofline' 이면 표시하지 않음, beginline 이 curswant 를 다시 정함). */
export function keepCurswantIfNosol(state: VimEditorState): VimEditorState {
  if (getOptions(state).startofline) return state;
  return { ...state, keepCurswantAt: { line: state.cursor.line, col: state.cursor.col } };
}

/** 커서를 옮긴 Ex 명령이 curswant 를 바꾸지 않게 표시합니다 (Vim 에서 `w_set_curswant` 를 켜지 않는 이동). */
export function keepCurswant(state: VimEditorState): VimEditorState {
  return { ...state, keepCurswantAt: { line: state.cursor.line, col: state.cursor.col } };
}

/**
 * 비주얼 선택에 연산할 때 Vim do_pending_operator 가 커서를 두는 범위 시작(oap->start).
 * oap->start 는 앵커(줄 단위 비주얼은 그 줄의 0열)이고, 그것이 커서보다 앞이면 그 자리, 아니면 커서 자리입니다. 연산의 첫 u_save 가 이 위치를 기억합니다.
 */
export function visualOperatorStart(linewise: boolean, anchor: CursorPosition, cursor: CursorPosition): CursorPosition {
  const start = { line: anchor.line, col: linewise ? 0 : anchor.col };
  const startFirst = start.line < cursor.line || (start.line === cursor.line && start.col < cursor.col);
  return startFirst ? start : { line: cursor.line, col: cursor.col };
}

/** Vim u_add_time: 100초 미만은 "N seconds ago", 그 이상은 변경 시각(HH:MM:SS). */
function formatUndoAge(timestamp: number | undefined): string {
  if (timestamp === undefined) return msg('{n}초 전', { n: 0 });
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds >= 100) {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return seconds === 1 ? msg('1초 전') : msg('{n}초 전', { n: seconds });
}

/**
 * Vim u_undo_end 처럼 실행 취소/다시 실행 결과를 알립니다.
 * 줄 수가 바뀌면 "N more lines" / "1 line less" 등, 같으면 바뀐 줄 수를 "N changes" 로 보여 주고
 * 뒤에 "; before #seq" (u) 또는 "; after #seq" (Ctrl-r) 와 그 변경의 시각을 붙입니다.
 */
function describeUndoRedo(
  before: string[],
  after: string[],
  direction: 'before' | 'after',
  seq: number,
  timestamp: number | undefined
): string {
  const delta = after.length - before.length;
  let summary: string;
  if (delta === 1) summary = msg('1줄이 늘었습니다');
  else if (delta > 1) summary = msg('{n}줄이 늘었습니다', { n: delta });
  else if (delta === -1) summary = msg('1줄이 줄었습니다');
  else if (delta < -1) summary = msg('{n}줄이 줄었습니다', { n: -delta });
  else {
    let changed = 0;
    for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) changed++;
    const count = Math.max(1, changed);
    summary = count === 1 ? msg('1곳이 바뀌었습니다') : msg('{n}곳이 바뀌었습니다', { n: count });
  }
  const age = formatUndoAge(timestamp);
  return direction === 'before'
    ? msg('{summary}; #{seq} 이전  {age}', { summary, seq, age })
    : msg('{summary}; #{seq} 이후  {age}', { summary, seq, age });
}

/**
 * 되살릴 줄(restored)과 현재 줄(current)이 top 부터 다를 때, 첫 번째 변경 묶음(hunk)에서
 * 되살아나는 줄 수를 구합니다. Vim 은 변경 묶음마다 실행 취소 항목을 두므로 커서 판정도 첫 묶음 기준입니다.
 */
function firstHunkRestoredSize(restored: string[], current: string[], top: number): number {
  let endR = restored.length;
  let endC = current.length;
  while (endR > top && endC > top && restored[endR - 1] === current[endC - 1]) {
    endR--;
    endC--;
  }
  const n = endR - top;
  const m = endC - top;
  if (n === 0 || m === 0 || n * m > 250_000) return n;
  // LCS 표로 첫 공통 줄까지를 첫 변경 묶음으로 봅니다.
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = restored[top + i] === current[top + j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (restored[top + i] === current[top + j] && lcs[i][j] === lcs[i + 1][j + 1] + 1) return i;
    if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  return n;
}

/**
 * Vim u_undoredo 의 커서 규칙.
 * - 변경을 시작할 때 저장한 커서(스냅샷 커서, Vim `uh_cursor`)가 바뀐 범위(바로 윗줄 ~ 되살린 줄의 끝)에 있으면 그 위치로 돌아갑니다.
 * - 아니면 실제로 바뀐 첫 줄로 가고, 열은 저장한 커서가 그 줄이면 그 열, 아니면 `beginline(BL_SOL | BL_FIX)`
 *   ('nostartofline' 이면 실행 취소 직전의 curswant 열, 아니면 첫 비공백)입니다. 되살린 줄이 버퍼 끝을 넘으면 0열입니다.
 */
function undoCursorPosition(state: VimEditorState, snapshot: StateSnapshot): { line: number; col: number } {
  const restored = snapshot.lines;
  const current = state.lines;
  const saved = snapshot.cursor;
  let top = 0;
  while (top < Math.min(restored.length, current.length) && restored[top] === current[top]) top++;
  if (top === restored.length && top === current.length) return saved;
  if (snapshot.undoLine !== undefined) {
    // u_undoredo 끝: 저장한 커서 바로 아랫줄이면 한 줄 올리고, 버퍼 끝을 넘으면 마지막 줄 0열입니다.
    let line = snapshot.undoLine;
    if (saved.line + 1 === line && line > 0) line = saved.line;
    if (line > restored.length - 1) return { line: Math.max(0, restored.length - 1), col: 0 };
    return saved.line === line ? saved : { line, col: beginlineSolCol(state, restored[line] ?? '') };
  }
  if (snapshot.savedRange) {
    // 한 번의 u_save 항목: 저장한 커서가 그 범위(바로 윗줄 ~ 범위 다음 줄) 안이면 그 위치
    const { start, end } = snapshot.savedRange;
    if (saved.line >= start - 1 && saved.line <= end + 1) return saved;
  } else {
    const newSize = firstHunkRestoredSize(restored, current, top);
    if (saved.line >= top - 1 && saved.line <= top + newSize) return saved;
  }
  if (top > restored.length - 1) return { line: Math.max(0, restored.length - 1), col: 0 };
  const line = top;
  if (saved.line === line) return { line, col: saved.col };
  return { line, col: beginlineSolCol(state, restored[line] ?? '') };
}

/**
 * 'u': 직전 상태로 실행 취소(Undo)합니다.
 */
export function undo(state: VimEditorState): VimEditorState {
  if (!state.undoStack || state.undoStack.length === 0) {
    if (state.undoTreeNodes && state.currentUndoSeq !== undefined && state.currentUndoSeq > 0) {
      const parent = state.undoTreeNodes[state.currentUndoSeq]?.parentSeq ?? 0;
      return jumpUndoSeq(state, parent);
    }
    return { ...state, pendingKeys: undefined, commandMessage: msg('이미 가장 오래된 변경사항입니다.') };
  }

  const lastSnapshot = state.undoStack[state.undoStack.length - 1];
  const nextUndo = state.undoStack.slice(0, -1);

  const currentSnapshot: StateSnapshot = {
    lines: [...state.lines],
    cursor: { ...state.cursor },
    header: { cursor: { ...lastSnapshot.cursor }, savedRange: lastSnapshot.savedRange, undoLine: lastSnapshot.undoLine },
  };

  const nextRedo = [...(state.redoStack ?? []), currentSnapshot];

  let currentSeq = state.currentUndoSeq;
  let timeIdx = state.undoTimeIndex;
  if (state.undoTreeNodes && currentSeq !== undefined) {
    const parent = state.undoTreeNodes[currentSeq]?.parentSeq;
    if (parent !== null && parent !== undefined) {
      currentSeq = parent;
      if (state.undoTimeHistory) {
        const found = state.undoTimeHistory.lastIndexOf(parent);
        if (found >= 0) timeIdx = found;
      }
    }
  }

  const undoneSeq = state.currentUndoSeq ?? state.undoStack.length;
  const undoCursor = undoCursorPosition(state, lastSnapshot);
  return {
    ...state,
    lines: lastSnapshot.lines,
    cursor: clampCursor(lastSnapshot.lines, undoCursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    currentUndoSeq: currentSeq,
    undoTimeIndex: timeIdx,
    pendingKeys: undefined,
    pendingUndoJoin: undefined,
    lastActionWasUndo: true,
    changeListHint: { kind: 'undo', thenLine: lastSnapshot.changeListUndoLine },
    commandMessage: describeUndoRedo(
      state.lines,
      lastSnapshot.lines,
      'before',
      undoneSeq,
      state.undoTreeNodes?.[undoneSeq]?.timestamp
    ),
  };
}

/**
 * 'Ctrl+r': 취소한 변경사항을 다시 실행(Redo)합니다.
 */
export function redo(state: VimEditorState): VimEditorState {
  if (!state.redoStack || state.redoStack.length === 0) {
    return { ...state, pendingKeys: undefined, commandMessage: msg('이미 가장 최신 변경사항입니다.') };
  }

  const nextSnapshot = state.redoStack[state.redoStack.length - 1];
  const nextRedo = state.redoStack.slice(0, -1);

  // Vim u_undoredo(redo): 원래 변경의 헤더(uh_cursor·저장 범위)로 커서를 정하고, 다시 u 할 때도 그 헤더를 씁니다.
  const header = nextSnapshot.header && nextSnapshot.header.undoLine === undefined ? nextSnapshot.header : undefined;
  const currentSnapshot: StateSnapshot = header
    ? { lines: [...state.lines], cursor: { ...header.cursor }, ...(header.savedRange ? { savedRange: header.savedRange } : {}) }
    : { lines: [...state.lines], cursor: { ...state.cursor } };
  const redoCursor = header
    ? undoCursorPosition(state, { lines: nextSnapshot.lines, cursor: header.cursor, ...(header.savedRange ? { savedRange: header.savedRange } : {}) })
    : nextSnapshot.cursor;

  const nextUndo = [...(state.undoStack ?? []), currentSnapshot];

  let currentSeq = state.currentUndoSeq;
  let timeIdx = state.undoTimeIndex;
  if (state.undoTreeNodes && currentSeq !== undefined) {
    const childEntry = Object.values(state.undoTreeNodes).find(
      (n) => n.parentSeq === currentSeq && areLinesEqual(n.lines, nextSnapshot.lines)
    );
    if (childEntry) {
      currentSeq = childEntry.seq;
      if (state.undoTimeHistory) {
        const found = state.undoTimeHistory.lastIndexOf(currentSeq);
        if (found >= 0) timeIdx = found;
      }
    }
  }

  const redoneSeq = currentSeq ?? nextUndo.length;
  return {
    ...state,
    lines: nextSnapshot.lines,
    cursor: clampCursor(nextSnapshot.lines, redoCursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    currentUndoSeq: currentSeq,
    undoTimeIndex: timeIdx,
    pendingKeys: undefined,
    changeListHint: { kind: 'redo' },
    commandMessage: describeUndoRedo(
      state.lines,
      nextSnapshot.lines,
      'after',
      redoneSeq,
      state.undoTreeNodes?.[redoneSeq]?.timestamp
    ),
  };
}
