import { CursorPosition, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { beginlineSolCol, keepCurswantIfNosol, pushUndoSnapshotAt, setLastUndoCursor } from './undoHistory';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';
import { getRegisterContent, syncRegisters } from './registers';
import { getOptions } from './setEngine';
import { moveToFirstNonBlank } from './motions';
import { joinLines, shiftLineIndent } from './lineOperators';
import type { KeyRunner } from './exSubstitute';

/**
 * :g 및 :v 글로벌 명령을 실행합니다.
 */
export function executeGlobalCommand(
  state: VimEditorState,
  gMatch: RegExpMatchArray,
  _commandStr: string,
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
    // Vim global_exe → ex_operators: 첫 일치 줄의 curswant 열(beginline(BL_SOL))에서 실행 취소 기록이 시작됩니다.
    const firstMatch = matchedIndices[0];
    const stateWithUndo = pushUndoSnapshotAt(state, {
      line: firstMatch,
      col: beginlineSolCol(state, state.lines[firstMatch] ?? ''),
    });
    const deleteSet = new Set(matchedIndices);
    const yanked = state.lines.filter((_, idx) => deleteSet.has(idx));
    const newLines = state.lines.filter((_, idx) => !deleteSet.has(idx));
    const finalLines = newLines.length === 0 ? [''] : newLines;
    // Vim: 마지막 :d 뒤 커서 줄(마지막 일치 줄이 앞선 삭제만큼 올라온 자리)의 첫 비공백
    const lastMatch = matchedIndices[matchedIndices.length - 1];
    const gLine = Math.min(lastMatch - (matchedIndices.length - 1), finalLines.length - 1);
    const nextCursor = clampCursor(
      finalLines,
      { line: gLine, col: Math.max(0, (finalLines[gLine] ?? '').search(/\S/)) },
      'NORMAL'
    );

    // Vim 은 줄마다 :d 를 실행하므로 무명 레지스터에는 마지막으로 지운 줄만 남습니다.
    const deletedState: VimEditorState = {
      ...stateWithUndo,
      lines: finalLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content: yanked[yanked.length - 1] ?? '',
      },
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{matchedIndicesCount}개 줄이 일괄 삭제되었습니다.', { matchedIndicesCount: matchedIndices.length }),
    };
    return syncRegisters(state, deletedState, false);
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

    let firstUndoCursor: CursorPosition | undefined;
    for (const idx of sortedIndices) {
      ({ state: curState, firstUndoCursor } = runNormalKeysOnLine(curState, idx, normKeys, keyRunner, bang, firstUndoCursor));
    }
    if (firstUndoCursor) curState = setLastUndoCursor(curState, state, firstUndoCursor);

    return {
      ...curState,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('{matchedIndicesCount}개 줄에 normal 명령을 실행했습니다.', { matchedIndicesCount: matchedIndices.length }),
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
  _commandStr: string,
  register?: string
): VimEditorState {
  // Vim ex_operators: 첫 줄의 curswant 열(beginline(BL_SOL))로 커서를 옮긴 뒤 지우므로 실행 취소는 그 자리로 돌아갑니다.
  const stateWithUndo = pushUndoSnapshotAt(state, {
    line: range.startLine,
    col: beginlineSolCol(state, state.lines[range.startLine] ?? ''),
  });
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  const remaining = [
    ...state.lines.slice(0, range.startLine),
    ...state.lines.slice(range.endLine + 1),
  ];
  const newLines = remaining.length === 0 ? [''] : remaining;
  // op_delete 줄 단위: beginline(BL_WHITE | BL_FIX) — 첫 비공백, curswant 도 그 열
  const delLine = Math.min(range.startLine, newLines.length - 1);
  const nextCursor = clampCursor(
    newLines,
    { line: delLine, col: Math.max(0, (newLines[delLine] ?? '').search(/\S/)) },
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
  };
  return syncRegisters({ ...state, activeRegister: register ?? undefined }, res, false);
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
  // Vim ex_operators: `:y` 는 커서를 옮기지 않으므로 curswant 도 그대로입니다.
  const res: VimEditorState = {
    ...state,
    keepCurswantAt: { line: state.cursor.line, col: state.cursor.col },
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
  return syncRegisters({ ...state, activeRegister: register ?? undefined }, res, true);
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
  // Vim: 한 번도 쓰지 않은 레지스터는 E353, 빈 문자열로 설정된 레지스터는 빈 줄 하나를 넣습니다.
  const clip = getRegisterContent(state, reg);
  if (!clip || clip.content === undefined || clip.content === null) {
    // Vim do_one_cmd: 명령이 실패해도 커서는 먼저 주소의 줄로 갑니다 (:0pu → 첫 줄, 열은 curswant).
    const line = Math.max(0, Math.min(insertAfterLine, state.lines.length - 1));
    const col = Math.max(0, Math.min(state.curswant ?? state.cursor.col, (state.lines[line] ?? '').length - 1));
    return {
      ...state,
      cursor: { line, col },
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E353: 레지스터 {reg} 가 비어 있습니다', { reg }),
      bell: true,
    };
  }
  const rawContent = clip.content;
  const content = Array.isArray(rawContent) ? rawContent.join('\n') : rawContent;
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
  _commandStr: string,
  keyRunner?: KeyRunner,
  bang = false
): VimEditorState {
  let curState = pushUndoSnapshot(state);
  const count = range.endLine - range.startLine + 1;

  let firstUndoCursor: CursorPosition | undefined;
  for (let l = range.startLine; l <= range.endLine; l++) {
    ({ state: curState, firstUndoCursor } = runNormalKeysOnLine(curState, l, normKeys, keyRunner, bang, firstUndoCursor));
  }
  if (firstUndoCursor) curState = setLastUndoCursor(curState, state, firstUndoCursor);

  return {
    ...curState,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{count}개 줄에 normal 명령을 실행했습니다.', { count }),
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
  return runNormalKeysOnLine(state, lineIdx, keysStr, keyRunner, bang, undefined).state;
}

/**
 * executeNormalKeysOnLine 과 같고, 아직 기록이 없으면(`firstUndoCursor` 가 없으면) 안쪽 키가 처음 남긴
 * 실행 취소 기록의 커서(변경을 시작한 위치)를 함께 돌려줍니다. Vim 은 `:norm` 전체를 한 번의 실행 취소로 묶고,
 * 그 안의 첫 변경이 시작될 때의 커서를 uh_cursor 로 저장합니다.
 */
function runNormalKeysOnLine(
  state: VimEditorState,
  lineIdx: number,
  keysStr: string,
  keyRunner: KeyRunner | undefined,
  bang: boolean,
  firstUndoCursor: CursorPosition | undefined
): { state: VimEditorState; firstUndoCursor: CursorPosition | undefined } {
  if (lineIdx < 0 || lineIdx >= state.lines.length) {
    return { state, firstUndoCursor };
  }

  const prevDisabled = state.keymapsDisabled;
  // 매크로 녹화 중이어도 :norm 안의 키는 녹화에 넣지 않습니다 (녹화에는 :norm 명령 자체가 들어감).
  const prevRecording = state.recordingMacro;
  let curState: VimEditorState = {
    ...state,
    cursor: { line: lineIdx, col: 0 },
    mode: 'NORMAL',
    pendingKeys: undefined,
    recordingMacro: null,
    ...(bang ? { keymapsDisabled: true } : {}),
  };

  const tokens = parseKeyTokens(keysStr);
  if (!keyRunner) {
    return { state: { ...curState, keymapsDisabled: prevDisabled, recordingMacro: prevRecording }, firstUndoCursor };
  }

  // Vim 처럼 :norm 안에서 한 변경은 `.` 로 반복할 수 있게 기록합니다 (반복 재생이 아닌 일반 입력으로 실행).
  for (const token of tokens) {
    curState = keyRunner(curState, token, false);
    // 실제 Vim과 동일하게 키가 실패하면 해당 줄의 남은 키를 버립니다.
    if (curState.bell) break;
  }

  // 명령어 수행 후 여전히 INSERT 모드인 경우 자동으로 Escape 호출하여 완료
  if (curState.mode !== 'NORMAL') {
    curState = keyRunner(curState, 'Escape', false);
  }

  // 안쪽 키가 처음 남긴 실행 취소 기록 = 첫 변경을 시작한 커서
  let found = firstUndoCursor;
  if (!found) {
    const base = state.undoStack ?? [];
    const stack = curState.undoStack ?? [];
    if (stack.length > base.length) found = stack[base.length].cursor;
    else if (stack.length > 0 && stack[stack.length - 1] !== base[base.length - 1]) found = stack[stack.length - 1].cursor;
  }

  // :norm 전체가 한 번의 실행 취소 단위가 되도록, 안쪽 키가 만든 실행 취소 기록은 버리고 시작 시점의 기록을 둡니다.
  return {
    state: {
      ...curState,
      keymapsDisabled: prevDisabled,
      recordingMacro: prevRecording,
      undoStack: state.undoStack,
      redoStack: state.redoStack,
      undoTreeNodes: state.undoTreeNodes,
      currentUndoSeq: state.currentUndoSeq,
      maxUndoSeq: state.maxUndoSeq,
      undoTimeHistory: state.undoTimeHistory,
      undoTimeIndex: state.undoTimeIndex,
      undoJoinMerged: state.undoJoinMerged,
    },
    firstUndoCursor: found,
  };
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

  // Vim ex_join → do_join: J 와 같은 규칙('formatoptions' j 의 주석 리더 제거, 빈 줄은 공백 없이)으로 잇습니다.
  // 커서 줄만 첫 줄로 옮기고(열은 그대로) do_join 이 범위 전체를 u_save 하므로 실행 취소는 그 자리로 돌아갑니다.
  const joinedState = joinLines({ ...state, cursor: { line: joinStart, col: 0 } }, joinEnd - joinStart, !bang);
  const stateWithUndo = setLastUndoCursor(
    joinedState,
    state,
    { line: joinStart, col: state.cursor.col },
    { start: joinStart, end: joinEnd }
  );
  const nextLines = joinedState.lines;
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
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);
  const times = Math.max(1, shiftCount);

  // Vim ex_operators: 첫 줄의 curswant 열(beginline(BL_SOL))에서 op_shift 가 실행 취소 기록을 남깁니다.
  const stateWithUndo = pushUndoSnapshotAt(
    state,
    { line: startLine, col: beginlineSolCol(state, state.lines[startLine] ?? '') },
    { start: startLine, end: endLine }
  );
  const nextLines = [...state.lines];

  for (let i = startLine; i <= endLine; i++) {
    nextLines[i] = shiftLineIndent(nextLines[i], direction, sw, ts, et, sr, times);
  }

  const nextCursor = moveToFirstNonBlank(nextLines, { line: endLine, col: 0 });
  const linesCount = endLine - startLine + 1;

  // op_shift(":>"): 마지막 줄의 새 들여쓰기 끝(set_indent) — w_set_curswant 를 켜지 않으므로 curswant 유지
  return keepCurswantIfNosol({
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
  });
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
