import { VimEditorState } from './types';
import { getOptions } from './setEngine';

const OPEN_TO_CLOSE: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
};

const CLOSE_CHARS = new Set([')', ']', '}', '"', "'", '`']);

/**
 * nvim-autopairs: Insert 모드에서 괄호/따옴표 자동 닫기 및 닫는 기호 스킵을 처리합니다.
 * `:set autopairs` (`:set ap`) 가 켜져 있을 때만 동작합니다.
 */
export function handleAutopairsChar(
  state: VimEditorState,
  key: string,
  nextChangeKeys: string[] | undefined
): VimEditorState | null {
  const opts = getOptions(state);
  if (!opts.autopairs || state.blockInsertSession) return null;

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const prevChar = col > 0 ? currentLine[col - 1] : '';
  const nextChar = col < currentLine.length ? currentLine[col] : '';

  // 1) 닫는 문자가 커서 바로 오른쪽에 이미 존재하면 새로 삽입하지 않고 커서만 스킵
  if (CLOSE_CHARS.has(key) && nextChar === key) {
    // 따옴표의 경우 이스케이프(\) 직후에는 리터럴 삽입 허용
    if (prevChar !== '\\') {
      return {
        ...state,
        cursor: { line, col: col + 1 },
        currentChangeKeys: nextChangeKeys,
      };
    }
  }

  // 2) 여는 괄호 / 따옴표 자동 짝 닫기
  const closeChar = OPEN_TO_CLOSE[key];
  if (!closeChar) return null;

  const isQuote = key === '"' || key === "'" || key === '`';
  if (isQuote) {
    // 직전이 영숫자/이스케이프(예: don't)이거나 바로 뒤가 영숫자이면 자동 닫기 생략
    if (prevChar === '\\' || /[A-Za-z0-9_]/.test(prevChar) || /[A-Za-z0-9_]/.test(nextChar)) {
      return null;
    }
  }

  const nextLines = [...state.lines];
  nextLines[line] = currentLine.slice(0, col) + key + closeChar + currentLine.slice(col);
  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: col + 1 },
    currentChangeKeys: nextChangeKeys,
    currentInsertText: (state.currentInsertText ?? '') + key + closeChar,
  };
}

/**
 * nvim-autopairs: 커서 양옆이 빈 괄호/따옴표 쌍(`()`, `{}`, `""` 등)일 때 Backspace 로 양쪽을 함께 삭제합니다.
 */
export function handleAutopairsBackspace(
  state: VimEditorState,
  nextChangeKeys: string[] | undefined
): VimEditorState | null {
  const opts = getOptions(state);
  if (!opts.autopairs || state.blockInsertSession) return null;

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  if (col <= 0 || col >= currentLine.length) return null;

  const left = currentLine[col - 1];
  const right = currentLine[col];
  if (OPEN_TO_CLOSE[left] !== right) return null;

  const nextLines = [...state.lines];
  nextLines[line] = currentLine.slice(0, col - 1) + currentLine.slice(col + 1);
  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: col - 1 },
    currentChangeKeys: nextChangeKeys,
  };
}

/**
 * nvim-autopairs: `{|}`, `(|)`, `[|]` 사이에서 Enter 시 들여쓰기된 빈 줄을 만들고 닫는 괄호를 다음 줄로 내립니다.
 */
export function handleAutopairsEnter(
  state: VimEditorState,
  nextChangeKeys: string[] | undefined
): VimEditorState | null {
  const opts = getOptions(state);
  if (!opts.autopairs || state.blockInsertSession) return null;

  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  if (col <= 0 || col >= currentLine.length) return null;

  const left = currentLine[col - 1];
  const right = currentLine[col];
  const isBracketPair =
    (left === '{' && right === '}') ||
    (left === '(' && right === ')') ||
    (left === '[' && right === ']');
  if (!isBracketPair) return null;

  const baseIndent = currentLine.match(/^[ \t]*/)?.[0] ?? '';
  const sw = Math.max(1, opts.shiftwidth || 2);
  const unit = opts.expandtab === false ? '\t' : ' '.repeat(sw);
  const innerIndent = baseIndent + unit;

  const before = currentLine.slice(0, col);
  const after = currentLine.slice(col);
  const nextLines = [
    ...state.lines.slice(0, line),
    before,
    innerIndent,
    baseIndent + after,
    ...state.lines.slice(line + 1),
  ];

  return {
    ...state,
    lines: nextLines,
    cursor: { line: line + 1, col: innerIndent.length },
    blockInsertSession: null,
    currentChangeKeys: nextChangeKeys,
    currentInsertText: (state.currentInsertText ?? '') + '\n',
  };
}
