import { VimEditorState } from './types';
import { clampCursor, getMaxCol } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getOptions, parseWhichwrapFlags } from './setOptionsCore';

function visualColAt(line: string, col: number, tabstop: number): number {
  let vcol = 0;
  for (let i = 0; i < col && i < line.length; i++) {
    vcol += line[i] === '\t' ? tabstop - (vcol % tabstop) : 1;
  }
  return vcol;
}

/**
 * 한 문자를 Virtual Replace 규칙으로 덮어씁니다 (탭 폭 보존).
 * 탭의 화면 너비가 2 이상이면 문자를 탭 앞에 삽입해 뒤쪽 문자의 화면 열 위치를 유지합니다.
 */
function applyVirtualReplaceSingle(
  line: string,
  col: number,
  ch: string,
  tabstop: number
): { newLine: string; nextCol: number } {
  const ts = Math.max(1, tabstop);
  if (ch === '\t') {
    const startVcol = visualColAt(line, col, ts);
    const targetVcol = startVcol + (ts - (startVcol % ts));
    let endIdx = col;
    let curV = startVcol;
    while (endIdx < line.length && curV < targetVcol) {
      const c = line[endIdx];
      const w = c === '\t' ? ts - (curV % ts) : 1;
      curV += w;
      endIdx++;
    }
    const extraSpaces = curV > targetVcol ? ' '.repeat(curV - targetVcol) : '';
    const newLine = line.slice(0, col) + '\t' + extraSpaces + line.slice(endIdx);
    return { newLine, nextCol: col + 1 };
  }

  if (col >= line.length) {
    const padding = ' '.repeat(col - line.length);
    return { newLine: line + padding + ch, nextCol: col + 1 };
  }

  const existing = line[col];
  if (existing === '\t') {
    const vcol = visualColAt(line, col, ts);
    const tabWidth = ts - (vcol % ts);
    if (tabWidth > 1) {
      // 탭이 아직 화면 열을 남기고 있으므로 새 문자를 탭 앞에 삽입하여 뒤 텍스트의 화면 열 유지
      const newLine = line.slice(0, col) + ch + line.slice(col);
      return { newLine, nextCol: col + 1 };
    }
    // 탭의 마지막 화면 열을 채웠으므로 탭 자체를 교체
    const newLine = line.slice(0, col) + ch + line.slice(col + 1);
    return { newLine, nextCol: col + 1 };
  }

  const newLine = line.slice(0, col) + ch + line.slice(col + 1);
  return { newLine, nextCol: col + 1 };
}

/**
 * [count]gr{char}: 화면 레이아웃(탭 폭)을 보존하며 count개 문자를 교체합니다.
 */
export function virtualReplaceChar(
  state: VimEditorState,
  char: string,
  count = 1
): VimEditorState | null {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  if (currentLine.length === 0) return null;

  const opts = getOptions(state);
  const ts = Math.max(1, opts.tabstop || 8);
  const n = Math.max(1, count);

  // 교체 대상의 남은 화면 열이 count보다 작으면 실패 (bell)
  const startVcol = visualColAt(currentLine, col, ts);
  const endVcol = visualColAt(currentLine, currentLine.length, ts);
  if (endVcol - startVcol < n) {
    return null;
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  let curLine = currentLine;
  let curCol = col;
  const replaceCh = char === 'Tab' ? '\t' : char;

  for (let i = 0; i < n; i++) {
    const res = applyVirtualReplaceSingle(curLine, curCol, replaceCh, ts);
    curLine = res.newLine;
    curCol = res.nextCol;
  }

  const nextLines = [...state.lines];
  nextLines[line] = curLine;
  const finalCol = Math.max(0, curCol - 1);

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line, col: finalCol }, 'NORMAL'),
    pendingKeys: undefined,
  };
}

/**
 * REPLACE (R) / Virtual Replace (gR) 모드 키 입력 처리:
 * 1:1 글자 덮어쓰기(또는 탭 폭 보존 가상 덮어쓰기) 및 Backspace 시 원본 복원
 */
export function handleReplaceModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  _macroDepth = 0
): VimEditorState {
  if (state.insertRepeatCount && (key.length === 1 || key === 'Backspace' || key === 'Enter')) {
    const next = handleReplaceModeKeyInner(state, key, isReplayingDot);
    return { ...next, replaceTypedKeys: [...(state.replaceTypedKeys ?? []), key] };
  }
  return handleReplaceModeKeyInner(state, key, isReplayingDot);
}

function handleReplaceModeKeyInner(state: VimEditorState, key: string, isReplayingDot: boolean): VimEditorState {
  const isVirtual = Boolean(state.virtualReplace);

  if (key === 'Escape') {
    const repeat = state.insertRepeatCount ?? 1;
    if (repeat > 1 && !isVirtual) {
      // Vim 처럼 입력한 키(Backspace 포함)를 count-1 번 더 재생합니다. 실행 중인 변경 키 기록은 그대로 둡니다.
      const typed = state.replaceTypedKeys ?? [];
      let s: VimEditorState = { ...state, insertRepeatCount: undefined };
      for (let i = 1; i < repeat; i++) for (const k of typed) s = { ...handleReplaceModeKey(s, k, true), currentChangeKeys: state.currentChangeKeys };
      return handleReplaceModeKey(s, 'Escape', isReplayingDot);
    }
    const curLine = state.lines[state.cursor.line] ?? '';
    const maxCol = getMaxCol(curLine, 'NORMAL');
    const newCol = Math.max(0, Math.min(state.cursor.col - 1, maxCol));
    const nextLastChange = state.currentChangeKeys ? [...state.currentChangeKeys, 'Escape'] : undefined;
    // 입력 모드처럼 Esc 위치를 '^ 마크·gi 위치로 남깁니다.
    const { line, col } = state.cursor;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: { line: state.cursor.line, col: newCol },
      lastInsertPos: { line, col, row: line },
      marks: { ...(state.marks ?? {}), '^': { row: line, col } },
      replaceStack: undefined,
      virtualReplace: undefined,
      insertRepeatCount: undefined,
      replaceTypedKeys: undefined,
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

    if (last.prevLine !== undefined) {
      newLine = last.prevLine;
    } else if (last.char === '') {
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
    if (state.cursor.col > 0) {
      return { ...state, cursor: { line: state.cursor.line, col: state.cursor.col - 1 } };
    }
    if (state.cursor.line > 0 && parseWhichwrapFlags(getOptions(state).whichwrap).has('[')) {
      const prevLine = state.lines[state.cursor.line - 1] ?? '';
      return { ...state, cursor: { line: state.cursor.line - 1, col: prevLine.length } };
    }
    return { ...state, cursor: { line: state.cursor.line, col: 0 } };
  }
  if (key === 'ArrowRight') {
    const curLine = state.lines[state.cursor.line] ?? '';
    if (
      state.cursor.col >= curLine.length &&
      state.cursor.line < state.lines.length - 1 &&
      parseWhichwrapFlags(getOptions(state).whichwrap).has(']')
    ) {
      return { ...state, cursor: { line: state.cursor.line + 1, col: 0 } };
    }
    return { ...state, cursor: { line: state.cursor.line, col: state.cursor.col + 1 } };
  }
  if (key === 'ArrowUp') {
    return { ...state, cursor: { line: Math.max(0, state.cursor.line - 1), col: state.cursor.col } };
  }
  if (key === 'ArrowDown') {
    return { ...state, cursor: { line: Math.min(state.lines.length - 1, state.cursor.line + 1), col: state.cursor.col } };
  }

  // 단일 입력 문자 또는 Tab 덮어쓰기
  if (key.length === 1 || (isVirtual && key === 'Tab')) {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const stack = state.replaceStack ?? [];
    const defaultStart = isVirtual ? ['g', 'R'] : ['R'];
    const nextChangeKeys = state.currentChangeKeys
      ? [...state.currentChangeKeys, key]
      : [...defaultStart, key];

    if (isVirtual) {
      const ts = Math.max(1, getOptions(state).tabstop || 8);
      const ch = key === 'Tab' ? '\t' : key;
      const { newLine, nextCol } = applyVirtualReplaceSingle(curLine, col, ch, ts);
      const nextLines = [...state.lines];
      nextLines[lineIdx] = newLine;
      const newStack = [...stack, { char: curLine[col] ?? '', line: lineIdx, col, prevLine: curLine }];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: lineIdx, col: nextCol },
        replaceStack: newStack,
        currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
      };
    }

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
