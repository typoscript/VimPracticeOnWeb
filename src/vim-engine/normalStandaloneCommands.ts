import { VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { moveToLastLine } from './motions';
import {
  deleteChar,
  deleteCharBefore,
  changeLine,
  changeToEndOfLine,
  replaceChar,
  insertAtFirstNonBlank,
  appendAtLineEnd,
  openLineBelow,
  openLineAbove,
  undo,
  undoCurrentLine,
  redo,
  pushUndoSnapshot,
} from './operators';
import { syncRegisters, registerTextToKeys } from './registers';
import { virtualReplaceChar } from './replaceMode';
import { openCommandLineWindow } from './cmdlineWindow';
import { openHelp } from './helpEngine';
import { openLspHover } from './lspEngine';
import {
  openLspRename,
  findLspReferences,
  openLspCodeActionMenu,
} from './lspRefactorEngine';
import { findMatchingBracket } from './bracketMatch';
import { computePercentJumpTarget } from './extraMotions';
import { handleMiniMoveNormal } from './miniMoveEngine';
import { enterTerminalInsertMode } from './terminalEngine';
import { findParagraphTarget } from './advancedMotions';
import { moveFindRepeat } from './findChar';
import { getWordAtCursor } from './search';
import { executeCommandLine } from './commandLine';
import {
  cursorToHigh,
  cursorToMiddle,
  cursorToLow,
  scrollHalfPageDown,
  scrollHalfPageUp,
  scrollFullPageDown,
  scrollFullPageUp,
  scrollLineDown,
  scrollLineUp,
} from './viewport';
import { recordJump, jumpOlder, jumpNewer } from './marks';
import { reselectVisualForRedo } from './visualRedo';
import { beginChangeListUndoJoin, endChangeListUndoJoin } from './changelist';
import { joinLines, joinSingleLastLine, toggleCaseChar, modifyNumberAtCursor } from './lineOperators';
import { yankFoldOrLine } from './folding';
import { msg } from './messages';
import { getOptions, parseWhichwrapFlags } from './setOptionsCore';
import { executeOperatorMotion } from './operatorMotion';
import { repeatSearch, executeWordSearch } from './searchMode';
import {
  ringBell,
  NORMAL_EXTRA_KEYS,
  moveByExtraMotion,
  isFailedMotion,
  evaluateMotionWithCount,
  executePutVariant,
  getOppositeMotion,
  RunHandleKeyFn,
  ParsedPending,
} from './engineHelpers';

/**
 * 한 번의 최상위 매크로 실행(@a 등)이 재생할 수 있는 키 총량.
 * 자기 자신을 두 번 이상 부르는 재귀 매크로는 깊이 제한(100)만으로는 키 수가 지수적으로 늘어 브라우저가 멈추므로,
 * 총량을 넘으면 실행을 멈추고 벨을 울립니다 (Vim 에서는 사용자가 Ctrl-C 로 끊는 상황).
 */
export const MAX_MACRO_REPLAY_KEYS = 100000;
let macroReplayKeysLeft = MAX_MACRO_REPLAY_KEYS;

/** 매크로 실행 전체가 변경 목록에서 한 실행 취소 단위입니다 (changelist.ts) */
const replayMacroRegister = (state: VimEditorState, ...rest: [string, number, number, RunHandleKeyFn]): VimEditorState =>
  endChangeListUndoJoin(state, replayMacroRegisterRaw(beginChangeListUndoJoin(state), ...rest));

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

/**
 * 뷰포트 스크롤, 점프 리스트, 숫자 증감, 줄 내 탐색 반복, J/~ /F1/K/& 등을 처리합니다.
 */
export function handleNormalViewportAndNavOps(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): VimEditorState | null {
  // %: 카운트가 있으면 [count]% 파일 백분율 줄 점프, 없으면 괄호 짝 점프
  if (key === '%' && !parsed.operator) {
    if (parsed.count1 !== undefined) {
      const pctTarget = computePercentJumpTarget(
        state.lines,
        parsed.count1,
        state.cursor.col,
        Boolean(getOptions(state).startofline)
      );
      if (pctTarget) {
        return { ...recordJump(state), cursor: pctTarget, pendingKeys: undefined };
      }
      return ringBell(state);
    }
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      return { ...recordJump(state), cursor: matchPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }

  // 단독 ; / ,: 줄 내 탐색 반복
  if (key === ';' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    if (state.lastCharSearch) {
      const nextPos = moveFindRepeat(
        state.lines,
        state.cursor,
        state.lastCharSearch.type,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) return { ...state, cursor: nextPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }
  if (key === ',' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    if (state.lastCharSearch) {
      const oppMotion = getOppositeMotion(state.lastCharSearch.type);
      const nextPos = moveFindRepeat(
        state.lines,
        state.cursor,
        oppMotion,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) return { ...state, cursor: nextPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }

  // Ctrl-o / Ctrl-i: 점프 리스트 탐색 ([count]Ctrl-o, [count]Ctrl-i)
  if ((key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'ctrl-o') && !parsed.operator) {
    return jumpOlder(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-i' || key === 'Ctrl+i' || key === 'ctrl-i') && !parsed.operator) {
    return jumpNewer(state, parsed.totalCount);
  }

  // Ctrl-g: 현재 버퍼 상태 출력
  if (
    (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') &&
    !parsed.operator &&
    !state.pendingKeys
  ) {
    const filename = state.primaryFilename || msg('[이름 없음]');
    const isModified = (state.undoStack?.length ?? 0) > 0;
    const mod = isModified ? msg('[수정됨] ') : '';
    const lineCount = state.lines.length;
    if (lineCount === 0) {
      return { ...state, commandMessage: msg('"{filename}" [버퍼에 줄 없음]', { filename }) };
    }
    const percent = Math.floor(((state.cursor.line + 1) * 100) / lineCount);
    return {
      ...state,
      commandMessage: msg('"{filename}" {mod}{lineCount}줄 --{percent}%--', {
        filename,
        mod,
        lineCount,
        percent,
      }),
    };
  }

  // Ctrl-a / Ctrl-x: 커서 위치 숫자 증감
  if ((key === 'Ctrl-a' || key === 'Ctrl+a' || key === 'ctrl-a') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, parsed.totalCount);
    // op_addsub 는 숫자를 찾기 전에 u_save_cursor 하므로 실패해도 빈 실행 취소 항목이 남습니다 (u 가 그 커서로 돌아옴).
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(pushUndoSnapshot(state));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-a'] : ['Ctrl-a'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }
  if ((key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, -parsed.totalCount);
    // op_addsub 는 숫자를 찾기 전에 u_save_cursor 하므로 실패해도 빈 실행 취소 항목이 남습니다 (u 가 그 커서로 돌아옴).
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(pushUndoSnapshot(state));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-x'] : ['Ctrl-x'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }

  // H, M, L: 화면 뷰포트 기준 최상단/중앙/최하단 이동
  const isPureCountOrEmpty = !state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys);
  if (key === 'H' && !parsed.operator && isPureCountOrEmpty) return cursorToHigh(state);
  if (key === 'M' && !parsed.operator && isPureCountOrEmpty) return cursorToMiddle(state);
  if (key === 'L' && !parsed.operator && isPureCountOrEmpty) return cursorToLow(state);

  // Ctrl-d/u/f/b/e/y: 뷰포트 스크롤
  if ((key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') && !parsed.operator) {
    return scrollHalfPageDown(state);
  }
  if ((key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') && !parsed.operator) {
    return scrollHalfPageUp(state);
  }
  if ((key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') && !parsed.operator) {
    return scrollFullPageDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-b' || key === 'Ctrl+b' || key === 'ctrl-b') && !parsed.operator) {
    return scrollFullPageUp(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-e' || key === 'Ctrl+e' || key === 'ctrl-e') && !parsed.operator) {
    return scrollLineDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-y' || key === 'Ctrl+y' || key === 'ctrl-y') && !parsed.operator) {
    return scrollLineUp(state, parsed.totalCount);
  }

  // &: 직전 :s 재실행
  // Vim nv_optrans: `[count]&` 는 `[count]:s<CR>` (현재 줄부터 count 줄). Ex 명령이라 `.` 반복 대상이 아닙니다.
  if (key === '&' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    const n = parseInt(state.pendingKeys || '1', 10);
    const cmd = n > 1 ? `.,.+${n - 1}s` : 's';
    return executeCommandLine({ ...state, pendingKeys: undefined }, cmd, runHandleKey);
  }

  // F1 / K: 도움말 및 LSP 호버
  if (key === 'F1' && !state.pendingKeys) {
    return { ...openHelp(state), pendingKeys: undefined };
  }
  if (key === 'K' && !parsed.operator && !state.pendingKeys) {
    const curLine = state.lines[state.cursor.line] ?? '';
    const word = getWordAtCursor(curLine, state.cursor.col);
    const lspResult = openLspHover(state, word);
    if (lspResult !== null) return { ...lspResult, pendingKeys: undefined };
    return { ...openHelp(state, word ?? undefined), pendingKeys: undefined };
  }

  // J / ~: 줄 합치기 및 대소문자 토글
  if (key === 'J' && !parsed.operator) {
    if (state.cursor.line >= state.lines.length - 1) {
      return parsed.totalCount > 2 ? { ...joinSingleLastLine(state, false), lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['J'] } : ringBell(state);
    }
    // [count]J 는 count 줄을 합칩니다 (최소 2줄) → 이음 횟수는 count - 1
    const res = joinLines(state, Math.max(1, parsed.totalCount - 1));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'J'] : ['J'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }
  if (key === '~' && !parsed.operator) {
    const res = toggleCaseChar(state, parsed.totalCount);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '~'] : ['~'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }

  return null;
}

/**
 * 단일 키 편집/모드 진입(/, ?, :, u, Ctrl-r, p/P, Y, D, s/S, C, x, i/I/a/A/o/O/R/v/V)과
 * 이동 모션 평가(G, {, }, 보조 모션, 기본 모션)를 처리합니다.
 */
export function handleNormalEditingAndMotionFallback(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';

  if (key === '/' || key === '?') {
    if (parsed.operator) {
      return {
        ...state,
        mode: 'SEARCH',
        commandType: key,
        commandBuffer: '',
        searchOperator: {
          op: parsed.operator,
          count: parsed.totalCount,
          initialCursor: { ...state.cursor },
        },
        searchOriginCursor: { ...state.cursor },
        searchOriginViewport: state.viewport ? { ...state.viewport } : undefined,
        incsearchStepOffset: 0,
        pendingKeys: undefined,
        commandMessage: undefined,
      };
    }
    return {
      ...state,
      mode: 'SEARCH',
      commandType: key,
      commandBuffer: '',
      searchCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      searchOriginCursor: { ...state.cursor },
      searchOriginViewport: state.viewport ? { ...state.viewport } : undefined,
      incsearchStepOffset: 0,
      pendingKeys: undefined,
      commandMessage: undefined,
    };
  }

  if (key === ':') {
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: '',
      pendingKeys: undefined,
      commandMessage: undefined,
    };
  }

  if (key === 'n' || key === 'N') return repeatSearch(state, key === 'N', parsed.totalCount);
  if (key === '*' || key === '#') return executeWordSearch(state, key === '*' ? 'forward' : 'backward', true);
  if (key === 'u') return undo(state);
  if (key === 'U') return undoCurrentLine(state);
  if (key === 'Ctrl-r' || key === 'ctrl+r') return redo(state);
  if (key === 'p' || key === 'P') {
    return executePutVariant(state, key === 'P', parsed.totalCount, undefined, [key], isReplayingDot);
  }

  if (key === 'Y' && !parsed.operator) {
    // Y 는 yy 와 같아서(nvim -u NONE) 마지막 줄에서 {count}Y 는 실패합니다 (nv_lineop 의 cursor_down 실패).
    if (parsed.totalCount > 1 && state.cursor.line >= state.lines.length - 1) return ringBell({ ...state, pendingKeys: undefined });
    return syncRegisters(state, yankFoldOrLine(state, parsed.totalCount), true);
  }
  // Vim: 마지막 줄에서 {count}D / C / S 는 실패합니다 (아래로 count-1 줄을 갈 수 없음).
  if ((key === 'D' || key === 'C' || key === 'S') && !parsed.operator && parsed.totalCount > 1 && state.cursor.line >= state.lines.length - 1) {
    return ringBell({ ...state, pendingKeys: undefined });
  }
  if (key === 'D' && !parsed.operator) {
    const { line, col } = state.cursor;
    const cur = state.lines[line] ?? '';
    const endLine = Math.min(state.lines.length - 1, line + parsed.totalCount - 1);
    // Vim op_delete: 여러 줄 D 가 들여쓰기 안에서 시작하면 줄 단위 삭제가 됩니다.
    if (endLine > line && col <= getFirstNonBlankCol(cur)) {
      const removed = state.lines.slice(line, endLine + 1);
      const rest = [...state.lines.slice(0, line), ...state.lines.slice(endLine + 1)];
      const nextLines = rest.length > 0 ? rest : [''];
      const targetLine = Math.min(line, nextLines.length - 1);
      const linewiseState: VimEditorState = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: clampCursor(nextLines, { line: targetLine, col }, 'NORMAL'),
        clipboard: { type: 'line', content: removed.join('\n') },
        pendingKeys: undefined,
      };
      return {
        ...syncRegisters(state, linewiseState, false),
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [String(parsed.totalCount), 'D'],
      };
    }
    // Vim op_delete: 빈 줄 한 줄의 D 는 아무것도 하지 않습니다 (실행 취소 항목·레지스터 없음, `.` 는 D).
    if (endLine === line && cur === '') {
      return { ...state, pendingKeys: undefined, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['D'] };
    }
    const deletedContent =
      endLine === line
        ? cur.slice(col)
        : [cur.slice(col), ...state.lines.slice(line + 1, endLine + 1)].join('\n');
    const nextLines = [
      ...state.lines.slice(0, line),
      cur.slice(0, col),
      ...state.lines.slice(endLine + 1),
    ];
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: clampCursor(nextLines, { line, col }, 'NORMAL'),
      clipboard: { type: 'text', content: deletedContent },
      pendingKeys: undefined,
    };
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'D'] : ['D'];
    return {
      ...syncRegisters(state, stateWithDel, false),
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if (key === 's' && !parsed.operator) {
    const { line, col } = state.cursor;
    const curLine = state.lines[line] ?? '';
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 's'] : ['s'];
    // 빈 줄의 s(= cl)는 빈 범위지만 op_delete 가 u_save_cursor 하므로, 입력한 글자도 u 한 번에 사라집니다.
    if (curLine.length === 0) {
      return {
        ...pushUndoSnapshot(state),
        mode: 'INSERT',
        pendingKeys: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
      };
    }
    const delCount = Math.min(parsed.totalCount, curLine.length - col);
    const nextLines = [...state.lines];
    nextLines[line] = curLine.slice(0, col) + curLine.slice(col + delCount);
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: { line, col },
      mode: 'INSERT',
      clipboard: { type: 'text', content: curLine.slice(col, col + delCount) },
      pendingKeys: undefined,
    };
    return {
      ...syncRegisters(state, stateWithDel, false),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'S' && !parsed.operator) {
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'S'] : ['S'];
    return {
      ...syncRegisters(state, changeLine(state, parsed.totalCount), false),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'C' && !parsed.operator) {
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'C'] : ['C'];
    return {
      ...syncRegisters(state, changeToEndOfLine(state, parsed.totalCount), false, false, (state.lines[state.cursor.line] ?? '') === ''),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  // x / X 는 Vim 에서 dl / dh 라 'whichwrap' 의 l / h 가 있으면 줄을 넘어 지웁니다 (operatorMotion.ts).
  const ww = key === 'x' || key === 'X' ? parseWhichwrapFlags(getOptions(state).whichwrap) : null;
  if (key === 'x') {
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'x'] : ['x'];
    const deleted = ww?.has('l') ? executeOperatorMotion(state, 'd', 'l', parsed.totalCount) ?? state : deleteChar(state, parsed.totalCount);
    return {
      ...syncRegisters(state, deleted, false),
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if (key === 'X') {
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'X'] : ['X'];
    const deleted = ww?.has('h') ? executeOperatorMotion(state, 'd', 'h', parsed.totalCount) ?? state : deleteCharBefore(state, parsed.totalCount);
    return {
      ...syncRegisters(state, deleted, false),
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if (key === 'I') {
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'I'] : ['I'];
    return {
      ...insertAtFirstNonBlank(state),
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'A') {
    const termRes = enterTerminalInsertMode(state);
    if (termRes) return termRes;
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'A'] : ['A'];
    return {
      ...appendAtLineEnd(state),
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'o') {
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'o'] : ['o'];
    return {
      ...openLineBelow(state),
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: parsed.totalCount > 1 ? true : undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'O') {
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'O'] : ['O'];
    return {
      ...openLineAbove(state),
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: parsed.totalCount > 1 ? true : undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'i') {
    const termRes = enterTerminalInsertMode(state);
    if (termRes) return termRes;
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'i'] : ['i'];
    return {
      ...pushUndoSnapshot(state),
      mode: 'INSERT',
      pendingKeys: undefined,
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'a') {
    const termRes = enterTerminalInsertMode(state);
    if (termRes) return termRes;
    const newCol =
      currentLine.length === 0 ? 0 : Math.min(state.cursor.col + 1, currentLine.length);
    const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'a'] : ['a'];
    return {
      ...pushUndoSnapshot(state),
      mode: 'INSERT',
      cursor: { line: state.cursor.line, col: newCol },
      pendingKeys: undefined,
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      insertRepeatNewline: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
    };
  }
  if (key === 'R' && !parsed.operator && (!state.pendingKeys || /^[0-9]+$/.test(state.pendingKeys))) {
    // [count]R: Esc 를 누르면 입력한 글자를 count-1 번 더 덮어씁니다 (handleReplaceModeKey).
    return {
      ...pushUndoSnapshot(state),
      mode: 'REPLACE',
      replaceStack: [],
      pendingKeys: undefined,
      insertRepeatCount: parsed.totalCount > 1 ? parsed.totalCount : undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : parsed.totalCount > 1 ? [String(parsed.totalCount), 'R'] : ['R'],
    };
  }
  if (key === 'v') {
    return { ...state, mode: 'VISUAL', visualAnchor: { ...state.cursor }, pendingKeys: undefined };
  }
  if (key === 'V') {
    return { ...state, mode: 'VISUAL_LINE', visualAnchor: { ...state.cursor }, pendingKeys: undefined };
  }

  if (key === 'G') {
    const stateWithJump = recordJump(state);
    const useSol = Boolean(getOptions(state).startofline);
    if (parsed.count1 !== undefined) {
      const targetLine = Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1));
      const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
      const targetCol = useSol
        ? getFirstNonBlankCol(state.lines[targetLine])
        : Math.min(state.cursor.col, maxCol);
      return {
        ...stateWithJump,
        cursor: { line: targetLine, col: targetCol },
        pendingKeys: undefined,
      };
    }
    const nextCursor = moveToLastLine(state.lines, state.cursor);
    const finalCursor = useSol
      ? { line: nextCursor.line, col: getFirstNonBlankCol(state.lines[nextCursor.line]) }
      : clampCursor(state.lines, nextCursor, 'NORMAL');
    return {
      ...stateWithJump,
      cursor: finalCursor,
      pendingKeys: undefined,
    };
  }

  if ((key === '}' || key === '{') && !parsed.operator) {
    const found = findParagraphTarget(state.lines, state.cursor, key === '}' ? 'next' : 'prev', parsed.totalCount);
    if (!found) return ringBell({ ...state, pendingKeys: undefined });
    return {
      ...recordJump(state),
      cursor: clampCursor(state.lines, found.target, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  if (!parsed.operator) {
    const miniMoved = handleMiniMoveNormal(state, key, parsed.totalCount, isReplayingDot);
    if (miniMoved) return miniMoved;
  }

  if (!parsed.operator && NORMAL_EXTRA_KEYS.has(key)) {
    return moveByExtraMotion(state, key, parsed.totalCount);
  }

  const opts = getOptions(state);
  let motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount,
    opts.foldenable === false ? undefined : state.folds,
    opts.whichwrap
  );

  // Vim cursor_down: [count]$ 는 마지막 줄에서 더 내려갈 수 없으면 실패합니다 (그 밖에는 마지막 줄에서 멈춤).
  if (motionCursor && key === '$' && parsed.totalCount > 1 && state.cursor.line >= state.lines.length - 1) {
    return ringBell(state);
  }
  if (motionCursor) {
    const isDollar = key === '$';
    const isVertical = key === 'j' || key === 'k' || key === 'ArrowDown' || key === 'ArrowUp';
    if (isFailedMotion(key, state.cursor, motionCursor)) {
      return ringBell(state);
    }
    if (state.stickyDollar && isVertical) {
      const destLine = state.lines[motionCursor.line] ?? '';
      motionCursor = {
        line: motionCursor.line,
        col: Math.max(0, destLine.length - 1),
      };
    }
    return {
      ...state,
      cursor: motionCursor,
      stickyDollar: isDollar || (state.stickyDollar && isVertical),
      pendingKeys: undefined,
    };
  }

  return { ...state, pendingKeys: undefined };
}
