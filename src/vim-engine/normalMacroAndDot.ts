import { VimEditorState } from './types';
import { replaceChar } from './operators';
import { registerTextToKeys } from './registers';
import { virtualReplaceChar } from './replaceMode';
import { openCommandLineWindow } from './cmdlineWindow';
import { openLspRename, findLspReferences, openLspCodeActionMenu } from './lspRefactorEngine';
import { executeCommandLine } from './commandLine';
import { reselectVisualForRedo } from './visualRedo';
import { beginChangeListUndoJoin, endChangeListUndoJoin } from './changelist';
import { msg } from './messages';
import { pushUndoSnapshot } from './undoHistory';
import { ringBell, RunHandleKeyFn, ParsedPending } from './engineHelpers';

/* 노멀 모드 매크로 녹화·재생(q @ Q), `.` 반복, r/gr (normalStandaloneCommands.ts 에서 분리) */

/**
 * 한 번의 최상위 매크로 실행(@a 등)이 재생할 수 있는 키 총량.
 * 자기 자신을 두 번 이상 부르는 재귀 매크로는 깊이 제한(100)만으로는 키 수가 지수적으로 늘어 브라우저가 멈추므로,
 * 총량을 넘으면 실행을 멈추고 벨을 울립니다 (Vim 에서는 사용자가 Ctrl-C 로 끊는 상황).
 */
export const MAX_MACRO_REPLAY_KEYS = 100000;
let macroReplayKeysLeft = MAX_MACRO_REPLAY_KEYS;

/** 매크로 실행 전체가 변경 목록에서 한 실행 취소 단위입니다 (changelist.ts) */
const replayMacroRegister = (state: VimEditorState, ...rest: [string, number, number, RunHandleKeyFn]): VimEditorState => {
  const played = endChangeListUndoJoin(state, replayMacroRegisterRaw(beginChangeListUndoJoin(state), ...rest));
  return rest[2] === 0 ? joinMacroUndo(state, played) : played;
};

/**
 * Vim 은 레지스터를 실행하는 동안 실행 취소를 끊지 않으므로(u_sync 는 직접 친 키에서만) 최상위 `@q`·`[count]@q` 한 번의
 * 변경 전체가 `u` 한 번에 되돌아갑니다. 안쪽에서 생긴 실행 취소 기록을 하나로 합치고, 커서는 첫 변경을 시작한 위치입니다.
 * 매크로가 스스로 실행 취소·다시 실행을 했거나(기록이 시작 때 것을 앞부분으로 갖지 않음) 입력 모드로 끝나면 그대로 둡니다.
 */
function joinMacroUndo(before: VimEditorState, after: VimEditorState): VimEditorState {
  const base = before.undoStack ?? [];
  const stack = after.undoStack ?? [];
  if (stack.length - base.length < 2) return after;
  if (base.some((snap, i) => stack[i] !== snap)) return after;
  if (after.mode !== 'NORMAL') return after;
  const undoFields = {
    undoStack: before.undoStack,
    redoStack: before.redoStack,
    undoTreeNodes: before.undoTreeNodes,
    currentUndoSeq: before.currentUndoSeq,
    maxUndoSeq: before.maxUndoSeq,
    undoTimeHistory: before.undoTimeHistory,
    undoTimeIndex: before.undoTimeIndex,
    undoJoinMerged: before.undoJoinMerged,
    pendingUndoJoin: before.pendingUndoJoin,
    lastActionWasUndo: before.lastActionWasUndo,
  };
  const joined = pushUndoSnapshot({ ...after, ...undoFields, lines: before.lines, cursor: stack[base.length].cursor });
  const {
    undoStack, redoStack, undoTreeNodes, currentUndoSeq, maxUndoSeq,
    undoTimeHistory, undoTimeIndex, undoJoinMerged, pendingUndoJoin, lastActionWasUndo,
  } = joined;
  return {
    ...after,
    undoStack, redoStack, undoTreeNodes, currentUndoSeq, maxUndoSeq,
    undoTimeHistory, undoTimeIndex, undoJoinMerged, pendingUndoJoin, lastActionWasUndo,
  };
}

function replayMacroRegisterRaw(
  state: VimEditorState,
  targetReg: string,
  count: number,
  macroDepth: number,
  runHandleKey: RunHandleKeyFn
): VimEditorState {
  if (targetReg === ':') {
    const lastCmd = state.commandHistory?.[state.commandHistory.length - 1];
    if (!lastCmd) {
      return {
        ...ringBell(state),
        pendingKeys: undefined,
        commandMessage: msg('E30: 이전에 실행한 명령행이 없습니다'),
      };
    }
    let curState: VimEditorState = { ...state, pendingKeys: undefined, lastPlayedMacro: ':' };
    for (let c = 0; c < count && !curState.bell; c++) {
      if (macroDepth >= 100) break;
      curState = executeCommandLine(curState, lastCmd, runHandleKey);
    }
    return { ...curState, lastPlayedMacro: ':' };
  }

  const regEntry = state.registers?.[targetReg];
  if (!regEntry || !regEntry.content) {
    return { ...state, pendingKeys: undefined, lastPlayedMacro: targetReg };
  }

  const macroKeys = Array.isArray(regEntry.content)
    ? regEntry.content
    : registerTextToKeys(regEntry.content); // Vim: 실제 ESC 글자만 Esc 이고, 손으로 친 `<Esc>` 는 글자 그대로 입력합니다.
  let curState: VimEditorState = { ...state, pendingKeys: undefined, lastPlayedMacro: targetReg };

  if (macroDepth === 0) macroReplayKeysLeft = MAX_MACRO_REPLAY_KEYS;
  let exhausted = false;
  for (let c = 0; c < count && !curState.bell && !exhausted; c++) {
    if (macroDepth >= 100) break;
    for (const mk of macroKeys) {
      if (macroReplayKeysLeft <= 0) {
        exhausted = true;
        break;
      }
      macroReplayKeysLeft--;
      curState = runHandleKey(curState, mk, false, macroDepth + 1);
      if (curState.bell) break;
    }
  }

  if (macroDepth === 0 && macroReplayKeysLeft <= 0) {
    return {
      ...curState,
      bell: true,
      lastPlayedMacro: targetReg,
      commandMessage: msg('매크로 재생이 {limit}개 키를 넘어 중단되었습니다 (자기 자신을 부르는 재귀 매크로인지 확인하세요)', {
        limit: MAX_MACRO_REPLAY_KEYS,
      }),
    };
  }
  return exhausted
    ? { ...curState, bell: true, lastPlayedMacro: targetReg }
    : { ...curState, lastPlayedMacro: targetReg };
}

const DOT_COUNT_OPERATORS = new Set(['d', 'c', 'y', '<', '>', '=', '!']);
const DOT_COUNT_G_OPERATORS = new Set(['u', 'U', '~', '?', 'q', 'w', 'c']);
const isDigitKey = (k: string | undefined) => k !== undefined && /^[0-9]$/.test(k);

/**
 * Vim `[count].`: 새 count 가 반복할 명령의 원래 count 를 대신합니다 (`d3w` 뒤 `2.` 는 `d2w`).
 * 비주얼 반복(`v`/`V`/`Ctrl-v` 로 다시 선택하는 키)과 Ex 명령은 count 를 쓰지 않습니다.
 */
export function withDotRepeatCount(keys: readonly string[], count: number): string[] {
  let i = 0;
  const skipCount = () => {
    if (keys[i] !== undefined && /^[1-9]$/.test(keys[i])) {
      while (isDigitKey(keys[i])) i++;
    }
  };
  skipCount();
  const head: string[] = [];
  if (keys[i] === '"' && keys[i + 1] !== undefined) {
    head.push(keys[i], keys[i + 1]);
    i += 2;
    skipCount();
  }
  let rest = keys.slice(i);
  if (rest.length === 0 || ['v', 'V', 'Ctrl-v', ':'].includes(rest[0])) return [...keys];
  const opLen = DOT_COUNT_OPERATORS.has(rest[0])
    ? 1
    : rest[0] === 'g' && DOT_COUNT_G_OPERATORS.has(rest[1])
      ? 2
      : 0;
  if (opLen > 0 && rest[opLen] !== undefined && /^[1-9]$/.test(rest[opLen])) {
    let j = opLen;
    while (isDigitKey(rest[j])) j++;
    rest = [...rest.slice(0, opLen), ...rest.slice(j)];
  }
  return [...head, ...String(count).split(''), ...rest];
}

/**
 * Vim redo_VIsual: 비주얼 반복이 다시 고를 줄 수가 버퍼 끝을 넘으면 마지막 줄까지로 줄입니다
 * (`VGc…` 뒤 줄이 하나만 남았을 때 `.` 가 `V2j` 에서 실패하지 않음).
 */
function clampVisualRedoLines(keys: readonly string[], state: VimEditorState): readonly string[] {
  if (!['v', 'V', 'Ctrl-v'].includes(keys[0] ?? '')) return keys;
  let i = 1;
  while (isDigitKey(keys[i])) i++;
  if (i === 1 || keys[i] !== 'j') return keys;
  const wanted = Number(keys.slice(1, i).join(''));
  const available = Math.max(0, state.lines.length - 1 - state.cursor.line);
  if (wanted <= available) return keys;
  const countKeys = available > 0 ? [...String(available).split(''), 'j'] : [];
  return [keys[0], ...countKeys, ...keys.slice(i + 1)];
}

/**
 * 매크로 녹화(q), 매크로 재생(@{reg}/@@/@:), Q 반복, 도트 반복(.), 단일 문자 교체(r)를 처리합니다.
 */
export function handleNormalMacroAndDot(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean,
  macroDepth: number,
  runHandleKey: RunHandleKeyFn
): VimEditorState | null {
  // 1-1. 매크로 녹화 시작 대기 (q) 또는 커맨드라인 윈도우 (q:, q/, q?)
  if (state.pendingKeys === 'q' || parsed.operator === 'q') {
    if (key === ':' || key === '/' || key === '?') {
      return openCommandLineWindow(state, key as ':' | '/' | '?');
    }
    if (/^[a-zA-Z0-9]$/.test(key)) {
      const isAppend = /^[A-Z]$/.test(key);
      const targetReg = isAppend ? key.toLowerCase() : key;
      const existingEntry = isAppend ? state.registers?.[targetReg] : undefined;
      const existingKeys =
        existingEntry && Array.isArray(existingEntry.content) ? [...existingEntry.content] : [];

      return {
        ...state,
        pendingKeys: undefined,
        recordingMacro: {
          register: key,
          keys: existingKeys,
        },
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // 1-2. 매크로 실행 (@{reg}, [count]@{reg}, @:, @@)
  if (parsed.operator === '@') {
    let targetReg: string | null = null;
    if (key === '@') {
      targetReg = state.lastPlayedMacro ?? null;
    } else if (key === ':') {
      targetReg = ':';
    } else if (/^[a-zA-Z0-9]$/.test(key)) {
      targetReg = key.toLowerCase();
    }

    if (!targetReg) {
      return { ...state, pendingKeys: undefined };
    }

    return replayMacroRegister(state, targetReg, parsed.totalCount, macroDepth, runHandleKey);
  }

  // 1-3. Neovim 기본 Q: 마지막 실행/녹화한 매크로(또는 q 레지스터) 즉시 반복 ([count]Q)
  if (key === 'Q' && !parsed.operator) {
    const targetReg =
      state.lastPlayedMacro ??
      state.lastRecordedMacro ??
      (state.registers?.['q']?.content ? 'q' : null);
    if (!targetReg) {
      return ringBell({ ...state, pendingKeys: undefined });
    }
    return replayMacroRegister(state, targetReg, parsed.totalCount, macroDepth, runHandleKey);
  }

  // 2. 직전 변경 반복 ('.' Dot Repeat — "1p ~ "8p 후 . 반복 시 번호 레지스터를 1씩 자동 증가)
  if (key === '.' && (!state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys))) {
    if (!state.lastChangeKeys || state.lastChangeKeys.length === 0) {
      return { ...state, pendingKeys: undefined };
    }
    let replayKeys = [...state.lastChangeKeys];
    if (
      replayKeys.length >= 3 &&
      replayKeys[0] === '"' &&
      /^[1-8]$/.test(replayKeys[1])
    ) {
      replayKeys[1] = String(Number(replayKeys[1]) + 1);
    }
    if (state.pendingKeys) {
      replayKeys = withDotRepeatCount(replayKeys, Number(state.pendingKeys));
    }
    let curState: VimEditorState = { ...state, pendingKeys: undefined };
    // 블록·여러 줄 문자 단위 비주얼 반복은 같은 크기의 영역을 직접 다시 고릅니다 (짧은 줄에서도 너비 유지).
    const reselect = reselectVisualForRedo(curState, replayKeys);
    if (reselect) curState = reselect.state;
    for (const rk of reselect ? reselect.rest : clampVisualRedoLines(replayKeys, state)) {
      curState = runHandleKey(curState, rk, true);
      if (curState.bell) break;
    }
    if (reselect) curState = reselect.restore(curState);
    return { ...curState, lastChangeKeys: replayKeys };
  }

  // 3. 'r' (단일 문자 교체) / 'gr' (Neovim 0.11 LSP grn/grr/gra 또는 가상 단일 문자 교체) 대기 상태
  if (parsed.operator === 'r' || parsed.operator === 'gr') {
    if (parsed.operator === 'gr' && parsed.count1 === undefined && parsed.count2 === undefined) {
      if (key === 'n') return openLspRename(state);
      if (key === 'r') return findLspReferences(state);
      if (key === 'a') return openLspCodeActionMenu(state);
    }
    if (key.length === 1 || (parsed.operator === 'gr' && key === 'Tab')) {
      if (parsed.operator === 'gr') {
        const res = virtualReplaceChar(state, key, parsed.totalCount);
        if (!res) return ringBell(state);
        const changeKeys =
          parsed.totalCount > 1 ? [String(parsed.totalCount), 'g', 'r', key] : ['g', 'r', key];
        return {
          ...res,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
        };
      }
      const currentLine = state.lines[state.cursor.line] ?? '';
      if (state.cursor.col + parsed.totalCount > currentLine.length) return ringBell(state);
      const res = replaceChar(state, key, parsed.totalCount);
      const changeKeys =
        parsed.totalCount > 1 ? [String(parsed.totalCount), 'r', key] : ['r', key];
      return {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : changeKeys,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  return null;
}
