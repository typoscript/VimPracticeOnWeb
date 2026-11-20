import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import {
  MAX_REMAP_DEPTH,
  ResolvedKeymap,
  applySilentKeymapResult,
  evaluateExprKeymap,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
  runKeymapTokens,
} from './keymapEngine';
import { findMatchingAbbrev, isAbbrevTriggerKey } from './abbrevEngine';
import {
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
  startFilenameCompletion,
  startWholeLineCompletion,
} from './completion';
import { getOptions } from './setEngine';
import { recordChangePosition } from './advancedMotions';
import {
  AbbrevReplayCtx,
  INITIAL_ABBREV_CTX,
  DispatchKeyFn,
  insertTextAtCursor,
} from './engineHelpers';
import {
  resolveLastInsertedText,
  handleInsertLiteralNext,
  handleInsertDigraph,
  handleInsertRegister,
  handleInsertEscape,
  handleInsertLastInserted,
} from './insertSpecialKeys';

function trimInsertText(text: string | undefined, count: number): string | undefined {
  if (!text || count <= 0) return text;
  return text.slice(0, Math.max(0, text.length - count));
}

function appendCurrentChange(
  state: VimEditorState,
  k: string,
  isReplayingDot: boolean
): string[] | undefined {
  if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
  return [...state.currentChangeKeys, k];
}

/** col === 0 && line > 0 에서 윗줄과 현재 줄을 병합합니다 (Ctrl-w, Ctrl-u, Backspace 공통). */
function mergeWithPreviousLine(
  state: VimEditorState,
  nextChangeKeys: string[] | undefined
): VimEditorState {
  const { line } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const prevLine = state.lines[line - 1] ?? '';
  const nextLines = [
    ...state.lines.slice(0, line - 1),
    prevLine + currentLine,
    ...state.lines.slice(line + 1),
  ];
  return {
    ...state,
    lines: nextLines,
    cursor: { line: line - 1, col: prevLine.length },
    currentChangeKeys: nextChangeKeys,
    currentInsertText: trimInsertText(state.currentInsertText, 1),
  };
}

/**
 * Insert 모드에서 현재 줄의 선행 들여쓰기를 shiftwidth 단위로 증감합니다 (Ctrl-t / Ctrl-d).
 */
function adjustInsertLineIndent(
  state: VimEditorState,
  currentLine: string,
  deltaSign: 1 | -1,
  nextChangeKeys?: string[]
): VimEditorState {
  const { line, col } = state.cursor;
  const opts = getOptions(state);
  const sw = Math.max(1, opts.shiftwidth || 2);
  const ts = Math.max(1, opts.tabstop || 2);
  const et = opts.expandtab !== false;
  const match = currentLine.match(/^[ \t]*/);
  const oldLeading = match ? match[0] : '';
  let width = 0;
  for (const ch of oldLeading) {
    width += ch === '\t' ? ts - (width % ts) : 1;
  }
  const targetWidth =
    deltaSign > 0
      ? Math.floor(width / sw + 1) * sw
      : width === 0
        ? 0
        : Math.max(0, Math.ceil(width / sw - 1) * sw);
  const newLeading = et
    ? ' '.repeat(targetWidth)
    : '\t'.repeat(Math.floor(targetWidth / ts)) + ' '.repeat(targetWidth % ts);
  const newLine = newLeading + currentLine.slice(oldLeading.length);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;
  const deltaLen = newLeading.length - oldLeading.length;
  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: Math.max(0, Math.min(newLine.length, col + deltaLen)) },
    currentChangeKeys: nextChangeKeys,
  };
}

export function applyInsertAbbrev(
  state: VimEditorState,
  triggerKey: string,
  isReplayingDot: boolean,
  macroDepth: number,
  abbrevCtx: AbbrevReplayCtx,
  dispatchKey: DispatchKeyFn
): VimEditorState | null {
  if (abbrevCtx.depth >= 20) return null;
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const match = findMatchingAbbrev(state, 'i', currentLine.slice(0, col), triggerKey, abbrevCtx.seen);
  if (!match) return null;

  const startCol = col - match.lhsLen;
  const nextLines = [...state.lines];
  nextLines[line] = currentLine.slice(0, startCol) + currentLine.slice(col);

  const nextBlock = state.blockInsertSession
    ? {
        ...state.blockInsertSession,
        typedChars: state.blockInsertSession.typedChars.slice(
          0,
          Math.max(0, state.blockInsertSession.typedChars.length - match.lhsLen)
        ),
      }
    : undefined;

  const nextChangeKeys =
    !isReplayingDot && state.currentChangeKeys
      ? state.currentChangeKeys.slice(0, Math.max(0, state.currentChangeKeys.length - match.lhsLen))
      : state.currentChangeKeys;

  let s: VimEditorState = {
    ...state,
    lines: nextLines,
    cursor: { line, col: startCol },
    pendingKeys: undefined,
    blockInsertSession: nextBlock,
    currentChangeKeys: nextChangeKeys,
  };

  const nextCtx: AbbrevReplayCtx = match.entry.noremap
    ? { depth: 99, seen: abbrevCtx.seen }
    : { depth: abbrevCtx.depth + 1, seen: new Set([...abbrevCtx.seen, match.entry.lhs]) };

  const tokens = parseKeySequence(match.entry.rhs, state.leaderKey || ' ');
  for (const tok of tokens) {
    s = dispatchKey(s, tok, isReplayingDot, macroDepth, nextCtx);
    if (s.bell) break;
  }

  if (
    triggerKey !== 'Ctrl-]' &&
    triggerKey !== 'Ctrl+]' &&
    triggerKey !== 'ctrl-]' &&
    triggerKey !== '<C-]>'
  ) {
    s = dispatchKey(s, triggerKey, isReplayingDot, macroDepth, nextCtx);
  }
  return s;
}

/** INSERT 모드 커스텀 키매핑 실행 (<Esc> 특수 복귀 및 일반 토큰 재생) */
function executeInsertMapped(
  state: VimEditorState,
  resolved: ResolvedKeymap,
  stripPendingCount: number,
  dispatchKey: DispatchKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const prevMsg = state.commandMessage;
  const rhs = resolved.expr ? evaluateExprKeymap(state, resolved.rhs) : resolved.rhs;
  const baseLine =
    stripPendingCount > 0
      ? currentLine.slice(0, Math.max(0, col - stripPendingCount)) + currentLine.slice(col)
      : currentLine;
  const nextLines = stripPendingCount > 0 ? [...state.lines] : state.lines;
  if (stripPendingCount > 0) nextLines[line] = baseLine;
  const baseCol = Math.max(0, col - stripPendingCount);

  if (rhs === '<Esc>' || rhs === '<esc>' || rhs === 'Escape') {
    const nextCol = Math.max(0, baseCol - 1);
    let nextLastChange = state.lastChangeKeys;
    if (!isReplayingDot && state.currentChangeKeys) {
      nextLastChange = [
        ...(stripPendingCount > 0
          ? state.currentChangeKeys.slice(0, -stripPendingCount)
          : state.currentChangeKeys),
        'Escape',
      ];
    }
    const lastPos = { line, col: nextCol, row: line };
    const changeRecord = recordChangePosition(state.changeList, { line, col: nextCol });
    const cleanedInsert =
      stripPendingCount > 0 &&
      state.pendingKeys &&
      (state.currentInsertText ?? '').endsWith(state.pendingKeys)
        ? (state.currentInsertText ?? '').slice(0, -state.pendingKeys.length)
        : state.currentInsertText;

    return applySilentKeymapResult(
      prevMsg,
      {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line, col: nextCol }, 'NORMAL'),
        pendingKeys: undefined,
        digraphPending: undefined,
        lastChangeKeys: nextLastChange,
        currentChangeKeys: undefined,
        lastInsertedText: resolveLastInsertedText(state, cleanedInsert),
        currentInsertText: undefined,
        lastInsertPos: lastPos,
        changeList: changeRecord.changeList,
        changeIndex: changeRecord.changeIndex,
        marks: { ...(state.marks ?? {}), '^': { row: line, col: nextCol } },
      },
      resolved.silent
    );
  }

  const startBase: VimEditorState = {
    ...state,
    lines: nextLines,
    cursor: { line, col: baseCol },
    pendingKeys: undefined,
  };
  return runKeymapTokens(startBase, resolved, macroDepth, (runState, evalRhs) => {
    const tokens = parseKeySequence(evalRhs, state.leaderKey || ' ');
    let s: VimEditorState = runState;
    for (const tok of tokens) {
      s = dispatchKey(s, tok, isReplayingDot, Math.max(1, macroDepth + 1));
      if (s.bell) break;
    }
    return s;
  });
}

function tryHandleInsertKeymap(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): VimEditorState | null {
  if (state.keymapsDisabled || macroDepth > MAX_REMAP_DEPTH) return null;
  if (state.pendingKeys) {
    const resolved = resolveKeymapWithMeta(state, 'i', `${state.pendingKeys}${key}`);
    return resolved
      ? executeInsertMapped(state, resolved, state.pendingKeys.length, dispatchKey, isReplayingDot, macroDepth)
      : null;
  }
  const resolved = resolveKeymapWithMeta(state, 'i', key);
  return resolved
    ? executeInsertMapped(state, resolved, 0, dispatchKey, isReplayingDot, macroDepth)
    : null;
}

/** ^X 서브모드 및 인버퍼 자동완성(Ctrl-n/p/e/y/Arrow) 처리 */
function handleInsertCompletionStep(
  state: VimEditorState,
  key: string
): { handled: boolean; state: VimEditorState } {
  const { line, col } = state.cursor;

  if (key === 'Ctrl-x' || key === 'Ctrl+x') {
    return { handled: true, state: { ...state, insertCtrlXMode: true, commandMessage: undefined } };
  }

  if (state.insertCtrlXMode) {
    if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'f') {
      return { handled: true, state: startFilenameCompletion(state, 'next') };
    }
    if (key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'l') {
      return { handled: true, state: startWholeLineCompletion(state, 'next') };
    }
    if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'n') {
      return { handled: true, state: startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'next') };
    }
    if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'p') {
      return { handled: true, state: startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'prev') };
    }
    if (key === 'Escape' || key === 'Ctrl-e' || key === 'Ctrl+e') {
      return { handled: true, state: { ...state, insertCtrlXMode: false } };
    }
    state = { ...state, insertCtrlXMode: false };
  }

  if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'Alt-n' || key === 'Alt+n') {
    return { handled: true, state: startOrCycleCompletion(state, 'next') };
  }
  if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'Alt-p' || key === 'Alt+p') {
    return { handled: true, state: startOrCycleCompletion(state, 'prev') };
  }
  if (key === 'Ctrl-e' || key === 'Ctrl+e') {
    if (state.completionSession) return { handled: true, state: cancelCompletion(state) };
    const belowLine = state.lines[line + 1];
    return {
      handled: true,
      state: belowLine !== undefined && col < belowLine.length ? insertTextAtCursor(state, belowLine[col]) : state,
    };
  }
  if (key === 'Ctrl-y' || key === 'Ctrl+y' || (key === 'Enter' && state.completionSession)) {
    if (state.completionSession) return { handled: true, state: acceptCompletion(state) };
    const aboveLine = state.lines[line - 1];
    return {
      handled: true,
      state: aboveLine !== undefined && col < aboveLine.length ? insertTextAtCursor(state, aboveLine[col]) : state,
    };
  }

  if (state.completionSession) {
    if (key === 'ArrowDown') return { handled: true, state: startOrCycleCompletion(state, 'next') };
    if (key === 'ArrowUp') return { handled: true, state: startOrCycleCompletion(state, 'prev') };
    state = { ...state, completionSession: null };
  }

  return { handled: false, state };
}

/** INSERT 모드 편집 키(들여쓰기, 단어/줄/문자 삭제, Enter, Tab, 방향키, 문자 입력) 처리 */
function handleInsertEditingKey(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // Ctrl+t / Ctrl+d: 현재 줄 들여쓰기 증감
  if (key === 'Ctrl-t' || key === 'Ctrl+t' || key === 'Alt-t' || key === 'Alt+t') {
    return adjustInsertLineIndent(state, currentLine, 1, appendCurrentChange(state, 'Ctrl-t', isReplayingDot));
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'Alt-d' || key === 'Alt+d') {
    return adjustInsertLineIndent(state, currentLine, -1, appendCurrentChange(state, 'Ctrl-d', isReplayingDot));
  }

  // Ctrl+w: 커서 앞의 단어 하나 즉시 삭제
  if (key === 'Ctrl-w' || key === 'Ctrl+w' || key === 'Alt-w' || key === 'Alt+w') {
    const nextChangeKeys = appendCurrentChange(state, 'Ctrl-w', isReplayingDot);
    if (col === 0 && line > 0) return mergeWithPreviousLine(state, nextChangeKeys);
    if (col > 0) {
      let start = col;
      while (start > 0 && /\s/.test(currentLine[start - 1])) start--;
      if (start > 0) {
        const isWordChar = /\w/.test(currentLine[start - 1]);
        while (
          start > 0 &&
          (isWordChar
            ? /\w/.test(currentLine[start - 1])
            : !/\w/.test(currentLine[start - 1]) && !/\s/.test(currentLine[start - 1]))
        ) {
          start--;
        }
      }
      const nextLines = [...state.lines];
      nextLines[line] = currentLine.slice(0, start) + currentLine.slice(col);
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: start },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: trimInsertText(state.currentInsertText, col - start),
      };
    }
    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Ctrl+u: 현재 줄의 커서 앞쪽 내용을 줄 시작까지 통째로 삭제
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'Alt-u' || key === 'Alt+u') {
    const nextChangeKeys = appendCurrentChange(state, 'Ctrl-u', isReplayingDot);
    if (col === 0 && line > 0) return mergeWithPreviousLine(state, nextChangeKeys);
    const nextLines = [...state.lines];
    nextLines[line] = currentLine.slice(col);
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: 0 },
      currentChangeKeys: nextChangeKeys,
      currentInsertText: trimInsertText(state.currentInsertText, col),
    };
  }

  // Backspace 또는 Ctrl+h: 이전 문자 삭제 또는 윗줄과 병합
  if (
    key === 'Backspace' ||
    key === 'Ctrl-h' ||
    key === 'Ctrl+h' ||
    key === 'Alt-h' ||
    key === 'Alt+h'
  ) {
    if (state.blockInsertSession) {
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: state.blockInsertSession.typedChars.slice(0, -1),
        },
      };
    }
    const nextChangeKeys = appendCurrentChange(state, 'Backspace', isReplayingDot);
    if (col > 0) {
      const nextLines = [...state.lines];
      nextLines[line] = currentLine.slice(0, col - 1) + currentLine.slice(col);
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col - 1 },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: trimInsertText(state.currentInsertText, 1),
      };
    }
    if (col === 0 && line > 0) return mergeWithPreviousLine(state, nextChangeKeys);
    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Enter: 줄 분할 및 다음 줄 맨 앞으로 이동
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange(state, 'Enter', isReplayingDot);
    const nextLines = [
      ...state.lines.slice(0, line),
      currentLine.slice(0, col),
      currentLine.slice(col),
      ...state.lines.slice(line + 1),
    ];
    return {
      ...state,
      lines: nextLines,
      cursor: { line: line + 1, col: 0 },
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + '\n',
    };
  }

  // Tab: 들여쓰기 삽입
  if (key === 'Tab') {
    const nextChangeKeys = appendCurrentChange(state, 'Tab', isReplayingDot);
    const opts = getOptions(state);
    const ts = opts.tabstop || opts.shiftwidth || 2;
    const indent = opts.expandtab !== false ? ' '.repeat(ts) : '\t';
    if (state.blockInsertSession) {
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: [...state.blockInsertSession.typedChars, ...indent.split('')],
        },
      };
    }
    const nextLines = [...state.lines];
    nextLines[line] = currentLine.slice(0, col) + indent + currentLine.slice(col);
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + indent.length },
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + indent,
    };
  }

  // 방향키 이동
  if (key === 'ArrowLeft') {
    return { ...state, cursor: { line, col: Math.max(0, col - 1) } };
  }
  if (key === 'ArrowRight') {
    return { ...state, cursor: { line, col: Math.min(currentLine.length, col + 1) } };
  }
  if (key === 'ArrowUp') {
    const targetLine = Math.max(0, line - 1);
    return { ...state, cursor: { line: targetLine, col: Math.min(col, (state.lines[targetLine] ?? '').length) } };
  }
  if (key === 'ArrowDown') {
    const targetLine = Math.min(state.lines.length - 1, line + 1);
    return { ...state, cursor: { line: targetLine, col: Math.min(col, (state.lines[targetLine] ?? '').length) } };
  }

  // 일반 타이핑 문자 입력
  if (key.length === 1) {
    if (state.blockInsertSession) {
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: [...state.blockInsertSession.typedChars, key],
        },
      };
    }
    const nextChangeKeys = appendCurrentChange(state, key, isReplayingDot);
    const nextLines = [...state.lines];
    nextLines[line] = currentLine.slice(0, col) + key + currentLine.slice(col);
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
      pendingKeys: isKeymapPrefix(state, 'i', key) ? key : undefined,
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + key,
    };
  }

  return state;
}

/**
 * INSERT 모드 키 입력 처리
 */
export function handleInsertModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  isReplayingDot = false,
  macroDepth = 0,
  abbrevCtx: AbbrevReplayCtx = INITIAL_ABBREV_CTX
): VimEditorState {
  if (key === 'Timeout') {
    return {
      ...state,
      pendingKeys: undefined,
      insertRegisterPending: undefined,
      literalNextPending: undefined,
      digraphPending: undefined,
    };
  }

  const literalRes = handleInsertLiteralNext(state, key, isReplayingDot);
  if (literalRes.handled) return literalRes.state;
  state = literalRes.state;

  const digraphRes = handleInsertDigraph(state, key, isReplayingDot);
  if (digraphRes.handled) return digraphRes.state;
  state = digraphRes.state;

  const regRes = handleInsertRegister(state, key, isReplayingDot);
  if (regRes) return regRes;

  const mappedRes = tryHandleInsertKeymap(state, key, dispatchKey, isReplayingDot, macroDepth);
  if (mappedRes) return mappedRes;

  const compRes = handleInsertCompletionStep(state, key);
  if (compRes.handled) return compRes.state;
  state = compRes.state;

  // Ctrl-]: 수동 약어 확장 / 비단어 트리거 자동 약어 확장
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    return applyInsertAbbrev(state, 'Ctrl-]', isReplayingDot, macroDepth, abbrevCtx, dispatchKey) ?? state;
  }
  if (isAbbrevTriggerKey(key, true)) {
    const expanded = applyInsertAbbrev(state, key, isReplayingDot, macroDepth, abbrevCtx, dispatchKey);
    if (expanded) return expanded;
  }

  // Ctrl+o: 일회성 Normal 명령 실행 (INSERT (normal))
  if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'Alt-o' || key === 'Alt+o') {
    return {
      ...state,
      mode: 'NORMAL',
      insertNormalSession: true,
      cursor: clampCursor(state.lines, state.cursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  if (key === 'Escape') {
    return handleInsertEscape(state, isReplayingDot);
  }

  const lastInsertedRes = handleInsertLastInserted(state, key, isReplayingDot);
  if (lastInsertedRes) return lastInsertedRes;

  return handleInsertEditingKey(state, key, isReplayingDot);
}

export { handleReplaceModeKey } from './replaceMode';
