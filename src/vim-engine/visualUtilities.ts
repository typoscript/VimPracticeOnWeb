import { CursorPosition, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { msg } from './messages';
import { getOrderedRange } from './visual';

export function utf8ByteLength(str: string): number {
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

/**
 * VISUAL / VISUAL_LINE / VISUAL_BLOCK 선택 영역의 각 문자를 지정 문자로 일괄 치환합니다 (v_r{char}).
 */
export function replaceVisualChars(
  state: VimEditorState,
  replacementChar: string
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const ch = replacementChar === 'Space' ? ' ' : replacementChar;
  const stateWithSnapshot = pushUndoSnapshot(state);
  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const snap = {
    mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
    anchor: { ...anchor },
    cursor: { ...cursor },
  };
  const nextLines = [...state.lines];
  let targetPos: CursorPosition;

  if (state.mode === 'VISUAL_BLOCK') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const minCol = Math.min(anchor.col, cursor.col);
    const maxCol = Math.max(anchor.col, cursor.col);
    const isEol = Boolean(state.visualBlockEndOfLine);

    for (let l = minLine; l <= maxLine; l++) {
      const lineText = nextLines[l] ?? '';
      if (lineText.length <= minCol) continue;
      const endCol = isEol ? lineText.length - 1 : Math.min(maxCol, lineText.length - 1);
      const count = endCol - minCol + 1;
      if (count > 0) {
        nextLines[l] = lineText.slice(0, minCol) + ch.repeat(count) + lineText.slice(endCol + 1);
      }
    }
    targetPos = { line: minLine, col: minCol };
  } else if (state.mode === 'VISUAL_LINE') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    for (let l = minLine; l <= maxLine; l++) {
      const lineText = nextLines[l] ?? '';
      if (lineText.length > 0) {
        nextLines[l] = ch.repeat(lineText.length);
      }
    }
    targetPos = { line: minLine, col: 0 };
  } else {
    const { start, end } = getOrderedRange(anchor, cursor);
    for (let l = start.line; l <= end.line; l++) {
      const lineText = nextLines[l] ?? '';
      if (lineText.length === 0) continue;
      // 시작이 줄 끝 다음 칸(NUL)이면 그 줄에서 바꿀 글자가 없습니다 (vggr# 이 짧은 첫 줄을 건드리지 않음).
      const fromCol = l === start.line ? start.col : 0;
      const toCol = l === end.line ? Math.min(end.col, lineText.length - 1) : lineText.length - 1;
      const count = toCol - fromCol + 1;
      if (count > 0) {
        nextLines[l] = lineText.slice(0, fromCol) + ch.repeat(count) + lineText.slice(toCol + 1);
      }
    }
    targetPos = start;
  }

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'NORMAL',
    cursor: clampCursor(nextLines, targetPos, 'NORMAL'),
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    pendingKeys: undefined,
    activeRegister: undefined,
    lastVisualSelection: snap,
  };
}
