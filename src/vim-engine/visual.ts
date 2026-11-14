import { CursorPosition, VimEditorState, VimMode } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { msg } from './messages';

export interface VisualRange {
  start: CursorPosition;
  end: CursorPosition;
}

/**
 * anchor와 cursor를 비교하여 시작 좌표와 끝 좌표로 정렬된 범위를 반환합니다.
 */
export function getOrderedRange(
  anchor: CursorPosition,
  cursor: CursorPosition
): VisualRange {
  if (
    anchor.line < cursor.line ||
    (anchor.line === cursor.line && anchor.col <= cursor.col)
  ) {
    return { start: { ...anchor }, end: { ...cursor } };
  }
  return { start: { ...cursor }, end: { ...anchor } };
}

/**
 * 주어진 (line, col)이 현재 VISUAL 모드의 선택 영역 내에 포함되어 있는지 검사합니다.
 */
export function isPositionSelected(
  line: number,
  col: number,
  anchor?: CursorPosition,
  cursor?: CursorPosition,
  mode?: VimMode,
  endOfLine?: boolean
): boolean {
  if (!anchor || !cursor || (mode !== 'VISUAL' && mode !== 'VISUAL_LINE' && mode !== 'VISUAL_BLOCK')) {
    return false;
  }

  if (mode === 'VISUAL_BLOCK') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const minCol = Math.min(anchor.col, cursor.col);
    const maxCol = Math.max(anchor.col, cursor.col);
    if (endOfLine) {
      return line >= minLine && line <= maxLine && col >= minCol;
    }
    return line >= minLine && line <= maxLine && col >= minCol && col <= maxCol;
  }

  if (mode === 'VISUAL_LINE') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    return line >= minLine && line <= maxLine;
  }

  const { start, end } = getOrderedRange(anchor, cursor);

  if (line < start.line || line > end.line) {
    return false;
  }

  if (start.line === end.line) {
    return line === start.line && col >= start.col && col <= end.col;
  }

  if (line === start.line) {
    return col >= start.col;
  }

  if (line === end.line) {
    return col <= end.col;
  }

  // start.line과 end.line 사이의 중간 줄들은 전체 선택
  return true;
}

/**
 * VISUAL_BLOCK 모드에서 선택된 직사각형 열 구간을 모든 해당 행에서 삭제합니다.
 */
export function deleteVisualBlock(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const anchor = state.visualAnchor;
  const cursor = state.cursor;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);
  const isEol = Boolean(state.visualBlockEndOfLine);

  const deletedParts: string[] = [];
  const nextLines = [...state.lines];

  for (let l = minLine; l <= maxLine; l++) {
    const lineText = nextLines[l] ?? '';
    if (lineText.length <= minCol) {
      deletedParts.push('');
    } else if (isEol) {
      deletedParts.push(lineText.slice(minCol));
      nextLines[l] = lineText.slice(0, minCol);
    } else {
      const endDel = Math.min(maxCol, lineText.length - 1);
      deletedParts.push(lineText.slice(minCol, endDel + 1));
      nextLines[l] = lineText.slice(0, minCol) + lineText.slice(endDel + 1);
    }
  }

  const targetLine = Math.min(minLine, nextLines.length - 1);
  const nextCursor = clampCursor(
    nextLines,
    { line: targetLine, col: minCol },
    'NORMAL'
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    clipboard: {
      type: 'text',
      content: deletedParts.join('\n'),
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL_BLOCK 모드에서 선택된 직사각형 영역을 복사합니다.
 */
export function yankVisualBlock(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);
  const isEol = Boolean(state.visualBlockEndOfLine);

  const parts: string[] = [];
  for (let l = minLine; l <= maxLine; l++) {
    const lineText = state.lines[l] ?? '';
    if (lineText.length <= minCol) {
      parts.push('');
    } else if (isEol) {
      parts.push(lineText.slice(minCol));
    } else {
      parts.push(lineText.slice(minCol, maxCol + 1));
    }
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    cursor: clampCursor(state.lines, { line: minLine, col: minCol }, 'NORMAL'),
    clipboard: {
      type: 'text',
      content: parts.join('\n'),
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL_BLOCK 모드에서 I (첫 열 삽입), A (끝 열 추가), c (블록 변경) 모드로 진입합니다.
 */
export function startVisualBlockInsert(
  state: VimEditorState,
  insertMode: 'I' | 'A' | 'c'
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);
  const isEol = Boolean(state.visualBlockEndOfLine) && insertMode !== 'I';

  const linesList: number[] = [];
  const skippedLines: number[] = [];
  for (let l = minLine; l <= maxLine; l++) {
    linesList.push(l);
  }

  const nextLines = [...state.lines];
  let targetCol = minCol;

  if (insertMode === 'I') {
    targetCol = Math.min(minCol, (nextLines[minLine] ?? '').length);
    for (const l of linesList) {
      if (minCol > 0 && (state.lines[l] ?? '').length <= minCol) {
        skippedLines.push(l);
      }
    }
  } else if (insertMode === 'A') {
    if (isEol) {
      targetCol = (nextLines[minLine] ?? '').length;
    } else {
      targetCol = maxCol + 1;
      const firstLine = nextLines[minLine] ?? '';
      if (firstLine.length < targetCol) {
        nextLines[minLine] = firstLine.padEnd(targetCol, ' ');
      }
    }
  } else if (insertMode === 'c') {
    targetCol = Math.min(minCol, (nextLines[minLine] ?? '').length);
    for (let l = minLine; l <= maxLine; l++) {
      const lineText = nextLines[l] ?? '';
      if (minCol > 0 && lineText.length <= minCol) {
        skippedLines.push(l);
        continue;
      }
      if (lineText.length > minCol) {
        nextLines[l] = isEol
          ? lineText.slice(0, minCol)
          : lineText.slice(0, minCol) + lineText.slice(Math.min(maxCol, lineText.length - 1) + 1);
      }
    }
  }

  const stateWithSnapshot = pushUndoSnapshot(state);

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line: minLine, col: targetCol },
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    blockInsertSession: {
      lines: linesList,
      col: targetCol,
      insertMode,
      typedChars: [],
      endOfLine: isEol || undefined,
      minCol,
      skippedLines: skippedLines.length > 0 ? skippedLines : undefined,
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드에서 선택 영역을 삭제하고 NORMAL 모드로 복귀합니다.
 */
export function deleteVisualSelection(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  if (state.mode === 'VISUAL_BLOCK') {
    return deleteVisualBlock(state);
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const anchor = state.visualAnchor;
  const cursor = state.cursor;

  if (state.mode === 'VISUAL_LINE') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const deletedContent = state.lines.slice(minLine, maxLine + 1).join('\n');

    let nextLines = [
      ...state.lines.slice(0, minLine),
      ...state.lines.slice(maxLine + 1),
    ];
    if (nextLines.length === 0) {
      nextLines = [''];
    }

    const targetLine = Math.min(minLine, nextLines.length - 1);
    const nextCursor = clampCursor(
      nextLines,
      { line: targetLine, col: cursor.col },
      'NORMAL'
    );

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content: deletedContent,
      },
      pendingKeys: undefined,
    };
  }

  // 문자 단위 VISUAL 모드
  const { start, end } = getOrderedRange(anchor, cursor);

  if (start.line === end.line) {
    const currentLine = state.lines[start.line] ?? '';
    const deletedContent = currentLine.slice(start.col, end.col + 1);
    const newLine =
      currentLine.slice(0, start.col) + currentLine.slice(end.col + 1);
    const nextLines = [...state.lines];
    nextLines[start.line] = newLine;

    const nextCursor = clampCursor(nextLines, start, 'NORMAL');

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'text',
        content: deletedContent,
      },
      pendingKeys: undefined,
    };
  }

  // 여러 줄에 걸친 VISUAL 모드
  const startLineText = state.lines[start.line] ?? '';
  const endLineText = state.lines[end.line] ?? '';

  const deletedParts = [
    startLineText.slice(start.col),
    ...state.lines.slice(start.line + 1, end.line),
    endLineText.slice(0, end.col + 1),
  ];
  const deletedContent = deletedParts.join('\n');

  const mergedLine =
    startLineText.slice(0, start.col) + endLineText.slice(end.col + 1);
  let nextLines = [
    ...state.lines.slice(0, start.line),
    mergedLine,
    ...state.lines.slice(end.line + 1),
  ];
  if (nextLines.length === 0) {
    nextLines = [''];
  }

  const nextCursor = clampCursor(nextLines, start, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    clipboard: {
      type: 'text',
      content: deletedContent,
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드에서 선택 영역을 복사(Yank)하고 NORMAL 모드로 복귀합니다.
 */
export function yankVisualSelection(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  if (state.mode === 'VISUAL_BLOCK') {
    return yankVisualBlock(state);
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;

  if (state.mode === 'VISUAL_LINE') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const content = state.lines.slice(minLine, maxLine + 1).join('\n');

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content,
      },
      pendingKeys: undefined,
    };
  }

  const { start, end } = getOrderedRange(anchor, cursor);
  let content = '';

  if (start.line === end.line) {
    const currentLine = state.lines[start.line] ?? '';
    content = currentLine.slice(start.col, end.col + 1);
  } else {
    const startLineText = state.lines[start.line] ?? '';
    const endLineText = state.lines[end.line] ?? '';
    const parts = [
      startLineText.slice(start.col),
      ...state.lines.slice(start.line + 1, end.line),
      endLineText.slice(0, end.col + 1),
    ];
    content = parts.join('\n');
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    cursor: { ...start },
    clipboard: {
      type: 'text',
      content,
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL / VISUAL_LINE / VISUAL_BLOCK 모드에서 o / O 로 커서와 앵커 위치를 교대합니다.
 * - VISUAL / VISUAL_LINE: o 와 O 모두 cursor <-> visualAnchor 교대
 * - VISUAL_BLOCK: o 는 대각선 교대(cursor <-> visualAnchor), O 는 같은 행의 반대편 열 코너로 이동
 */
export function swapVisualCursorAnchor(
  state: VimEditorState,
  key: 'o' | 'O'
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, pendingKeys: undefined };
  }

  if (state.mode === 'VISUAL_BLOCK' && key === 'O') {
    const nextCursor = clampCursor(
      state.lines,
      { line: state.cursor.line, col: state.visualAnchor.col },
      'VISUAL_BLOCK'
    );
    const nextAnchor = clampCursor(
      state.lines,
      { line: state.visualAnchor.line, col: state.cursor.col },
      'VISUAL_BLOCK'
    );
    return {
      ...state,
      cursor: nextCursor,
      visualAnchor: nextAnchor,
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  const nextCursor = clampCursor(state.lines, state.visualAnchor, state.mode);
  const nextAnchor = clampCursor(state.lines, state.cursor, state.mode);
  return {
    ...state,
    cursor: nextCursor,
    visualAnchor: nextAnchor,
    pendingKeys: undefined,
  };
}

function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
        continue;
      }
      bytes += 3;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * g Ctrl-g: 현재 커서 위치 또는 Visual 선택 영역의 줄/단어/바이트 통계를 commandMessage 로 출력합니다.
 */
export function executeGCtrlG(state: VimEditorState): VimEditorState {
  const lines = state.lines;
  const totalLines = lines.length;
  const totalWords = lines.reduce((sum, l) => sum + countWords(l), 0);
  const totalBytes = lines.reduce((sum, l) => sum + utf8ByteLength(l) + 1, 0);

  if (
    (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') &&
    state.visualAnchor
  ) {
    const anchor = state.visualAnchor;
    const cursor = state.cursor;
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const selLines = maxLine - minLine + 1;

    if (state.mode === 'VISUAL_BLOCK') {
      const minCol = Math.min(anchor.col, cursor.col);
      const maxCol = Math.max(anchor.col, cursor.col);
      const isEol = Boolean(state.visualBlockEndOfLine);
      let selWords = 0;
      let selBytes = 0;
      let maxWidth = 0;

      for (let l = minLine; l <= maxLine; l++) {
        const lineText = lines[l] ?? '';
        const seg = isEol ? lineText.slice(minCol) : lineText.slice(minCol, maxCol + 1);
        selWords += countWords(seg);
        selBytes += utf8ByteLength(seg);
        if (isEol) {
          maxWidth = Math.max(maxWidth, seg.length);
        }
      }

      const selCols = isEol ? Math.max(1, maxWidth) : maxCol - minCol + 1;
      return {
        ...state,
        pendingKeys: undefined,
        commandMessage: msg(
          '선택 {cols}열; {lines} / {totalLines}줄; {words} / {totalWords}단어; {bytes} / {totalBytes}바이트',
          {
            cols: selCols,
            lines: selLines,
            totalLines,
            words: selWords,
            totalWords,
            bytes: selBytes,
            totalBytes,
          }
        ),
      };
    }

    let selWords = 0;
    let selBytes = 0;

    if (state.mode === 'VISUAL_LINE') {
      for (let l = minLine; l <= maxLine; l++) {
        const lineText = lines[l] ?? '';
        selWords += countWords(lineText);
        selBytes += utf8ByteLength(lineText) + 1;
      }
    } else {
      const { start, end } = getOrderedRange(anchor, cursor);
      if (start.line === end.line) {
        const lineText = lines[start.line] ?? '';
        const seg = lineText.slice(start.col, end.col + 1);
        selWords = countWords(seg);
        selBytes = lineText.length === 0 ? 1 : utf8ByteLength(seg);
      } else {
        const startLine = lines[start.line] ?? '';
        const endLine = lines[end.line] ?? '';
        const startSeg = startLine.slice(start.col);
        selWords += countWords(startSeg);
        selBytes += utf8ByteLength(startSeg) + 1;

        for (let l = start.line + 1; l < end.line; l++) {
          const midLine = lines[l] ?? '';
          selWords += countWords(midLine);
          selBytes += utf8ByteLength(midLine) + 1;
        }

        const endSeg = endLine.slice(0, end.col + 1);
        selWords += countWords(endSeg);
        selBytes += endLine.length === 0 ? 1 : utf8ByteLength(endSeg);
      }
    }

    return {
      ...state,
      pendingKeys: undefined,
      commandMessage: msg(
        '선택 {lines} / {totalLines}줄; {words} / {totalWords}단어; {bytes} / {totalBytes}바이트',
        {
          lines: selLines,
          totalLines,
          words: selWords,
          totalWords,
          bytes: selBytes,
          totalBytes,
        }
      ),
    };
  }

  // NORMAL 모드
  const lineIdx = state.cursor.line;
  const colIdx = state.cursor.col;
  const lineText = lines[lineIdx] ?? '';
  const col = lineText.length === 0 ? 1 : colIdx + 1;
  const lineCols = utf8ByteLength(lineText);

  let bytePos = 1;
  let wordPos = 0;
  for (let i = 0; i < lineIdx; i++) {
    bytePos += utf8ByteLength(lines[i] ?? '') + 1;
    wordPos += countWords(lines[i] ?? '');
  }
  bytePos += utf8ByteLength(lineText.slice(0, colIdx));

  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    if (match.index <= colIdx) {
      wordPos += 1;
    } else {
      break;
    }
  }

  return {
    ...state,
    pendingKeys: undefined,
    commandMessage: msg(
      '열 {col} / {lineCols}; 줄 {line} / {totalLines}; 단어 {word} / {totalWords}; 바이트 {byte} / {totalBytes}',
      {
        col,
        lineCols,
        line: lineIdx + 1,
        totalLines,
        word: wordPos,
        totalWords,
        byte: bytePos,
        totalBytes,
      }
    ),
  };
}
