import { VimEditorState, CursorPosition } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { syncRegisters } from './registers';
import {
  applySearchOffset,
  findMatches,
  findNextMatch,
  findPrevMatch,
  parseSearchQuery,
  findCurrentOrNextMatch,
  findSearchTarget,
  getWordAtCursor,
} from './search';
import { starSearchPattern } from './vimRegex';
import { recordJump } from './marks';
import { getOptions } from './setEngine';
import { addHistory, navigateHistory, openCommandLineWindow } from './cmdlineWindow';
import {
  insertTextIntoCmdline,
  deleteCmdlineCharBackward,
  handleCmdlineDigraphStep,
  handleCmdlineCtrlRStep,
  handleCmdlineCommonEditKey,
  isBackspaceKey,
  isCmdlineCancelKey,
} from './cmdlineEdit';
import { msg } from './messages';

/**
 * 검색 모션과 결합된 연산자(d/pat/e, c/pat/e, d/TODO/+1 등)를 실행합니다.
 */
export function executeSearchOperator(
  state: VimEditorState,
  op: string,
  from: CursorPosition,
  to: CursorPosition,
  isLinewise: boolean,
  isEndInclusive: boolean
): VimEditorState {
  if (isLinewise) {
    const startLine = Math.min(from.line, to.line);
    const endLine = Math.max(from.line, to.line);
    const deletedLines = state.lines.slice(startLine, endLine + 1).join('\n');

    if (op === 'y') {
      return {
        ...state,
        clipboard: { type: 'line', content: deletedLines },
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);

    if (op === 'c') {
      const nextLines = [
        ...state.lines.slice(0, startLine),
        '',
        ...state.lines.slice(endLine + 1),
      ];
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line: startLine, col: 0 },
        mode: 'INSERT',
        clipboard: { type: 'line', content: deletedLines },
      };
    }

    // op === 'd'
    const nextLines = [
      ...state.lines.slice(0, startLine),
      ...state.lines.slice(endLine + 1),
    ];
    if (nextLines.length === 0) nextLines.push('');
    const firstNonBlank = (nextLines[startLine] ?? '').search(/\S/);
    const targetCol = firstNonBlank >= 0 ? firstNonBlank : 0;
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: Math.min(startLine, nextLines.length - 1), col: targetCol }, 'NORMAL'),
      clipboard: { type: 'line', content: deletedLines },
    };
  }

  // Character-wise operator
  let start = from;
  let end = to;
  if (from.line > to.line || (from.line === to.line && from.col > to.col)) {
    start = to;
    end = from;
  }

  if (start.line === end.line) {
    const lineText = state.lines[start.line] ?? '';
    const endOffset = isEndInclusive ? 1 : 0;
    const sCol = Math.max(0, Math.min(lineText.length, start.col));
    const eCol = Math.max(sCol, Math.min(lineText.length, end.col + endOffset));
    const textFragment = lineText.slice(sCol, eCol);

    if (op === 'y') {
      return {
        ...state,
        clipboard: { type: 'text', content: textFragment },
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    const newLine = lineText.slice(0, sCol) + lineText.slice(eCol);
    const nextLines = [...state.lines];
    nextLines[start.line] = newLine;

    if (op === 'c') {
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        mode: 'INSERT',
        cursor: { line: start.line, col: sCol },
        clipboard: { type: 'text', content: textFragment },
      };
    }

    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: start.line, col: Math.min(sCol, Math.max(0, newLine.length - 1)) }, 'NORMAL'),
      clipboard: { type: 'text', content: textFragment },
    };
  }

  // Multi-line character-wise
  const firstLineText = state.lines[start.line] ?? '';
  const lastLineText = state.lines[end.line] ?? '';
  const endOffset = isEndInclusive ? 1 : 0;
  const sCol = Math.max(0, Math.min(firstLineText.length, start.col));
  const eCol = Math.max(0, Math.min(lastLineText.length, end.col + endOffset));

  const textFragments = [
    firstLineText.slice(sCol),
    ...state.lines.slice(start.line + 1, end.line),
    lastLineText.slice(0, eCol),
  ].join('\n');

  if (op === 'y') {
    return {
      ...state,
      clipboard: { type: 'text', content: textFragments },
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const mergedLine = firstLineText.slice(0, sCol) + lastLineText.slice(eCol);
  const nextLines = [
    ...state.lines.slice(0, start.line),
    mergedLine,
    ...state.lines.slice(end.line + 1),
  ];

  if (op === 'c') {
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      mode: 'INSERT',
      cursor: { line: start.line, col: sCol },
      clipboard: { type: 'text', content: textFragments },
    };
  }

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: start.line, col: Math.min(sCol, Math.max(0, mergedLine.length - 1)) }, 'NORMAL'),
    clipboard: { type: 'text', content: textFragments },
  };
}

/**
 * 검색 매치 텍스트 객체(gn, gN) 및 연산자 결합(cgn, dgn, ygn)을 실행합니다.
 */
export function executeGn(
  state: VimEditorState,
  isForward: boolean,
  op?: string,
  isReplayingDot = false
): VimEditorState {
  if (!state.lastSearchQuery) {
    return {
      ...state,
      commandMessage: msg('E35: 이전 정규식이 없습니다'),
      pendingKeys: undefined,
    };
  }

  const opts = getOptions(state);
  const matches = findMatches(state.lines, state.lastSearchQuery, opts);
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {lastSearchQuery}', { lastSearchQuery: state.lastSearchQuery }),
      pendingKeys: undefined,
      bell: true,
    };
  }

  const res = findCurrentOrNextMatch(matches, state.cursor, isForward);
  if (!res) {
    return { ...state, pendingKeys: undefined };
  }
  if (!res.isCurrent && opts.wrapscan === false) {
    const check = findSearchTarget(state.lines, matches, state.cursor, null, isForward, false);
    if (check?.wrapped) {
      return {
        ...state,
        pendingKeys: undefined,
        bell: true,
        commandMessage: isForward
          ? msg('E385: 파일 맨 아래까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: state.lastSearchQuery })
          : msg('E384: 파일 맨 위까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: state.lastSearchQuery }),
      };
    }
  }

  const target = res.match;

  // 1. 단독 gn / gN (연산자 없음)
  if (!op) {
    if (state.mode === 'VISUAL' || state.mode === 'VISUAL_LINE' || state.mode === 'VISUAL_BLOCK') {
      const nextMatch = isForward ? findNextMatch(matches, state.cursor) : findPrevMatch(matches, state.cursor);
      if (nextMatch) {
        return {
          ...state,
          cursor: { line: nextMatch.line, col: nextMatch.col + Math.max(0, nextMatch.length - 1) },
          pendingKeys: undefined,
        };
      }
      return { ...state, pendingKeys: undefined };
    }

    const anchor = isForward
      ? { line: target.line, col: target.col }
      : { line: target.line, col: target.col + Math.max(0, target.length - 1) };
    const cur = isForward
      ? { line: target.line, col: target.col + Math.max(0, target.length - 1) }
      : { line: target.line, col: target.col };

    return {
      ...state,
      mode: 'VISUAL',
      visualAnchor: anchor,
      cursor: cur,
      pendingKeys: undefined,
    };
  }

  // 2. 연산자 결합 (cgn, dgn, ygn)
  const targetLine = target.line;
  const startCol = target.col;
  const endCol = target.col + target.length;
  const lineText = state.lines[targetLine] ?? '';
  const matchText = lineText.slice(startCol, endCol);

  if (op === 'y') {
    const nextState = {
      ...state,
      clipboard: { type: 'text' as const, content: matchText },
      pendingKeys: undefined,
    };
    return syncRegisters(state, nextState, true);
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const newLine = lineText.slice(0, startCol) + lineText.slice(endCol);
  const nextLines = [...state.lines];
  nextLines[targetLine] = newLine;

  const keyName = isForward ? 'n' : 'N';
  const opKeys = [op, 'g', keyName];

  if (op === 'c') {
    const resState: VimEditorState = {
      ...stateWithSnapshot,
      lines: nextLines,
      mode: 'INSERT',
      cursor: { line: targetLine, col: startCol },
      clipboard: { type: 'text' as const, content: matchText },
      pendingKeys: undefined,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
    };
    return syncRegisters(state, resState, false);
  }

  // op === 'd'
  const resState: VimEditorState = {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: targetLine, col: Math.min(startCol, Math.max(0, newLine.length - 1)) }, 'NORMAL'),
    clipboard: { type: 'text' as const, content: matchText },
    pendingKeys: undefined,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
  };
  return syncRegisters(state, resState, false);
}

/**
 * SEARCH 모드(/, ?)에서 'incsearch' 가 활성화된 경우 실시간 매치 위치로 커서를 이동합니다.
 * stepDelta: Ctrl-g(+1) / Ctrl-t(-1) 로 다음/이전 일치 항목 순회
 */
export function applyIncsearchPreview(
  state: VimEditorState,
  stepDelta = 0
): VimEditorState {
  if (state.mode !== 'SEARCH') return state;
  const opts = getOptions(state);
  if (opts.incsearch === false) return state;

  const originCursor =
    state.searchOperator?.initialCursor ?? state.searchOriginCursor ?? state.cursor;
  const rawQuery = state.commandBuffer ?? '';
  const backward = state.commandType === '?';
  const delimChar = backward ? '?' : '/';
  const parsedQuery = parseSearchQuery(rawQuery, delimChar);
  const pattern = parsedQuery.pattern;

  if (!pattern) {
    return {
      ...state,
      cursor: originCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      incsearchStepOffset: 0,
    };
  }

  const matches = findMatches(state.lines, pattern, opts);
  if (matches.length === 0) {
    return {
      ...state,
      cursor: originCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      incsearchStepOffset: 0,
    };
  }

  const firstFound = findSearchTarget(
    state.lines,
    matches,
    originCursor,
    parsedQuery.offset,
    !backward,
    true
  )!;
  if (opts.wrapscan === false && firstFound.wrapped) {
    return {
      ...state,
      cursor: originCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      incsearchStepOffset: 0,
    };
  }
  const baseIdx = Math.max(
    0,
    matches.findIndex((m) => m.line === firstFound.match.line && m.col === firstFound.match.col)
  );
  const nextStepOffset =
    stepDelta === 0 ? 0 : (state.incsearchStepOffset ?? 0) + stepDelta;
  const dirSign = backward ? -1 : 1;
  const rawIdx = baseIdx + nextStepOffset * dirSign;
  const effectiveIdx =
    opts.wrapscan === false
      ? Math.max(0, Math.min(matches.length - 1, rawIdx))
      : ((rawIdx % matches.length) + matches.length) % matches.length;
  const chosenMatch = matches[effectiveIdx];
  const targetPos = applySearchOffset(state.lines, chosenMatch, parsedQuery.offset);

  return {
    ...state,
    cursor: targetPos,
    incsearchStepOffset: nextStepOffset,
    hlsearchSuppressed: undefined,
  };
}

/**
 * 검색 쿼리 문자열을 파싱 및 실행합니다.
 */
export function executeSearchQuery(
  state: VimEditorState,
  rawQuery: string,
  isReplayingDot = false
): VimEditorState {
  const returnCursor =
    state.searchOperator?.initialCursor ?? state.searchOriginCursor ?? state.cursor;
  const cleanSearchTemp = {
    searchOriginCursor: undefined,
    searchOriginViewport: undefined,
    incsearchStepOffset: undefined,
    searchCount: undefined,
  };

  if (rawQuery.length === 0) {
    return {
      ...state,
      ...cleanSearchTemp,
      mode: 'NORMAL',
      cursor: returnCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
      searchOperator: undefined,
    };
  }

  const backward = state.commandType === '?';
  const delimChar = backward ? '?' : '/';
  const direction: 'forward' | 'backward' = backward ? 'backward' : 'forward';
  const parsedQuery = parseSearchQuery(rawQuery, delimChar);
  const offset = parsedQuery.offset;
  const failBase = {
    ...state,
    ...cleanSearchTemp,
    mode: 'NORMAL' as const,
    cursor: returnCursor,
    viewport: state.searchOriginViewport ?? state.viewport,
    commandBuffer: undefined,
    commandType: undefined,
    searchOperator: undefined,
    bell: true,
  };

  // 빈 패턴(`//e`, `??b`)은 직전 검색 패턴을 새 오프셋으로 재사용합니다.
  let pattern = parsedQuery.pattern;
  if (pattern === '') {
    if (!state.lastSearchQuery) {
      return { ...failBase, commandMessage: msg('E35: 이전 정규식이 없습니다') };
    }
    pattern = state.lastSearchQuery;
  }

  const opts = getOptions(state);
  const matches = findMatches(state.lines, pattern, opts);
  if (matches.length === 0) {
    return {
      ...failBase,
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      lastSearchDirection: direction,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }),
    };
  }

  // Vim: 검색은 커서 다음 위치부터이며, [count]/pat 은 count 번째 매치로 갑니다.
  let found = findSearchTarget(state.lines, matches, returnCursor, offset, !backward)!;
  let wrappedAny = found.wrapped;
  for (let i = 1; i < Math.max(1, state.searchCount ?? 1); i++) {
    found = findSearchTarget(state.lines, matches, { line: found.match.line, col: found.match.col }, offset, !backward)!;
    wrappedAny = wrappedAny || found.wrapped;
  }
  found = { ...found, wrapped: wrappedAny };
  if (opts.wrapscan === false && found.wrapped) {
    return {
      ...failBase,
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      lastSearchDirection: direction,
      commandMessage: backward
        ? msg('E384: 파일 맨 위까지 검색했으나 찾지 못했습니다: {pattern}', { pattern })
        : msg('E385: 파일 맨 아래까지 검색했으나 찾지 못했습니다: {pattern}', { pattern }),
    };
  }
  let targetMatch = found.match;
  let targetPos = found.target;

  const stepOffset = state.incsearchStepOffset ?? 0;
  if (stepOffset !== 0 && opts.incsearch !== false) {
    const baseIdx = Math.max(
      0,
      matches.findIndex((m) => m.line === found.match.line && m.col === found.match.col)
    );
    const dirSign = backward ? -1 : 1;
    const rawIdx = baseIdx + stepOffset * dirSign;
    const effectiveIdx =
      opts.wrapscan === false
        ? Math.max(0, Math.min(matches.length - 1, rawIdx))
        : ((rawIdx % matches.length) + matches.length) % matches.length;
    targetMatch = matches[effectiveIdx];
    targetPos = applySearchOffset(state.lines, targetMatch, offset);
  }

  // 연산자(d/pat/e, c?pat?b, y/pat/+1 등) 결합 처리
  if (state.searchOperator) {
    const op = state.searchOperator.op;
    const startPos = state.searchOperator.initialCursor;
    const isLinewise = offset?.type === 'line';

    const res = executeSearchOperator(
      { ...state, ...cleanSearchTemp, cursor: returnCursor },
      op,
      startPos,
      targetPos,
      isLinewise,
      offset?.type === 'end'
    );
    const synced = syncRegisters(state, res, op === 'y');
    const opKeys = [op, delimChar, ...rawQuery.split(''), 'Enter'];

    if (op === 'c') {
      return {
        ...synced,
        ...cleanSearchTemp,
        lastSearchQuery: pattern,
        lastSearchOffset: offset,
        lastSearchDirection: direction,
        commandBuffer: undefined,
        commandType: undefined,
        searchOperator: undefined,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : opKeys,
      };
    }

    return {
      ...synced,
      ...cleanSearchTemp,
      mode: 'NORMAL',
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      lastSearchDirection: direction,
      commandBuffer: undefined,
      commandType: undefined,
      searchOperator: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : opKeys,
    };
  }

  const matchIdx = matches.findIndex(
    (m) => m.line === targetMatch.line && m.col === targetMatch.col
  );

  const stateWithJump = recordJump({ ...state, cursor: returnCursor });

  return {
    ...stateWithJump,
    ...cleanSearchTemp,
    mode: 'NORMAL',
    cursor: targetPos,
    lastSearchQuery: pattern,
    lastSearchOffset: offset,
    lastSearchDirection: direction,
    hlsearchSuppressed: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('검색 일치 ({v}/{matchesCount}): {pattern}', { v: matchIdx + 1, matchesCount: matches.length, pattern }),
  };
}

/**
 * n / N: 마지막 검색 패턴·방향·오프셋으로 반복합니다. (`?` 검색 뒤의 n 은 위쪽으로)
 */
export function repeatSearch(state: VimEditorState, reverse: boolean): VimEditorState {
  if (!state.lastSearchQuery) {
    return { ...state, pendingKeys: undefined };
  }
  const opts = getOptions(state);
  const matches = findMatches(state.lines, state.lastSearchQuery, opts);
  if (matches.length === 0) {
    return {
      ...state,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {lastSearchQuery}', { lastSearchQuery: state.lastSearchQuery }),
      pendingKeys: undefined,
      bell: true,
    };
  }
  const forward = (state.lastSearchDirection !== 'backward') !== reverse;
  const found = findSearchTarget(state.lines, matches, state.cursor, state.lastSearchOffset, forward)!;
  if (opts.wrapscan === false && found.wrapped) {
    return {
      ...state,
      pendingKeys: undefined,
      bell: true,
      commandMessage: forward
        ? msg('E385: 파일 맨 아래까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: state.lastSearchQuery })
        : msg('E384: 파일 맨 위까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: state.lastSearchQuery }),
    };
  }
  const matchIdx = matches.findIndex((m) => m.line === found.match.line && m.col === found.match.col);
  const stateWithJump = recordJump(state);
  return {
    ...stateWithJump,
    cursor: found.target,
    commandMessage: reverse
      ? msg('이전 검색 결과 ({v}/{matchesCount}): {lastSearchQuery}', { v: matchIdx + 1, matchesCount: matches.length, lastSearchQuery: state.lastSearchQuery })
      : msg('다음 검색 결과 ({v}/{matchesCount}): {lastSearchQuery}', { v: matchIdx + 1, matchesCount: matches.length, lastSearchQuery: state.lastSearchQuery }),
    pendingKeys: undefined,
  };
}

/**
 * SEARCH 모드(/, ?) 키 입력 처리
 */
export function handleSearchModeKey(state: VimEditorState, key: string, isReplayingDot = false): VimEditorState {
  const searchDigraph = handleCmdlineDigraphStep(state, key);
  if (searchDigraph) return applyIncsearchPreview(searchDigraph);

  const searchCtrlR = handleCmdlineCtrlRStep(
    state,
    key,
    state.commandType === '?' ? '?' : '/'
  );
  if (searchCtrlR) return applyIncsearchPreview(searchCtrlR);

  if (isCmdlineCancelKey(key)) {
    const returnCursor =
      state.searchOperator?.initialCursor ?? state.searchOriginCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      insertRegisterPending: undefined,
      searchOperator: undefined,
      searchOriginCursor: undefined,
      searchOriginViewport: undefined,
      incsearchStepOffset: undefined,
    };
  }

  // incsearch 활성 중 Ctrl-g(다음 매치) / Ctrl-t(이전 매치) 실시간 이동
  if (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') {
    return applyIncsearchPreview(state, 1);
  }
  if (key === 'Ctrl-t' || key === 'Ctrl+t' || key === 'ctrl-t' || key === '<C-t>') {
    return applyIncsearchPreview(state, -1);
  }

  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    return openCommandLineWindow(
      { ...state, commandCursorCol: undefined, digraphPending: undefined },
      '/',
      state.commandBuffer
    );
  }

  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p') {
    return applyIncsearchPreview(navigateHistory(state, 'up', '/'));
  }

  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n') {
    return applyIncsearchPreview(navigateHistory(state, 'down', '/'));
  }

  if (isBackspaceKey(key)) {
    if (state.commandBuffer && state.commandBuffer.length > 0) {
      return applyIncsearchPreview(deleteCmdlineCharBackward(state));
    }
    const returnCursor =
      state.searchOperator?.initialCursor ?? state.searchOriginCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      viewport: state.searchOriginViewport ?? state.viewport,
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      searchOperator: undefined,
      searchOriginCursor: undefined,
      searchOriginViewport: undefined,
      incsearchStepOffset: undefined,
    };
  }

  const commonEdit = handleCmdlineCommonEditKey(state, key);
  if (commonEdit) return applyIncsearchPreview(commonEdit);

  if (key === 'Enter') {
    const rawQuery = state.commandBuffer ?? '';
    const nextState = addHistory(
      { ...state, commandCursorCol: undefined, digraphPending: undefined },
      rawQuery,
      '/'
    );
    return executeSearchQuery(nextState, rawQuery, isReplayingDot);
  }

  // 일반 타이핑 문자 삽입 (커서 위치 반영 및 incsearch 실시간 이동)
  if (key.length === 1) {
    return applyIncsearchPreview(insertTextIntoCmdline(state, key));
  }

  return state;
}

/**
 * * / # (wholeWord=true) 및 g* / g# (wholeWord=false) 커서 아래 단어 검색을 수행합니다.
 */
export function executeWordSearch(
  state: VimEditorState,
  direction: 'forward' | 'backward',
  wholeWord = true
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  // Vim find_ident_under_cursor: 커서 아래 키워드, 없으면 커서 뒤 줄 안의 첫 키워드를 쓰고 그 시작에서 찾습니다.
  // 키워드가 없으면 커서 뒤 첫 비공백 문자열(;; 등)을 씁니다. 공백만 남았을 때만 E348 입니다.
  let keywordCol = state.cursor.col;
  while (keywordCol < currentLine.length && !/\w/.test(currentLine[keywordCol])) keywordCol++;
  let word: string | null = null;
  if (keywordCol < currentLine.length) {
    while (keywordCol > 0 && /\w/.test(currentLine[keywordCol - 1])) keywordCol--;
    word = getWordAtCursor(currentLine, keywordCol);
  } else {
    keywordCol = state.cursor.col;
    while (keywordCol < currentLine.length && /\s/.test(currentLine[keywordCol])) keywordCol++;
    word = currentLine.slice(keywordCol).match(/^[^\s\w]+/)?.[0] ?? null;
  }
  if (!word) {
    return { ...state, pendingKeys: undefined, bell: true, commandMessage: msg('E348: 커서 아래에 단어가 없습니다') };
  }
  const searchFrom = { line: state.cursor.line, col: keywordCol };

  const opts = getOptions(state);
  const query = starSearchPattern(word, wholeWord);
  const matches = findMatches(state.lines, query, opts);
  if (matches.length === 0) {
    return {
      ...state,
      lastSearchQuery: query,
      lastSearchOffset: null,
      lastSearchDirection: direction,
      hlsearchSuppressed: undefined,
      pendingKeys: undefined,
      bell: true,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {lastSearchQuery}', { lastSearchQuery: query }),
    };
  }

  const found = findSearchTarget(state.lines, matches, searchFrom, null, direction === 'forward', false)!;
  if (opts.wrapscan === false && found.wrapped) {
    return {
      ...state,
      lastSearchQuery: query,
      lastSearchOffset: null,
      lastSearchDirection: direction,
      hlsearchSuppressed: undefined,
      pendingKeys: undefined,
      bell: true,
      commandMessage:
        direction === 'forward'
          ? msg('E385: 파일 맨 아래까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: query })
          : msg('E384: 파일 맨 위까지 검색했으나 찾지 못했습니다: {pattern}', { pattern: query }),
    };
  }
  const targetMatch = found.match;
  const matchIdx = targetMatch
    ? matches.findIndex((m) => m.line === targetMatch.line && m.col === targetMatch.col)
    : -1;
  const stateWithJump = recordJump(state);

  return {
    ...stateWithJump,
    cursor: targetMatch ? { line: targetMatch.line, col: targetMatch.col } : state.cursor,
    lastSearchQuery: query,
    lastSearchOffset: null,
    lastSearchDirection: direction,
    hlsearchSuppressed: undefined,
    commandMessage:
      direction === 'forward'
        ? msg('단어 \'{word}\' 검색 ({v}/{matchesCount})', { word, v: matchIdx + 1, matchesCount: matches.length })
        : msg('단어 \'{word}\' 역방향 검색 ({v}/{matchesCount})', { word, v: matchIdx + 1, matchesCount: matches.length }),
    pendingKeys: undefined,
  };
}
