import { VimEditorState, CursorPosition } from './types';
import { getMaxCol } from './cursor';
import { moveToLineStart, moveToLineEnd, moveToFirstNonBlank } from './motions';
import { syncRegisters, putFromRegister } from './registers';
import { alternateBuffer } from './bufferEngine';
import { nextTab, prevTab } from './tabEngine';
import {
  deleteVisualSelection,
  yankVisualSelection,
  startVisualBlockInsert,
  swapVisualCursorAnchor,
  executeGCtrlG,
} from './visual';
import {
  goToDeclaration,
  reselectLastVisual,
  traverseChangeList,
} from './advancedMotions';
import { moveFind } from './findChar';
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
import { findMatches, findNextMatch, findPrevMatch, getWordAtCursor } from './search';
import { starSearchPattern } from './vimRegex';
import { parseKeySequence } from './keymapEngine';
import { executeVisualSurround } from './surroundEngine';
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
import { setMark } from './marks';
import { joinLines, changeCaseVisual, indentVisual, modifyNumberVisual, formatIndentVisual } from './lineOperators';
import { createFold } from './folding';
import { findMatchingBracket } from './bracketMatch';
import { executeGn } from './searchMode';
import {
  parsePending,
  ringBell,
  VISUAL_EXTRA_KEYS,
  moveByExtraMotion,
  isFailedMotion,
  evaluateMotionWithCount,
  handleCtrlWKey,
  getOppositeMotion,
  DispatchKeyFn,
} from './engineHelpers';

/**
 * VISUAL / VISUAL_LINE / VISUAL_BLOCK 모드 키 입력 처리
 */
export function handleVisualModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  macroDepth = 0
): VimEditorState {
  const parsed = parsePending(state.pendingKeys);

  if (key === 'Escape') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
      activeRegister: undefined,
      lastVisualSelection: state.visualAnchor
        ? {
            mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
            anchor: { ...state.visualAnchor },
            cursor: { ...state.cursor },
          }
        : state.lastVisualSelection,
    };
  }

  // Visual 모드 vim-surround (S{char})
  if (state.pendingKeys === 'S') {
    return executeVisualSurround(state, key);
  }
  if (key === 'S' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'S' };
  }

  // Visual 모드 수동 폴드 생성 (zf)
  if (state.pendingKeys === 'z') {
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

  // Visual 모드 내 gn / gN (다음/이전 검색 매치로 선택 영역 확장) 및 gt / gT (탭 전환)
  if (state.pendingKeys === 'g') {
    if (key === 'n' || key === 'N') {
      return executeGn(state, key === 'n');
    }
    if (key === 't') {
      return { ...nextTab(state), pendingKeys: undefined };
    }
    if (key === 'T') {
      return { ...prevTab(state), pendingKeys: undefined };
    }
  }

  // 명명된 레지스터 지정 ("{register})
  if (state.pendingKeys === '"') {
    if (/^[a-zA-Z0-9"+*_\-:.%#\/]$/.test(key)) {
      const reg = key === '""' ? '"' : key;
      return {
        ...state,
        activeRegister: reg,
        pendingKeys: undefined,
      };
    }
    return {
      ...state,
      pendingKeys: undefined,
    };
  }

  // 윈도우 분할 및 포커스 제어 (Ctrl-w)
  if (state.pendingKeys === 'Ctrl-w' || state.pendingKeys === 'Ctrl+w') {
    return handleCtrlWKey(state, key, parsed.count1);
  }

  if (key === '"' && !state.pendingKeys) {
    return {
      ...state,
      pendingKeys: '"',
    };
  }

  if ((key === 'Ctrl-w' || key === 'Ctrl+w') && !state.pendingKeys) {
    return {
      ...state,
      pendingKeys: 'Ctrl-w',
    };
  }

  // 1-0-c. 직전 대안 버퍼 토글 (Ctrl-^ / Ctrl-6)
  if (
    key === 'Ctrl-^' ||
    key === 'Ctrl+^' ||
    key === 'ctrl-^' ||
    key === 'Ctrl-6' ||
    key === 'Ctrl+6' ||
    key === 'ctrl-6'
  ) {
    return alternateBuffer(state);
  }

  // 비주얼 모드 커스텀 키매핑 (예: H -> ^, L -> $, Y -> y, <leader>y -> "+y 등)
  if (!state.pendingKeys && macroDepth === 0) {
    const visualMapped =
      state.userKeymaps?.[`v:${key}`] || state.userKeymaps?.[key];
    if (visualMapped) {
      if (visualMapped === '^') {
        return { ...state, cursor: moveToFirstNonBlank(state.lines, state.cursor) };
      }
      if (visualMapped === '$') {
        return { ...state, cursor: moveToLineEnd(state.lines, state.cursor) };
      }
      const tokens = parseKeySequence(visualMapped, state.leaderKey || ' ');
      let s: VimEditorState = state;
      for (const tok of tokens) {
        s = dispatchKey(s, tok, false, macroDepth + 1);
        if (s.bell) break;
      }
      return s;
    }
  }

  // 숫자 누적 (카운트 모션 지원)
  if (key === '0') {
    if (state.pendingKeys && /[0-9]$/.test(state.pendingKeys)) {
      return {
        ...state,
        pendingKeys: state.pendingKeys + '0',
      };
    }
    // 단독 0: 줄 맨 앞으로 이동
    if (!state.pendingKeys) {
      return {
        ...state,
        cursor: moveToLineStart(state.lines, state.cursor),
      };
    }
  }

  if (/^[1-9]$/.test(key)) {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  // 'g' 접두사 대기 상태 (gg, gv, gd, g;, g,, g Ctrl-a, g Ctrl-x 등)
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
    // ge / gE / g_: VISUAL 선택 영역을 보조 모션으로 확장
    if (key === 'e' || key === 'E' || key === '_') {
      return moveByExtraMotion(state, `g${key}`, parsed.totalCount);
    }
    // g?: 선택 영역 ROT13 변환
    if (key === '?') {
      return changeCaseVisual(state, 'rot13');
    }
    // gc: 선택 영역 주석 토글
    if (key === 'c') {
      if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      return toggleCommentRange(state, minLine, maxLine);
    }
    // gq / gw: 선택 영역 텍스트 포매팅 (textwidth 기준 리플로우)
    if (key === 'q' || key === 'w') {
      if (!state.visualAnchor) return { ...state, mode: 'NORMAL', pendingKeys: undefined };
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      return formatRange(state, minLine, maxLine, key === 'w');
    }
    // gf / gF: 선택된 파일 경로로 이동
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
    if (
      key === 'Ctrl-a' ||
      key === 'Ctrl+a' ||
      key === 'ctrl-a' ||
      key === '<C-a>'
    ) {
      return modifyNumberVisual(state, true, true, parsed.totalCount);
    }
    if (
      key === 'Ctrl-x' ||
      key === 'Ctrl+x' ||
      key === 'ctrl-x' ||
      key === '<C-x>'
    ) {
      return modifyNumberVisual(state, false, true, parsed.totalCount);
    }
    if (
      key === 'Ctrl-g' ||
      key === 'Ctrl+g' ||
      key === 'ctrl-g' ||
      key === '<C-g>'
    ) {
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

  // 복합 키 표현 (g<Ctrl-a>, g<C-a>, g Ctrl-a, g Ctrl+a, g<Ctrl-x>, g<C-x>, g Ctrl-x, g Ctrl+x, g<Ctrl-g>)
  if (
    key === 'g<Ctrl-a>' ||
    key === 'g<C-a>' ||
    key === 'g Ctrl-a' ||
    key === 'g Ctrl+a'
  ) {
    return modifyNumberVisual(state, true, true, parsed.totalCount);
  }
  if (
    key === 'g<Ctrl-x>' ||
    key === 'g<C-x>' ||
    key === 'g Ctrl-x' ||
    key === 'g Ctrl+x'
  ) {
    return modifyNumberVisual(state, false, true, parsed.totalCount);
  }
  if (
    key === 'g<Ctrl-g>' ||
    key === 'g<C-g>' ||
    key === 'g Ctrl-g' ||
    key === 'g Ctrl+g'
  ) {
    return executeGCtrlG(state);
  }

  // VISUAL 모드 직접 Ctrl-a / Ctrl-x (모든 선택 숫자 일괄 증감)
  if (
    key === 'Ctrl-a' ||
    key === 'Ctrl+a' ||
    key === 'ctrl-a' ||
    key === '<C-a>'
  ) {
    return modifyNumberVisual(state, true, false, parsed.totalCount);
  }
  if (
    key === 'Ctrl-x' ||
    key === 'Ctrl+x' ||
    key === 'ctrl-x' ||
    key === '<C-x>'
  ) {
    return modifyNumberVisual(state, false, false, parsed.totalCount);
  }

  if (key === 'gv') {
    return reselectLastVisual(state);
  }

  if (key === 'g') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + 'g',
    };
  }

  // 'v': VISUAL 모드 토글 또는 전환
  if (key === 'v') {
    if (state.mode === 'VISUAL') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL',
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  // 'V': VISUAL_LINE 모드 토글 또는 전환
  if (key === 'V') {
    if (state.mode === 'VISUAL_LINE') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL_LINE',
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  // 'Ctrl+v' / 'Ctrl-v': VISUAL_BLOCK 모드 토글 또는 전환
  if (key === 'Ctrl+v' || key === 'Ctrl-v' || key === 'ctrl-v') {
    if (state.mode === 'VISUAL_BLOCK') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        visualBlockEndOfLine: undefined,
        pendingKeys: undefined,
        lastVisualSelection: state.visualAnchor
          ? {
              mode: state.mode,
              anchor: { ...state.visualAnchor },
              cursor: { ...state.cursor },
            }
          : state.lastVisualSelection,
      };
    }
    return {
      ...state,
      mode: 'VISUAL_BLOCK',
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  // o / O: Visual 및 Visual Block 선택 영역의 커서와 앵커 반전
  if ((key === 'o' || key === 'O') && !state.pendingKeys) {
    return swapVisualCursorAnchor(state, key);
  }

  // VISUAL_BLOCK 전용 모드 삽입 연산자 (I, A, c)
  if (state.mode === 'VISUAL_BLOCK') {
    if (key === 'I') {
      return startVisualBlockInsert(state, 'I');
    }
    if (key === 'A') {
      return startVisualBlockInsert(state, 'A');
    }
    if (key === 'c') {
      return startVisualBlockInsert(state, 'c');
    }
  }

  // ':' 키: VISUAL 선택 영역 범위를 포함하여 커맨드라인 모드 진입 (:'<,'>)
  if (key === ':') {
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: "'<,'>",
      pendingKeys: undefined,
    };
  }

  // '!' 키: VISUAL 선택 영역을 셸 필터링하기 위해 :'<,'>! 로 커맨드라인 진입
  if (key === '!') {
    return {
      ...state,
      mode: 'COMMAND',
      commandType: ':',
      commandBuffer: "'<,'>!",
      pendingKeys: undefined,
    };
  }

  // 화면 뷰포트 기준 이동 및 스크롤 (H, M, L, Ctrl-d, Ctrl-u)
  if (key === 'H') {
    const res = cursorToHigh(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'M') {
    const res = cursorToMiddle(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'L') {
    const res = cursorToLow(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') {
    const res = scrollHalfPageDown(state);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') {
    const res = scrollHalfPageUp(state);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    const res = scrollFullPageDown(state, parsed.totalCount);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-b' || key === 'Ctrl+b' || key === 'ctrl-b') {
    const res = scrollFullPageUp(state, parsed.totalCount);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-e' || key === 'Ctrl+e' || key === 'ctrl-e') {
    const res = scrollLineDown(state, parsed.totalCount);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }
  if (key === 'Ctrl-y' || key === 'Ctrl+y' || key === 'ctrl-y') {
    const res = scrollLineUp(state, parsed.totalCount);
    return { ...state, cursor: res.cursor, viewport: res.viewport, pendingKeys: undefined };
  }

  // '%' 키: 짝이 되는 괄호로 선택 영역 확장
  if (key === '%') {
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      return {
        ...state,
        cursor: matchPos,
        pendingKeys: undefined,
      };
    }
    return ringBell(state);
  }

  // ';' 및 ',' 키: 줄 내 문자 탐색 반복
  if (key === ';') {
    if (state.lastCharSearch) {
      const nextPos = moveFind(
        state.lines,
        state.cursor,
        state.lastCharSearch.type,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) {
        return {
          ...state,
          cursor: nextPos,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }

  if (key === ',') {
    if (state.lastCharSearch) {
      const oppMotion = getOppositeMotion(state.lastCharSearch.type);
      const nextPos = moveFind(
        state.lines,
        state.cursor,
        oppMotion,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) {
        return {
          ...state,
          cursor: nextPos,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }

  // 텍스트 객체 선택 (i 또는 a 대기 상태: iw, aw, i", a", i(, a(, i{, a{ 등)
  const visualObjMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ia])$/);
  if (visualObjMatch) {
    const count = visualObjMatch[1] ? parseInt(visualObjMatch[1], 10) : 1;
    const modifier = visualObjMatch[2] as 'i' | 'a';
    // 인덴트 텍스트 객체 (vii, vai, vaI): 줄 단위 VISUAL LINE 선택
    if (key === 'i' || key === 'I') {
      return executeIndentObjectOperator(state, 'v', `${modifier}${key}` as IndentObjectType, count);
    }
    // 문단 텍스트 객체 (vip, vap): 줄 단위 VISUAL LINE 선택
    if (key === 'p') {
      return executeParagraphObjectOperator(state, 'v', `${modifier}p` as ParagraphObjectType, count) ?? ringBell(state);
    }
    const validTargets = ['w', '"', "'", '`', '(', ')', '[', ']', '{', '}', 'b', 'B', 't', 's', '<', '>'];
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

  // 문자 탐색 대기 상태 (f, F, t, T)
  const visualFindMatch = state.pendingKeys?.match(/^([1-9][0-9]*)?([ftFT])$/);
  if (visualFindMatch) {
    const count = visualFindMatch[1] ? parseInt(visualFindMatch[1], 10) : 1;
    const motion = visualFindMatch[2] as 'f' | 't' | 'F' | 'T';
    if (key.length === 1) {
      const nextPos = moveFind(state.lines, state.cursor, motion, key, count);
      return {
        ...(nextPos ? state : ringBell(state)),
        cursor: nextPos ?? state.cursor,
        lastCharSearch: { type: motion, char: key },
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  if (key === 'f' || key === 'F' || key === 't' || key === 'T') {
    return {
      ...state,
      pendingKeys: (state.pendingKeys ?? '') + key,
    };
  }

  const visualSnapshot = state.visualAnchor
    ? {
        mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
        anchor: { ...state.visualAnchor },
        cursor: { ...state.cursor },
      }
    : state.lastVisualSelection;

  // 선택 영역 삭제 (d / x)
  if (key === 'd' || key === 'x') {
    const res = deleteVisualSelection(state);
    const synced = syncRegisters(state, res, false);
    return { ...synced, lastVisualSelection: visualSnapshot };
  }

  // 선택 영역 복사 (y)
  if (key === 'y') {
    const res = yankVisualSelection(state);
    const synced = syncRegisters(state, res, true);
    return { ...synced, lastVisualSelection: visualSnapshot };
  }

  // 선택 영역 붙여넣기 (p / P)
  if (key === 'p' || key === 'P') {
    const delRes = deleteVisualSelection(state);
    const synced = syncRegisters(state, delRes, false);
    const res = putFromRegister(synced, state.activeRegister, false);
    return { ...res, lastVisualSelection: visualSnapshot };
  }

  // * 및 # : 현재 커서 아래 단어로 검색 후 비주얼 커서 이동
  if (key === '*' || key === '#') {
    const word = getWordAtCursor(state.lines[state.cursor.line] ?? '', state.cursor.col);
    if (word) {
      const query = starSearchPattern(word);
      const matches = findMatches(state.lines, query, state.options);
      const match =
        key === '*'
          ? findNextMatch(matches, state.cursor) ?? matches[0]
          : findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
      if (match) {
        return {
          ...state,
          cursor: { line: match.line, col: match.col },
          lastSearchQuery: query,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }

  // J: 선택 영역 모든 행 이어 붙이기
  if (key === 'J') {
    if (!state.visualAnchor) {
      return { ...state, mode: 'NORMAL', visualBlockEndOfLine: undefined, pendingKeys: undefined };
    }
    const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
    const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
    const joinCount = Math.max(1, maxLine - minLine);
    const tempState: VimEditorState = {
      ...state,
      cursor: { line: minLine, col: 0 },
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
    };
    const joined = joinLines(tempState, joinCount);
    const changed = joined.lines !== state.lines;
    const jKeys = joinCount > 1 ? [String(joinCount), 'J'] : ['J'];
    return {
      ...joined,
      lastVisualSelection: visualSnapshot,
      lastChangeKeys: changed ? jKeys : state.lastChangeKeys,
    };
  }

  // 대소문자 변환 (~, u, U)
  if (key === '~') {
    return changeCaseVisual(state, 'toggle');
  }
  if (key === 'u') {
    return changeCaseVisual(state, 'lower');
  }
  if (key === 'U') {
    return changeCaseVisual(state, 'upper');
  }

  // 들여쓰기 / 내어쓰기 / 정렬 (>, <, =)
  if (key === '>') {
    return indentVisual(state, 'in');
  }
  if (key === '<') {
    return indentVisual(state, 'out');
  }
  if (key === '=') {
    return formatIndentVisual(state);
  }

  // 마크 설정 (m{a-zA-Z})
  if (state.pendingKeys === 'm') {
    if (/^[a-zA-Z]$/.test(key)) {
      return setMark(state, key);
    }
    return { ...state, pendingKeys: undefined };
  }
  if (key === 'm' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'm' };
  }

  // 마크 점프 ('{a-zA-Z}, `{a-zA-Z}) - 선택 영역 확장
  if (state.pendingKeys === "'" || state.pendingKeys === '`') {
    const quote = state.pendingKeys;
    if (/^[a-zA-Z]$/.test(key)) {
      const mark = state.marks?.[key];
      if (mark) {
        const targetLine = Math.max(0, Math.min(mark.row, state.lines.length - 1));
        let targetCursor: CursorPosition;
        if (quote === "'") {
          targetCursor = moveToFirstNonBlank(state.lines, { line: targetLine, col: 0 });
        } else {
          const lineLen = (state.lines[targetLine] ?? '').length;
          targetCursor = { line: targetLine, col: Math.max(0, Math.min(mark.col, Math.max(0, lineLen - 1))) };
        }
        return {
          ...state,
          cursor: targetCursor,
          pendingKeys: undefined,
        };
      }
    }
    return { ...state, pendingKeys: undefined };
  }
  if ((key === "'" || key === '`') && !state.pendingKeys) {
    return { ...state, pendingKeys: key };
  }

  // VISUAL 모드 보조 모션 (, ), +, -, Enter, |
  if (!state.pendingKeys && VISUAL_EXTRA_KEYS.has(key)) {
    return moveByExtraMotion(state, key, parsed.totalCount);
  }

  // VISUAL 모드 괄호 모션 [( [{ ]) ]}
  const visualBracket = state.pendingKeys?.match(/^([1-9][0-9]*)?([\[\]])$/);
  if (visualBracket) {
    const bracket = visualBracket[2];
    const valid = (bracket === '[' && (key === '(' || key === '{')) || (bracket === ']' && (key === ')' || key === '}'));
    if (valid) return moveByExtraMotion(state, `${bracket}${key}`, visualBracket[1] ? parseInt(visualBracket[1], 10) : 1);
    return { ...state, pendingKeys: undefined };
  }
  if ((key === '[' || key === ']') && (!state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys))) {
    return { ...state, pendingKeys: (state.pendingKeys ?? '') + key };
  }

  // VISUAL 모드 내 커서 이동 (모션 평가 및 카운트 반영)
  const motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount,
    state.folds
  );

  if (motionCursor) {
    if (isFailedMotion(key, state.cursor, motionCursor)) {
      return ringBell(state);
    }
    let nextCursor = motionCursor;
    let nextBlockEol = state.visualBlockEndOfLine;
    if (state.mode === 'VISUAL_BLOCK') {
      if (key === '$') {
        nextBlockEol = true;
      } else if (
        nextBlockEol &&
        (key === 'j' || key === 'k' || key === 'G' || key === '{' || key === '}' || key === 'ArrowDown' || key === 'ArrowUp')
      ) {
        const lineLen = (state.lines[motionCursor.line] ?? '').length;
        nextCursor = { line: motionCursor.line, col: Math.max(0, lineLen - 1) };
      } else {
        nextBlockEol = undefined;
      }
    } else {
      nextBlockEol = undefined;
    }
    return {
      ...state,
      cursor: nextCursor,
      visualBlockEndOfLine: nextBlockEol,
      pendingKeys: undefined,
    };
  }

  return state;
}
