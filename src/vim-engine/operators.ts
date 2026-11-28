import { VimEditorState } from './types';
import { curswantColumnOn } from './virtualColumn';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { getOptions, hasFormatOption, extractCommentPrefix } from './setOptionsCore';
import { pushUndoSnapshot, pushUndoSnapshotAt } from './undoHistory';

export { pushUndoSnapshot, undo, redo } from './undoHistory';

/**
 * 'dd' / '[count]dd': 현재 줄부터 count개의 줄을 삭제하고 클립보드에 라인 단위로 복사합니다.
 */
export function deleteLine(state: VimEditorState, count = 1): VimEditorState {
  const { line } = state.cursor;
  // Vim nv_lineop: dd 는 연산 전에 beginline(BL_SOL | BL_FIX) 로 커서를 옮기므로(실행 취소 커서도 그 위치),
  // 'startofline' 이면 첫 비공백, 아니면 기억한 열입니다.
  const startCol = getOptions(state).startofline
    ? getFirstNonBlankCol(state.lines[line] ?? '')
    : Math.min(curswantColumnOn(state, state.lines, line), Math.max(0, (state.lines[line] ?? '').length - 1));
  const stateWithSnapshot = pushUndoSnapshot({ ...state, cursor: { line, col: startCol } });

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
  // Vim do_pending_operator: 'nostartofline' 이면 줄 단위 삭제 뒤 기억한 열(curswant)로 갑니다 (빈 줄을 지나온 3G 뒤 dd 도 원래 열로).
  // 'startofline' 이면 op_delete 의 beginline(BL_WHITE | BL_FIX): 첫 비공백으로 갑니다.
  const clampedCursor = clampCursor(
    nextLines,
    {
      line: targetLine,
      col: getOptions(state).startofline ? getFirstNonBlankCol(nextLines[targetLine] ?? '') : curswantColumnOn(state, nextLines, targetLine),
    },
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
 * 'x' / '[count]x': 현재 커서 위치부터 count개의 글자를 삭제합니다.
 */
export function deleteChar(state: VimEditorState, count = 1): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // Vim: x 는 dl 이라 빈 줄에서는 빈 범위 — 지울 것은 없지만 빈 실행 취소 항목을 남깁니다 (op_delete 의 u_save_cursor).
  if (currentLine.length === 0) {
    return { ...pushUndoSnapshot(state), pendingKeys: undefined };
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

  // Vim: X 는 dh 라 줄 처음에서는 빈 범위 — 빈 실행 취소 항목만 남깁니다.
  if (col === 0 || currentLine.length === 0) {
    return { ...pushUndoSnapshot(state), pendingKeys: undefined };
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
 * 'cc' / '[count]cc': 현재 줄을 비우고 INSERT 모드로 진입합니다.
 */
export function changeLine(state: VimEditorState, count = 1): VimEditorState {
  const stateWithSnapshot = pushUndoSnapshot(state);
  const { line } = state.cursor;

  const deleteCount = Math.min(count, state.lines.length - line);
  const deletedLines = state.lines.slice(line, line + deleteCount).join('\n');

  // Vim op_change(줄 단위): 'autoindent' 이면 첫 줄의 들여쓰기를 남기고 그 뒤에서 입력합니다.
  const indent = getOptions(state).autoindent ? ((state.lines[line] ?? '').match(/^[ \t]*/)?.[0] ?? '') : '';
  const nextLines = [
    ...state.lines.slice(0, line),
    indent,
    ...state.lines.slice(line + deleteCount),
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: { line, col: indent.length },
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
  // Vim open_line 은 u_save(lnum, lnum + 1) 이라 실행 취소 커서 판정 범위는 새 줄 자리입니다 (빈 줄 옆에 빈 줄을 열어도 그 자리로).
  const stateWithSnapshot = pushUndoSnapshotAt(state, state.cursor, { start: state.cursor.line + 1, end: state.cursor.line + 1 });
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
  const stateWithSnapshot = pushUndoSnapshotAt(state, state.cursor, { start: state.cursor.line, end: state.cursor.line });
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
