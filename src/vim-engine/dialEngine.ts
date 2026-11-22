import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';

export interface DialTokenMatch {
  start: number;
  end: number;
  raw: string;
  replacement: string;
  tier: 1 | 2;
}

const ISO_DATE_RE = /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;

/** Tier 0: 최우선 값(불리언) 순환 그룹 — 변수명(enabled 등)보다 불리언 값을 우선 */
export const DIAL_BOOLEAN_CYCLES: readonly (readonly string[])[] = [
  ['true', 'false'],
  ['True', 'False'],
  ['TRUE', 'FALSE'],
];

/** Tier 1: 상태·요일·로그레벨·방향 순환 그룹 */
export const DIAL_VALUE_CYCLES: readonly (readonly string[])[] = [
  ['yes', 'no'],
  ['Yes', 'No'],
  ['YES', 'NO'],
  ['on', 'off'],
  ['ON', 'OFF'],
  ['enabled', 'disabled'],
  ['enable', 'disable'],
  ['debug', 'info', 'warn', 'error'],
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  ['left', 'right'],
  ['top', 'bottom'],
  ['up', 'down'],
  ['prev', 'next'],
  ['open', 'close'],
  ['show', 'hide'],
  ['min', 'max'],
  ['and', 'or'],
  ['AND', 'OR'],
];

/** Tier 1 연산자 순환 그룹 (단어 경계가 아닌 비연산자 경계로 매칭) */
export const DIAL_OPERATOR_CYCLES: readonly (readonly string[])[] = [
  ['===', '!=='],
  ['==', '!='],
  ['&&', '||'],
  ['>=', '<='],
];

/** Tier 2: 선언/접근제어 키워드 (줄에 숫자·불리언·날짜 등 Tier 1 값이 없을 때 동작) */
export const DIAL_KEYWORD_CYCLES: readonly (readonly string[])[] = [
  ['const', 'let'],
  ['public', 'protected', 'private'],
  ['read', 'write'],
];

function cycleIndex(idx: number, delta: number, len: number): number {
  return (((idx + delta) % len) + len) % len;
}

function addDaysToIsoDate(year: number, month: number, day: number, delta: number): string | null {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 줄에서 커서 위치 또는 오른쪽에 있는 ISO 날짜(YYYY-MM-DD) 토큰을 찾습니다.
 */
export function findIsoDateTokenAtOrAfter(
  line: string,
  col: number,
  delta: number
): DialTokenMatch | null {
  ISO_DATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = ISO_DATE_RE.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (end > col || start >= col) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const nextDate = addDaysToIsoDate(year, month, day, delta);
      if (nextDate) {
        return { start, end, raw: match[0], replacement: nextDate, tier: 1 };
      }
    }
  }
  return null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildWordMap(groups: readonly (readonly string[])[]): Map<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const group of groups) {
    for (const item of group) {
      map.set(item, group);
    }
  }
  return map;
}

const BOOLEAN_WORD_MAP = buildWordMap(DIAL_BOOLEAN_CYCLES);
const VALUE_WORD_MAP = buildWordMap(DIAL_VALUE_CYCLES);
const KEYWORD_WORD_MAP = buildWordMap(DIAL_KEYWORD_CYCLES);
const OPERATOR_MAP = buildWordMap(DIAL_OPERATOR_CYCLES);

// 긴 연산자(===, !==)를 짧은 연산자(==, !=)보다 먼저 매칭
const OPERATOR_ALTERNATIVES = DIAL_OPERATOR_CYCLES.flat()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');
const OPERATOR_RE = new RegExp(`(${OPERATOR_ALTERNATIVES})`, 'g');
const WORD_RE = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function findTokensInLine(
  line: string,
  col: number,
  delta: number,
  tier: 0 | 1 | 2,
  onlyUnderCursor: boolean
): DialTokenMatch | null {
  const candidates: DialTokenMatch[] = [];

  if (tier === 0) {
    const dateMatch = findIsoDateTokenAtOrAfter(line, col, delta);
    if (dateMatch && (!onlyUnderCursor || (dateMatch.start <= col && col < dateMatch.end))) {
      candidates.push(dateMatch);
    }

    OPERATOR_RE.lastIndex = 0;
    let opMatch: RegExpExecArray | null = null;
    while ((opMatch = OPERATOR_RE.exec(line)) !== null) {
      const start = opMatch.index;
      const end = start + opMatch[0].length;
      if (onlyUnderCursor ? !(start <= col && col < end) : !(end > col || start >= col)) {
        continue;
      }
      const prevChar = start > 0 ? line[start - 1] : '';
      const nextChar = end < line.length ? line[end] : '';
      if (opMatch[0].includes('=') && (prevChar === '=' || nextChar === '=')) {
        continue;
      }
      const group = OPERATOR_MAP.get(opMatch[0]);
      if (!group) continue;
      const nextVal = group[cycleIndex(group.indexOf(opMatch[0]), delta, group.length)];
      candidates.push({ start, end, raw: opMatch[0], replacement: nextVal, tier: 1 });
    }
  }

  const map =
    tier === 0 ? BOOLEAN_WORD_MAP : tier === 1 ? VALUE_WORD_MAP : KEYWORD_WORD_MAP;
  WORD_RE.lastIndex = 0;
  let wMatch: RegExpExecArray | null = null;
  while ((wMatch = WORD_RE.exec(line)) !== null) {
    const start = wMatch.index;
    const end = start + wMatch[0].length;
    if (onlyUnderCursor ? !(start <= col && col < end) : !(end > col || start >= col)) {
      continue;
    }
    const group = map.get(wMatch[0]);
    if (!group) continue;
    const nextVal = group[cycleIndex(group.indexOf(wMatch[0]), delta, group.length)];
    candidates.push({
      start,
      end,
      raw: wMatch[0],
      replacement: nextVal,
      tier: tier === 2 ? 2 : 1,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.start - b.start);
  return candidates[0];
}

/**
 * dial.nvim 스타일 스마트 토큰 탐색:
 * 1) 커서 바로 아래에 Tier 0/1 토큰(날짜/불리언/연산자/상태·요일 등)이 있으면 즉시 반환
 * 2) 없으면 커서 오른쪽 Tier 0(날짜/불리언/연산자) → Tier 1(상태/요일/로그레벨) 순으로 탐색
 * 3) Tier 0/1 이 없고 allowKeywords=true 이면 Tier 2 키워드(const/let 등) 탐색
 */
export function findDialToken(
  line: string,
  col: number,
  delta: number,
  options: { onlyUnderCursor?: boolean; allowKeywords?: boolean } = {}
): DialTokenMatch | null {
  const { onlyUnderCursor = false, allowKeywords = true } = options;

  const tier0Under = findTokensInLine(line, col, delta, 0, true);
  if (tier0Under) return tier0Under;
  const tier1Under = findTokensInLine(line, col, delta, 1, true);
  if (tier1Under) return tier1Under;

  if (!onlyUnderCursor) {
    const tier0After = findTokensInLine(line, col, delta, 0, false);
    if (tier0After) return tier0After;
    const tier1After = findTokensInLine(line, col, delta, 1, false);
    if (tier1After) return tier1After;
  }

  if (allowKeywords) {
    const tier2Under = findTokensInLine(line, col, delta, 2, true);
    if (tier2Under) return tier2Under;
    if (!onlyUnderCursor) {
      return findTokensInLine(line, col, delta, 2, false);
    }
  }

  return null;
}

/**
 * dial.nvim: 지정된 토큰 매치를 현재 줄에 적용하고 단일 Undo 스냅샷을 남깁니다.
 */
export function applyDialMatch(
  state: VimEditorState,
  token: DialTokenMatch
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const stateWithUndo = pushUndoSnapshot(state);
  const before = currentLine.slice(0, token.start);
  const after = currentLine.slice(token.end);
  const newLines = [...state.lines];
  newLines[state.cursor.line] = before + token.replacement + after;
  const newCol = Math.max(0, before.length + token.replacement.length - 1);

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: state.cursor.line, col: newCol },
    pendingKeys: undefined,
  };
}

/**
 * `:DialInc [count]` / `:DialDec [count]` 명시적 스마트 토글/증감 실행
 */
export function executeDialCommand(
  state: VimEditorState,
  delta: number
): VimEditorState {
  const line = state.lines[state.cursor.line] ?? '';
  const token = findDialToken(line, state.cursor.col, delta, { allowKeywords: true });
  if (!token) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  return applyDialMatch(state, token);
}
