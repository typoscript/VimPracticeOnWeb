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
  const trimmed = text.slice(0, Math.max(0, text.length - count));
  return trimmed;
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
  let { line, col } = state.cursor;
  let currentLine = state.lines[line] ?? '';
  const syncCursorLoc = () => {
    line = state.cursor.line;
    col = state.cursor.col;
    currentLine = state.lines[line] ?? '';
  };

  // 타임아웃 발생 시 대기 버퍼 초기화
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
  if (literalRes.state !== state) {
    state = literalRes.state;
    syncCursorLoc();
  }

  const digraphRes = handleInsertDigraph(state, key, isReplayingDot);
  if (digraphRes.handled) return digraphRes.state;
  if (digraphRes.state !== state) {
    state = digraphRes.state;
    syncCursorLoc();
  }

  const regRes = handleInsertRegister(state, key, isReplayingDot);
  if (regRes) return regRes;

  // 커스텀 키매핑 검사 (다중 키 jk/<Esc> 및 단일 키 <buffer>/<silent>/<expr>)
  const executeInsertMapped = (resolved: ResolvedKeymap, stripPendingCount: number): VimEditorState => {
    const prevMsg = state.commandMessage;
    const rhs = resolved.expr ? evaluateExprKeymap(state, resolved.rhs) : resolved.rhs;
    const baseLine = stripPendingCount > 0
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
          ...(stripPendingCount > 0 ? state.currentChangeKeys.slice(0, -stripPendingCount) : state.currentChangeKeys),
          'Escape',
        ];
      }
      const lastPos = { line, col: nextCol, row: line };
      const changeRecord = recordChangePosition(state.changeList, { line, col: nextCol });
      const cleanedInsert =
        stripPendingCount > 0 && state.pendingKeys && (state.currentInsertText ?? '').endsWith(state.pendingKeys)
          ? (state.currentInsertText ?? '').slice(0, -state.pendingKeys.length)
          : state.currentInsertText;

      return applySilentKeymapResult(prevMsg, {
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
      }, resolved.silent);
    }

    const startBase: VimEditorState = {
      ...state,
      lines: nextLines,
      cursor: { line, col: baseCol },
      pendingKeys: undefined,
    };
    return runKeymapTokens(
      startBase,
      resolved,
      macroDepth,
      (runState, evalRhs, _isNoremap, _nextDepth) => {
        const tokens = parseKeySequence(evalRhs, state.leaderKey || ' ');
        let s: VimEditorState = runState;
        for (const tok of tokens) {
          s = dispatchKey(s, tok, isReplayingDot, Math.max(1, macroDepth + 1));
          if (s.bell) break;
        }
        return s;
      }
    );
  };

  if (!state.keymapsDisabled && state.pendingKeys && macroDepth <= MAX_REMAP_DEPTH) {
    const combined = `${state.pendingKeys}${key}`;
    const resolved = resolveKeymapWithMeta(state, 'i', combined);
    if (resolved) {
      return executeInsertMapped(resolved, state.pendingKeys.length);
    }
  } else if (!state.keymapsDisabled && macroDepth <= MAX_REMAP_DEPTH) {
    const resolved = resolveKeymapWithMeta(state, 'i', key);
    if (resolved) {
      return executeInsertMapped(resolved, 0);
    }
  }

  // 1. Ctrl+x 자동완성 서브모드 진입 (^X mode)
  if (key === 'Ctrl-x' || key === 'Ctrl+x') {
    return {
      ...state,
      insertCtrlXMode: true,
      commandMessage: undefined,
    };
  }

  // 2. ^X mode 상태에서의 서브 자동완성 명령 처리
  if (state.insertCtrlXMode) {
    if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'f') {
      return startFilenameCompletion(state, 'next');
    }
    if (key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'l') {
      return startWholeLineCompletion(state, 'next');
    }
    if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'n') {
      return startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'next');
    }
    if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'p') {
      return startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'prev');
    }
    if (key === 'Escape' || key === 'Ctrl-e' || key === 'Ctrl+e') {
      return { ...state, insertCtrlXMode: false };
    }
    // 기타 키 입력 시 ^X mode 해제 후 계속 진행
    state = { ...state, insertCtrlXMode: false };
  }

  // 자동완성 (Ctrl+n / Ctrl+p / Ctrl+e / Ctrl+y)
  if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'Alt-n' || key === 'Alt+n') {
    return startOrCycleCompletion(state, 'next');
  }
  if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'Alt-p' || key === 'Alt+p') {
    return startOrCycleCompletion(state, 'prev');
  }
  if (key === 'Ctrl-e' || key === 'Ctrl+e') {
    if (state.completionSession) {
      return cancelCompletion(state);
    }
    const belowLine = state.lines[line + 1];
    if (belowLine !== undefined && col < belowLine.length) {
      return insertTextAtCursor(state, belowLine[col]);
    }
    return state;
  }
  if (key === 'Ctrl-y' || key === 'Ctrl+y' || (key === 'Enter' && state.completionSession)) {
    if (state.completionSession) {
      return acceptCompletion(state);
    }
    const aboveLine = state.lines[line - 1];
    if (aboveLine !== undefined && col < aboveLine.length) {
      return insertTextAtCursor(state, aboveLine[col]);
    }
    return state;
  }

  if (state.completionSession) {
    if (key === 'ArrowDown') {
      return startOrCycleCompletion(state, 'next');
    }
    if (key === 'ArrowUp') {
      return startOrCycleCompletion(state, 'prev');
    }
  }

  // 자동완성 이외의 키가 입력되면 활성 자동완성 세션 해제
  if (state.completionSession) {
    state = { ...state, completionSession: null };
  }

  // Ctrl-]: 수동 약어 확장 (트리거 키 삽입 없이 약어만 치환)
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    return applyInsertAbbrev(state, 'Ctrl-]', isReplayingDot, macroDepth, abbrevCtx, dispatchKey) ?? state;
  }

  // INSERT 모드 약어 자동 확장 (비단어 문자, Space, Enter, Tab, Escape)
  if (isAbbrevTriggerKey(key, true)) {
    const expanded = applyInsertAbbrev(state, key, isReplayingDot, macroDepth, abbrevCtx, dispatchKey);
    if (expanded) return expanded;
  }

  // Ctrl+o: 단 1회의 Normal 명령 실행 (INSERT (normal))
  if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'Alt-o' || key === 'Alt+o') {
    return {
      ...state,
      mode: 'NORMAL',
      insertNormalSession: true,
      cursor: clampCursor(state.lines, state.cursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // ESC: NORMAL 모드로 복귀 (커서 1칸 좌측 보정)
  if (key === 'Escape') {
    return handleInsertEscape(state, isReplayingDot);
  }

  // 키 입력 기록 (Dot Repeat 용)
  const appendCurrentChange = (k: string) => {
    if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
    return [...state.currentChangeKeys, k];
  };

  // Ctrl+a / Ctrl+@: 직전 INSERT 세션에서 삽입한 텍스트 재삽입 (:help i_CTRL-A / i_CTRL-@)
  const lastInsertedRes = handleInsertLastInserted(state, key, isReplayingDot);
  if (lastInsertedRes) return lastInsertedRes;

  // Ctrl+t / Ctrl+d: 현재 줄 들여쓰기 증가 / 감소 (shiftwidth 단위)
  if (key === 'Ctrl-t' || key === 'Ctrl+t' || key === 'Alt-t' || key === 'Alt+t') {
    return adjustInsertLineIndent(state, currentLine, 1, appendCurrentChange('Ctrl-t'));
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'Alt-d' || key === 'Alt+d') {
    return adjustInsertLineIndent(state, currentLine, -1, appendCurrentChange('Ctrl-d'));
  }

  // Ctrl+w: 커서 앞의 단어 하나 즉시 삭제
  if (key === 'Ctrl-w' || key === 'Ctrl+w' || key === 'Alt-w' || key === 'Alt+w') {
    const nextChangeKeys = appendCurrentChange('Ctrl-w');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
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
    if (col > 0) {
      let start = col;
      while (start > 0 && /\s/.test(currentLine[start - 1])) {
        start--;
      }
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
      const newLine = currentLine.slice(0, start) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
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
    const nextChangeKeys = appendCurrentChange('Ctrl-u');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
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
    const newLine = currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
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
      const updatedChars = state.blockInsertSession.typedChars.slice(0, -1);
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange('Backspace');

    if (col > 0) {
      const newLine = currentLine.slice(0, col - 1) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col - 1 },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: trimInsertText(state.currentInsertText, 1),
      };
    }

    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
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

    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Enter: 줄 분할 및 다음 줄 맨 앞으로 이동
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange('Enter');
    const firstPart = currentLine.slice(0, col);
    const secondPart = currentLine.slice(col);

    const nextLines = [
      ...state.lines.slice(0, line),
      firstPart,
      secondPart,
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

  // Tab: 들여쓰기 삽입 (tabstop / shiftwidth / expandtab 설정 반영)
  if (key === 'Tab') {
    const nextChangeKeys = appendCurrentChange('Tab');
    const opts = getOptions(state);
    const ts = opts.tabstop || opts.shiftwidth || 2;
    const et = opts.expandtab !== false;
    const indent = et ? ' '.repeat(ts) : '\t';
    if (state.blockInsertSession) {
      const updatedChars = [...state.blockInsertSession.typedChars, ...indent.split('')];
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const newLine = currentLine.slice(0, col) + indent + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + indent.length },
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + indent,
    };
  }

  // 방향키 이동 지원
  if (key === 'ArrowLeft') {
    return {
      ...state,
      cursor: { line, col: Math.max(0, col - 1) },
    };
  }

  if (key === 'ArrowRight') {
    return {
      ...state,
      cursor: { line, col: Math.min(currentLine.length, col + 1) },
    };
  }

  if (key === 'ArrowUp') {
    const targetLine = Math.max(0, line - 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  if (key === 'ArrowDown') {
    const targetLine = Math.min(state.lines.length - 1, line + 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  // 일반 타이핑 문자 입력 (길이가 1인 모든 문자 및 공백)
  if (key.length === 1) {
    if (state.blockInsertSession) {
      const updatedChars = [...state.blockInsertSession.typedChars, key];
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange(key);
    const newLine = currentLine.slice(0, col) + key + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    // 현재 입력된 문자가 Insert 모드 다중 키 매핑의 접두사인지 확인 (예: 'jk'의 'j')
    const isMappingPrefix = isKeymapPrefix(state, 'i', key);

    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
      pendingKeys: isMappingPrefix ? key : undefined,
      currentChangeKeys: nextChangeKeys,
      currentInsertText: (state.currentInsertText ?? '') + key,
    };
  }

  return state;
}

export { handleReplaceModeKey } from './replaceMode';
