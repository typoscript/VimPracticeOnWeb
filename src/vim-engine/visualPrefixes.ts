import { VimEditorState } from './types';
import { getMaxCol } from './cursor';
import { syncRegisters, putFromRegister } from './registers';
import { nextTab, prevTab } from './tabEngine';
import { deleteVisualSelection } from './visual';
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
  if (key === '0' || key === '$' || key === 'm' || key === 'M') {
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
    if (key === 'e' || key === 'E' || key === '_') {
      return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
    }
    if (key === 'o') {
      return moveByExtraMotion(state, 'go', parsed.count1 ?? 1);
    }
    if (key === '?') {
      return changeCaseVisual(state, 'rot13');
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
      const gKeys = joinCount > 1 ? [String(joinCount), 'g', 'J'] : ['g', 'J'];
      return {
        ...joined,
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
  const visualObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ia])$/);
  if (visualObjMatch) {
    const count = visualObjMatch[1] ? parseInt(visualObjMatch[1], 10) : 1;
    const modifier = visualObjMatch[2] as 'i' | 'a';
    if (key === 'i' || key === 'I') {
      return executeIndentObjectOperator(state, 'v', `${modifier}${key}` as IndentObjectType, count);
    }
    if (key === 'p') {
      return executeParagraphObjectOperator(state, 'v', `${modifier}p` as ParagraphObjectType, count) ?? ringBell(state);
    }
    const validTargets = ['w', 'W', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't', 's', '<', '>'];
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

  if (key === 'i' || key === 'a') {
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
    const isMethod = key === 'm' || key === 'M';
    if (isPaired || isSection || isMethod) {
      return moveByExtraMotion(state, `${bracket}${key}`, count);
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
