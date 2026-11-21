import { VimEditorState } from './types';
import { clampCursor } from './cursor';
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
import { deleteParagraph, changeParagraph, yankParagraph } from './advancedMotions';
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
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (!matchPos) return ringBell(state);

    const op = parsed.operator;
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
    if (!state.lastCharSearch) {
      return { ...state, pendingKeys: undefined };
    }
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
  if (parsed.operator === 'd') {
    if (key === 'o') return { handled: true, state: { ...diffObtain(state), pendingKeys: undefined } };
    if (key === 'p') return { handled: true, state: { ...diffPut(state), pendingKeys: undefined } };
    if (key === 'd') {
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
          cursor:
            key === 'W' && target.line === state.cursor.line && target.col > state.cursor.col
              ? { line: target.line, col: target.col - 1 }
              : target,
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
        handled: true,
        state: {
          ...syncRegisters(state, stateWithDel, false),
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['d', '$'],
        },
      };
    }
    if (key === '}' || key === '{') {
      const res = deleteParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount);
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
      const res = changeToEndOfLine(state);
      return {
        handled: true,
        state: {
          ...syncRegisters(state, res, false),
          currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['c', '$'],
        },
      };
    }
    if (key === '}' || key === '{') {
      const res = changeParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount);
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
      return { handled: true, state: syncRegisters(state, yankFoldOrLine(state, parsed.totalCount), true) };
    }
    if (key === 'w' || key === 'e' || key === 'W' || key === 'E') {
      const target = computeWordTarget(state.lines, state.cursor, key, parsed.totalCount);
      if (key === 'e' || key === 'E' || key === 'W') {
        const stateWithAnchor: VimEditorState = {
          ...state,
          mode: 'VISUAL',
          visualAnchor: state.cursor,
          cursor:
            key === 'W' && target.line === state.cursor.line && target.col > state.cursor.col
              ? { line: target.line, col: target.col - 1 }
              : target,
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
      return {
        handled: true,
        state: syncRegisters(
          state,
          { ...state, clipboard: { type: 'text', content: yanked }, pendingKeys: undefined },
          true
        ),
      };
    }
    if (key === '$') {
      const { line, col } = state.cursor;
      const yanked = (state.lines[line] ?? '').slice(col);
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
          yankParagraph(state, key === '}' ? 'next' : 'prev', parsed.totalCount),
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
