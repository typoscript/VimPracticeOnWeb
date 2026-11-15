import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';
import { getRegisterContent, syncRegisters } from './registers';
import { getOptions } from './setEngine';
import { moveToFirstNonBlank } from './motions';
import type { KeyRunner } from './exSubstitute';

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
    const bang = normMatch[2] === '!';
    const normKeys = normMatch[3];
    let curState = pushUndoSnapshot(state);

    // 'dd' 줄 삭제인 경우 줄 번호 왜곡을 방지하기 위해 역순(아래에서 위로) 실행
    const isLineDelete = normKeys.trim() === 'dd';
    const sortedIndices = isLineDelete ? [...matchedIndices].reverse() : matchedIndices;

    for (const idx of sortedIndices) {
      curState = executeNormalKeysOnLine(curState, idx, normKeys, keyRunner, bang);
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

/** `:d x 3`, `:y 3` 의 [x] [count] 인자를 파싱합니다. 형식이 맞지 않으면 null */
export function parseRegisterCountArgs(rest: string): { register?: string; count?: number } | null {
  const m = rest.trim().match(/^([A-Za-z"_+*])?\s*(\d+)?$/);
  if (!m) return null;
  return { register: m[1], count: m[2] ? parseInt(m[2], 10) : undefined };
}

/** `:d [x] {count}` 는 범위의 마지막 줄부터 count 줄을 대상으로 합니다. */
export function applyRangeCount(
  range: { startLine: number; endLine: number },
  count: number | undefined,
  lineTotal: number
): { startLine: number; endLine: number } {
  if (count === undefined) return range;
  const startLine = Math.min(range.endLine, lineTotal - 1);
  return { startLine, endLine: Math.min(lineTotal - 1, startLine + Math.max(1, count) - 1) };
}

/**
 * :[range]d [x] [count] 줄 삭제를 실행합니다. (레지스터 x 에 저장, `_` 는 블랙홀, 대문자는 누적)
 */
export function executeRangeDelete(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  commandStr: string,
  register?: string
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

  const res: VimEditorState = {
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
  return register ? syncRegisters({ ...state, activeRegister: register }, res, false) : res;
}

/**
 * :[range]y [x] [count] 줄 복사를 실행합니다.
 */
export function executeRangeYank(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  register?: string
): VimEditorState {
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  const res: VimEditorState = {
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
  return register ? syncRegisters({ ...state, activeRegister: register }, res, true) : res;
}

/**
 * :[line]pu[t][!] [x] — 레지스터 내용을 항상 줄 단위로 줄 아래(`!` 는 위)에 삽입합니다.
 * `insertAfterLine` 이 -1 이면 `:0put` (맨 위). 커서는 마지막으로 넣은 줄의 첫 비공백 문자로 갑니다.
 */
export function executeExPut(
  state: VimEditorState,
  insertAfterLine: number,
  before: boolean,
  register?: string
): VimEditorState {
  const reg = register ?? '"';
  const clip = getRegisterContent(state, reg);
  if (!clip || clip.content === undefined || clip.content === null) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E353: 레지스터 {reg} 가 비어 있습니다', { reg }),
      bell: true,
    };
  }
  const content = Array.isArray(clip.content) ? clip.content.join('\n') : clip.content;
  const inserted = content.replace(/\n$/, '').split('\n');
  const idx = insertAfterLine < 0 ? 0 : before ? insertAfterLine : insertAfterLine + 1;
  const newLines = [...state.lines.slice(0, idx), ...inserted, ...state.lines.slice(idx)];
  const lastLine = idx + inserted.length - 1;
  const firstNonBlank = (newLines[lastLine] ?? '').search(/\S/);
  return {
    ...pushUndoSnapshot(state),
    lines: newLines,
    cursor: clampCursor(newLines, { line: lastLine, col: Math.max(0, firstNonBlank) }, 'NORMAL'),
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: undefined,
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
  keyRunner?: KeyRunner,
  bang = false
): VimEditorState {
  let curState = pushUndoSnapshot(state);
  const count = range.endLine - range.startLine + 1;

  for (let l = range.startLine; l <= range.endLine; l++) {
    curState = executeNormalKeysOnLine(curState, l, normKeys, keyRunner, bang);
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
  keyRunner?: KeyRunner,
  bang = false
): VimEditorState {
  if (lineIdx < 0 || lineIdx >= state.lines.length) {
    return state;
  }

  const prevDisabled = state.keymapsDisabled;
  let curState: VimEditorState = {
    ...state,
    cursor: { line: lineIdx, col: 0 },
    mode: 'NORMAL',
    pendingKeys: undefined,
    ...(bang ? { keymapsDisabled: true } : {}),
  };

  const tokens = parseKeyTokens(keysStr);
  if (!keyRunner) {
    return { ...curState, keymapsDisabled: prevDisabled };
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

  return { ...curState, keymapsDisabled: prevDisabled };
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
 * :[range]ce[nter] [width], :[range]ri[ght] [width], :[range]le[ft] [indent] 정렬 명령을 실행합니다.
 */
export function executeAlignRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  align: 'center' | 'right' | 'left',
  rawArg?: string
): VimEditorState {
  const minLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const maxLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));
  if (minLine > maxLine || state.lines.length === 0) {
    return { ...state, mode: 'NORMAL', visualAnchor: undefined, commandBuffer: undefined, commandType: undefined };
  }

  const trimmedArg = (rawArg ?? '').trim();
  let widthOrIndent: number | undefined;
  if (trimmedArg.length > 0) {
    if (!/^\d+$/.test(trimmedArg)) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token: trimmedArg }),
        bell: true,
      };
    }
    widthOrIndent = parseInt(trimmedArg, 10);
  }

  const tw = state.options?.textwidth && state.options.textwidth > 0 ? state.options.textwidth : 80;
  const targetSize = align === 'left' ? (widthOrIndent ?? 0) : (widthOrIndent ?? tw);

  const stateWithSnapshot = pushUndoSnapshot(state);
  const nextLines = [...state.lines];

  for (let i = minLine; i <= maxLine; i++) {
    const trimmed = nextLines[i].trim();
    if (trimmed.length === 0) {
      nextLines[i] = '';
      continue;
    }
    if (align === 'left') {
      nextLines[i] = ' '.repeat(targetSize) + trimmed;
    } else if (align === 'right') {
      const pad = Math.max(0, targetSize - trimmed.length);
      nextLines[i] = ' '.repeat(pad) + trimmed;
    } else {
      const pad = Math.max(0, Math.floor((targetSize - trimmed.length) / 2));
      nextLines[i] = ' '.repeat(pad) + trimmed;
    }
  }

  const count = maxLine - minLine + 1;
  const cursorLine = Math.max(minLine, Math.min(maxLine, state.cursor.line));
  const firstNonBlank = nextLines[cursorLine].search(/\S/);
  const clamped = clampCursor(
    nextLines,
    { line: cursorLine, col: firstNonBlank >= 0 ? firstNonBlank : 0 },
    'NORMAL'
  );

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clamped,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{count}개 줄을 정렬했습니다 ({align})', { count, align }),
  };
}

/**
 * :[range]j[oin][!] [count]: 지정된 범위의 줄을 한 줄로 이어 붙입니다.
 */
export function executeJoinRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number } | null,
  hasRange: boolean,
  bang: boolean,
  count?: number
): VimEditorState {
  const maxIdx = Math.max(0, state.lines.length - 1);
  let joinStart: number;
  let joinEnd: number;

  if (count !== undefined) {
    joinStart = Math.max(0, Math.min(range ? range.endLine : state.cursor.line, maxIdx));
    joinEnd = Math.min(maxIdx, joinStart + Math.max(1, count) - 1);
  } else if (!hasRange || !range || range.startLine === range.endLine) {
    joinStart = Math.max(0, Math.min(range ? range.startLine : state.cursor.line, maxIdx));
    joinEnd = Math.min(maxIdx, joinStart + 1);
  } else {
    joinStart = Math.max(0, Math.min(range.startLine, range.endLine));
    joinEnd = Math.min(maxIdx, Math.max(range.startLine, range.endLine));
  }

  if (joinEnd <= joinStart || state.lines.length <= 1) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  let joined = state.lines[joinStart] ?? '';
  if (bang) {
    joined = state.lines.slice(joinStart, joinEnd + 1).join('');
  } else {
    for (let i = joinStart + 1; i <= joinEnd; i++) {
      const nextTrimmed = (state.lines[i] ?? '').trimStart();
      if (nextTrimmed.length === 0) continue;
      if (joined.length === 0) {
        joined = nextTrimmed;
      } else if (joined.endsWith(' ') || joined.endsWith('\t')) {
        joined += nextTrimmed;
      } else {
        joined += ' ' + nextTrimmed;
      }
    }
  }

  const nextLines = [
    ...state.lines.slice(0, joinStart),
    joined,
    ...state.lines.slice(joinEnd + 1),
  ];
  const nextCursor = moveToFirstNonBlank(nextLines, { line: joinStart, col: 0 });

  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{count}개 줄을 하나로 합쳤습니다', { count: joinEnd - joinStart + 1 }),
  };
}

/**
 * :[range]>[>] [count] / :[range]<[<] [count]: Ex 범위 들여쓰기/내어쓰기를 실행합니다.
 */
export function executeShiftRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number } | null,
  direction: 'in' | 'out',
  shiftCount: number,
  lineCount?: number
): VimEditorState {
  const maxIdx = Math.max(0, state.lines.length - 1);
  let startLine: number;
  let endLine: number;

  if (lineCount !== undefined) {
    startLine = Math.max(0, Math.min(range ? range.endLine : state.cursor.line, maxIdx));
    endLine = Math.min(maxIdx, startLine + Math.max(1, lineCount) - 1);
  } else {
    const r = range ?? { startLine: state.cursor.line, endLine: state.cursor.line };
    startLine = Math.max(0, Math.min(r.startLine, r.endLine));
    endLine = Math.min(maxIdx, Math.max(r.startLine, r.endLine));
  }

  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const et = opts.expandtab !== false;
  const indentUnit = et ? ' '.repeat(sw) : '\t';
  const times = Math.max(1, shiftCount);

  const stateWithUndo = pushUndoSnapshot(state);
  const nextLines = [...state.lines];

  for (let i = startLine; i <= endLine; i++) {
    let line = nextLines[i];
    if (direction === 'in') {
      if (line.length > 0) {
        line = indentUnit.repeat(times) + line;
      }
    } else {
      for (let t = 0; t < times; t++) {
        if (line.startsWith(indentUnit)) {
          line = line.slice(indentUnit.length);
        } else if (line.startsWith('\t')) {
          line = line.slice(1);
        } else if (line.startsWith(' ')) {
          let spaces = 0;
          while (spaces < sw && line[spaces] === ' ') spaces++;
          line = line.slice(spaces);
        }
      }
    }
    nextLines[i] = line;
  }

  const nextCursor = moveToFirstNonBlank(nextLines, { line: endLine, col: 0 });
  const linesCount = endLine - startLine + 1;

  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{linesCount}개 줄을 {dir} {times}회 들여썼습니다', {
      linesCount,
      dir: direction === 'in' ? '>' : '<',
      times,
    }),
  };
}

/**
 * :[range]p[rint], :[range]nu[mber], :[range]#, :[range]l[ist] 줄 출력 명령을 실행합니다.
 */
export function executePrintRange(
  state: VimEditorState,
  range: { startLine: number; endLine: number } | null,
  style: 'print' | 'number' | 'list',
  count?: number
): VimEditorState {
  const maxIdx = Math.max(0, state.lines.length - 1);
  let startLine: number;
  let endLine: number;

  if (count !== undefined) {
    startLine = Math.max(0, Math.min(range ? range.endLine : state.cursor.line, maxIdx));
    endLine = Math.min(maxIdx, startLine + Math.max(1, count) - 1);
  } else {
    const r = range ?? { startLine: state.cursor.line, endLine: state.cursor.line };
    startLine = Math.max(0, Math.min(r.startLine, r.endLine));
    endLine = Math.min(maxIdx, Math.max(r.startLine, r.endLine));
  }

  const out: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = state.lines[i] ?? '';
    if (style === 'print') {
      out.push(line);
    } else if (style === 'number') {
      out.push(`${String(i + 1).padStart(6, ' ')}  ${line}`);
    } else {
      let escaped = '';
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        const code = line.charCodeAt(c);
        if (ch === '\t') escaped += '^I';
        else if (code < 32) escaped += `^${String.fromCharCode(code + 64)}`;
        else escaped += ch;
      }
      out.push(`${escaped}$`);
    }
  }

  const nextCursor = clampCursor(state.lines, { line: endLine, col: 0 }, 'NORMAL');

  return {
    ...state,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: out.join('\n'),
  };
}
