import { VimEditorState, CursorPosition, FoldRange } from './types';
import { getMaxCol, clampCursor } from './cursor';
import { evaluateExtraMotion } from './extraMotions';
import { executeOperatorMotion } from './operatorMotion';
import { syncRegisters, putFromRegister } from './registers';
import { gotoFileUnderCursor } from './gotoFileEngine';
import {
  moveLeft,
  moveRight,
  moveDown,
  moveUp,
  moveToLineStart,
  moveToLineEnd,
  moveToFirstNonBlank,
  moveToNextWord,
  moveToPrevWord,
  moveToWordEnd,
  moveToNextWORD,
  moveToPrevWORD,
  moveToWORDEnd,
} from './motions';
import { moveToNextParagraph, moveToPrevParagraph } from './advancedMotions';
import { getNextVisibleLine, getPrevVisibleLine } from './folding';
import {
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  exchangePanes,
  rotatePanes,
  movePaneToDirection,
  resizeSplit,
  moveWindowToNewTab,
} from './splitWindow';
import { msg } from './messages';

/**
 * 대기 중인 키(pendingKeys)에서 숫자 카운트와 연산자를 분해 파싱합니다.
 * 예: "3" -> count: 3
 *     "2d" -> count1: 2, op: 'd', total: 2
 *     "d2" -> count2: 2, op: 'd', total: 2
 *     "2d3" -> count1: 2, op: 'd', count2: 3, total: 6
 */
export interface ParsedPending {
  count1?: number;
  operator?: string;
  count2?: number;
  totalCount: number;
}

export interface AbbrevReplayCtx {
  depth: number;
  seen: ReadonlySet<string>;
}

export const INITIAL_ABBREV_CTX: AbbrevReplayCtx = { depth: 0, seen: new Set<string>() };

export type DispatchKeyFn = (
  state: VimEditorState,
  key: string,
  isReplayingDot?: boolean,
  macroDepth?: number,
  abbrevCtx?: AbbrevReplayCtx
) => VimEditorState;

export type RunHandleKeyFn = (
  state: VimEditorState,
  key: string,
  isReplayingDot?: boolean,
  macroDepth?: number
) => VimEditorState;

export function parsePending(pendingKeys?: string): ParsedPending {
  if (!pendingKeys) {
    return { totalCount: 1 };
  }

  // 1. 숫자만 있는 경우: "3", "12"
  const numOnly = pendingKeys.match(/^([1-9][0-9]*)$/);
  if (numOnly) {
    const c = parseInt(numOnly[1], 10);
    return { count1: c, totalCount: c };
  }

  // 2. 연산자 및 카운트 조합: "d", "2d", "d2", "2d3", "c", "r", "y", "v", "g", "gu", "gU", "g~", "gc", "@", ">", "<", "=", "!", "m", "'", "`"
  const opMatch = pendingKeys.match(/^([1-9][0-9]*)?(g[uU~?cqw]|[a-zA-Z@'`><=!])([0-9]*)$/);
  if (opMatch) {
    const count1 = opMatch[1] ? parseInt(opMatch[1], 10) : undefined;
    const operator = opMatch[2];
    const count2 = opMatch[3] && opMatch[3].length > 0 ? parseInt(opMatch[3], 10) : undefined;
    const c1 = count1 ?? 1;
    const c2 = count2 ?? 1;
    return { count1, operator, count2, totalCount: c1 * c2 };
  }

  return { totalCount: 1 };
}

/** 일시적인 실패 신호(bell)를 제거한 상태를 반환합니다. */
export function withoutBell(state: VimEditorState): VimEditorState {
  if (!state.bell) return state;
  const copy = { ...state };
  delete copy.bell;
  return copy;
}

/** 키 실패(Vim의 벨/에러)를 표시합니다. 매크로, `.`, `:normal`, 키매핑 재생은 이 신호에서 중단됩니다. */
export function ringBell(state: VimEditorState): VimEditorState {
  return { ...state, pendingKeys: undefined, bell: true };
}

/** 이동하지 못하면 실패(bell)로 간주되는 모션 키 */
export const FAILABLE_MOTION_KEYS = new Set([
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
]);

export const NORMAL_EXTRA_KEYS = new Set(['(', ')', '+', '-', 'Enter', '|']);
export const VISUAL_EXTRA_KEYS = new Set(['(', ')', '+', '-', 'Enter', '|']);

/** 줄 단위 모션 (끝 줄을 항상 포함) */
export const LINEWISE_SHIFT_MOTIONS = new Set(['j', 'k', 'G', 'gg', '+', '-', 'Enter', 'ArrowUp', 'ArrowDown', '_']);

/** 보조 모션( ) ge g_ + - | [( 등)으로 커서를 옮깁니다. 이동할 수 없으면 bell. */
export function moveByExtraMotion(state: VimEditorState, key: string, count: number): VimEditorState {
  const res = evaluateExtraMotion(state.lines, state.cursor, key, count);
  if (!res) return ringBell(state);
  const mode = state.mode === 'NORMAL' ? 'NORMAL' : state.mode;
  return {
    ...state,
    cursor: clampCursor(state.lines, res.target, mode),
    stickyDollar: false,
    pendingKeys: undefined,
  };
}

/**
 * > / < 연산자의 대상 줄 범위를 구합니다.
 * 텍스트 객체(i/a + 대상)는 VISUAL 선택으로, 모션은 커서 이동으로 계산하여 어떤 모션·객체든 같은 방식으로 지원합니다.
 */
export function findShiftRange(
  state: VimEditorState,
  keys: string[],
  count: number,
  runHandleKey: RunHandleKeyFn
): { startLine: number; endLine: number } | null {
  const base: VimEditorState = { ...state, mode: 'NORMAL', pendingKeys: undefined, visualAnchor: undefined, undoStack: [] };
  const countKeys = count > 1 ? String(count).split('') : [];
  if (keys[0] === 'i' || keys[0] === 'a') {
    const selected = [...['v'], ...countKeys, ...keys].reduce((s, k) => runHandleKey(s, k), base);
    if (!selected.mode.startsWith('VISUAL') || !selected.visualAnchor || selected.bell) return null;
    return {
      startLine: Math.min(selected.visualAnchor.line, selected.cursor.line),
      endLine: Math.max(selected.visualAnchor.line, selected.cursor.line),
    };
  }
  let moved = base;
  for (const k of [...countKeys, ...keys]) {
    moved = runHandleKey(moved, k);
    if (moved.bell) return null;
  }
  if (moved.mode !== 'NORMAL' || moved.pendingKeys || moved.lines !== state.lines) return null;
  let endLine = Math.max(state.cursor.line, moved.cursor.line);
  // 배타적(exclusive) 모션이 아래 줄의 첫 칸에서 끝나면 그 줄은 범위에서 제외 (:help exclusive, 예: >} )
  const motionKey = keys.join('');
  if (!LINEWISE_SHIFT_MOTIONS.has(motionKey) && moved.cursor.line > state.cursor.line && moved.cursor.col === 0) {
    endLine = Math.max(state.cursor.line, moved.cursor.line - 1);
  }
  return { startLine: Math.min(state.cursor.line, moved.cursor.line), endLine };
}

/** ga 출력: <A> 65, 16진수 41, 8진수 101 (빈 줄이면 NUL) */
export function describeCharAt(line: string, col: number): string {
  const ch = [...line.slice(col)][0];
  if (ch === undefined) return 'NUL';
  const code = ch.codePointAt(0) ?? 0;
  const label = ch === ' ' ? '<Space>' : ch === '\t' ? '<Tab>' : `<${ch}>`;
  return msg('{label} {code}, 16진수 {v}, 8진수 {v2}', { label, code, v: code.toString(16), v2: code.toString(8) });
}

/** 모션이 커서를 전혀 움직이지 못했는지 (세로 모션은 줄 기준) */
export function isFailedMotion(key: string, from: CursorPosition, to: CursorPosition): boolean {
  if (!FAILABLE_MOTION_KEYS.has(key)) return false;
  const isVertical = key === 'j' || key === 'k' || key === 'ArrowDown' || key === 'ArrowUp';
  return isVertical ? to.line === from.line : to.line === from.line && to.col === from.col;
}

/**
 * 카운트 배수를 적용하여 단일 모션을 여러 번 반복 평가합니다.
 */
export function evaluateMotionWithCount(
  lines: string[],
  cursor: { line: number; col: number },
  key: string,
  count = 1,
  folds?: FoldRange[]
): { line: number; col: number } | null {
  let cur = { ...cursor };
  let matched = true;

  switch (key) {
    case 'h':
    case 'ArrowLeft':
      for (let i = 0; i < count; i++) cur = moveLeft(lines, cur);
      break;

    case 'l':
    case 'ArrowRight':
      for (let i = 0; i < count; i++) cur = moveRight(lines, cur);
      break;

    case 'j':
    case 'ArrowDown':
      for (let i = 0; i < count; i++) {
        if (folds && folds.length > 0) {
          const nextLine = getNextVisibleLine(folds, cur.line, lines.length - 1);
          const maxCol = getMaxCol(lines[nextLine]);
          cur = { line: nextLine, col: Math.min(cur.col, maxCol) };
        } else {
          cur = moveDown(lines, cur);
        }
      }
      break;

    case 'k':
    case 'ArrowUp':
      for (let i = 0; i < count; i++) {
        if (folds && folds.length > 0) {
          const prevLine = getPrevVisibleLine(folds, cur.line);
          const maxCol = getMaxCol(lines[prevLine]);
          cur = { line: prevLine, col: Math.min(cur.col, maxCol) };
        } else {
          cur = moveUp(lines, cur);
        }
      }
      break;

    case '0':
      cur = moveToLineStart(lines, cur);
      break;

    case '$':
      if (count > 1) {
        cur.line = Math.min(lines.length - 1, cur.line + count - 1);
      }
      cur = moveToLineEnd(lines, cur);
      break;

    case '^':
      cur = moveToFirstNonBlank(lines, cur);
      break;

    case 'w':
      for (let i = 0; i < count; i++) cur = moveToNextWord(lines, cur);
      break;

    case 'W':
      for (let i = 0; i < count; i++) cur = moveToNextWORD(lines, cur);
      break;

    case 'b':
      for (let i = 0; i < count; i++) cur = moveToPrevWord(lines, cur);
      break;

    case 'B':
      for (let i = 0; i < count; i++) cur = moveToPrevWORD(lines, cur);
      break;

    case 'e':
      for (let i = 0; i < count; i++) cur = moveToWordEnd(lines, cur);
      break;

    case 'E':
      for (let i = 0; i < count; i++) cur = moveToWORDEnd(lines, cur);
      break;

    case '}':
      cur = moveToNextParagraph(lines, cur, count);
      break;

    case '{':
      cur = moveToPrevParagraph(lines, cur, count);
      break;

    default:
      matched = false;
  }

  if (!matched) {
    return null;
  }

  return clampCursor(lines, cur, 'NORMAL');
}

/**
 * 현재 커서 위치에 텍스트를 즉시 삽입하고 커서를 끝 위치로 전진시킵니다.
 */
export function insertTextAtCursor(
  state: VimEditorState,
  text: string
): VimEditorState {
  if (text.length === 0) {
    return state;
  }

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (state.blockInsertSession) {
    const updatedChars = [...state.blockInsertSession.typedChars, ...text.split('')];
    state = {
      ...state,
      blockInsertSession: {
        ...state.blockInsertSession,
        typedChars: updatedChars,
      },
    };
  }

  if (!text.includes('\n')) {
    const newLine = currentLine.slice(0, col) + text + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + text.length },
    };
  }

  const parts = text.split('\n');
  const prefix = currentLine.slice(0, col);
  const suffix = currentLine.slice(col);

  const newLines = [
    ...state.lines.slice(0, line),
    prefix + parts[0],
    ...parts.slice(1, -1),
    parts[parts.length - 1] + suffix,
    ...state.lines.slice(line + 1),
  ];

  const finalLine = line + parts.length - 1;
  const finalCol = (parts[parts.length - 1] ?? '').length;

  return {
    ...state,
    lines: newLines,
    cursor: { line: finalLine, col: finalCol },
  };
}

/**
 * 순정 Vim 윈도우/스플릿 제어 키스트로크 (Ctrl-w) 처리
 */
export function handleCtrlWKey(
  state: VimEditorState,
  key: string,
  count?: number
): VimEditorState {
  // 창 생성: s, v, n
  if (key === 's' || key === 'Ctrl-s' || key === 'Ctrl+s') {
    return { ...splitWindow(state, 'horizontal', state.secondaryLines), pendingKeys: undefined };
  }
  if (key === 'v' || key === 'Ctrl-v' || key === 'Ctrl+v') {
    return { ...splitWindow(state, 'vertical', state.secondaryLines), pendingKeys: undefined };
  }
  if (key === 'n' || key === 'Ctrl-n' || key === 'Ctrl+n') {
    return { ...splitWindow(state, 'horizontal', [''], '[No Name]'), pendingKeys: undefined };
  }

  // 창 포커스 이동: w, W, h, l, k, j, t, b, p
  if (key === 'w' || key === 'Ctrl-w' || key === 'Ctrl+w') {
    return { ...switchPaneFocus(state, (state.activePaneIndex ?? 0) === 0 ? 1 : 0), pendingKeys: undefined };
  }
  if (key === 'W') {
    return { ...switchPaneFocus(state, (state.activePaneIndex ?? 0) === 0 ? 1 : 0), pendingKeys: undefined };
  }
  if (key === 'h' || key === 'Ctrl-h' || key === 'Ctrl+h' || key === 'ArrowLeft') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'l' || key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'ArrowRight') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 'k' || key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ArrowUp') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'j' || key === 'Ctrl-j' || key === 'Ctrl+j' || key === 'ArrowDown') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 't' || key === 'Ctrl-t' || key === 'Ctrl+t') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'b' || key === 'Ctrl-b' || key === 'Ctrl+b') {
    return { ...switchPaneFocus(state, 1), pendingKeys: undefined };
  }
  if (key === 'p' || key === 'Ctrl-p' || key === 'Ctrl+p') {
    const prev = state.previousPaneIndex ?? ((state.activePaneIndex ?? 0) === 0 ? 1 : 0);
    return { ...switchPaneFocus(state, prev), pendingKeys: undefined };
  }

  // 창 닫기 및 유일 창: c, q, o
  if (key === 'c' || key === 'q') {
    return { ...closeSplitWindow(state), pendingKeys: undefined };
  }
  if (key === 'o' || key === 'Ctrl-o' || key === 'Ctrl+o') {
    return { ...closeOtherPanes(state), pendingKeys: undefined };
  }

  // 창 위치 맞바꾸기 및 회전: x, r, R
  if (key === 'x' || key === 'Ctrl-x' || key === 'Ctrl+x') {
    return { ...exchangePanes(state), pendingKeys: undefined };
  }
  if (key === 'r' || key === 'Ctrl-r' || key === 'Ctrl+r') {
    return { ...rotatePanes(state, false), pendingKeys: undefined };
  }
  if (key === 'R') {
    return { ...rotatePanes(state, true), pendingKeys: undefined };
  }

  // 레이아웃 이동 및 전환: H, J, K, L, T
  if (key === 'H') {
    return { ...movePaneToDirection(state, 'H'), pendingKeys: undefined };
  }
  if (key === 'L') {
    return { ...movePaneToDirection(state, 'L'), pendingKeys: undefined };
  }
  if (key === 'K') {
    return { ...movePaneToDirection(state, 'K'), pendingKeys: undefined };
  }
  if (key === 'J') {
    return { ...movePaneToDirection(state, 'J'), pendingKeys: undefined };
  }
  if (key === 'T') {
    return { ...moveWindowToNewTab(state), pendingKeys: undefined };
  }
  if (key === 'f' || key === 'Ctrl-f' || key === 'Ctrl+f') {
    return { ...gotoFileUnderCursor(state, { split: true }), pendingKeys: undefined };
  }
  if (key === 'F') {
    return { ...gotoFileUnderCursor(state, { withLineNumber: true, split: true }), pendingKeys: undefined };
  }

  // 창 크기 조절: =, +, -, >, <, _, |
  if (key === '=') {
    return { ...resizeSplit(state, '='), pendingKeys: undefined };
  }
  if (key === '_' || key === '|') {
    return { ...resizeSplit(state, key), pendingKeys: undefined };
  }
  if (key === '+' || key === '>') {
    return { ...resizeSplit(state, count ?? 5), pendingKeys: undefined };
  }
  if (key === '-' || key === '<') {
    return { ...resizeSplit(state, -(count ?? 5)), pendingKeys: undefined };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}

/** 붙여넣을 내용이 없어 버퍼도 실행 취소 기록도 바뀌지 않았는지 */
export function isEmptyPut(before: VimEditorState, after: VimEditorState): boolean {
  return after.lines === before.lines && after.undoStack === before.undoStack;
}

/** E353: 레지스터가 비어 있을 때의 실패 */
export function emptyRegisterBell(state: VimEditorState): VimEditorState {
  const reg = state.activeRegister ?? '"';
  return { ...ringBell(state), activeRegister: undefined, commandMessage: msg('E353: 레지스터 {reg} 가 비어 있습니다', { reg }) };
}

/** p / P / ]p / [p / gp / gP 공통 실행기 (빈 레지스터 검사 + . 반복 기록 포함) */
export function executePutVariant(
  state: VimEditorState,
  isBefore: boolean,
  count: number,
  options: { adjustIndent?: boolean; leaveCursorAfter?: boolean } | undefined,
  baseKeys: string[],
  isReplayingDot: boolean
): VimEditorState {
  const res = putFromRegister(state, state.activeRegister, isBefore, count, options);
  if (isEmptyPut(state, res)) return emptyRegisterBell(state);
  const keys = count > 1 ? [String(count), ...baseKeys] : baseKeys;
  return {
    ...res,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys,
  };
}

/** 연산자 + 일반 모션을 실행하고 레지스터 동기화와 `.` 반복 키를 기록합니다. */
export function applyOperatorMotion(
  state: VimEditorState,
  op: 'd' | 'c' | 'y',
  motionKey: string,
  parsed: ParsedPending,
  isReplayingDot: boolean
): VimEditorState {
  // G / gg 는 카운트를 줄 번호로, 나머지 모션은 반복 횟수로 사용합니다.
  const isLineJump = motionKey === 'G' || motionKey === 'gg';
  const hasCount = parsed.count1 !== undefined || parsed.count2 !== undefined;
  const count = isLineJump ? (hasCount ? parsed.totalCount : undefined) : parsed.totalCount;
  const res = executeOperatorMotion(state, op, motionKey, count);
  if (!res) {
    return ringBell(state);
  }
  const synced = syncRegisters(state, res, op === 'y');
  const motionKeys = motionKey === 'Enter' ? ['Enter'] : [...motionKey];
  const opKeys = hasCount ? [String(parsed.totalCount), op, ...motionKeys] : [op, ...motionKeys];
  if (op === 'c') {
    return { ...synced, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys };
  }
  if (op === 'd') {
    return { ...synced, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys };
  }
  return synced;
}

export function getOppositeMotion(motion: 'f' | 'F' | 't' | 'T'): 'f' | 'F' | 't' | 'T' {
  switch (motion) {
    case 'f': return 'F';
    case 'F': return 'f';
    case 't': return 'T';
    case 'T': return 't';
  }
}
