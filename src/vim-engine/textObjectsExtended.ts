import { CursorPosition, VimEditorState } from './types';
import { clampCursor, getFirstNonBlankCol } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setOptionsCore';
import { beginlineSolCol, pushUndoSnapshotAt } from './undoHistory';
import { formatLinesRange, cindentOptionsFor, equalOperatorCursor, changeCaseVisual, caseTypeForOperator } from './lineOperators';

export interface TextObjectRange {
  startCol: number;
  endCol: number;
  startLine?: number;
  endLine?: number;
  isEmpty?: boolean;
  /** i{ 처럼 여는 괄호가 줄 끝, 닫는 괄호가 줄 처음(들여쓰기 뒤)에 있으면 사이 줄 전체를 줄 단위로 다룸 */
  linewise?: boolean;
  /** :help exclusive-linewise 로 줄 단위가 됨 (d 뒤 커서는 첫 비공백) */
  endAdjusted?: boolean;
}

/** 인덴트 텍스트 객체 타입: ii(안쪽), ai(+위 헤더 줄), iI(=ii), aI(+위·아래 경계 줄) */
export type IndentObjectType = 'ii' | 'ai' | 'iI' | 'aI';

export interface IndentObjectRange {
  startLine: number;
  endLine: number;
}

function isBlankLine(text: string | undefined): boolean {
  return !text || text.trim().length === 0;
}

/** 줄 앞 공백의 화면 너비 (탭은 다음 tabstop 위치까지 확장) */
function getIndentWidth(text: string, tabstop: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width++;
    else if (ch === '\t') width += tabstop - (width % tabstop);
    else break;
  }
  return width;
}

/** from 에서 step 방향으로 빈 줄을 건너뛴 첫 비어 있지 않은 줄 번호 (없으면 -1) */
function findNonBlankLine(lines: string[], from: number, step: 1 | -1): number {
  for (let l = from; l >= 0 && l < lines.length; l += step) {
    if (!isBlankLine(lines[l])) return l;
  }
  return -1;
}

/**
 * 인덴트 텍스트 객체 범위를 구합니다. (vim-indent-object 동작 기준, 항상 줄 단위)
 * - ii / iI: 기준 줄과 들여쓰기가 같거나 더 깊은 연속 줄 (중간 빈 줄 포함, 앞뒤 빈 줄 제외)
 * - ai: ii + 바로 위의 덜 들여쓴 헤더 줄 (예: `def foo():`)
 * - aI: ai + 바로 아래의 덜 들여쓴 경계 줄 (예: 닫는 `}` / `end`)
 * - [count]: 한 단계씩 바깥 들여쓰기 블록으로 확장합니다.
 * 기준 줄이 빈 줄이면 아래(없으면 위)의 가장 가까운 비어 있지 않은 줄을 기준으로 합니다.
 */
export function getIndentObjectRange(
  lines: string[],
  line: number,
  objectType: IndentObjectType,
  count = 1,
  tabstop = 8
): IndentObjectRange | null {
  if (lines.length === 0) return null;

  let pivot = isBlankLine(lines[line]) ? findNonBlankLine(lines, line, 1) : line;
  if (pivot === -1) pivot = findNonBlankLine(lines, line, -1);
  if (pivot === -1) return null;

  const width = (l: number) => getIndentWidth(lines[l] ?? '', tabstop);
  const belongs = (l: number, indent: number) => isBlankLine(lines[l]) || width(l) >= indent;

  let indent = width(pivot);
  let start = pivot;
  let end = pivot;

  for (let level = 0; level < Math.max(1, count); level++) {
    if (level > 0) {
      const header = findNonBlankLine(lines, start - 1, -1);
      if (header === -1) break;
      indent = width(header);
      start = header;
      end = Math.max(end, header);
    }
    while (start > 0 && belongs(start - 1, indent)) start--;
    while (end < lines.length - 1 && belongs(end + 1, indent)) end++;
    while (start < end && isBlankLine(lines[start])) start++;
    while (end > start && isBlankLine(lines[end])) end--;
  }

  if (objectType === 'ai' || objectType === 'aI') {
    const header = findNonBlankLine(lines, start - 1, -1);
    if (header !== -1) start = header;
  }
  if (objectType === 'aI') {
    const footer = findNonBlankLine(lines, end + 1, 1);
    if (footer !== -1) end = footer;
  }

  return { startLine: start, endLine: end };
}

/**
 * 인덴트 텍스트 객체와 연산자(d, c, y, v, =, gu, gU, g~)를 줄 단위로 실행합니다.
 */
export function executeIndentObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?',
  objectType: IndentObjectType,
  count = 1
): VimEditorState {
  const range = getIndentObjectRange(
    state.lines,
    state.cursor.line,
    objectType,
    count,
    state.options?.tabstop ?? 8
  );
  if (!range) {
    return { ...state, pendingKeys: undefined };
  }
  return executeLinewiseObjectOperator(state, operator, range, false, true);
}

/**
 * 줄 단위 텍스트 객체(ii, ai, ip, ap) 범위에 연산자(d, c, y, v, =, gu, gU, g~)를 적용합니다.
 */
export function executeLinewiseObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?',
  range: IndentObjectRange,
  /** :help exclusive-linewise 로 줄 단위가 된 범위 (Vim end_adjusted: d 뒤 커서가 첫 비공백) */
  endAdjusted = false,
  /** 플러그인 객체(ii · if/af 등)는 c 뒤 들여쓰기를 남깁니다 ('autoindent' 와 무관) */
  keepIndent = false
): VimEditorState {
  const { startLine, endLine } = range;
  const content = state.lines.slice(startLine, endLine + 1).join('\n');

  if (operator === 'v') {
    return {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: startLine, col: 0 },
      cursor: clampCursor(state.lines, { line: endLine, col: state.cursor.col }, 'VISUAL_LINE'),
      pendingKeys: undefined,
    };
  }

  if (operator === 'gu' || operator === 'gU' || operator === 'g~' || operator === 'g?') {
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: startLine, col: 0 },
      cursor: { line: endLine, col: 0 },
    };
    const caseType = caseTypeForOperator(operator);
    return changeCaseVisual(visualState, caseType);
  }

  if (operator === '=') {
    // 줄 단위 객체의 연산 시작(oap->start)은 첫 줄 0열입니다 (실행 취소 커서).
    const stateWithSnapshot = pushUndoSnapshotAt(state, { line: startLine, col: 0 }, { start: startLine, end: endLine });
    const nextLines = formatLinesRange(state.lines, startLine, endLine, cindentOptionsFor(state));
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: equalOperatorCursor(state, nextLines, startLine),
      pendingKeys: undefined,
    };
  }

  const clipboard = { type: 'line' as const, content };

  if (operator === 'y') {
    return {
      ...state,
      cursor: { line: startLine, col: 0 },
      clipboard,
      lastBracketMarks: {
        start: { row: startLine, col: 0 },
        end: { row: endLine, col: Math.max(0, (state.lines[endLine] ?? '').length - 1) },
      },
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const before = state.lines.slice(0, startLine);
  const after = state.lines.slice(endLine + 1);

  if (operator === 'c') {
    // Vim op_change: 줄 단위 c 는 'autoindent' 일 때만 들여쓰기를 남깁니다.
    const indentStr = keepIndent || getOptions(state).autoindent ? (state.lines[startLine] ?? '').match(/^[ \t]*/)?.[0] ?? '' : '';
    return {
      ...stateWithSnapshot,
      lines: [...before, indentStr, ...after],
      cursor: { line: startLine, col: indentStr.length },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  const nextLines = before.length + after.length === 0 ? [''] : [...before, ...after];
  // Vim op_delete 는 beginline(BL_WHITE) 뒤 do_pending_operator 가 'nostartofline' 이면 원래 curswant 열로 돌아갑니다.
  const cursorLine = Math.min(startLine, nextLines.length - 1);
  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: {
      line: cursorLine,
      col: endAdjusted || keepIndent ? getFirstNonBlankCol(nextLines[cursorLine] ?? '') : beginlineSolCol(state, nextLines[cursorLine] ?? ''),
    },
    clipboard,
    pendingKeys: undefined,
  };
}

// ---------------------------------------------------------------------------
// 문단 텍스트 객체 (ip, ap) — Vim current_par() 규칙
// ---------------------------------------------------------------------------

export type ParagraphObjectType = 'ip' | 'ap';

function isWhiteLine(text: string | undefined): boolean {
  return (text ?? '').trim().length === 0;
}

/**
 * 문단 텍스트 객체 범위 (항상 줄 단위)
 */
export function getParagraphObjectRange(
  lines: string[],
  line: number,
  objectType: ParagraphObjectType,
  count = 1
): IndentObjectRange | null {
  if (lines.length === 0) return null;
  const include = objectType === 'ap';
  const last = lines.length - 1;

  let start = Math.max(0, Math.min(line, last));
  const whiteInFront = isWhiteLine(lines[start]);
  while (start > 0 && isWhiteLine(lines[start - 1]) === whiteInFront) start--;

  let end = start;
  while (end <= last && isWhiteLine(lines[end])) end++;
  end--;

  let remaining = Math.max(1, count);
  if (!include && whiteInFront) remaining--;
  while (remaining-- > 0) {
    if (end === last) return null;
    const doWhite = !include && isWhiteLine(lines[end + 1]);
    if (include || !doWhite) {
      end++;
      while (end < last && !isWhiteLine(lines[end + 1])) end++;
    }
    if (remaining === 0 && whiteInFront && include) break;
    if (include || doWhite) {
      while (end < last && isWhiteLine(lines[end + 1])) end++;
    }
  }

  if (include && !whiteInFront && !isWhiteLine(lines[end])) {
    while (start > 0 && isWhiteLine(lines[start - 1])) start--;
  }

  return { startLine: start, endLine: end };
}

/** 문단 텍스트 객체와 연산자를 줄 단위로 실행합니다. (dap, yip, cip, vap, =ip, gUap ...) */
export function executeParagraphObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?',
  objectType: ParagraphObjectType,
  count = 1
): VimEditorState | null {
  const range = getParagraphObjectRange(state.lines, state.cursor.line, objectType, count);
  return range ? executeLinewiseObjectOperator(state, operator, range) : null;
}

// ---------------------------------------------------------------------------
// 문장 텍스트 객체 (is, as)
// ---------------------------------------------------------------------------

interface FlatChar {
  ch: string;
  line: number;
  col: number;
}

interface Segment {
  kind: 'sentence' | 'white';
  start: number;
  end: number;
}

const SENTENCE_END = '.!?';
const SENTENCE_CLOSERS = ')]"\'';

function isWhiteChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function splitSentences(lines: string[], line: number): { chars: FlatChar[]; segments: Segment[] } | null {
  if (isWhiteLine(lines[line])) return null;
  let first = line;
  while (first > 0 && !isWhiteLine(lines[first - 1])) first--;
  let lastLine = line;
  while (lastLine < lines.length - 1 && !isWhiteLine(lines[lastLine + 1])) lastLine++;

  const chars: FlatChar[] = [];
  for (let l = first; l <= lastLine; l++) {
    const text = lines[l] ?? '';
    for (let c = 0; c < text.length; c++) chars.push({ ch: text[c], line: l, col: c });
    if (l < lastLine) chars.push({ ch: '\n', line: l, col: text.length });
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < chars.length) {
    if (isWhiteChar(chars[i].ch)) {
      let j = i;
      while (j < chars.length && isWhiteChar(chars[j].ch)) j++;
      segments.push({ kind: 'white', start: i, end: j - 1 });
      i = j;
      continue;
    }
    let end = chars.length - 1;
    for (let k = i; k < chars.length; k++) {
      if (!SENTENCE_END.includes(chars[k].ch)) continue;
      let m = k + 1;
      while (m < chars.length && SENTENCE_CLOSERS.includes(chars[m].ch)) m++;
      if (m === chars.length || isWhiteChar(chars[m].ch)) {
        end = m - 1;
        break;
      }
    }
    segments.push({ kind: 'sentence', start: i, end });
    i = end + 1;
  }
  return { chars, segments };
}

function whiteOnLine(chars: FlatChar[], seg: Segment, line: number): { start: number; end: number } | null {
  let s = -1;
  let e = -1;
  for (let i = seg.start; i <= seg.end; i++) {
    if (chars[i].ch === '\n' || chars[i].line !== line) continue;
    if (s < 0) s = i;
    e = i;
  }
  return s < 0 ? null : { start: s, end: e };
}

/**
 * 문장 텍스트 객체 범위 (문자 단위, 끝 포함)
 */
export function getSentenceObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: 'is' | 'as',
  count = 1
): TextObjectRange | null {
  const split = splitSentences(lines, cursor.line);
  if (!split) return null;
  const { chars, segments } = split;
  const n = Math.max(1, count);

  const lineText = lines[cursor.line] ?? '';
  const col = Math.min(cursor.col, Math.max(0, lineText.length - 1));
  const flatIdx = chars.findIndex((c) => c.line === cursor.line && c.col === col);
  const k = segments.findIndex((seg) => flatIdx >= seg.start && flatIdx <= seg.end);
  if (k < 0) return null;

  let start: number;
  let end: number;

  if (objectType === 'is') {
    const lastSeg = segments[Math.min(segments.length - 1, k + n - 1)];
    start = segments[k].start;
    end = lastSeg.end;
    if (segments[k].kind === 'white') {
      const own = whiteOnLine(chars, segments[k], cursor.line);
      if (!own) return null;
      start = own.start;
      if (lastSeg === segments[k]) end = own.end;
    }
  } else if (segments[k].kind === 'sentence') {
    const lastIdx = Math.min(segments.length - 1, k + 2 * (n - 1));
    start = segments[k].start;
    end = segments[lastIdx].end;
    const trailing = segments[lastIdx + 1];
    const trailingOwn = trailing?.kind === 'white' ? whiteOnLine(chars, trailing, chars[end].line) : null;
    if (trailingOwn) {
      end = trailingOwn.end;
    } else {
      const leading = segments[k - 1];
      const leadingOwn = leading?.kind === 'white' ? whiteOnLine(chars, leading, chars[start].line) : null;
      if (leadingOwn) start = leadingOwn.start;
    }
  } else {
    const nextIdx = Math.min(segments.length - 1, k + 2 * n - 1);
    if (nextIdx === k) return null;
    const own = whiteOnLine(chars, segments[k], cursor.line) ?? { start: segments[k].start };
    start = own.start;
    end = segments[nextIdx].end;
  }

  while (start < end && chars[start].ch === '\n') start++;
  while (end > start && chars[end].ch === '\n') end--;

  return {
    startLine: chars[start].line,
    startCol: chars[start].col,
    endLine: chars[end].line,
    endCol: chars[end].col,
  };
}

/**
 * 버퍼 전체의 문장 시작 위치 목록 (`(` / `)` 모션용)
 */
export function getSentenceStarts(lines: string[]): CursorPosition[] {
  const starts: CursorPosition[] = [];
  let line = 0;
  while (line < lines.length) {
    if (isWhiteLine(lines[line])) {
      starts.push({ line, col: 0 });
      while (line < lines.length && isWhiteLine(lines[line])) line++;
      continue;
    }
    const split = splitSentences(lines, line);
    if (split) {
      for (const seg of split.segments) {
        if (seg.kind === 'sentence') {
          starts.push({ line: split.chars[seg.start].line, col: split.chars[seg.start].col });
        }
      }
    }
    while (line < lines.length && !isWhiteLine(lines[line])) line++;
  }
  return starts;
}
