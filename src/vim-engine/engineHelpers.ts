import { VimEditorState, CursorPosition, FoldRange } from './types';
import { getMaxCol, clampCursor, settleCursorPastEnd } from './cursor';
import { parseWhichwrapFlags } from './setOptionsCore';
import { evaluateExtraMotion } from './extraMotions';
import { tabstopOf } from './virtualColumn';
import { executeOperatorMotion } from './operatorMotion';
import { syncRegisters, putFromRegister } from './registers';
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
import { msg } from './messages';
import { pushUndoSnapshot } from './undoHistory';

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

  // 2. 연산자 및 카운트 조합: "d", "2d", "d2", "2d3", "c", "r", "gr", "y", "v", "g", "gu", "gU", "g~", "gc", "@", ">", "<", "=", "!", "m", "'", "`"
  const opMatch = pendingKeys.match(/^([1-9][0-9]*)?(g[uU~?cqwr]|[a-zA-Z@'`><=!])([0-9]*)$/);
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

/**
 * 일시적인 신호(실패 bell, Ex 명령의 curswant 유지 표시 keepCurswantAt)를 제거한 상태를 반환합니다.
 * 줄 끝 다음 칸에 둔 NORMAL 커서(cursorPastEnd)도 Vim 처럼 다음 키를 처리하기 전에 마지막 글자로 돌립니다.
 */
export function withoutBell(state: VimEditorState): VimEditorState {
  if (state.cursorPastEnd) state = settleCursorPastEnd(state);
  if (!state.bell && !state.keepCurswantAt) return state;
  const copy = { ...state };
  delete copy.bell;
  delete copy.keepCurswantAt;
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
  'Backspace', ' ', 'Space',
]);

export const NORMAL_EXTRA_KEYS = new Set(['(', ')', '+', '-', '_', 'Enter', '|']);
export const VISUAL_EXTRA_KEYS = new Set(['(', ')', '+', '-', '_', 'Enter', '|']);

/** 포함(inclusive) 모션: 끝이 다음 줄 0열이어도 그 줄을 포함합니다 */
const INCLUSIVE_SHIFT_MOTIONS = new Set(['e', 'E', '$', '%', 'g_', 'ge', 'gE']);

/** 줄 단위 모션 (끝 줄을 항상 포함) */
export const LINEWISE_SHIFT_MOTIONS = new Set(['j', 'k', 'G', 'gg', '+', '-', 'Enter', 'ArrowUp', 'ArrowDown', '_']);

/** 보조 모션( ) ge g_ + - | [( 등)으로 커서를 옮깁니다. 이동할 수 없으면 bell. */
export function moveByExtraMotion(state: VimEditorState, key: string, count: number): VimEditorState {
  const res = evaluateExtraMotion(state.lines, state.cursor, key, count, tabstopOf(state));
  if (!res) return ringBell(state);
  const mode = state.mode === 'NORMAL' ? 'NORMAL' : state.mode;
  // ]] 가 버퍼 끝에 닿으면 연산자와 함께일 때만 마지막 줄 끝(포함)이고, 커서 이동은 0열입니다 (Vim findpar).
  // 비주얼 모드의 ) 는 버퍼 끝에 닿으면 줄 끝 다음 칸(NUL)에 섭니다 (adjust_cursor 는 비주얼에서 커서를 당기지 않음).
  // 비주얼 g$ 는 화면 줄 끝 열로 coladvance 하므로 화면보다 짧은 줄에서는 NUL 에 섭니다 (nv_g_dollar_cmd).
  const visualNul = (key === ')' || key === 'g$') && res.kind === 'inclusive' && state.mode.startsWith('VISUAL') && (state.lines[res.target.line] ?? '').length > 0;
  const target = key === ']]' && res.kind === 'inclusive'
    ? { line: res.target.line, col: 0 }
    : visualNul ? { line: res.target.line, col: res.target.col + 1 } : res.target;
  return {
    ...state,
    cursor: clampCursor(state.lines, target, mode),
    stickyDollar: false,
    visualBlockEndOfLine: undefined,
    pendingKeys: undefined,
    ...(res.failed ? { bell: true } : {}),
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
): { startLine: number; endLine: number; startCol: number; failedAt?: { line: number; col: number } } | null {
  const base: VimEditorState = { ...state, mode: 'NORMAL', pendingKeys: undefined, visualAnchor: undefined, undoStack: [] };
  // startCol: 연산 범위 시작 위치(Vim oap->start)의 열. op_shift 는 커서를 여기 두고 실행 취소 위치(uh_cursor)를 저장합니다.
  const earlier = (a: { line: number; col: number }, b: { line: number; col: number }) =>
    a.line < b.line || (a.line === b.line && a.col <= b.col) ? a : b;
  const countKeys = count > 1 ? String(count).split('') : [];
  // 단어·문장 객체와 w/W/e/E/) 는 연산자용 범위(Vim current_word / current_sent / nv_wordcmd: [count] 가 여러 줄에 걸치고,
  // 줄의 마지막 단어에서 w 는 다음 줄로 넘어가지 않음)를 씁니다.
  // `)` 도 같습니다: 버퍼 끝에 닿으면 마지막 글자까지 포함합니다 (>) 가 마지막 줄도 들여씀).
  if (keys.length === 1 && 'wWeE)'.includes(keys[0])) {
    const range = findOperatorRangeByYank(state, keys, count, runHandleKey);
    if (range) return { startLine: range.start.line, endLine: range.end.line, startCol: range.start.col };
    // nv_wordcmd: 연산자와 함께면 버퍼 끝에서 단어 이동이 실패해도 연산을 계속합니다 (마지막 빈 줄의 3>W 도 op_shift)
    if (state.cursor.line === state.lines.length - 1) return { startLine: state.cursor.line, endLine: state.cursor.line, startCol: state.cursor.col };
  }
  if ((keys[0] === 'i' || keys[0] === 'a') && keys.length === 2 && 'wWs'.includes(keys[1])) {
    const range = findOperatorRangeByYank(state, keys, count, runHandleKey);
    if (range) return { startLine: range.start.line, endLine: range.end.line, startCol: range.start.col };
    // 빈 범위로 성공한 객체(버퍼 끝 빈 줄의 is/as: y 가 빈 문자열을 복사)는 커서 줄만 대상입니다 (빈 줄이라 바뀌지 않음).
    let probe: VimEditorState = { ...base, clipboard: undefined, bell: false };
    for (const k of [...countKeys, 'y', ...keys]) if (!probe.bell) probe = runHandleKey(probe, k);
    if (!probe.bell && probe.mode === 'NORMAL' && !probe.pendingKeys && probe.clipboard?.content === '') {
      return { startLine: probe.cursor.line, endLine: probe.cursor.line, startCol: probe.cursor.col };
    }
    // Vim current_word: [count] 가 버퍼 끝을 넘으면 실패하고 커서는 움직인 자리에 남습니다 (4<iW, nv_object).
    if (probe.bell && keys[1] !== 's') {
      return { startLine: state.cursor.line, endLine: state.cursor.line, startCol: state.cursor.col, failedAt: probe.cursor };
    }
  }
  // 태그 객체(it): 연산자용 범위 끝은 다음 줄 0열의 `</tag>` 앞(배타)인데 Vim 은 이를 앞 줄로 당기지 않으므로 그 줄도 들여씁니다 (>it).
  if ((keys[0] === 'i' || keys[0] === 'a') && keys.length === 2 && keys[1] === 't') {
    let probe: VimEditorState = { ...base, clipboard: undefined, bell: false };
    for (const k of [...countKeys, 'y', ...keys]) if (!probe.bell) probe = runHandleKey(probe, k);
    const text = probe.clipboard?.content;
    if (!probe.bell && probe.mode === 'NORMAL' && !probe.pendingKeys && typeof text === 'string' && text.length > 0 && probe.clipboard?.type !== 'line') {
      return { startLine: probe.cursor.line, endLine: probe.cursor.line + text.split('\n').length - 1, startCol: probe.cursor.col };
    }
  }
  if (keys[0] === 'i' || keys[0] === 'a') {
    const selected = [...['v'], ...countKeys, ...keys].reduce((s, k) => runHandleKey(s, k), base);
    if (!selected.mode.startsWith('VISUAL') || !selected.visualAnchor || selected.bell) return null;
    return {
      startLine: Math.min(selected.visualAnchor.line, selected.cursor.line),
      endLine: Math.max(selected.visualAnchor.line, selected.cursor.line),
      startCol: earlier(selected.visualAnchor, selected.cursor).col,
    };
  }
  // Vim nv_left: 줄 처음의 h 는 삐 소리만 내고 연산자는 빈 범위(커서 줄)로 계속됩니다 (>h 가 그 줄을 들여씀).
  if ((keys[0] === 'h' || keys[0] === 'ArrowLeft') && keys.length === 1 && state.cursor.col === 0) {
    return { startLine: state.cursor.line, endLine: state.cursor.line, startCol: 0 };
  }
  // nv_right: 연산자와 함께 쓴 l 은 줄 끝(빈 줄 포함)에서도 실패하지 않고 커서 줄에 머뭅니다 (>l, 4>l).
  if ((keys[0] === 'l' || keys[0] === 'ArrowRight') && keys.length === 1) {
    return { startLine: state.cursor.line, endLine: state.cursor.line, startCol: 0 };
  }
  let moved = base;
  // 0 은 count 를 받지 않습니다 (3>0 의 '30' 을 줄 번호로 읽지 않게).
  for (const k of [...(keys[0] === '0' ? [] : countKeys), ...keys]) {
    moved = runHandleKey(moved, k);
    if (moved.bell) return null;
  }
  if (moved.mode !== 'NORMAL' || moved.pendingKeys || moved.lines !== state.lines) return null;
  let endLine = Math.max(state.cursor.line, moved.cursor.line);
  // 배타적(exclusive) 모션이 아래 줄의 첫 칸에서 끝나면 그 줄은 범위에서 제외 (:help exclusive, 예: >} )
  const motionKey = keys.join('');
  // 포함 모션(e $ f …)은 해당하지 않고, 뒤로 가는 배타적 모션(>B)은 원래 커서 쪽 끝을 봅니다.
  const inclusive = INCLUSIVE_SHIFT_MOTIONS.has(motionKey) || keys[0] === 'f' || keys[0] === 't';
  const forward = moved.cursor.line > state.cursor.line;
  const later = forward ? moved.cursor : state.cursor;
  const startLine = Math.min(state.cursor.line, moved.cursor.line);
  if (!LINEWISE_SHIFT_MOTIONS.has(motionKey) && !inclusive && later.line > startLine && later.col === 0) {
    endLine = later.line - 1;
  }
  return { startLine: Math.min(state.cursor.line, moved.cursor.line), endLine, startCol: earlier(state.cursor, moved.cursor).col };
}

/**
 * 모션이 움직이지 않고 성공해 빈 범위가 되는지 (0 / ^ / | / ( / 바로 옆 t·T, 그리고 줄 처음의 h).
 * Vim 은 'cpoptions' 에 E 가 없으면 빈 범위에도 연산자를 실행합니다. 같은 모션의 y 로 알아봅니다.
 */
export function isEmptyRegionMotion(state: VimEditorState, motionKeys: string[], count: number, runHandleKey: RunHandleKeyFn): boolean {
  // Vim nv_left: 줄 처음의 h 는 삐 소리만 내고 연산자는 계속됩니다.
  if (motionKeys.length === 1 && (motionKeys[0] === 'h' || motionKeys[0] === 'ArrowLeft') && state.cursor.col === 0) return true;
  let probe: VimEditorState = { ...state, mode: 'NORMAL', pendingKeys: undefined, visualAnchor: undefined, clipboard: undefined, bell: false };
  for (const k of [...(count > 1 ? String(count).split('') : []), 'y', ...motionKeys]) {
    probe = runHandleKey(probe, k);
    if (probe.bell) return false;
  }
  // 빈 범위의 y 는 빈 문자열을 복사합니다 (op_yank).
  return probe.mode === 'NORMAL' && !probe.pendingKeys && probe.lines === state.lines && (!probe.clipboard || probe.clipboard.content === '');
}

/**
 * 연산자 대상 범위를 같은 모션의 y(복사)로 알아냅니다.
 * y 는 모든 모션·텍스트 객체·f/t·%·검색을 지원하고 '[ '] 와 레지스터 종류(문자/줄)를 정확히 남기므로,
 * 대소문자 연산자처럼 자체 모션 해석이 없는 연산자가 Vim 과 같은 범위를 쓰도록 합니다.
 * 모션이 실패(bell)하면 null 입니다. cursor 는 Vim 이 연산 후 두는 위치(문자 단위는 범위 시작)입니다.
 */
export function findOperatorRangeByYank(
  state: VimEditorState,
  motionKeys: string[],
  count: number,
  runHandleKey: RunHandleKeyFn
): {
  start: { line: number; col: number };
  end: { line: number; col: number };
  linewise: boolean;
  cursor: { line: number; col: number };
} | null {
  // 복사 결과를 구분하기 위해 레지스터를 비운 상태에서 시험합니다 (원래 상태는 건드리지 않음).
  const base: VimEditorState = {
    ...state,
    mode: 'NORMAL',
    pendingKeys: undefined,
    visualAnchor: undefined,
    clipboard: undefined,
    bell: false,
  };
  const countKeys = count > 1 ? String(count).split('') : [];
  let probe = base;
  for (const k of [...countKeys, 'y', ...motionKeys]) {
    probe = runHandleKey(probe, k);
    if (probe.bell) return null;
  }
  const yanked = probe.clipboard;
  if (probe.mode !== 'NORMAL' || probe.pendingKeys || !yanked || probe.lines !== state.lines) return null;
  // y 는 커서를 범위 시작으로 옮기고(줄 단위는 시작 줄) 정확한 텍스트를 레지스터에 남깁니다.
  const parts = String(yanked.content ?? '').split('\n');
  if (yanked.type === 'line') {
    const startLine = probe.cursor.line;
    const endLine = Math.min(state.lines.length - 1, startLine + parts.length - 1);
    return {
      start: { line: startLine, col: 0 },
      end: { line: endLine, col: Math.max(0, (state.lines[endLine] ?? '').length - 1) },
      linewise: true,
      cursor: { ...probe.cursor },
    };
  }
  const start = { ...probe.cursor };
  if (parts.length === 1 && parts[0].length === 0) return null;
  // 문자 단위인데 줄바꿈으로 끝나면 마지막 줄은 대상이 아닙니다 (이전 줄 끝까지).
  if (parts.length > 1 && parts[parts.length - 1].length === 0) parts.pop();
  const endLine = start.line + parts.length - 1;
  const lastLen = parts[parts.length - 1].length;
  const endCol = parts.length === 1 ? start.col + lastLen - 1 : lastLen - 1;
  return {
    start,
    end: { line: endLine, col: Math.max(0, endCol) },
    linewise: false,
    cursor: { ...probe.cursor },
  };
}

/** ga 출력: <A> 65, 16진수 41, 8진수 101 (빈 줄이면 NUL) */
export function describeCharAt(line: string, col: number): string {
  const ch = [...line.slice(col)][0];
  if (ch === undefined) return 'NUL';
  const code = ch.codePointAt(0) ?? 0;
  const label = ch === ' ' ? '<Space>' : ch === '\t' ? '<Tab>' : `<${ch}>`;
  return msg('{label} {code}, 16진수 {v}, 8진수 {v2}', { label, code, v: code.toString(16), v2: code.toString(8) });
}

/** g8 출력: 커서 위치 문자의 UTF-8 바이트 16진수 표현 (예: e2 86 92, 빈 줄이면 NUL) */
export function describeCharUtf8Bytes(line: string, col: number): string {
  const ch = [...line.slice(col)][0];
  if (ch === undefined) return 'NUL';
  const cp = ch.codePointAt(0) ?? 0;
  let bytes: number[];
  if (cp <= 0x7f) {
    bytes = [cp];
  } else if (cp <= 0x7ff) {
    bytes = [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  } else if (cp <= 0xffff) {
    bytes = [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  } else {
    bytes = [
      0xf0 | (cp >> 18),
      0x80 | ((cp >> 12) & 0x3f),
      0x80 | ((cp >> 6) & 0x3f),
      0x80 | (cp & 0x3f),
    ];
  }
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
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
  folds?: FoldRange[],
  whichwrap?: string
): { line: number; col: number } | null {
  let cur = { ...cursor };
  let matched = true;
  const wwFlags = parseWhichwrapFlags(whichwrap);

  switch (key) {
    case 'h':
      for (let i = 0; i < count; i++) cur = moveLeft(lines, cur, wwFlags.has('h'));
      break;

    case 'ArrowLeft':
      for (let i = 0; i < count; i++) cur = moveLeft(lines, cur, wwFlags.has('<'));
      break;

    case 'Backspace':
      for (let i = 0; i < count; i++) cur = moveLeft(lines, cur, wwFlags.has('b'));
      break;

    case 'l':
      for (let i = 0; i < count; i++) cur = moveRight(lines, cur, wwFlags.has('l'));
      break;

    case 'ArrowRight':
      for (let i = 0; i < count; i++) cur = moveRight(lines, cur, wwFlags.has('>'));
      break;

    case ' ':
    case 'Space':
      for (let i = 0; i < count; i++) cur = moveRight(lines, cur, wwFlags.has('s'));
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

  return clampCursor(lines, cur);
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

  const nextInsertText = state.mode === 'INSERT'
    ? (state.currentInsertText ?? '') + text
    : state.currentInsertText;

  if (!text.includes('\n')) {
    const newLine = currentLine.slice(0, col) + text + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + text.length },
      currentInsertText: nextInsertText,
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
    currentInsertText: nextInsertText,
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

/** p / P / ]p / [p / gp / gP 공통 실행기 (빈 레지스터 검사 + . 반복 키 및 레지스터 접두사 기록 포함) */
export function executePutVariant(
  state: VimEditorState,
  isBefore: boolean,
  count: number,
  options: { adjustIndent?: boolean; leaveCursorAfter?: boolean } | undefined,
  baseKeys: string[],
  isReplayingDot: boolean
): VimEditorState {
  const res = putFromRegister(state, state.activeRegister, isBefore, count, options);
  // Vim do_put 은 레지스터가 비었는지 보기 전에 u_save 하므로, 실패해도 빈 실행 취소 항목이 남습니다 (`u` 가 그 커서로 돌아감).
  const regPrefix = state.activeRegister ? ['"', state.activeRegister] : [];
  const countAndBase = count > 1 ? [String(count), ...baseKeys] : baseKeys;
  const keys = [...regPrefix, ...countAndBase];
  // nv_put 은 prep_redo 를 먼저 하므로 빈 레지스터로 실패한 붙여넣기도 `.` 대상입니다 (keepRepeatOnFailure 가 남김).
  if (isEmptyPut(state, res)) {
    return { ...emptyRegisterBell(pushUndoSnapshot(state)), changeListHint: { kind: 'undoOnly', undoLine: state.cursor.line + 1 }, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys };
  }
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
  // ( ) 와 함께 쓴 삭제는 한 줄 안이어도 "1 에 들어갑니다 (Vim nv_brace 의 use_reg_one).
  const synced = syncRegisters(state, res, op === 'y', motionKey === '(' || motionKey === ')');
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
