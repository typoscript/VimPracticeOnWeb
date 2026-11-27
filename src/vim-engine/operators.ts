import { StateSnapshot, VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { getOptions, hasFormatOption, extractCommentPrefix } from './setOptionsCore';
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
  const endRow = Math.min(state.lines.length - 1, line + yankCount - 1);
  return {
    ...state,
    clipboard: {
      type: 'line',
      content: yankedLines,
    },
    lastBracketMarks: {
      start: { row: line, col: 0 },
      end: { row: endRow, col: Math.max(0, (state.lines[endRow] ?? '').length - 1) },
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
 * 'X' / '[count]X': 커서 앞(왼쪽)의 count개 글자를 삭제합니다 (dh 와 동일).
 */
export function deleteCharBefore(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (col === 0 || currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const startCol = Math.max(0, col - Math.max(1, count));
  const deletedContent = currentLine.slice(startCol, col);
  const newLine = currentLine.slice(0, startCol) + currentLine.slice(col);

  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  const clampedCursor = clampCursor(nextLines, { line, col: startCol }, 'NORMAL');

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
 * 'U': 현재 줄에서 마지막으로 편집하기 전 원래 내용으로 되돌립니다. 다시 U 를 누르면 토글됩니다 (:help U).
 */
export function undoCurrentLine(state: VimEditorState): VimEditorState {
  const snap = state.lineUndoSnapshot;
  const { line } = state.cursor;
  const curBufId = state.currentBufferId ?? 1;

  if (!snap || snap.line !== line || (snap.bufferId ?? 1) !== curBufId) {
    return { ...state, pendingKeys: undefined };
  }

  const currentLine = state.lines[line] ?? '';
  let replacement: string;
  let nextToggled: string | undefined;
  let nextToggledCol: number | undefined;
  let targetCol = 0;

  if (currentLine !== snap.originalText) {
    replacement = snap.originalText;
    nextToggled = currentLine;
    nextToggledCol = state.cursor.col;
    targetCol = snap.originalCol ?? 0;
  } else if (snap.toggledText !== undefined && snap.toggledText !== currentLine) {
    replacement = snap.toggledText;
    nextToggled = undefined;
    nextToggledCol = undefined;
    targetCol = snap.toggledCol ?? 0;
  } else {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const nextLines = [...state.lines];
  nextLines[line] = replacement;
  const clampedCursor = clampCursor(nextLines, { line, col: targetCol }, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampedCursor,
    pendingKeys: undefined,
    lineUndoSnapshot: {
      ...snap,
      toggledText: nextToggled,
      toggledCol: nextToggledCol,
    },
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
 * 'C' / '[count]C': 현재 커서부터 줄 끝(count > 1 이면 count개 줄 끝)까지 삭제하고 INSERT 모드로 진입합니다.
 */
export function changeToEndOfLine(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  const stateWithSnapshot = pushUndoSnapshot(state);
  const endLine = Math.min(state.lines.length - 1, line + Math.max(1, count) - 1);
  const deletedText =
    endLine === line
      ? currentLine.slice(col)
      : [currentLine.slice(col), ...state.lines.slice(line + 1, endLine + 1)].join('\n');
  const newLine = currentLine.slice(0, col);

  const nextLines = [
    ...state.lines.slice(0, line),
    newLine,
    ...state.lines.slice(endLine + 1),
  ];

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
 * autoindent / smartindent 옵션에 따라 새 줄의 자동 들여쓰기 문자열을 계산합니다.
 */
export function computeAutoIndent(
  prevLine: string,
  opts: ReturnType<typeof getOptions>,
  triggerSmartOpen = true
): string {
  if (!opts.autoindent && !opts.smartindent) return '';
  const baseIndent = prevLine.match(/^[ \t]*/)?.[0] ?? '';
  if (opts.smartindent && triggerSmartOpen && prevLine.trimEnd().endsWith('{')) {
    const sw = opts.shiftwidth || 2;
    const unit = opts.expandtab !== false ? ' '.repeat(sw) : '\t';
    return baseIndent + unit;
  }
  return baseIndent;
}

/**
 * 'o': 현재 줄 아래에 새 빈 줄을 삽입하고 INSERT 모드 진입
 */
export function openLineBelow(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;
  const targetLine = line + 1;
  const opts = getOptions(state);
  const curLine = state.lines[line] ?? '';
  const comment = hasFormatOption(opts, 'o') ? extractCommentPrefix(curLine) : null;
  const indent = comment ? comment.contPrefix : computeAutoIndent(curLine, opts, true);

  const nextLines = [
    ...state.lines.slice(0, targetLine),
    indent,
    ...state.lines.slice(targetLine),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line: targetLine, col: indent.length },
    pendingKeys: undefined,
  };
}

/**
 * 'O': 현재 줄 위에 새 빈 줄을 삽입하고 INSERT 모드 진입
 */
export function openLineAbove(state: VimEditorState): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;
  const opts = getOptions(state);
  const curLine = state.lines[line] ?? '';
  const comment = hasFormatOption(opts, 'o') ? extractCommentPrefix(curLine) : null;
  const indent =
    comment && comment.leader !== '/*'
      ? comment.fullPrefix
      : computeAutoIndent(curLine, opts, false);

  const nextLines = [
    ...state.lines.slice(0, line),
    indent,
    ...state.lines.slice(line),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line, col: indent.length },
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
