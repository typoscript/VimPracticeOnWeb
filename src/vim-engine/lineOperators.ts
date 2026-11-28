import { CursorPosition, VimEditorState } from './types';
import { columnForVirtual, curswantColumnOn, cursorVirtualColumn, tabstopOf } from './virtualColumn';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { pushUndoSnapshot } from './operators';
import { pushUndoSnapshotAt, visualOperatorStart } from './undoHistory';
import { getOptions } from './setEngine';
import { parseWhichwrapFlags, hasFormatOption, extractCommentPrefix } from './setOptionsCore';
import {
  moveToFirstNonBlank,
  moveToNextWord,
  moveToNextWORD,
  moveToWordEnd,
  moveToWORDEnd,
  moveToPrevWord,
  moveToPrevWORD,
  moveToLineStart,
  moveToLineEnd,
  moveToFirstLine,
  moveToLastLine,
} from './motions';
import { isPositionSelected, linewiseVisualCol } from './visual';
import { cindentLines, type CIndentOptions } from './cindent';
import { indentexprLines, jsIndentKindForFilename, jsIndentKindForFiletype, type JsIndentKind } from './filetypeIndent';
export { modifyNumberAtCursor, modifyNumberVisual } from './numberOperators';

/**
 * J / gJ: 현재 줄과 아랫줄을 이어 붙입니다.
 * [count]J 지원 (예: 3J -> 현재 줄 포함 3개 줄 연결)
 * insertSpace = false (gJ): 공백을 삽입하지 않고 뒷줄의 들여쓰기를 제거하여 딱 붙임
 */
/**
 * Vim nv_join: 마지막 줄에서 [count]J (count 3 이상)는 실패하지 않고 count 를 남은 줄 수(1)로 줄여 do_join(1) 합니다.
 * 바뀌는 글자는 없지만 u_save 로 실행 취소 항목이 생기고 커서는 0열로, `.` 는 count 1(= 두 줄 합치기)로 기록됩니다.
 */
export function joinSingleLastLine(state: VimEditorState, gJ: boolean): VimEditorState {
  return {
    ...pushUndoSnapshot(state),
    cursor: { line: state.cursor.line, col: 0 },
    pendingKeys: undefined,
    lastChangeKeys: gJ ? ['g', 'J'] : ['J'],
  };
}

export function joinLines(state: VimEditorState, count = 1, insertSpace = true): VimEditorState {
  if (state.lines.length <= 1 || state.cursor.line >= state.lines.length - 1) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const currentLineIdx = state.cursor.line;
  const joinCount = Math.max(1, count);
  const maxJoinLine = Math.min(state.lines.length - 1, currentLineIdx + joinCount);

  let currentJoined = state.lines[currentLineIdx];
  let firstJoinCol = currentJoined.length;
  const stripCommentLeader = insertSpace && hasFormatOption(getOptions(state), 'j');
  const baseComment = stripCommentLeader ? extractCommentPrefix(currentJoined) : null;

  for (let i = currentLineIdx + 1; i <= maxJoinLine; i++) {
    const rawNext = state.lines[i] ?? '';
    let nextLineTrimmed = rawNext.trimStart();
    if (stripCommentLeader && baseComment) {
      const nextComment = extractCommentPrefix(rawNext);
      const compatibleLeader =
        nextComment &&
        (nextComment.leader === baseComment.leader ||
          (baseComment.leader === '/*' && nextComment.leader === '*'));
      if (compatibleLeader) {
        nextLineTrimmed = rawNext.slice(
          nextComment.indent.length + nextComment.leader.length + nextComment.ws.length
        );
      }
    }
    if (!insertSpace) {
      // gJ 는 공백을 넣거나 지우지 않습니다 (붙는 줄의 들여쓰기도 그대로 남음).
      firstJoinCol = currentJoined.length;
      currentJoined += rawNext;
    } else {
      if (currentJoined.length === 0) {
        currentJoined = nextLineTrimmed;
        firstJoinCol = 0;
      } else if (nextLineTrimmed.length === 0) {
        firstJoinCol = currentJoined.length;
      } else if (currentJoined.endsWith(' ')) {
        // Vim do_join: 공백으로 끝난 줄에는 공백을 넣지 않고, 커서는 붙인 줄의 첫 글자입니다 (col = sumsize - currsize).
        firstJoinCol = currentJoined.length;
        currentJoined += nextLineTrimmed;
      } else {
        firstJoinCol = currentJoined.length;
        currentJoined += ' ' + nextLineTrimmed;
      }
    }
  }

  const newLines = [
    ...state.lines.slice(0, currentLineIdx),
    currentJoined,
    ...state.lines.slice(maxJoinLine + 1),
  ];

  // Vim: 커서는 마지막으로 이어 붙인 지점에 둡니다 (3J 는 두 번째 이음 자리).
  const targetCol = Math.max(0, Math.min(firstJoinCol, Math.max(0, currentJoined.length - 1)));

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: currentLineIdx, col: targetCol },
    pendingKeys: undefined,
  };
}

/**
 * ~: 커서 위치 문자의 대소문자를 반전하고 오른쪽으로 한 칸 이동합니다.
 */
export function toggleCaseChar(state: VimEditorState, count = 1): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const wwTilde = parseWhichwrapFlags(getOptions(state).whichwrap).has('~');
  if (currentLine.length === 0) {
    if (wwTilde && state.cursor.line < state.lines.length - 1) {
      return {
        ...state,
        cursor: { line: state.cursor.line + 1, col: 0 },
        pendingKeys: undefined,
      };
    }
    // Vim n_swapchar: 빈 줄의 ~ 는 실패합니다 (bell, `.` 대상이 아님).
    return { ...state, pendingKeys: undefined, bell: true };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const col = state.cursor.col;
  const chars = currentLine.split('');
  const repeat = Math.min(Math.max(1, count), chars.length - col);

  for (let i = 0; i < repeat; i++) {
    const idx = col + i;
    const ch = chars[idx];
    if (ch === ch.toUpperCase()) {
      chars[idx] = ch.toLowerCase();
    } else {
      chars[idx] = ch.toUpperCase();
    }
  }

  const newLines = [...state.lines];
  newLines[state.cursor.line] = chars.join('');
  const wrappedToNext =
    wwTilde && col + repeat >= chars.length && state.cursor.line < state.lines.length - 1;
  const newCursor = wrappedToNext
    ? { line: state.cursor.line + 1, col: 0 }
    : { line: state.cursor.line, col: Math.min(col + repeat, Math.max(0, chars.length - 1)) };

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/** 대소문자 연산자: gu(소문자) gU(대문자) g~(반전) g?(ROT13) */
export type CaseOperator = 'gu' | 'gU' | 'g~' | 'g?';
export type CaseType = 'toggle' | 'lower' | 'upper' | 'rot13';

export function caseTypeForOperator(op: CaseOperator): CaseType {
  return op === 'g~' ? 'toggle' : op === 'gu' ? 'lower' : op === 'gU' ? 'upper' : 'rot13';
}

/** ROT13: 영문자를 알파벳 순서로 13칸 돌립니다 (그 밖의 문자는 그대로) */
function rot13(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
  if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
  return ch;
}


/**
 * VISUAL 모드 대소문자 변환:
 * ~ (대소문자 반전), u (모두 소문자), U (모두 대문자)
 */
export function changeCaseVisual(
  state: VimEditorState,
  type: CaseType,
  /** 연산 후 커서 (기본: Vim 처럼 선택 영역의 시작). 실행 취소도 이 위치로 돌아옵니다. */
  cursorAfter?: { line: number; col: number }
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const mode = state.mode;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);

  // Vim: 연산 전 커서를 영역 시작으로 옮긴 뒤 실행 취소 지점을 저장합니다 (u 가 이 위치로 돌아옴).
  // 줄 단위(V)는 시작 줄의 0열, 블록(Ctrl-v)은 왼쪽 위 모서리, 문자 단위는 앞쪽 끝입니다.
  const startCursor =
    cursorAfter ??
    (mode === 'VISUAL_LINE' || mode === 'SELECT_LINE'
      ? { line: minLine, col: linewiseVisualCol(state, minLine) }
      : mode === 'VISUAL_BLOCK' || mode === 'SELECT_BLOCK'
        ? { line: minLine, col: Math.min(anchor.col, cursor.col) }
        : anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
          ? anchor
          : cursor);
  const stateWithUndo = pushUndoSnapshot({ ...state, cursor: { ...startCursor } });

  const newLines = [...state.lines];

  for (let l = minLine; l <= maxLine; l++) {
    const lineStr = newLines[l];
    const chars = lineStr.split('');

    for (let c = 0; c < chars.length; c++) {
      if (isPositionSelected(l, c, anchor, cursor, mode)) {
        const ch = chars[c];
        if (type === 'toggle') {
          chars[c] = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
        } else if (type === 'lower') {
          chars[c] = ch.toLowerCase();
        } else if (type === 'upper') {
          chars[c] = ch.toUpperCase();
        } else if (type === 'rot13') {
          chars[c] = rot13(ch);
        }
      }
    }

    newLines[l] = chars.join('');
  }

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: clampCursor(newLines, startCursor, 'NORMAL'),
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };
}

/**
 * 모션 또는 라인 단위 대소문자 변환을 실행합니다. (gu, gU, g~)
 */
export function executeCaseMotion(
  state: VimEditorState,
  op: CaseOperator,
  motionKey: string,
  count = 1
): VimEditorState {
  const caseType = caseTypeForOperator(op);

  // 1. 라인 단위 변환 (guu, gUU, g~~, g??, gugu, gUgU, g~g~, g?g?)
  if (
    (op === 'gu' && (motionKey === 'u' || motionKey === 'g')) ||
    (op === 'gU' && (motionKey === 'U' || motionKey === 'g')) ||
    (op === 'g~' && (motionKey === '~' || motionKey === 'g')) ||
    (op === 'g?' && (motionKey === '?' || motionKey === 'g'))
  ) {
    const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: state.cursor.line, col: 0 },
      cursor: { line: endLine, col: 0 },
    };
    // Vim nv_lineop: 모션 끝은 (끝 줄, 첫 비공백)이고 연산 후 커서는 원래 위치와 그중 앞쪽입니다.
    // 그래서 guu 는 첫 비공백(커서가 그 뒤에 있으면), 4guu 는 원래 열에 남습니다.
    const lineStart = state.cursor.line;
    const fnb = getFirstNonBlankCol(state.lines[lineStart] ?? '');
    const cursorAfter =
      endLine > lineStart ? { line: lineStart, col: state.cursor.col } : { line: lineStart, col: Math.min(state.cursor.col, fnb) };
    return changeCaseVisual(visualState, caseType, cursorAfter);
  }

  // 2. 모션에 따른 대상 좌표 계산
  let target = state.cursor;
  let isLinewise = false;

  if (motionKey === 'w') {
    for (let i = 0; i < count; i++) target = moveToNextWord(state.lines, target);
  } else if (motionKey === 'W') {
    for (let i = 0; i < count; i++) target = moveToNextWORD(state.lines, target);
  } else if (motionKey === 'e') {
    for (let i = 0; i < count; i++) target = moveToWordEnd(state.lines, target);
  } else if (motionKey === 'E') {
    for (let i = 0; i < count; i++) target = moveToWORDEnd(state.lines, target);
  } else if (motionKey === 'b') {
    for (let i = 0; i < count; i++) target = moveToPrevWord(state.lines, target);
  } else if (motionKey === 'B') {
    for (let i = 0; i < count; i++) target = moveToPrevWORD(state.lines, target);
  } else if (motionKey === '$') {
    target = moveToLineEnd(state.lines, target);
  } else if (motionKey === '0') {
    target = moveToLineStart(state.lines, target);
  } else if (motionKey === '^') {
    target = moveToFirstNonBlank(state.lines, target);
  } else if (motionKey === 'G') {
    target = moveToLastLine(state.lines, target);
    isLinewise = true;
  } else if (motionKey === 'gg') {
    // [count]gg 는 count 번째 줄입니다 (3gUgg, 줄이 모자라면 마지막 줄).
    target = count > 1 ? { line: Math.min(state.lines.length - 1, count - 1), col: 0 } : moveToFirstLine(state.lines, target);
    isLinewise = true;
  } else if (motionKey === 'j') {
    target = { line: Math.min(state.lines.length - 1, state.cursor.line + count), col: state.cursor.col };
    isLinewise = true;
  } else if (motionKey === 'k') {
    target = { line: Math.max(0, state.cursor.line - count), col: state.cursor.col };
    isLinewise = true;
  } else if (motionKey === 'h') {
    target = { line: state.cursor.line, col: Math.max(0, state.cursor.col - count) };
  } else if (motionKey === 'l') {
    const curLine = state.lines[state.cursor.line] ?? '';
    target = { line: state.cursor.line, col: Math.min(curLine.length, state.cursor.col + count) };
  } else {
    return { ...state, pendingKeys: undefined };
  }

  if (isLinewise) {
    const minLine = Math.min(state.cursor.line, target.line);
    const maxLine = Math.max(state.cursor.line, target.line);
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: minLine, col: 0 },
      cursor: { line: maxLine, col: 0 },
    };
    return changeCaseVisual(visualState, caseType);
  }

  let start = state.cursor;
  let end = target;
  if (start.line > end.line || (start.line === end.line && start.col > end.col)) {
    const tmp = start;
    start = end;
    end = tmp;
  } else if (motionKey === 'w' || motionKey === 'W') {
    if (end.col > 0 && end.line === start.line) {
      end = { line: end.line, col: end.col - 1 };
    }
  }

  const visualState: VimEditorState = {
    ...state,
    mode: 'VISUAL',
    visualAnchor: start,
    cursor: end,
  };
  return changeCaseVisual(visualState, caseType);
}

/**
 * 단일 줄에 들여쓰기/내어쓰기를 적용합니다 (Vim shift_line + set_indent).
 * 들여쓰기 화면 폭(탭은 tabstop 기준)에 shiftwidth 를 더하거나 빼고('shiftround' 면 배수로 맞춤),
 * 들여쓰기를 새로 만듭니다: 'expandtab' 이면 공백만, 아니면 탭 다음 남는 공백.
 * Vim op_shift 처럼 빈 줄은 건드리지 않습니다.
 */
export function shiftLineIndent(
  line: string,
  direction: 'in' | 'out',
  sw: number,
  ts: number,
  et: boolean,
  shiftround: boolean,
  times = 1
): string {
  if (line.length === 0) return line;
  const tabstop = Math.max(1, ts);
  let idx = 0;
  let width = 0;
  while (idx < line.length && (line[idx] === ' ' || line[idx] === '\t')) {
    width += line[idx] === '\t' ? tabstop - (width % tabstop) : 1;
    idx++;
  }
  let nextWidth: number;
  if (shiftround) {
    const units = Math.floor(width / sw);
    const amount = width % sw !== 0 && direction === 'out' ? times - 1 : times;
    nextWidth = (direction === 'out' ? Math.max(0, units - amount) : units + amount) * sw;
  } else {
    nextWidth = direction === 'out' ? Math.max(0, width - sw * times) : width + sw * times;
  }
  const indent = et ? ' '.repeat(nextWidth) : '\t'.repeat(Math.floor(nextWidth / tabstop)) + ' '.repeat(nextWidth % tabstop);
  return indent + line.slice(idx);
}

/**
 * >> / <<: 현재 줄 및 count개 줄 들여쓰기 / 내어쓰기 (shiftwidth / expandtab / shiftround 설정 반영)
 */
export function indentLines(
  state: VimEditorState,
  count = 1,
  direction: 'in' | 'out',
  /** 연산 전 기억한 열(curswant). 'nostartofline'(기본값)이면 Vim 처럼 이 열로 갑니다 (do_pending_operator 의 old_col). */
  keepCol: number = state.curswant ?? cursorVirtualColumn(state)
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);

  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);

  const newLines = [...state.lines];
  for (let i = startLine; i <= endLine; i++) {
    newLines[i] = shiftLineIndent(newLines[i], direction, sw, ts, et, sr, 1);
  }

  // Vim op_shift: beginline(BL_SOL | BL_FIX) — 'startofline' 이면 첫 비공백, 아니면 원래 열(줄 길이로 제한)
  const newCursor = opts.startofline
    ? moveToFirstNonBlank(newLines, { line: startLine, col: 0 })
    : { line: startLine, col: Math.max(0, Math.min(columnForVirtual(newLines[startLine] ?? '', keepCol, tabstopOf(state)), (newLines[startLine] ?? '').length - 1)) };

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드 > / <: 선택된 모든 행 들여쓰기 / 내어쓰기
 */
export function indentVisual(
  state: VimEditorState,
  direction: 'in' | 'out',
  /** 비주얼 [count]> 는 count 번 들여씁니다 (Vim op_shift 의 amount). */
  times = 1
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
  const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);

  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);
  const indentStr = et ? ' '.repeat(sw) : '\t';

  const newLines = [...state.lines];
  if (state.mode === 'VISUAL_BLOCK') {
    const minCol = Math.min(state.visualAnchor.col, state.cursor.col);
    for (let i = minLine; i <= maxLine; i++) for (let t = 0; t < Math.max(1, times); t++) {
      const line = newLines[i];
      // Vim shift_block: 블록 왼쪽 열에 못 미치는 줄만 건너뜁니다 (줄 끝이 딱 그 열이면 끝에 공백이 붙음).
      if (line.length < minCol) continue;
      const prefix = line.slice(0, minCol);
      const rest = line.slice(minCol);
      if (direction === 'in') {
        if (rest.length > 0 || minCol > 0) newLines[i] = prefix + indentStr + rest;
      } else {
        if (rest.startsWith(indentStr)) {
          newLines[i] = prefix + rest.slice(indentStr.length);
        } else if (rest.startsWith('\t')) {
          newLines[i] = prefix + rest.slice(1);
        } else if (rest.startsWith(' ')) {
          let spaces = 0;
          while (spaces < sw && rest[spaces] === ' ') spaces++;
          newLines[i] = prefix + rest.slice(spaces);
        }
      }
    }
    const blockCursor = {
      line: minLine,
      col: Math.min(minCol, Math.max(0, (newLines[minLine] ?? '').length - 1)),
    };
    // Vim op_shift 는 커서를 블록 왼쪽 위(oap->start)에 둔 채 u_save 하므로 실행 취소도 그 자리로 돌아옵니다.
    return {
      ...pushUndoSnapshotAt(state, { line: minLine, col: minCol }),
      lines: newLines,
      cursor: blockCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  for (let i = minLine; i <= maxLine; i++) {
    newLines[i] = shiftLineIndent(newLines[i], direction, sw, ts, et, sr, Math.max(1, times));
  }

  // Vim op_shift: beginline(BL_SOL | BL_FIX) — 'nostartofline' 이면 coladvance(w_curswant): 기억한 열로 갑니다
  // (vkl> 처럼 짧은 줄에서 l 이 실패해도 k 전의 열, v$> 는 줄 끝).
  const newCursor = opts.startofline
    ? moveToFirstNonBlank(newLines, { line: minLine, col: 0 })
    : clampCursor(newLines, { line: minLine, col: curswantColumnOn(state, newLines, minLine) }, 'NORMAL');

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };
}

/** `=` 가 쓰는 옵션. `indentexpr` 가 있으면 cindent 대신 그 파일타입 들여쓰기 스크립트를 씁니다. */
export interface EqualIndentOptions extends CIndentOptions {
  indentexpr?: JsIndentKind;
}

/**
 * `=` 가 쓰는 shiftwidth / tabstop / expandtab (Vim 처럼 shiftwidth 0 이면 tabstop) 와 파일타입 들여쓰기.
 * Neovim 기본값(`filetype plugin indent on`)처럼 `:filetype indent off` 가 아니면, 'filetype'(없으면 파일 이름으로
 * 감지)이 javascript / typescript(+react) 일 때 runtime/indent 스크립트를 씁니다. 파일타입이 없으면 cindent 입니다.
 */
export function cindentOptionsFor(state: VimEditorState): EqualIndentOptions {
  const opts = getOptions(state);
  const base: EqualIndentOptions = { shiftwidth: opts.shiftwidth, tabstop: opts.tabstop, expandtab: opts.expandtab };
  const settings = state.filetypeSettings;
  if (settings?.indent === false) return base;
  const explicit = opts.filetype?.trim();
  const kind = explicit
    ? jsIndentKindForFiletype(explicit)
    : settings?.detect === false
    ? null
    : jsIndentKindForFilename(state.primaryFilename);
  return kind ? { ...base, indentexpr: kind } : base;
}

/**
 * `=` 연산자: 줄 범위를 다시 들여씁니다. 기본은 Vim 의 C 들여쓰기(cindent, 기본 'cinoptions') 규칙으로,
 * 'indentexpr'·'equalprg' 가 비어 있는 `nvim -u NONE` 의 `=` 와 같습니다 (`cindent.ts`).
 * `opts.indentexpr` 가 있으면 JS/TS 들여쓰기 스크립트를 씁니다 (`filetypeIndent.ts`).
 */
export function formatLinesRange(
  lines: string[],
  fromLine: number,
  toLine: number,
  opts: EqualIndentOptions = { shiftwidth: 2, tabstop: 2, expandtab: true }
): string[] {
  if (opts.indentexpr) return indentexprLines(lines, fromLine, toLine, opts, opts.indentexpr);
  return cindentLines(lines, fromLine, toLine, opts);
}

/**
 * `=` 뒤 커서 (Vim op_reindent 의 beginline(BL_SOL | BL_FIX)): 범위 첫 줄로 가서
 * 'startofline' 이면 첫 비공백, 아니면 기억한 열(curswant, `$` 뒤면 줄 끝)입니다.
 */
export function equalOperatorCursor(
  state: VimEditorState,
  lines: string[],
  startLine: number,
  keepCol: number = state.curswant ?? cursorVirtualColumn(state)
): { line: number; col: number } {
  if (getOptions(state).startofline) return moveToFirstNonBlank(lines, { line: startLine, col: 0 });
  const len = (lines[startLine] ?? '').length;
  return { line: startLine, col: Math.max(0, Math.min(columnForVirtual(lines[startLine] ?? '', keepCol, tabstopOf(state)), len - 1)) };
}

/**
 * 지정된 행 범위 [startLine, endLine]에 대해 들여쓰기를 자동 정렬하고 실행 취소 스냅샷을 푸시합니다.
 */
export function formatIndentRange(
  state: VimEditorState,
  startLine: number,
  endLine: number,
  keepCol?: number,
  opStart: CursorPosition = state.cursor
): VimEditorState {
  const minLine = Math.max(0, Math.min(startLine, endLine));
  const maxLine = Math.min(state.lines.length - 1, Math.max(startLine, endLine));
  const formatted = formatLinesRange(state.lines, minLine, maxLine, cindentOptionsFor(state));
  const changed = formatted.some((line, i) => line !== state.lines[i]);
  const newLines = changed ? formatted : state.lines;
  // Vim op_reindent: 들여쓰기가 바뀌지 않아도 범위를 u_save 하므로 실행 취소 단위가 생기고,
  // 실행 취소 커서(uh_cursor)는 연산 범위 시작(oap->start)입니다.
  const stateWithUndo = pushUndoSnapshotAt(state, opStart, { start: minLine, end: maxLine });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: equalOperatorCursor(state, newLines, minLine, keepCol),
    pendingKeys: undefined,
  };
}

/**
 * ==: 현재 줄(및 count개 줄) 들여쓰기 자동 정렬
 */
export function formatIndentLines(
  state: VimEditorState,
  count = 1
): VimEditorState {
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);
  // Vim nv_lineop: count 가 1 이면 커서를 첫 비공백으로 옮긴 뒤 범위를 정하므로 연산 시작 열은 둘 중 앞쪽입니다.
  const firstNonBlank = getFirstNonBlankCol(state.lines[startLine] ?? '');
  const startCol = endLine === startLine ? Math.min(state.cursor.col, firstNonBlank) : state.cursor.col;
  return formatIndentRange(state, startLine, endLine, undefined, { line: startLine, col: startCol });
}

/**
 * VISUAL 모드 =: 선택 영역 들여쓰기 자동 정렬
 */
export function formatIndentVisual(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
  const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
  const opStart = state.mode === 'VISUAL_BLOCK'
    ? { line: minLine, col: Math.min(state.visualAnchor.col, state.cursor.col) }
    : visualOperatorStart(state.mode === 'VISUAL_LINE', state.visualAnchor, state.cursor);
  const res = formatIndentRange(state, minLine, maxLine, undefined, opStart);

  return {
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
  };
}
