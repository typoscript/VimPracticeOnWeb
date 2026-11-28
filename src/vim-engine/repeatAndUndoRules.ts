import { VimEditorState } from './types';

/**
 * handleKey 가 키 하나를 처리한 뒤 적용하는 `.` 반복·실행 취소 규칙 (Neovim 대조).
 * - 비주얼 반복(:help visual-repeat), 레지스터를 지정한 변경의 반복, 실패한 변경은 반복 대상에서 제외
 * - 입력 모드로 들어가는 변경·커서 왼쪽 삭제의 실행 취소 위치, 반복 키를 한 글자씩 저장
 * - 마지막 줄에서 count 가 넘치는 줄 단위 연산(`4>>`)의 실패
 */

const VISUAL_REPEAT_MODES = new Set(['VISUAL', 'VISUAL_LINE', 'VISUAL_BLOCK']);

function countKeys(n: number, motion: string): string[] {
  return n > 0 ? [...String(n).split(''), motion] : [];
}

/**
 * Vim :help visual-repeat — 비주얼 연산을 `.` 로 반복하면 커서에서 같은 양의 텍스트를 다시 고릅니다.
 * 줄 단위: 같은 줄 수 / 블록: 같은 줄 수·열 수 / 한 줄 안 문자 단위: 같은 글자 수 /
 * 여러 줄 문자 단위: 같은 줄 수, 마지막 줄은 지난번과 같은 열까지.
 */
function visualReselectKeys(prev: VimEditorState): string[] | null {
  const anchor = prev.visualAnchor;
  if (!anchor) return null;
  const cur = prev.cursor;
  const lines = Math.abs(cur.line - anchor.line);
  if (prev.mode === 'VISUAL_LINE') return ['V', ...countKeys(lines, 'j')];
  if (prev.mode === 'VISUAL_BLOCK') {
    const width = Math.abs(cur.col - anchor.col);
    return ['Ctrl-v', ...countKeys(lines, 'j'), ...(prev.visualBlockEndOfLine ? ['$'] : countKeys(width, 'l'))];
  }
  if (lines === 0) return ['v', ...countKeys(Math.abs(cur.col - anchor.col), 'l')];
  const end = cur.line > anchor.line ? cur : anchor;
  return ['v', ...countKeys(lines, 'j'), '0', ...countKeys(end.col, 'l')];
}

/** 비주얼 모드 연산이 끝나면 '.' 가 같은 양의 텍스트에 다시 적용되도록 반복 키를 기록합니다. */
export function recordVisualRepeat(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (isReplayingDot || !VISUAL_REPEAT_MODES.has(prev.mode)) return next;
  if (VISUAL_REPEAT_MODES.has(next.mode) || next.pendingKeys) return next;
  const entersInsert = next.mode === 'INSERT';
  if (!entersInsert && next.lines === prev.lines) return next; // 복사·취소 등 변경이 아닌 연산
  const reselect = visualReselectKeys(prev);
  if (!reselect) return next;
  const opKeys = [...(prev.pendingKeys ?? '').split('').filter(Boolean), key];
  const repeatKeys = [...reselect, ...opKeys];
  return entersInsert ? { ...next, currentChangeKeys: repeatKeys } : { ...next, lastChangeKeys: repeatKeys };
}

/**
 * Vim 은 레지스터를 지정한 변경(`"add`, `"acw…`)을 `.` 로 반복할 때 같은 레지스터를 씁니다.
 * 각 명령이 기록한 반복 키에 레지스터 접두사가 없으면 여기서 붙입니다 (비주얼 반복 제외).
 */
export function recordRepeatRegister(prev: VimEditorState, next: VimEditorState, isReplayingDot: boolean): VimEditorState {
  const reg = prev.activeRegister;
  if (isReplayingDot || !reg) return next;
  const withReg = (keys: string[] | undefined) =>
    !keys || keys.length === 0 || keys[0] === '"' || ['v', 'V', 'Ctrl-v'].includes(keys[0]) ? keys : ['"', reg, ...keys];
  if (next.lastChangeKeys !== prev.lastChangeKeys) {
    const keys = withReg(next.lastChangeKeys);
    if (keys !== next.lastChangeKeys) return { ...next, lastChangeKeys: keys };
  }
  if (next.currentChangeKeys !== prev.currentChangeKeys) {
    const keys = withReg(next.currentChangeKeys);
    if (keys !== next.currentChangeKeys) return { ...next, currentChangeKeys: keys };
  }
  return next;
}

/**
 * Vim 은 입력 모드로 들어가는 변경(A, a, I, cc, cw …)의 실행 취소 위치로 "입력을 시작한 곳"을 기억합니다.
 * 이번 키로 새 실행 취소 스냅샷이 생기고 입력 모드에 들어갔다면 스냅샷 커서를 입력 시작 위치로 바꿉니다.
 * (o/O 처럼 줄이 늘어나는 경우는 원래 줄을 기억하므로 그대로 둡니다.)
 */
export function recordInsertStartCursor(prev: VimEditorState, next: VimEditorState): VimEditorState {
  // 커서 왼쪽을 지우는 변경(X, db, d0, dF…)은 Vim 처럼 지운 범위의 시작(바뀐 뒤 커서)을 기억합니다.
  if (
    prev.mode === 'NORMAL' &&
    next.mode === 'NORMAL' &&
    next.undoStack &&
    next.undoStack.length > 0 &&
    next.undoStack !== prev.undoStack &&
    next.lines.length === prev.lines.length &&
    next.cursor.line === prev.cursor.line &&
    next.cursor.col < prev.cursor.col &&
    next.lines.every((l, i) => i === next.cursor.line || l === prev.lines[i]) &&
    next.registers?.['"']?.type !== 'line'
  ) {
    const top = next.undoStack[next.undoStack.length - 1];
    return { ...next, undoStack: [...next.undoStack.slice(0, -1), { ...top, cursor: { ...next.cursor } }] };
  }
  if (prev.mode !== 'NORMAL' || next.mode !== 'INSERT') return next;
  const stack = next.undoStack;
  if (!stack || stack.length === 0 || stack === prev.undoStack) return next;
  if (next.lines.length !== prev.lines.length) return next;
  const top = stack[stack.length - 1];
  return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: { ...next.cursor } }] };
}

/**
 * Vim 은 실패한 변경(`gUi[` 처럼 대상이 없는 텍스트 객체, `ca{` 등)을 `.` 반복 대상으로 남기지 않습니다.
 * 단 `[count]Ctrl-a` / `Ctrl-x` 는 숫자가 없어 실패해도 반복 대상으로 기록합니다 (nv_addsub 의 prep_redo).
 */
export function keepRepeatOnFailure(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (isReplayingDot || !next.bell || prev.mode !== 'NORMAL') return next;
  const pending = prev.pendingKeys ?? '';
  if ((key === 'Ctrl-a' || key === 'Ctrl-x') && /^([1-9][0-9]*)?$/.test(pending)) {
    return { ...next, lastChangeKeys: [...pending.split('').filter(Boolean), key] };
  }
  if (next.lastChangeKeys !== prev.lastChangeKeys) return { ...next, lastChangeKeys: prev.lastChangeKeys };
  return next;
}

/** 두 번 눌러 현재 줄에 쓰는 줄 단위 연산 (`>>`, `g~~`, `gUgU`, `gcc` …): 대기 키 → 마지막 키 */
const DOUBLED_LINE_OPS = /^([1-9][0-9]*)?(>|<|=|g~g?|gUg?|gug?|g\?g?|gq|gw|gc)([1-9][0-9]*)?$/;
const DOUBLED_LAST_KEY: Record<string, string> = { '>': '>', '<': '<', '=': '=', 'g~': '~', gU: 'U', gu: 'u', 'g?': '?', gq: 'q', gw: 'w', gc: 'c' };

/**
 * Vim nv_lineop → cursor_down(count-1): 커서가 이미 마지막 줄인데 [count] 가 2 이상이면 줄 단위 연산은 실패합니다.
 * (마지막 줄이 아니면 마지막 줄까지만 적용 — 각 연산의 기존 처리에 맡깁니다.) dd/yy/cc 는 따로 처리합니다.
 */
export function doubledLineOpOverflow(state: VimEditorState, key: string): VimEditorState | null {
  if (state.mode !== 'NORMAL' || !state.pendingKeys) return null;
  const m = DOUBLED_LINE_OPS.exec(state.pendingKeys);
  if (!m) return null;
  const op = m[2].replace(/g$/, '').replace(/^(g[~Uu?])g$/, '$1');
  const base = op.length === 3 ? op.slice(0, 2) : op;
  if (DOUBLED_LAST_KEY[base] !== key) return null;
  const count = Number(m[1] ?? 1) * Number(m[3] ?? 1);
  if (count < 2 || state.cursor.line < state.lines.length - 1) return null;
  const recordingMacro = state.recordingMacro
    ? { ...state.recordingMacro, keys: [...state.recordingMacro.keys, key] }
    : state.recordingMacro;
  return { ...state, pendingKeys: undefined, bell: true, recordingMacro };
}

/**
 * `.` 반복 키는 실제로 누르는 키 단위여야 다시 재생됩니다. 일부 연산자가 `gu`·`g~` 처럼 두 키를 하나로,
 * 또는 count `12` 를 하나로 기록하므로 여기서 한 글자씩 나눕니다 (나누지 않으면 `.` 가 `u` 실행 취소로 이어짐).
 */
const COMBINED_REPEAT_TOKEN = /^(g[uU~?qwc]|[0-9]{2,})$/;
function splitRepeatKeys(keys: string[] | undefined): string[] | undefined {
  if (!keys || !keys.some((k) => COMBINED_REPEAT_TOKEN.test(k))) return keys;
  return keys.flatMap((k) => (COMBINED_REPEAT_TOKEN.test(k) ? k.split('') : [k]));
}
export function normalizeRepeatKeys(prev: VimEditorState, next: VimEditorState): VimEditorState {
  let out = next;
  if (next.lastChangeKeys !== prev.lastChangeKeys) {
    const keys = splitRepeatKeys(next.lastChangeKeys);
    if (keys !== next.lastChangeKeys) out = { ...out, lastChangeKeys: keys };
  }
  if (next.currentChangeKeys !== prev.currentChangeKeys) {
    const keys = splitRepeatKeys(next.currentChangeKeys);
    if (keys !== next.currentChangeKeys) out = { ...out, currentChangeKeys: keys };
  }
  return out;
}
