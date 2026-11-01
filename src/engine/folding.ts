import { FoldRange, VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { deleteLine, yankLine } from './operators';

/**
 * 중괄호({}) 또는 들여쓰기 구조를 분석하여 버퍼 내 모든 접을 수 있는 블록 범위를 탐색합니다.
 */
export function detectFoldBlocks(lines: string[]): FoldRange[] {
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
  cursorRow: number
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
  const detected = detectFoldBlocks(lines);
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
  const found = findFoldForCursor(state.folds, state.lines, state.cursor.line);
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
  const found = findFoldForCursor(state.folds, state.lines, state.cursor.line);
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
  const found = findFoldForCursor(state.folds, state.lines, state.cursor.line);
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
  const detected = detectFoldBlocks(state.lines);
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
