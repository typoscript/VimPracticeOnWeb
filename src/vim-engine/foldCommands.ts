/**
 * 폴드 열기·닫기 명령 (`zo zc za zM zR zm zr zv zx zX zO zC zA zi`) 과 커서 폴드 찾기.
 * `folding.ts` 가 다시 export 합니다.
 */
import { FoldRange, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { getOptions } from './setOptionsCore';
import { detectFoldBlocks } from './foldingDetection';

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

  const nextOpts = { ...getOptions(state), foldlevel: 0, foldenable: true };
  return {
    ...state,
    folds: allFolds,
    options: nextOpts,
    globalOptions: state.globalOptions ? { ...state.globalOptions, foldlevel: 0, foldenable: true } : state.globalOptions,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * zR: 버퍼 내 모든 블록 일괄 펼치기 (foldlevel 을 최대 중첩 깊이로 상향)
 */
export function foldOpenAll(state: VimEditorState): VimEditorState {
  const known = collectKnownFolds(state);
  const maxDepth = known.reduce((acc, f) => Math.max(acc, computeFoldDepth(f, known)), 0);
  const currentFolds = (state.folds ?? []).map((f) => ({
    ...f,
    closed: false,
  }));
  const nextOpts = { ...getOptions(state), foldlevel: maxDepth, foldenable: true };

  return {
    ...state,
    folds: currentFolds,
    options: nextOpts,
    globalOptions: state.globalOptions
      ? { ...state.globalOptions, foldlevel: maxDepth, foldenable: true }
      : state.globalOptions,
    pendingKeys: undefined,
  };
}

function computeFoldDepth(fold: FoldRange, allFolds: FoldRange[]): number {
  let depth = 1;
  for (const other of allFolds) {
    if (
      other.startRow <= fold.startRow &&
      other.endRow >= fold.endRow &&
      (other.startRow !== fold.startRow || other.endRow !== fold.endRow)
    ) {
      depth++;
    }
  }
  return depth;
}

function applyFoldLevelState(
  state: VimEditorState,
  nextLevel: number,
  openCursorLine: boolean
): VimEditorState {
  const clampedLevel = Math.max(0, nextLevel);
  const known = collectKnownFolds(state);
  const row = state.cursor.line;
  const updatedFolds = known.map((f) => {
    const depth = computeFoldDepth(f, known);
    const containsCursor = openCursorLine && f.startRow <= row && row <= f.endRow;
    return {
      ...f,
      closed: containsCursor ? false : depth > clampedLevel,
    };
  });

  let newCursor = state.cursor;
  const enclosingClosed = updatedFolds
    .filter((f) => f.closed && f.startRow < row && row <= f.endRow)
    .sort((a, b) => a.startRow - b.startRow)[0];
  if (enclosingClosed) {
    newCursor = clampCursor(state.lines, { line: enclosingClosed.startRow, col: state.cursor.col }, 'NORMAL');
  }

  const nextOpts = { ...getOptions(state), foldlevel: clampedLevel, foldenable: true };
  return {
    ...state,
    folds: updatedFolds,
    cursor: newCursor,
    options: nextOpts,
    globalOptions: state.globalOptions
      ? { ...state.globalOptions, foldlevel: clampedLevel, foldenable: true }
      : state.globalOptions,
    pendingKeys: undefined,
  };
}

/**
 * zm: 폴드 레벨을 [count]만큼 낮추어 더 많이 접습니다.
 */
export function foldMore(state: VimEditorState, count = 1): VimEditorState {
  const opts = getOptions(state);
  const curLevel = Math.max(0, opts.foldlevel ?? 0);
  return applyFoldLevelState(state, Math.max(0, curLevel - Math.max(1, count)), false);
}

/**
 * zr: 폴드 레벨을 [count]만큼 높여 더 많이 펼칩니다.
 */
export function foldReduce(state: VimEditorState, count = 1): VimEditorState {
  const opts = getOptions(state);
  const curLevel = Math.max(0, opts.foldlevel ?? 0);
  return applyFoldLevelState(state, curLevel + Math.max(1, count), false);
}

/**
 * zv: 커서 줄이 보이도록 커서를 감싸는 모든 닫힌 폴드를 펼칩니다.
 */
export function foldOpenCursorLine(state: VimEditorState): VimEditorState {
  const row = state.cursor.line;
  const currentFolds = (state.folds ?? []).map((f) =>
    f.closed && f.startRow <= row && row <= f.endRow ? { ...f, closed: false } : f
  );
  return {
    ...state,
    folds: currentFolds,
    pendingKeys: undefined,
  };
}

/**
 * zx / zX: foldlevel 기준으로 모든 폴드를 재적용합니다. (zx 는 커서 줄 폴드를 자동 펼침)
 */
export function foldUpdate(state: VimEditorState, openCursorLine: boolean): VimEditorState {
  const opts = getOptions(state);
  const curLevel = Math.max(0, opts.foldlevel ?? 0);
  return applyFoldLevelState(state, curLevel, openCursorLine);
}

/**
 * zO / zC / zA: 커서 위치의 폴드와 중첩된 하위 폴드를 재귀적으로 열기/닫기/토글합니다.
 */
export function foldRecursive(
  state: VimEditorState,
  action: 'open' | 'close' | 'toggle'
): VimEditorState {
  const row = state.cursor.line;
  const known = collectKnownFolds(state);
  const enclosing = known
    .filter((f) => f.startRow <= row && row <= f.endRow)
    .sort((a, b) => (b.endRow - b.startRow) - (a.endRow - a.startRow));

  if (enclosing.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const outermost = enclosing[0];
  const innermost = enclosing[enclosing.length - 1];
  const shouldClose =
    action === 'close' ? true : action === 'open' ? false : !innermost.closed;

  const updatedFolds = known.map((f) => {
    const insideOutermost = f.startRow >= outermost.startRow && f.endRow <= outermost.endRow;
    if (insideOutermost) {
      return { ...f, closed: shouldClose };
    }
    return f;
  });

  let newCursor = state.cursor;
  if (shouldClose && row > outermost.startRow && row <= outermost.endRow) {
    newCursor = clampCursor(state.lines, { line: outermost.startRow, col: state.cursor.col }, 'NORMAL');
  }

  return {
    ...state,
    folds: updatedFolds,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * zi: 'foldenable' 옵션을 토글하여 모든 폴드 적용을 일시 켜고 끕니다.
 */
export function toggleFoldEnable(state: VimEditorState): VimEditorState {
  const opts = getOptions(state);
  const nextEnabled = opts.foldenable === false;
  const nextOpts = { ...opts, foldenable: nextEnabled };
  return {
    ...state,
    options: nextOpts,
    globalOptions: state.globalOptions
      ? { ...state.globalOptions, foldenable: nextEnabled }
      : state.globalOptions,
    pendingKeys: undefined,
    commandMessage: nextEnabled ? 'foldenable' : 'nofoldenable',
  };
}

/** 감지한 폴드와 수동 폴드를 합쳐 (시작 줄, 바깥 폴드 먼저) 순으로 돌려줍니다. */
export function collectKnownFolds(state: VimEditorState): FoldRange[] {
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
