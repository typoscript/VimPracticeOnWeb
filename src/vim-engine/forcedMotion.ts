import { CursorPosition, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { syncRegisters } from './registers';
import { moveToFirstNonBlank } from './motions';
import {
  deleteVisualSelection,
  yankVisualSelection,
  startVisualBlockInsert,
} from './visual';
import { ringBell, RunHandleKeyFn } from './engineHelpers';

export type ForcedMotionwise = 'char' | 'line' | 'block';
type NaturalMotionKind = 'linewise' | 'inclusive' | 'exclusive';

const LINEWISE_MOTIONS = new Set([
  'j', 'k', 'gj', 'gk', 'ArrowDown', 'ArrowUp',
  'G', 'gg', '+', '-', 'Enter', '_',
  '[[', ']]', '[]', '][',
]);

const INCLUSIVE_MOTIONS = new Set([
  'e', 'E', 'ge', 'gE', 'g_', '$', 'g$', '%',
]);

function isCtrlVKey(key: string): boolean {
  return key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>';
}

function classifyNaturalMotion(
  motionKeys: string[],
  hasCount: boolean,
  lastCharSearch?: VimEditorState['lastCharSearch']
): NaturalMotionKind {
  const joined = motionKeys.join('');
  if (joined === '%' && hasCount) return 'linewise';
  if (LINEWISE_MOTIONS.has(joined)) return 'linewise';
  if (INCLUSIVE_MOTIONS.has(joined)) return 'inclusive';

  if (motionKeys.length === 2) {
    const p = motionKeys[0];
    if (p === "'") return 'linewise';
    if (p === '`') return 'exclusive';
    if (p === 'f' || p === 't') return 'inclusive';
    if (p === 'F' || p === 'T') return 'exclusive';
  }

  if (joined === ';' && lastCharSearch) {
    return lastCharSearch.type === 'f' || lastCharSearch.type === 't'
      ? 'inclusive'
      : 'exclusive';
  }
  if (joined === ',' && lastCharSearch) {
    return lastCharSearch.type === 'F' || lastCharSearch.type === 'T'
      ? 'inclusive'
      : 'exclusive';
  }

  return 'exclusive';
}

function applyForcedLinewise(
  state: VimEditorState,
  op: 'd' | 'c' | 'y',
  startLine: number,
  endLine: number
): VimEditorState {
  const content = state.lines.slice(startLine, endLine + 1).join('\n');
  const clipboard = { type: 'line' as const, content };

  if (op === 'y') {
    return {
      ...state,
      cursor: clampCursor(state.lines, { line: startLine, col: state.cursor.col }, 'NORMAL'),
      clipboard,
      lastBracketMarks: {
        start: { row: startLine, col: 0 },
        end: { row: endLine, col: Math.max(0, (state.lines[endLine] ?? '').length - 1) },
      },
      pendingKeys: undefined,
      forcedMotionwise: undefined,
    };
  }

  const withSnap = pushUndoSnapshot(state);
  const before = state.lines.slice(0, startLine);
  const after = state.lines.slice(endLine + 1);

  if (op === 'c') {
    const indentStr = (state.lines[startLine] ?? '').match(/^[ \t]*/)?.[0] ?? '';
    return {
      ...withSnap,
      lines: [...before, indentStr, ...after],
      cursor: { line: startLine, col: indentStr.length },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
      forcedMotionwise: undefined,
    };
  }

  const nextLines = before.length + after.length === 0 ? [''] : [...before, ...after];
  return {
    ...withSnap,
    lines: nextLines,
    cursor: moveToFirstNonBlank(nextLines, { line: Math.min(startLine, nextLines.length - 1), col: 0 }),
    clipboard,
    pendingKeys: undefined,
    forcedMotionwise: undefined,
  };
}

function applyForcedCharwise(
  state: VimEditorState,
  op: 'd' | 'c' | 'y',
  start: CursorPosition,
  endExclusive: CursorPosition
): VimEditorState {
  const { lines } = state;
  if (start.line === endExclusive.line && start.col === endExclusive.col) {
    return { ...state, pendingKeys: undefined, forcedMotionwise: undefined };
  }

  const startText = lines[start.line] ?? '';
  const endText = lines[endExclusive.line] ?? '';
  const content =
    start.line === endExclusive.line
      ? startText.slice(start.col, endExclusive.col)
      : [
          startText.slice(start.col),
          ...lines.slice(start.line + 1, endExclusive.line),
          endText.slice(0, endExclusive.col),
        ].join('\n');
  const clipboard = { type: 'text' as const, content };

  if (op === 'y') {
    const endRow =
      endExclusive.col === 0 && endExclusive.line > start.line
        ? endExclusive.line - 1
        : endExclusive.line;
    const endCol =
      endExclusive.col > 0
        ? endExclusive.col - 1
        : endExclusive.line > start.line
          ? Math.max(0, (lines[endExclusive.line - 1] ?? '').length - 1)
          : start.col;
    return {
      ...state,
      cursor: clampCursor(lines, start, 'NORMAL'),
      clipboard,
      lastBracketMarks: {
        start: { row: start.line, col: start.col },
        end: { row: endRow, col: Math.max(start.line === endRow ? start.col : 0, endCol) },
      },
      pendingKeys: undefined,
      forcedMotionwise: undefined,
    };
  }

  const withSnap = pushUndoSnapshot(state);
  const merged = startText.slice(0, start.col) + endText.slice(endExclusive.col);
  const nextLines = [...lines.slice(0, start.line), merged, ...lines.slice(endExclusive.line + 1)];

  if (op === 'c') {
    return {
      ...withSnap,
      lines: nextLines,
      cursor: { line: start.line, col: start.col },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
      forcedMotionwise: undefined,
    };
  }

  return {
    ...withSnap,
    lines: nextLines,
    cursor: clampCursor(nextLines, start, 'NORMAL'),
    clipboard,
    pendingKeys: undefined,
    forcedMotionwise: undefined,
  };
}

/**
 * 연산자 대기 중 모션 강제 지정(dv / dV / d<C-v> — :help o_v, o_V, o_CTRL-V)을 처리합니다.
 * - v (char): 줄 단위 모션 → 문자 배타적, 문자 배타적 ↔ 문자 포함적 토글
 * - V (line): 모든 모션을 줄 단위로 강제
 * - Ctrl-v (block): 모든 모션을 직사각형 블록 단위로 강제
 */
export function handleForcedMotionStep(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): VimEditorState {
  const forced = state.forcedMotionwise;
  if (!forced) return state;

  const m = state.pendingKeys?.match(/^([1-9][0-9]*)?([dcy])([0-9]*)([gfFtT\[\]'`])?$/);
  if (!m) {
    return { ...state, pendingKeys: undefined, forcedMotionwise: undefined };
  }

  const [, c1Str, opRaw, c2Str, prefix] = m;
  const op = opRaw as 'd' | 'c' | 'y';

  if (!prefix) {
    // v / V / Ctrl-v 재입력 시 강제 모드 전환
    if (key === 'v') return { ...state, forcedMotionwise: 'char' };
    if (key === 'V') return { ...state, forcedMotionwise: 'line' };
    if (isCtrlVKey(key)) return { ...state, forcedMotionwise: 'block' };

    // 모션 카운트 누적 (예: dv2j, dV3w)
    if (/^[1-9]$/.test(key) || (key === '0' && c2Str.length > 0)) {
      return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
    }

    // 2타 모션 접두어 누적 (g, f, F, t, T, [, ], ', `)
    if ("gfFtT[]'`".includes(key)) {
      return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
    }
  }

  const motionKeys = prefix ? [prefix, key] : [key];
  const hasCount = Boolean(c1Str || c2Str);
  const c1 = c1Str ? parseInt(c1Str, 10) : 1;
  const c2 = c2Str ? parseInt(c2Str, 10) : 1;
  const totalCount = c1 * c2;

  const isJumpCountMotion =
    motionKeys.join('') === 'G' ||
    motionKeys.join('') === 'gg' ||
    motionKeys.join('') === '%';
  const countKeys = isJumpCountMotion
    ? hasCount
      ? String(totalCount).split('')
      : []
    : totalCount > 1
      ? String(totalCount).split('')
      : [];

  // 순수 임시 NORMAL 상태에서 모션의 도착 커서를 계산합니다
  const cleanBase: VimEditorState = {
    ...state,
    mode: 'NORMAL',
    pendingKeys: undefined,
    forcedMotionwise: undefined,
    visualAnchor: undefined,
    undoStack: [],
    recordingMacro: null,
    keymapsDisabled: true,
  };

  let moved = cleanBase;
  for (const k of [...countKeys, ...motionKeys]) {
    moved = runHandleKey(moved, k);
    if (moved.bell) {
      return { ...ringBell(state), forcedMotionwise: undefined };
    }
  }

  if (moved.mode !== 'NORMAL' || moved.pendingKeys || moved.lines !== state.lines) {
    return { ...ringBell(state), forcedMotionwise: undefined };
  }

  const origin = state.cursor;
  const target = moved.cursor;
  const isBefore =
    target.line < origin.line || (target.line === origin.line && target.col < origin.col);
  const start = isBefore ? target : origin;
  const end = isBefore ? origin : target;

  let res: VimEditorState;

  if (forced === 'line') {
    res = applyForcedLinewise(state, op, start.line, end.line);
  } else if (forced === 'block') {
    const blockState: VimEditorState = {
      ...state,
      mode: 'VISUAL_BLOCK',
      visualAnchor: origin,
      cursor: target,
      pendingKeys: undefined,
      forcedMotionwise: undefined,
    };
    if (op === 'y') {
      res = { ...yankVisualSelection(blockState), forcedMotionwise: undefined };
    } else if (op === 'c') {
      res = { ...startVisualBlockInsert(blockState, 'c', 1), forcedMotionwise: undefined };
    } else {
      res = { ...deleteVisualSelection(blockState), forcedMotionwise: undefined };
    }
  } else {
    // forced === 'char' (:help o_v)
    const natural = classifyNaturalMotion(motionKeys, hasCount, state.lastCharSearch);
    // 줄 단위 → 배타적, 포함적 ↔ 배타적 토글
    const effectiveInclusive = natural === 'exclusive';
    const endLineText = state.lines[end.line] ?? '';
    const endExclusive: CursorPosition = effectiveInclusive
      ? { line: end.line, col: Math.min(endLineText.length, end.col + 1) }
      : end;
    res = applyForcedCharwise(state, op, start, endExclusive);
  }

  const synced = syncRegisters(state, res, op === 'y');
  const forcedKey = forced === 'char' ? 'v' : forced === 'line' ? 'V' : 'Ctrl-v';
  const opKeys = [
    ...(hasCount ? [String(totalCount)] : []),
    op,
    forcedKey,
    ...motionKeys,
  ];

  if (op === 'c') {
    return {
      ...synced,
      forcedMotionwise: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
    };
  }
  if (op === 'd') {
    return {
      ...synced,
      forcedMotionwise: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
    };
  }
  return { ...synced, forcedMotionwise: undefined };
}
