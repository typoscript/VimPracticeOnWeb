import { StateSnapshot, VimEditorState } from './types';
import { curswantColumnOn } from './virtualColumn';
import { visualOperatorStart } from './undoHistory';
import { isVisualInsertRedoKey } from './visualInsert';

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
/** 문자 단위 비주얼의 X / D / Y 는 Vim v_visop 이 줄 단위('V')로 바꿔 실행하므로 반복·실행 취소 규칙도 줄 단위로 봅니다. */
function asVisualOpState(prev: VimEditorState, key: string): VimEditorState {
  return prev.mode === 'VISUAL' && !prev.pendingKeys && (key === 'X' || key === 'D' || key === 'Y') ? { ...prev, mode: 'VISUAL_LINE' } : prev;
}

export function recordVisualRepeat(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  prev = asVisualOpState(prev, key);
  if (isReplayingDot || !VISUAL_REPEAT_MODES.has(prev.mode)) return next;
  if (VISUAL_REPEAT_MODES.has(next.mode) || next.pendingKeys) return next;
  // 문자·줄 단위 비주얼 I / A 는 자기 반복 키를 남깁니다 (visualInsert.ts)
  if (isVisualInsertRedoKey(next.currentChangeKeys?.[0])) return next;
  const entersInsert = next.mode === 'INSERT';
  // 복사·취소 등 변경이 아닌 연산. `=` 는 들여쓰기가 그대로여도 Vim 처럼 반복 대상이 됩니다.
  if (!entersInsert && next.lines === prev.lines && !(key === '=' && !prev.pendingKeys && !next.bell)) return next;
  const reselect = visualReselectKeys(prev);
  if (!reselect) return next;
  const opKeys = [...(prev.pendingKeys ?? '').split('').filter(Boolean), key];
  const repeatKeys = [...reselect, ...opKeys];
  return entersInsert ? { ...next, currentChangeKeys: repeatKeys } : { ...next, lastChangeKeys: repeatKeys };
}

/**
 * 줄 단위 비주얼 대소문자 연산(V~ Vu VU Vg?)을 `.` 로 반복하면 Vim(do_pending_operator 의 redo_VIsual_busy)은
 * 연산 시작을 `.` 를 누른 커서 그대로(열 포함) 두므로 커서가 그 열에 남습니다 (처음 연산은 앵커가 위쪽이면 0열).
 */
export function redoLinewiseVisualCaseCursor(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (!isReplayingDot || prev.mode !== 'VISUAL_LINE' || !prev.visualAnchor || next.mode !== 'NORMAL' || next.pendingKeys) return next;
  const pending = prev.pendingKeys ?? '';
  const isCaseOp = (!pending && (key === '~' || key === 'u' || key === 'U')) || (pending === 'g' && (key === '~' || key === 'u' || key === 'U' || key === '?'));
  if (!isCaseOp || next.lines === prev.lines || prev.visualAnchor.line > prev.cursor.line) return next;
  const line = prev.visualAnchor.line;
  const col = Math.max(0, Math.min(prev.visualAnchor.col, (next.lines[line] ?? '').length - 1));
  return next.cursor.line === line && next.cursor.col === col ? next : { ...next, cursor: { line, col } };
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
/**
 * 이번 변경이 커서 왼쪽에서 시작하는 삭제인지 보고 그 시작 열을 돌려줍니다 (Vim 은 연산 전에 커서를 범위 시작 oap->start 로 옮긴 뒤 u_save).
 * X·db·dF 처럼 커서 바로 앞까지 지운 경우와 diW·daw 처럼 커서를 감싼 범위를 지운 경우 모두입니다.
 * 커서 자리부터 지워 줄 끝으로 당겨진 것(`d$`, 끝 글자 `x`)과 구분이 안 되면 키(X, dh, db, dF …)로 정합니다.
 */
function leftwardDeleteStart(prev: VimEditorState, next: VimEditorState, key: string): number | null {
  const before = prev.lines[prev.cursor.line] ?? '';
  const after = next.lines[next.cursor.line] ?? '';
  const d = before.length - after.length;
  if (d <= 0) return null;
  const n = next.cursor.col;
  const p = prev.cursor.col;
  // 지운 글자가 무명 레지스터에 들어갔으면 그것으로 범위를 가립니다 (das 처럼 앞뒤 어느 쪽으로도 설명되는 경우).
  const deleted = next.registers !== prev.registers ? next.registers?.['"']?.content : undefined;
  const explains = (start: number) =>
    after === before.slice(0, start) + before.slice(start + d) && (typeof deleted !== 'string' || deleted === before.slice(start, start + d));
  const clamped = n === after.length - 1;
  const starts = [n, ...(clamped ? [n + 1] : [])].filter((start) => start < p && start + d >= p && explains(start));
  if (starts.length === 0) return null;
  // 커서 자리부터 지워 줄 끝으로 당겨진 것(시작 = 원래 커서)으로도 설명되면 키로 구분합니다.
  if (clamped && n + 1 === p && explains(p)) {
    const pending = prev.pendingKeys ?? '';
    if (!pending) return key === 'X' ? starts[0] : null;
    return /[FT]$/.test(pending) || (/d$/.test(pending) && 'hbB0^'.includes(key)) ? starts[0] : null;
  }
  return starts[starts.length - 1];
}

export function recordInsertStartCursor(prev: VimEditorState, next: VimEditorState, key = ''): VimEditorState {
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
    // 커서 자리부터 지워 줄 끝으로 당겨진 경우(`d$`, 끝 글자 `x`, 마지막 단어 `dw`)는 원래 커서를 기억합니다.
    const start = leftwardDeleteStart(prev, next, key);
    if (start !== null) {
      const top = next.undoStack[next.undoStack.length - 1];
      return { ...next, undoStack: [...next.undoStack.slice(0, -1), { ...top, cursor: { line: next.cursor.line, col: start } }] };
    }
  }
  if (prev.mode !== 'NORMAL' || next.mode !== 'INSERT') return next;
  const stack = next.undoStack;
  if (!stack || stack.length === 0 || stack === prev.undoStack) return next;
  const top = stack[stack.length - 1];
  // 여러 줄을 줄 단위로 바꾸는 2cc·2S·cj·cgg·cip 는 op_delete 가 둘째 줄부터 지우며 u_save 하므로,
  // 연산 시작 위치(oap->start)를 한 줄 내린 곳을 기억합니다 (열은 시작 열: 커서 줄이면 커서 열, 위로 간 모션이면 기억한 열, 텍스트 객체는 0열).
  if (next.lines.length < prev.lines.length && next.registers !== prev.registers && next.registers?.['"']?.type === 'line') {
    const start = next.cursor.line;
    const lineLen = (l: number) => (prev.lines[l] ?? '').length;
    const startCol = /[ia]$/.test(prev.pendingKeys ?? '')
      ? 0
      : start === prev.cursor.line
        ? prev.cursor.col
        : Math.min(curswantColumnOn(prev, prev.lines, start), Math.max(0, lineLen(start) - 1));
    const col = Math.max(0, Math.min(startCol, lineLen(start + 1) - 1));
    return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: { line: start + 1, col } }] };
  }
  if (next.lines.length !== prev.lines.length) return next;
  // 한 줄을 줄 단위로 바꾸는 cc / S: 실행 취소 커서는 원래 열이되 첫 비공백을 넘지 않습니다 (Neovim 대조, 'autoindent' 와 무관).
  const linewiseChange =
    (next.registers !== prev.registers && next.registers?.['"']?.type === 'line') || (next.clipboard !== prev.clipboard && next.clipboard?.type === 'line');
  if (linewiseChange && next.cursor.line === prev.cursor.line) {
    const fnb = (prev.lines[prev.cursor.line] ?? '').search(/\S|$/);
    const col = Math.max(0, Math.min(prev.cursor.col, fnb));
    return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: { line: prev.cursor.line, col } }] };
  }
  return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: { ...next.cursor } }] };
}

/**
 * 비주얼 모드 연산의 실행 취소 위치 (Vim do_pending_operator → 각 연산의 첫 u_save).
 * 연산 전에 커서를 연산 범위 시작(oap->start)으로 옮기므로, 앵커가 커서보다 앞이면 앵커(줄 단위 비주얼은 그 줄의 0열),
 * 아니면 커서 자리를 기억합니다. 줄 단위로 여러 줄을 바꾸는 `c`(op_delete) 는 둘째 줄부터 지우며 기록을 시작하므로 한 줄 아래입니다.
 */
export function recordVisualUndoCursor(prev: VimEditorState, next: VimEditorState, key = ''): VimEditorState {
  prev = asVisualOpState(prev, key);
  if ((prev.mode !== 'VISUAL' && prev.mode !== 'VISUAL_LINE') || !prev.visualAnchor) return next;
  if (isVisualInsertRedoKey(next.currentChangeKeys?.[0])) return next;
  const stack = next.undoStack;
  if (!stack || stack.length === 0 || stack === prev.undoStack) return next;
  const top = stack[stack.length - 1];
  if (top === prev.undoStack?.[prev.undoStack.length - 1]) return next;
  const anchor = prev.visualAnchor;
  const linewise = prev.mode === 'VISUAL_LINE';
  let start = visualOperatorStart(linewise, anchor, prev.cursor);
  if (linewise && next.mode === 'INSERT' && anchor.line !== prev.cursor.line) start = { line: start.line + 1, col: start.col };
  return { ...next, undoStack: [...stack.slice(0, -1), { ...top, cursor: start }] };
}

/**
 * Vim 은 실패한 변경(`gUi[` 처럼 대상이 없는 텍스트 객체, `ca{` 등)을 `.` 반복 대상으로 남기지 않습니다.
 * 단 `[count]Ctrl-a` / `Ctrl-x` 는 숫자가 없어 실패해도 반복 대상으로 기록합니다 (nv_addsub 의 prep_redo). 실행 취소 항목을 남긴 실패(`dh`, 빈 레지스터 `p`)도 같습니다.
 */
export function keepRepeatOnFailure(prev: VimEditorState, next: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  if (isReplayingDot || !next.bell || prev.mode !== 'NORMAL') return next;
  const pending = prev.pendingKeys ?? '';
  if ((key === 'Ctrl-a' || key === 'Ctrl-x') && /^([1-9][0-9]*)?$/.test(pending)) {
    return { ...next, lastChangeKeys: [...pending.split('').filter(Boolean), key] };
  }
  // 삐 소리를 냈어도 실행 취소 항목을 남긴 명령은 Vim 에서 실행된 것이라 `.` 대상입니다
  // (줄 처음의 dh 는 beep_flush 뒤 빈 범위로 실행, 빈 레지스터 p 는 prep_redo 뒤 E353).
  if (next.undoStack !== prev.undoStack && (next.undoStack?.length ?? 0) > (prev.undoStack?.length ?? 0)) return next;
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

/**
 * Vim 은 마지막 줄까지 지워 버퍼가 비면 ML_EMPTY 로 표시하고, 그 상태의 op_delete 는 아무 일도 하지 않습니다
 * (`if (curbuf->b_ml.ml_flags & ML_EMPTY) return OK` — 레지스터를 덮어쓰지 않음, `das` 뒤 `S`·`dd`·`.`).
 * 엔진은 버퍼를 비운 삭제의 결과 줄 배열을 `emptiedLines` 로 기억합니다 (줄이 바뀌면 배열이 달라져 저절로 풀림).
 */
const EMPTY_BUFFER_DELETE = /^("[^"]?)?([1-9][0-9]*)?[dc]/;
export function applyEmptyBufferDelete(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  const isEmpty = (lines: string[]) => lines.length === 1 && lines[0] === '';
  if (prev.emptiedLines && prev.lines === prev.emptiedLines && next.registers !== prev.registers && isEmpty(next.lines)) {
    const pending = prev.pendingKeys ?? '';
    const deletes =
      key === '.' ||
      (prev.mode === 'NORMAL' && (EMPTY_BUFFER_DELETE.test(pending) || (/^("[^"]?)?([1-9][0-9]*)?$/.test(pending) && 'SC'.includes(key)))) ||
      (prev.mode.startsWith('VISUAL') && !pending && 'dxXDcsSC'.includes(key));
    if (deletes) return { ...next, registers: prev.registers, clipboard: prev.clipboard };
  }
  if (
    isEmpty(next.lines) &&
    next.lines !== prev.lines &&
    !isEmpty(prev.lines) &&
    next.mode !== 'INSERT' &&
    next.registers !== prev.registers &&
    next.registers?.['"']?.type === 'line'
  ) {
    return { ...next, emptiedLines: next.lines };
  }
  return next;
}

/**
 * Vim 은 입력 모드에서 처음 글자를 넣을 때 실행 취소를 저장합니다 (ins_need_undo). 엔진은 i/a/I/A/gi/gI 로 들어갈 때
 * 미리 스냅샷을 쌓으므로, 아무것도 바꾸지 않고 Esc 로 나오면 그 스냅샷을 걷어 냅니다 (`i<Esc>` 뒤 `u` 가 커서를 옮기지 않음).
 */
export function dropEmptyInsertUndo(prev: VimEditorState, next: VimEditorState, key: string): VimEditorState {
  const pending = prev.pendingKeys ?? '';
  if (prev.mode === 'NORMAL' && next.mode === 'INSERT' && !next.insertNormalSession) {
    const pure = /^([1-9][0-9]*)?$/.test(pending) ? 'iaIA'.includes(key) : /^([1-9][0-9]*)?g$/.test(pending) && (key === 'i' || key === 'I');
    const stack = next.undoStack ?? [];
    const top = stack[stack.length - 1];
    if (pure && top && stack !== prev.undoStack && next.lines === prev.lines) {
      return { ...next, emptyInsertUndo: { snapshot: top, redoStack: prev.redoStack } };
    }
    return next;
  }
  if (!prev.emptyInsertUndo) return next;
  if (next.mode === 'INSERT') {
    // 한 번이라도 글자를 넣었으면(나중에 지웠어도) Vim 은 실행 취소를 저장했습니다 (a…<C-u><Esc>).
    if (next.lines === prev.lines) return next;
    const { emptyInsertUndo: _dropped, ...typed } = next;
    return typed;
  }
  const { emptyInsertUndo, ...rest } = next;
  const stack = rest.undoStack ?? [];
  const top: StateSnapshot | undefined = stack[stack.length - 1];
  const untouched =
    key === 'Escape' && prev.mode === 'INSERT' && !rest.insertNormalSession && top === emptyInsertUndo?.snapshot &&
    top.lines.length === rest.lines.length && top.lines.every((l, i) => l === rest.lines[i]);
  if (!untouched) return emptyInsertUndo ? rest : next;
  return { ...rest, undoStack: stack.slice(0, -1), redoStack: emptyInsertUndo.redoStack };
}
