import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { compileVimRegex } from './vimRegex';
import { buildVfsMap, getVfsFile } from './vfs';
import { executeReadShell } from './shellEngine';
import { msg } from './messages';
import { parseAddress } from './exRange';
import type { KeyRunner } from './exSubstitute';

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
    const cmp = sa.localeCompare(sb);
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

  const nextCursor = clampCursor(
    newLines,
    { line: minLine, col: 0 },
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
  const nextCursor = clampCursor(
    newLines,
    { line: finalCursorLine, col: 0 },
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
  const nextCursor = clampCursor(
    newLines,
    { line: finalCursorLine, col: 0 },
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
    commandMessage: msg('{linesToCopyCount}개 줄 복제 완료', { linesToCopyCount: linesToCopy.length }),
  };
}

/**
 * :g 및 :v 글로벌 명령을 실행합니다.
 */
export function executeGlobalCommand(
  state: VimEditorState,
  gMatch: RegExpMatchArray,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  const gType = gMatch[1];
  const bang = gMatch[2];
  const pattern = gMatch[3];
  let action = gMatch[4].trim();
  if (action.endsWith('/')) {
    action = action.slice(0, -1).trim();
  }

  const isInverse = gType.startsWith('v') || bang === '!';

  let regex: RegExp;
  try {
    regex = compileVimRegex(pattern, { ignorecase: state.options?.ignorecase, smartcase: state.options?.smartcase });
  } catch {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E486: 잘못된 정규식 패턴입니다: {pattern}', { pattern }),
    };
  }

  const matchedIndices: number[] = [];
  state.lines.forEach((lineText, idx) => {
    const matched = regex.test(lineText);
    if (isInverse ? !matched : matched) {
      matchedIndices.push(idx);
    }
  });

  if (matchedIndices.length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }),
      bell: true,
    };
  }

  // 1. :g/pattern/d (매칭 줄 일괄 삭제)
  if (action === 'd' || action === 'delete' || action === '') {
    const stateWithUndo = pushUndoSnapshot(state);
    const deleteSet = new Set(matchedIndices);
    const yanked = state.lines.filter((_, idx) => deleteSet.has(idx));
    const newLines = state.lines.filter((_, idx) => !deleteSet.has(idx));
    const finalLines = newLines.length === 0 ? [''] : newLines;
    const nextCursor = clampCursor(
      finalLines,
      { line: Math.min(matchedIndices[0], finalLines.length - 1), col: 0 },
      'NORMAL'
    );

    return {
      ...stateWithUndo,
      lines: finalLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content: yanked.join('\n'),
      },
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{matchedIndicesCount}개 줄이 일괄 삭제되었습니다.', { matchedIndicesCount: matchedIndices.length }),
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  // 2. :g/pattern/norm {cmd} (매칭 줄마다 Normal 명령어 일괄 실행)
  const normMatch = action.match(/^(norm|normal)(!?)\s*(.*)$/);
  if (normMatch) {
    const normKeys = normMatch[3];
    let curState = pushUndoSnapshot(state);

    // 'dd' 줄 삭제인 경우 줄 번호 왜곡을 방지하기 위해 역순(아래에서 위로) 실행
    const isLineDelete = normKeys.trim() === 'dd';
    const sortedIndices = isLineDelete ? [...matchedIndices].reverse() : matchedIndices;

    for (const idx of sortedIndices) {
      curState = executeNormalKeysOnLine(curState, idx, normKeys, keyRunner);
    }

    return {
      ...curState,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{matchedIndicesCount}개 줄에 normal 명령을 실행했습니다.', { matchedIndicesCount: matchedIndices.length }),
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('지원하지 않는 글로벌 작업입니다: {action}', { action }),
  };
}

/**
 * :[range]d 줄 삭제를 실행합니다.
 */
export function executeRangeDelete(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  commandStr: string
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  const remaining = [
    ...state.lines.slice(0, range.startLine),
    ...state.lines.slice(range.endLine + 1),
  ];
  const newLines = remaining.length === 0 ? [''] : remaining;
  const nextCursor = clampCursor(
    newLines,
    { line: Math.min(range.startLine, newLines.length - 1), col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    clipboard: {
      type: 'line',
      content: yanked.join('\n'),
    },
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{v}개 줄이 삭제되었습니다.', { v: range.endLine - range.startLine + 1 }),
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * :[range]y 줄 복사를 실행합니다.
 */
export function executeRangeYank(
  state: VimEditorState,
  range: { startLine: number; endLine: number }
): VimEditorState {
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    clipboard: {
      type: 'line',
      content: yanked.join('\n'),
    },
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{v}개 줄이 복사되었습니다.', { v: range.endLine - range.startLine + 1 }),
  };
}

/**
 * :[range]norm {keys}를 실행합니다.
 */
export function executeRangeNorm(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  normKeys: string,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  let curState = pushUndoSnapshot(state);
  const count = range.endLine - range.startLine + 1;

  for (let l = range.startLine; l <= range.endLine; l++) {
    curState = executeNormalKeysOnLine(curState, l, normKeys, keyRunner);
  }

  return {
    ...curState,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{count}개 줄에 normal 명령을 실행했습니다.', { count }),
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * 특정 줄 번호에 Normal 모드 키 시퀀스를 실행합니다.
 */
export function executeNormalKeysOnLine(
  state: VimEditorState,
  lineIdx: number,
  keysStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  if (lineIdx < 0 || lineIdx >= state.lines.length) {
    return state;
  }

  let curState: VimEditorState = {
    ...state,
    cursor: { line: lineIdx, col: 0 },
    mode: 'NORMAL',
    pendingKeys: undefined,
  };

  const tokens = parseKeyTokens(keysStr);
  if (!keyRunner) {
    return curState;
  }

  for (const token of tokens) {
    curState = keyRunner(curState, token, true);
    // 실제 Vim과 동일하게 키가 실패하면 해당 줄의 남은 키를 버립니다.
    if (curState.bell) break;
  }

  // 명령어 수행 후 여전히 INSERT 모드인 경우 자동으로 Escape 호출하여 완료
  if (curState.mode !== 'NORMAL') {
    curState = keyRunner(curState, 'Escape', true);
  }

  return curState;
}

/**
 * 키 시퀀스 문자열을 개별 토큰 목록으로 파싱합니다. (<Esc>, <Enter> 등 지원)
 */
export function parseKeyTokens(keysStr: string): string[] {
  const tokens: string[] = [];
  const regex = /<Esc>|<CR>|<Enter>|<Space>|./gi;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(keysStr)) !== null) {
    const tok = match[0];
    const lower = tok.toLowerCase();
    if (lower === '<esc>') {
      tokens.push('Escape');
    } else if (lower === '<cr>' || lower === '<enter>') {
      tokens.push('Enter');
    } else if (lower === '<space>') {
      tokens.push(' ');
    } else {
      tokens.push(tok);
    }
  }

  return tokens;
}
