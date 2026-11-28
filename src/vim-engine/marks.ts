import { VimEditorState, CursorPosition, MarkPosition, JumpListItem } from './types';
import { moveToFirstNonBlank } from './motions';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { deleteVisualSelection, yankVisualSelection } from './visual';
import { switchBuffer, ensureBuffers, editBuffer } from './bufferEngine';
import { switchPaneFocus } from './splitWindow';
import { msg } from './messages';

export const SPECIAL_MARK_CHARS = new Set(["'", '`', '.', '^', '[', ']', '<', '>']);

/**
 * 마크 점프('/`) 대상 문자로 유효한지 판별합니다 (a-z, A-Z 및 특수 마크 ', `, ., ^, [, ], <, >).
 */
export function isValidMarkJumpChar(markChar: string): boolean {
  return /^[a-zA-Z]$/.test(markChar) || SPECIAL_MARK_CHARS.has(markChar);
}

/**
 * 사용자 마크(a-zA-Z) 및 특수 마크(', `, ., ^, [, ], <, >)의 좌표를 해석합니다.
 */
export function resolveMarkPosition(
  state: VimEditorState,
  markChar: string
): MarkPosition | null {
  if (/^[a-zA-Z]$/.test(markChar)) {
    return state.marks?.[markChar] ?? null;
  }
  if (markChar === "'" || markChar === '`') {
    return state.lastJumpPos ? { ...state.lastJumpPos } : { row: 0, col: 0 };
  }
  if (markChar === '.') {
    if (state.lastChangeMark) {
      return { ...state.lastChangeMark };
    }
    if (state.changeList && state.changeList.length > 0) {
      const last = state.changeList[state.changeList.length - 1];
      return { row: last.row, col: last.col };
    }
    return null;
  }
  if (markChar === '^') {
    if (state.lastInsertPos) {
      return { row: state.lastInsertPos.row, col: state.lastInsertPos.col };
    }
    return null;
  }
  if (markChar === '<' || markChar === '>') {
    const vis = state.lastVisualSelection;
    if (!vis) return null;
    const isAnchorFirst =
      vis.anchor.line < vis.cursor.line ||
      (vis.anchor.line === vis.cursor.line && vis.anchor.col <= vis.cursor.col);
    const pos =
      markChar === '<'
        ? isAnchorFirst
          ? vis.anchor
          : vis.cursor
        : isAnchorFirst
        ? vis.cursor
        : vis.anchor;
    return { row: pos.line, col: pos.col };
  }
  if (markChar === '[') {
    return state.lastBracketMarks?.start ? { ...state.lastBracketMarks.start } : null;
  }
  if (markChar === ']') {
    return state.lastBracketMarks?.end ? { ...state.lastBracketMarks.end } : null;
  }
  return null;
}

/**
 * 버퍼 변경 시 특수 마크('., '[, '])를 불변 갱신합니다.
 */
export function computeSpecialMarksUpdate(
  prevState: VimEditorState,
  nextState: VimEditorState
): { lastBracketMarks: { start: { row: number; col: number }; end: { row: number; col: number } } } | null {
  const prevLines = prevState.lines ?? [];
  const nextLines = nextState.lines ?? [];
  if (prevLines === nextLines) return null;

  const minLen = Math.min(prevLines.length, nextLines.length);
  let firstDiff = 0;
  while (firstDiff < minLen && prevLines[firstDiff] === nextLines[firstDiff]) {
    firstDiff++;
  }
  if (firstDiff === minLen && prevLines.length === nextLines.length) {
    return null;
  }

  let suffix = 0;
  while (
    suffix < minLen - firstDiff &&
    prevLines[prevLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const lastNextLine = Math.max(firstDiff, Math.min(nextLines.length - 1, nextLines.length - 1 - suffix));
  let start: { row: number; col: number };
  let end: { row: number; col: number };

  if (firstDiff === lastNextLine && prevLines.length === nextLines.length) {
    const oldLine = prevLines[firstDiff] ?? '';
    const newLine = nextLines[firstDiff] ?? '';
    const minCol = Math.min(oldLine.length, newLine.length);
    let firstCol = 0;
    while (firstCol < minCol && oldLine[firstCol] === newLine[firstCol]) {
      firstCol++;
    }
    let sufCol = 0;
    while (
      sufCol < minCol - firstCol &&
      oldLine[oldLine.length - 1 - sufCol] === newLine[newLine.length - 1 - sufCol]
    ) {
      sufCol++;
    }
    const maxValidCol = Math.max(0, newLine.length - 1);
    const clampedStartCol = Math.min(firstCol, maxValidCol);
    const rawEndCol = Math.max(clampedStartCol, newLine.length - 1 - sufCol);
    const clampedEndCol = Math.min(rawEndCol, maxValidCol);
    start = { row: firstDiff, col: clampedStartCol };
    end = { row: firstDiff, col: clampedEndCol };

    if (
      prevState.mode === 'INSERT' &&
      nextState.mode === 'INSERT' &&
      prevState.lastBracketMarks &&
      prevState.lastBracketMarks.start.row === firstDiff &&
      prevState.lastBracketMarks.end.row === firstDiff &&
      clampedStartCol >= prevState.lastBracketMarks.start.col &&
      clampedStartCol <= prevState.lastBracketMarks.end.col + 1
    ) {
      start = { ...prevState.lastBracketMarks.start };
    }
  } else {
    const safeFirst = Math.min(firstDiff, Math.max(0, nextLines.length - 1));
    const safeLast = Math.min(lastNextLine, Math.max(0, nextLines.length - 1));
    start = { row: safeFirst, col: 0 };
    end = { row: safeLast, col: Math.max(0, (nextLines[safeLast] ?? '').length - 1) };
  }

  // '. 마크는 변경 목록과 함께 changelist.ts 가 정합니다 (Vim b_last_change)
  return {
    lastBracketMarks: { start, end },
  };
}

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
  const curBufId = state.currentBufferId;
  const curFilename = state.primaryFilename;
  const jumpMark: MarkPosition = {
    row: pos.line,
    col: pos.col,
    ...(curBufId !== undefined ? { bufferId: curBufId } : {}),
    ...(curFilename ? { filename: curFilename } : {}),
  };

  const truncated = list.slice(0, Math.min(currentIndex, list.length));
  const last = truncated[truncated.length - 1];
  if (
    last &&
    last.row === pos.line &&
    last.col === pos.col &&
    (last.filename ?? curFilename) === curFilename
  ) {
    return {
      ...state,
      jumpList: truncated,
      jumpIndex: truncated.length,
      lastJumpPos: jumpMark,
    };
  }

  const newEntry: JumpListItem = {
    row: pos.line,
    col: pos.col,
    ...(curBufId !== undefined ? { bufferId: curBufId } : {}),
    ...(curFilename ? { filename: curFilename } : {}),
  };
  truncated.push(newEntry);
  return {
    ...state,
    jumpList: truncated,
    jumpIndex: truncated.length,
    lastJumpPos: jumpMark,
  };
}

function applyJumpTarget(
  state: VimEditorState,
  target: JumpListItem,
  updatedList: JumpListItem[],
  nextIndex: number
): VimEditorState {
  let targetState = state;
  if (target.filename && target.filename !== state.primaryFilename) {
    if (state.buffers && state.buffers.length > 0) {
      const targetBuf =
        (target.bufferId !== undefined
          ? state.buffers.find((b) => b.id === target.bufferId)
          : null) ||
        state.buffers.find((b) => b.name === target.filename);
      if (targetBuf && targetBuf.id !== state.currentBufferId) {
        targetState = switchBuffer(state, targetBuf.id);
      } else if (!targetBuf) {
        targetState = editBuffer(state, target.filename);
      }
    } else {
      targetState = editBuffer(state, target.filename);
    }
  } else if (
    target.bufferId !== undefined &&
    state.buffers &&
    target.bufferId !== state.currentBufferId
  ) {
    const targetBuf = state.buffers.find((b) => b.id === target.bufferId);
    if (targetBuf) {
      targetState = switchBuffer(state, targetBuf.id);
    }
  }

  const targetLine = Math.max(0, Math.min(target.row, targetState.lines.length - 1));
  const lineLen = (targetState.lines[targetLine] ?? '').length;
  const targetCol = Math.max(0, Math.min(target.col, Math.max(0, lineLen - 1)));

  return {
    ...targetState,
    cursor: { line: targetLine, col: targetCol },
    jumpList: updatedList,
    jumpIndex: nextIndex,
    pendingKeys: undefined,
  };
}

/**
 * [count]Ctrl+o: 점프 리스트의 이전(과거) 위치로 이동 (버퍼 간 전환 지원)
 */
export function jumpOlder(state: VimEditorState, count = 1): VimEditorState {
  const list = state.jumpList ?? [];
  if (list.length === 0) return { ...state, pendingKeys: undefined };

  let currentIndex = state.jumpIndex ?? list.length;
  const updatedList = [...list];
  const curFilename = state.primaryFilename;
  const curBufId = state.currentBufferId;

  // 현재 커서가 점프리스트 최신에 없으면 먼저 현재 위치를 저장해 Ctrl+i로 돌아올 수 있게 함
  if (currentIndex >= list.length) {
    const last = list[list.length - 1];
    if (
      !last ||
      last.row !== state.cursor.line ||
      last.col !== state.cursor.col ||
      (last.filename ?? curFilename) !== curFilename
    ) {
      updatedList.push({
        row: state.cursor.line,
        col: state.cursor.col,
        ...(curBufId !== undefined ? { bufferId: curBufId } : {}),
        ...(curFilename ? { filename: curFilename } : {}),
      });
    }
    currentIndex = updatedList.length - 1;
  }

  if (currentIndex > 0) {
    const steps = Math.max(1, count);
    const nextIndex = Math.max(0, currentIndex - steps);
    return applyJumpTarget(state, updatedList[nextIndex], updatedList, nextIndex);
  }

  return { ...state, pendingKeys: undefined };
}

/**
 * [count]Ctrl+i: 점프 리스트의 다음(최신) 위치로 이동 (버퍼 간 전환 지원)
 */
export function jumpNewer(state: VimEditorState, count = 1): VimEditorState {
  const list = state.jumpList ?? [];
  if (list.length === 0) return { ...state, pendingKeys: undefined };

  const currentIndex = state.jumpIndex ?? list.length;
  if (currentIndex < list.length - 1) {
    const steps = Math.max(1, count);
    const nextIndex = Math.min(list.length - 1, currentIndex + steps);
    return applyJumpTarget(state, list[nextIndex], list, nextIndex);
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
    (baseState.splitPanes && baseState.splitDirection && baseState.splitDirection !== 'none'
      ? baseState.splitPanes[baseState.activePaneIndex ?? 0]?.filename ||
        ((baseState.activePaneIndex ?? 0) === 1
          ? baseState.secondaryFilename || 'target.ts'
          : baseState.primaryFilename || 'source.ts')
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
  const mark = resolveMarkPosition(state, markChar);
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
      const curIdx = targetState.activePaneIndex ?? 0;
      const targetPaneIdx = targetState.splitPanes.findIndex(
        (p, idx) =>
          p.filename === mark.filename ||
          (idx === 0 && targetState.primaryFilename === mark.filename) ||
          (idx === 1 && targetState.secondaryFilename === mark.filename)
      );
      if (targetPaneIdx >= 0 && targetPaneIdx !== curIdx) {
        targetState = switchPaneFocus(targetState, targetPaneIdx);
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
  const entries: [string, MarkPosition][] = Object.entries(marks);

  for (const specialKey of ["'", '.', '^', '<', '>', '[', ']']) {
    const pos = resolveMarkPosition(state, specialKey);
    if (pos) {
      entries.push([specialKey, pos]);
    }
  }

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
    const isOtherFile = Boolean(item.filename && item.filename !== state.primaryFilename);
    const text = isOtherFile
      ? item.filename!
      : (state.lines[item.row] ?? '').trim().slice(0, 40);
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

  return applyJumpTarget(state, list[targetIndex], list, targetIndex);
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
  const mark = resolveMarkPosition(state, markChar);
  if (!mark) {
    return { ...state, pendingKeys: undefined, commandMessage: 'E20: Mark not set', bell: true };
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
        lastBracketMarks: {
          start: { row: minLine, col: 0 },
          end: { row: maxLine, col: Math.max(0, (state.lines[maxLine] ?? '').length - 1) },
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

/**
 * 현재 버퍼의 소문자 마크(a-z) 중 커서 기준 다음(next) 또는 이전(prev) 마크를 찾습니다 (]' / [' / ]` / [`).
 */
export function findAdjacentLowercaseMark(
  state: VimEditorState,
  direction: 'next' | 'prev',
  isLineWise: boolean,
  count = 1
): { markChar: string; target: CursorPosition } | null {
  const marks = state.marks ?? {};
  const candidates: Array<{ markChar: string; row: number; col: number }> = [];

  for (const [k, pos] of Object.entries(marks)) {
    if (!/^[a-z]$/.test(k)) continue;
    if (pos.row < 0 || pos.row >= state.lines.length) continue;
    candidates.push({ markChar: k, row: pos.row, col: pos.col });
  }
  if (candidates.length === 0) return null;

  const { line: curLine, col: curCol } = state.cursor;
  const filtered = candidates.filter((m) => {
    if (isLineWise) {
      return direction === 'next' ? m.row > curLine : m.row < curLine;
    }
    if (direction === 'next') {
      return m.row > curLine || (m.row === curLine && m.col > curCol);
    }
    return m.row < curLine || (m.row === curLine && m.col < curCol);
  });

  if (filtered.length === 0) return null;

  filtered.sort((a, b) =>
    direction === 'next'
      ? a.row - b.row || a.col - b.col
      : b.row - a.row || b.col - a.col
  );

  // linewise(]' / [')는 같은 줄의 여러 마크를 하나의 줄로 묶어 카운트
  const steps: Array<{ markChar: string; row: number; col: number }> = [];
  for (const item of filtered) {
    if (isLineWise && steps.length > 0 && steps[steps.length - 1].row === item.row) {
      continue;
    }
    steps.push(item);
  }

  const chosen = steps[Math.min(Math.max(1, count) - 1, steps.length - 1)];
  if (!chosen) return null;

  const lineLen = (state.lines[chosen.row] ?? '').length;
  const target: CursorPosition = isLineWise
    ? moveToFirstNonBlank(state.lines, { line: chosen.row, col: 0 })
    : { line: chosen.row, col: Math.max(0, Math.min(chosen.col, Math.max(0, lineLen - 1))) };

  return { markChar: chosen.markChar, target };
}

