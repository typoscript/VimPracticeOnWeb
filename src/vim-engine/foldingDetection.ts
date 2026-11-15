import { FoldRange, VimEditorState } from './types';
import { EvalContext, evaluateVimScript, toVimString } from './vimscriptEval';
import { callUserFunction } from './vimscriptEngine';

function dedupeSortedFolds(blocks: FoldRange[]): FoldRange[] {
  const uniqueMap = new Map<string, FoldRange>();
  for (const b of blocks) {
    const key = `${b.startRow}-${b.endRow}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }
  return Array.from(uniqueMap.values()).sort((a, b) => a.startRow - b.startRow);
}

function createLevelTrackers(blocks: FoldRange[], openStarts: Map<number, number>) {
  const closeLevelsAbove = (targetLevel: number, endRow: number) => {
    for (const [lvl, startRow] of Array.from(openStarts.entries())) {
      if (lvl > targetLevel) {
        openStarts.delete(lvl);
        if (endRow > startRow) {
          blocks.push({ startRow, endRow, closed: false });
        }
      }
    }
  };

  const openLevelsUpTo = (targetLevel: number, startRow: number) => {
    for (let lvl = 1; lvl <= targetLevel; lvl++) {
      if (!openStarts.has(lvl)) {
        openStarts.set(lvl, startRow);
      }
    }
  };

  return { closeLevelsAbove, openLevelsUpTo };
}

/**
 * 들여쓰기(indentation) 구조를 분석하여 버퍼 내 모든 접을 수 있는 블록 범위를 탐색합니다. (:set fdm=indent)
 */
export function detectIndentFoldBlocks(lines: string[], shiftwidth = 2): FoldRange[] {
  if (lines.length <= 1) return [];

  const sw = Math.max(1, shiftwidth);
  const rawLevels: number[] = lines.map((line) => {
    if (line.trim() === '') return -1;
    let spaces = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') spaces += 1;
      else if (line[i] === '\t') spaces += sw;
      else break;
    }
    return Math.floor(spaces / sw);
  });

  const levels = rawLevels.map((lvl, idx) => {
    if (lvl !== -1) return lvl;
    let prev = 0;
    for (let p = idx - 1; p >= 0; p--) {
      if (rawLevels[p] !== -1) {
        prev = rawLevels[p];
        break;
      }
    }
    let next = 0;
    for (let n = idx + 1; n < rawLevels.length; n++) {
      if (rawLevels[n] !== -1) {
        next = rawLevels[n];
        break;
      }
    }
    return Math.max(prev, next);
  });

  const maxLevel = Math.max(...levels, 0);
  const blocks: FoldRange[] = [];

  for (let targetLevel = 1; targetLevel <= maxLevel; targetLevel++) {
    let blockStart = -1;
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] >= targetLevel) {
        if (blockStart === -1) {
          blockStart = i;
        }
      } else {
        if (blockStart !== -1) {
          const blockEnd = i - 1;
          if (blockEnd >= blockStart) {
            blocks.push({
              startRow: blockStart,
              endRow: blockEnd,
              closed: false,
            });
          }
          blockStart = -1;
        }
      }
    }
    if (blockStart !== -1) {
      const blockEnd = levels.length - 1;
      if (blockEnd >= blockStart) {
        blocks.push({
          startRow: blockStart,
          endRow: blockEnd,
          closed: false,
        });
      }
    }
  }

  return dedupeSortedFolds(blocks);
}

/**
 * 표현식(foldexpr)을 줄마다 평가하여 폴딩 블록 범위를 탐색합니다. (:set fdm=expr, :set fde=...)
 * 지원 반환값: 0/1/2..., >N(시작), <N(끝), =(유지), aN(증가), sN(감소)
 */
export function detectExprFoldBlocks(
  lines: string[],
  foldexpr = '0',
  state?: VimEditorState
): FoldRange[] {
  const expr = (foldexpr ?? '0').trim();
  if (!expr || expr === '0' || lines.length <= 1) return [];

  const blocks: FoldRange[] = [];
  const openStarts = new Map<number, number>();
  let prevLevel = 0;
  const { closeLevelsAbove, openLevelsUpTo } = createLevelTrackers(blocks, openStarts);

  const baseState: VimEditorState = state
    ? { ...state, lines }
    : { lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' };

  for (let i = 0; i < lines.length; i++) {
    let raw = '';
    try {
      const ctx: EvalContext = {
        state: { ...baseState, cursor: { line: i, col: 0 } },
        vvars: { lnum: i + 1 },
        callUserFunction: (c, name, args) => {
          const r = callUserFunction(c.state, name, args, (s) => s, 0, i + 1, i + 1);
          if (r.error) throw new Error(r.error);
          return r.value;
        },
      };
      const val = evaluateVimScript(expr, ctx);
      raw = typeof val === 'number' ? String(Math.floor(val)) : toVimString(val).trim();
    } catch {
      return [];
    }

    if (raw === '=' || raw === '' || raw === '-1') {
      openLevelsUpTo(prevLevel, i);
      continue;
    }

    const startMatch = raw.match(/^>(\d+)$/);
    if (startMatch) {
      const n = Math.max(0, parseInt(startMatch[1], 10));
      closeLevelsAbove(Math.max(0, n - 1), i - 1);
      openLevelsUpTo(n, i);
      prevLevel = n;
      continue;
    }

    const endMatch = raw.match(/^<(\d+)$/);
    if (endMatch) {
      const n = Math.max(1, parseInt(endMatch[1], 10));
      closeLevelsAbove(Math.max(0, n - 1), i);
      prevLevel = Math.max(0, n - 1);
      continue;
    }

    const addMatch = raw.match(/^a(\d+)$/);
    if (addMatch) {
      const delta = Math.max(0, parseInt(addMatch[1], 10));
      const target = prevLevel + delta;
      openLevelsUpTo(target, i);
      prevLevel = target;
      continue;
    }

    const subMatch = raw.match(/^s(\d+)$/);
    if (subMatch) {
      const delta = Math.max(0, parseInt(subMatch[1], 10));
      const target = Math.max(0, prevLevel - delta);
      closeLevelsAbove(target, i);
      prevLevel = target;
      continue;
    }

    const numMatch = raw.match(/^-?\d+$/);
    if (numMatch) {
      const lvl = Math.max(0, parseInt(raw, 10));
      closeLevelsAbove(lvl, i - 1);
      openLevelsUpTo(lvl, i);
      prevLevel = lvl;
    }
  }

  closeLevelsAbove(0, lines.length - 1);
  return dedupeSortedFolds(blocks);
}

function escapeFoldRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseFoldMarker(foldmarker = '{{{,}}}'): [string, string] {
  const commaIdx = foldmarker.indexOf(',');
  if (commaIdx <= 0) return ['{{{', '}}}'];
  const startM = foldmarker.slice(0, commaIdx);
  const endM = foldmarker.slice(commaIdx + 1);
  return startM && endM ? [startM, endM] : ['{{{', '}}}'];
}

/**
 * 마커(foldmarker, 기본 {{{ / }}}) 및 레벨 숫자({{{1, }}}1)를 분석하여 폴딩 블록을 탐색합니다. (:set fdm=marker)
 */
export function detectMarkerFoldBlocks(
  lines: string[],
  foldmarker = '{{{,}}}'
): FoldRange[] {
  if (lines.length <= 1) return [];
  const [startMarker, endMarker] = parseFoldMarker(foldmarker);
  const pattern = new RegExp(
    `(${escapeFoldRegex(startMarker)}(\\d*)|${escapeFoldRegex(endMarker)}(\\d*))`,
    'g'
  );

  const blocks: FoldRange[] = [];
  const openStarts = new Map<number, number>();
  let currentLevel = 0;
  const { closeLevelsAbove, openLevelsUpTo } = createLevelTrackers(blocks, openStarts);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(line)) !== null) {
      if (m[2] !== undefined) {
        // 시작 마커: startMarker[N]
        if (m[2].length > 0) {
          const explicitLvl = Math.max(0, parseInt(m[2], 10));
          closeLevelsAbove(Math.max(0, explicitLvl - 1), i - 1);
          openLevelsUpTo(explicitLvl, i);
          currentLevel = explicitLvl;
        } else {
          currentLevel += 1;
          openStarts.set(currentLevel, i);
        }
      } else {
        // 종료 마커: endMarker[N]
        if (m[3] && m[3].length > 0) {
          const explicitLvl = Math.max(1, parseInt(m[3], 10));
          closeLevelsAbove(explicitLvl - 1, i);
          currentLevel = Math.max(0, explicitLvl - 1);
        } else if (currentLevel > 0) {
          const nextLvl = currentLevel - 1;
          closeLevelsAbove(nextLvl, i);
          currentLevel = nextLvl;
        }
      }
    }
  }

  closeLevelsAbove(0, lines.length - 1);
  return dedupeSortedFolds(blocks);
}

/**
 * 중괄호({}) 또는 들여쓰기/표현식/마커 구조를 분석하여 버퍼 내 모든 접을 수 있는 블록 범위를 탐색합니다.
 */
export function detectFoldBlocks(
  lines: string[],
  foldmethod = 'manual',
  shiftwidth = 2,
  foldexpr = '0',
  state?: VimEditorState,
  foldmarker = '{{{,}}}'
): FoldRange[] {
  if (foldmethod === 'indent') {
    return detectIndentFoldBlocks(lines, shiftwidth);
  }
  if (foldmethod === 'expr') {
    return detectExprFoldBlocks(lines, foldexpr, state);
  }
  if (foldmethod === 'marker') {
    return detectMarkerFoldBlocks(lines, foldmarker);
  }

  const blocks: FoldRange[] = [];
  const braceStack: number[] = [];

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l] ?? '';
    // 문자열 리터럴 밖의 중괄호 탐색
    let inQuote: string | null = null;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inQuote) {
        if (ch === inQuote && line[c - 1] !== '\\') {
          inQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          inQuote = ch;
        } else if (ch === '{') {
          braceStack.push(l);
        } else if (ch === '}') {
          if (braceStack.length > 0) {
            const openLine = braceStack.pop()!;
            if (l > openLine) {
              if (l - openLine >= 2) {
                // 내부 본문 3줄 이상 (예: { 다음 줄부터 } 직전 줄까지)
                blocks.push({
                  startRow: openLine + 1,
                  endRow: l - 1,
                  closed: false,
                });
              } else {
                blocks.push({
                  startRow: openLine,
                  endRow: l,
                  closed: false,
                });
              }
            }
          }
        }
      }
    }
  }

  return dedupeSortedFolds(blocks);
}
