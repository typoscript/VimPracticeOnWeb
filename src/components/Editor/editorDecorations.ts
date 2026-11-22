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
