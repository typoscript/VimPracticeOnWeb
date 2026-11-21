import { VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol, getMaxCol } from './cursor';
import { getOptions } from './setOptionsCore';
import { moveToFirstLine } from './motions';
import { pushUndoSnapshot } from './operators';
import { syncRegisters } from './registers';
import { nextTab, prevTab } from './tabEngine';
import { travelUndoTime } from './undoTreeEngine';
import { tjumpTag } from './tagEngine';
import { recordJump } from './marks';
import { executeGCtrlG } from './visualUtilities';
import {
  goToDeclaration,
  goToLastInsert,
  reselectLastVisual,
  traverseChangeList,
} from './advancedMotions';
import { executeLinewiseObjectOperator } from './textObjects';
import { computeByteOffsetTarget } from './extraMotions';
import { toggleCommentRange, getCommentTextObjectRange } from './commentEngine';
import { formatRange } from './formatEngine';
import { gotoFileUnderCursor } from './gotoFileEngine';
import { getWordAtCursor } from './search';
import { executeCommandLine } from './commandLine';
import { openLspDocumentSymbols } from './lspRefactorEngine';
import { openFlashJump } from './flashJumpEngine';
import { joinLines, executeCaseMotion } from './lineOperators';
import { msg } from './messages';
import { executeGn, executeWordSearch } from './searchMode';
import {
  ringBell,
  moveByExtraMotion,
  findShiftRange,
  describeCharAt,
  describeCharUtf8Bytes,
  evaluateMotionWithCount,
  executePutVariant,
  applyOperatorMotion,
  RunHandleKeyFn,
} from './engineHelpers';

export interface PrefixStepResult {
  handled: boolean;
  state: VimEditorState;
}

/**
 * 연산자 + g 대기 상태(cgn/dgn/ygn, dge/dg_/dgj/dgg/dgc 등)를 처리합니다.
 */
export function handleNormalOpGPrefix(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): PrefixStepResult | null {
  const gnMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])?g$/);
  if (gnMatch && (key === 'n' || key === 'N')) {
    const op = gnMatch[2];
    return { handled: true, state: executeGn(state, key === 'n', op, isReplayingDot) };
  }

  const gMotionOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/);
  if (
    gMotionOpMatch &&
    (key === 'e' ||
      key === 'E' ||
      key === '_' ||
      key === 'j' ||
      key === 'k' ||
      key === '0' ||
      key === '$' ||
      key === 'm' ||
      key === 'M' ||
      key === 'o')
  ) {
    const op = gMotionOpMatch[2] as 'd' | 'c' | 'y';
    const total = (gMotionOpMatch[1] ? parseInt(gMotionOpMatch[1], 10) : 1) * (gMotionOpMatch[3] ? parseInt(gMotionOpMatch[3], 10) : 1);
    return {
      handled: true,
      state: applyOperatorMotion(state, op, `g${key}`, { operator: op, count1: total > 1 ? total : undefined, totalCount: total }, isReplayingDot),
    };
  }

  const ggOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/);
  if (ggOpMatch && key === 'g') {
    const op = ggOpMatch[2] as 'd' | 'c' | 'y';
    const hasCount = !!(ggOpMatch[1] || ggOpMatch[3]);
    const lineCount = parseInt(ggOpMatch[1] ?? '1', 10) * parseInt(ggOpMatch[3] ?? '1', 10);
    return {
      handled: true,
      state: applyOperatorMotion(state, op, 'gg', { count1: hasCount ? lineCount : undefined, operator: op, totalCount: lineCount }, isReplayingDot),
    };
  }

  const gcTextObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdyv])([1-9][0-9]*)?g$/);
  if (gcTextObjMatch && key === 'c') {
    const op = gcTextObjMatch[2] as 'd' | 'c' | 'y' | 'v';
    const range = getCommentTextObjectRange(state);
    if (!range) return { handled: true, state: ringBell(state) };
    const res = executeLinewiseObjectOperator(state, op, range);
    const synced = syncRegisters(state, res, op === 'y');
    const opKeys = [op, 'g', 'c'];
    if (op === 'c') {
      return { handled: true, state: { ...synced, currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys } };
    }
    if (op === 'd') {
      return { handled: true, state: { ...synced, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys } };
    }
    return { handled: true, state: synced };
  }

  const flashOpMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/);
  if (flashOpMatch && key === 's') {
    const op = flashOpMatch[2] as 'd' | 'c' | 'y';
    return { handled: true, state: openFlashJump(state, { operator: op }) };
  }

  if (state.pendingKeys?.match(/^([1-9][0-9]*)?([cdy])([1-9][0-9]*)?g$/)) {
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  return null;
}

/**
 * gc{motion} / gq{motion} / gw{motion} 과 gu / gU / g~ / g? 대소문자·ROT13 연산자를 처리합니다.
 */
export function handleNormalCommentFormatOrCaseG(
  state: VimEditorState,
  key: string,
  parsedOperator: string | undefined,
  parsedTotalCount: number,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): VimEditorState | null {
  const gcMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?g([cqw])([1-9][0-9]*)?([ia][nl]|[iagfFtT'`\[\]])?$/);
  if (gcMatch) {
    const [, c1, opChar, c2, prefix] = gcMatch;
    const applyLines = (s: number, e: number): VimEditorState =>
      opChar === 'c' ? toggleCommentRange(state, s, e) : formatRange(state, s, e, opChar === 'w');
    const isLineForm =
      (!prefix && !c2 && key === opChar) || (opChar !== 'c' && prefix === 'g' && !c2 && key === opChar);
    if (isLineForm) {
      const count = c1 ? parseInt(c1, 10) : 1;
      const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
      const res = applyLines(state.cursor.line, endLine);
      if (res.bell) return res;
      const lKeys = [...(count > 1 ? String(count).split('') : []), 'g', opChar, opChar];
      return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
    }
    if (!prefix && (/^[1-9]$/.test(key) || (key === '0' && c2))) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    if (!prefix && "iagfFtT'`[]".includes(key)) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    if ((prefix === 'i' || prefix === 'a') && (key === 'n' || key === 'l')) {
      return { ...state, pendingKeys: state.pendingKeys + key };
    }
    const count = (c1 ? parseInt(c1, 10) : 1) * (c2 ? parseInt(c2, 10) : 1);
    const range = findShiftRange(state, prefix ? [...prefix.split(''), key] : [key], count, runHandleKey);
    if (!range) return ringBell(state);
    const res = applyLines(range.startLine, range.endLine);
    if (res.bell) return res;
    const keys = [...(state.pendingKeys ?? '').split(''), key];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : keys };
  }

  const caseOpG = state.pendingKeys?.match(/^([1-9][0-9]*)?(g[uU~?])g$/);
  if (caseOpG) {
    const op = caseOpG[2] as 'gu' | 'gU' | 'g~' | 'g?';
    const count = caseOpG[1] ? parseInt(caseOpG[1], 10) : 1;
    if (key === op[1] || key === 'g') {
      const motionKey = key === 'g' ? 'gg' : key;
      const res = executeCaseMotion({ ...state, pendingKeys: undefined }, op, motionKey, count);
      const opKeys = [...(count > 1 ? [String(count)] : []), op, 'g', key];
      return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys, pendingKeys: undefined };
    }
    return { ...state, pendingKeys: undefined };
  }

  if (parsedOperator === 'gu' || parsedOperator === 'gU' || parsedOperator === 'g~' || parsedOperator === 'g?') {
    const op = parsedOperator as 'gu' | 'gU' | 'g~' | 'g?';
    if (key === 'i' || key === 'a') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    if (key === 'g' && !state.pendingKeys?.endsWith('g')) {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    const motionKey = state.pendingKeys?.endsWith('g') ? (key === 'g' ? 'gg' : key) : key;
    const res = executeCaseMotion(state, op, motionKey, parsedTotalCount);
    const opKeys = parsedTotalCount > 1 ? [String(parsedTotalCount), op, motionKey] : [op, motionKey];
    return {
      ...res,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
      pendingKeys: undefined,
    };
  }

  return null;
}

/**
 * NORMAL 모드 g 접두 단일/2타 명령 (ga, g8, ge, gE, g_, g&, g-, g+, gg, gd, gD, g*, g#, gf, gF, gp, gP, gi, gI, gj, gk, g0, g$, gm, gM, gv, g Ctrl-g, g;, g,, gJ, gt, gT, g], gu/gU/g~/g?/gc/gq/gw) 을 처리합니다.
 */
export function handleNormalGOperator(
  state: VimEditorState,
  key: string,
  parsedCount1: number | undefined,
  parsedTotalCount: number,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): PrefixStepResult {
  const currentLine = state.lines[state.cursor.line] ?? '';

  if (key === 'a') {
    return { handled: true, state: { ...state, pendingKeys: undefined, commandMessage: describeCharAt(currentLine, state.cursor.col) } };
  }
  if (key === '<') {
    const lastOut =
      state.lastCommandOutput ??
      (state.messageHistory && state.messageHistory.length > 0
        ? state.messageHistory[state.messageHistory.length - 1]
        : undefined);
    return {
      handled: true,
      state: {
        ...state,
        pendingKeys: undefined,
        commandMessage: lastOut ?? msg('메시지 기록이 비어 있습니다'),
      },
    };
  }
  if (key === '8') {
    return { handled: true, state: { ...state, pendingKeys: undefined, commandMessage: describeCharUtf8Bytes(currentLine, state.cursor.col) } };
  }
  if (key === 'e' || key === 'E' || key === '_') {
    return { handled: true, state: moveByExtraMotion(state, `g${key}`, parsedTotalCount) };
  }
  if (key === '&') {
    const res = executeCommandLine({ ...state, pendingKeys: undefined }, '%&&', runHandleKey);
    return { handled: true, state: res.bell ? res : { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['g', '&'] } };
  }
  if (key === '-') {
    return { handled: true, state: travelUndoTime(state, 'older', parsedTotalCount) };
  }
  if (key === '+') {
    return { handled: true, state: travelUndoTime(state, 'newer', parsedTotalCount) };
  }
  if (key === 'g') {
    const stateWithJump = recordJump(state);
    const useSol = Boolean(getOptions(state).startofline);
    if (parsedCount1 !== undefined) {
      const targetLine = Math.max(0, Math.min(parsedCount1 - 1, state.lines.length - 1));
      const maxCol = getMaxCol(state.lines[targetLine], 'NORMAL');
      const targetCol = useSol
        ? getFirstNonBlankCol(state.lines[targetLine])
        : Math.min(state.cursor.col, maxCol);
      return {
        handled: true,
        state: {
          ...stateWithJump,
          cursor: { line: targetLine, col: targetCol },
          pendingKeys: undefined,
        },
      };
    }
    const nextCursor = moveToFirstLine(state.lines, state.cursor);
    const finalCursor = useSol
      ? { line: nextCursor.line, col: getFirstNonBlankCol(state.lines[nextCursor.line]) }
      : clampCursor(state.lines, nextCursor, 'NORMAL');
    return {
      handled: true,
      state: {
        ...stateWithJump,
        cursor: finalCursor,
        pendingKeys: undefined,
      },
    };
  }
  if (key === 'd') {
    return { handled: true, state: goToDeclaration(state, 'local') };
  }
  if (key === 'D') {
    return { handled: true, state: goToDeclaration(state, 'global') };
  }
  if (key === '*' || key === '#') {
    return { handled: true, state: executeWordSearch(state, key === '*' ? 'forward' : 'backward', false) };
  }
  if (key === 'f') {
    return { handled: true, state: gotoFileUnderCursor(state, { withLineNumber: false }) };
  }
  if (key === 'F') {
    return { handled: true, state: gotoFileUnderCursor(state, { withLineNumber: true }) };
  }
  if (key === 'p' || key === 'P') {
    return {
      handled: true,
      state: executePutVariant(
        state,
        key === 'P',
        parsedTotalCount,
        { leaveCursorAfter: true },
        ['g', key],
        isReplayingDot
      ),
    };
  }
  if (key === 'i') {
    return { handled: true, state: goToLastInsert(state) };
  }
  if (key === 'I') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      handled: true,
      state: {
        ...stateWithSnapshot,
        mode: 'INSERT',
        cursor: { line: state.cursor.line, col: 0 },
        pendingKeys: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['g', 'I'],
      },
    };
  }
  if (key === 'j' || key === 'k') {
    const target = evaluateMotionWithCount(state.lines, state.cursor, key, parsedTotalCount, state.folds);
    if (!target || target.line === state.cursor.line) return { handled: true, state: ringBell(state) };
    return {
      handled: true,
      state: {
        ...state,
        cursor: target,
        stickyDollar: false,
        pendingKeys: undefined,
      },
    };
  }
  if (key === '0' || key === '$' || key === 'm' || key === 'M') {
    const moved = moveByExtraMotion(state, `g${key}`, parsedTotalCount);
    return { handled: true, state: key === '$' ? { ...moved, stickyDollar: true } : moved };
  }
  if (key === 'O') {
    return { handled: true, state: openLspDocumentSymbols(state) };
  }
  if (key === 'o') {
    const target = computeByteOffsetTarget(state.lines, parsedCount1 ?? 1);
    return {
      handled: true,
      state: {
        ...recordJump(state),
        cursor: clampCursor(state.lines, target, 'NORMAL'),
        stickyDollar: false,
        pendingKeys: undefined,
      },
    };
  }
  if (key === 'v') {
    return { handled: true, state: reselectLastVisual(state) };
  }
  if (key === 'V') {
    return {
      handled: true,
      state: {
        ...state,
        pendingKeys: undefined,
        selectVisualOneShot: undefined,
      },
    };
  }
  if (key === 'h') {
    return {
      handled: true,
      state: {
        ...state,
        mode: 'SELECT',
        visualAnchor: { ...state.cursor },
        pendingKeys: undefined,
      },
    };
  }
  if (key === 'H') {
    return {
      handled: true,
      state: {
        ...state,
        mode: 'SELECT_LINE',
        visualAnchor: { ...state.cursor },
        pendingKeys: undefined,
      },
    };
  }
  if (key === 'Ctrl-h' || key === 'Ctrl+h' || key === 'ctrl-h' || key === '<C-h>') {
    return {
      handled: true,
      state: {
        ...state,
        mode: 'SELECT_BLOCK',
        visualAnchor: { ...state.cursor },
        pendingKeys: undefined,
      },
    };
  }
  if (
    key === 'Ctrl-g' ||
    key === 'Ctrl+g' ||
    key === 'ctrl-g' ||
    key === '<C-g>'
  ) {
    return { handled: true, state: executeGCtrlG(state) };
  }
  if (key === ';') {
    return { handled: true, state: traverseChangeList(state, 'prev', parsedTotalCount) };
  }
  if (key === ',') {
    return { handled: true, state: traverseChangeList(state, 'next', parsedTotalCount) };
  }
  if (key === 'J') {
    if (state.cursor.line >= state.lines.length - 1) return { handled: true, state: ringBell(state) };
    const res = joinLines(state, parsedTotalCount, false);
    const lKeys = parsedTotalCount > 1 ? [String(parsedTotalCount), 'g', 'J'] : ['g', 'J'];
    return {
      handled: true,
      state: {
        ...res,
        lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys,
      },
    };
  }
  if (key === 't') {
    return {
      handled: true,
      state: {
        ...nextTab(state, parsedCount1),
        pendingKeys: undefined,
      },
    };
  }
  if (key === 'T') {
    return {
      handled: true,
      state: {
        ...prevTab(state, parsedCount1 ?? 1),
        pendingKeys: undefined,
      },
    };
  }
  if (key === ']' || key === 'Ctrl-]' || key === 'Ctrl+]') {
    const word = getWordAtCursor(currentLine, state.cursor.col);
    if (!word) {
      return {
        handled: true,
        state: {
          ...state,
          commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
          pendingKeys: undefined,
        },
      };
    }
    return { handled: true, state: { ...tjumpTag(state, word), pendingKeys: undefined } };
  }
  if (key === 'R') {
    return {
      handled: true,
      state: {
        ...pushUndoSnapshot(state),
        mode: 'REPLACE',
        virtualReplace: true,
        replaceStack: [],
        pendingKeys: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : ['g', 'R'],
      },
    };
  }
  if (key === 'r') {
    return {
      handled: true,
      state: {
        ...state,
        pendingKeys: (parsedCount1 ? String(parsedCount1) : '') + 'gr',
      },
    };
  }
  if (key === 's') {
    return { handled: true, state: openFlashJump(state) };
  }
  if (key === '~' || key === 'u' || key === 'U' || key === '?' || key === 'c' || key === 'q' || key === 'w') {
    return {
      handled: true,
      state: {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      },
    };
  }

  return { handled: false, state: { ...state, pendingKeys: undefined } };
}
