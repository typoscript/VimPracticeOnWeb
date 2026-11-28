import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { openHelp } from './helpEngine';
import { openLspHover } from './lspEngine';
import { findMatchingBracket } from './bracketMatch';
import { computePercentJumpTarget } from './extraMotions';
import { moveFindRepeat } from './findChar';
import { getWordAtCursor } from './search';
import { executeCommandLine } from './commandLine';
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
import { recordJump, jumpOlder, jumpNewer } from './marks';
import { joinLines, joinSingleLastLine, toggleCaseChar, modifyNumberAtCursor } from './lineOperators';
import { msg } from './messages';
import { getOptions } from './setOptionsCore';
import { ringBell, getOppositeMotion, RunHandleKeyFn, ParsedPending } from './engineHelpers';

/* 노멀 모드 뷰포트·점프·줄 안 탐색 반복·숫자 증감·J ~ K & (normalStandaloneCommands.ts 에서 분리) */

/**
 * 뷰포트 스크롤, 점프 리스트, 숫자 증감, 줄 내 탐색 반복, J/~ /F1/K/& 등을 처리합니다.
 */
export function handleNormalViewportAndNavOps(
  state: VimEditorState,
  key: string,
  parsed: ParsedPending,
  isReplayingDot: boolean,
  runHandleKey: RunHandleKeyFn
): VimEditorState | null {
  // %: 카운트가 있으면 [count]% 파일 백분율 줄 점프, 없으면 괄호 짝 점프
  if (key === '%' && !parsed.operator) {
    if (parsed.count1 !== undefined) {
      const pctTarget = computePercentJumpTarget(
        state.lines,
        parsed.count1,
        state.cursor.col,
        Boolean(getOptions(state).startofline)
      );
      if (pctTarget) {
        return { ...recordJump(state), cursor: pctTarget, pendingKeys: undefined };
      }
      return ringBell(state);
    }
    const matchPos = findMatchingBracket(state.lines, state.cursor);
    if (matchPos) {
      return { ...recordJump(state), cursor: matchPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }

  // 단독 ; / ,: 줄 내 탐색 반복
  if (key === ';' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    if (state.lastCharSearch) {
      const nextPos = moveFindRepeat(
        state.lines,
        state.cursor,
        state.lastCharSearch.type,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) return { ...state, cursor: nextPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }
  if (key === ',' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    if (state.lastCharSearch) {
      const oppMotion = getOppositeMotion(state.lastCharSearch.type);
      const nextPos = moveFindRepeat(
        state.lines,
        state.cursor,
        oppMotion,
        state.lastCharSearch.char,
        parsed.totalCount
      );
      if (nextPos) return { ...state, cursor: nextPos, pendingKeys: undefined };
    }
    return ringBell(state);
  }

  // Ctrl-o / Ctrl-i: 점프 리스트 탐색 ([count]Ctrl-o, [count]Ctrl-i)
  if ((key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'ctrl-o') && !parsed.operator) {
    return jumpOlder(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-i' || key === 'Ctrl+i' || key === 'ctrl-i') && !parsed.operator) {
    return jumpNewer(state, parsed.totalCount);
  }

  // Ctrl-g: 현재 버퍼 상태 출력
  if (
    (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') &&
    !parsed.operator &&
    !state.pendingKeys
  ) {
    const filename = state.primaryFilename || msg('[이름 없음]');
    const isModified = (state.undoStack?.length ?? 0) > 0;
    const mod = isModified ? msg('[수정됨] ') : '';
    const lineCount = state.lines.length;
    if (lineCount === 0) {
      return { ...state, commandMessage: msg('"{filename}" [버퍼에 줄 없음]', { filename }) };
    }
    const percent = Math.floor(((state.cursor.line + 1) * 100) / lineCount);
    return {
      ...state,
      commandMessage: msg('"{filename}" {mod}{lineCount}줄 --{percent}%--', {
        filename,
        mod,
        lineCount,
        percent,
      }),
    };
  }

  // Ctrl-a / Ctrl-x: 커서 위치 숫자 증감
  if ((key === 'Ctrl-a' || key === 'Ctrl+a' || key === 'ctrl-a') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, parsed.totalCount);
    // op_addsub 는 숫자를 찾기 전에 u_save_cursor 하므로 실패해도 빈 실행 취소 항목이 남습니다 (u 가 그 커서로 돌아옴).
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(pushUndoSnapshot(state));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-a'] : ['Ctrl-a'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }
  if ((key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x') && !parsed.operator) {
    const res = modifyNumberAtCursor(state, -parsed.totalCount);
    // op_addsub 는 숫자를 찾기 전에 u_save_cursor 하므로 실패해도 빈 실행 취소 항목이 남습니다 (u 가 그 커서로 돌아옴).
    if (res.lines.join('\n') === state.lines.join('\n')) return ringBell(pushUndoSnapshot(state));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'Ctrl-x'] : ['Ctrl-x'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }

  // H, M, L: 화면 뷰포트 기준 최상단/중앙/최하단 이동
  const isPureCountOrEmpty = !state.pendingKeys || /^[1-9][0-9]*$/.test(state.pendingKeys);
  if (key === 'H' && !parsed.operator && isPureCountOrEmpty) return cursorToHigh(state);
  if (key === 'M' && !parsed.operator && isPureCountOrEmpty) return cursorToMiddle(state);
  if (key === 'L' && !parsed.operator && isPureCountOrEmpty) return cursorToLow(state);

  // Ctrl-d/u/f/b/e/y: 뷰포트 스크롤
  if ((key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'ctrl-d') && !parsed.operator) {
    return scrollHalfPageDown(state);
  }
  if ((key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') && !parsed.operator) {
    return scrollHalfPageUp(state);
  }
  if ((key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') && !parsed.operator) {
    return scrollFullPageDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-b' || key === 'Ctrl+b' || key === 'ctrl-b') && !parsed.operator) {
    return scrollFullPageUp(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-e' || key === 'Ctrl+e' || key === 'ctrl-e') && !parsed.operator) {
    return scrollLineDown(state, parsed.totalCount);
  }
  if ((key === 'Ctrl-y' || key === 'Ctrl+y' || key === 'ctrl-y') && !parsed.operator) {
    return scrollLineUp(state, parsed.totalCount);
  }

  // &: 직전 :s 재실행
  // Vim nv_optrans: `[count]&` 는 `[count]:s<CR>` (현재 줄부터 count 줄). Ex 명령이라 `.` 반복 대상이 아닙니다.
  if (key === '&' && /^([1-9][0-9]*)?$/.test(state.pendingKeys ?? '')) {
    const n = parseInt(state.pendingKeys || '1', 10);
    const cmd = n > 1 ? `.,.+${n - 1}s` : 's';
    return executeCommandLine({ ...state, pendingKeys: undefined }, cmd, runHandleKey);
  }

  // F1 / K: 도움말 및 LSP 호버
  if (key === 'F1' && !state.pendingKeys) {
    return { ...openHelp(state), pendingKeys: undefined };
  }
  if (key === 'K' && !parsed.operator && !state.pendingKeys) {
    const curLine = state.lines[state.cursor.line] ?? '';
    const word = getWordAtCursor(curLine, state.cursor.col);
    const lspResult = openLspHover(state, word);
    if (lspResult !== null) return { ...lspResult, pendingKeys: undefined };
    return { ...openHelp(state, word ?? undefined), pendingKeys: undefined };
  }

  // J / ~: 줄 합치기 및 대소문자 토글
  if (key === 'J' && !parsed.operator) {
    if (state.cursor.line >= state.lines.length - 1) {
      return parsed.totalCount > 2 ? { ...joinSingleLastLine(state, false), lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['J'] } : ringBell(state);
    }
    // [count]J 는 count 줄을 합칩니다 (최소 2줄) → 이음 횟수는 count - 1
    const res = joinLines(state, Math.max(1, parsed.totalCount - 1));
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), 'J'] : ['J'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }
  if (key === '~' && !parsed.operator) {
    const res = toggleCaseChar(state, parsed.totalCount);
    const lKeys = parsed.totalCount > 1 ? [String(parsed.totalCount), '~'] : ['~'];
    return { ...res, lastChangeKeys: isReplayingDot ? state.lastChangeKeys : lKeys };
  }

  return null;
}
