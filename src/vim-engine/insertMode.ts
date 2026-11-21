import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { executeCommandLine } from './commandLine';
import {
  MAX_REMAP_DEPTH,
  ResolvedKeymap,
  applySilentKeymapResult,
  evaluateExprKeymap,
  executeCmdSegment,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
  runKeymapTokens,
  splitCmdSegments,
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
import { parseWhichwrapFlags } from './setOptionsCore';
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

function displayWidthOf(text: string, ts: number): number {
  let w = 0;
  for (const ch of text) {
    w += ch === '\t' ? ts - (w % ts) : 1;
  }
  return w;
}

function resolveSofttabstop(opts: { softtabstop?: number; shiftwidth?: number }): number {
  const raw = opts.softtabstop ?? 0;
  if (raw < 0) return Math.max(1, opts.shiftwidth || 2);
  return raw;
}

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

function tryHandleInsertKeymap(
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
    if (col === 0 && line > 0 && !state.blockInsertSession) return mergeWithPreviousLine(state, nextChangeKeys);
    if (col > 0) {
      let start = col;
      if (state.blockInsertSession) {
        const minBound = state.blockInsertSession.col;
        while (start > minBound && /\s/.test(currentLine[start - 1])) start--;
        if (start > minBound) {
          const isWordChar = /\w/.test(currentLine[start - 1]);
          while (
            start > minBound &&
            (isWordChar
              ? /\w/.test(currentLine[start - 1])
              : !/\w/.test(currentLine[start - 1]) && !/\s/.test(currentLine[start - 1]))
          ) {
            start--;
          }
        }
        const removedCount = col - start;
        state = {
          ...state,
          blockInsertSession: {
            ...state.blockInsertSession,
            typedChars: state.blockInsertSession.typedChars.slice(
              0,
              Math.max(0, state.blockInsertSession.typedChars.length - removedCount)
            ),
          },
        };
      } else {
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

  // Ctrl+u: 현재 줄의 커서 앞쪽 내용을 줄 시작(블록 삽입 시에는 블록 삽입 시작 열)까지 통째로 삭제
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'Alt-u' || key === 'Alt+u') {
    const nextChangeKeys = appendCurrentChange(state, 'Ctrl-u', isReplayingDot);
    if (state.blockInsertSession) {
      const minBound = state.blockInsertSession.col;
      if (col > minBound) {
        const nextLines = [...state.lines];
        nextLines[line] = currentLine.slice(0, minBound) + currentLine.slice(col);
        return {
          ...state,
          lines: nextLines,
          cursor: { line, col: minBound },
          blockInsertSession: {
            ...state.blockInsertSession,
            typedChars: [],
          },
          currentChangeKeys: nextChangeKeys,
          currentInsertText: trimInsertText(state.currentInsertText, col - minBound),
        };
      }
      return { ...state, currentChangeKeys: nextChangeKeys };
    }
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
      if (col <= state.blockInsertSession.col) {
        return state;
      }
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
      const opts = getOptions(state);
      const sts = resolveSofttabstop(opts);
      let deleteFrom = col - 1;
      if (sts > 0 && !state.blockInsertSession && currentLine[col - 1] === ' ') {
        const ts = Math.max(1, opts.tabstop || 2);
        const vcol = displayWidthOf(currentLine.slice(0, col), ts);
        const targetVcol = Math.max(0, Math.floor((vcol - 1) / sts) * sts);
        deleteFrom = col;
        while (
          deleteFrom > 0 &&
          currentLine[deleteFrom - 1] === ' ' &&
          displayWidthOf(currentLine.slice(0, deleteFrom), ts) > targetVcol
        ) {
          deleteFrom--;
        }
        if (deleteFrom === col) deleteFrom = col - 1;
      }
      const removed = col - deleteFrom;
      const nextLines = [...state.lines];
      nextLines[line] = currentLine.slice(0, deleteFrom) + currentLine.slice(col);
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: deleteFrom },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: trimInsertText(state.currentInsertText, removed),
      };
    }
    if (col === 0 && line > 0) return mergeWithPreviousLine(state, nextChangeKeys);
    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Enter: 줄 분할 및 다음 줄 이동 (autoindent / smartindent 지원, 비주얼 블록 삽입 중 Enter 입력 시 다중 줄 세션 해제)
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange(state, 'Enter', isReplayingDot);
    const opts = getOptions(state);
    const beforeCursor = currentLine.slice(0, col);
    const afterCursor = currentLine.slice(col);
    let indent = '';
    let nextLineBody = afterCursor;
    if (opts.autoindent || opts.smartindent) {
      const baseIndent = beforeCursor.match(/^[ \t]*/)?.[0] ?? '';
      if (opts.smartindent && beforeCursor.trimEnd().endsWith('{')) {
        const sw = opts.shiftwidth || 2;
        const unit = opts.expandtab !== false ? ' '.repeat(sw) : '\t';
        indent = baseIndent + unit;
      } else {
        indent = baseIndent;
      }
      nextLineBody = afterCursor.replace(/^[ \t]+/, '');
    }
    const nextLines = [
      ...state.lines.slice(0, line),
      beforeCursor,
      indent + nextLineBody,
      ...state.lines.slice(line + 1),
    ];
    return {
      ...state,
      lines: nextLines,
      cursor: { line: line + 1, col: indent.length },
      blockInsertSession: null,
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + '\n',
    };
  }

  // Tab: 들여쓰기 삽입 (softtabstop / expandtab / tabstop 지원)
  if (key === 'Tab') {
    const nextChangeKeys = appendCurrentChange(state, 'Tab', isReplayingDot);
    const opts = getOptions(state);
    const ts = Math.max(1, opts.tabstop || opts.shiftwidth || 2);
    const sts = resolveSofttabstop(opts);

    if (sts > 0) {
      const vcol = displayWidthOf(currentLine.slice(0, col), ts);
      const targetVcol = Math.floor(vcol / sts + 1) * sts;
      if (opts.expandtab !== false) {
        const indent = ' '.repeat(targetVcol - vcol);
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
      // noexpandtab + softtabstop: 직전 공백과 합쳐 tabstop 단위는 \t 로, 나머지는 공백으로 채움
      let spaceStart = col;
      while (spaceStart > 0 && currentLine[spaceStart - 1] === ' ') spaceStart--;
      let curV = displayWidthOf(currentLine.slice(0, spaceStart), ts);
      let replacement = '';
      while (curV + (ts - (curV % ts)) <= targetVcol) {
        replacement += '\t';
        curV += ts - (curV % ts);
      }
      if (curV < targetVcol) {
        replacement += ' '.repeat(targetVcol - curV);
      }
      const nextLines = [...state.lines];
      nextLines[line] = currentLine.slice(0, spaceStart) + replacement + currentLine.slice(col);
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: spaceStart + replacement.length },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: (state.currentInsertText ?? '') + replacement,
      };
    }

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

  // 방향키 이동 (whichwrap '[' / ']' 지원)
  if (key === 'ArrowLeft') {
    if (col > 0) {
      return { ...state, cursor: { line, col: col - 1 } };
    }
    if (line > 0 && parseWhichwrapFlags(getOptions(state).whichwrap).has('[')) {
      const prevLine = state.lines[line - 1] ?? '';
      return { ...state, cursor: { line: line - 1, col: prevLine.length } };
    }
    return { ...state, cursor: { line, col: 0 } };
  }
  if (key === 'ArrowRight') {
    if (col < currentLine.length) {
      return { ...state, cursor: { line, col: col + 1 } };
    }
    if (line < state.lines.length - 1 && parseWhichwrapFlags(getOptions(state).whichwrap).has(']')) {
      return { ...state, cursor: { line: line + 1, col: 0 } };
    }
    return { ...state, cursor: { line, col: currentLine.length } };
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
    let targetCol = col;
    let prefixBefore = currentLine.slice(0, col);
    if (
      key === '}' &&
      !state.blockInsertSession &&
      getOptions(state).smartindent &&
      prefixBefore.length > 0 &&
      /^[ \t]+$/.test(prefixBefore)
    ) {
      const opts = getOptions(state);
      const sw = opts.shiftwidth || 2;
      if (prefixBefore.endsWith('\t')) {
        prefixBefore = prefixBefore.slice(0, -1);
      } else {
        let removeCount = 0;
        while (
          removeCount < sw &&
          prefixBefore.length > removeCount &&
          prefixBefore[prefixBefore.length - 1 - removeCount] === ' '
        ) {
          removeCount++;
        }
        prefixBefore = prefixBefore.slice(0, prefixBefore.length - removeCount);
      }
      targetCol = prefixBefore.length;
    }
    nextLines[line] = prefixBefore + key + currentLine.slice(col);
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: targetCol + 1 },
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
      insertCtrlGPending: undefined,
      literalNextPending: undefined,
      digraphPending: undefined,
    };
  }

  // Ctrl-g 서브명령 (Ctrl-g u: Undo 중단점 삽입, Ctrl-g j/k: Insert 시작 열 기준 상하 이동)
  if (state.insertCtrlGPending) {
    const cleared: VimEditorState = { ...state, insertCtrlGPending: undefined };
    if (key === 'u' || key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'ctrl-u') {
      return pushUndoSnapshot(cleared);
    }
    if (key === 'j' || key === 'Ctrl-j' || key === 'Ctrl+j' || key === 'ArrowDown') {
      const targetLine = Math.min(cleared.lines.length - 1, cleared.cursor.line + 1);
      const startCol = cleared.insertStartCol ?? cleared.cursor.col;
      const targetCol = Math.min((cleared.lines[targetLine] ?? '').length, startCol);
      return {
        ...pushUndoSnapshot(cleared),
        cursor: { line: targetLine, col: targetCol },
      };
    }
    if (key === 'k' || key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ArrowUp') {
      const targetLine = Math.max(0, cleared.cursor.line - 1);
      const startCol = cleared.insertStartCol ?? cleared.cursor.col;
      const targetCol = Math.min((cleared.lines[targetLine] ?? '').length, startCol);
      return {
        ...pushUndoSnapshot(cleared),
        cursor: { line: targetLine, col: targetCol },
      };
    }
    if (key === 'Escape') {
      return cleared;
    }
    state = cleared;
  }

  if (key === 'Ctrl-g' || key === 'Ctrl+g' || key === 'ctrl-g' || key === '<C-g>') {
    return {
      ...state,
      insertCtrlGPending: true,
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
