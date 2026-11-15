import { VimEditorState } from './types';
import { getMaxCol } from './cursor';

/**
 * REPLACE (R) 모드 키 입력 처리:
 * 1:1 글자 덮어쓰기 및 Backspace 시 원본 글자 복원
 */
export function handleReplaceModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  _macroDepth = 0
): VimEditorState {
  if (key === 'Escape') {
    const curLine = state.lines[state.cursor.line] ?? '';
    const maxCol = getMaxCol(curLine, 'NORMAL');
    const newCol = Math.max(0, Math.min(state.cursor.col - 1, maxCol));
    const nextLastChange = state.currentChangeKeys ? [...state.currentChangeKeys, 'Escape'] : undefined;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: { line: state.cursor.line, col: newCol },
      replaceStack: undefined,
      currentChangeKeys: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : nextLastChange,
    };
  }

  if (key === 'Backspace') {
    const stack = state.replaceStack ?? [];
    if (stack.length === 0) {
      // 교체 모드 진입 지점 이전으로는 백스페이스 이동 불가
      return state;
    }
    const last = stack[stack.length - 1];
    const newStack = stack.slice(0, -1);
    const lineIdx = last.line;
    const curLine = state.lines[lineIdx] ?? '';
    let newLine: string;

    if (last.char === '') {
      // 줄 끝을 초과하여 덧붙여졌던 문자 삭제
      newLine = curLine.slice(0, last.col) + curLine.slice(last.col + 1);
    } else {
      // 덮어써졌던 원본 문자 복구
      newLine = curLine.slice(0, last.col) + last.char + curLine.slice(last.col + 1);
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Backspace'] : undefined;

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: last.col },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'Enter') {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const before = curLine.slice(0, col);
    const after = curLine.slice(col);
    const nextLines = [
      ...state.lines.slice(0, lineIdx),
      before,
      after,
      ...state.lines.slice(lineIdx + 1),
    ];
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Enter'] : undefined;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx + 1, col: 0 },
      replaceStack: [],
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'ArrowLeft') {
    return { ...state, cursor: { line: state.cursor.line, col: Math.max(0, state.cursor.col - 1) } };
  }
  if (key === 'ArrowRight') {
    return { ...state, cursor: { line: state.cursor.line, col: state.cursor.col + 1 } };
  }
  if (key === 'ArrowUp') {
    return { ...state, cursor: { line: Math.max(0, state.cursor.line - 1), col: state.cursor.col } };
  }
  if (key === 'ArrowDown') {
    return { ...state, cursor: { line: Math.min(state.lines.length - 1, state.cursor.line + 1), col: state.cursor.col } };
  }

  // 단일 입력 문자 1:1 덮어쓰기
  if (key.length === 1) {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const stack = state.replaceStack ?? [];

    let newLine: string;
    let oldChar = '';

    if (col < curLine.length) {
      oldChar = curLine[col];
      newLine = curLine.slice(0, col) + key + curLine.slice(col + 1);
    } else {
      const padding = ' '.repeat(col - curLine.length);
      newLine = curLine + padding + key;
      oldChar = '';
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const newStack = [...stack, { char: oldChar, line: lineIdx, col }];
    const nextChangeKeys = state.currentChangeKeys
      ? [...state.currentChangeKeys, key]
      : ['R', key];

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: col + 1 },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  return state;
}
