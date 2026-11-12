import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';
import {
  moveToFirstNonBlank,
  moveToNextWord,
  moveToNextWORD,
  moveToWordEnd,
  moveToWORDEnd,
  moveToPrevWord,
  moveToPrevWORD,
  moveToLineStart,
  moveToLineEnd,
  moveToFirstLine,
  moveToLastLine,
} from './motions';
import { isPositionSelected } from './visual';

/**
 * J / gJ: 현재 줄과 아랫줄을 이어 붙입니다.
 * [count]J 지원 (예: 3J -> 현재 줄 포함 3개 줄 연결)
 * insertSpace = false (gJ): 공백을 삽입하지 않고 뒷줄의 들여쓰기를 제거하여 딱 붙임
 */
export function joinLines(state: VimEditorState, count = 1, insertSpace = true): VimEditorState {
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
    if (!insertSpace) {
      if (i === currentLineIdx + 1) firstJoinCol = currentJoined.length;
      currentJoined += nextLineTrimmed;
    } else {
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
  }

  const newLines = [
    ...state.lines.slice(0, currentLineIdx),
    currentJoined,
    ...state.lines.slice(maxJoinLine + 1),
  ];

  const targetCol = Math.max(0, Math.min(firstJoinCol, Math.max(0, currentJoined.length - 1)));

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: currentLineIdx, col: targetCol },
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

/** 대소문자 연산자: gu(소문자) gU(대문자) g~(반전) g?(ROT13) */
export type CaseOperator = 'gu' | 'gU' | 'g~' | 'g?';
export type CaseType = 'toggle' | 'lower' | 'upper' | 'rot13';

export function caseTypeForOperator(op: CaseOperator): CaseType {
  return op === 'g~' ? 'toggle' : op === 'gu' ? 'lower' : op === 'gU' ? 'upper' : 'rot13';
}

/** ROT13: 영문자를 알파벳 순서로 13칸 돌립니다 (그 밖의 문자는 그대로) */
function rot13(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
  if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
  return ch;
}

/**
 * VISUAL 모드 대소문자 변환:
 * ~ (대소문자 반전), u (모두 소문자), U (모두 대문자)
 */
export function changeCaseVisual(
  state: VimEditorState,
  type: CaseType
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
        } else if (type === 'rot13') {
          chars[c] = rot13(ch);
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
 * 모션 또는 라인 단위 대소문자 변환을 실행합니다. (gu, gU, g~)
 */
export function executeCaseMotion(
  state: VimEditorState,
  op: CaseOperator,
  motionKey: string,
  count = 1
): VimEditorState {
  const caseType = caseTypeForOperator(op);

  // 1. 라인 단위 변환 (guu, gUU, g~~, g??, gugu, gUgU, g~g~, g?g?)
  if (
    (op === 'gu' && (motionKey === 'u' || motionKey === 'g')) ||
    (op === 'gU' && (motionKey === 'U' || motionKey === 'g')) ||
    (op === 'g~' && (motionKey === '~' || motionKey === 'g')) ||
    (op === 'g?' && (motionKey === '?' || motionKey === 'g'))
  ) {
    const endLine = Math.min(state.lines.length - 1, state.cursor.line + count - 1);
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: state.cursor.line, col: 0 },
      cursor: { line: endLine, col: 0 },
    };
    return changeCaseVisual(visualState, caseType);
  }

  // 2. 모션에 따른 대상 좌표 계산
  let target = state.cursor;
  let isLinewise = false;

  if (motionKey === 'w') {
    for (let i = 0; i < count; i++) target = moveToNextWord(state.lines, target);
  } else if (motionKey === 'W') {
    for (let i = 0; i < count; i++) target = moveToNextWORD(state.lines, target);
  } else if (motionKey === 'e') {
    for (let i = 0; i < count; i++) target = moveToWordEnd(state.lines, target);
  } else if (motionKey === 'E') {
    for (let i = 0; i < count; i++) target = moveToWORDEnd(state.lines, target);
  } else if (motionKey === 'b') {
    for (let i = 0; i < count; i++) target = moveToPrevWord(state.lines, target);
  } else if (motionKey === 'B') {
    for (let i = 0; i < count; i++) target = moveToPrevWORD(state.lines, target);
  } else if (motionKey === '$') {
    target = moveToLineEnd(state.lines, target);
  } else if (motionKey === '0') {
    target = moveToLineStart(state.lines, target);
  } else if (motionKey === '^') {
    target = moveToFirstNonBlank(state.lines, target);
  } else if (motionKey === 'G') {
    target = moveToLastLine(state.lines, target);
    isLinewise = true;
  } else if (motionKey === 'gg') {
    target = moveToFirstLine(state.lines, target);
    isLinewise = true;
  } else if (motionKey === 'j') {
    target = { line: Math.min(state.lines.length - 1, state.cursor.line + count), col: state.cursor.col };
    isLinewise = true;
  } else if (motionKey === 'k') {
    target = { line: Math.max(0, state.cursor.line - count), col: state.cursor.col };
    isLinewise = true;
  } else if (motionKey === 'h') {
    target = { line: state.cursor.line, col: Math.max(0, state.cursor.col - count) };
  } else if (motionKey === 'l') {
    const curLine = state.lines[state.cursor.line] ?? '';
    target = { line: state.cursor.line, col: Math.min(curLine.length, state.cursor.col + count) };
  } else {
    return { ...state, pendingKeys: undefined };
  }

  if (isLinewise) {
    const minLine = Math.min(state.cursor.line, target.line);
    const maxLine = Math.max(state.cursor.line, target.line);
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: minLine, col: 0 },
      cursor: { line: maxLine, col: 0 },
    };
    return changeCaseVisual(visualState, caseType);
  }

  let start = state.cursor;
  let end = target;
  if (start.line > end.line || (start.line === end.line && start.col > end.col)) {
    const tmp = start;
    start = end;
    end = tmp;
  } else if (motionKey === 'w' || motionKey === 'W') {
    if (end.col > 0 && end.line === start.line) {
      end = { line: end.line, col: end.col - 1 };
    }
  }

  const visualState: VimEditorState = {
    ...state,
    mode: 'VISUAL',
    visualAnchor: start,
    cursor: end,
  };
  return changeCaseVisual(visualState, caseType);
}

/**
 * >> / <<: 현재 줄 및 count개 줄 들여쓰기 / 내어쓰기 (shiftwidth / expandtab 설정 반영)
 */
export function indentLines(
  state: VimEditorState,
  count = 1,
  direction: 'in' | 'out'
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);

  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const et = opts.expandtab !== false;
  const indentStr = et ? ' '.repeat(sw) : '\t';

  const newLines = [...state.lines];
  for (let i = startLine; i <= endLine; i++) {
    const line = newLines[i];
    if (direction === 'in') {
      // Vim 은 빈 줄을 들여쓰지 않습니다
      if (line.length > 0) newLines[i] = indentStr + line;
    } else {
      if (line.startsWith(indentStr)) {
        newLines[i] = line.slice(indentStr.length);
      } else if (line.startsWith('\t')) {
        newLines[i] = line.slice(1);
      } else if (line.startsWith(' ')) {
        let spaces = 0;
        while (spaces < sw && line[spaces] === ' ') {
          spaces++;
        }
        newLines[i] = line.slice(spaces);
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

  const opts = getOptions(state);
  const sw = opts.shiftwidth || 2;
  const et = opts.expandtab !== false;
  const indentStr = et ? ' '.repeat(sw) : '\t';

  const newLines = [...state.lines];
  for (let i = minLine; i <= maxLine; i++) {
    const line = newLines[i];
    if (direction === 'in') {
      newLines[i] = indentStr + line;
    } else {
      if (line.startsWith(indentStr)) {
        newLines[i] = line.slice(indentStr.length);
      } else if (line.startsWith('\t')) {
        newLines[i] = line.slice(1);
      } else if (line.startsWith(' ')) {
        let spaces = 0;
        while (spaces < sw && line[spaces] === ' ') {
          spaces++;
        }
        newLines[i] = line.slice(spaces);
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
 * 코드 전체 문맥의 중괄호({}) 블록 깊이를 계산하여指定된 줄 범위의 들여쓰기를 2 spaces 단위로 맞춥니다.
 */
export function formatLinesRange(
  lines: string[],
  fromLine: number,
  toLine: number
): string[] {
  const minLine = Math.max(0, Math.min(fromLine, toLine));
  const maxLine = Math.min(lines.length - 1, Math.max(fromLine, toLine));
  const newLines = [...lines];

  let currentIndentDepth = 0;

  for (let i = 0; i <= maxLine; i++) {
    const lineText = newLines[i];
    const trimmed = lineText.trim();

    if (trimmed.length === 0) {
      if (i >= minLine) {
        newLines[i] = '';
      }
      continue;
    }

    // 현재 행이 닫는 괄호(}, ), ]) 또는 닫는 태그(</)로 시작하면 해당 행 자체의 들여쓰기를 먼저 1단계 줄임
    let leadingCloses = 0;
    if (trimmed.startsWith('</')) {
      leadingCloses = 1;
    } else {
      for (const ch of trimmed) {
        if (ch === '}' || ch === ')' || ch === ']') {
          leadingCloses++;
        } else {
          break;
        }
      }
    }

    const effectiveDepth = Math.max(0, currentIndentDepth - leadingCloses);

    if (i >= minLine) {
      newLines[i] = '  '.repeat(effectiveDepth) + trimmed;
    }

    // 문자열 리터럴 내부를 제외한 중괄호/괄호/HTML태그 변화량을 계산하여 다음 줄 들여쓰기 갱신
    let inQuote: string | null = null;
    let netBrackets = 0;
    for (let c = 0; c < trimmed.length; c++) {
      const ch = trimmed[c];
      if (inQuote) {
        if (ch === inQuote && trimmed[c - 1] !== '\\') {
          inQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          inQuote = ch;
        } else if (ch === '{' || ch === '(' || ch === '[') {
          netBrackets++;
        } else if (ch === '}' || ch === ')' || ch === ']') {
          netBrackets--;
        }
      }
    }

    // HTML / JSX 태그 변화량 계산 (문자열 밖)
    let netTags = 0;
    const tagRegex = /<(\/)?([a-zA-Z0-9_\-.:]+)((?:[^>"'`]|"[^"]*"|'[^']*'|`[^`]*`)*)(\/?)>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRegex.exec(trimmed)) !== null) {
      const isClose = tm[1] === '/';
      const isSelf = !isClose && (tm[4] === '/' || (tm[3] ?? '').trim().endsWith('/'));
      if (isClose) {
        netTags--;
      } else if (!isSelf) {
        netTags++;
      }
    }

    currentIndentDepth = Math.max(0, currentIndentDepth + netBrackets + netTags);
  }

  return newLines;
}

/**
 * 지정된 행 범위 [startLine, endLine]에 대해 들여쓰기를 자동 정렬하고 실행 취소 스냅샷을 푸시합니다.
 */
export function formatIndentRange(
  state: VimEditorState,
  startLine: number,
  endLine: number
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const minLine = Math.max(0, Math.min(startLine, endLine));
  const maxLine = Math.min(state.lines.length - 1, Math.max(startLine, endLine));
  const newLines = formatLinesRange(state.lines, minLine, maxLine);
  const newCursor = moveToFirstNonBlank(newLines, { line: minLine, col: 0 });

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
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
  const startLine = state.cursor.line;
  const endLine = Math.min(state.lines.length - 1, startLine + Math.max(1, count) - 1);
  return formatIndentRange(state, startLine, endLine);
}

/**
 * VISUAL 모드 =: 선택 영역 들여쓰기 자동 정렬
 */
export function formatIndentVisual(state: VimEditorState): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const minLine = Math.min(state.visualAnchor.line, state.cursor.line);
  const maxLine = Math.max(state.visualAnchor.line, state.cursor.line);
  const res = formatIndentRange(state, minLine, maxLine);

  return {
    ...res,
    mode: 'NORMAL',
    visualAnchor: undefined,
  };
}

/**
 * VISUAL 모드 Ctrl+a / Ctrl+x 및 g Ctrl+a / g Ctrl+x:
 * 선택된 행들(또는 VISUAL_BLOCK 영역) 내의 숫자를 일괄 증가/감소하거나
 * 계단식(Sequential)으로 +1, +2, +3... 순차 증가/감소합니다.
 */
export function modifyNumberVisual(
  state: VimEditorState,
  isIncrement: boolean,
  isSequential: boolean,
  count = 1
): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const anchor = state.visualAnchor;
  const cursor = state.cursor;
  const mode = state.mode;

  const minLine = Math.min(anchor.line, cursor.line);
  const maxLine = Math.max(anchor.line, cursor.line);
  const minCol = Math.min(anchor.col, cursor.col);
  const maxCol = Math.max(anchor.col, cursor.col);

  const stateWithUndo = pushUndoSnapshot(state);
  const newLines = [...state.lines];
  let stepIndex = 0;

  for (let l = minLine; l <= maxLine; l++) {
    const lineStr = newLines[l];
    const regex = /-?\d+/g;
    let match: RegExpExecArray | null = null;
    let targetMatch: { start: number; end: number; value: number } | null = null;

    while ((match = regex.exec(lineStr)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      let isSelected = false;
      if (mode === 'VISUAL_BLOCK') {
        // VISUAL_BLOCK: 숫자의 적어도 한 문자가 [minCol, maxCol] 컬럼 범위 안에 걸쳐 있어야 함
        if (start <= maxCol && end - 1 >= minCol) {
          isSelected = true;
        }
      } else if (mode === 'VISUAL_LINE') {
        // VISUAL_LINE: 해당 줄 전체가 선택 영역이므로 줄의 첫 번째 숫자가 타겟
        isSelected = true;
      } else {
        // 일반 VISUAL: 숫자의 적어도 한 글자가 visual 선택 영역 안에 포함되는지 검사
        for (let c = start; c < end; c++) {
          if (isPositionSelected(l, c, anchor, cursor, mode)) {
            isSelected = true;
            break;
          }
        }
      }

      if (isSelected) {
        targetMatch = {
          start,
          end,
          value: parseInt(match[0], 10),
        };
        break; // 줄 당 첫 번째 매칭 숫자만 변경
      }
    }

    if (targetMatch) {
      stepIndex++;
      const multiplier = isSequential ? stepIndex * count : count;
      const delta = isIncrement ? multiplier : -multiplier;
      const newValue = targetMatch.value + delta;
      const newNumStr = String(newValue);

      const before = lineStr.slice(0, targetMatch.start);
      const after = lineStr.slice(targetMatch.end);
      newLines[l] = before + newNumStr + after;
    }
  }

  // Visual 모드 종료 후 커서는 선택 영역의 시작점으로 복귀
  const startLine = minLine;
  const startCol =
    mode === 'VISUAL_BLOCK'
      ? minCol
      : anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
      ? anchor.col
      : cursor.col;

  const finalCol = Math.max(0, Math.min(startCol, Math.max(0, (newLines[startLine] ?? '').length - 1)));

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: { line: startLine, col: finalCol },
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: undefined,
    lastVisualSelection: {
      mode: state.mode as 'VISUAL' | 'VISUAL_LINE' | 'VISUAL_BLOCK',
      anchor: { ...anchor },
      cursor: { ...cursor },
    },
  };
}
