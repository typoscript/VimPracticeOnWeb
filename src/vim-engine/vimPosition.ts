import { CursorPosition } from './types';

/**
 * Vim 의 위치 이동 헬퍼(misc2.c / memline.c 의 inc · dec · incl · decl · gchar_pos)를 버퍼 줄 배열 위에서 흉내 냅니다.
 * 줄 끝 다음 칸(col === 길이, Vim 의 NUL)도 위치로 다루며, 텍스트 객체·문장 모션을 Vim 과 같은 단계로 옮겨 쓸 때 씁니다.
 * 함수들은 넘겨받은 위치를 바꾸지 않고 [새 위치, 반환값] 을 돌려줍니다.
 */
export interface VimPositionOps {
  /** 커서 아래 글자. 줄 끝(NUL)이면 '' */
  gchar(p: CursorPosition): string;
  /** 0: 같은 줄, 2: 줄 끝(NUL)으로, 1: 다음 줄로, -1: 더 갈 곳 없음 (위치 그대로) */
  inc(p: CursorPosition): [CursorPosition, number];
  /** 0: 같은 줄, 1: 이전 줄 끝(NUL)으로, -1: 더 갈 곳 없음 */
  dec(p: CursorPosition): [CursorPosition, number];
  /** inc 후 줄 끝(NUL)에 섰으면 한 번 더 */
  incl(p: CursorPosition): [CursorPosition, number];
  /** dec 후 이전 줄 끝(NUL)에 섰으면 한 번 더 */
  decl(p: CursorPosition): [CursorPosition, number];
  lineLen(line: number): number;
  lastLine: number;
}

export function vimPositionOps(lines: string[]): VimPositionOps {
  const lastLine = Math.max(0, lines.length - 1);
  const lineLen = (line: number) => (lines[line] ?? '').length;
  const inc = (p: CursorPosition): [CursorPosition, number] => {
    if (p.col < lineLen(p.line)) {
      const col = p.col + 1;
      return [{ line: p.line, col }, col < lineLen(p.line) ? 0 : 2];
    }
    if (p.line < lastLine) return [{ line: p.line + 1, col: 0 }, 1];
    return [p, -1];
  };
  const dec = (p: CursorPosition): [CursorPosition, number] => {
    if (p.col > 0) return [{ line: p.line, col: p.col - 1 }, 0];
    if (p.line > 0) return [{ line: p.line - 1, col: lineLen(p.line - 1) }, 1];
    return [p, -1];
  };
  return {
    gchar: (p) => (lines[p.line] ?? '')[p.col] ?? '',
    inc,
    dec,
    incl: (p) => {
      let [q, r] = inc(p);
      if (r >= 1 && q.col) [q, r] = inc(q);
      return [q, r];
    },
    decl: (p) => {
      let [q, r] = dec(p);
      if (r === 1 && q.col) [q, r] = dec(q);
      return [q, r];
    },
    lineLen,
    lastLine,
  };
}

export function comparePositions(a: CursorPosition, b: CursorPosition): number {
  return a.line !== b.line ? a.line - b.line : a.col - b.col;
}

export interface VimOperatorRange {
  startLine: number;
  startCol: number;
  endLine: number;
  /** 끝 포함 열. 빈 줄이면 0 (그 줄 앞의 줄바꿈까지 범위) */
  endCol: number;
  isEmpty?: boolean;
  linewise?: boolean;
  /** 배타적 끝이 다음 줄 0열이라 이전 줄 끝으로 옮긴 범위 (Vim oap->end_adjusted) */
  endAdjusted?: boolean;
}

/**
 * Vim 이 텍스트 객체·모션으로 정한 start / end(inclusive 여부)를 엔진의 끝 포함 범위로 바꿉니다 (do_pending_operator).
 * 배타적 끝이 다음 줄 0열이면 이전 줄 끝으로 옮기고, 시작이 들여쓰기 안이면 줄 단위가 됩니다 (:help exclusive-linewise).
 */
export function toOperatorRange(lines: string[], from: CursorPosition, to: CursorPosition, inclusive: boolean): VimOperatorRange {
  let start = from;
  let end = to;
  if (comparePositions(end, start) < 0) [start, end] = [end, start];
  const len = (l: number) => (lines[l] ?? '').length;
  const inIndent = (lines[start.line] ?? '').slice(0, start.col).trim() === '';
  if (!inclusive && end.col === 0 && end.line > start.line) {
    const endLine = end.line - 1;
    if (inIndent) return { startLine: start.line, startCol: 0, endLine, endCol: Math.max(0, len(endLine) - 1), linewise: true, endAdjusted: true };
    return { startLine: start.line, startCol: start.col, endLine, endCol: Math.max(0, len(endLine) - 1) };
  }
  if (!inclusive) {
    if (end.line === start.line && end.col <= start.col) {
      return { startLine: start.line, startCol: start.col, endLine: start.line, endCol: start.col - 1, isEmpty: true };
    }
    return { startLine: start.line, startCol: start.col, endLine: end.line, endCol: end.col - 1 };
  }
  return { startLine: start.line, startCol: start.col, endLine: end.line, endCol: Math.max(0, Math.min(end.col, len(end.line) - 1)) };
}
