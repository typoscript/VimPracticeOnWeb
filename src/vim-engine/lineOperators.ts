import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { getOptions } from './setEngine';
import { parseWhichwrapFlags, hasFormatOption, extractCommentPrefix } from './setOptionsCore';
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
export { modifyNumberAtCursor, modifyNumberVisual } from './numberOperators';

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
  const stripCommentLeader = insertSpace && hasFormatOption(getOptions(state), 'j');
  const baseComment = stripCommentLeader ? extractCommentPrefix(currentJoined) : null;

  for (let i = currentLineIdx + 1; i <= maxJoinLine; i++) {
    const rawNext = state.lines[i] ?? '';
    let nextLineTrimmed = rawNext.trimStart();
    if (stripCommentLeader && baseComment) {
      const nextComment = extractCommentPrefix(rawNext);
      const compatibleLeader =
        nextComment &&
        (nextComment.leader === baseComment.leader ||
          (baseComment.leader === '/*' && nextComment.leader === '*'));
      if (compatibleLeader) {
        nextLineTrimmed = rawNext.slice(
          nextComment.indent.length + nextComment.leader.length + nextComment.ws.length
        );
      }
    }
    if (!insertSpace) {
      if (i === currentLineIdx + 1) firstJoinCol = currentJoined.length;
      currentJoined += nextLineTrimmed;
    } else {
      if (currentJoined.length === 0) {
        currentJoined = nextLineTrimmed;
        if (i === currentLineIdx + 1) firstJoinCol = 0;
      } else if (nextLineTrimmed.length === 0) {
        if (i === currentLineIdx + 1) firstJoinCol = currentJoined.length;
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
  const wwTilde = parseWhichwrapFlags(getOptions(state).whichwrap).has('~');
  if (currentLine.length === 0) {
    if (wwTilde && state.cursor.line < state.lines.length - 1) {
      return {
        ...state,
        cursor: { line: state.cursor.line + 1, col: 0 },
        pendingKeys: undefined,
      };
    }
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
  const wrappedToNext =
    wwTilde && col + repeat >= chars.length && state.cursor.line < state.lines.length - 1;
  const newCursor = wrappedToNext
    ? { line: state.cursor.line + 1, col: 0 }
    : { line: state.cursor.line, col: Math.min(col + repeat, Math.max(0, chars.length - 1)) };

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: newCursor,
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
 * 단일 줄에 들여쓰기/내어쓰기를 적용합니다. shiftround 옵션이 켜져 있으면 shiftwidth 배수로 정렬합니다.
 */
export function shiftLineIndent(
  line: string,
  direction: 'in' | 'out',
  sw: number,
  ts: number,
  et: boolean,
  shiftround: boolean,
  times = 1
): string {
  const unit = et ? ' '.repeat(sw) : '\t';
  if (direction === 'in' && line.length === 0) return line;

  if (shiftround) {
    let idx = 0;
    let curWidth = 0;
    while (idx < line.length) {
      const ch = line[idx];
      if (ch === ' ') {
        curWidth += 1;
        idx++;
      } else if (ch === '\t') {
        curWidth += ts - (curWidth % ts);
        idx++;
      } else {
        break;
      }
    }
    const body = line.slice(idx);
    const nextWidth =
      direction === 'in'
        ? (Math.floor(curWidth / sw) + times) * sw
        : Math.max(0, (Math.ceil(curWidth / sw) - times) * sw);
    const rebuiltIndent = et
      ? ' '.repeat(nextWidth)
      : '\t'.repeat(Math.floor(nextWidth / ts)) + ' '.repeat(nextWidth % ts);
    return rebuiltIndent + body;
  }

  let res = line;
  if (direction === 'in') {
    res = unit.repeat(times) + res;
  } else {
    for (let t = 0; t < times; t++) {
      if (res.startsWith(unit)) {
        res = res.slice(unit.length);
      } else if (res.startsWith('\t')) {
        res = res.slice(1);
      } else if (res.startsWith(' ')) {
        let spaces = 0;
        while (spaces < sw && res[spaces] === ' ') {
          spaces++;
        }
        res = res.slice(spaces);
      }
    }
  }
  return res;
}

/**
 * >> / <<: 현재 줄 및 count개 줄 들여쓰기 / 내어쓰기 (shiftwidth / expandtab / shiftround 설정 반영)
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
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);

  const newLines = [...state.lines];
  for (let i = startLine; i <= endLine; i++) {
    newLines[i] = shiftLineIndent(newLines[i], direction, sw, ts, et, sr, 1);
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
  const ts = opts.tabstop || sw;
  const et = opts.expandtab !== false;
  const sr = Boolean(opts.shiftround);
  const indentStr = et ? ' '.repeat(sw) : '\t';

  const newLines = [...state.lines];
  if (state.mode === 'VISUAL_BLOCK') {
    const minCol = Math.min(state.visualAnchor.col, state.cursor.col);
    for (let i = minLine; i <= maxLine; i++) {
      const line = newLines[i];
      if (line.length <= minCol) continue;
      const prefix = line.slice(0, minCol);
      const rest = line.slice(minCol);
      if (direction === 'in') {
        if (rest.length > 0) newLines[i] = prefix + indentStr + rest;
      } else {
        if (rest.startsWith(indentStr)) {
          newLines[i] = prefix + rest.slice(indentStr.length);
        } else if (rest.startsWith('\t')) {
          newLines[i] = prefix + rest.slice(1);
        } else if (rest.startsWith(' ')) {
          let spaces = 0;
          while (spaces < sw && rest[spaces] === ' ') spaces++;
          newLines[i] = prefix + rest.slice(spaces);
        }
      }
    }
    const blockCursor = {
      line: minLine,
      col: Math.min(minCol, Math.max(0, (newLines[minLine] ?? '').length - 1)),
    };
    return {
      ...stateWithUndo,
      lines: newLines,
      cursor: blockCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      visualBlockEndOfLine: undefined,
      pendingKeys: undefined,
    };
  }

  for (let i = minLine; i <= maxLine; i++) {
    newLines[i] = shiftLineIndent(newLines[i], direction, sw, ts, et, sr, 1);
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
