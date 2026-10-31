import { StateSnapshot, VimEditorState } from '../types/vim';
import { clampCursor, getMaxCol } from './cursor';

const MAX_HISTORY = 50;

/**
 * 상태 변경 전 실행 취소(Undo) 스냅샷을 푸시하고 Redo 스택을 초기화합니다.
 */
export function pushUndoSnapshot(state: VimEditorState): VimEditorState {
  const currentSnapshot: StateSnapshot = {
    lines: [...state.lines],
    cursor: { ...state.cursor },
  };

  const nextUndo = [...(state.undoStack ?? []), currentSnapshot];
  if (nextUndo.length > MAX_HISTORY) {
    nextUndo.shift();
  }

  return {
    ...state,
    undoStack: nextUndo,
    redoStack: [],
  };
}

/**
 * 'dd': 현재 줄 전체를 삭제하고 클립보드에 라인 단위로 복사합니다.
 */
export function deleteLine(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;
  const deletedLine = state.lines[line] ?? '';

  let nextLines = state.lines.filter((_, idx) => idx !== line);
  if (nextLines.length === 0) {
    nextLines = [''];
  }

  const targetLine = Math.min(line, nextLines.length - 1);
  const clampedCursor = clampCursor(
    nextLines,
    { line: targetLine, col: state.cursor.col },
    'NORMAL'
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    clipboard: {
      type: 'line',
      content: deletedLine,
    },
    pendingKeys: undefined,
  };
}

type CharType = 'word' | 'punct' | 'space';

function getCharType(ch: string | undefined): CharType {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/\w/.test(ch)) return 'word';
  return 'punct';
}

/**
 * 'dw': 현재 커서 위치부터 다음 단어의 시작 전까지를 삭제하고 클립보드에 복사합니다.
 */
export function deleteWord(state: VimEditorState): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);

  const startType = getCharType(currentLine[col]);
  let endCol = col;

  if (startType === 'space') {
    while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') {
      endCol++;
    }
  } else {
    while (endCol < currentLine.length && getCharType(currentLine[endCol]) === startType) {
      endCol++;
    }
    while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') {
      endCol++;
    }
  }

  const deletedText = currentLine.slice(col, endCol);
  const newLine = currentLine.slice(0, col) + currentLine.slice(endCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const clampedCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    clipboard: {
      type: 'text',
      content: deletedText,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'p': 클립보드의 내용을 현재 위치(또는 다음 줄)에 붙여넣습니다.
 */
export function putClipboard(state: VimEditorState): VimEditorState {
  if (!state.clipboard) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line, col } = state.cursor;

  if (state.clipboard.type === 'line') {
    // 줄 단위 붙여넣기: 현재 줄 바로 아래에 삽입
    const targetLine = line + 1;
    const nextLines = [
      ...state.lines.slice(0, targetLine),
      state.clipboard.content,
      ...state.lines.slice(targetLine),
    ];
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: targetLine, col: 0 },
      pendingKeys: undefined,
    };
  }

  // 텍스트 단위 붙여넣기: 현재 커서 글자 뒤에 삽입
  const currentLine = state.lines[line] ?? '';
  const insertCol = currentLine.length === 0 ? 0 : col + 1;
  const newLine =
    currentLine.slice(0, insertCol) +
    state.clipboard.content +
    currentLine.slice(insertCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const newCol = Math.min(
    getMaxCol(newLine, 'NORMAL'),
    insertCol + Math.max(0, state.clipboard.content.length - 1)
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col: newCol },
    pendingKeys: undefined,
  };
}

/**
 * 'u': 직전 상태로 실행 취소(Undo)합니다.
 */
export function undo(state: VimEditorState): VimEditorState {
  if (!state.undoStack || state.undoStack.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const lastSnapshot = state.undoStack[state.undoStack.length - 1];
  const nextUndo = state.undoStack.slice(0, -1);

  const currentSnapshot: StateSnapshot = {
    lines: [...state.lines],
    cursor: { ...state.cursor },
  };

  const nextRedo = [...(state.redoStack ?? []), currentSnapshot];

  return {
    ...state,
    lines: lastSnapshot.lines,
    cursor: clampCursor(lastSnapshot.lines, lastSnapshot.cursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    pendingKeys: undefined,
  };
}

/**
 * 'Ctrl+r': 취소한 변경사항을 다시 실행(Redo)합니다.
 */
export function redo(state: VimEditorState): VimEditorState {
  if (!state.redoStack || state.redoStack.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const nextSnapshot = state.redoStack[state.redoStack.length - 1];
  const nextRedo = state.redoStack.slice(0, -1);

  const currentSnapshot: StateSnapshot = {
    lines: [...state.lines],
    cursor: { ...state.cursor },
  };

  const nextUndo = [...(state.undoStack ?? []), currentSnapshot];

  return {
    ...state,
    lines: nextSnapshot.lines,
    cursor: clampCursor(nextSnapshot.lines, nextSnapshot.cursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    pendingKeys: undefined,
  };
}
