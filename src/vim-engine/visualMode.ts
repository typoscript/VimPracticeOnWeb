import { VimEditorState, CursorPosition } from './types';
import { executeCommandLine } from './commandLine';
import { moveToLineStart, moveToLineEnd, moveToFirstNonBlank } from './motions';
import { syncRegisters, putFromRegister } from './registers';
import { alternateBuffer } from './bufferEngine';
import { reselectLastVisual } from './advancedMotions';
import {
  deleteVisualSelection,
  yankVisualSelection,
  startVisualBlockInsert,
  swapVisualCursorAnchor,
} from './visual';
import { replaceVisualChars } from './visualUtilities';
import { moveFind } from './findChar';
import { findMatches, findSearchTarget, getWordAtCursor } from './search';
import { starSearchPattern } from './vimRegex';
import { getOptions } from './setOptionsCore';
import { msg } from './messages';
import {
  MAX_REMAP_DEPTH,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
  runKeymapTokens,
} from './keymapEngine';
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
import { setMark, isValidMarkJumpChar, resolveMarkPosition } from './marks';
import { joinLines, changeCaseVisual, indentVisual, modifyNumberVisual, formatIndentVisual } from './lineOperators';
import { findMatchingBracket } from './bracketMatch';
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
import {
  handleVisualZPrefix,
  handleVisualGImmediate,
  handleVisualGSubcommand,
  handleVisualDirectGCombo,
  handleVisualTextObject,
  handleVisualBracketPrefix,
} from './visualPrefixes';

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
      pendingKeymapPrefix: undefined,
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

  // Visual 모드 vim-surround (S{char}) 및 선택 영역 일괄 문자 치환 (r{char})
  if (state.pendingKeys === 'S') {
    return executeVisualSurround(state, key);
  }
  if (state.pendingKeys === 'r') {
    if (key === 'Space' || key.length === 1) {
      return replaceVisualChars(state, key);
    }
    return ringBell({ ...state, pendingKeys: undefined });
  }
  if (key === 'S' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'S' };
  }

  // Visual 모드 수동 폴드 생성 (zf) 및 수평 스크롤 (zh, zl, zH, zL, ze, zs)
  const zRes = handleVisualZPrefix(state, key, parsed.count1);
  if (zRes) return zRes;

  // Visual 모드 내 gn / gN (다음/이전 검색 매치로 선택 영역 확장), gt / gT (탭 전환), gj/gk/g0/g$/gm/gM
  const gImmRes = handleVisualGImmediate(state, key, parsed);
  if (gImmRes) return gImmRes;

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

  // 윈도우 분할 및 포커스 제어 ([count]Ctrl-w)
  if (state.pendingKeys?.endsWith('Ctrl-w') || state.pendingKeys?.endsWith('Ctrl+w')) {
    const countMatch = state.pendingKeys.match(/^(\d+)/);
    const wCount = countMatch ? parseInt(countMatch[1], 10) : undefined;
    return handleCtrlWKey(state, key, wCount);
  }

  if (key === '"' && !state.pendingKeys) {
    return {
      ...state,
      pendingKeys: '"',
    };
  }

  if ((key === 'Ctrl-w' || key === 'Ctrl+w') && (!state.pendingKeys || /^\d+$/.test(state.pendingKeys))) {
    return {
      ...state,
      pendingKeys: `${state.pendingKeys ?? ''}Ctrl-w`,
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

  // 비주얼 모드 커스텀 키매핑 (:xmap/:xnoremap 우선, :vmap/:vnoremap 폴백, 다중 키·<Cmd>·<nowait>·재귀 *map 지원)
  if (!state.keymapsDisabled && !state.pendingKeys && macroDepth <= MAX_REMAP_DEPTH) {
    const leaderKey = state.leaderKey || ' ';
    const prefix = state.pendingKeymapPrefix ?? '';
    const runVisualEx = (s: VimEditorState, cmd: string) =>
      executeCommandLine(s, cmd, (st, k) => dispatchKey(st, k, false, 0));
    const runVisualResolved = (baseState: VimEditorState, res: NonNullable<ReturnType<typeof resolveKeymapWithMeta>>) =>
      runKeymapTokens(
        baseState,
        res,
        macroDepth,
        (runState, rhs, isNoremap, nextDepth) => {
          if (isNoremap && rhs === '^') {
            return { ...runState, cursor: moveToFirstNonBlank(runState.lines, runState.cursor) };
          }
          if (isNoremap && rhs === '$') {
            return { ...runState, cursor: moveToLineEnd(runState.lines, runState.cursor) };
          }
          const tokens = parseKeySequence(rhs, leaderKey);
          let s: VimEditorState = runState;
          for (const tok of tokens) {
            s = dispatchKey(s, tok, false, nextDepth);
            if (s.bell) break;
          }
          return s;
        },
        runVisualEx
      );

    if (prefix && key === 'Timeout') {
      const prevRes = resolveKeymapWithMeta(state, 'x', prefix) ?? resolveKeymapWithMeta(state, 'v', prefix);
      if (prevRes) return runVisualResolved({ ...state, pendingKeymapPrefix: undefined }, prevRes);
      return { ...state, pendingKeymapPrefix: undefined };
    }

    const isLeader = !prefix && (key === leaderKey || (leaderKey === ' ' && (key === ' ' || key === 'Space')));
    const combined = isLeader ? '<leader>' : `${prefix}${key}`;
    const resolved =
      resolveKeymapWithMeta(state, 'x', combined) ??
      resolveKeymapWithMeta(state, 'v', combined);
    const hasLongerPrefix =
      isKeymapPrefix(state, 'x', combined) ||
      isKeymapPrefix(state, 'v', combined) ||
      (isLeader && (isKeymapPrefix(state, 'x', leaderKey) || isKeymapPrefix(state, 'v', leaderKey)));

    if (resolved && (!hasLongerPrefix || resolved.nowait)) {
      return runVisualResolved({ ...state, pendingKeymapPrefix: undefined }, resolved);
    }
    if (hasLongerPrefix) {
      return { ...state, pendingKeymapPrefix: combined };
    }
    if (prefix) {
      const prevRes = resolveKeymapWithMeta(state, 'x', prefix) ?? resolveKeymapWithMeta(state, 'v', prefix);
      if (prevRes) {
        const afterPrev = runVisualResolved({ ...state, pendingKeymapPrefix: undefined }, prevRes);
        return dispatchKey(afterPrev, key, false, macroDepth);
      }
      const prevDisabled = state.keymapsDisabled;
      const flushTokens = parseKeySequence(prefix, leaderKey);
      let s: VimEditorState = { ...state, pendingKeymapPrefix: undefined, keymapsDisabled: true };
      for (const tok of flushTokens) {
        s = dispatchKey(s, tok, false, macroDepth);
        if (s.bell) break;
      }
      const restored = s.keymapsDisabled === prevDisabled ? s : { ...s, keymapsDisabled: prevDisabled };
      return dispatchKey(restored, key, false, macroDepth);
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
  const gSubRes = handleVisualGSubcommand(state, key, parsed);
  if (gSubRes) return gSubRes;

  // 복합 키 표현 (g<Ctrl-a>, g<C-a>, g Ctrl-a, g Ctrl+a, g<Ctrl-x>, g<C-x>, g Ctrl-x, g Ctrl+x, g<Ctrl-g>)
  const gComboRes = handleVisualDirectGCombo(state, key, parsed.totalCount);
  if (gComboRes) return gComboRes;

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

  // VISUAL_BLOCK 전용 모드 삽입 연산자 (I, A, c, C, s) 및 VISUAL/VISUAL_LINE c/s/C/S/R (텍스트 객체 'i'/'a' 대기 중이 아닐 때만)
  const isTextObjPending = Boolean(state.pendingKeys && /^([1-9][0-9]*)?[ia]$/.test(state.pendingKeys));
  if (state.mode === 'VISUAL_BLOCK' && !isTextObjPending) {
    if (key === 'I') {
      return startVisualBlockInsert(state, 'I', parsed.totalCount);
    }
    if (key === 'A') {
      return startVisualBlockInsert(state, 'A', parsed.totalCount);
    }
    if (key === 'c' || key === 's') {
      return startVisualBlockInsert(state, 'c', parsed.totalCount);
    }
    if (key === 'C') {
      return startVisualBlockInsert({ ...state, visualBlockEndOfLine: true }, 'c', parsed.totalCount);
    }
  } else if (!isTextObjPending && (key === 'c' || key === 's' || key === 'C' || key === 'S' || key === 'R')) {
    const snap = state.visualAnchor
      ? {
          mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
          anchor: { ...state.visualAnchor },
          cursor: { ...state.cursor },
        }
      : state.lastVisualSelection;
    const isLinewiseChange = state.mode === 'VISUAL_LINE' || key === 'C' || key === 'S' || key === 'R';
    if (isLinewiseChange && state.visualAnchor) {
      const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
      const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
      const deletedContent = state.lines.slice(minLine, maxLine + 1).join('\n');
      const nextLines = [
        ...state.lines.slice(0, minLine),
        '',
        ...state.lines.slice(maxLine + 1),
      ];
      const withDel: VimEditorState = {
        ...state,
        lines: nextLines,
        cursor: { line: minLine, col: 0 },
        mode: 'INSERT',
        visualAnchor: undefined,
        clipboard: { type: 'line', content: deletedContent },
        pendingKeys: undefined,
      };
      return {
        ...syncRegisters(state, withDel, false),
        mode: 'INSERT',
        lastVisualSelection: snap,
      };
    }
    const delRes = deleteVisualSelection(state);
    const synced = syncRegisters(state, delRes, false);
    return {
      ...synced,
      mode: 'INSERT',
      lastVisualSelection: snap,
    };
  }

  if (key === 'r' && !state.pendingKeys) {
    return { ...state, pendingKeys: 'r' };
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
  const isPureVisualCountOrEmpty = !state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys);
  if (key === 'H' && isPureVisualCountOrEmpty) {
    const res = cursorToHigh(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'M' && isPureVisualCountOrEmpty) {
    const res = cursorToMiddle(state);
    return { ...state, cursor: res.cursor, pendingKeys: undefined };
  }
  if (key === 'L' && isPureVisualCountOrEmpty) {
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
  const objRes = handleVisualTextObject(state, key);
  if (objRes) return objRes;

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
      const opts = getOptions(state);
      const query = starSearchPattern(word);
      const matches = findMatches(state.lines, query, opts);
      const forward = key === '*';
      const found = findSearchTarget(state.lines, matches, state.cursor, null, forward, false);
      if (found) {
        if (opts.wrapscan === false && found.wrapped) {
          return {
            ...ringBell(state),
            lastSearchQuery: query,
            commandMessage: forward
              ? msg('E385: 파일 맨 아래까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: query })
              : msg('E384: 파일 맨 위까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: query }),
          };
        }
        return {
          ...state,
          cursor: { line: found.match.line, col: found.match.col },
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

  // 마크 점프 ('{a-zA-Z}, `{a-zA-Z} 및 특수 마크) - 선택 영역 확장
  if (state.pendingKeys === "'" || state.pendingKeys === '`') {
    const quote = state.pendingKeys;
    if (isValidMarkJumpChar(key)) {
      const mark = resolveMarkPosition(state, key);
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

  // VISUAL 모드 괄호·섹션·메서드 모션 [( [{ ]) ]} [[ ]] [] ][ ]m [m ]M [M
  const bracketRes = handleVisualBracketPrefix(state, key);
  if (bracketRes) return bracketRes;

  // VISUAL 모드 내 커서 이동 (모션 평가 및 카운트 반영)
  const motionCursor = evaluateMotionWithCount(
    state.lines,
    state.cursor,
    key,
    parsed.totalCount,
    state.folds,
    getOptions(state).whichwrap
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
