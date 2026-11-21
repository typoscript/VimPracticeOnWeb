import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import {
  nextBuffer,
  prevBuffer,
  firstBuffer,
  lastBuffer,
} from './bufferEngine';
import { nextQuickfix, prevQuickfix, firstQuickfix, lastQuickfix } from './quickfixEngine';
import {
  nextLocationList,
  prevLocationList,
  firstLocationList,
  lastLocationList,
} from './locationListEngine';
import { nextArg, prevArg, firstArg, lastArg } from './argEngine';
import { jumpToDiagnostic } from './lspEngine';
import { jumpDiffHunk } from './diffEngine';
import { jumpToNextSpellError, jumpToPrevSpellError } from './spellEngine';
import { jumpToFoldEdge } from './folding';
import {
  moveByExtraMotion,
  executePutVariant,
  applyOperatorMotion,
} from './engineHelpers';

export interface BracketPrefixResult {
  handled: boolean;
  state: VimEditorState;
}

/**
 * NORMAL 모드 대괄호([ / ]) 접두 탐색 및 연산자 결합(]c/[c, [(/{, [[/]], ]m/[m, ]d/[d, ]q/[q, ]l/[l, ]b/[b, ]a/[a, ]<Space>, ]s/[s, ]z/[z, ]p/[p, d[(, d]] 등)을 처리합니다.
 */
export function handleNormalBracketPrefix(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): BracketPrefixResult | null {
  const bracketMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([\]\[])$/);
  if (bracketMatch) {
    const bCount = bracketMatch[1] ? parseInt(bracketMatch[1], 10) : 1;
    const bracket = bracketMatch[2];
    if (key === 'c') {
      const dir = bracket === ']' ? 'next' : 'prev';
      return {
        handled: true,
        state: {
          ...jumpDiffHunk(state, dir, bCount),
          pendingKeys: undefined,
        },
      };
    }
    if ((bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'))) {
      return { handled: true, state: moveByExtraMotion(state, `${bracket}${key}`, bCount) };
    }
    if (key === '[' || key === ']' || key === 'm' || key === 'M' || key === 'f' || key === 'F') {
      return { handled: true, state: moveByExtraMotion(state, `${bracket}${key}`, bCount) };
    }
    if (key === 'd' || key === 'D') {
      const dir = key === 'D'
        ? (bracket === ']' ? 'last' : 'first')
        : (bracket === ']' ? 'next' : 'prev');
      return { handled: true, state: jumpToDiagnostic(state, dir, bCount) };
    }
    if (key === 'q' || key === 'Q') {
      const res =
        key === 'Q'
          ? bracket === ']'
            ? lastQuickfix(state)
            : firstQuickfix(state)
          : bracket === ']'
            ? nextQuickfix(state, bCount)
            : prevQuickfix(state, bCount);
      return { handled: true, state: { ...res, pendingKeys: undefined } };
    }
    if (key === 'l' || key === 'L') {
      const res =
        key === 'L'
          ? bracket === ']'
            ? lastLocationList(state)
            : firstLocationList(state)
          : bracket === ']'
            ? nextLocationList(state, bCount)
            : prevLocationList(state, bCount);
      return { handled: true, state: { ...res, pendingKeys: undefined } };
    }
    if (key === 'b' || key === 'B') {
      const res =
        key === 'B'
          ? bracket === ']'
            ? lastBuffer(state)
            : firstBuffer(state)
          : bracket === ']'
            ? nextBuffer(state, bCount)
            : prevBuffer(state, bCount);
      return { handled: true, state: { ...res, pendingKeys: undefined } };
    }
    if (key === 'a' || key === 'A') {
      const res =
        key === 'A'
          ? bracket === ']'
            ? lastArg(state)
            : firstArg(state)
          : bracket === ']'
            ? nextArg(state, bCount)
            : prevArg(state, bCount);
      return { handled: true, state: { ...res, pendingKeys: undefined } };
    }
    if (key === ' ' || key === 'Space') {
      const stateWithUndo = pushUndoSnapshot(state);
      const insertAt = bracket === '[' ? state.cursor.line : state.cursor.line + 1;
      const blanks = Array.from({ length: bCount }, () => '');
      const nextLines = [
        ...state.lines.slice(0, insertAt),
        ...blanks,
        ...state.lines.slice(insertAt),
      ];
      const nextLine = bracket === '[' ? state.cursor.line + bCount : state.cursor.line;
      const spaceKeys = bCount > 1 ? [String(bCount), bracket, ' '] : [bracket, ' '];
      return {
        handled: true,
        state: {
          ...stateWithUndo,
          lines: nextLines,
          cursor: { line: nextLine, col: state.cursor.col },
          pendingKeys: undefined,
          lastChangeKeys: isReplayingDot ? state.lastChangeKeys : spaceKeys,
        },
      };
    }
    if (key === 's' || key === 'S') {
      const res = bracket === ']' ? jumpToNextSpellError(state) : jumpToPrevSpellError(state);
      return {
        handled: true,
        state: {
          ...res,
          pendingKeys: undefined,
        },
      };
    }
    if (key === 'z') {
      return { handled: true, state: jumpToFoldEdge(state, bracket === '[' ? 'start' : 'end') };
    }
    if (key === 'p' || key === 'P') {
      return {
        handled: true,
        state: executePutVariant(
          state,
          key === 'P' || bracket === '[',
          bCount,
          { adjustIndent: true },
          [bracket, key],
          isReplayingDot
        ),
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 연산자 + 괄호/섹션/메서드 모션 (d[(, c]}, y[{, d]], c[[, d]m, y[M ...)
  const opBracketMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?([\]\[])$/);
  if (opBracketMatch) {
    const bracket = opBracketMatch[4];
    const isPaired = (bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'));
    const isSection = key === '[' || key === ']';
    const isMethod = key === 'm' || key === 'M' || key === 'f' || key === 'F';
    if (isPaired || isSection || isMethod) {
      const op = opBracketMatch[2] as 'd' | 'c' | 'y';
      const total = (opBracketMatch[1] ? parseInt(opBracketMatch[1], 10) : 1) * (opBracketMatch[3] ? parseInt(opBracketMatch[3], 10) : 1);
      return {
        handled: true,
        state: applyOperatorMotion(state, op, `${bracket}${key}`, { operator: op, count1: total > 1 ? total : undefined, totalCount: total }, isReplayingDot),
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}
