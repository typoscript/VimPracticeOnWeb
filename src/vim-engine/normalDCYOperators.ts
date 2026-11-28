import { VimEditorState } from './types';
import { executeOperatorMotion } from './operatorMotion';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import {
  moveToNextWord,
  moveToNextWORD,
  moveToWordEnd,
  moveToWORDEnd,
} from './motions';
import {
  deleteWord,
  changeWord,
  changeLine,
  changeToEndOfLine,
  pushUndoSnapshot,
  getCharType,
} from './operators';
import { syncRegisters } from './registers';
import { diffObtain, diffPut } from './diffEngine';
import { deleteVisualSelection, yankVisualSelection } from './visual';
import { findMatchingBracket } from './bracketMatch';
import { computePercentJumpTarget } from './extraMotions';
import { executeLinewiseObjectOperator } from './textObjects';
import { moveFind, executeFindOperator } from './findChar';
import { deleteFoldOrLine, yankFoldOrLine } from './folding';
import {
  ringBell,
  getOppositeMotion,
  ParsedPending,
} from './engineHelpers';
import { PrefixStepResult } from './normalGPrefix';

function computeWordTarget(
  lines: string[],
  cursor: VimEditorState['cursor'],
  key: 'w' | 'W' | 'e' | 'E',
  count: number
) {
  let target = cursor;
  for (let i = 0; i < count; i++) {
    if (key === 'w') target = moveToNextWord(lines, target);
    else if (key === 'W') target = moveToNextWORD(lines, target);
    else if (key === 'e') target = moveToWordEnd(lines, target);
    else target = moveToWORDEnd(lines, target);
  }
  return target;
}

/**
 * d/y + e·E·W 의 포함 끝 위치. W 는 배타적 모션이라 한 칸 앞에서 끝나고, 다음 줄로 넘어가면
 * Vim 처럼 지나온 마지막 WORD 가 있던 줄 끝에서 멈춥니다 (dW 가 다음 줄 첫 글자를 지우지 않음).
 */
function wordOperatorEnd(
  state: VimEditorState,
  key: string,
  target: VimEditorState['cursor']
): VimEditorState['cursor'] {
  if (key !== 'W') return target;
  if (target.line === state.cursor.line && target.col > state.cursor.col) return { line: target.line, col: target.col - 1 };
  if (target.line > state.cursor.line) {
    const endLine = target.line - 1;
    const endCol = Math.max(0, (state.lines[endLine] ?? '').length - 1);
    if (endLine > state.cursor.line || endCol >= state.cursor.col) return { line: endLine, col: endCol };
  }
  return target;
}

function buildPendingSubOperator(state: VimEditorState, key: string): VimEditorState | null {
  if (
    key === 'f' || key === 'F' || key === 't' || key === 'T' ||
    key === 'i' || key === 'a' || key === "'" || key === '`' ||
    key === 'g' || key === '[' || key === ']'
  ) {
    return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
  }
  return null;
}

function startSearchOperator(
  state: VimEditorState,
  op: 'd' | 'c' | 'y',
  key: '/' | '?',
  count: number
): VimEditorState {
  return {
    ...state,
    mode: 'SEARCH',
    commandType: key,
    commandBuffer: '',
    searchOperator: {
      op,
      count,
      initialCursor: { ...state.cursor },
    },
    searchOriginCursor: { ...state.cursor },
    searchOriginViewport: state.viewport ? { ...state.viewport } : undefined,
    incsearchStepOffset: 0,
    pendingKeys: undefined,
  };
}

/**
 * 연산자 결합 단축키 (d%/c%/y%/v% 및 d;/c;/y;/d,/c,/y,)를 처리합니다.
 */
/**
 * {count}d$ / c$ / y$ 의 범위: 커서부터 (count-1)줄 아래 줄 끝까지 (Vim nv_dollar).
 * 마지막 줄에서 count 가 2 이상이면 Vim 처럼 실패(null)합니다.
 */
function endOfLineSpan(state: VimEditorState, count: number): { lastLine: number; content: string } | null {
  const { line, col } = state.cursor;
  const maxLine = state.lines.length - 1;
  if (count > 1 && line >= maxLine) return null;
  const lastLine = Math.min(maxLine, line + Math.max(1, count) - 1);
  const first = (state.lines[line] ?? '').slice(col);
  const rest = state.lines.slice(line + 1, lastLine + 1);
  return { lastLine, content: [first, ...rest].join('\n') };
}

/** 마지막 줄에서 {count}dd / {count}yy 는 Vim 처럼 실패합니다 (nv_lineop 의 cursor_down 실패). */
function lineOpFails(state: VimEditorState, count: number): boolean {
  return count > 1 && state.cursor.line >= state.lines.length - 1;
}

export function handleNormalDCYCombineShortcut(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean
): VimEditorState | null {
  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y' || parsed.operator === 'v') &&
    key === '%'
  ) {
    const op = parsed.operator;
    const hasCount = parsed.count1 !== undefined || parsed.count2 !== undefined;
    if (hasCount) {
      const pctTarget = computePercentJumpTarget(state.lines, parsed.totalCount, state.cursor.col);
      if (!pctTarget) return ringBell(state);
      if (op === 'v') {
        return {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor: pctTarget,
          pendingKeys: undefined,
        };
      }
      const range = {
        startLine: Math.min(state.cursor.line, pctTarget.line),
        endLine: Math.max(state.cursor.line, pctTarget.line),
      };
      const res = executeLinewiseObjectOperator(state, op, range);
      const synced = syncRegisters(state, res, op === 'y');
      const opKeys = [op, String(parsed.totalCount), '%'];
      if (op === 'c') {
        return { ...synced, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys };
      }
      if (op === 'd') {
        return { ...synced, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys };
      }
      return synced;
    }

    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (!matchPos) return ringBell(state);

    if (op === 'v') {
      return {
        ...state,
        mode: 'VISUAL',
        visualAnchor: state.cursor,
        cursor: matchPos,
        pendingKeys: undefined,
      };
    }
    const stateWithAnchor: VimEditorState = {
      ...state,
      mode: 'VISUAL',
      visualAnchor: state.cursor,
      cursor: matchPos,
    };
    if (op === 'd') {
      const res = deleteVisualSelection(stateWithAnchor);
      return {
        ...syncRegisters(state, res, false),
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, '%'],
      };
    }
    if (op === 'c') {
      const res = deleteVisualSelection(stateWithAnchor);
      return {
        ...syncRegisters(state, res, false),
        mode: 'INSERT',
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, '%'],
      };
    }
    return syncRegisters(state, yankVisualSelection(stateWithAnchor), true);
  }

  if (
    (parsed.operator === 'd' || parsed.operator === 'c' || parsed.operator === 'y') &&
    (key === ';' || key === ',')
  ) {
    // 이전 f/t/F/T 가 없으면 Vim 처럼 실패합니다.
    if (!state.lastCharSearch) return ringBell(state);
    const op = parsed.operator;
    const motion = key === ';' ? state.lastCharSearch.type : getOppositeMotion(state.lastCharSearch.type);
    if (!moveFind(state.lines, state.cursor, motion, state.lastCharSearch.char, parsed.totalCount)) {
      return ringBell(state);
    }
    const res = executeFindOperator(state, op, motion, state.lastCharSearch.char, parsed.totalCount);
    const synced = syncRegisters(state, res, op === 'y');
    if (op === 'c') {
      return {
        ...synced,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : [op, key],
      };
    }
    if (op === 'd') {
      return {
        ...synced,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : [op, key],
      };
    }
    return synced;
  }

  return null;
}

/**
 * d / c / y 연산자 대기 상태에서 후속 모션·하위 접두 키를 처리합니다.
 */
export function handleNormalDCYOperators(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean
): PrefixStepResult | null {
  // Vim exclusive-linewise 규칙: 빈 줄(마지막 줄 제외)에서 dw / cw / dW / cW 는 그 줄을 줄 단위로 다룹니다
  // (dw = dd, cw = cc). 단, `.` 반복 키는 원래 키(d w)로 남깁니다.
  if (
    (parsed.operator === 'd' || parsed.operator === 'c') &&
    (key === 'w' || key === 'W') &&
    parsed.totalCount === 1 &&
    (state.lines[state.cursor.line] ?? '') === '' &&
    state.cursor.line < state.lines.length - 1
  ) {
    const op = parsed.operator;
    const res = handleNormalDCYOperators(state, op, parsed, true);
    if (res?.handled) {
      const keys = [op, key];
      return {
        handled: true,
        state:
          op === 'd'
            ? { ...res.state, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys }
            : { ...res.state, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : keys },
      };
    }
  }
  if (parsed.operator === 'd') {
    if (key === 'o') return { handled: true, state: { ...diffObtain(state), pendingKeys: undefined } };
    if (key === 'p') return { handled: true, state: { ...diffPut(state), pendingKeys: undefined } };
    if (key === 'd') {
      if (lineOpFails(state, parsed.totalCount)) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      const res = deleteFoldOrLine(state, parsed.totalCount);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'd', 'd'] : ['d', 'd'];
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        },
      };
    }
    if (key === 'w' || key === 'e' || key === 'W' || key === 'E') {
      const target = computeWordTarget(state.lines, state.cursor, key, parsed.totalCount);
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'd', key] : ['d', key];
      if (key === 'e' || key === 'E' || key === 'W') {
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor: wordOperatorEnd(state, key, target),
        };
        const delRes = deleteVisualSelection(stateWithAnchor);
        return {
          handled: true,
          state: {
            ...syncRegisters(state, delRes, false),
            lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
          },
        };
      }
      const res = deleteWord(state, parsed.totalCount);
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        },
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(col);
      const stateWithDel: VimEditorState = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: { line, col: 0 },
        clipboard: { type: 'text', content: cur.slice(0, col) },
        pendingKeys: undefined,
      };
      return {
        handled: true,
        state: {
          ...syncRegisters(state, stateWithDel, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['d', '0'],
        },
      };
    }
    if (key === '$') {
      const span = endOfLineSpan(state, parsed.totalCount);
      if (!span) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      // Vim op_delete: 여러 줄에 걸친 d$ 가 첫 비공백(또는 그 앞)에서 시작하면 줄 단위 삭제가 됩니다.
      if (span.lastLine > line && col <= getFirstNonBlankCol(cur)) {
        const res = deleteFoldOrLine(state, span.lastLine - line + 1);
        const dKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'd', '$'] : ['d', '$'];
        return {
          handled: true,
          state: { ...syncRegisters(state, res, false), lastChangeKeys: isReplayingDot ? state.lastChangeKeys : dKeys },
        };
      }
      const dKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'd', '$'] : ['d', '$'];
      // Vim op_delete: 빈 줄 한 줄에서의 문자 단위 삭제는 아무것도 하지 않습니다 (실행 취소 항목·레지스터 없음).
      if (span.lastLine === line && cur === '') {
        return { handled: true, state: { ...state, pendingKeys: undefined, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : dKeys } };
      }
      const nextLines = [...state.lines.slice(0, line), cur.slice(0, col), ...state.lines.slice(span.lastLine + 1)];
      const stateWithDel: VimEditorState = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: clampCursor(nextLines, { line, col }, 'NORMAL'),
        clipboard: { type: 'text', content: span.content },
        pendingKeys: undefined,
      };
      return {
        handled: true,
        state: {
          ...syncRegisters(state, stateWithDel, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : dKeys,
        },
      };
    }
    if (key === '}' || key === '{') {
      const res = executeOperatorMotion(state, 'd', key, parsed.totalCount) ?? ringBell({ ...state, pendingKeys: undefined });
      const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'd', key] : ['d', key];
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
        },
      };
    }
    const sub = buildPendingSubOperator(state, key);
    if (sub) return { handled: true, state: sub };
    if (key === '/' || key === '?') {
      return { handled: true, state: startSearchOperator(state, 'd', key, parsed.totalCount) };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  if (parsed.operator === 'c') {
    if (key === 'c') {
      if (lineOpFails(state, parsed.totalCount)) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      const res = changeLine(state, parsed.totalCount);
      const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'c', 'c'] : ['c', 'c'];
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        },
      };
    }
    if (key === 'w' || key === 'W' || key === 'e' || key === 'E') {
      const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'c', key] : ['c', key];
      if (key === 'w') {
        const res = changeWord(state, parsed.totalCount);
        return {
          handled: true,
          state: {
            ...syncRegisters(state, res, false),
            currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
          },
        };
      }
      const target = computeWordTarget(
        state.lines,
        state.cursor,
        key === 'W' ? 'E' : key,
        parsed.totalCount
      );
      const stateWithAnchor: VimEditorState = {
        ...state,
        mode: 'VISUAL',
        visualAnchor: state.cursor,
        cursor: target,
      };
      const delRes = deleteVisualSelection(stateWithAnchor);
      return {
        handled: true,
        state: {
          ...syncRegisters(state, delRes, false),
          mode: 'INSERT',
          cursor: { line: state.cursor.line, col: state.cursor.col },
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        },
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const cur = state.lines[line] ?? '';
      const nextLines = [...state.lines];
      nextLines[line] = cur.slice(col);
      const stateWithDel: VimEditorState = {
        ...pushUndoSnapshot(state),
        lines: nextLines,
        cursor: { line, col: 0 },
        mode: 'INSERT',
        clipboard: { type: 'text', content: cur.slice(0, col) },
        pendingKeys: undefined,
      };
      return {
        handled: true,
        state: {
          ...syncRegisters(state, stateWithDel, false),
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['c', '0'],
        },
      };
    }
    if (key === '$') {
      const span = endOfLineSpan(state, parsed.totalCount);
      if (!span) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      const res = changeToEndOfLine(state, parsed.totalCount);
      const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'c', '$'] : ['c', '$'];
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        },
      };
    }
    if (key === '}' || key === '{') {
      const res = executeOperatorMotion(state, 'c', key, parsed.totalCount) ?? ringBell({ ...state, pendingKeys: undefined });
      const cKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'c', key] : ['c', key];
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : cKeys,
        },
      };
    }
    const sub = buildPendingSubOperator(state, key);
    if (sub) return { handled: true, state: sub };
    if (key === '/' || key === '?') {
      return { handled: true, state: startSearchOperator(state, 'c', key, parsed.totalCount) };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  if (parsed.operator === 'y') {
    if (key === 'y') {
      if (lineOpFails(state, parsed.totalCount)) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      return { handled: true, state: syncRegisters(state, yankFoldOrLine(state, parsed.totalCount), true) };
    }
    if (key === 'w' || key === 'e' || key === 'W' || key === 'E') {
      const target = computeWordTarget(state.lines, state.cursor, key, parsed.totalCount);
      if (key === 'e' || key === 'E' || key === 'W') {
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor: wordOperatorEnd(state, key, target),
        };
        return { handled: true, state: syncRegisters(state, yankVisualSelection(stateWithAnchor), true) };
      }
      const { line, col } = state.cursor;
      const curLine = state.lines[line] ?? '';
      if (curLine.length === 0 && line < state.lines.length - 1) {
        return {
          handled: true,
          state: syncRegisters(
            state,
            { ...state, clipboard: { type: 'text', content: '\n' }, pendingKeys: undefined },
            true
          ),
        };
      }
      let endCol = col;
      for (let step = 0; step < parsed.totalCount; step++) {
        if (endCol >= curLine.length) break;
        const startType = getCharType(curLine[endCol]);
        if (startType === 'space') {
          while (endCol < curLine.length && getCharType(curLine[endCol]) === 'space') endCol++;
        } else {
          while (endCol < curLine.length && getCharType(curLine[endCol]) === startType) endCol++;
          while (endCol < curLine.length && getCharType(curLine[endCol]) === 'space') endCol++;
        }
      }
      return {
        handled: true,
        state: syncRegisters(
          state,
          { ...state, clipboard: { type: 'text', content: curLine.slice(col, endCol) }, pendingKeys: undefined },
          true
        ),
      };
    }
    if (key === '0') {
      const { line, col } = state.cursor;
      const yanked = (state.lines[line] ?? '').slice(0, col);
      if (yanked.length === 0) return { handled: true, state: { ...state, pendingKeys: undefined } };
      return {
        handled: true,
        state: syncRegisters(
          state,
          // Vim: 복사 후 커서는 범위의 시작 (y0 → 0열)
          { ...state, cursor: { line, col: 0 }, clipboard: { type: 'text', content: yanked }, pendingKeys: undefined },
          true
        ),
      };
    }
    if (key === '$') {
      const span = endOfLineSpan(state, parsed.totalCount);
      if (!span) return { handled: true, state: ringBell({ ...state, pendingKeys: undefined }) };
      const yanked = span.content;
      return {
        handled: true,
        state: syncRegisters(
          state,
          { ...state, clipboard: { type: 'text', content: yanked }, pendingKeys: undefined },
          true
        ),
      };
    }
    if (key === '}' || key === '{') {
      return {
        handled: true,
        state: syncRegisters(
          state,
          executeOperatorMotion(state, 'y', key, parsed.totalCount) ?? ringBell({ ...state, pendingKeys: undefined }),
          true
        ),
      };
    }
    const sub = buildPendingSubOperator(state, key);
    if (sub) return { handled: true, state: sub };
    if (key === '/' || key === '?') {
      return { handled: true, state: startSearchOperator(state, 'y', key, parsed.totalCount) };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}
