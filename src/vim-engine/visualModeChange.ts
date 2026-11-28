import { VimEditorState } from './types';
import { syncRegisters } from './registers';
import { pushUndoSnapshot } from './undoHistory';
import { deleteVisualSelection, yankVisualBlock, startVisualBlockInsert, getOrderedRange } from './visual';

type VisualKind = 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK';

const MODE_FOR_KEY: Record<string, VisualKind> = {
  v: 'VISUAL',
  V: 'VISUAL_LINE',
  'Ctrl-v': 'VISUAL_BLOCK',
  'Ctrl+v': 'VISUAL_BLOCK',
  'ctrl-v': 'VISUAL_BLOCK',
};

/**
 * 비주얼 모드에서 `v` / `V` / `Ctrl-v`: 같은 종류면 선택을 끝내고(마지막 선택 기억), 다르면 그 종류로 바꿉니다.
 * 비주얼 전환 키가 아니면 null.
 */
export function toggleVisualMode(state: VimEditorState, key: string): VimEditorState | null {
  const target = MODE_FOR_KEY[key];
  if (!target) return null;
  if (state.mode === target) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
      lastVisualSelection: state.visualAnchor
        ? { mode: state.mode, anchor: { ...state.visualAnchor }, cursor: { ...state.cursor } }
        : state.lastVisualSelection,
    };
  }
  return { ...state, mode: target, visualBlockEndOfLine: undefined, pendingKeys: undefined };
}

/**
 * 비주얼 모드에서 입력 모드로 들어가는 변경: 블록 `I A c s C`, 문자·줄 단위 `c s C S R`.
 * 텍스트 객체(`i`/`a`) 대기 중이거나 해당 키가 아니면 null.
 */
export function handleVisualChangeKey(state: VimEditorState, key: string, totalCount: number): VimEditorState | null {
  const isTextObjPending = Boolean(state.pendingKeys && /^([1-9][0-9]*)?[ia]$/.test(state.pendingKeys));
  if (isTextObjPending) return null;

  if (state.mode === 'VISUAL_BLOCK') {
    if (key === 'I' || key === 'A') return startVisualBlockInsert(state, key, totalCount);
    // 블록 c / s / C 는 Vim 처럼 지운 블록을 레지스터에 넣습니다 (블록 단위).
    if (key === 'c' || key === 's' || key === 'C') {
      const source = key === 'C' ? { ...state, visualBlockEndOfLine: true } : state;
      const deleted = yankVisualBlock(source).clipboard;
      const res = startVisualBlockInsert(source, 'c', totalCount);
      return syncRegisters(state, { ...res, clipboard: deleted }, false);
    }
    return null;
  }

  if (key !== 'c' && key !== 's' && key !== 'C' && key !== 'S' && key !== 'R') return null;
  const snap = state.visualAnchor
    ? { mode: state.mode as VisualKind, anchor: { ...state.visualAnchor }, cursor: { ...state.cursor } }
    : state.lastVisualSelection;
  const isLinewiseChange = state.mode === 'VISUAL_LINE' || key === 'C' || key === 'S' || key === 'R';
  if (isLinewiseChange && state.visualAnchor) {
    const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
    const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
    const deletedContent = state.lines.slice(minLine, maxLine + 1).join('\n');
    const nextLines = [...state.lines.slice(0, minLine), '', ...state.lines.slice(maxLine + 1)];
    // 실행 취소 기록 (커서는 recordVisualUndoCursor 가 Vim 의 op_delete 시작 위치로 맞춤)
    const withUndo = pushUndoSnapshot(state);
    const withDel: VimEditorState = {
      ...withUndo,
      lines: nextLines,
      cursor: { line: minLine, col: 0 },
      mode: 'INSERT',
      visualAnchor: undefined,
      clipboard: { type: 'line', content: deletedContent },
      pendingKeys: undefined,
    };
    return { ...syncRegisters(state, withDel, false), mode: 'INSERT', lastVisualSelection: snap };
  }
  const delRes = deleteVisualSelection(state, true);
  const synced = syncRegisters(state, delRes, false);
  // Vim op_change: 지운 범위가 줄 끝까지였으면 커서가 줄 끝 다음 칸(입력 위치)으로 갑니다 (vgec → 줄 끝에 덧붙임).
  const changeStart = state.visualAnchor ? getOrderedRange(state.visualAnchor, state.cursor).start : synced.cursor;
  const insertCol =
    changeStart.line === synced.cursor.line
      ? Math.min(changeStart.col, (synced.lines[synced.cursor.line] ?? '').length)
      : synced.cursor.col;
  return { ...synced, cursor: { line: synced.cursor.line, col: insertCol }, mode: 'INSERT', lastVisualSelection: snap };
}
