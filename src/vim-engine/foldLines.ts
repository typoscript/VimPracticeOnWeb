/**
 * 닫힌 폴드 위 줄 이동·`dd`/`yy`, 폴드 요약 문구, 줄 변경에 맞춘 폴드 이동.
 * 코어 파일만 import 하는 순수 함수이며 `folding.ts` 가 다시 export 합니다.
 */
import { FoldRange, VimEditorState } from './types';
import { deleteLine, yankLine } from './operators';

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
 * 순정 Vim 스타일의 폴드 요약 배너 텍스트 생성
 */
export function generateFoldText(lines: string[], fold: FoldRange): string {
  const count = fold.endRow - fold.startRow + 1;
  const firstLine = lines[fold.startRow] ?? '';
  const trimmed = firstLine.trim();
  const countStr = count < 10 ? ` ${count}` : `${count}`;
  return `+-- ${countStr} lines: ${trimmed} ----------------------------------------------------`.slice(0, 72);
}

/**
 * 버퍼 줄이 바뀐 뒤 폴드 범위를 따라 옮깁니다 (Vim 의 수동 폴드는 줄 삽입·삭제에 맞춰 이동).
 * 이전/이후 줄 배열의 공통 앞부분·뒷부분으로 바뀐 구간을 찾고,
 * 구간 뒤 폴드는 줄 수 차이만큼 이동, 구간과 겹치는 폴드는 줄이고, 줄이 모두 지워진 폴드는 없앱니다.
 */
export function adjustFoldsForLineChange(
  folds: FoldRange[],
  oldLines: string[],
  newLines: string[]
): FoldRange[] {
  const oldLen = oldLines.length;
  const newLen = newLines.length;
  let prefix = 0;
  while (prefix < oldLen && prefix < newLen && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldLen - prefix &&
    suffix < newLen - prefix &&
    oldLines[oldLen - 1 - suffix] === newLines[newLen - 1 - suffix]
  ) {
    suffix++;
  }
  const oldEnd = oldLen - suffix; // 바뀐 구간 [prefix, oldEnd) → [prefix, newEnd)
  const newEnd = newLen - suffix;
  const delta = newLen - oldLen;

  const mapRow = (row: number, isStart: boolean): number => {
    if (row < prefix) return row;
    if (row >= oldEnd) return row + delta;
    // 바뀐 구간 안: 시작은 구간 시작으로, 끝은 새 구간의 마지막 줄로
    return isStart ? prefix : newEnd - 1;
  };

  const result: FoldRange[] = [];
  for (const f of folds) {
    const fullyDeleted = f.startRow >= prefix && f.endRow < oldEnd && newEnd <= prefix;
    if (fullyDeleted) continue;
    const startRow = Math.max(0, mapRow(f.startRow, true));
    const endRow = Math.min(newLen - 1, mapRow(f.endRow, false));
    if (startRow > endRow) continue;
    result.push(startRow === f.startRow && endRow === f.endRow ? f : { ...f, startRow, endRow });
  }
  return result;
}
