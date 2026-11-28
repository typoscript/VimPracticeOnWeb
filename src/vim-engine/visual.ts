import { CursorPosition, VimEditorState, VimMode } from './types';
import { curswantColumnOn } from './virtualColumn';
import { clampCursor, getFirstNonBlankCol, hasVirtualEdit } from './cursor';
import { getOptions } from './setEngine';
import { pushUndoSnapshotAt, visualOperatorStart } from './undoHistory';
import { blockDeleteLine, blockInsertPlan, blockOperandOf, blockPrep, blockYankLine, blockYankWidth, colForVcol } from './visualBlockColumns';
import type { BlockInsertPlan } from './visualBlockColumns';

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
  if (
    !anchor ||
    !cursor ||
    (mode !== 'VISUAL' &&
      mode !== 'VISUAL_LINE' &&
      mode !== 'VISUAL_BLOCK' &&
      mode !== 'SELECT' &&
      mode !== 'SELECT_LINE' &&
      mode !== 'SELECT_BLOCK')
  ) {
    return false;
  }

  if (mode === 'VISUAL_BLOCK' || mode === 'SELECT_BLOCK') {
    const minLine = Math.min(anchor.line, cursor.line);
    const maxLine = Math.max(anchor.line, cursor.line);
    const minCol = Math.min(anchor.col, cursor.col);
    const maxCol = Math.max(anchor.col, cursor.col);
    if (endOfLine) {
      return line >= minLine && line <= maxLine && col >= minCol;
    }
    return line >= minLine && line <= maxLine && col >= minCol && col <= maxCol;
  }

  if (mode === 'VISUAL_LINE' || mode === 'SELECT_LINE') {
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
 * VISUAL_BLOCK 모드에서 선택된 직사각형(화면 열 기준)을 모든 해당 행에서 삭제합니다 (Vim op_delete 블록).
 * 블록 끝이 탭 가운데를 지나면 탭 중 블록 밖 부분은 공백으로 남습니다.
 */
export function deleteVisualBlock(state: VimEditorState): VimEditorState {
  const op = blockOperandOf(state);
  if (!op) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  // Vim do_pending_operator: 커서를 블록 왼쪽 위(oap->start)에 둔 뒤 u_save 하므로 실행 취소도 그 자리로 돌아옵니다.
  const stateWithSnapshot = pushUndoSnapshotAt(state, { line: op.startLine, col: op.startCol });
  const deletedParts: string[] = [];
  const nextLines = [...state.lines];
  let cursorCol = op.startCol;
  for (let l = op.startLine; l <= op.endLine; l++) {
    const lineText = state.lines[l] ?? '';
    deletedParts.push(blockYankLine(lineText, op));
    const res = blockDeleteLine(lineText, op);
    if (!res) continue;
    nextLines[l] = res.text;
    if (l === op.startLine) cursorCol = res.cursorCol;
  }
  const blockCursor = clampCursor(nextLines, { line: op.startLine, col: cursorCol }, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: blockCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    clipboard: {
      type: 'block',
      content: deletedParts.join('\n'),
      blockWidth: blockYankWidth(op),
    },
    pendingKeys: undefined,
    // Vim op_delete(블록): changed_lines(커서 줄, 커서 열)
    changeListHint: { kind: 'at', line: blockCursor.line, col: blockCursor.col },
  };
}

/**
 * VISUAL_BLOCK 모드에서 선택된 직사각형 영역을 복사합니다 (나눠진 탭은 공백으로).
 */
export function yankVisualBlock(state: VimEditorState): VimEditorState {
  const op = blockOperandOf(state);
  if (!op) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const parts: string[] = [];
  for (let l = op.startLine; l <= op.endLine; l++) parts.push(blockYankLine(state.lines[l] ?? '', op));
  const endText = state.lines[op.endLine] ?? '';
  const endCol = op.isMax ? Math.max(0, endText.length - 1) : colForVcol(endText, op.endVcol, op.ts);

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    cursor: clampCursor(state.lines, { line: op.startLine, col: op.startCol }, 'NORMAL'),
    clipboard: {
      type: 'block',
      content: parts.join('\n'),
      blockWidth: blockYankWidth(op),
    },
    lastBracketMarks: {
      start: { row: op.startLine, col: op.startCol },
      end: { row: op.endLine, col: Math.max(op.startCol, endCol) },
    },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL_BLOCK 모드에서 I (첫 열 삽입), A (끝 열 추가), c (블록 변경) 모드로 진입합니다.
 * 첫 줄에 입력한 글자는 Esc 때 다른 줄에도 들어갑니다 (Vim op_insert·block_insert·op_change, 줄마다 linePlans).
 */
export function startVisualBlockInsert(
  state: VimEditorState,
  insertMode: 'I' | 'A' | 'c',
  count = 1
): VimEditorState {
  const op = blockOperandOf(state);
  if (!state.visualAnchor || !op) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined, visualBlockEndOfLine: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const minLine = op.startLine;
  const maxLine = op.endLine;
  // 바이트 열 경계 ('virtualedit' 경로와 . 반복 키 복원용)
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);
  const isEol = op.isMax && insertMode !== 'I';
  const repeatCount = Math.max(1, count);

  const linesList: number[] = [];
  const skippedLines: number[] = [];
  for (let l = minLine; l <= maxLine; l++) {
    linesList.push(l);
  }

  const nextLines = [...state.lines];
  let targetCol = op.startCol;
  let linePlans: (BlockInsertPlan | null)[] | undefined;
  let deleteCursorCol = 0;
  const ve = getOptions(state).virtualedit;
  const isVirtualBlock = hasVirtualEdit(ve, 'block') || hasVirtualEdit(ve, 'all');

  if (insertMode === 'I') {
    if (isVirtualBlock) {
      targetCol = minCol;
      const firstLine = nextLines[minLine] ?? '';
      if (firstLine.length < targetCol) {
        nextLines[minLine] = firstLine.padEnd(targetCol, ' ');
      }
    } else {
      linePlans = linesList.map((l, i) => (i === 0 ? null : blockInsertPlan(state.lines[l] ?? '', op, false)));
      linesList.forEach((l, i) => {
        if (i > 0 && !linePlans![i]) skippedLines.push(l);
      });
    }
  } else if (insertMode === 'A') {
    if (isVirtualBlock && !isEol) {
      targetCol = maxCol + 1;
      const firstLine = nextLines[minLine] ?? '';
      if (firstLine.length < targetCol) {
        nextLines[minLine] = firstLine.padEnd(targetCol, ' ');
      }
    } else {
      // Vim op_insert(OP_APPEND): 첫 줄은 블록 오른쪽 글자 다음으로, 짧으면 블록 끝까지 공백을 채웁니다.
      const firstLine = state.lines[minLine] ?? '';
      const bd = blockPrep(firstLine, op, 'append', true);
      targetCol = Math.max(op.startCol, Math.min(firstLine.length, bd.textcol + bd.textlen));
      if (bd.isShort && !op.isMax) {
        nextLines[minLine] = firstLine.slice(0, targetCol) + ' '.repeat(bd.endspaces) + firstLine.slice(targetCol);
        targetCol += bd.endspaces;
      }
      linePlans = linesList.map((l, i) => (i === 0 ? null : blockInsertPlan(state.lines[l] ?? '', op, true)));
    }
  } else if (insertMode === 'c') {
    // Vim op_change: 먼저 블록을 지우고(op_delete), 커서가 블록 시작보다 왼쪽이면 한 칸 오른쪽에서 입력합니다.
    let cursorCol = op.startCol;
    for (let l = minLine; l <= maxLine; l++) {
      const res = blockDeleteLine(state.lines[l] ?? '', op, 'change');
      if (!res) continue;
      nextLines[l] = res.text;
      if (l === minLine) cursorCol = res.cursorCol;
    }
    deleteCursorCol = cursorCol;
    const firstLine = nextLines[minLine] ?? '';
    targetCol = Math.min(cursorCol, Math.max(0, firstLine.length - 1));
    if (op.startCol > targetCol && firstLine.length > 0) targetCol++;
    linePlans = linesList.map((l, i) => {
      if (i === 0) return null;
      const lineText = nextLines[l] ?? '';
      const bd = blockPrep(lineText, op, 'change', true);
      return bd.isShort ? null : { offset: bd.textcol, pre: 0, post: 0, skip: 0 };
    });
    linesList.forEach((l, i) => {
      if (i > 0 && !linePlans![i]) skippedLines.push(l);
    });
  }

  // 실행 취소 커서 (uh_cursor): I / c 는 블록 왼쪽 위, A 는 첫 줄의 입력 위치
  const stateWithSnapshot = pushUndoSnapshotAt(state, { line: minLine, col: insertMode === 'A' ? targetCol : op.startCol });

  const lineSpan = maxLine - minLine;
  const colSpan = maxCol - minCol;
  const blockReplayPrefix: string[] = [
    'Ctrl-v',
    ...(lineSpan > 0 ? [...(lineSpan > 1 ? String(lineSpan).split('') : []), 'j'] : []),
    ...(isEol
      ? ['$']
      : colSpan > 0
        ? [...(colSpan > 1 ? String(colSpan).split('') : []), 'l']
        : []),
    ...(repeatCount > 1 ? String(repeatCount).split('') : []),
    insertMode,
  ];

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line: minLine, col: targetCol },
    visualAnchor: undefined,
    visualBlockEndOfLine: undefined,
    lastVisualSelection: {
      mode: 'VISUAL_BLOCK',
      anchor: { ...anchor },
      cursor: { ...cursor },
      endOfLine: state.visualBlockEndOfLine,
    },
    currentChangeKeys: blockReplayPrefix,
    blockInsertSession: {
      lines: linesList,
      col: targetCol,
      insertMode,
      typedChars: [],
      endOfLine: isEol || undefined,
      minCol,
      maxCol,
      startCol: linePlans ? op.startCol : undefined,
      linePlans,
      count: repeatCount > 1 ? repeatCount : undefined,
      skippedLines: skippedLines.length > 0 ? skippedLines : undefined,
    },
    pendingKeys: undefined,
    // 블록 c/C 의 op_delete: changed_lines(블록 첫 줄, 지운 뒤 커서 열) — 지울 글자가 없는 짧은 줄이어도
    ...(insertMode === 'c' ? { changeListHint: { kind: 'at' as const, line: minLine, col: Math.max(0, Math.min(deleteCursorCol, (nextLines[minLine] ?? '').length - 1)), force: true } } : {}),
  };
}

/**
 */
export function deleteVisualSelection(state: VimEditorState, visualKey = false): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  if (state.mode === 'VISUAL_BLOCK') {
    return deleteVisualBlock(state);
  }

  // Vim: 연산 범위 시작(oap->start)으로 커서를 옮긴 뒤 지우므로 실행 취소는 그 자리로 돌아갑니다 (d{motion} 도 이 함수를 씀).
  const stateWithSnapshot = pushUndoSnapshotAt(
    state,
    visualOperatorStart(state.mode === 'VISUAL_LINE', state.visualAnchor, state.cursor)
  );
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
    // Vim op_delete(줄 단위) 뒤 beginline: 'startofline' 이면 첫 비공백, 아니면 연산 전 curswant(old_col) 열입니다 (3EVkd; curswant 는 다시 정해짐).
    const keepWant = state.curswant !== undefined;
    const nextCursor = getOptions(state).startofline
      ? { line: targetLine, col: getFirstNonBlankCol(nextLines[targetLine] ?? '') }
      : clampCursor(nextLines, { line: targetLine, col: keepWant ? curswantColumnOn(state, nextLines, targetLine) : cursor.col }, 'NORMAL');

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

  // Vim: 끝이 줄 끝(NUL)이면 그 줄의 줄바꿈까지 고른 것입니다 — vjd 가 빈 줄에서 끝나면 다음 줄과 합쳐집니다.
  // (비주얼 모드에서 누른 d / y / c 만. d{motion} 처럼 내부에서 비주얼 범위를 빌려 쓰는 호출은 빈 줄 하나만 봅니다.)
  if (visualKey ? visualEndIncludesNewline(state, end) : start.line === end.line && (state.lines[start.line] ?? '') === '' && start.line < state.lines.length - 1) {
    const startLineText = state.lines[start.line] ?? '';
    const endLineText = state.lines[end.line] ?? '';
    const content =
      start.line === end.line
        ? startLineText.slice(start.col) + '\n'
        : [startLineText.slice(start.col), ...state.lines.slice(start.line + 1, end.line), endLineText].join('\n') + '\n';
    const merged = startLineText.slice(0, start.col) + (state.lines[end.line + 1] ?? '');
    const nextLines = [...state.lines.slice(0, start.line), merged, ...state.lines.slice(end.line + 2)];
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampCursor(nextLines, start, 'NORMAL'),
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: { type: 'text', content },
      pendingKeys: undefined,
    };
  }

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
 * 문자 단위 비주얼의 끝이 줄 끝 다음 칸(Vim 의 NUL: 빈 줄, v$, 짧은 줄로 내려온 j …)에 있어 줄바꿈까지 고른 것인지 (마지막 줄 제외).
 */
export function visualEndIncludesNewline(state: VimEditorState, end: CursorPosition): boolean {
  if (end.line >= state.lines.length - 1) return false;
  return end.col >= (state.lines[end.line] ?? '').length;
}

/**
 * 줄 단위 비주얼 연산(Vy, V~, Vu …) 뒤 커서 열 ('nostartofline' 기준, Neovim 대조).
 */
export function linewiseVisualCol(state: VimEditorState, line: number): number {
  if (getOptions(state).startofline) return 0;
  // Vim: 커서가 선택의 위쪽 끝이면 그 열을 유지하고, 앵커가 위쪽이면 0열로 갑니다 (Vggy → 열 유지, Vjy → 0열).
  const anchor = state.visualAnchor;
  if (!anchor || state.cursor.line >= anchor.line) return 0;
  const len = (state.lines[line] ?? '').length;
  return Math.max(0, Math.min(state.cursor.col, len - 1));
}

/**
 * VISUAL 모드에서 선택 영역을 복사(Yank)하고 NORMAL 모드로 복귀합니다.
 */
export function yankVisualSelection(state: VimEditorState, visualKey = false): VimEditorState {
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
      // Vim: 줄 단위 비주얼 복사 후 커서는 첫 줄의 0열로 갑니다.
      cursor: { line: minLine, col: linewiseVisualCol(state, minLine) },
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content,
      },
      lastBracketMarks: {
        start: { row: minLine, col: 0 },
        end: { row: maxLine, col: Math.max(0, (state.lines[maxLine] ?? '').length - 1) },
      },
      pendingKeys: undefined,
    };
  }

  const { start, end } = getOrderedRange(anchor, cursor);
  let content = '';

  if (visualKey && visualEndIncludesNewline(state, end)) {
    const startLineText = state.lines[start.line] ?? '';
    content =
      start.line === end.line
        ? startLineText.slice(start.col) + '\n'
        : [startLineText.slice(start.col), ...state.lines.slice(start.line + 1, end.line + 1)].join('\n') + '\n';
  } else if (start.line === end.line) {
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
    lastBracketMarks: {
      start: { row: start.line, col: start.col },
      end: { row: end.line, col: end.col },
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
  // Vim v_o: w_set_curswant 를 켜므로 `$` 로 늘린 블록도 보통 블록이 됩니다.
  return {
    ...state,
    cursor: nextCursor,
    visualAnchor: nextAnchor,
    visualBlockEndOfLine: undefined,
    pendingKeys: undefined,
  };
}

/** 비주얼 J / gJ 가 실패했을 때 커서: 연산 범위 시작 (줄 단위는 0열, 블록은 왼쪽 위). */
export function failedVisualJoinCursor(state: VimEditorState): CursorPosition {
  const anchor = state.visualAnchor ?? state.cursor;
  const { start } = getOrderedRange(anchor, state.cursor);
  const col = state.mode === 'VISUAL_LINE' ? 0 : state.mode === 'VISUAL_BLOCK' ? blockOperandOf(state)!.startCol : start.col;
  return clampCursor(state.lines, { line: start.line, col }, 'NORMAL');
}
