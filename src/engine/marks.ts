import { VimEditorState, CursorPosition } from '../types/vim';
import { moveToFirstNonBlank } from './motions';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { deleteVisualSelection, yankVisualSelection } from './visual';

/**
 * 점프 리스트에 현재(또는 지정된) 커서 위치를 기록합니다.
 * gg, G, [N]G, /, *, %, 'a 등 큰 점프가 일어나기 전 위치를 저장합니다.
 */
export function recordJump(
  state: VimEditorState,
  fromPos?: CursorPosition
): VimEditorState {
  const pos = fromPos ?? state.cursor;
  const list = state.jumpList ? [...state.jumpList] : [];
  const currentIndex = state.jumpIndex ?? list.length;

  const truncated = list.slice(0, Math.min(currentIndex, list.length));
  const last = truncated[truncated.length - 1];
  if (last && last.row === pos.line && last.col === pos.col) {
    return {
      ...state,
      jumpList: truncated,
      jumpIndex: truncated.length,
    };
  }

  truncated.push({ row: pos.line, col: pos.col });
  return {
    ...state,
    jumpList: truncated,
    jumpIndex: truncated.length,
  };
}

/**
 * Ctrl+o: 점프 리스트의 이전(과거) 위치로 이동
 */
export function jumpOlder(state: VimEditorState): VimEditorState {
  const list = state.jumpList ?? [];
  if (list.length === 0) return { ...state, pendingKeys: undefined };

  let currentIndex = state.jumpIndex ?? list.length;
  let updatedList = [...list];

  // 현재 커서가 점프리스트 최신에 없으면 먼저 현재 위치를 저장해 Ctrl+i로 돌아올 수 있게 함
  if (currentIndex >= list.length) {
    const last = list[list.length - 1];
    if (!last || last.row !== state.cursor.line || last.col !== state.cursor.col) {
      updatedList.push({ row: state.cursor.line, col: state.cursor.col });
    }
    currentIndex = updatedList.length - 1;
  }

  if (currentIndex > 0) {
    currentIndex -= 1;
    const target = updatedList[currentIndex];
    const targetLine = Math.max(0, Math.min(target.row, state.lines.length - 1));
    const lineLen = (state.lines[targetLine] ?? '').length;
    const targetCol = Math.max(0, Math.min(target.col, Math.max(0, lineLen - 1)));

    return {
      ...state,
      cursor: { line: targetLine, col: targetCol },
      jumpList: updatedList,
      jumpIndex: currentIndex,
      pendingKeys: undefined,
    };
  }

  return { ...state, pendingKeys: undefined };
}

/**
 * Ctrl+i: 점프 리스트의 다음(최신) 위치로 이동
 */
export function jumpNewer(state: VimEditorState): VimEditorState {
  const list = state.jumpList ?? [];
  if (list.length === 0) return { ...state, pendingKeys: undefined };

  const currentIndex = state.jumpIndex ?? list.length;
  if (currentIndex < list.length - 1) {
    const nextIndex = currentIndex + 1;
    const target = list[nextIndex];
    const targetLine = Math.max(0, Math.min(target.row, state.lines.length - 1));
    const lineLen = (state.lines[targetLine] ?? '').length;
    const targetCol = Math.max(0, Math.min(target.col, Math.max(0, lineLen - 1)));

    return {
      ...state,
      cursor: { line: targetLine, col: targetCol },
      jumpIndex: nextIndex,
      pendingKeys: undefined,
    };
  }

  return { ...state, pendingKeys: undefined };
}

/**
 * m{a-z}: 현재 커서 위치 (row, col)를 마크에 저장
 */
export function setMark(state: VimEditorState, markChar: string): VimEditorState {
  if (!/^[a-z]$/.test(markChar)) {
    return { ...state, pendingKeys: undefined };
  }

  const marks = {
    ...(state.marks ?? {}),
    [markChar]: { row: state.cursor.line, col: state.cursor.col },
  };

  return {
    ...state,
    marks,
    pendingKeys: undefined,
  };
}

/**
 * '{a-z} (줄 첫 비공백 문자) 및 `{a-z} (정확한 좌표)로 점프
 */
export function jumpToMark(
  state: VimEditorState,
  markChar: string,
  isLineWise: boolean
): VimEditorState {
  const mark = state.marks?.[markChar];
  if (!mark) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithJump = recordJump(state);
  const targetLine = Math.max(0, Math.min(mark.row, state.lines.length - 1));

  let targetCursor: CursorPosition;
  if (isLineWise) {
    targetCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });
  } else {
    const lineLen = (state.lines[targetLine] ?? '').length;
    targetCursor = { line: targetLine, col: Math.max(0, Math.min(mark.col, Math.max(0, lineLen - 1))) };
  }

  return {
    ...stateWithJump,
    cursor: clampCursor(state.lines, targetCursor, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * 마크와 결합된 연산자(d'a, d`a, c'a, c`a, y'a, y`a, v'a, v`a)를 실행합니다.
 */
export function executeMarkOperator(
  state: VimEditorState,
  op: 'd' | 'c' | 'y' | 'v',
  markChar: string,
  isLineWise: boolean
): VimEditorState {
  const mark = state.marks?.[markChar];
  if (!mark) {
    return { ...state, pendingKeys: undefined };
  }

  const startLine = state.cursor.line;
  const targetLine = Math.max(0, Math.min(mark.row, state.lines.length - 1));

  if (isLineWise) {
    const minLine = Math.min(startLine, targetLine);
    const maxLine = Math.max(startLine, targetLine);

    if (op === 'v') {
      return {
        ...state,
        mode: 'VISUAL_LINE',
        visualAnchor: { line: minLine, col: 0 },
        cursor: { line: maxLine, col: 0 },
        pendingKeys: undefined,
      };
    }

    const stateWithUndo = op === 'y' ? state : pushUndoSnapshot(state);
    const yankedLines = state.lines.slice(minLine, maxLine + 1);

    if (op === 'y') {
      return {
        ...state,
        clipboard: {
          type: 'line',
          content: yankedLines.join('\n'),
        },
        pendingKeys: undefined,
      };
    }

    if (op === 'd') {
      const remainingLines = [
        ...state.lines.slice(0, minLine),
        ...state.lines.slice(maxLine + 1),
      ];
      const newLines = remainingLines.length === 0 ? [''] : remainingLines;
      const newLine = Math.min(minLine, newLines.length - 1);
      const newCursor = moveToFirstNonBlank(newLines, { line: newLine, col: 0 });

      return {
        ...stateWithUndo,
        lines: newLines,
        cursor: newCursor,
        clipboard: {
          type: 'line',
          content: yankedLines.join('\n'),
        },
        pendingKeys: undefined,
      };
    }

    if (op === 'c') {
      const remainingLines = [
        ...state.lines.slice(0, minLine),
        '',
        ...state.lines.slice(maxLine + 1),
      ];
      return {
        ...stateWithUndo,
        lines: remainingLines,
        cursor: { line: minLine, col: 0 },
        mode: 'INSERT',
        clipboard: {
          type: 'line',
          content: yankedLines.join('\n'),
        },
        pendingKeys: undefined,
      };
    }
  } else {
    // 문자 단위(character-wise) 연산
    const p1 = { line: state.cursor.line, col: state.cursor.col };
    const lineLen = (state.lines[targetLine] ?? '').length;
    const p2 = { line: targetLine, col: Math.max(0, Math.min(mark.col, Math.max(0, lineLen - 1))) };

    const [start, end] =
      p1.line < p2.line || (p1.line === p2.line && p1.col <= p2.col)
        ? [p1, p2]
        : [p2, p1];

    if (op === 'v') {
      return {
        ...state,
        mode: 'VISUAL',
        visualAnchor: start,
        cursor: end,
        pendingKeys: undefined,
      };
    }

    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL',
      visualAnchor: start,
      cursor: end,
    };

    if (op === 'y') {
      return yankVisualSelection(visualState);
    }
    if (op === 'd') {
      return deleteVisualSelection(visualState);
    }
    if (op === 'c') {
      const deleted = deleteVisualSelection(visualState);
      return {
        ...deleted,
        mode: 'INSERT',
      };
    }
  }

  return { ...state, pendingKeys: undefined };
}
