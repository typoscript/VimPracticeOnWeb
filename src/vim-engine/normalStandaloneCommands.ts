import { VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { moveToLastLine } from './motions';
import {
  deleteChar,
  deleteCharBefore,
  changeLine,
  changeToEndOfLine,
  insertAtFirstNonBlank,
  appendAtLineEnd,
  openLineBelow,
  openLineAbove,
  undo,
  undoCurrentLine,
  redo,
  pushUndoSnapshot,
} from './operators';
import { syncRegisters } from './registers';
import { handleMiniMoveNormal } from './miniMoveEngine';
import { enterTerminalInsertMode } from './terminalEngine';
import { findParagraphTarget } from './advancedMotions';
import { recordJump } from './marks';
import { yankFoldOrLine } from './folding';
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
  ParsedPending,
} from './engineHelpers';

// 매크로·`.` 반복과 뷰포트·점프 명령은 별도 파일로 나눴고, 기존 import 경로를 위해 여기서 다시 export 합니다.
export { MAX_MACRO_REPLAY_KEYS, withDotRepeatCount, handleNormalMacroAndDot } from './normalMacroAndDot';
export { handleNormalViewportAndNavOps } from './normalViewportNav';

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
