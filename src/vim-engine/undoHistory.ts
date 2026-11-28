// 실행 취소 기록(pushUndoSnapshot)과 u / Ctrl-r 실행 취소·다시 실행. operators.ts 에서 분리.
import { StateSnapshot, VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol } from './cursor';
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

  const currentChangeList = treeState.changeList ? [...treeState.changeList] : [];
  const lastChange = currentChangeList[currentChangeList.length - 1];
  if (lastChange && lastChange.row === treeState.cursor.line) {
    currentChangeList[currentChangeList.length - 1] = {
      row: treeState.cursor.line,
      col: treeState.cursor.col,
      line: treeState.cursor.line,
    };
  } else {
    currentChangeList.push({
      row: treeState.cursor.line,
      col: treeState.cursor.col,
      line: treeState.cursor.line,
    });
    if (currentChangeList.length > MAX_HISTORY) {
      currentChangeList.shift();
    }
  }

  return {
    ...treeState,
    undoStack: nextUndo,
    redoStack: [],
    changeList: currentChangeList,
    changeIndex: currentChangeList.length,
    pendingUndoJoin: undefined,
    lastActionWasUndo: undefined,
  };
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
 * - 변경을 시작할 때의 커서(스냅샷 커서)가 바뀐 범위(바로 윗줄 ~ 되살린 줄의 끝)에 있으면 그 위치로 돌아갑니다.
 * - 아니면 실제로 바뀐 첫 줄로 가고, 열은 스냅샷 커서가 그 줄이면 그 열, 아니면 첫 비공백입니다.
 *   (Vim 은 'nostartofline' 이면 curswant 열로 가지만, Ex 명령 뒤의 curswant 를 엔진이 따로 기억하지 않아 첫 비공백으로 둡니다.)
 */
function undoCursorPosition(state: VimEditorState, snapshot: StateSnapshot): { line: number; col: number } {
  const restored = snapshot.lines;
  const current = state.lines;
  const saved = snapshot.cursor;
  let top = 0;
  while (top < Math.min(restored.length, current.length) && restored[top] === current[top]) top++;
  if (top === restored.length && top === current.length) return saved;
  const newSize = firstHunkRestoredSize(restored, current, top);
  if (saved.line >= top - 1 && saved.line <= top + newSize) return saved;
  const line = Math.min(top, Math.max(0, restored.length - 1));
  if (saved.line === line) return { line, col: saved.col };
  return { line, col: getFirstNonBlankCol(restored[line] ?? '') };
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

  const currentSnapshot: StateSnapshot = {
    lines: [...state.lines],
    cursor: { ...state.cursor },
  };

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
    cursor: clampCursor(nextSnapshot.lines, nextSnapshot.cursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    currentUndoSeq: currentSeq,
    undoTimeIndex: timeIdx,
    pendingKeys: undefined,
    commandMessage: describeUndoRedo(
      state.lines,
      nextSnapshot.lines,
      'after',
      redoneSeq,
      state.undoTreeNodes?.[redoneSeq]?.timestamp
    ),
  };
}
