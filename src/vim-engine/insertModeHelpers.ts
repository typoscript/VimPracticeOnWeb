/**
 * INSERT 모드 보조 함수: 표시 폭·소프트탭 계산, 변경 키 기록, 줄 병합·들여쓰기, 약어 확장, 키매핑 실행, 자동완성 단계 (insertMode.ts 에서 분리)
 */
import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { executeCommandLine } from './commandLine';
import { MAX_REMAP_DEPTH, ResolvedKeymap, applySilentKeymapResult, evaluateExprKeymap, executeCmdSegment, isKeymapPrefix, parseKeySequence, resolveKeymapWithMeta, runKeymapTokens, splitCmdSegments } from './keymapEngine';
import { findMatchingAbbrev } from './abbrevEngine';
import { startOrCycleCompletion, cancelCompletion, acceptCompletion, startFilenameCompletion, startWholeLineCompletion, startDictionaryCompletion, startTagCompletion, startOmniCompletion, startVimCommandCompletion, startSpellCompletion } from './completion';
import { buildProjectTags } from './tagEngine';
import { getSpellSuggestions } from './spellEngine';
import { getOptions } from './setEngine';
import { startCmpCompletion, acceptCmpCompletion } from './cmpEngine';
import { recordChangePosition } from './advancedMotions';
import { AbbrevReplayCtx, DispatchKeyFn, insertTextAtCursor } from './engineHelpers';
import { resolveLastInsertedText } from './insertSpecialKeys';
import { AVAILABLE_COMMANDS, BUILTIN_VIM_FUNCTIONS } from './wildmenuCatalog';

export function displayWidthOf(text: string, ts: number): number {
  let w = 0;
  for (const ch of text) {
    w += ch === '\t' ? ts - (w % ts) : 1;
  }
  return w;
}

export function resolveSofttabstop(opts: { softtabstop?: number; shiftwidth?: number }): number {
  const raw = opts.softtabstop ?? 0;
  if (raw < 0) return Math.max(1, opts.shiftwidth || 2);
  return raw;
}

export function trimInsertText(text: string | undefined, count: number): string | undefined {
  if (!text || count <= 0) return text;
  return text.slice(0, Math.max(0, text.length - count));
}

export function appendCurrentChange(
  state: VimEditorState,
  k: string,
  isReplayingDot: boolean
): string[] | undefined {
  if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
  return [...state.currentChangeKeys, k];
}

/** col === 0 && line > 0 에서 윗줄과 현재 줄을 병합합니다 (Ctrl-w, Ctrl-u, Backspace 공통). */
export function mergeWithPreviousLine(
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
export function adjustInsertLineIndent(
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

  const prevMsg = state.commandMessage;
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

  const nextInsertText = trimInsertText(state.currentInsertText, match.lhsLen);

  let s: VimEditorState = {
    ...state,
    lines: nextLines,
    cursor: { line, col: startCol },
    pendingKeys: undefined,
    blockInsertSession: nextBlock,
    currentChangeKeys: nextChangeKeys,
    currentInsertText: nextInsertText,
  };

  const runEx = (st: VimEditorState, cmd: string) =>
    executeCommandLine(st, cmd, (s0, k0) => dispatchKey(s0, k0, isReplayingDot, 0));

  const evaluatedRhs = match.entry.expr
    ? evaluateExprKeymap(s, match.entry.rhs, runEx)
    : match.entry.rhs;

  const nextCtx: AbbrevReplayCtx = match.entry.noremap
    ? { depth: 99, seen: abbrevCtx.seen }
    : { depth: abbrevCtx.depth + 1, seen: new Set([...abbrevCtx.seen, match.entry.lhs]) };

  const leaderKey = state.leaderKey || ' ';
  for (const seg of splitCmdSegments(evaluatedRhs)) {
    if (seg.kind === 'cmd') {
      s = executeCmdSegment(s, seg.command, runEx);
    } else {
      const tokens = parseKeySequence(seg.text, leaderKey);
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, macroDepth, nextCtx);
        if (s.bell) break;
      }
    }
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
  return applySilentKeymapResult(prevMsg, s, match.entry.silent);
}

/** INSERT 모드 커스텀 키매핑 실행 (<Esc> 특수 복귀 및 일반 토큰 재생) */
export function executeInsertMapped(
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
  const runEx = (s: VimEditorState, cmd: string) =>
    executeCommandLine(s, cmd, (st, k) => dispatchKey(st, k, isReplayingDot, 0));
  return runKeymapTokens(
    startBase,
    resolved,
    macroDepth,
    (runState, evalRhs) => {
      const tokens = parseKeySequence(evalRhs, state.leaderKey || ' ');
      let s: VimEditorState = runState;
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, Math.max(1, macroDepth + 1));
        if (s.bell) break;
      }
      return s;
    },
    runEx
  );
}

export function tryHandleInsertKeymap(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): VimEditorState | null {
  if (state.keymapsDisabled || macroDepth > MAX_REMAP_DEPTH) return null;
  if (state.pendingKeys) {
    if (key === 'Timeout') {
      const prevResolved = resolveKeymapWithMeta(state, 'i', state.pendingKeys);
      if (prevResolved) {
        return executeInsertMapped(state, prevResolved, state.pendingKeys.length, dispatchKey, isReplayingDot, macroDepth);
      }
      return null;
    }
    const combined = `${state.pendingKeys}${key}`;
    const resolved = resolveKeymapWithMeta(state, 'i', combined);
    if (resolved && (!isKeymapPrefix(state, 'i', combined) || resolved.nowait)) {
      return executeInsertMapped(state, resolved, state.pendingKeys.length, dispatchKey, isReplayingDot, macroDepth);
    }
    if (!isKeymapPrefix(state, 'i', combined)) {
      const prevResolved = resolveKeymapWithMeta(state, 'i', state.pendingKeys);
      if (prevResolved) {
        const afterPrev = executeInsertMapped(state, prevResolved, state.pendingKeys.length, dispatchKey, isReplayingDot, macroDepth);
        return dispatchKey(afterPrev, key, isReplayingDot, macroDepth);
      }
    }
    return null;
  }
  const resolved = resolveKeymapWithMeta(state, 'i', key);
  if (resolved && (!isKeymapPrefix(state, 'i', key) || resolved.nowait)) {
    return executeInsertMapped(state, resolved, 0, dispatchKey, isReplayingDot, macroDepth);
  }
  return null;
}

/** ^X 서브모드 및 인버퍼 자동완성(Ctrl-n/p/e/y/Arrow) 처리 */
export function handleInsertCompletionStep(
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
    if (key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ctrl-k' || key === 'k') {
      return { handled: true, state: startDictionaryCompletion(state, 'next') };
    }
    if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>' || key === ']') {
      const tagNames = buildProjectTags(state).map((t) => t.name);
      return { handled: true, state: startTagCompletion(state, tagNames, 'next') };
    }
    if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'ctrl-o' || key === '<C-o>' || key === 'o') {
      const tagNames = buildProjectTags(state).map((t) => t.name);
      return { handled: true, state: startOmniCompletion(state, tagNames, 'next') };
    }
    if (key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>' || key === 'v') {
      return {
        handled: true,
        state: startVimCommandCompletion(state, [...AVAILABLE_COMMANDS, ...BUILTIN_VIM_FUNCTIONS], 'next'),
      };
    }
    if (key === 'Ctrl-s' || key === 'Ctrl+s' || key === 'ctrl-s' || key === '<C-s>' || key === 's') {
      const currentLine = state.lines[line] ?? '';
      const before = currentLine.slice(0, col);
      const wordMatch = before.match(/[A-Za-z]+$/);
      const suggestions = wordMatch ? getSpellSuggestions(wordMatch[0], state, 12) : [];
      return { handled: true, state: startSpellCompletion(state, suggestions, 'next') };
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

  if (key === 'Ctrl-Space' || key === 'Ctrl+Space' || key === 'Ctrl- ' || key === '<C-Space>') {
    return { handled: true, state: startCmpCompletion(state, 'next') };
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
  if (
    key === 'Ctrl-y' ||
    key === 'Ctrl+y' ||
    ((key === 'Enter' || (key === 'Tab' && state.completionSession?.type === 'cmp')) &&
      state.completionSession)
  ) {
    if (state.completionSession) {
      return {
        handled: true,
        state:
          state.completionSession.type === 'cmp'
            ? acceptCmpCompletion(state)
            : acceptCompletion(state),
      };
    }
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
