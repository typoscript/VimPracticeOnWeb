import { VimEditorState } from '../types/vim';
import { pushUndoSnapshot } from './operators';
import { moveToFirstNonBlank } from './motions';
import { isPositionSelected } from './visual';

/**
 * J: 현재 줄과 아랫줄을 공백 하나를 두고 이어 붙입니다.
 * [count]J 지원 (예: 3J -> 현재 줄 포함 3개 줄 연결)
 */
export function joinLines(state: VimEditorState, count = 1): VimEditorState {
  if (state.lines.length <= 1 || state.cursor.line >= state.lines.length - 1) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const currentLineIdx = state.cursor.line;
  const joinCount = Math.max(1, count);
  const maxJoinLine = Math.min(state.lines.length - 1, currentLineIdx + joinCount);

  let currentJoined = state.lines[currentLineIdx];
  let firstJoinCol = currentJoined.length;

  for (let i = currentLineIdx + 1; i <= maxJoinLine; i++) {
    const nextLineTrimmed = (state.lines[i] ?? '').trimStart();
    if (currentJoined.length === 0) {
      currentJoined = nextLineTrimmed;
      if (i === currentLineIdx + 1) firstJoinCol = 0;
    } else if (currentJoined.endsWith(' ')) {
      if (i === currentLineIdx + 1) firstJoinCol = currentJoined.length - 1;
      currentJoined += nextLineTrimmed;
    } else {
      if (i === currentLineIdx + 1) firstJoinCol = currentJoined.length;
      currentJoined += ' ' + nextLineTrimmed;
    }
  }

  const newLines = [
    ...state.lines.slice(0, currentLineIdx),
    currentJoined,
    ...state.lines.slice(maxJoinLine + 1),
  ];

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: currentLineIdx, col: Math.max(0, Math.min(firstJoinCol, Math.max(0, currentJoined.length - 1))) },
    pendingKeys: undefined,
  };
}

/**
 * ~: 커서 위치 문자의 대소문자를 반전하고 오른쪽으로 한 칸 이동합니다.
 */
export function toggleCaseChar(state: VimEditorState, count = 1): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const col = state.cursor.col;
  const chars = currentLine.split('');
  const repeat = Math.min(Math.max(1, count), chars.length - col);

  for (let i = 0; i < repeat; i++) {
    const idx = col + i;
    const ch = chars[idx];
    if (ch === ch.toUpperCase()) {
      chars[idx] = ch.toLowerCase();
    } else {
      chars[idx] = ch.toUpperCase();
    }
  }

  const newLines = [...state.lines];
  newLines[state.cursor.line] = chars.join('');
  const newCol = Math.min(col + repeat, Math.max(0, chars.length - 1));

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: state.cursor.line, col: newCol },
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드 대소문자 변환:
 * ~ (대소문자 반전), u (모두 소문자), U (모두 대문자)
 */
export function changeCaseVisual(
  state: VimEditorState,
  type: 'toggle' | 'lower' | 'upper'
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const mode = state.mode;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);

  const newLines = [...state.lines];

  for (let l = minLine; l <= maxLine; l++) {
    const lineStr = newLines[l];
    const chars = lineStr.split('');

    for (let c = 0; c < chars.length; c++) {
      if (isPositionSelected(l, c, anchor, cursor, mode)) {
        const ch = chars[c];
        if (type === 'toggle') {
          chars[c] = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
        } else if (type === 'lower') {
          chars[c] = ch.toLowerCase();
        } else if (type === 'upper') {
          chars[c] = ch.toUpperCase();
        }
      }
    }

    newLines[l] = chars.join('');
  }

  const startCursor = anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
    ? anchor
    : cursor;

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { ...startCursor },
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };
}

/**
 * >> / <<: 현재 줄 및 count개 줄 들여쓰기 / 내어쓰기 (공백 2칸 기준)
 */
export function indentLines(
  state: VimEditorState,
  count = 1,
  direction: 'in' | 'out'
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);

  const newLines = [...state.lines];
  for (let i = startLine; i <= endLine; i++) {
    const line = newLines[i];
    if (direction === 'in') {
      newLines[i] = '  ' + line;
    } else {
      if (line.startsWith('  ')) {
        newLines[i] = line.slice(2);
      } else if (line.startsWith(' ') || line.startsWith('\t')) {
        newLines[i] = line.slice(1);
      }
    }
  }

  const newCursor = moveToFirstNonBlank(newLines, { line: startLine, col: 0 });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드 > / <: 선택된 모든 행 들여쓰기 / 내어쓰기
 */
export function indentVisual(
  state: VimEditorState,
  direction: 'in' | 'out'
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
  const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);

  const newLines = [...state.lines];
  for (let i = minLine; i <= maxLine; i++) {
    const line = newLines[i];
    if (direction === 'in') {
      newLines[i] = '  ' + line;
    } else {
      if (line.startsWith('  ')) {
        newLines[i] = line.slice(2);
      } else if (line.startsWith(' ') || line.startsWith('\t')) {
        newLines[i] = line.slice(1);
      }
    }
  }

  const newCursor = moveToFirstNonBlank(newLines, { line: minLine, col: 0 });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };
}

/**
 * Ctrl+a / Ctrl+x: 커서 위치 또는 커서 오른쪽에서 가장 가까운 정수를 찾아 증감
 * (음수 지원, [count] 결합 지원)
 */
export function modifyNumberAtCursor(
  state: VimEditorState,
  delta: number
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const col = state.cursor.col;

  // 정수 패턴 (선택적 마이너스 기호 포함)
  const regex = /-?\d+/g;
  let match: RegExpExecArray | null = null;
  let targetMatch: { start: number; end: number; value: number } | null = null;

  while ((match = regex.exec(currentLine)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    // 커서가 숫자 위에 있거나, 커서 오른쪽에 있는 첫 번째 숫자
    if (end > col || start >= col) {
      targetMatch = {
        start,
        end,
        value: parseInt(match[0], 10),
      };
      break;
    }
  }

  if (!targetMatch) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const newValue = targetMatch.value + delta;
  const newStr = String(newValue);

  const before = currentLine.slice(0, targetMatch.start);
  const after = currentLine.slice(targetMatch.end);
  const updatedLine = before + newStr + after;

  const newLines = [...state.lines];
  newLines[state.cursor.line] = updatedLine;

  // 커서를 변경된 숫자의 마지막 자리로 이동
  const newCol = Math.max(0, before.length + newStr.length - 1);

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: state.cursor.line, col: newCol },
    pendingKeys: undefined,
  };
}

/**
 * ==: 현재 줄(및 count개 줄) 들여쓰기 자동 정렬
 */
export function formatIndentLines(
  state: VimEditorState,
  count = 1
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);
  const newLines = [...state.lines];

  for (let i = startLine; i <= endLine; i++) {
    let depth = 0;
    for (let prev = 0; prev < i; prev++) {
      const pText = newLines[prev];
      for (const ch of pText) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      }
    }
    const currentText = newLines[i].trimStart();
    if (currentText.startsWith('}') || currentText.startsWith(')') || currentText.startsWith(']')) {
      depth = Math.max(0, depth - 1);
    }
    const indent = '  '.repeat(depth);
    newLines[i] = currentText.length > 0 ? indent + currentText : '';
  }

  const newCursor = moveToFirstNonBlank(newLines, { line: startLine, col: 0 });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    pendingKeys: undefined,
  };
}

/**
 * VISUAL 모드 =: 선택 영역 들여쓰기 자동 정렬
 */
export function formatIndentVisual(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
  const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
  const newLines = [...state.lines];

  for (let i = minLine; i <= maxLine; i++) {
    let depth = 0;
    for (let prev = 0; prev < i; prev++) {
      const pText = newLines[prev];
      for (const ch of pText) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      }
    }
    const currentText = newLines[i].trimStart();
    if (currentText.startsWith('}') || currentText.startsWith(')') || currentText.startsWith(']')) {
      depth = Math.max(0, depth - 1);
    }
    const indent = '  '.repeat(depth);
    newLines[i] = currentText.length > 0 ? indent + currentText : '';
  }

  const newCursor = moveToFirstNonBlank(newLines, { line: minLine, col: 0 });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
  };
}
