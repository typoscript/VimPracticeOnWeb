import { FlashJumpMatch, FlashJumpSession, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { syncRegisters } from './registers';
import { recordJump } from './marks';
import { getViewport } from './viewport';
import { msg } from './messages';

const FLASH_LABELS = 'asdfghjklqwertyuiopzxcvbnmASDFGHJKLQWERTYUIOPZXCVBNM';

/**
 * 현재 버퍼에서 Flash 검색어와 일치하는 모든 위치에 충돌 없는 1글자 라벨을 배정합니다.
 * 현재 커서와 가까운 줄의 매치에 홈로우(a, s, d, f...) 라벨을 우선 배정합니다.
 */
export function computeFlashMatches(
  state: VimEditorState,
  query: string
): FlashJumpMatch[] {
  if (!query) return [];
  const hasUpper = /[A-Z]/.test(query);
  const needle = hasUpper ? query : query.toLowerCase();

  const vp = getViewport(state);
  const totalLines = state.lines.length;
  const startRow = totalLines > 120 ? Math.max(0, vp.topRow) : 0;
  const endRow = totalLines > 120 ? Math.min(totalLines - 1, vp.topRow + vp.visibleRows + 10) : totalLines - 1;

  const rawMatches: Array<{ line: number; col: number; nextChar: string; dist: number }> = [];
  const nextChars = new Set<string>();

  for (let l = startRow; l <= endRow; l++) {
    const lineText = state.lines[l] ?? '';
    const hay = hasUpper ? lineText : lineText.toLowerCase();
    let idx = 0;
    while (idx <= hay.length - needle.length) {
      const found = hay.indexOf(needle, idx);
      if (found === -1) break;
      const nextCh = lineText[found + needle.length] ?? '';
      if (nextCh) {
        nextChars.add(nextCh.toLowerCase());
        nextChars.add(nextCh);
      }
      const dist = Math.abs(l - state.cursor.line) * 1000 + Math.abs(found - state.cursor.col);
      rawMatches.push({ line: l, col: found, nextChar: nextCh, dist });
      idx = found + 1;
    }
  }

  // 커서와 가까운 순으로 정렬해 홈로우 라벨 우선 배정
  rawMatches.sort((a, b) => a.dist - b.dist);

  const availableLabels: string[] = [];
  for (const ch of FLASH_LABELS) {
    if (!nextChars.has(ch)) availableLabels.push(ch);
  }
  // 라벨이 부족할 경우 남은 문자도 보조로 활용
  for (const ch of FLASH_LABELS) {
    if (!availableLabels.includes(ch)) availableLabels.push(ch);
  }

  const assigned: FlashJumpMatch[] = [];
  for (let i = 0; i < rawMatches.length && i < availableLabels.length; i++) {
    assigned.push({
      line: rawMatches[i].line,
      col: rawMatches[i].col,
      length: query.length,
      label: availableLabels[i],
    });
  }

  return assigned;
}

/**
 * flash.nvim 스타일 라벨 점프 세션을 엽니다 (gs, dgs/cgs/ygs, Visual gs, :Flash [query]).
 */
export function openFlashJump(
  state: VimEditorState,
  options: {
    query?: string;
    operator?: 'd' | 'c' | 'y';
    visualMode?: 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK';
  } = {}
): VimEditorState {
  const initialQuery = options.query ?? '';
  const matches = initialQuery ? computeFlashMatches(state, initialQuery) : [];
  const session: FlashJumpSession = {
    isOpen: true,
    query: initialQuery,
    matches,
    ...(options.operator ? { operator: options.operator } : {}),
    ...(options.visualMode ? { visualMode: options.visualMode } : {}),
  };

  const statusMsg = initialQuery
    ? matches.length > 0
      ? msg('[Flash] "{query}" ({count}개 일치 · 라벨 키로 점프)', {
          query: initialQuery,
          count: matches.length,
        })
      : msg('[Flash] 일치하는 위치가 없습니다: "{query}"', { query: initialQuery })
    : msg('[Flash] 점프할 검색 문자를 입력하세요 (Esc 취소)');

  return {
    ...state,
    pendingKeys: undefined,
    flashJump: session,
    commandMessage: statusMsg,
  };
}

/**
 * Flash 점프 세션을 취소합니다.
 */
export function cancelFlashJump(state: VimEditorState): VimEditorState {
  if (!state.flashJump?.isOpen) return state;
  return {
    ...state,
    flashJump: null,
    pendingKeys: undefined,
    commandMessage: undefined,
  };
}

/**
 * 연산자(d/c/y) + Flash 타겟 위치 간 범위 연산을 적용합니다 (dgs/cgs/ygs).
 */
function applyFlashOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y',
  target: { line: number; col: number }
): VimEditorState {
  const start = state.cursor;
  const forward =
    target.line > start.line || (target.line === start.line && target.col >= start.col);
  const from = forward ? start : target;
  const to = forward ? target : start;

  // 단일 줄 또는 다중 줄 문자 단위 구간 추출 (exclusive 끝, 단 같은 위치면 1글자)
  const samePos = from.line === to.line && from.col === to.col;
  const endLine = to.line;
  const endCol = samePos ? Math.min(to.col + 1, (state.lines[endLine] ?? '').length) : to.col;

  let extracted: string;
  if (from.line === endLine) {
    extracted = (state.lines[from.line] ?? '').slice(from.col, endCol);
  } else {
    const firstPart = (state.lines[from.line] ?? '').slice(from.col);
    const middle = state.lines.slice(from.line + 1, endLine);
    const lastPart = (state.lines[endLine] ?? '').slice(0, endCol);
    extracted = [firstPart, ...middle, lastPart].join('\n');
  }

  if (operator === 'y') {
    const yanked: VimEditorState = {
      ...state,
      cursor: clampCursor(state.lines, from, 'NORMAL'),
      clipboard: { type: 'text', content: extracted },
      flashJump: null,
      pendingKeys: undefined,
      commandMessage: msg('[Flash] {len}자 복사 완료', { len: extracted.length }),
    };
    return syncRegisters(state, yanked, true);
  }

  const withUndo = pushUndoSnapshot(state);
  const before = (state.lines[from.line] ?? '').slice(0, from.col);
  const after = (state.lines[endLine] ?? '').slice(endCol);
  const nextLines = [
    ...state.lines.slice(0, from.line),
    before + after,
    ...state.lines.slice(endLine + 1),
  ];
  const nextMode = operator === 'c' ? 'INSERT' : 'NORMAL';
  const nextCursor = clampCursor(nextLines, { line: from.line, col: from.col }, nextMode);

  const edited: VimEditorState = {
    ...withUndo,
    lines: nextLines,
    cursor: nextCursor,
    mode: nextMode,
    clipboard: { type: 'text', content: extracted },
    flashJump: null,
    pendingKeys: undefined,
    commandMessage: undefined,
  };
  return syncRegisters(state, edited, false);
}

/**
 * 선택된 Flash 매치 위치로 점프(또는 연산자/비주얼 확장)를 실행합니다.
 */
export function executeFlashJumpToMatch(
  state: VimEditorState,
  match: FlashJumpMatch
): VimEditorState {
  const session = state.flashJump;
  if (!session) return state;

  if (session.operator) {
    return applyFlashOperator(state, session.operator, { line: match.line, col: match.col });
  }

  const stateWithJump = recordJump(state);
  const nextMode = session.visualMode ?? 'NORMAL';
  const nextCursor = clampCursor(stateWithJump.lines, { line: match.line, col: match.col }, nextMode);

  return {
    ...stateWithJump,
    mode: nextMode,
    cursor: nextCursor,
    flashJump: null,
    pendingKeys: undefined,
    commandMessage: msg('[Flash] {line}행 {col}열로 점프', {
      line: match.line + 1,
      col: match.col + 1,
    }),
  };
}

/**
 * Flash 점프 세션 활성 중 키 입력을 처리합니다.
 */
export function handleFlashJumpKey(state: VimEditorState, key: string): VimEditorState {
  const session = state.flashJump;
  if (!session?.isOpen) return state;

  if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c' || key === 'ctrl-c') {
    return cancelFlashJump(state);
  }

  if (key === 'Enter') {
    if (session.matches.length > 0) {
      return executeFlashJumpToMatch(state, session.matches[0]);
    }
    return { ...cancelFlashJump(state), bell: true };
  }

  if (key === 'Backspace' || key === 'Ctrl-h' || key === 'Ctrl+h') {
    const nextQuery = session.query.slice(0, -1);
    const nextMatches = computeFlashMatches(state, nextQuery);
    return {
      ...state,
      flashJump: { ...session, query: nextQuery, matches: nextMatches },
      commandMessage: nextQuery
        ? msg('[Flash] "{query}" ({count}개 일치 · 라벨 키로 점프)', {
            query: nextQuery,
            count: nextMatches.length,
          })
        : msg('[Flash] 점프할 검색 문자를 입력하세요 (Esc 취소)'),
    };
  }

  if (key.length === 1) {
    // 1. 이미 검색어가 있고 현재 매치 중 해당 라벨이 있으면 즉시 점프
    if (session.query.length >= 1) {
      const labelHit = session.matches.find((m) => m.label === key);
      if (labelHit) {
        return executeFlashJumpToMatch(state, labelHit);
      }
    }

    // 2. 라벨이 아니면 검색어에 문자를 이어붙여 매치 재계산
    const nextQuery = session.query + key;
    const nextMatches = computeFlashMatches(state, nextQuery);
    if (nextMatches.length === 0) {
      return {
        ...state,
        bell: true,
        flashJump: { ...session, query: nextQuery, matches: [] },
        commandMessage: msg('[Flash] 일치하는 위치가 없습니다: "{query}"', { query: nextQuery }),
      };
    }

    return {
      ...state,
      flashJump: { ...session, query: nextQuery, matches: nextMatches },
      commandMessage: msg('[Flash] "{query}" ({count}개 일치 · 라벨 키로 점프)', {
        query: nextQuery,
        count: nextMatches.length,
      }),
    };
  }

  return state;
}
