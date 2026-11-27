import { VimEditorState, SurroundTagPrompt } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getTextObjectRange, getTagTextObjectRange } from './textObjects';
import { moveToFirstNonBlank } from './motions';

export interface SurroundPair {
  open: string;
  close: string;
  padSpace?: boolean;
}

/**
 * Returns the open/close delimiter pair for a given surround target character.
 * Opening brackets (, [, { add padding spaces inside, while closing brackets ), ], } do not.
 */
export function getSurroundPair(char: string): SurroundPair {
  switch (char) {
    case '(':
      return { open: '(', close: ')', padSpace: true };
    case ')':
    case 'b':
      return { open: '(', close: ')', padSpace: false };
    case '[':
      return { open: '[', close: ']', padSpace: true };
    case ']':
    case 'r':
      return { open: '[', close: ']', padSpace: false };
    case '{':
      return { open: '{', close: '}', padSpace: true };
    case '}':
    case 'B':
      return { open: '{', close: '}', padSpace: false };
    case '<':
      return { open: '<', close: '>', padSpace: true };
    case '>':
    case 'a':
      return { open: '<', close: '>', padSpace: false };
    case '"':
      return { open: '"', close: '"', padSpace: false };
    case "'":
    case 'q':
      return { open: "'", close: "'", padSpace: false };
    case '`':
      return { open: '`', close: '`', padSpace: false };
    default:
      if (char.length > 2 && char.startsWith('<') && char.endsWith('>')) {
        return getTagSurroundPair(char.slice(1, -1));
      }
      return { open: char, close: char, padSpace: false };
  }
}

/**
 * vim-surround 태그 쌍: 속성은 여는 태그에만 붙고(`<a href="x">` … `</a>`),
 * `/` 로 끝나면 닫는 태그 없는 자기 닫힘 태그(`<br />`)가 됩니다.
 */
function getTagSurroundPair(tag: string): SurroundPair {
  const trimmed = tag.replace(/>+$/, '');
  if (trimmed.endsWith('/')) {
    return { open: `<${trimmed.slice(0, -1)} />`, close: '', padSpace: false };
  }
  const name = trimmed.replace(/\s.*$/s, '');
  return { open: `<${trimmed}>`, close: `</${name}>`, padSpace: false };
}

/**
 * Maps a surround target character to its text-object query representation.
 */
function toTextObjectTarget(char: string): string {
  switch (char) {
    case 'b':
    case '(':
    case ')':
      return ')';
    case 'r':
    case '[':
    case ']':
      return ']';
    case 'B':
    case '{':
    case '}':
      return '}';
    case 'a':
    case '<':
    case '>':
      return '>';
    case 'q':
    case "'":
      return "'";
    case '"':
      return '"';
    case '`':
      return '`';
    case 't':
      return 't';
    default:
      return char;
  }
}

/**
 * Deletes the surrounding delimiter pair around the cursor (ds{char}).
 * e.g. "hello" -> hello, (foo) -> foo
 */
export function executeDeleteSurround(state: VimEditorState, targetChar: string): VimEditorState {
  const lineIdx = state.cursor.line;
  const currentLine = state.lines[lineIdx] ?? '';
  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const targetObj = toTextObjectTarget(targetChar);

  // 1. HTML tag deletion (dst)
  if (targetObj === 't') {
    const tagRange = getTagTextObjectRange(state.lines, state.cursor, 'a');
    if (!tagRange || tagRange.startLine !== tagRange.endLine || tagRange.startLine !== lineIdx) {
      return { ...state, pendingKeys: undefined };
    }
    // Match opening and closing tag in the line
    const match = currentLine
      .slice(tagRange.startCol, tagRange.endCol + 1)
      .match(/^<([a-zA-Z0-9_\-.:]+)[^>]*>(.*?)<\/([a-zA-Z0-9_\-.:]+)>$/);
    if (match) {
      const innerText = match[2];
      const nextLine =
        currentLine.slice(0, tagRange.startCol) +
        innerText +
        currentLine.slice(tagRange.endCol + 1);
      const nextLines = [...state.lines];
      nextLines[lineIdx] = nextLine;

      const stateWithUndo = pushUndoSnapshot(state);
      return {
        ...stateWithUndo,
        lines: nextLines,
        cursor: clampCursor(nextLines, { line: lineIdx, col: tagRange.startCol }, 'NORMAL'),
        pendingKeys: undefined,
        lastChangeKeys: ['d', 's', targetChar],
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // 2. Quotes or Brackets deletion
  const range = getTextObjectRange(state.lines, state.cursor, `a${targetObj}`);
  if (!range) {
    return { ...state, pendingKeys: undefined };
  }

  const targetLineIdx = range.startLine ?? lineIdx;
  const targetEndLineIdx = range.endLine ?? lineIdx;

  if (targetLineIdx !== targetEndLineIdx || targetLineIdx !== lineIdx) {
    return { ...state, pendingKeys: undefined };
  }

  const startCol = range.startCol;
  const endCol = range.endCol;

  if (startCol >= endCol || startCol < 0 || endCol >= currentLine.length) {
    return { ...state, pendingKeys: undefined };
  }

  // Check if there is internal single padding space (e.g. "( hello )")
  let cutStart = startCol + 1;
  let cutEnd = endCol;
  if (
    currentLine[startCol + 1] === ' ' &&
    currentLine[endCol - 1] === ' ' &&
    startCol + 1 < endCol - 1
  ) {
    cutStart = startCol + 2;
    cutEnd = endCol - 1;
  }

  const inside = currentLine.slice(cutStart, cutEnd);
  const nextLine = currentLine.slice(0, startCol) + inside + currentLine.slice(endCol + 1);
  const nextLines = [...state.lines];
  nextLines[lineIdx] = nextLine;

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: lineIdx, col: startCol }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: ['d', 's', targetChar],
  };
}

/**
 * Changes the surrounding delimiter pair from oldChar to newChar (cs{old}{new}).
 * e.g. "hello" + cs"' -> 'hello', (foo) + cs)] -> [foo], (foo) + cs)[ -> [ foo ]
 */
export function executeChangeSurround(
  state: VimEditorState,
  oldChar: string,
  newChar: string
): VimEditorState {
  const lineIdx = state.cursor.line;
  const currentLine = state.lines[lineIdx] ?? '';
  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const oldTarget = toTextObjectTarget(oldChar);
  const newPair = getSurroundPair(newChar);

  // 1. Tag target change: cst<p>
  if (oldTarget === 't') {
    const tagRange = getTagTextObjectRange(state.lines, state.cursor, 'a');
    if (!tagRange || tagRange.startLine !== tagRange.endLine || tagRange.startLine !== lineIdx) {
      return { ...state, pendingKeys: undefined };
    }
    const match = currentLine
      .slice(tagRange.startCol, tagRange.endCol + 1)
      .match(/^<([a-zA-Z0-9_\-.:]+)[^>]*>(.*?)<\/([a-zA-Z0-9_\-.:]+)>$/);
    if (match) {
      const innerText = match[2];
      const openStr = newPair.padSpace ? newPair.open + ' ' : newPair.open;
      const closeStr = newPair.padSpace ? ' ' + newPair.close : newPair.close;
      const nextLine =
        currentLine.slice(0, tagRange.startCol) +
        openStr +
        innerText +
        closeStr +
        currentLine.slice(tagRange.endCol + 1);
      const nextLines = [...state.lines];
      nextLines[lineIdx] = nextLine;

      const stateWithUndo = pushUndoSnapshot(state);
      return {
        ...stateWithUndo,
        lines: nextLines,
        cursor: clampCursor(nextLines, { line: lineIdx, col: tagRange.startCol }, 'NORMAL'),
        pendingKeys: undefined,
        lastChangeKeys: ['c', 's', oldChar, newChar],
      };
    }
    return { ...state, pendingKeys: undefined };
  }

  // 2. Bracket or quote change
  const range = getTextObjectRange(state.lines, state.cursor, `a${oldTarget}`);
  if (!range) {
    return { ...state, pendingKeys: undefined };
  }

  const targetLineIdx = range.startLine ?? lineIdx;
  const targetEndLineIdx = range.endLine ?? lineIdx;
  if (targetLineIdx !== targetEndLineIdx || targetLineIdx !== lineIdx) {
    return { ...state, pendingKeys: undefined };
  }

  const startCol = range.startCol;
  const endCol = range.endCol;

  let cutStart = startCol + 1;
  let cutEnd = endCol;

  // If old pair had inner padding spaces and new pair does not request padding, strip it
  if (
    !newPair.padSpace &&
    currentLine[startCol + 1] === ' ' &&
    currentLine[endCol - 1] === ' ' &&
    startCol + 1 < endCol - 1
  ) {
    cutStart = startCol + 2;
    cutEnd = endCol - 1;
  }

  const inside = currentLine.slice(cutStart, cutEnd);
  const openStr = newPair.padSpace ? newPair.open + ' ' : newPair.open;
  const closeStr = newPair.padSpace ? ' ' + newPair.close : newPair.close;

  const nextLine =
    currentLine.slice(0, startCol) + openStr + inside + closeStr + currentLine.slice(endCol + 1);
  const nextLines = [...state.lines];
  nextLines[lineIdx] = nextLine;

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: lineIdx, col: startCol }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: ['c', 's', oldChar, newChar],
  };
}

/**
 * Surrounds the text covered by motion with target delimiter (ys{motion}{char}).
 * e.g. ysiw" on user -> "user", ysiw( on user -> ( user )
 */
export function executeYouSurround(
  state: VimEditorState,
  motion: string,
  targetChar: string
): VimEditorState {
  const lineIdx = state.cursor.line;
  const currentLine = state.lines[lineIdx] ?? '';
  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  let startCol = state.cursor.col;
  let endCol = state.cursor.col;

  // Text object motions
  if (motion === 'iw' || motion === 'aw') {
    const range = getTextObjectRange(state.lines, state.cursor, motion);
    if (!range) return { ...state, pendingKeys: undefined };
    startCol = range.startCol;
    endCol = range.endCol;
  } else if (motion === '$') {
    startCol = state.cursor.col;
    endCol = Math.max(0, currentLine.length - 1);
  } else if (motion === 'e') {
    startCol = state.cursor.col;
    let c = state.cursor.col;
    while (c < currentLine.length - 1 && /\w/.test(currentLine[c + 1])) {
      c++;
    }
    endCol = c;
  } else if (motion === 'w') {
    startCol = state.cursor.col;
    let c = state.cursor.col;
    while (c < currentLine.length - 1 && !/\s/.test(currentLine[c])) {
      c++;
    }
    endCol = Math.max(startCol, c - 1);
  } else {
    // Other text objects: i", a", i), a), etc.
    const range = getTextObjectRange(state.lines, state.cursor, motion);
    if (!range) return { ...state, pendingKeys: undefined };
    startCol = range.startCol;
    endCol = range.endCol;
  }

  const target = currentLine.slice(startCol, endCol + 1);
  const pair = getSurroundPair(targetChar);
  const openStr = pair.padSpace ? pair.open + ' ' : pair.open;
  const closeStr = pair.padSpace ? ' ' + pair.close : pair.close;

  const nextLine =
    currentLine.slice(0, startCol) + openStr + target + closeStr + currentLine.slice(endCol + 1);
  const nextLines = [...state.lines];
  nextLines[lineIdx] = nextLine;

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: lineIdx, col: startCol }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: ['y', 's', ...motion.split(''), targetChar],
  };
}

/**
 * Surrounds the entire line with delimiter (yss{char} or ys_{char}).
 * Preserves leading indentation.
 */
export function executeLineSurround(state: VimEditorState, targetChar: string): VimEditorState {
  const lineIdx = state.cursor.line;
  const currentLine = state.lines[lineIdx] ?? '';
  if (currentLine.length === 0) {
    return { ...state, pendingKeys: undefined };
  }

  const nonBlank = moveToFirstNonBlank(state.lines, { line: lineIdx, col: 0 });
  const indentCol = nonBlank.col;
  const indent = currentLine.slice(0, indentCol);
  const content = currentLine.slice(indentCol);

  const pair = getSurroundPair(targetChar);
  const openStr = pair.padSpace ? pair.open + ' ' : pair.open;
  const closeStr = pair.padSpace ? ' ' + pair.close : pair.close;

  const nextLine = indent + openStr + content + closeStr;
  const nextLines = [...state.lines];
  nextLines[lineIdx] = nextLine;

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    cursor: clampCursor(nextLines, { line: lineIdx, col: indentCol }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: ['y', 's', 's', targetChar],
  };
}

/**
 * In Visual mode, surrounds the visual selection with delimiter (S{char}).
 */
export function executeVisualSurround(state: VimEditorState, targetChar: string): VimEditorState {
  if (!state.visualAnchor) {
    return { ...state, mode: 'NORMAL', pendingKeys: undefined };
  }

  const lineIdx = state.cursor.line;
  const currentLine = state.lines[lineIdx] ?? '';

  const startCol = Math.min(state.visualAnchor.col, state.cursor.col);
  const endCol = Math.max(state.visualAnchor.col, state.cursor.col);

  const selected = currentLine.slice(startCol, endCol + 1);
  const pair = getSurroundPair(targetChar);
  const openStr = pair.padSpace ? pair.open + ' ' : pair.open;
  const closeStr = pair.padSpace ? ' ' + pair.close : pair.close;

  const nextLine =
    currentLine.slice(0, startCol) + openStr + selected + closeStr + currentLine.slice(endCol + 1);
  const nextLines = [...state.lines];
  nextLines[lineIdx] = nextLine;

  const stateWithUndo = pushUndoSnapshot(state);
  return {
    ...stateWithUndo,
    lines: nextLines,
    mode: 'NORMAL',
    visualAnchor: undefined,
    cursor: clampCursor(nextLines, { line: lineIdx, col: startCol }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: ['v', 'S', targetChar],
  };
}

const isPromptEnter = (key: string) => key === 'Enter' || key === '<CR>' || key === '<Enter>';
const isPromptEscape = (key: string) =>
  key === 'Escape' || key === '<Esc>' || key === 'Ctrl-c' || key === 'Ctrl+c';

/**
 * vim-surround 의 새 대상 `<` / `t` 는 태그 이름을 입력받습니다 (`cst<p>`, `ysiw<em>`).
 * 입력 중에는 명령줄에 `<em` 처럼 프롬프트를 보여 줍니다.
 */
export function startSurroundTagPrompt(
  state: VimEditorState,
  action: SurroundTagPrompt['action'],
  arg: string,
  openKey: string
): VimEditorState {
  return {
    ...state,
    pendingKeys: undefined,
    surroundTagPrompt: { action, arg, text: '', openKey },
    commandMessage: '<',
  };
}

/** cst 에서 바꿀 기존 여는 태그의 속성(` class="x"`)을 돌려줍니다. */
function getOldTagAttributes(state: VimEditorState): string {
  const tagRange = getTagTextObjectRange(state.lines, state.cursor, 'a');
  if (!tagRange) return '';
  const line = state.lines[tagRange.startLine ?? state.cursor.line] ?? '';
  const m = line.slice(tagRange.startCol).match(/^<[^\s>]+([^>]*)>/);
  return m ? m[1] : '';
}

/**
 * 태그 입력 프롬프트 중 키 입력을 처리합니다. `>` 로 끝내면 입력한 태그만,
 * Enter 로 끝내면 (cst 일 때) 기존 태그의 속성을 유지합니다 (vim-surround keepAttributes).
 */
export function handleSurroundTagPromptKey(state: VimEditorState, key: string): VimEditorState {
  const prompt = state.surroundTagPrompt;
  if (!prompt) return state;

  if (isPromptEscape(key)) {
    const cancelled: VimEditorState = { ...state, surroundTagPrompt: null, commandMessage: undefined };
    return prompt.action === 'S' ? cancelled : { ...cancelled, pendingKeys: undefined };
  }
  if (key === 'Backspace' || key === '<BS>' || key === 'Ctrl-h') {
    if (prompt.text.length === 0) {
      return { ...state, surroundTagPrompt: null, commandMessage: undefined };
    }
    const text = prompt.text.slice(0, -1);
    return { ...state, surroundTagPrompt: { ...prompt, text }, commandMessage: `<${text}` };
  }

  const finishByEnter = isPromptEnter(key);
  if (!finishByEnter && key !== '>') {
    const ch = key === 'Space' || key === '<Space>' ? ' ' : key;
    if (ch.length !== 1) return state;
    const text = prompt.text + ch;
    return { ...state, surroundTagPrompt: { ...prompt, text }, commandMessage: `<${text}` };
  }

  const base: VimEditorState = { ...state, surroundTagPrompt: null, commandMessage: undefined };
  const tag = prompt.text.replace(/>+$/, '');
  if (tag.length === 0) {
    return prompt.action === 'S' ? base : { ...base, pendingKeys: undefined };
  }

  let target = `<${tag}>`;
  if (finishByEnter && prompt.action === 'cs' && toTextObjectTarget(prompt.arg) === 't' && !tag.endsWith('/')) {
    target = `<${tag}${getOldTagAttributes(state)}>`;
  }

  let result: VimEditorState;
  if (prompt.action === 'cs') result = executeChangeSurround(base, prompt.arg, target);
  else if (prompt.action === 'ys') result = executeYouSurround(base, prompt.arg, target);
  else if (prompt.action === 'yss') result = executeLineSurround(base, target);
  else result = executeVisualSurround(base, target);

  // . 반복은 프롬프트 입력 키를 그대로 다시 넣습니다.
  if (result.lastChangeKeys && result.lastChangeKeys !== state.lastChangeKeys) {
    const promptKeys = [
      prompt.openKey,
      ...Array.from(prompt.text).map((c) => (c === ' ' ? 'Space' : c)),
      finishByEnter ? 'Enter' : '>',
    ];
    result = { ...result, lastChangeKeys: [...result.lastChangeKeys.slice(0, -1), ...promptKeys] };
  }
  return result;
}
