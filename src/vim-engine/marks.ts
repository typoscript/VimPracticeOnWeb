import { VimEditorState, CursorPosition, MarkPosition } from './types';
import { moveToFirstNonBlank } from './motions';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { deleteVisualSelection, yankVisualSelection } from './visual';
import { switchBuffer, ensureBuffers } from './bufferEngine';
import { switchPaneFocus } from './splitWindow';
import { msg } from './messages';

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
 * m{a-zA-Z}: 현재 커서 위치 (row, col)를 마크에 저장
 * 소문자(a-z): 현재 버퍼 내 로컬 마크
 * 대문자(A-Z): 버퍼/파일 정보를 포함하는 전역(Global) 마크
 */
export function setMark(state: VimEditorState, markChar: string): VimEditorState {
  if (!/^[a-zA-Z]$/.test(markChar)) {
    return { ...state, pendingKeys: undefined };
  }

  const isGlobal = /^[A-Z]$/.test(markChar);
  let baseState = state;
  if (
    isGlobal &&
    (!state.splitPanes || state.splitDirection === 'none') &&
    (state.secondaryLines || state.secondaryFilename || (state.buffers && state.buffers.length > 0))
  ) {
    baseState = ensureBuffers(state);
  }

  const currentFilename =
    (baseState.buffers && baseState.currentBufferId
      ? baseState.buffers.find((b) => b.id === baseState.currentBufferId)?.name
      : null) ||
    (baseState.splitPanes && (baseState.activePaneIndex ?? 0) === 1
      ? baseState.secondaryFilename || 'target.ts'
      : baseState.primaryFilename || 'source.ts');

  const markData: MarkPosition = {
    row: baseState.cursor.line,
    col: baseState.cursor.col,
    ...(isGlobal
      ? {
          bufferId: baseState.currentBufferId,
          filename: currentFilename,
        }
      : {}),
  };

  const marks = {
    ...(baseState.marks ?? {}),
    [markChar]: markData,
  };

  return {
    ...baseState,
    marks,
    pendingKeys: undefined,
    commandMessage: isGlobal
      ? msg('전역 마크 \'{markChar}\' 설정됨 ({currentFilename}:{v})', { markChar, currentFilename, v: baseState.cursor.line + 1 })
      : undefined,
  };
}

/**
 * '{a-zA-Z} (줄 첫 비공백 문자) 및 `{a-zA-Z} (정확한 좌표)로 점프
 * 대문자(A-Z) 마크의 경우 해당 파일/버퍼로 자동 전환
 */
export function jumpToMark(
  state: VimEditorState,
  markChar: string,
  isLineWise: boolean
): VimEditorState {
  const mark = state.marks?.[markChar];
  if (!mark) {
    return {
      ...state,
      pendingKeys: undefined,
      commandMessage: `E20: Mark not set`,
      bell: true,
    };
  }

  const isGlobal = /^[A-Z]$/.test(markChar);
  let targetState = state;

  // 전역 마크이고 다른 버퍼나 분할 창 파일에 저장된 경우 파일 전환
  if (isGlobal && mark.filename) {
    if (
      targetState.splitPanes &&
      targetState.splitDirection &&
      targetState.splitDirection !== 'none'
    ) {
      if (
        targetState.secondaryFilename === mark.filename &&
        (targetState.activePaneIndex ?? 0) === 0
      ) {
        targetState = switchPaneFocus(targetState, 1);
      } else if (
        targetState.primaryFilename === mark.filename &&
        (targetState.activePaneIndex ?? 0) === 1
      ) {
        targetState = switchPaneFocus(targetState, 0);
      }
    } else {
      if (
        targetState.secondaryLines ||
        targetState.secondaryFilename ||
        (targetState.buffers && targetState.buffers.length > 0)
      ) {
        targetState = ensureBuffers(targetState);
      }

      if (targetState.buffers && targetState.buffers.length > 0) {
        const targetBuf =
          (mark.bufferId !== undefined
            ? targetState.buffers.find((b) => b.id === mark.bufferId)
            : null) ||
          targetState.buffers.find((b) => b.name === mark.filename);

        if (targetBuf && targetBuf.id !== targetState.currentBufferId) {
          targetState = switchBuffer(targetState, targetBuf.id);
        }
      }
    }
  }

  const stateWithJump = recordJump(targetState);
  const targetLine = Math.max(0, Math.min(mark.row, stateWithJump.lines.length - 1));

  let targetCursor: CursorPosition;
  if (isLineWise) {
    targetCursor = moveToFirstNonBlank(stateWithJump.lines, { line: targetLine, col: 0 });
  } else {
    const lineLen = (stateWithJump.lines[targetLine] ?? '').length;
    targetCursor = { line: targetLine, col: Math.max(0, Math.min(mark.col, Math.max(0, lineLen - 1))) };
  }

  return {
    ...stateWithJump,
    cursor: clampCursor(stateWithJump.lines, targetCursor, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * 마크 목록을 표 형태로 포맷팅합니다 (:marks, :marks [args]).
 */
export function formatMarksList(state: VimEditorState, filter?: string): string {
  const marks = state.marks ?? {};
  const entries = Object.entries(marks);
  if (entries.length === 0) {
    return 'mark line  col file/text';
  }

  const lines: string[] = ['mark line  col file/text'];
  const filterChars = filter ? filter.replace(/\s+/g, '') : null;

  for (const [key, pos] of entries) {
    if (filterChars && !filterChars.includes(key)) continue;
    const fileOrText = pos.filename
      ? pos.filename
      : (state.lines[pos.row] ?? '').trim().slice(0, 40);
    const lineNum = String(pos.row + 1).padStart(5, ' ');
    const colNum = String(pos.col).padStart(4, ' ');
    lines.push(` ${key}   ${lineNum} ${colNum} ${fileOrText}`);
  }
  return lines.join('\n');
}

/**
 * 점프 리스트 목록을 표 형태로 포맷팅합니다 (:jumps).
 */
export function formatJumpsList(state: VimEditorState): string {
  const list = state.jumpList ?? [];
  if (list.length === 0) {
    return ' jump line  col file/text';
  }

  const lines: string[] = [' jump line  col file/text'];
  const curIdx = Math.min(state.jumpIndex ?? list.length, list.length - 1);

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const diff = Math.abs(i - curIdx);
    const pointer = i === curIdx ? '>' : ' ';
    const jumpNum = String(diff).padStart(4, ' ');
    const lineNum = String(item.row + 1).padStart(5, ' ');
    const colNum = String(item.col).padStart(4, ' ');
    const text = (state.lines[item.row] ?? '').trim().slice(0, 40);
    lines.push(`${pointer}${jumpNum} ${lineNum} ${colNum} ${text}`);
  }

  return lines.join('\n');
}

/**
 * 점프 리스트를 모두 초기화합니다 (:clearjumps).
 */
export function clearJumps(state: VimEditorState): VimEditorState {
  return {
    ...state,
    jumpList: [],
    jumpIndex: 0,
    commandMessage: msg('점프 리스트가 초기화되었습니다'),
  };
}

/**
 * 마크를 삭제합니다 (:delmarks a b c, :delmarks a-z, :delmarks!).
 * bang(!)이 true이거나 인자가 '!'이면 현재 버퍼의 모든 소문자 마크(a-z)를 삭제합니다.
 */
export function deleteMarks(
  state: VimEditorState,
  args = '',
  bang = false
): VimEditorState {
  const currentMarks = { ...(state.marks ?? {}) };

  if (bang || args.trim() === '!') {
    for (const k of Object.keys(currentMarks)) {
      if (/^[a-z]$/.test(k)) {
        delete currentMarks[k];
      }
    }
    return {
      ...state,
      marks: currentMarks,
      commandMessage: msg('소문자 마크가 모두 삭제되었습니다 (:delmarks!)'),
    };
  }

  const tokens = args.trim().split(/\s+/).filter(Boolean);
  let deletedCount = 0;

  for (const token of tokens) {
    const rangeMatch = token.match(/^([a-zA-Z])-([a-zA-Z])$/);
    if (rangeMatch) {
      const c1 = rangeMatch[1].charCodeAt(0);
      const c2 = rangeMatch[2].charCodeAt(0);
      const [from, to] = c1 <= c2 ? [c1, c2] : [c2, c1];
      for (let code = from; code <= to; code++) {
        const ch = String.fromCharCode(code);
        if (currentMarks[ch]) {
          delete currentMarks[ch];
          deletedCount++;
        }
      }
    } else {
      for (const ch of token) {
        if (currentMarks[ch]) {
          delete currentMarks[ch];
          deletedCount++;
        }
      }
    }
  }

  return {
    ...state,
    marks: currentMarks,
    commandMessage: msg('{count}개의 마크가 삭제되었습니다', { count: deletedCount }),
  };
}

/**
 * 단일 마크를 삭제합니다.
 */
export function deleteSingleMark(
  state: VimEditorState,
  markChar: string
): VimEditorState {
  if (!state.marks || !state.marks[markChar]) {
    return state;
  }
  const nextMarks = { ...state.marks };
  delete nextMarks[markChar];
  return {
    ...state,
    marks: nextMarks,
  };
}

/**
 * 점프 리스트의 특정 인덱스로 직접 이동합니다.
 */
export function jumpToIndex(
  state: VimEditorState,
  targetIndex: number
): VimEditorState {
  const list = state.jumpList ?? [];
  if (targetIndex < 0 || targetIndex >= list.length) {
    return state;
  }

  const target = list[targetIndex];
  const targetLine = Math.max(0, Math.min(target.row, state.lines.length - 1));
  const lineLen = (state.lines[targetLine] ?? '').length;
  const targetCol = Math.max(0, Math.min(target.col, Math.max(0, lineLen - 1)));

  return {
    ...state,
    cursor: { line: targetLine, col: targetCol },
    jumpIndex: targetIndex,
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
