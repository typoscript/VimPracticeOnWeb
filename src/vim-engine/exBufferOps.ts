import { VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { getOptions } from './setOptionsCore';
import { pushUndoSnapshot } from './operators';
import { compileVimRegex } from './vimRegex';
import { buildVfsMap, getVfsFile } from './vfs';
import { executeReadShell } from './shellEngine';
import { msg } from './messages';
import { parseAddress } from './exRange';

interface ParsedSortOptions {
  descending: boolean;
  ignoreCase: boolean;
  unique: boolean;
  numericMode: 'n' | 'f' | 'x' | 'o' | 'b' | null;
  matchPatternText: boolean;
  hasPattern: boolean;
  pattern: string;
  error?: string;
}

function parseSortOptions(bang: string, argsStr?: string): ParsedSortOptions {
  const opts: ParsedSortOptions = {
    descending: bang === '!',
    ignoreCase: false,
    unique: false,
    numericMode: null,
    matchPatternText: false,
    hasPattern: false,
    pattern: '',
  };

  const raw = (argsStr ?? '').trim();
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '!') {
      opts.descending = true;
      i++;
      continue;
    }
    if (ch === 'i') {
      opts.ignoreCase = true;
      i++;
      continue;
    }
    if (ch === 'u') {
      opts.unique = true;
      i++;
      continue;
    }
    if (ch === 'n' || ch === 'f' || ch === 'x' || ch === 'o' || ch === 'b') {
      opts.numericMode = ch;
      i++;
      continue;
    }
    if (ch === 'r') {
      opts.matchPatternText = true;
      i++;
      continue;
    }
    if (!opts.hasPattern && /[^a-zA-Z0-9_\s]/.test(ch)) {
      const delim = ch;
      i++;
      let pat = '';
      let closed = false;
      while (i < raw.length) {
        const cur = raw[i];
        if (cur === '\\' && i + 1 < raw.length) {
          const next = raw[i + 1];
          if (next === delim || next === '\\') {
            pat += next === '\\' ? '\\\\' : delim;
            i += 2;
            continue;
          }
          pat += '\\' + next;
          i += 2;
          continue;
        }
        if (cur === delim) {
          closed = true;
          i++;
          break;
        }
        pat += cur;
        i++;
      }
      if (!closed) {
        opts.error = msg('E475: 잘못된 정렬 인자입니다: {arg}', { arg: raw });
        return opts;
      }
      opts.hasPattern = true;
      opts.pattern = pat;
      continue;
    }

    opts.error = msg('E475: 잘못된 정렬 인자입니다: {arg}', { arg: raw.slice(i) });
    return opts;
  }

  return opts;
}

function extractSortNumber(subject: string, mode: 'n' | 'f' | 'x' | 'o' | 'b'): number | null {
  if (mode === 'n') {
    const m = subject.match(/[-+]?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  if (mode === 'f') {
    const m = subject.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (!m) return null;
    const val = parseFloat(m[0]);
    return Number.isNaN(val) ? null : val;
  }
  if (mode === 'x') {
    const m = subject.match(/([-+]?)(?:0[xX])?([0-9a-fA-F]+)/);
    if (!m) return null;
    const val = parseInt(m[2], 16);
    if (Number.isNaN(val)) return null;
    return m[1] === '-' ? -val : val;
  }
  if (mode === 'o') {
    const m = subject.match(/([-+]?)(?:0[oO])?([0-7]+)/);
    if (!m) return null;
    const val = parseInt(m[2], 8);
    if (Number.isNaN(val)) return null;
    return m[1] === '-' ? -val : val;
  }
  const m = subject.match(/([-+]?)(?:0[bB])?([01]+)/);
  if (!m) return null;
  const val = parseInt(m[2], 2);
  if (Number.isNaN(val)) return null;
  return m[1] === '-' ? -val : val;
}

/**
 * [range]sort[!] [i][u][n|f|x|o|b][r] [/{pattern}/] 명령어를 실행합니다.
 */
export function executeSort(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  bang: string,
  argsStr?: string
): VimEditorState {
  const minLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const maxLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  if (minLine > maxLine || state.lines.length === 0) {
    return { ...state, mode: 'NORMAL', commandBuffer: undefined, commandType: undefined };
  }

  const parsed = parseSortOptions(bang, argsStr);
  if (parsed.error) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: parsed.error,
      bell: true,
    };
  }

  let patternRegex: RegExp | null = null;
  if (parsed.hasPattern) {
    const effectivePat = parsed.pattern || state.lastSearchQuery || '';
    if (effectivePat) {
      try {
        patternRegex = compileVimRegex(effectivePat, {
          ignorecase: parsed.ignoreCase,
          smartcase: false,
          lastSubstitute: state.lastSubstitute?.replacement,
        });
      } catch {
        return {
          ...state,
          mode: 'NORMAL',
          visualAnchor: undefined,
          commandBuffer: undefined,
          commandType: undefined,
          commandMessage: msg('E475: 잘못된 정렬 인자입니다: {arg}', { arg: parsed.pattern }),
          bell: true,
        };
      }
    }
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const selectedLines = state.lines.slice(minLine, maxLine + 1);

  const indexed = selectedLines.map((line, idx) => {
    let matched = true;
    let subject = line;

    if (parsed.hasPattern && patternRegex) {
      patternRegex.lastIndex = 0;
      const m = patternRegex.exec(line);
      if (!m) {
        matched = false;
        subject = '';
      } else {
        subject = parsed.matchPatternText ? m[0] : line.slice(m.index + m[0].length);
      }
    }

    const numVal =
      matched && parsed.numericMode
        ? extractSortNumber(subject, parsed.numericMode)
        : null;

    return { line, idx, matched, subject, numVal };
  });

  indexed.sort((a, b) => {
    if (a.matched !== b.matched) {
      if (parsed.descending) {
        return a.matched ? -1 : 1;
      }
      return a.matched ? 1 : -1;
    }

    if (!a.matched && !b.matched) {
      return a.idx - b.idx;
    }

    if (parsed.numericMode) {
      if (a.numVal !== null && b.numVal !== null) {
        if (a.numVal !== b.numVal) {
          return parsed.descending ? b.numVal - a.numVal : a.numVal - b.numVal;
        }
      } else if (a.numVal !== null) {
        return parsed.descending ? -1 : 1;
      } else if (b.numVal !== null) {
        return parsed.descending ? 1 : -1;
      }
      return a.idx - b.idx;
    }

    const sa = parsed.ignoreCase ? a.subject.toLowerCase() : a.subject;
    const sb = parsed.ignoreCase ? b.subject.toLowerCase() : b.subject;
    // Vim :sort 는 로캘이 아니라 바이트(코드 포인트) 순서입니다 (공백 < 대문자 < 소문자).
    const cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    if (cmp !== 0) {
      return parsed.descending ? -cmp : cmp;
    }
    return a.idx - b.idx;
  });

  const isSameSortKey = (a: (typeof indexed)[number], b: (typeof indexed)[number]): boolean => {
    if (a.matched !== b.matched) return false;
    if (!a.matched && !b.matched) {
      return (parsed.ignoreCase ? a.line.toLowerCase() === b.line.toLowerCase() : a.line === b.line);
    }
    if (parsed.numericMode) {
      if (a.numVal !== null && b.numVal !== null) return a.numVal === b.numVal;
      if (a.numVal !== null || b.numVal !== null) return false;
    }
    if (!parsed.hasPattern && !parsed.ignoreCase && !parsed.numericMode) {
      return a.line === b.line;
    }
    return parsed.ignoreCase
      ? a.subject.toLowerCase() === b.subject.toLowerCase()
      : a.subject === b.subject;
  };

  let finalLines: string[];
  if (parsed.unique) {
    finalLines = [];
    let lastKept: (typeof indexed)[number] | null = null;
    for (const item of indexed) {
      if (!lastKept || !isSameSortKey(lastKept, item)) {
        finalLines.push(item.line);
        lastKept = item;
      }
    }
  } else {
    finalLines = indexed.map((item) => item.line);
  }

  const newLines = [
    ...state.lines.slice(0, minLine),
    ...finalLines,
    ...state.lines.slice(maxLine + 1),
  ];

  if (newLines.length === 0) {
    newLines.push('');
  }

  // Vim ex_sort: 범위 첫 줄의 첫 비공백으로 갑니다.
  const nextCursor = clampCursor(
    newLines,
    { line: minLine, col: getFirstNonBlankCol(newLines[minLine] ?? '') },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{finalLinesCount}개 줄 정렬 완료', { finalLinesCount: finalLines.length }),
  };
}

/**
 * :[range]r[ead] [file] 명령어를 실행하여 VFS 또는 열린 버퍼의 내용을 지정 줄 아래에 삽입합니다.
 * :0r 은 첫 줄 위(인덱스 0), :$r 은 파일 끝, 인자 없음/:r % 는 현재 파일, :r # 는 대안 버퍼를 삽입합니다.
 */
export function executeRead(
  state: VimEditorState,
  insertAfterLine: number,
  rawArg?: string
): VimEditorState {
  const arg = (rawArg ?? '').trim();
  if (arg.startsWith('!')) {
    return executeReadShell(state, insertAfterLine, arg.slice(1));
  }
  const vfs = buildVfsMap(state);
  let targetLines: string[] | undefined;
  let displayName = arg;

  if (!arg || arg === '%') {
    displayName = state.primaryFilename || '%';
    if (arg === '%' || !state.primaryFilename) {
      targetLines = [...state.lines];
    } else {
      targetLines =
        getVfsFile(state.netrw?.files, state.primaryFilename, state.virtualFiles) ??
        vfs[state.primaryFilename] ??
        [...state.lines];
    }
  } else if (arg === '#') {
    const altBuf = state.alternateBufferId
      ? state.buffers?.find((b) => b.id === state.alternateBufferId)
      : undefined;
    if (altBuf) {
      displayName = altBuf.name;
      targetLines = [...altBuf.lines];
    } else if (state.secondaryFilename && state.secondaryLines) {
      displayName = state.secondaryFilename;
      targetLines = [...state.secondaryLines];
    } else {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E194: 대체 파일 이름이 없습니다 (#)'),
        bell: true,
      };
    }
  } else {
    const normalized = arg.replace(/^\.\//, '');
    targetLines =
      vfs[arg] ??
      vfs[normalized] ??
      getVfsFile(state.netrw?.files, arg, state.virtualFiles) ??
      getVfsFile(state.netrw?.files, normalized, state.virtualFiles);
    if (!targetLines) {
      const basenameMatches = Object.keys(vfs).filter((k) => k.split('/').pop() === normalized);
      if (basenameMatches.length === 1) {
        displayName = basenameMatches[0];
        targetLines = vfs[displayName];
      }
    }
  }

  if (!targetLines) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E484: "{filename}" 파일을 열 수 없습니다', { filename: arg }),
      bell: true,
    };
  }

  const linesToInsert = [...targetLines];
  const stateWithUndo = pushUndoSnapshot(state);
  const insertIndex = Math.max(0, Math.min(state.lines.length, insertAfterLine + 1));

  const newLines = [
    ...state.lines.slice(0, insertIndex),
    ...linesToInsert,
    ...state.lines.slice(insertIndex),
  ];

  const nextCursor = clampCursor(
    newLines,
    { line: Math.min(insertIndex, Math.max(0, newLines.length - 1)), col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('"{filename}" {count}줄 읽음', {
      filename: displayName,
      count: linesToInsert.length,
    }),
  };
}

/**
 * :[range]m[ove] {address} 명령어를 실행합니다.
 */
export function executeMove(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  destStr: string
): VimEditorState {
  const destTrimmed = destStr.trim();
  const targetLine = destTrimmed ? parseAddress(destTrimmed, state) : null;
  if (targetLine === null) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E14: 잘못된 주소입니다: {destStr}', { destStr }),
      bell: true,
    };
  }

  const startLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const endLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  // E134: Cannot move a range of lines into itself
  if (targetLine >= startLine && targetLine < endLine) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: 'E134: Cannot move a range of lines into itself',
      bell: true,
    };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const count = endLine - startLine + 1;
  const linesToMove = state.lines.slice(startLine, endLine + 1);

  const remainingLines = [
    ...state.lines.slice(0, startLine),
    ...state.lines.slice(endLine + 1),
  ];

  let insertIndex: number;
  if (targetLine < startLine) {
    insertIndex = targetLine + 1;
  } else {
    insertIndex = targetLine + 1 - count;
  }

  const newLines = [
    ...remainingLines.slice(0, insertIndex),
    ...linesToMove,
    ...remainingLines.slice(insertIndex),
  ];

  const finalCursorLine = insertIndex + linesToMove.length - 1;
  // Vim ex_copy / ex_move: 마지막 줄로 가고 'nostartofline' 이면 열을 유지합니다.
  const nextCursor = getOptions(state).startofline
    ? clampCursor(newLines, { line: finalCursorLine, col: getFirstNonBlankCol(newLines[finalCursorLine] ?? '') }, 'NORMAL')
    : clampCursor(newLines, { line: finalCursorLine, col: state.cursor.col }, 'NORMAL');

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{linesToMoveCount}개 줄 이동 완료', { linesToMoveCount: linesToMove.length }),
  };
}

/**
 * :[range]t {address} 또는 :[range]co[py] {address} 명령어를 실행합니다.
 */
export function executeCopy(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  destStr: string
): VimEditorState {
  const destTrimmed = destStr.trim();
  const targetLine = destTrimmed ? parseAddress(destTrimmed, state) : null;
  if (targetLine === null) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E14: 잘못된 주소입니다: {destStr}', { destStr }),
      bell: true,
    };
  }

  const startLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const endLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  const stateWithUndo = pushUndoSnapshot(state);
  const linesToCopy = state.lines.slice(startLine, endLine + 1);
  const insertIndex = targetLine + 1;

  const newLines = [
    ...state.lines.slice(0, insertIndex),
    ...linesToCopy,
    ...state.lines.slice(insertIndex),
  ];

  const finalCursorLine = insertIndex + linesToCopy.length - 1;
  // Vim ex_copy / ex_move: 마지막 줄로 가고 'nostartofline' 이면 열을 유지합니다.
  const nextCursor = getOptions(state).startofline
    ? clampCursor(newLines, { line: finalCursorLine, col: getFirstNonBlankCol(newLines[finalCursorLine] ?? '') }, 'NORMAL')
    : clampCursor(newLines, { line: finalCursorLine, col: state.cursor.col }, 'NORMAL');

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{linesToCopyCount}개 줄 복제 완료', { linesToCopyCount: linesToCopy.length }),
  };
}

export {
  executeGlobalCommand,
  parseRegisterCountArgs,
  applyRangeCount,
  executeRangeDelete,
  executeRangeYank,
  executeExPut,
  executeRangeNorm,
  executeNormalKeysOnLine,
  parseKeyTokens,
  executeAlignRange,
} from './exRangeOps';

