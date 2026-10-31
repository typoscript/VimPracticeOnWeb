import { CursorPosition, VimEditorState, VimMode } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';

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
  mode?: VimMode
): boolean {
  if (!anchor || !cursor || (mode !== 'VISUAL' && mode !== 'VISUAL_LINE')) {
    return false;
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
 * VISUAL 모드에서 선택 영역을 삭제하고 NORMAL 모드로 복귀합니다.
 */
export function deleteVisualSelection(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
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
      { line: targetLine, col: 0 },
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
    cursor: { ...start },
    clipboard: {
      type: 'text',
      content,
    },
    pendingKeys: undefined,
  };
}
