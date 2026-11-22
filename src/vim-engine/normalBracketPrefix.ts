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
import { jumpGitHunk } from './gitSignsEngine';
import { jumpToNextSpellError, jumpToPrevSpellError } from './spellEngine';
import { jumpToFoldEdge } from './folding';
import { findAdjacentLowercaseMark, recordJump, executeMarkOperator } from './marks';
import { getWordAtCursor } from './search';
import { clampCursor } from './cursor';
import { syncRegisters } from './registers';
import { msg } from './messages';
import {
  ringBell,
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
    if (key === 'h') {
      const dir = bracket === ']' ? 'next' : 'prev';
      return {
        handled: true,
        state: jumpGitHunk(state, dir, bCount),
      };
    }
    if ((bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'))) {
      return { handled: true, state: moveByExtraMotion(state, `${bracket}${key}`, bCount) };
    }
    if (
      key === '[' ||
      key === ']' ||
      key === 'm' ||
      key === 'M' ||
      key === 'f' ||
      key === 'F' ||
      key === '/' ||
      key === '*'
    ) {
      return { handled: true, state: moveByExtraMotion(state, `${bracket}${key}`, bCount) };
    }
    if (key === "'" || key === '`') {
      const found = findAdjacentLowercaseMark(
        state,
        bracket === ']' ? 'next' : 'prev',
        key === "'",
        bCount
      );
      if (!found) {
        return { handled: true, state: ringBell(state) };
      }
      const withJump = recordJump(state);
      return {
        handled: true,
        state: {
          ...withJump,
          cursor: clampCursor(withJump.lines, found.target, 'NORMAL'),
          pendingKeys: undefined,
        },
      };
    }
    if (key === 'i' || key === 'I') {
      const curLine = state.lines[state.cursor.line] ?? '';
      const word = getWordAtCursor(curLine, state.cursor.col);
      if (!word) {
        return {
          handled: true,
          state: {
            ...ringBell(state),
            commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
          },
        };
      }
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRe = new RegExp(`\\b${escaped}\\b`);
      const startRow = bracket === ']' ? state.cursor.line + 1 : 0;
      const matches: Array<{ line: number; text: string }> = [];
      for (let r = startRow; r < state.lines.length; r++) {
        if (wordRe.test(state.lines[r] ?? '')) {
          matches.push({ line: r, text: state.lines[r] ?? '' });
        }
      }
      if (matches.length === 0) {
        return {
          handled: true,
          state: {
            ...ringBell(state),
            commandMessage: msg('E387: 현재 줄에 일치 항목이 있습니다'),
          },
        };
      }
      if (key === 'I') {
        const formatted = matches
          .map((m) => `${String(m.line + 1).padStart(3, ' ')}: ${m.text}`)
          .join('\n');
        return {
          handled: true,
          state: {
            ...state,
            pendingKeys: undefined,
            commandMessage: formatted,
          },
        };
      }
      const targetMatch = matches[Math.min(bCount - 1, matches.length - 1)];
      return {
        handled: true,
        state: {
          ...state,
          pendingKeys: undefined,
          commandMessage: targetMatch.text,
        },
      };
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

  // 연산자 + 괄호/섹션/메서드/주석/마크 모션 (d[(, c]}, y[{, d]], c[[, d]m, y[M, d]/, d]' ...)
  const opBracketMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?([\]\[])$/);
  if (opBracketMatch) {
    const bracket = opBracketMatch[4];
    const op = opBracketMatch[2] as 'd' | 'c' | 'y';
    const total = (opBracketMatch[1] ? parseInt(opBracketMatch[1], 10) : 1) * (opBracketMatch[3] ? parseInt(opBracketMatch[3], 10) : 1);
    if (key === "'" || key === '`') {
      const found = findAdjacentLowercaseMark(
        state,
        bracket === ']' ? 'next' : 'prev',
        key === "'",
        total
      );
      if (!found) {
        return { handled: true, state: ringBell(state) };
      }
      const res = executeMarkOperator(state, op, found.markChar, key === "'");
      const synced = syncRegisters(state, res, op === 'y');
      const opKeys = total > 1 ? [String(total), op, bracket, key] : [op, bracket, key];
      if (op === 'c') {
        return {
          handled: true,
          state: { ...synced, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys },
        };
      }
      if (op === 'd') {
        return {
          handled: true,
          state: { ...synced, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys },
        };
      }
      return { handled: true, state: synced };
    }
    const isPaired = (bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'));
    const isSection = key === '[' || key === ']';
    const isMethod = key === 'm' || key === 'M' || key === 'f' || key === 'F';
    const isComment = key === '/' || key === '*';
    if (isPaired || isSection || isMethod || isComment) {
      return {
        handled: true,
        state: applyOperatorMotion(state, op, `${bracket}${key}`, { operator: op, count1: total > 1 ? total : undefined, totalCount: total }, isReplayingDot),
      };
    }
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}
