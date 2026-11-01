import { VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { escapeRegExp } from './search';
import { splitWindow, closeSplitWindow } from './splitWindow';

export type KeyRunner = (
  state: VimEditorState,
  key: string,
  isReplayingDot?: boolean
) => VimEditorState;

/**
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  const trimmed = commandStr.trimStart();

  // 1. 빈 명령인 경우 NORMAL 모드로 복귀
  if (trimmed.trim().length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  // 2. 글로벌 명령: :g/pattern/cmd, :v/pattern/cmd, :g!/pattern/cmd
  const gMatch = trimmed.match(/^:?\s*(g|global|v|vglobal)(!?)\s*\/([^\/]+)\/(.*)$/);
  if (gMatch) {
    return executeGlobalCommand(state, gMatch, commandStr, keyRunner);
  }

  // 3. 줄 번호 이동: ':[숫자]', ': [숫자]', 또는 '[숫자]' (예: ':10', ': 10', '5')
  const lineNumMatch = trimmed.match(/^:?\s*([0-9]+)$/);
  if (lineNumMatch) {
    const lineNum = parseInt(lineNumMatch[1], 10);
    const targetLine = Math.max(0, Math.min(lineNum - 1, state.lines.length - 1));
    const nextCursor = clampCursor(
      state.lines,
      { line: targetLine, col: state.cursor.col },
      'NORMAL'
    );

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      cursor: nextCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `${targetLine + 1}번째 줄로 이동했습니다.`,
    };
  }

  // 4. 범위 지정 명령어 파싱: :%s/old/new/g, :3,7d, :'<,'>norm A;, :%y 등
  const rangeMatch = trimmed.match(
    /^:?\s*(%|'<,'>|'<|'>|\.|\$|\d+(?:\s*,\s*(?:\.|\$|\d+|'<|'>))?)\s*(.*)$/
  );
  if (rangeMatch) {
    const rawRange = rangeMatch[1];
    const restCmd = rangeMatch[2].trimStart();
    const restCmdTrimmed = restCmd.trim();
    const range = parseRange(rawRange, state);

    if (range && restCmdTrimmed.length > 0) {
      // 4-1. 범위 치환: :%s/old/new/g, :'<,'>s/old/new/g, :3,7s/old/new/g
      const subMatch = restCmdTrimmed.match(/^s\s*\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
      if (subMatch) {
        return executeSubstitution(state, range, subMatch, trimmed);
      }

      // 4-2. 범위 삭제: :3,7d, :%d, :'<,'>d
      if (restCmdTrimmed === 'd' || restCmdTrimmed === 'delete') {
        return executeRangeDelete(state, range, trimmed);
      }

      // 4-3. 범위 복사: :3,7y, :%y, :'<,'>y
      if (restCmdTrimmed === 'y' || restCmdTrimmed === 'yank') {
        return executeRangeYank(state, range);
      }

      // 4-4. 범위 Normal 실행: :'<,'>norm A;, :%norm A;, :3,7norm A;
      const normMatch = restCmd.match(/^(norm|normal)(!?)\s+(.*)$/);
      if (normMatch) {
        const normKeys = normMatch[3];
        return executeRangeNorm(state, range, normKeys, trimmed, keyRunner);
      }
    }
  }

  // 5. 범위 없는 단일 치환: :s/old/new/g
  const currentSubMatch = trimmed.match(/^:?\s*s\s*\/([^\/]*)\/([^\/]*)\/?([gi]*)$/);
  if (currentSubMatch) {
    const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
    return executeSubstitution(state, currentLineRange, currentSubMatch, trimmed);
  }

  // 6. 범위 없는 단일 norm: :norm A;
  const standaloneNormMatch = trimmed.match(/^:?\s*(norm|normal)(!?)\s+(.*)$/);
  if (standaloneNormMatch) {
    const normKeys = standaloneNormMatch[3];
    const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
    return executeRangeNorm(state, currentLineRange, normKeys, trimmed, keyRunner);
  }

  // 7. 창 분할 및 종료 명령어 (:sp, :vsp, :q, :w, :help)
  const cleanCmdRaw = trimmed.replace(/^:/, '').trim();
  const splitMatch = cleanCmdRaw.match(/^(sp|split|vsp|vsplit)(?:\s+(.+))?$/i);
  if (splitMatch) {
    const isVertical = splitMatch[1].toLowerCase().startsWith('v');
    const targetFile = splitMatch[2]?.trim();
    const splitRes = splitWindow(
      state,
      isVertical ? 'vertical' : 'horizontal',
      state.secondaryLines,
      targetFile || state.secondaryFilename
    );
    return {
      ...splitRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  const cleanCmd = cleanCmdRaw.toLowerCase();
  if (cleanCmd === 'w' || cleanCmd === 'write') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.',
    };
  }

  if (cleanCmd === 'q' || cleanCmd === 'quit') {
    if (state.splitDirection && state.splitDirection !== 'none') {
      const closed = closeSplitWindow(state);
      return {
        ...closed,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '단일 창 상태입니다 (:q)',
    };
  }

  if (cleanCmd === 'h' || cleanCmd === 'help') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '지원 명령어: :[범위]d (삭제), :[범위]y (복사), :[범위]norm [명령], :g/패턴/d (글로벌), :s/이전/새문자/g',
    };
  }

  // 8. 알 수 없는 명령어는 에러 메시지와 함께 NORMAL 모드로 복귀
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `E492: 지원하지 않는 에디터 명령어입니다: ${trimmed}`,
  };
}

/**
 * Ex 커맨드 범위(range) 문자열을 0-indexed 시작/끝 행으로 해석합니다.
 */
export function parseRange(
  rawRange: string,
  state: VimEditorState
): { startLine: number; endLine: number } | null {
  const trimmed = rawRange.trim();
  const totalLines = state.lines.length;

  if (trimmed === '%' || trimmed === '1,$') {
    return { startLine: 0, endLine: totalLines - 1 };
  }

  if (trimmed === "'<,'>" || trimmed === "'<" || trimmed === "'>" || trimmed === '<,>') {
    const anchorLine = state.visualAnchor?.line ?? state.cursor.line;
    const cursorLine = state.cursor.line;
    const startLine = Math.max(0, Math.min(anchorLine, cursorLine));
    const endLine = Math.min(totalLines - 1, Math.max(anchorLine, cursorLine));
    return { startLine, endLine };
  }

  if (trimmed === '.' || trimmed === '') {
    return { startLine: state.cursor.line, endLine: state.cursor.line };
  }

  if (trimmed === '$') {
    return { startLine: totalLines - 1, endLine: totalLines - 1 };
  }

  // 단일 숫자: "5"
  const singleNumMatch = trimmed.match(/^([0-9]+)$/);
  if (singleNumMatch) {
    const l = Math.max(0, Math.min(totalLines - 1, parseInt(singleNumMatch[1], 10) - 1));
    return { startLine: l, endLine: l };
  }

  // 콤마로 구분된 두 항목: "3,7", ".,$", "1,." 등
  const commaParts = trimmed.split(',');
  if (commaParts.length === 2) {
    const resolvePart = (part: string, defaultLine: number): number => {
      const p = part.trim();
      if (p === '.') return state.cursor.line;
      if (p === '$') return totalLines - 1;
      if (p === "'<") return Math.min(state.visualAnchor?.line ?? state.cursor.line, state.cursor.line);
      if (p === "'>") return Math.max(state.visualAnchor?.line ?? state.cursor.line, state.cursor.line);
      const n = parseInt(p, 10);
      if (!isNaN(n)) return Math.max(0, Math.min(totalLines - 1, n - 1));
      return defaultLine;
    };

    const startLine = resolvePart(commaParts[0], state.cursor.line);
    const endLine = resolvePart(commaParts[1], state.cursor.line);
    const minLine = Math.min(startLine, endLine);
    const maxLine = Math.max(startLine, endLine);
    return { startLine: minLine, endLine: maxLine };
  }

  return null;
}

/**
 * :g 및 :v 글로벌 명령을 실행합니다.
 */
function executeGlobalCommand(
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
    regex = new RegExp(pattern);
  } catch {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 잘못된 정규식 패턴입니다: ${pattern}`,
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
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${pattern}`,
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
      commandMessage: `${matchedIndices.length}개 줄이 일괄 삭제되었습니다.`,
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
      commandMessage: `${matchedIndices.length}개 줄에 normal 명령을 실행했습니다.`,
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `지원하지 않는 글로벌 작업입니다: ${action}`,
  };
}

/**
 * :[range]d 줄 삭제를 실행합니다.
 */
function executeRangeDelete(
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
    commandMessage: `${range.endLine - range.startLine + 1}개 줄이 삭제되었습니다.`,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * :[range]y 줄 복사를 실행합니다.
 */
function executeRangeYank(
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
    commandMessage: `${range.endLine - range.startLine + 1}개 줄이 복사되었습니다.`,
  };
}

/**
 * :[range]norm {keys}를 실행합니다.
 */
function executeRangeNorm(
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
    commandMessage: `${count}개 줄에 normal 명령을 실행했습니다.`,
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

/**
 * 지정된 범위 내 텍스트 치환을 실행합니다.
 */
function executeSubstitution(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  subMatch: RegExpMatchArray,
  commandStr: string
): VimEditorState {
  const oldText = subMatch[1];
  const newText = subMatch[2];
  const flags = subMatch[3] ?? '';

  if (oldText.length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '치환할 대상 패턴(oldText)이 비어 있습니다.',
    };
  }

  const isGlobal = flags.includes('g');
  const isIgnoreCase = flags.includes('i');
  let regFlags = '';
  if (isGlobal) regFlags += 'g';
  if (isIgnoreCase) regFlags += 'i';

  const regex = new RegExp(escapeRegExp(oldText), regFlags);
  let totalSubCount = 0;

  const nextLines = [...state.lines];
  for (let l = range.startLine; l <= range.endLine; l++) {
    const line = nextLines[l];
    const matches = line.match(
      new RegExp(escapeRegExp(oldText), regFlags.includes('g') ? regFlags : regFlags + 'g')
    );
    if (matches) {
      totalSubCount += matches.length;
    }
    nextLines[l] = line.replace(regex, newText);
  }

  if (totalSubCount === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${oldText}`,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${totalSubCount}개 항목을 치환했습니다.`,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}
