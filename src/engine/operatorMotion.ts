import { CursorPosition, VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { moveToFirstNonBlank, moveToPrevWord, moveToPrevWORD } from './motions';
import { EXTRA_MOTION_KEYS, evaluateExtraMotion } from './extraMotions';

/**
 * 연산자(d, c, y) + 일반 모션 실행 엔진
 *
 * - 줄 단위(linewise) 모션: j, k, G, gg  → 시작~끝 줄 전체가 대상
 * - 배타적 문자 단위(exclusive) 모션: h, l, b, B, ^ → 커서와 목표 위치 사이 (끝 위치 문자 제외)
 *
 * - 보조 모션(extraMotions.ts): + - Enter (줄 단위), ( ) | [( ]) (exclusive), ge gE g_ (inclusive)
 *
 * 모션이 실패하면(마지막 줄의 dj, 줄 시작의 dh, 버퍼 시작의 db 등) null을 반환하며,
 * 호출부는 이를 bell(실패 신호)로 처리합니다. 실제 Vim처럼 버퍼는 변경되지 않습니다.
 */

export const OPERATOR_MOTION_KEYS = new Set([
  'j', 'k', 'G', 'ArrowDown', 'ArrowUp',
  'h', 'l', 'b', 'B', '^', 'ArrowLeft', 'ArrowRight',
  '(', ')', '+', '-', 'Enter', '|',
]);

type Operator = 'd' | 'c' | 'y';

/**
 * @param count 반복 횟수. G / gg 에서는 줄 번호이며, 생략하면 마지막 줄 / 첫 줄입니다.
 * @returns 실행 결과 상태, 모션이 실패하면 null
 */
export function executeOperatorMotion(
  state: VimEditorState,
  op: Operator,
  motionKey: string,
  count?: number
): VimEditorState | null {
  const { lines, cursor } = state;
  const n = Math.max(1, count ?? 1);
  const lastLine = lines.length - 1;
  const lineText = lines[cursor.line] ?? '';

  if (EXTRA_MOTION_KEYS.has(motionKey)) {
    const res = evaluateExtraMotion(lines, cursor, motionKey, n);
    if (!res) return null;
    const before = res.target.line < cursor.line || (res.target.line === cursor.line && res.target.col < cursor.col);
    const start = before ? res.target : cursor;
    const end = before ? cursor : res.target;
    if (res.kind === 'linewise') return applyLinewise(state, op, start.line, end.line);
    if (res.kind === 'inclusive') return applyCharwise(state, op, start, { line: end.line, col: end.col + 1 });
    if (start.line === end.line && start.col === end.col) return { ...state, pendingKeys: undefined };
    return applyCharwise(state, op, start, end);
  }

  switch (motionKey) {
    case 'j':
    case 'ArrowDown':
      if (cursor.line >= lastLine) return null;
      return applyLinewise(state, op, cursor.line, Math.min(lastLine, cursor.line + n));

    case 'k':
    case 'ArrowUp':
      if (cursor.line <= 0) return null;
      return applyLinewise(state, op, Math.max(0, cursor.line - n), cursor.line);

    case 'G':
    case 'gg': {
      const fallback = motionKey === 'G' ? lastLine : 0;
      const target = count !== undefined ? Math.max(0, Math.min(lastLine, count - 1)) : fallback;
      return applyLinewise(state, op, Math.min(cursor.line, target), Math.max(cursor.line, target));
    }

    case 'h':
    case 'ArrowLeft':
      if (cursor.col <= 0) return null;
      return applyCharwise(state, op, { line: cursor.line, col: Math.max(0, cursor.col - n) }, cursor);

    case 'l':
    case 'ArrowRight':
      // 연산자와 함께 쓰인 l은 줄 끝 너머(마지막 문자 포함)까지 이동할 수 있습니다. (dl == x)
      // 빈 줄에서는 아무것도 하지 않지만 실패(beep)로 보지 않습니다. (Vim nv_right)
      if (lineText.length === 0) return { ...state, pendingKeys: undefined };
      return applyCharwise(state, op, cursor, { line: cursor.line, col: Math.min(lineText.length, cursor.col + n) });

    case '^': {
      const target = moveToFirstNonBlank(lines, { line: cursor.line, col: 0 });
      if (target.col === cursor.col) return { ...state, pendingKeys: undefined };
      return target.col < cursor.col
        ? applyCharwise(state, op, target, cursor)
        : applyCharwise(state, op, cursor, target);
    }

    case 'b':
    case 'B': {
      let target = cursor;
      for (let i = 0; i < n; i++) {
        target = motionKey === 'b' ? moveToPrevWord(lines, target) : moveToPrevWORD(lines, target);
      }
      if (target.line === cursor.line && target.col === cursor.col) return null;
      return applyCharwise(state, op, target, cursor);
    }
  }

  return null;
}

/** startLine ~ endLine 줄 전체에 연산자를 적용합니다. */
function applyLinewise(state: VimEditorState, op: Operator, startLine: number, endLine: number): VimEditorState {
  const content = state.lines.slice(startLine, endLine + 1).join('\n');
  const clipboard = { type: 'line' as const, content };

  if (op === 'y') {
    return {
      ...state,
      cursor: clampCursor(state.lines, { line: startLine, col: state.cursor.col }, 'NORMAL'),
      clipboard,
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const before = state.lines.slice(0, startLine);
  const after = state.lines.slice(endLine + 1);

  // cj / ck: 대상 줄들을 첫 줄 들여쓰기만 남긴 빈 줄 하나로 교체 후 INSERT (autoindent)
  if (op === 'c') {
    const indentStr = (state.lines[startLine] ?? '').match(/^[ \t]*/)?.[0] ?? '';
    return {
      ...stateWithSnapshot,
      lines: [...before, indentStr, ...after],
      cursor: { line: startLine, col: indentStr.length },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  const nextLines = before.length + after.length === 0 ? [''] : [...before, ...after];
  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: moveToFirstNonBlank(nextLines, { line: Math.min(startLine, nextLines.length - 1), col: 0 }),
    clipboard,
    pendingKeys: undefined,
  };
}

/** start(포함) ~ end(제외) 사이의 문자에 연산자를 적용합니다. */
function applyCharwise(
  state: VimEditorState,
  op: Operator,
  start: CursorPosition,
  end: CursorPosition
): VimEditorState {
  const { lines } = state;
  // 배타적 모션의 끝이 다음 줄의 첫 칸이면 이전 줄 끝까지로 조정합니다. (:help exclusive)
  let realEnd = end;
  if (end.col === 0 && end.line > start.line) {
    realEnd = { line: end.line - 1, col: (lines[end.line - 1] ?? '').length };
  }

  const startText = lines[start.line] ?? '';
  const endText = lines[realEnd.line] ?? '';
  const content =
    start.line === realEnd.line
      ? startText.slice(start.col, realEnd.col)
      : [startText.slice(start.col), ...lines.slice(start.line + 1, realEnd.line), endText.slice(0, realEnd.col)].join('\n');
  const clipboard = { type: 'text' as const, content };

  if (op === 'y') {
    return {
      ...state,
      cursor: clampCursor(lines, start, 'NORMAL'),
      clipboard,
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const merged = startText.slice(0, start.col) + endText.slice(realEnd.col);
  const nextLines = [...lines.slice(0, start.line), merged, ...lines.slice(realEnd.line + 1)];

  if (op === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: { line: start.line, col: start.col },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, start, 'NORMAL'),
    clipboard,
    pendingKeys: undefined,
  };
}
