import { VimEditorState, CursorPosition, VimMode, SplitPaneState } from './types';

export class VimInvariantViolationError extends Error {
  constructor(
    public readonly invariantName: string,
    public readonly details: string,
    public readonly key?: string,
    public readonly prevState?: VimEditorState,
    public readonly nextState?: VimEditorState
  ) {
    const keyInfo = key !== undefined ? ` [key: '${key}']` : '';
    super(`[Vim Invariant Violation: ${invariantName}] ${details}${keyInfo}`);
    this.name = 'VimInvariantViolationError';
  }
}

/**
 * 객체를 재귀적으로 완전히 동결(Deep Freeze)하여 불변성을 보장합니다.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[prop];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * 0-indexed 커서 좌표(row, col)와 최대 허용 컬럼을 반환합니다.
 */
export function getCursorRow(cursor: CursorPosition | { row: number; col: number }): number {
  return (cursor as any).line !== undefined ? (cursor as any).line : (cursor as any).row;
}

export function getMaxAllowedCol(lineText: string | undefined, mode: VimMode = 'NORMAL'): number {
  if (!lineText || lineText.length === 0) {
    return 0;
  }
  if (mode === 'INSERT' || mode === 'COMMAND' || mode === 'SEARCH' || mode === 'REPLACE') {
    return lineText.length;
  }
  return Math.max(0, lineText.length - 1);
}

/**
 * 개별 버퍼 + 커서 상태의 불변 조건을 검증합니다.
 */
function assertBufferAndCursor(
  lines: string[],
  cursor: CursorPosition,
  mode: VimMode,
  context: string,
  key?: string,
  prevState?: VimEditorState,
  nextState?: VimEditorState
) {
  // 1. lines invariant
  if (!Array.isArray(lines)) {
    throw new VimInvariantViolationError(
      'LINES_NOT_ARRAY',
      `${context}: lines must be an Array, received ${typeof lines}`,
      key,
      prevState,
      nextState
    );
  }
  if (lines.length === 0) {
    throw new VimInvariantViolationError(
      'EMPTY_BUFFER_ARRAY',
      `${context}: lines array must have at least 1 line (e.g. ['']), received empty array []`,
      key,
      prevState,
      nextState
    );
  }
  for (let i = 0; i < lines.length; i++) {
    if (typeof lines[i] !== 'string') {
      throw new VimInvariantViolationError(
        'INVALID_LINE_TYPE',
        `${context}: line at index ${i} is not a string (type: ${typeof lines[i]})`,
        key,
        prevState,
        nextState
      );
    }
  }

  // 2. cursor existence
  if (!cursor || typeof cursor !== 'object') {
    throw new VimInvariantViolationError(
      'CURSOR_MISSING',
      `${context}: cursor object is missing or null`,
      key,
      prevState,
      nextState
    );
  }

  const row = getCursorRow(cursor);
  const col = cursor.col;

  // 3. cursor.row bounds: 0 <= row < lines.length
  if (typeof row !== 'number' || Number.isNaN(row) || !Number.isInteger(row)) {
    throw new VimInvariantViolationError(
      'INVALID_ROW_TYPE',
      `${context}: cursor row must be an integer number, received ${row}`,
      key,
      prevState,
      nextState
    );
  }
  if (row < 0 || row >= lines.length) {
    throw new VimInvariantViolationError(
      'ROW_OUT_OF_BOUNDS',
      `${context}: cursor row ${row} is out of bounds (0 <= row < ${lines.length})`,
      key,
      prevState,
      nextState
    );
  }

  // 4. cursor.col bounds
  if (typeof col !== 'number' || Number.isNaN(col) || !Number.isInteger(col)) {
    throw new VimInvariantViolationError(
      'INVALID_COL_TYPE',
      `${context}: cursor col must be an integer number, received ${col}`,
      key,
      prevState,
      nextState
    );
  }
  if (col < 0) {
    throw new VimInvariantViolationError(
      'COL_UNDERFLOW',
      `${context}: cursor col ${col} cannot be negative`,
      key,
      prevState,
      nextState
    );
  }

  const currentLine = lines[row];
  const maxCol = getMaxAllowedCol(currentLine, mode);

  if (col > maxCol) {
    throw new VimInvariantViolationError(
      'COL_OVERFLOW',
      `${context}: cursor col ${col} exceeds max allowed ${maxCol} for mode '${mode}' on line ${row} (lineLen: ${currentLine.length}, content: '${currentLine}')`,
      key,
      prevState,
      nextState
    );
  }
}

/**
 * 상태 전이(state, key) => nextState 직후 모든 불변 조건을 검증하는 핵심 함수.
 */
export function assertValidVimState(
  prevState: VimEditorState,
  nextState: VimEditorState,
  key?: string
): void {
  if (!nextState || typeof nextState !== 'object') {
    throw new VimInvariantViolationError(
      'STATE_MISSING',
      `nextState must be a non-null object, received ${nextState}`,
      key,
      prevState,
      nextState
    );
  }

  // 1. 주 버퍼 & 커서 검증
  assertBufferAndCursor(
    nextState.lines,
    nextState.cursor,
    nextState.mode,
    'Main buffer',
    key,
    prevState,
    nextState
  );

  // 2. 분할 창(Split Panes)이 존재하는 경우 각 창 상태도 동일하게 검증
  if (nextState.splitPanes && Array.isArray(nextState.splitPanes)) {
    nextState.splitPanes.forEach((pane: SplitPaneState, idx: number) => {
      assertBufferAndCursor(
        pane.lines,
        pane.cursor,
        pane.mode,
        `Split pane [${idx}] (${pane.filename})`,
        key,
        prevState,
        nextState
      );
    });
  }

  // 3. Undo ('u') 검증 (NORMAL 모드에서 대기 키 없이 'u' 입력 시에만 실행됨)
  if (
    prevState.mode === 'NORMAL' &&
    !prevState.pendingKeys &&
    key === 'u' &&
    prevState.undoStack &&
    prevState.undoStack.length > 0
  ) {
    const topSnapshot = prevState.undoStack[prevState.undoStack.length - 1];
    if (topSnapshot && Array.isArray(topSnapshot.lines)) {
      // 버퍼 내용이 직전 스냅샷과 정확히 일치하는지 확인
      const sameLength = nextState.lines.length === topSnapshot.lines.length;
      const sameLines = sameLength && nextState.lines.every((line, i) => line === topSnapshot.lines[i]);
      if (!sameLines) {
        throw new VimInvariantViolationError(
          'UNDO_BUFFER_MISMATCH',
          `Undo result lines do not match snapshot lines (expected ${topSnapshot.lines.length} lines, got ${nextState.lines.length} lines)`,
          key,
          prevState,
          nextState
        );
      }
    }
  }

  // 4. 폴딩 상태(folds) 불변 조건 검증 (folds가 설정된 경우)
  if (nextState.folds !== undefined) {
    if (!Array.isArray(nextState.folds)) {
      throw new VimInvariantViolationError(
        'FOLDS_NOT_ARRAY',
        `folds must be an Array, received ${typeof nextState.folds}`,
        key,
        prevState,
        nextState
      );
    }
    for (let i = 0; i < nextState.folds.length; i++) {
      const f = nextState.folds[i];
      if (
        !f ||
        typeof f.startRow !== 'number' ||
        typeof f.endRow !== 'number' ||
        typeof f.closed !== 'boolean' ||
        f.startRow < 0 ||
        f.startRow > f.endRow ||
        f.endRow >= nextState.lines.length
      ) {
        throw new VimInvariantViolationError(
          'INVALID_FOLD_RANGE',
          `Fold at index ${i} has invalid range: startRow=${f?.startRow}, endRow=${f?.endRow}, closed=${f?.closed} (lines count: ${nextState.lines.length})`,
          key,
          prevState,
          nextState
        );
      }
    }
  }
}

/**
 * 함수형 Vim 엔진에 불변성 검증 및 Deep Freeze를 결합하는 미들웨어 래퍼
 */
export function withInvariantCheck<
  TFn extends (state: VimEditorState, key: string, ...rest: any[]) => VimEditorState
>(
  engineFn: TFn,
  options: { deepFreeze?: boolean } = { deepFreeze: true }
): TFn {
  return ((state: VimEditorState, key: string, ...rest: any[]): VimEditorState => {
    // 1. 원본 state 객체 직접 변이 방지를 위한 동결 (개발/테스트 모드)
    if (options.deepFreeze) {
      deepFreeze(state);
    }

    // 2. 순수 함수 상태 전이 실행
    const nextState = engineFn(state, key, ...rest);

    // 3. 불변 조건 검증
    assertValidVimState(state, nextState, key);

    return nextState;
  }) as TFn;
}
