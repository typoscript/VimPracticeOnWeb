import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { isKeymapPrefix } from './keymapEngine';
import { isAbbrevTriggerKey } from './abbrevEngine';
import { getOptions } from './setEngine';
import { parseWhichwrapFlags, hasFormatOption, extractCommentPrefix } from './setOptionsCore';
import { handleAutopairsChar, handleAutopairsBackspace, handleAutopairsEnter } from './autopairsEngine';
import { tryExpandSnippetOnTab, jumpSnippetTabstop } from './snippetEngine';
import { AbbrevReplayCtx, INITIAL_ABBREV_CTX, DispatchKeyFn } from './engineHelpers';
import { handleInsertLiteralNext, handleInsertDigraph, handleInsertRegister, handleInsertEscape, handleInsertLastInserted } from './insertSpecialKeys';
import { displayWidthOf, resolveSofttabstop, trimInsertText, appendCurrentChange, mergeWithPreviousLine, adjustInsertLineIndent, applyInsertAbbrev, tryHandleInsertKeymap, handleInsertCompletionStep } from './insertModeHelpers';
export { applyInsertAbbrev } from './insertModeHelpers';

/** INSERT 모드 편집 키(들여쓰기, 단어/줄/문자 삭제, Enter, Tab, 방향키, 문자 입력) 처리 */
function handleInsertEditingKey(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // Ctrl+t / Ctrl+d: 현재 줄 들여쓰기 증감 (0 Ctrl-d / ^ Ctrl-d 는 모든 선행 들여쓰기 즉시 제거)
  if (key === 'Ctrl-t' || key === 'Ctrl+t' || key === 'Alt-t' || key === 'Alt+t') {
    return adjustInsertLineIndent(state, currentLine, 1, appendCurrentChange(state, 'Ctrl-t', isReplayingDot));
  }
  if (key === 'Ctrl-d' || key === 'Ctrl+d' || key === 'Alt-d' || key === 'Alt+d') {
    const nextChangeKeys = appendCurrentChange(state, 'Ctrl-d', isReplayingDot);
    const beforeCursor = currentLine.slice(0, col);
    if (/^[ \t]*[0^]$/.test(beforeCursor)) {
      const nextLines = [...state.lines];
      nextLines[line] = currentLine.slice(col);
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: 0 },
        currentChangeKeys: nextChangeKeys,
        currentInsertText: trimInsertText(state.currentInsertText, 1),
      };
    }
    return adjustInsertLineIndent(state, currentLine, -1, nextChangeKeys);
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
    const autopairBs = handleAutopairsBackspace(state, nextChangeKeys);
    if (autopairBs) return autopairBs;
    if (col > 0) {
      const opts = getOptions(state);
      const isLeadingIndent = /^[ \t]*$/.test(currentLine.slice(0, col));
      const baseSts = resolveSofttabstop(opts);
      const effectiveBsStop =
        baseSts > 0
          ? baseSts
          : opts.smarttab && isLeadingIndent
            ? Math.max(1, opts.shiftwidth || 2)
            : 0;
      let deleteFrom = col - 1;
      if (effectiveBsStop > 0 && !state.blockInsertSession && currentLine[col - 1] === ' ') {
        const ts = Math.max(1, opts.tabstop || 2);
        const vcol = displayWidthOf(currentLine.slice(0, col), ts);
        const targetVcol = Math.max(0, Math.floor((vcol - 1) / effectiveBsStop) * effectiveBsStop);
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

  // Enter: 줄 분할 및 다음 줄 이동 (autopairs / autoindent / smartindent / formatoptions 'r' 주석 연속 지원)
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange(state, 'Enter', isReplayingDot);
    const autopairEnter = handleAutopairsEnter(state, nextChangeKeys);
    if (autopairEnter) return autopairEnter;
    const opts = getOptions(state);
    const beforeCursor = currentLine.slice(0, col);
    const afterCursor = currentLine.slice(col);
    let indent = '';
    let nextLineBody = afterCursor;
    const comment = hasFormatOption(opts, 'r') ? extractCommentPrefix(beforeCursor) : null;
    if (comment && col >= comment.indent.length + comment.leader.length) {
      indent = comment.contPrefix;
      nextLineBody = afterCursor.replace(/^[ \t]+/, '');
    } else if (opts.autoindent || opts.smartindent) {
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

  // Shift-Tab: 활성 스니펫 이전 탭스톱으로 점프
  if (key === 'Shift-Tab' || key === '<S-Tab>') {
    const prevStop = jumpSnippetTabstop(state, 'prev');
    if (prevStop) return prevStop;
    return state;
  }

  // Tab: 스니펫 점프·확장 또는 들여쓰기 삽입 (smarttab / softtabstop / expandtab / tabstop 지원)
  if (key === 'Tab') {
    if (state.snippetSession) {
      const nextStop = jumpSnippetTabstop(state, 'next');
      if (nextStop) return nextStop;
    }
    const expandedSnippet = tryExpandSnippetOnTab(state);
    if (expandedSnippet) return expandedSnippet;
    const nextChangeKeys = appendCurrentChange(state, 'Tab', isReplayingDot);
    const opts = getOptions(state);
    const ts = Math.max(1, opts.tabstop || opts.shiftwidth || 2);
    const isLeadingIndent = /^[ \t]*$/.test(currentLine.slice(0, col));
    const baseSts = resolveSofttabstop(opts);
    const sts =
      opts.smarttab && isLeadingIndent
        ? Math.max(1, opts.shiftwidth || 2)
        : baseSts;

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
    const autopairChar = handleAutopairsChar(state, key, nextChangeKeys);
    if (autopairChar) return autopairChar;
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
    const newLine = prefixBefore + key + currentLine.slice(col);
    const newCol = targetCol + 1;
    const opts = getOptions(state);
    const tw = opts.textwidth ?? 0;

    // textwidth > 0 실시간 자동 줄바꿈 (:help 'textwidth', 'formatoptions' t / c)
    const lineComment = extractCommentPrefix(newLine);
    const allowAutoWrap = lineComment
      ? hasFormatOption(opts, 'c')
      : hasFormatOption(opts, 't');
    if (
      tw > 0 &&
      allowAutoWrap &&
      !state.blockInsertSession &&
      newLine.length > tw &&
      key !== ' ' &&
      key !== '\t'
    ) {
      const leadIndent = newLine.match(/^[ \t]*/)?.[0] ?? '';
      const minBreak = lineComment ? lineComment.fullPrefix.length : leadIndent.length;
      let breakIdx = -1;
      for (let i = Math.min(tw, newCol - 1); i >= minBreak; i--) {
        if (newLine[i] === ' ' || newLine[i] === '\t') {
          breakIdx = i;
          break;
        }
      }
      if (breakIdx >= minBreak) {
        const head = newLine.slice(0, breakIdx).replace(/[ \t]+$/, '');
        let tailStart = breakIdx + 1;
        while (tailStart < newCol && (newLine[tailStart] === ' ' || newLine[tailStart] === '\t')) {
          tailStart++;
        }
        const tailBeforeCursor = newLine.slice(tailStart, newCol);
        const tailAfterCursor = newLine.slice(newCol);
        const nextIndent = lineComment
          ? lineComment.contPrefix
          : opts.autoindent || opts.smartindent
            ? leadIndent
            : '';
        const wrappedLines = [
          ...state.lines.slice(0, line),
          head,
          nextIndent + tailBeforeCursor + tailAfterCursor,
          ...state.lines.slice(line + 1),
        ];
        return {
          ...state,
          lines: wrappedLines,
          cursor: { line: line + 1, col: nextIndent.length + tailBeforeCursor.length },
          pendingKeys: isKeymapPrefix(state, 'i', key) ? key : undefined,
          currentChangeKeys: nextChangeKeys,
          currentInsertText: (state.currentInsertText ?? '') + key,
        };
      }
    }

    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: newCol },
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
      insertRegisterMode: undefined,
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

  if (state.insertCtrlXMode) {
    const compRes = handleInsertCompletionStep(state, key);
    if (compRes.handled) return compRes.state;
    state = compRes.state;
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
    const escaped = handleInsertEscape(state, isReplayingDot);
    return escaped.snippetSession ? { ...escaped, snippetSession: null } : escaped;
  }

  const lastInsertedRes = handleInsertLastInserted(state, key, isReplayingDot);
  if (lastInsertedRes) return lastInsertedRes;

  return handleInsertEditingKey(state, key, isReplayingDot);
}

export { handleReplaceModeKey } from './replaceMode';
