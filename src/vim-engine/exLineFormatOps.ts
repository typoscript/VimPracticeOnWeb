import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { beginlineSolCol, keepCurswant, keepCurswantIfNosol, pushUndoSnapshotAt, setLastUndoCursor } from './undoHistory';
import { msg } from './messages';
import { getOptions } from './setEngine';
import { moveToFirstNonBlank } from './motions';
import { joinLines, shiftLineIndent } from './lineOperators';

/* Ex 범위 줄 명령 :center :right :left, :j, :> :<, :p :nu :l (exRangeOps.ts 에서 분리) */

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
  count?: number,
  addrCount = hasRange ? 1 : 0
): VimEditorState {
  const maxIdx = Math.max(0, state.lines.length - 1);
  let joinStart: number;
  let joinEnd: number;

  // Vim ex_join: 커서를 먼저 범위 첫 줄로 옮깁니다(열은 그대로). `:2,2j` 처럼 주소 둘이 같은 줄이면 아무것도 하지 않고,
  // 주소 하나로 마지막 줄을 가리키면(`:j` 를 마지막 줄에서) bell 입니다.
  if (count === undefined && (!range || range.startLine === range.endLine)) {
    const line = Math.max(0, Math.min(range ? range.startLine : state.cursor.line, maxIdx));
    const moved = keepCurswant({
      ...state,
      cursor: clampCursor(state.lines, { line, col: state.cursor.col }, 'NORMAL'),
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    });
    if (addrCount >= 2) return moved;
    if (line >= maxIdx) return { ...moved, bell: true };
  }

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
    ...stateWithUndo, changeListHint: { kind: 'at', line: startLine, col: 0, force: true },
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
