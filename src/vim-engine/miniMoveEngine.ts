import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { getOptions } from './setOptionsCore';
import { shiftLineIndent } from './lineOperators';
import { ringBell } from './engineHelpers';

export type MiniMoveDirection = 'left' | 'down' | 'up' | 'right';

/**
 * 키 입력 문자열이 mini.move 의 Alt+h/j/k/l (또는 <A-h>/<M-h>) 인지 판별합니다.
 */
export function parseMiniMoveDirection(key: string): MiniMoveDirection | null {
  const m = key.match(/^(?:Alt[-+]|alt[-+]|<(?:A|M|Alt)-)([hjkl])>?$/i);
  if (!m) return null;
  const ch = m[1].toLowerCase();
  if (ch === 'h') return 'left';
  if (ch === 'j') return 'down';
  if (ch === 'k') return 'up';
  if (ch === 'l') return 'right';
  return null;
}

/**
 * NORMAL 모드 mini.move: 현재 줄을 상하(Alt-j/k) 스왑하거나 좌우(Alt-h/l) 들여쓰기 이동합니다.
 */
export function handleMiniMoveNormal(
  state: VimEditorState,
  key: string,
  count = 1,
  isReplayingDot = false
): VimEditorState | null {
  const dir = parseMiniMoveDirection(key);
  if (!dir) return null;

  const stepCount = Math.max(1, count);
  const { line, col } = state.cursor;
  const canonicalKey =
    dir === 'left' ? 'Alt-h' : dir === 'down' ? 'Alt-j' : dir === 'up' ? 'Alt-k' : 'Alt-l';
  const changeKeys = stepCount > 1 ? [String(stepCount), canonicalKey] : [canonicalKey];

  if (dir === 'down') {
    if (line >= state.lines.length - 1) {
      return ringBell({ ...state, pendingKeys: undefined });
    }
    const targetLine = Math.min(state.lines.length - 1, line + stepCount);
    const stateWithUndo = pushUndoSnapshot(state);
    const nextLines = [...state.lines];
    const [moved] = nextLines.splice(line, 1);
    nextLines.splice(targetLine, 0, moved);

    return {
      ...stateWithUndo,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: targetLine, col }, 'NORMAL'),
      pendingKeys: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
    };
  }

  if (dir === 'up') {
    if (line <= 0) {
      return ringBell({ ...state, pendingKeys: undefined });
    }
    const targetLine = Math.max(0, line - stepCount);
    const stateWithUndo = pushUndoSnapshot(state);
    const nextLines = [...state.lines];
    const [moved] = nextLines.splice(line, 1);
    nextLines.splice(targetLine, 0, moved);

    return {
      ...stateWithUndo,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: targetLine, col }, 'NORMAL'),
      pendingKeys: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
    };
  }

  // left (Alt-h) / right (Alt-l): 현재 줄 들여쓰기 이동 + 커서 상대 위치 유지
  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);
  const oldLine = state.lines[line] ?? '';
  const newLine = shiftLineIndent(
    oldLine,
    dir === 'right' ? 'in' : 'out',
    sw,
    ts,
    et,
    sr,
    stepCount
  );

  if (newLine === oldLine) {
    return { ...state, pendingKeys: undefined };
  }

  const delta = newLine.length - oldLine.length;
  const stateWithUndo = pushUndoSnapshot(state);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line, col: Math.max(0, col + delta) }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
  };
}

/**
 * VISUAL / VISUAL_LINE 모드 mini.move: 선택된 줄 블록 전체를 선택 상태를 유지한 채 상하/좌우로 이동합니다.
 */
export function handleMiniMoveVisual(
  state: VimEditorState,
  key: string,
  count = 1
): VimEditorState | null {
  const dir = parseMiniMoveDirection(key);
  if (!dir || !state.visualAnchor) return null;

  const stepCount = Math.max(1, count);
  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const blockLen = maxLine - minLine + 1;

  if (dir === 'down') {
    if (maxLine >= state.lines.length - 1) {
      return ringBell({ ...state, pendingKeys: undefined });
    }
    const moveStep = Math.min(stepCount, state.lines.length - 1 - maxLine);
    const stateWithUndo = pushUndoSnapshot(state);
    const nextLines = [...state.lines];
    const extracted = nextLines.splice(minLine, blockLen);
    nextLines.splice(minLine + moveStep, 0, ...extracted);

    return {
      ...stateWithUndo,
      lines: nextLines,
      visualAnchor: { line: anchor.line + moveStep, col: anchor.col },
      cursor: { line: cursor.line + moveStep, col: cursor.col },
      pendingKeys: undefined,
    };
  }

  if (dir === 'up') {
    if (minLine <= 0) {
      return ringBell({ ...state, pendingKeys: undefined });
    }
    const moveStep = Math.min(stepCount, minLine);
    const stateWithUndo = pushUndoSnapshot(state);
    const nextLines = [...state.lines];
    const extracted = nextLines.splice(minLine, blockLen);
    nextLines.splice(minLine - moveStep, 0, ...extracted);

    return {
      ...stateWithUndo,
      lines: nextLines,
      visualAnchor: { line: anchor.line - moveStep, col: anchor.col },
      cursor: { line: cursor.line - moveStep, col: cursor.col },
      pendingKeys: undefined,
    };
  }

  // left (Alt-h) / right (Alt-l)
  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);

  const nextLines = [...state.lines];
  let changed = false;
  let anchorDelta = 0;
  let cursorDelta = 0;

  for (let i = minLine; i <= maxLine; i++) {
    const oldL = nextLines[i] ?? '';
    const newL = shiftLineIndent(
      oldL,
      dir === 'right' ? 'in' : 'out',
      sw,
      ts,
      et,
      sr,
      stepCount
    );
    if (newL !== oldL) changed = true;
    if (i === anchor.line) anchorDelta = newL.length - oldL.length;
    if (i === cursor.line) cursorDelta = newL.length - oldL.length;
    nextLines[i] = newL;
  }

  if (!changed) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    visualAnchor: clampCursor(
      nextLines,
      { line: anchor.line, col: Math.max(0, anchor.col + anchorDelta) },
      state.mode
    ),
    cursor: clampCursor(
      nextLines,
      { line: cursor.line, col: Math.max(0, cursor.col + cursorDelta) },
      state.mode
    ),
    pendingKeys: undefined,
  };
}
