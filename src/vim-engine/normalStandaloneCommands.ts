import { VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { moveToLastLine } from './motions';
import {
  deleteChar,
  changeLine,
  changeToEndOfLine,
  replaceChar,
  insertAtFirstNonBlank,
  appendAtLineEnd,
  openLineBelow,
  openLineAbove,
  undo,
  redo,
  pushUndoSnapshot,
} from './operators';
import { syncRegisters, parseMacroStringToKeys } from './registers';
import { openCommandLineWindow } from './cmdlineWindow';
import { openHelp } from './helpEngine';
import { openLspHover } from './lspEngine';
import { findMatchingBracket } from './bracketMatch';
import { computePercentJumpTarget } from './extraMotions';
import { moveToNextParagraph, moveToPrevParagraph } from './advancedMotions';
import { moveFind } from './findChar';
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
import { joinLines, toggleCaseChar, modifyNumberAtCursor } from './lineOperators';
import { yankFoldOrLine } from './folding';
import { msg } from './messages';
import { getOptions } from './setOptionsCore';
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
 * 매크로 녹화(q), 매크로 재생(@{reg}/@@/@:), 도트 반복(.), 단일 문자 교체(r)를 처리합니다.
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

    if (targetReg === ':') {
      const lastCmd = state.commandHistory?.[state.commandHistory.length - 1];
      if (!lastCmd) {
        return {
          ...ringBell(state),
          pendingKeys: undefined,
          commandMessage: msg('E30: 이전에 실행한 명령행이 없습니다'),
        };
      }
      let curState: VimEditorState = {
        ...state,
        pendingKeys: undefined,
        lastPlayedMacro: ':',
      };
      for (let c = 0; c < parsed.totalCount && !curState.bell; c++) {
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
      : parseMacroStringToKeys(regEntry.content);
    let curState: VimEditorState = {
      ...state,
      pendingKeys: undefined,
      lastPlayedMacro: targetReg,
    };

    for (let c = 0; c < parsed.totalCount && !curState.bell; c++) {
      if (macroDepth >= 100) break;
      for (const mk of macroKeys) {
        curState = runHandleKey(curState, mk, false, macroDepth + 1);
        if (curState.bell) break;
      }
    }

    return { ...curState, lastPlayedMacro: targetReg };
  }

  // 2. 직전 변경 반복 ('.' Dot Repeat — "1p ~ "8p 후 . 반복 시 번호 레지스터를 1씩 자동 증가)
  if (key === '.' && !state.pendingKeys) {
    if (!state.lastChangeKeys || state.lastChangeKeys.length === 0) {
      return state;
    }
    const replayKeys = [...state.lastChangeKeys];
    if (
      replayKeys.length >= 3 &&
      replayKeys[0] === '"' &&
      /^[1-8]$/.test(replayKeys[1])
    ) {
      replayKeys[1] = String(Number(replayKeys[1]) + 1);
    }
    let curState: VimEditorState = { ...state, pendingKeys: undefined };
    for (const rk of replayKeys) {
      curState = runHandleKey(curState, rk, true);
      if (curState.bell) break;
    }
    return { ...curState, lastChangeKeys: replayKeys };
  }

  // 3. 'r' (단일 문자 교체) 대기 상태
  if (parsed.operator === 'r') {
    if (key.length === 1) {
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
  if (key === ';' && !state.pendingKeys) {
    if (state.lastCharSearch) {
      const nextPos = moveFind(
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
  if (key === ',' && !state.pendingKeys) {
    if (state.lastCharSearch) {
      const oppMotion = getOppositeMotion(state.lastCharSearch.type);
      const nextPos = moveFind(
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
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(state);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-a'] : ['Ctrl-a'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }
  if ((key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, -parsed.totalCount);
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(state);
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
  if (key === '&' && !state.pendingKeys) {
    const res = executeCommandLine({ ...state, pendingKeys: undefined }, 's', runHandleKey);
    return res.bell ? res : { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['&'] };
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
    if (state.cursor.line >= state.lines.length - 1) return ringBell(state);
    const res = joinLines(state, parsed.totalCount);
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

  if (key === 'n' || key === 'N') return repeatSearch(state, key === 'N');
  if (key === '*' || key === '#') return executeWordSearch(state, key === '*' ? 'forward' : 'backward', true);
  if (key === 'u') return undo(state);
  if (key === 'Ctrl-r' || key === 'ctrl+r') return redo(state);
  if (key === 'p' || key === 'P') {
    return executePutVariant(state, key === 'P', parsed.totalCount, undefined, [key], isReplayingDot);
  }

  if (key === 'Y' && !state.pendingKeys) {
    return syncRegisters(state, yankFoldOrLine(state, 1), true);
  }
  if (key === 'D' && !state.pendingKeys) {
    const { line, col } = state.cursor;
    const cur = state.lines[line] ?? '';
    const nextLines = [...state.lines];
    nextLines[line] = cur.slice(0, col);
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: clampCursor(nextLines, { line, col }, 'NORMAL'),
      clipboard: { type: 'text', content: cur.slice(col) },
      pendingKeys: undefined,
    };
    return {
      ...syncRegisters(state, stateWithDel, false),
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['D'],
    };
  }
  if (key === 's' && !state.pendingKeys) {
    const { line, col } = state.cursor;
    const curLine = state.lines[line] ?? '';
    if (curLine.length === 0) {
      return {
        ...state,
        mode: 'INSERT',
        pendingKeys: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['s'],
      };
    }
    const nextLines = [...state.lines];
    nextLines[line] = curLine.slice(0, col) + curLine.slice(col + 1);
    const stateWithDel: VimEditorState = {
      ...pushUndoSnapshot(state),
      lines: nextLines,
      cursor: { line, col },
      mode: 'INSERT',
      clipboard: { type: 'text', content: curLine[col] ?? '' },
      pendingKeys: undefined,
    };
    return {
      ...syncRegisters(state, stateWithDel, false),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['s'],
    };
  }
  if (key === 'S' && !state.pendingKeys) {
    return {
      ...syncRegisters(state, changeLine(state), false),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['S'],
    };
  }
  if (key === 'C') {
    return {
      ...syncRegisters(state, changeToEndOfLine(state), false),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['C'],
    };
  }
  if (key === 'x') {
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'x'] : ['x'];
    return {
      ...syncRegisters(state, deleteChar(state, parsed.totalCount), false),
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
    };
  }
  if (key === 'I') {
    return {
      ...insertAtFirstNonBlank(state),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['I'],
    };
  }
  if (key === 'A') {
    return {
      ...appendAtLineEnd(state),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['A'],
    };
  }
  if (key === 'o') {
    return {
      ...openLineBelow(state),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['o'],
    };
  }
  if (key === 'O') {
    return {
      ...openLineAbove(state),
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['O'],
    };
  }
  if (key === 'i') {
    return {
      ...pushUndoSnapshot(state),
      mode: 'INSERT',
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['i'],
    };
  }
  if (key === 'a') {
    const newCol =
      currentLine.length === 0 ? 0 : Math.min(state.cursor.col + 1, currentLine.length);
    return {
      ...pushUndoSnapshot(state),
      mode: 'INSERT',
      cursor: { line: state.cursor.line, col: newCol },
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['a'],
    };
  }
  if (key === 'R' && !parsed.operator && !state.pendingKeys) {
    return {
      ...pushUndoSnapshot(state),
      mode: 'REPLACE',
      replaceStack: [],
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['R'],
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
    const target =
      key === '}'
        ? moveToNextParagraph(state.lines, state.cursor, parsed.totalCount)
        : moveToPrevParagraph(state.lines, state.cursor, parsed.totalCount);
    return {
      ...recordJump(state),
      cursor: clampCursor(state.lines, target, 'NORMAL'),
      pendingKeys: undefined,
    };
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
