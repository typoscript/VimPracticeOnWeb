import type { CursorPosition, VimMode } from '../../vim-engine';

export type TodoBadgeVariant = 'info' | 'error' | 'warning' | 'hint' | 'perf';

export interface TodoCommentBadge {
  tag: string;
  startCol: number;
  endCol: number;
  variant: TodoBadgeVariant;
}

export interface ActiveScopeIndent {
  startLine: number;
  endLine: number;
  col: number;
}

function measureLeadingIndentWidth(line: string, tabstop: number): number {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') {
      width += 1;
    } else if (ch === '\t') {
      width += tabstop - (width % tabstop);
    } else {
      break;
    }
  }
  return width;
}

function getEffectiveLineIndent(lines: string[], lineIdx: number, tabstop: number): number {
  const line = lines[lineIdx] ?? '';
  if (line.trim().length > 0) {
    return measureLeadingIndentWidth(line, tabstop);
  }
  // 빈 줄은 위·아래 가장 가까운 비공백 줄 중 작은 들여쓰기를 이어받아 세로선이 끊기지 않게 유지
  let prevIndent = 0;
  for (let i = lineIdx - 1; i >= 0; i--) {
    if ((lines[i] ?? '').trim().length > 0) {
      prevIndent = measureLeadingIndentWidth(lines[i], tabstop);
      break;
    }
  }
  let nextIndent = 0;
  for (let i = lineIdx + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim().length > 0) {
      nextIndent = measureLeadingIndentWidth(lines[i], tabstop);
      break;
    }
  }
  return Math.min(prevIndent, nextIndent);
}

/**
 * indent-blankline.nvim: 특정 줄에 표시할 세로 들여쓰기 가이드선 열 목록(0-based ch)을 계산합니다.
 */
export function computeIndentGuideCols(
  lines: string[],
  lineIdx: number,
  indentUnit: number,
  tabstop = 2
): number[] {
  const unit = Math.max(1, indentUnit);
  const effectiveIndent = getEffectiveLineIndent(lines, lineIdx, Math.max(1, tabstop));
  if (effectiveIndent < unit) return [];
  const cols: number[] = [];
  for (let col = 0; col < effectiveIndent; col += unit) {
    cols.push(col);
  }
  return cols;
}

/**
 * indent-blankline.nvim v3 scope: 현재 커서가 속한 활성 들여쓰기 스코프 범위와 가이드 열을 계산합니다.
 */
export function computeActiveScopeIndent(
  lines: string[],
  cursorLine: number,
  indentUnit: number,
  tabstop = 2
): ActiveScopeIndent | null {
  const unit = Math.max(1, indentUnit);
  const ts = Math.max(1, tabstop);
  const curIndent = getEffectiveLineIndent(lines, cursorLine, ts);
  if (curIndent < unit) return null;

  const level = Math.floor(curIndent / unit);
  const targetIndent = level * unit;
  const col = (level - 1) * unit;

  let startLine = cursorLine;
  while (startLine > 0 && getEffectiveLineIndent(lines, startLine - 1, ts) >= targetIndent) {
    startLine -= 1;
  }
  let endLine = cursorLine;
  while (
    endLine < lines.length - 1 &&
    getEffectiveLineIndent(lines, endLine + 1, ts) >= targetIndent
  ) {
    endLine += 1;
  }

  return { startLine, endLine, col };
}

const COMMENT_PREFIX_RE = /(?:\/\/|\/\*|--|#|\*)\s*/;
const TODO_TAG_RE = /\b(TODO|FIXME|BUG|HACK|WARN|WARNING|NOTE|PERF)\b(?:\([^)]*\))?:/;

/**
 * todo-comments.nvim: 주석 줄 안의 TODO:/FIXME:/HACK:/WARN:/NOTE:/BUG:/PERF: 태그 위치를 찾습니다.
 */
export function findTodoCommentBadge(lineText: string): TodoCommentBadge | null {
  const commentMatch = COMMENT_PREFIX_RE.exec(lineText);
  if (!commentMatch) return null;

  const afterCommentIdx = commentMatch.index + commentMatch[0].length;
  const slice = lineText.slice(afterCommentIdx);
  const tagMatch = TODO_TAG_RE.exec(slice);
  if (!tagMatch || tagMatch.index === undefined) return null;

  const keyword = tagMatch[1];
  const variant: TodoBadgeVariant =
    keyword === 'FIXME' || keyword === 'BUG'
      ? 'error'
      : keyword === 'HACK' || keyword === 'WARN' || keyword === 'WARNING'
        ? 'warning'
        : keyword === 'NOTE'
          ? 'hint'
          : keyword === 'PERF'
            ? 'perf'
            : 'info';

  const startCol = afterCommentIdx + tagMatch.index;
  const endCol = startCol + tagMatch[0].length;
  return {
    tag: tagMatch[0],
    startCol,
    endCol,
    variant,
  };
}

export interface MatchParenPair {
  open: CursorPosition;
  close: CursorPosition;
}

function parseMatchPairsSpec(raw?: string): {
  openSet: Set<string>;
  allSet: Set<string>;
  partnerMap: Record<string, string>;
} {
  const effective = raw && raw.trim() ? raw : '(:),{:},[:]';
  const openSet = new Set<string>();
  const allSet = new Set<string>();
  const partnerMap: Record<string, string> = {};
  for (const token of effective.split(',')) {
    const t = token.trim();
    if (t.length === 3 && t[1] === ':' && t[0] !== t[2]) {
      openSet.add(t[0]);
      allSet.add(t[0]);
      allSet.add(t[2]);
      partnerMap[t[0]] = t[2];
      partnerMap[t[2]] = t[0];
    }
  }
  return { openSet, allSet, partnerMap };
}

/**
 * 순정 Vim matchparen: 현재 커서(INSERT 모드에서는 직전 문자 포함)가 괄호 위일 때
 * 멀티라인을 포함한 대응 짝 괄호 위치를 계산합니다.
 */
export function computeMatchParenPair(
  lines: string[],
  cursor: CursorPosition,
  mode: VimMode,
  matchpairs?: string
): MatchParenPair | null {
  if (lines.length === 0 || cursor.line < 0 || cursor.line >= lines.length) return null;

  const { openSet, allSet, partnerMap } = parseMatchPairsSpec(matchpairs);
  const currentLine = lines[cursor.line] ?? '';
  let col = cursor.col;
  let ch = currentLine[col];

  if ((!ch || !allSet.has(ch)) && mode === 'INSERT' && col > 0) {
    const prevCh = currentLine[col - 1];
    if (prevCh && allSet.has(prevCh)) {
      col = col - 1;
      ch = prevCh;
    }
  }

  if (!ch || !allSet.has(ch)) return null;

  const isOpening = openSet.has(ch);
  const partner = partnerMap[ch];
  const origin: CursorPosition = { line: cursor.line, col };

  if (isOpening) {
    let depth = 1;
    for (let l = cursor.line; l < lines.length; l++) {
      const text = lines[l] ?? '';
      const startC = l === cursor.line ? col + 1 : 0;
      for (let c = startC; c < text.length; c++) {
        if (text[c] === ch) depth++;
        else if (text[c] === partner) {
          depth--;
          if (depth === 0) {
            return { open: origin, close: { line: l, col: c } };
          }
        }
      }
    }
    return null;
  }

  // 닫는 괄호 → 역방향 탐색
  let depth = 1;
  for (let l = cursor.line; l >= 0; l--) {
    const text = lines[l] ?? '';
    const startC = l === cursor.line ? col - 1 : text.length - 1;
    for (let c = startC; c >= 0; c--) {
      if (text[c] === ch) depth++;
      else if (text[c] === partner) {
        depth--;
        if (depth === 0) {
          return { open: { line: l, col: c }, close: origin };
        }
      }
    }
  }
  return null;
}

const RAINBOW_OPEN_TO_CLOSE: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
};
const RAINBOW_CLOSERS = new Set([')', ']', '}']);

/**
 * rainbow-delimiters.nvim: 버퍼 전체의 중첩 괄호((), [], {}) 깊이를 0..5 순환 색상 인덱스로 계산합니다.
 * 문자열 리터럴("", '', ``) 및 줄 주석(//) 내부 괄호는 무시합니다.
 */
export function computeRainbowDelimitersMap(
  lines: string[]
): Map<number, Map<number, number>> {
  const result = new Map<number, Map<number, number>>();
  const stack: Array<{ expectedClose: string; depth: number }> = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const text = lines[lineIdx] ?? '';
    let quote: '"' | "'" | '`' | null = null;
    let lineMap: Map<number, number> | null = null;

    for (let col = 0; col < text.length; col++) {
      const ch = text[col];

      if (quote) {
        if (ch === '\\' && col + 1 < text.length) {
          col++;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }

      if (ch === '/' && text[col + 1] === '/') {
        break;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }

      const expectedClose = RAINBOW_OPEN_TO_CLOSE[ch];
      if (expectedClose) {
        const depth = stack.length % 6;
        stack.push({ expectedClose, depth });
        if (!lineMap) {
          lineMap = new Map<number, number>();
          result.set(lineIdx, lineMap);
        }
        lineMap.set(col, depth);
      } else if (RAINBOW_CLOSERS.has(ch)) {
        // 가장 가까운 일치 여는 괄호까지 스택에서 pop
        let matchedDepth = Math.max(0, (stack.length - 1) % 6);
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].expectedClose === ch) {
            matchedDepth = stack[k].depth;
            stack.splice(k, stack.length - k);
            break;
          }
        }
        if (!lineMap) {
          lineMap = new Map<number, number>();
          result.set(lineIdx, lineMap);
        }
        lineMap.set(col, matchedDepth);
      }
    }
  }

  return result;
}

export type SatelliteMarkerKind =
  | 'cursor'
  | 'search'
  | 'diagnostic-error'
  | 'diagnostic-warning'
  | 'git-add'
  | 'git-change'
  | 'git-delete'
  | 'mark';

export interface SatelliteMarker {
  id: string;
  kind: SatelliteMarkerKind;
  line: number;
  topPercent: number;
  label: string;
}

export interface ComputeSatelliteMarkersInput {
  lineCount: number;
  cursorLine: number;
  searchMatchLines?: number[];
  diagnostics?: ReadonlyArray<{ line: number; severity: string; message: string }>;
  gitLineSigns?: Map<number, 'add' | 'change' | 'delete'>;
  marks?: Record<string, { row: number; col: number }>;
}

function lineToPercent(line: number, lineCount: number): number {
  if (lineCount <= 1) return 50;
  const clamped = Math.max(0, Math.min(lineCount - 1, line));
  return Number((((clamped + 0.5) / lineCount) * 100).toFixed(2));
}

/**
 * satellite.nvim: 에디터 우측 스크롤바 트랙에 표시할 미니맵 마커(커서, 검색 매치, LSP 진단, Git Hunk, 마크)를 계산합니다.
 */
export function computeSatelliteMarkers({
  lineCount,
  cursorLine,
  searchMatchLines,
  diagnostics,
  gitLineSigns,
  marks,
}: ComputeSatelliteMarkersInput): SatelliteMarker[] {
  if (lineCount <= 0) return [];
  const markers: SatelliteMarker[] = [];

  // 1) Git Hunk 마커
  if (gitLineSigns) {
    for (const [line, sign] of gitLineSigns.entries()) {
      if (line < 0 || line >= lineCount) continue;
      const kind: SatelliteMarkerKind =
        sign === 'add' ? 'git-add' : sign === 'delete' ? 'git-delete' : 'git-change';
      markers.push({
        id: `${kind}-${line}`,
        kind,
        line,
        topPercent: lineToPercent(line, lineCount),
        label: `L${line + 1} · Git ${sign}`,
      });
    }
  }

  // 2) 검색 매치 마커 (줄 단위 중복 제거)
  if (searchMatchLines && searchMatchLines.length > 0) {
    const uniqueSearchLines = Array.from(new Set(searchMatchLines));
    for (const line of uniqueSearchLines) {
      if (line < 0 || line >= lineCount) continue;
      markers.push({
        id: `search-${line}`,
        kind: 'search',
        line,
        topPercent: lineToPercent(line, lineCount),
        label: `L${line + 1} · Search match`,
      });
    }
  }

  // 3) 사용자 마크 마커 (a-zA-Z)
  if (marks) {
    const seenMarkLines = new Set<number>();
    for (const [name, pos] of Object.entries(marks)) {
      if (!/^[a-zA-Z]$/.test(name)) continue;
      if (pos.row < 0 || pos.row >= lineCount || seenMarkLines.has(pos.row)) continue;
      seenMarkLines.add(pos.row);
      markers.push({
        id: `mark-${pos.row}`,
        kind: 'mark',
        line: pos.row,
        topPercent: lineToPercent(pos.row, lineCount),
        label: `L${pos.row + 1} · Mark '${name}`,
      });
    }
  }

  // 4) LSP 진단 마커 (줄당 가장 높은 심각도 1개)
  if (diagnostics && diagnostics.length > 0) {
    const lineSeverity = new Map<number, { kind: 'diagnostic-error' | 'diagnostic-warning'; msg: string }>();
    for (const d of diagnostics) {
      if (d.line < 0 || d.line >= lineCount) continue;
      const isErr = d.severity === 'error';
      const existing = lineSeverity.get(d.line);
      if (!existing || (isErr && existing.kind !== 'diagnostic-error')) {
        lineSeverity.set(d.line, {
          kind: isErr ? 'diagnostic-error' : 'diagnostic-warning',
          msg: d.message,
        });
      }
    }
    for (const [line, info] of lineSeverity.entries()) {
      markers.push({
        id: `${info.kind}-${line}`,
        kind: info.kind,
        line,
        topPercent: lineToPercent(line, lineCount),
        label: `L${line + 1} · ${info.msg}`,
      });
    }
  }

  // 5) 현재 커서 위치 마커
  const safeCursorLine = Math.max(0, Math.min(lineCount - 1, cursorLine));
  markers.push({
    id: `cursor-${safeCursorLine}`,
    kind: 'cursor',
    line: safeCursorLine,
    topPercent: lineToPercent(safeCursorLine, lineCount),
    label: `L${safeCursorLine + 1} · Cursor`,
  });

  return markers;
}

/**
 * bufferline.nvim: 파일 확장자에 따른 아이콘/약어 배지를 반환합니다.
 */
export function getBufferFiletypeBadge(filename: string): { label: string; cls: string } {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return { label: 'TS', cls: 'ft-ts' };
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) {
    return { label: 'JS', cls: 'ft-js' };
  }
  if (lower.endsWith('.lua')) return { label: 'LUA', cls: 'ft-lua' };
  if (lower.endsWith('.json')) return { label: '{}', cls: 'ft-json' };
  if (lower.endsWith('.md')) return { label: 'MD', cls: 'ft-md' };
  if (lower.endsWith('.css')) return { label: 'CSS', cls: 'ft-css' };
  if (lower.endsWith('.py')) return { label: 'PY', cls: 'ft-py' };
  return { label: '≡', cls: 'ft-default' };
}
