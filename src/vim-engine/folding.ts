import { FoldRange, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { deleteLine, pushUndoSnapshot, yankLine } from './operators';
import { resolveCommentString } from './commentEngine';
import { EvalContext, evaluateVimScript, toVimString } from './vimscriptEval';
import { callUserFunction } from './vimscriptEngine';

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

  const uniqueMap = new Map<string, FoldRange>();
  for (const b of blocks) {
    const key = `${b.startRow}-${b.endRow}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => a.startRow - b.startRow);
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

  const uniqueMap = new Map<string, FoldRange>();
  for (const b of blocks) {
    const key = `${b.startRow}-${b.endRow}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => a.startRow - b.startRow);
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

  const uniqueMap = new Map<string, FoldRange>();
  for (const b of blocks) {
    const key = `${b.startRow}-${b.endRow}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => a.startRow - b.startRow);
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

  // 중복 제거 및 시작행 기준 정렬
  const uniqueMap = new Map<string, FoldRange>();
  for (const b of blocks) {
    const key = `${b.startRow}-${b.endRow}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, b);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => a.startRow - b.startRow);
}

/**
 * 현재 커서 줄(또는 인접한 여는/닫는 중괄호 줄)과 관련된 폴딩 블록을 탐색합니다.
 */
export function findFoldForCursor(
  folds: FoldRange[] | undefined,
  lines: string[],
  cursorRow: number,
  foldmethod = 'manual',
  shiftwidth = 2,
  foldexpr = '0',
  state?: VimEditorState
): { fold: FoldRange; index: number } | null {
  const currentFolds = folds ?? [];

  // 1. 이미 등록된 folds 중 cursorRow가 startRow인 항목 우선
  for (let i = 0; i < currentFolds.length; i++) {
    const f = currentFolds[i];
    if (f.startRow === cursorRow) {
      return { fold: f, index: i };
    }
  }

  // 2. 이미 등록된 folds 중 cursorRow를 감싸고 있는 항목 (startRow <= cursorRow <= endRow)
  for (let i = 0; i < currentFolds.length; i++) {
    const f = currentFolds[i];
    if (f.startRow <= cursorRow && cursorRow <= f.endRow) {
      return { fold: f, index: i };
    }
  }

  // 3. 이미 등록된 folds 중 { 위치(startRow - 1)나 } 위치(endRow + 1)에 커서가 있는 경우
  for (let i = 0; i < currentFolds.length; i++) {
    const f = currentFolds[i];
    if (f.startRow - 1 === cursorRow || f.endRow + 1 === cursorRow) {
      return { fold: f, index: i };
    }
  }

  // 4. 버퍼 분석을 통해 새롭게 감싸는 블록 탐색
  const detected = detectFoldBlocks(lines, foldmethod, shiftwidth, foldexpr, state, state?.options?.foldmarker);
  const matched = detected
    .filter(
      (b) =>
        (b.startRow <= cursorRow && cursorRow <= b.endRow) ||
        b.startRow - 1 === cursorRow ||
        b.endRow + 1 === cursorRow
    )
    .sort((a, b) => {
      // 가장 안쪽(범위가 더 작은) 블록 우선
      const spanA = a.endRow - a.startRow;
      const spanB = b.endRow - b.startRow;
      return spanA - spanB;
    });

  if (matched.length > 0) {
    return { fold: matched[0], index: -1 };
  }

  return null;
}

/**
 * zc: 현재 커서가 속한 블록 접기
 */
export function foldClose(state: VimEditorState): VimEditorState {
  const found = findFoldForCursor(
    state.folds,
    state.lines,
    state.cursor.line,
    state.options?.foldmethod,
    state.options?.shiftwidth,
    state.options?.foldexpr,
    state
  );
  if (!found) {
    return { ...state, pendingKeys: undefined };
  }

  const newFolds = [...(state.folds ?? [])];
  if (found.index >= 0) {
    newFolds[found.index] = { ...newFolds[found.index], closed: true };
  } else {
    newFolds.push({ ...found.fold, closed: true });
  }

  // 커서가 접힌 블록 내부에 있으면 접힌 첫 번째 행(startRow)으로 이동
  let newCursor = state.cursor;
  if (state.cursor.line > found.fold.startRow && state.cursor.line <= found.fold.endRow) {
    newCursor = clampCursor(
      state.lines,
      { line: found.fold.startRow, col: state.cursor.col },
      'NORMAL'
    );
  }

  return {
    ...state,
    folds: newFolds,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * zo: 현재 접힌 블록 펼치기
 */
export function foldOpen(state: VimEditorState): VimEditorState {
  const found = findFoldForCursor(
    state.folds,
    state.lines,
    state.cursor.line,
    state.options?.foldmethod,
    state.options?.shiftwidth,
    state.options?.foldexpr,
    state
  );
  if (!found || found.index < 0) {
    return { ...state, pendingKeys: undefined };
  }

  const newFolds = [...(state.folds ?? [])];
  newFolds[found.index] = { ...newFolds[found.index], closed: false };

  return {
    ...state,
    folds: newFolds,
    pendingKeys: undefined,
  };
}

/**
 * za: 현재 블록 접기/펼치기 토글
 */
export function foldToggle(state: VimEditorState): VimEditorState {
  const found = findFoldForCursor(
    state.folds,
    state.lines,
    state.cursor.line,
    state.options?.foldmethod,
    state.options?.shiftwidth,
    state.options?.foldexpr,
    state
  );
  if (!found) {
    return { ...state, pendingKeys: undefined };
  }

  const newFolds = [...(state.folds ?? [])];
  let targetClosed = true;

  if (found.index >= 0) {
    targetClosed = !newFolds[found.index].closed;
    newFolds[found.index] = { ...newFolds[found.index], closed: targetClosed };
  } else {
    newFolds.push({ ...found.fold, closed: true });
  }

  let newCursor = state.cursor;
  if (targetClosed && state.cursor.line > found.fold.startRow && state.cursor.line <= found.fold.endRow) {
    newCursor = clampCursor(
      state.lines,
      { line: found.fold.startRow, col: state.cursor.col },
      'NORMAL'
    );
  }

  return {
    ...state,
    folds: newFolds,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * zM: 버퍼 내 모든 블록 일괄 접기
 */
export function foldCloseAll(state: VimEditorState): VimEditorState {
  const detected = detectFoldBlocks(
    state.lines,
    state.options?.foldmethod,
    state.options?.shiftwidth,
    state.options?.foldexpr,
    state,
    state.options?.foldmarker
  );
  const existingMap = new Map<string, FoldRange>();

  for (const f of state.folds ?? []) {
    existingMap.set(`${f.startRow}-${f.endRow}`, f);
  }

  for (const d of detected) {
    const key = `${d.startRow}-${d.endRow}`;
    if (!existingMap.has(key)) {
      existingMap.set(key, d);
    }
  }

  const allFolds = Array.from(existingMap.values()).map((f) => ({
    ...f,
    closed: true,
  }));

  // 커서가 접힌 블록 안에 있다면 해당 블록의 startRow로 이동
  let newCursor = state.cursor;
  const enclosing = allFolds.find(
    (f) => f.startRow < state.cursor.line && state.cursor.line <= f.endRow
  );
  if (enclosing) {
    newCursor = clampCursor(
      state.lines,
      { line: enclosing.startRow, col: state.cursor.col },
      'NORMAL'
    );
  }

  return {
    ...state,
    folds: allFolds,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * zR: 버퍼 내 모든 블록 일괄 펼치기
 */
export function foldOpenAll(state: VimEditorState): VimEditorState {
  const currentFolds = (state.folds ?? []).map((f) => ({
    ...f,
    closed: false,
  }));

  return {
    ...state,
    folds: currentFolds,
    pendingKeys: undefined,
  };
}

/**
 * 현재 줄이 닫힌 폴드의 시작점(startRow)인지 확인하고 해당 폴드를 반환합니다.
 */
export function getClosedFoldStartingAt(
  folds: FoldRange[] | undefined,
  row: number
): FoldRange | undefined {
  if (!folds) return undefined;
  return folds.find((f) => f.closed && f.startRow === row);
}

/**
 * 특정 줄이 닫힌 폴드의 숨김 영역(startRow < row <= endRow)에 속하는지 확인합니다.
 */
export function isLineHiddenByFold(
  folds: FoldRange[] | undefined,
  row: number
): boolean {
  if (!folds) return false;
  return folds.some((f) => f.closed && f.startRow < row && row <= f.endRow);
}

/**
 * j 이동 시: 접힌 블록 구간을 한 번에 건너뛰고 다음 보이는 줄 번호를 반환합니다.
 */
export function getNextVisibleLine(
  folds: FoldRange[] | undefined,
  currentLine: number,
  maxLine: number
): number {
  if (!folds || folds.length === 0) {
    return Math.min(maxLine, currentLine + 1);
  }

  // 현재 줄이 닫힌 폴드의 시작점인 경우, endRow 다음 줄로 바로 건너뜀
  const fold = getClosedFoldStartingAt(folds, currentLine);
  if (fold) {
    let next = fold.endRow + 1;
    // 다음 줄도 숨겨진 줄인지 연속 체크
    while (next <= maxLine && isLineHiddenByFold(folds, next)) {
      next++;
    }
    return Math.min(maxLine, next);
  }

  let next = currentLine + 1;
  while (next <= maxLine && isLineHiddenByFold(folds, next)) {
    next++;
  }
  return Math.min(maxLine, next);
}

/**
 * k 이동 시: 접힌 블록 구간을 건너뛰고 이전 보이는 줄 번호를 반환합니다.
 */
export function getPrevVisibleLine(
  folds: FoldRange[] | undefined,
  currentLine: number
): number {
  if (!folds || folds.length === 0) {
    return Math.max(0, currentLine - 1);
  }

  let prev = currentLine - 1;
  while (prev >= 0) {
    // prev가 어떤 닫힌 폴드의 숨김 영역(startRow < prev <= endRow)에 속하면, 그 폴드의 startRow로 점프
    const enclosing = folds.find((f) => f.closed && f.startRow < prev && prev <= f.endRow);
    if (enclosing) {
      prev = enclosing.startRow;
      break;
    }
    break;
  }
  return Math.max(0, prev);
}

/**
 * 접힌 블록 위에서 dd 실행 시: 접힌 구간 전체 줄을 한 번에 삭제합니다.
 */
export function deleteFoldOrLine(
  state: VimEditorState,
  count = 1
): VimEditorState {
  const closedFold = getClosedFoldStartingAt(state.folds, state.cursor.line);
  if (closedFold) {
    const totalLinesInFold = closedFold.endRow - closedFold.startRow + 1;
    const deleteCount = Math.max(count, totalLinesInFold);
    const res = deleteLine(state, deleteCount);

    // 삭제된 구간에 포함된 fold 제거 및 아래쪽 fold들의 row 번호 보정
    const remainingFolds = (state.folds ?? [])
      .filter((f) => f.startRow !== closedFold.startRow)
      .map((f) => {
        if (f.startRow > closedFold.endRow) {
          return {
            ...f,
            startRow: f.startRow - totalLinesInFold,
            endRow: f.endRow - totalLinesInFold,
          };
        }
        return f;
      })
      .filter((f) => f.startRow < res.lines.length && f.endRow < res.lines.length);

    return {
      ...res,
      folds: remainingFolds,
    };
  }

  return deleteLine(state, count);
}

/**
 * 접힌 블록 위에서 yy 실행 시: 접힌 구간 전체 줄을 한 번에 복사합니다.
 */
export function yankFoldOrLine(
  state: VimEditorState,
  count = 1
): VimEditorState {
  const closedFold = getClosedFoldStartingAt(state.folds, state.cursor.line);
  if (closedFold) {
    const totalLinesInFold = closedFold.endRow - closedFold.startRow + 1;
    const yankCount = Math.max(count, totalLinesInFold);
    return yankLine(state, yankCount);
  }

  return yankLine(state, count);
}

/**
 * zf: 시작 줄부터 끝 줄까지 수동 폴드 생성 (Visual 모드 또는 Normal zf{motion})
 */
export function createFold(
  state: VimEditorState,
  startRow: number,
  endRow: number
): VimEditorState {
  const start = Math.max(0, Math.min(startRow, endRow));
  const end = Math.min(state.lines.length - 1, Math.max(startRow, endRow));

  let baseState = state;
  let nextLines = state.lines;

  if (state.options?.foldmethod === 'marker' && end > start) {
    const [startMarker, endMarker] = parseFoldMarker(state.options?.foldmarker);
    const cms = resolveCommentString(state);
    const formatMarker = (marker: string) =>
      cms.includes('%s') ? cms.replace('%s', marker) : `${cms} ${marker}`.trim();
    const updatedLines = [...state.lines];
    if (!(updatedLines[start] ?? '').includes(startMarker)) {
      updatedLines[start] = `${updatedLines[start] ?? ''}${formatMarker(startMarker)}`;
    }
    if (!(updatedLines[end] ?? '').includes(endMarker)) {
      updatedLines[end] = `${updatedLines[end] ?? ''}${formatMarker(endMarker)}`;
    }
    if (updatedLines[start] !== state.lines[start] || updatedLines[end] !== state.lines[end]) {
      baseState = pushUndoSnapshot(state);
      nextLines = updatedLines;
    }
  }

  const existingFolds = [...(baseState.folds ?? [])];
  const idx = existingFolds.findIndex(
    (f) => f.startRow === start && f.endRow === end
  );

  if (idx >= 0) {
    existingFolds[idx] = { ...existingFolds[idx], closed: true, manual: true };
  } else {
    existingFolds.push({
      startRow: start,
      endRow: end,
      closed: true,
      manual: true,
    });
  }

  const sortedFolds = existingFolds.sort((a, b) => a.startRow - b.startRow);

  return {
    ...baseState,
    lines: nextLines,
    folds: sortedFolds,
    cursor: clampCursor(nextLines, { line: start, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * zd: 현재 커서 위치의 폴드 1개 삭제
 */
export function deleteFoldAtCursor(state: VimEditorState): VimEditorState {
  const folds = state.folds ?? [];
  const cursorRow = state.cursor.line;

  let targetIdx = -1;
  let minSpan = Infinity;

  for (let i = 0; i < folds.length; i++) {
    const f = folds[i];
    if (f.startRow <= cursorRow && cursorRow <= f.endRow) {
      const span = f.endRow - f.startRow;
      if (span < minSpan) {
        minSpan = span;
        targetIdx = i;
      }
    }
  }

  if (targetIdx === -1) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
    };
  }

  const nextFolds = folds.filter((_, idx) => idx !== targetIdx);

  return {
    ...state,
    folds: nextFolds,
    pendingKeys: undefined,
  };
}

/**
 * zD: 현재 커서 위치를 포함하는 모든 폴드 삭제 (재귀적 삭제)
 */
export function deleteAllFoldsAtCursor(state: VimEditorState): VimEditorState {
  const folds = state.folds ?? [];
  const cursorRow = state.cursor.line;

  const nextFolds = folds.filter(
    (f) => !(f.startRow <= cursorRow && cursorRow <= f.endRow)
  );

  if (nextFolds.length === folds.length) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
    };
  }

  return {
    ...state,
    folds: nextFolds,
    pendingKeys: undefined,
  };
}

/**
 * zE: 버퍼 내의 모든 수동 생성 폴드 제거
 */
export function eliminateAllFolds(state: VimEditorState): VimEditorState {
  return {
    ...state,
    folds: [],
    pendingKeys: undefined,
  };
}

/**
 * 순정 Vim 스타일의 폴드 요약 배너 텍스트 생성
 */
export function generateFoldText(lines: string[], fold: FoldRange): string {
  const count = fold.endRow - fold.startRow + 1;
  const firstLine = lines[fold.startRow] ?? '';
  const trimmed = firstLine.trim();
  const countStr = count < 10 ? ` ${count}` : `${count}`;
  return `+-- ${countStr} lines: ${trimmed} ----------------------------------------------------`.slice(0, 72);
}

function collectKnownFolds(state: VimEditorState): FoldRange[] {
  const detected = detectFoldBlocks(
    state.lines,
    state.options?.foldmethod,
    state.options?.shiftwidth,
    state.options?.foldexpr,
    state,
    state.options?.foldmarker
  );
  const map = new Map<string, FoldRange>();
  for (const d of detected) {
    map.set(`${d.startRow}-${d.endRow}`, d);
  }
  for (const f of state.folds ?? []) {
    map.set(`${f.startRow}-${f.endRow}`, f);
  }
  return Array.from(map.values()).sort((a, b) => a.startRow - b.startRow || b.endRow - a.endRow);
}

/**
 * zj: 다음 폴드 시작 줄로 점프합니다.
 */
export function jumpToNextFold(state: VimEditorState, count = 1): VimEditorState {
  const folds = collectKnownFolds(state);
  let row = state.cursor.line;
  const curFold = getClosedFoldStartingAt(state.folds, row);
  let searchFrom = curFold ? curFold.endRow : row;

  let target: FoldRange | undefined;
  let moved = 0;
  for (let i = 0; i < count; i++) {
    const next = folds.find((f) => f.startRow > searchFrom);
    if (!next) break;
    target = next;
    moved++;
    searchFrom = next.closed ? next.endRow : next.startRow;
  }
  if (!target || moved === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  row = target.startRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: row, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * zk: 이전 폴드 끝 줄(닫혀 있으면 시작 줄)로 점프합니다.
 */
export function jumpToPrevFold(state: VimEditorState, count = 1): VimEditorState {
  const folds = collectKnownFolds(state);
  let searchBefore = state.cursor.line;
  let target: FoldRange | undefined;
  let moved = 0;

  for (let i = 0; i < count; i++) {
    const candidates = folds.filter((f) => f.endRow < searchBefore);
    if (candidates.length === 0) break;
    // endRow가 가장 큰 폴드 선택
    target = candidates.reduce((best, cur) => (cur.endRow > best.endRow ? cur : best));
    moved++;
    searchBefore = target.startRow;
  }
  if (!target || moved === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  const destRow = target.closed ? target.startRow : target.endRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: destRow, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * [z / ]z: 현재 열려 있는 폴드의 시작([z) 또는 끝(]z) 줄로 점프합니다.
 */
export function jumpToFoldEdge(state: VimEditorState, edge: 'start' | 'end'): VimEditorState {
  const folds = collectKnownFolds(state);
  const row = state.cursor.line;
  const enclosing = folds
    .filter((f) => f.startRow <= row && row <= f.endRow && (edge === 'start' ? f.startRow < row : f.endRow > row))
    .sort((a, b) => (a.endRow - a.startRow) - (b.endRow - b.startRow));

  if (enclosing.length === 0) {
    return { ...state, bell: true, pendingKeys: undefined };
  }
  const targetRow = edge === 'start' ? enclosing[0].startRow : enclosing[0].endRow;
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: targetRow, col: 0 }, 'NORMAL'),
    pendingKeys: undefined,
  };
}
