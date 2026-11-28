import { VimEditorState } from './types';
import { getMaxCol } from './cursor';
import { syncRegisters, putFromRegister } from './registers';
import { nextTab, prevTab } from './tabEngine';
import { deleteVisualSelection, failedVisualJoinCursor } from './visual';
import { executeGCtrlG } from './visualUtilities';
import { goToDeclaration, reselectLastVisual, traverseChangeList } from './advancedMotions';
import {
  executeTextObjectOperator,
  TextObjectType,
  executeIndentObjectOperator,
  IndentObjectType,
  executeParagraphObjectOperator,
  ParagraphObjectType,
} from './textObjects';
import { toggleCommentRange } from './commentEngine';
import { formatRange } from './formatEngine';
import { gotoFileUnderCursor } from './gotoFileEngine';
import { handleHorizontalViewportKey } from './viewport';
import { joinLines, changeCaseVisual, modifyNumberVisual } from './lineOperators';
import { createFold } from './folding';
import { executeGn } from './searchMode';
import {
  parsePending,
  ringBell,
  moveByExtraMotion,
  evaluateMotionWithCount,
} from './engineHelpers';
import { jumpGitHunk } from './gitSignsEngine';
import { openFlashJump } from './flashJumpEngine';
import { findAdjacentLowercaseMark } from './marks';

/**
 * Visual 모드 'z' 접두 명령 처리 (수평 스크롤 zh/zl/zH/zL/ze/zs, 수동 폴드 zf)
 */
export function handleVisualZPrefix(
  state: VimEditorState,
  key: string,
  count1?: number
): VimEditorState | null {
  if (state.pendingKeys === 'z') {
    const horiz = handleHorizontalViewportKey(state, key, count1 ?? 1);
    if (horiz) return horiz;
    if (key === 'f') {
      const anchorLine = state.visualAnchor?.line ?? state.cursor.line;
      const startRow = Math.min(anchorLine, state.cursor.line);
      const endRow = Math.max(anchorLine, state.cursor.line);
      const folded = createFold(state, startRow, endRow);
      return {
        ...folded,
        mode: 'NORMAL',
        visualAnchor: undefined,
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }
  if (key === 'z' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'z' };
  }
  return null;
}

/**
 * Visual 모드 'g' 즉각 접두 명령(gn, gt, gj/gk/g0/g$/gm/gM)을 처리합니다. (숫자 입력 이전 단계)
 */
export function handleVisualGImmediate(
  state: VimEditorState,
  key: string,
  parsed: ReturnType<typeof parsePending>
): VimEditorState | null {
  if (state.pendingKeys !== 'g') return null;

  if (key === 'n' || key === 'N') {
    return executeGn(state, key === 'n');
  }
  if (key === 't') {
    return { ...nextTab(state), pendingKeys: undefined };
  }
  if (key === 'T') {
    return { ...prevTab(state), pendingKeys: undefined };
  }
  if (key === 'j' || key === 'k') {
    const target = evaluateMotionWithCount(state.lines, state.cursor, key, parsed.totalCount, state.folds);
    if (!target || target.line === state.cursor.line) return ringBell(state);
    return {
      ...state,
      cursor: target,
      pendingKeys: undefined,
    };
  }
  if (key === '0' || key === '^' || key === '$' || key === 'm' || key === 'M') {
    return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
  }
  return null;
}

/**
 * Visual 모드 숫자 카운트 처리 이후의 'g' 서브명령(gg, gv, ge/gE/g_, g?, gc, gq/gw, gf/gF, gd, gp/gP, g;/g,, g<C-a>/<C-x>/<C-g>, gJ) 처리
 */
export function handleVisualGSubcommand(
  state: VimEditorState,
  key: string,
  parsed: ReturnType<typeof parsePending>
): VimEditorState | null {
  if (state.pendingKeys?.endsWith('g') || parsed.operator === 'g') {
    if (key === '0' || key === '^' || key === '$' || key === 'm' || key === 'M') {
      return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
    }
    if (key === 'g') {
      const targetLine = parsed.count1 !== undefined
        ? Math.max(0, Math.min(parsed.count1 - 1, state.lines.length - 1))
        : 0;
      return {
        ...state,
        cursor: { line: targetLine, col: Math.min(state.cursor.col, getMaxCol(state.lines[targetLine], 'VISUAL')) },
        pendingKeys: undefined,
      };
    }
    if (key === 'v') {
      return reselectLastVisual(state);
    }
    if (key === 'V') {
      return {
        ...state,
        pendingKeys: undefined,
        selectVisualOneShot: undefined,
      };
    }
    if (key === 'e' || key === 'E' || key === '_') {
      return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
    }
    if (key === 'o') {
      return moveByExtraMotion(state, 'go', parsed.count1 ?? 1);
    }
    if (key === '?') {
      return changeCaseVisual(state, 'rot13');
    }
    // 비주얼 g~ / gu / gU 는 ~ / u / U 와 같은 연산자입니다
    if (key === '~' || key === 'u' || key === 'U') {
      return changeCaseVisual(state, key === '~' ? 'toggle' : key === 'u' ? 'lower' : 'upper');
    }
    if (key === 'c') {
      if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      return toggleCommentRange(state, minLine, maxLine);
    }
    if (key === 'q' || key === 'w') {
      if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      return formatRange(state, minLine, maxLine, key === 'w');
    }
    if (key === 'f') {
      return gotoFileUnderCursor(state, { withLineNumber: false });
    }
    if (key === 'F') {
      return gotoFileUnderCursor(state, { withLineNumber: true });
    }
    if (key === 'd') {
      return goToDeclaration(state);
    }
    if (key === 's') {
      return openFlashJump(state, {
        visualMode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
      });
    }
    if (key === 'p' || key === 'P') {
      const snap = state.visualAnchor
        ? {
            mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
            anchor: { ...state.visualAnchor },
            cursor: { ...state.cursor },
          }
        : state.lastVisualSelection;
      const delRes = deleteVisualSelection(state);
      const synced = syncRegisters(state, delRes, false);
      const res = putFromRegister(synced, state.activeRegister, false, 1, { leaveCursorAfter: true });
      return { ...res, lastVisualSelection: snap };
    }
    if (key === ';') {
      return traverseChangeList(state, 'prev', parsed.totalCount);
    }
    if (key === ',') {
      return traverseChangeList(state, 'next', parsed.totalCount);
    }
    if (key === 'Ctrl-a' || key === 'Ctrl+a' || key === 'ctrl-a' || key === '<C-a>') {
      return modifyNumberVisual(state, true, true, parsed.totalCount);
    }
    if (key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x' || key === '<C-x>') {
      return modifyNumberVisual(state, false, true, parsed.totalCount);
    }
    if (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') {
      return executeGCtrlG(state);
    }
    if (key === 'J') {
      if (!state.visualAnchor) {
        return { ...state, mode: 'NORMAL', visualBlockEndOfLine: undefined, pendingKeys: undefined };
      }
      const snap = {
        mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
        anchor: { ...state.visualAnchor },
        cursor: { ...state.cursor },
      };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      const joinCount = Math.max(1, maxLine - minLine);
      const tempState: VimEditorState = {
        ...state,
        cursor: { line: minLine, col: 0 },
        mode: 'NORMAL',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        pendingKeys: undefined,
      };
      const joined = joinLines(tempState, joinCount, false);
      const changed = joined.lines !== state.lines;
      // . 반복은 같은 줄 수로: [count]gJ 의 count 는 합칠 줄 수입니다.
      const gKeys = joinCount > 1 ? [String(joinCount + 1), 'g', 'J'] : ['g', 'J'];
      return {
        ...joined,
        // 합칠 줄이 없어 실패하면(마지막 줄) 커서는 연산 범위 시작에 남습니다 (Vim do_pending_operator).
        cursor: changed ? joined.cursor : failedVisualJoinCursor(state),
        lastVisualSelection: snap,
        lastChangeKeys: changed ? gKeys : state.lastChangeKeys,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  return null;
}

/**
 * Visual 모드 복합 키 표현 (g<Ctrl-a>, g<Ctrl-x>, g<Ctrl-g>) 처리
 */
export function handleVisualDirectGCombo(
  state: VimEditorState,
  key: string,
  totalCount: number
): VimEditorState | null {
  if (key === 'g<Ctrl-a>' || key === 'g<C-a>' || key === 'g Ctrl-a' || key === 'g Ctrl+a') {
    return modifyNumberVisual(state, true, true, totalCount);
  }
  if (key === 'g<Ctrl-x>' || key === 'g<C-x>' || key === 'g Ctrl-x' || key === 'g Ctrl+x') {
    return modifyNumberVisual(state, false, true, totalCount);
  }
  if (key === 'g<Ctrl-g>' || key === 'g<C-g>' || key === 'g Ctrl-g' || key === 'g Ctrl+g') {
    return executeGCtrlG(state);
  }
  return null;
}

/**
 * Visual 모드 텍스트 객체 선택 (i 또는 a 대기 및 대상 처리: iw, aw, i", ii, ip 등)
 */
export function handleVisualTextObject(state: VimEditorState, key: string): VimEditorState | null {
  const visualMiniAiMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ia])([nl])$/);
  if (visualMiniAiMatch) {
    const count = visualMiniAiMatch[1] ? parseInt(visualMiniAiMatch[1], 10) : 1;
    const modifier = visualMiniAiMatch[2] as 'i' | 'a';
    const scope = visualMiniAiMatch[3] as 'n' | 'l';
    const validMiniTargets = ['"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', '<', '>'];
    if (validMiniTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';
      else if (key === '>') targetChar = '<';
      const objType: TextObjectType = `${modifier}${scope}${targetChar}` as TextObjectType;
      return executeTextObjectOperator(state, 'v', objType, count);
    }
    return { ...state, pendingKeys: undefined };
  }

  const visualObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ia])$/);
  if (visualObjMatch) {
    if (key === 'n' || key === 'l') {
      return {
        ...state,
        pendingKeys: (state.pendingKeys ?? '') + key,
      };
    }
    const count = visualObjMatch[1] ? parseInt(visualObjMatch[1], 10) : 1;
    const modifier = visualObjMatch[2] as 'i' | 'a';
    if (key === 'i' || key === 'I') {
      return executeIndentObjectOperator(state, 'v', `${modifier}${key}` as IndentObjectType, count);
    }
    if (key === 'p') {
      // Vim current_par(): 비주얼에서 커서는 마지막 줄의 0열
      return executeParagraphObjectOperator({ ...state, cursor: { ...state.cursor, col: 0 } }, 'v', `${modifier}p` as ParagraphObjectType, count) ?? ringBell(state);
    }
    const validTargets = ['w', 'W', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't', 's', '<', '>', 'f', 'c', 'a'];
    if (validTargets.includes(key)) {
      let targetChar = key;
      if (key === 'b' || key === ')') targetChar = '(';
      else if (key === 'B' || key === '}') targetChar = '{';
      else if (key === ']') targetChar = '[';
      else if (key === '>') targetChar = '<';

      const objType: TextObjectType = `${modifier}${targetChar}` as TextObjectType;
      return executeTextObjectOperator(state, 'v', objType, count);
    }
    return { ...state, pendingKeys: undefined };
  }

  // f/t/F/T·g·[ 처럼 다른 접두 키가 대기 중이면 그 키의 인자입니다 (vfa 의 a 는 찾을 글자).
  if ((key === 'i' || key === 'a') && (!state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys))) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  return null;
}

/**
 * Visual 모드 괄호·섹션·메서드 모션 [( [{ ]) ]} [[ ]] [] ][ ]m [m ]M [M 및 ]p / [p / ]P / [P 처리
 */
export function handleVisualBracketPrefix(state: VimEditorState, key: string): VimEditorState | null {
  const visualBracket = state.pendingKeys?.match(/^([1-9][0-9]*)?([\[\]])$/);
  if (visualBracket) {
    const count = visualBracket[1] ? parseInt(visualBracket[1], 10) : 1;
    const bracket = visualBracket[2];
    const isPaired = (bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'));
    const isSection = key === '[' || key === ']';
    const isMethod = key === 'm' || key === 'M' || key === 'f' || key === 'F';
    const isComment = key === '/' || key === '*';
    if (isPaired || isSection || isMethod || isComment) {
      return moveByExtraMotion(state, `${bracket}${key}`, count);
    }
    if (key === "'" || key === '`') {
      const found = findAdjacentLowercaseMark(
        state,
        bracket === ']' ? 'next' : 'prev',
        key === "'",
        count
      );
      if (!found) return ringBell(state);
      return {
        ...state,
        cursor: found.target,
        pendingKeys: undefined,
      };
    }
    if (key === 'h') {
      return jumpGitHunk(state, bracket === ']' ? 'next' : 'prev', count);
    }
    if (key === 'p' || key === 'P') {
      const snap = state.visualAnchor
        ? {
            mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
            anchor: { ...state.visualAnchor },
            cursor: { ...state.cursor },
          }
        : state.lastVisualSelection;
      const targetClip = putFromRegister(state, state.activeRegister, key === 'P' || bracket === '[', count, {
        adjustIndent: true,
      });
      if (targetClip.lines === state.lines) {
        return { ...state, pendingKeys: undefined, activeRegister: undefined };
      }
      const delRes = deleteVisualSelection(state);
      const synced = syncRegisters(state, delRes, false);
      const restoredRegs = state.activeRegister
        ? synced.registers
        : { ...(synced.registers ?? {}), '"': state.registers?.['"'] ?? { type: 'line', content: '' } };
      const res = putFromRegister(
        { ...synced, registers: restoredRegs, clipboard: state.activeRegister ? synced.clipboard : state.clipboard },
        state.activeRegister,
        key === 'P' || bracket === '[',
        count,
        { adjustIndent: true }
      );
      return { ...res, registers: synced.registers, clipboard: synced.clipboard, lastVisualSelection: snap };
    }
    return { ...state, pendingKeys: undefined };
  }
  if ((key === '[' || key === ']') && (!state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys))) {
    return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
  }
  return null;
}
