import { VimEditorState, CursorPosition } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { syncRegisters } from './registers';
import {
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
import { addHistory, navigateHistory, openCommandLineWindow } from './cmdlineWindow';
import {
  insertTextIntoCmdline,
  deleteCmdlineCharBackward,
  handleCmdlineDigraphStep,
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

  const matches = findMatches(state.lines, state.lastSearchQuery, state.options);
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
 * 검색 쿼리 문자열을 파싱 및 실행합니다.
 */
export function executeSearchQuery(
  state: VimEditorState,
  rawQuery: string,
  isReplayingDot = false
): VimEditorState {
  if (rawQuery.length === 0) {
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
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
  const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
  const failBase = {
    ...state,
    mode: 'NORMAL' as const,
    cursor: returnCursor,
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

  const matches = findMatches(state.lines, pattern, state.options);
  if (matches.length === 0) {
    return {
      ...failBase,
      lastSearchQuery: pattern,
      lastSearchOffset: offset,
      lastSearchDirection: direction,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }),
    };
  }

  const found = findSearchTarget(state.lines, matches, returnCursor, offset, !backward, true)!;
  const targetMatch = found.match;
  const targetPos = found.target;

  // 연산자(d/pat/e, c?pat?b, y/pat/+1 등) 결합 처리
  if (state.searchOperator) {
    const op = state.searchOperator.op;
    const startPos = state.searchOperator.initialCursor;
    const isLinewise = offset?.type === 'line';

    const res = executeSearchOperator(state, op, startPos, targetPos, isLinewise, offset?.type === 'end');
    const synced = syncRegisters(state, res, op === 'y');
    const opKeys = [op, delimChar, ...rawQuery.split(''), 'Enter'];

    if (op === 'c') {
      return {
        ...synced,
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

  const stateWithJump = recordJump(state);

  return {
    ...stateWithJump,
    mode: 'NORMAL',
    cursor: targetPos,
    lastSearchQuery: pattern,
    lastSearchOffset: offset,
    lastSearchDirection: direction,
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
  const matches = findMatches(state.lines, state.lastSearchQuery, state.options);
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
  if (searchDigraph) return searchDigraph;

  if (isCmdlineCancelKey(key)) {
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      searchOperator: undefined,
    };
  }

  if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'ctrl-f') {
    return openCommandLineWindow(
      { ...state, commandCursorCol: undefined, digraphPending: undefined },
      '/',
      state.commandBuffer
    );
  }

  if (key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p') {
    return navigateHistory(state, 'up', '/');
  }

  if (key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n') {
    return navigateHistory(state, 'down', '/');
  }

  if (isBackspaceKey(key)) {
    if (state.commandBuffer && state.commandBuffer.length > 0) {
      return deleteCmdlineCharBackward(state);
    }
    const returnCursor = state.searchOperator?.initialCursor ?? state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: returnCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandCursorCol: undefined,
      digraphPending: undefined,
      searchOperator: undefined,
    };
  }

  const commonEdit = handleCmdlineCommonEditKey(state, key);
  if (commonEdit) return commonEdit;

  if (key === 'Enter') {
    const rawQuery = state.commandBuffer ?? '';
    const nextState = addHistory(
      { ...state, commandCursorCol: undefined, digraphPending: undefined },
      rawQuery,
      '/'
    );
    return executeSearchQuery(nextState, rawQuery, isReplayingDot);
  }

  // 일반 타이핑 문자 삽입 (커서 위치 반영)
  if (key.length === 1) {
    return insertTextIntoCmdline(state, key);
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
  const word = getWordAtCursor(currentLine, state.cursor.col);
  if (!word) {
    return { ...state, pendingKeys: undefined, bell: true, commandMessage: msg('E348: 커서 아래에 단어가 없습니다') };
  }

  const query = starSearchPattern(word, wholeWord);
  const matches = findMatches(state.lines, query, state.options);
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

  const targetMatch =
    direction === 'forward'
      ? findNextMatch(matches, state.cursor) ?? matches[0]
      : findPrevMatch(matches, state.cursor) ?? matches[matches.length - 1];
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
