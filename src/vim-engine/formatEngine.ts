import { VimEditorState } from './types';
import { msg } from './messages';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { recordChangePosition } from './advancedMotions';
import { executeSetCommand, getOptions } from './setEngine';

/**
 * 순정 Vim 텍스트 포매팅 엔진: gq{motion} / gw{motion} / gqq / Visual gq, :retab.
 * Neovim 기본값(autoindent, formatoptions=tcqj, comments=`://,b:#,:%,n:>,fb:-`)을 기준으로
 * 문단을 다시 채웁니다. 순수 함수이며 입력 상태를 변경하지 않습니다.
 */

/** textwidth=0 일 때 gq 가 쓰는 기본 폭 (Vim: 화면 폭 - 1, 최대 79) */
export const DEFAULT_FORMAT_WIDTH = 79;

export interface FormatOptions {
  textwidth: number;
  tabstop: number;
  expandtab: boolean;
}

export interface FormatCursor {
  line: number;
  col: number;
}

export interface FormatResult {
  /** 포매팅 적용 후의 전체 줄 배열 */
  lines: string[];
  /** 포매팅된 범위의 마지막 줄 (새 배열 기준) */
  endLine: number;
  /** 추적 요청한 커서가 옮겨진 위치 (gw 용) */
  cursor?: FormatCursor;
  /** 실제로 줄 내용이 바뀌었는지 */
  changed: boolean;
}

type LeaderKind = 'comment' | 'list';

interface ParsedLine {
  indent: string;
  leader: string | null;
  kind: LeaderKind | null;
  /** indent + leader + leader 뒤 공백 */
  prefix: string;
  rest: string;
  blank: boolean;
}

function isWs(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t';
}

/** 문자열의 화면 너비 (탭은 tabstop 배수로 확장) */
export function displayWidth(text: string, tabstop: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === '\t') w += tabstop - (w % tabstop);
    else w += 1;
  }
  return w;
}

function parseFormatLine(line: string): ParsedLine {
  const indentMatch = line.match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const body = line.slice(indent.length);

  let leader: string | null = null;
  let kind: LeaderKind | null = null;
  if (body.startsWith('//')) {
    leader = '//';
    kind = 'comment';
  } else if (/^[#%>](?=[ \t]|$)/.test(body)) {
    leader = body[0];
    kind = 'comment';
  } else if (/^-(?=[ \t]|$)/.test(body)) {
    leader = '-';
    kind = 'list';
  }

  if (leader === null) {
    return { indent, leader, kind, prefix: indent, rest: body, blank: body.trim() === '' };
  }
  const afterLeader = body.slice(leader.length);
  const wsMatch = afterLeader.match(/^[ \t]*/);
  const ws = wsMatch ? wsMatch[0] : '';
  const rest = afterLeader.slice(ws.length);
  return {
    indent,
    leader,
    kind,
    prefix: indent + leader + ws,
    rest,
    blank: rest.trim() === '',
  };
}

function normalizeIndent(prefix: string, opts: FormatOptions): string {
  if (!opts.expandtab || !prefix.includes('\t')) return prefix;
  let out = '';
  let w = 0;
  for (const ch of prefix) {
    if (ch === '\t') {
      const n = opts.tabstop - (w % opts.tabstop);
      out += ' '.repeat(n);
      w += n;
    } else {
      out += ch;
      w += 1;
    }
  }
  return out;
}

interface Paragraph {
  start: number;
  end: number;
  first: ParsedLine;
}

/**
 * 한 문단(연속된 비어 있지 않은 같은 주석 리더의 줄들)을 textwidth 에 맞춰 다시 채웁니다.
 */
function reflowParagraph(
  lines: string[],
  para: Paragraph,
  opts: FormatOptions,
  track: FormatCursor | undefined
): { out: string[]; cursor?: FormatCursor } {
  const width = opts.textwidth > 0 ? opts.textwidth : DEFAULT_FORMAT_WIDTH;
  const first = para.first;

  // 1. 줄 합치기 (J 와 같은 규칙: 다음 줄의 앞 공백 제거, 뒤 공백이 없으면 공백 1개 삽입)
  let joined = '';
  const lineStart: number[] = [];
  const restStartCol: number[] = [];
  for (let i = para.start; i <= para.end; i++) {
    const p = parseFormatLine(lines[i]);
    const text = i === para.start ? p.rest : p.rest.replace(/^[ \t]+/, '');
    restStartCol.push(p.prefix.length + (p.rest.length - text.length));
    if (i === para.start) {
      joined = text;
      lineStart.push(0);
    } else {
      if (joined.length > 0 && !isWs(joined[joined.length - 1])) joined += ' ';
      lineStart.push(joined.length);
      joined += text;
    }
  }

  let cursorOffset: number | undefined;
  if (track && track.line >= para.start && track.line <= para.end) {
    const idx = track.line - para.start;
    cursorOffset = lineStart[idx] + Math.max(0, track.col - restStartCol[idx]);
  }

  // 2. 접두어 결정: 첫 줄은 원본 접두어, 이어지는 줄은 리더(주석)면 그대로, 목록이면 공백으로 정렬
  const firstPrefix = normalizeIndent(first.prefix, opts);
  const contPrefix =
    first.kind === 'list'
      ? normalizeIndent(first.indent, opts) + ' '.repeat(first.prefix.length - first.indent.length)
      : firstPrefix;

  // 3. 폭에 맞춰 끊기
  const segments: Array<[number, number]> = [];
  let pos = 0;
  let isFirst = true;
  while (pos < joined.length) {
    const prefixW = displayWidth(isFirst ? firstPrefix : contPrefix, opts.tabstop);
    const avail = width - prefixW;
    if (joined.length - pos <= avail) {
      segments.push([pos, joined.length]);
      break;
    }
    let brk = -1;
    for (let i = Math.min(joined.length - 1, pos + avail); i > pos; i--) {
      if (isWs(joined[i])) {
        brk = i;
        break;
      }
    }
    if (brk === -1) {
      for (let i = pos + avail + 1; i < joined.length; i++) {
        if (isWs(joined[i])) {
          brk = i;
          break;
        }
      }
    }
    if (brk === -1) {
      segments.push([pos, joined.length]);
      break;
    }
    let s = brk;
    while (s > pos && isWs(joined[s - 1])) s--;
    let b = brk;
    while (b < joined.length && isWs(joined[b])) b++;
    if (b >= joined.length) {
      segments.push([pos, joined.length]);
      break;
    }
    segments.push([pos, s]);
    pos = b;
    isFirst = false;
  }
  if (segments.length === 0) segments.push([0, 0]);

  const out = segments.map(([s, e], i) => (i === 0 ? firstPrefix : contPrefix) + joined.slice(s, e));

  let cursor: FormatCursor | undefined;
  if (cursorOffset !== undefined) {
    let segIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i][0] <= cursorOffset) segIdx = i;
    }
    const [s, e] = segments[segIdx];
    const prefixLen = (segIdx === 0 ? firstPrefix : contPrefix).length;
    cursor = { line: segIdx, col: prefixLen + Math.min(cursorOffset - s, e - s) };
  }
  return { out, cursor };
}

/**
 * startLine ~ endLine (0-indexed, 양끝 포함)을 textwidth 에 맞게 다시 채웁니다 (gq / gw).
 * 빈 줄(공백만, 리더만 있는 줄)은 문단 경계로 그대로 둡니다.
 */
export function formatLineRange(
  lines: string[],
  rawStart: number,
  rawEnd: number,
  opts: FormatOptions,
  trackCursor?: FormatCursor
): FormatResult {
  const start = Math.max(0, Math.min(rawStart, rawEnd));
  const end = Math.min(lines.length - 1, Math.max(rawStart, rawEnd));

  const result: string[] = [];
  let mappedCursor: FormatCursor | undefined;

  let i = start;
  while (i <= end) {
    const parsed = parseFormatLine(lines[i]);
    if (parsed.blank) {
      if (trackCursor && trackCursor.line === i) {
        mappedCursor = { line: start + result.length, col: trackCursor.col };
      }
      result.push(lines[i]);
      i++;
      continue;
    }
    // 문단 끝 찾기
    let j = i;
    while (j + 1 <= end) {
      const next = parseFormatLine(lines[j + 1]);
      if (next.blank) break;
      if (next.kind === 'list') break;
      const sameLeader = next.leader === parsed.leader;
      const listContinuation = parsed.kind === 'list' && next.leader === null;
      if (!sameLeader && !listContinuation) break;
      j++;
    }
    const r = reflowParagraph(lines, { start: i, end: j, first: parsed }, opts, trackCursor);
    if (r.cursor) {
      mappedCursor = { line: start + result.length + r.cursor.line, col: r.cursor.col };
    }
    result.push(...r.out);
    i = j + 1;
  }

  const nextLines = [...lines.slice(0, start), ...result, ...lines.slice(end + 1)];
  const delta = result.length - (end - start + 1);
  if (trackCursor && !mappedCursor) {
    mappedCursor =
      trackCursor.line > end
        ? { line: trackCursor.line + delta, col: trackCursor.col }
        : { ...trackCursor };
  }
  const changed =
    result.length !== end - start + 1 || result.some((l, idx) => l !== lines[start + idx]);
  return {
    lines: nextLines,
    endLine: start + result.length - 1,
    cursor: mappedCursor,
    changed,
  };
}

/** 현재 상태의 옵션에서 포매팅 설정을 읽습니다. */
export function getFormatOptions(state: VimEditorState): FormatOptions {
  const o = getOptions(state);
  return {
    textwidth: o.textwidth ?? 0,
    tabstop: o.tabstop,
    expandtab: o.expandtab,
  };
}

function firstNonBlankCol(line: string): number {
  const m = line.match(/^[ \t]*/);
  return Math.min(m ? m[0].length : 0, Math.max(0, line.length - 1));
}

/**
 * gq / gw 실행. keepCursor 가 true 면(gw) 커서를 같은 글자 위에 유지하고,
 * false 면(gq) 포매팅된 마지막 줄의 첫 비공백 문자로 이동합니다.
 */
export function formatRange(
  state: VimEditorState,
  startLine: number,
  endLine: number,
  keepCursor: boolean
): VimEditorState {
  const opts = getFormatOptions(state);
  const res = formatLineRange(
    state.lines,
    startLine,
    endLine,
    opts,
    keepCursor ? state.cursor : undefined
  );

  const base: VimEditorState = {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };

  let cursorTarget: FormatCursor;
  if (keepCursor) {
    cursorTarget = res.cursor ?? state.cursor;
  } else {
    const line = Math.max(0, Math.min(res.endLine, res.lines.length - 1));
    cursorTarget = { line, col: firstNonBlankCol(res.lines[line] ?? '') };
  }

  if (!res.changed) {
    return { ...base, cursor: clampCursor(state.lines, cursorTarget, 'NORMAL') };
  }

  const snapshotBase = state.mode.startsWith('VISUAL')
    ? { ...state, cursor: clampCursor(state.lines, { line: Math.min(startLine, endLine), col: 0 }, 'NORMAL') }
    : state;
  const withUndo = pushUndoSnapshot(snapshotBase);
  const nextCursor = clampCursor(res.lines, cursorTarget, 'NORMAL');
  const changeRecord = recordChangePosition(withUndo.changeList, nextCursor);
  return {
    ...withUndo,
    ...base,
    lines: res.lines,
    cursor: nextCursor,
    changeList: changeRecord.changeList,
    changeIndex: changeRecord.changeIndex,
  };
}

/** 한 줄의 공백 구간을 새 탭 설정에 맞게 변환합니다 (:retab). */
export function retabLine(
  line: string,
  oldTabstop: number,
  newTabstop: number,
  expandtab: boolean,
  bang: boolean
): string {
  let out = '';
  let vcol = 0;
  let startVcol = 0;
  let numSpaces = 0;
  let gotTab = false;
  let wsRaw = '';

  const flush = () => {
    if (wsRaw === '') return;
    if (gotTab || (bang && numSpaces > 1)) {
      let spaces = vcol - startVcol;
      let tabs = 0;
      if (!expandtab) {
        const temp = newTabstop - (startVcol % newTabstop);
        if (spaces >= temp) {
          spaces -= temp;
          tabs++;
        }
        const more = Math.floor(spaces / newTabstop);
        tabs += more;
        spaces -= more * newTabstop;
      }
      out += '\t'.repeat(tabs) + ' '.repeat(spaces);
    } else {
      out += wsRaw;
    }
    wsRaw = '';
    numSpaces = 0;
    gotTab = false;
  };

  for (const ch of line) {
    if (ch === ' ' || ch === '\t') {
      if (wsRaw === '') startVcol = vcol;
      wsRaw += ch;
      if (ch === ' ') {
        numSpaces++;
        vcol++;
      } else {
        gotTab = true;
        vcol += oldTabstop - (vcol % oldTabstop);
      }
    } else {
      flush();
      out += ch;
      vcol++;
    }
  }
  flush();
  return out;
}

/**
 * :[range]ret[ab][!] [N] — 탭/공백 일괄 변환. 범위를 생략하면 전체 파일입니다.
 * N 을 주면 변환 후 'tabstop' 이 N 으로 바뀝니다.
 */
export function retabRange(
  state: VimEditorState,
  startLine: number,
  endLine: number,
  bang: boolean,
  newTabstopArg?: number
): VimEditorState {
  const opts = getOptions(state);
  const newTs = newTabstopArg ?? opts.tabstop;
  if (newTabstopArg !== undefined && newTabstopArg < 1) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E487: 인수는 양수여야 합니다: {arg}', { arg: String(newTabstopArg) }),
    };
  }
  const start = Math.max(0, Math.min(startLine, endLine));
  const end = Math.min(state.lines.length - 1, Math.max(startLine, endLine));

  const newLines = [...state.lines];
  let changed = false;
  for (let i = start; i <= end; i++) {
    const next = retabLine(newLines[i], opts.tabstop, newTs, opts.expandtab, bang);
    if (next !== newLines[i]) {
      newLines[i] = next;
      changed = true;
    }
  }

  let next: VimEditorState = state;
  if (changed) {
    const withUndo = pushUndoSnapshot(state);
    next = {
      ...withUndo,
      lines: newLines,
      cursor: clampCursor(newLines, state.cursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }
  if (newTs !== opts.tabstop) {
    next = { ...executeSetCommand(next, `ts=${newTs}`), commandMessage: undefined };
  }
  return next;
}
