import { StateSnapshot, VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { areLinesEqual, ensureUndoTreeInitialized, recordUndoTreeChange, jumpUndoSeq } from './undoTreeEngine';

const MAX_HISTORY = 50;

/**
 * 상태 변경 전 실행 취소(Undo) 스냅샷을 푸시하고 Redo 스택을 초기화합니다.
 */
export function pushUndoSnapshot(state: VimEditorState): VimEditorState {
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
  };
}

/**
 * 'dd' / '[count]dd': 현재 줄부터 count개의 줄을 삭제하고 클립보드에 라인 단위로 복사합니다.
 */
export function deleteLine(state: VimEditorState, count = 1): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;

  const deleteCount = Math.min(count, state.lines.length - line);
  const deletedLines = state.lines.slice(line, line + deleteCount).join('\n');

  let nextLines = [
    ...state.lines.slice(0, line),
    ...state.lines.slice(line + deleteCount),
  ];
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
      content: deletedLines,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'yy' / '[count]yy': 현재 줄부터 count개의 줄을 라인 단위로 복사합니다.
 */
export function yankLine(state: VimEditorState, count = 1): VimEditorState {
  const { line } = state.cursor;
  const yankCount = Math.min(Math.max(1, count), state.lines.length - line);
  const yankedLines = state.lines.slice(line, line + yankCount).join('\n');
  return {
    ...state,
    clipboard: {
      type: 'line',
      content: yankedLines,
    },
    pendingKeys: undefined,
  };
}

export type CharType = 'word' | 'punct' | 'space';

export function getCharType(ch: string | undefined): CharType {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/\w/.test(ch)) return 'word';
  return 'punct';
}

/**
 * 'dw' / '[count]dw' / 'd[count]w': 현재 커서 위치부터 count개의 단어를 삭제하고 클립보드에 복사합니다.
 */
export function deleteWord(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);

  let endCol = col;
  for (let step = 0; step < count; step++) {
    if (endCol >= currentLine.length) break;
    const startType = getCharType(currentLine[endCol]);

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
 * 'de' / '[count]de': 현재 커서 위치부터 단어의 끝(공백 제외)까지 삭제합니다.
 */
export function deleteToEndOfWord(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);

  let endCol = col;
  for (let step = 0; step < count; step++) {
    if (endCol >= currentLine.length) break;
    const startType = getCharType(currentLine[endCol]);

    if (startType === 'space') {
      while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') {
        endCol++;
      }
    }
    if (endCol < currentLine.length) {
      const wordType = getCharType(currentLine[endCol]);
      while (endCol < currentLine.length && getCharType(currentLine[endCol]) === wordType) {
        endCol++;
      }
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
 * 'x' / '[count]x': 현재 커서 위치부터 count개의 글자를 삭제합니다.
 */
export function deleteChar(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const deleteCount = Math.min(count, currentLine.length - col);
  const deletedContent = currentLine.slice(col, col + deleteCount);
  const newLine = currentLine.slice(0, col) + currentLine.slice(col + deleteCount);

  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const clampedCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    clipboard: {
      type: 'text',
      content: deletedContent,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'cw' / 'c[count]w': 커서 위치부터 단어 끝까지 삭제 후 클립보드에 저장하고 INSERT 모드로 진입합니다.
 */
export function changeWord(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    const stateWithSnapshot = pushUndoSnapshot(state);
    if (state.lines.length > line + 1) {
      const nextLines = [
        ...state.lines.slice(0, line),
        ...state.lines.slice(line + 1),
      ];
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line, col: 0 },
        mode: 'INSERT',
        pendingKeys: undefined,
      };
    }
    return {
      ...stateWithSnapshot,
      mode: 'INSERT',
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);

  let endCol = col;
  for (let step = 0; step < count; step++) {
    if (endCol >= currentLine.length) break;
    const startType = getCharType(currentLine[endCol]);

    if (startType === 'space') {
      while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') {
        endCol++;
      }
    } else {
      while (endCol < currentLine.length && getCharType(currentLine[endCol]) === startType) {
        endCol++;
      }
      if (step < count - 1) {
        while (endCol < currentLine.length && getCharType(currentLine[endCol]) === 'space') {
          endCol++;
        }
      }
    }
  }

  const deletedText = currentLine.slice(col, endCol);
  const newLine = currentLine.slice(0, col) + currentLine.slice(endCol);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col },
    mode: 'INSERT',
    clipboard: {
      type: 'text',
      content: deletedText,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'cc' / '[count]cc': 현재 줄을 비우고 INSERT 모드로 진입합니다.
 */
export function changeLine(state: VimEditorState, count = 1): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;

  const deleteCount = Math.min(count, state.lines.length - line);
  const deletedLines = state.lines.slice(line, line + deleteCount).join('\n');

  const nextLines = [
    ...state.lines.slice(0, line),
    '',
    ...state.lines.slice(line + deleteCount),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col: 0 },
    mode: 'INSERT',
    clipboard: {
      type: 'line',
      content: deletedLines,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'C': 현재 커서부터 줄 끝까지 삭제하고 INSERT 모드로 진입합니다.
 */
export function changeToEndOfLine(state: VimEditorState): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  const stateWithSnapshot = pushUndoSnapshot(state);
  const deletedText = currentLine.slice(col);
  const newLine = currentLine.slice(0, col);

  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col },
    mode: 'INSERT',
    clipboard: {
      type: 'text',
      content: deletedText,
    },
    pendingKeys: undefined,
  };
}

/**
 * 'r{char}': 현재 커서 위치의 문자 count개를 {char}로 교체하고 NORMAL 모드를 유지합니다.
 */
export function replaceChar(state: VimEditorState, char: string, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const replaceCount = Math.min(count, currentLine.length - col);
  const newLine =
    currentLine.slice(0, col) +
    char.repeat(replaceCount) +
    currentLine.slice(col + replaceCount);

  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const targetCol = col + replaceCount - 1;
  const clampedCursor = clampCursor(nextLines, { line, col: targetCol }, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    pendingKeys: undefined,
  };
}

/**
 * 'I': 현재 줄의 첫 번째 공백이 아닌 문자로 이동 후 INSERT 모드 진입
 */
export function insertAtFirstNonBlank(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const currentLine = state.lines[state.cursor.line] ?? '';
  const firstNonBlank = getFirstNonBlankCol(currentLine);

  return {
    ...stateWithSnapshot,
    mode: 'INSERT',
    cursor: { line: state.cursor.line, col: firstNonBlank },
    pendingKeys: undefined,
  };
}

/**
 * 'A': 현재 줄의 맨 끝 다음 칸으로 이동 후 INSERT 모드 진입
 */
export function appendAtLineEnd(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const currentLine = state.lines[state.cursor.line] ?? '';
  const endCol = currentLine.length;

  return {
    ...stateWithSnapshot,
    mode: 'INSERT',
    cursor: { line: state.cursor.line, col: endCol },
    pendingKeys: undefined,
  };
}

/**
 * 'o': 현재 줄 아래에 새 빈 줄을 삽입하고 INSERT 모드 진입
 */
export function openLineBelow(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;
  const targetLine = line + 1;

  const nextLines = [
    ...state.lines.slice(0, targetLine),
    '',
    ...state.lines.slice(targetLine),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line: targetLine, col: 0 },
    pendingKeys: undefined,
  };
}

/**
 * 'O': 현재 줄 위에 새 빈 줄을 삽입하고 INSERT 모드 진입
 */
export function openLineAbove(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;

  const nextLines = [
    ...state.lines.slice(0, line),
    '',
    ...state.lines.slice(line),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line, col: 0 },
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
    if (state.undoTreeNodes && state.currentUndoSeq !== undefined && state.currentUndoSeq > 0) {
      const parent = state.undoTreeNodes[state.currentUndoSeq]?.parentSeq ?? 0;
      return jumpUndoSeq(state, parent);
    }
    return { ...state, pendingKeys: undefined };
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

  return {
    ...state,
    lines: lastSnapshot.lines,
    cursor: clampCursor(lastSnapshot.lines, lastSnapshot.cursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    currentUndoSeq: currentSeq,
    undoTimeIndex: timeIdx,
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

  return {
    ...state,
    lines: nextSnapshot.lines,
    cursor: clampCursor(nextSnapshot.lines, nextSnapshot.cursor, 'NORMAL'),
    undoStack: nextUndo,
    redoStack: nextRedo,
    currentUndoSeq: currentSeq,
    undoTimeIndex: timeIdx,
    pendingKeys: undefined,
  };
}
