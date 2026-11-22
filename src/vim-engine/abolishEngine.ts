import { VimEditorState } from './types';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { msg } from './messages';

export type AbolishCaseVariant =
  | 'snake'
  | 'camel'
  | 'pascal'
  | 'upper'
  | 'kebab'
  | 'dot'
  | 'space'
  | 'title';

/** `cr{key}` 키를 케이스 변형 타입으로 매핑합니다. */
export const ABOLISH_KEY_TO_VARIANT: Record<string, AbolishCaseVariant> = {
  s: 'snake',
  '_': 'snake',
  c: 'camel',
  m: 'pascal',
  p: 'pascal',
  u: 'upper',
  U: 'upper',
  '-': 'kebab',
  k: 'kebab',
  '.': 'dot',
  ' ': 'space',
  t: 'title',
};

const CASE_NAME_ALIASES: Record<string, AbolishCaseVariant> = {
  s: 'snake',
  snake: 'snake',
  snake_case: 'snake',
  c: 'camel',
  camel: 'camel',
  camelcase: 'camel',
  m: 'pascal',
  p: 'pascal',
  mixed: 'pascal',
  pascal: 'pascal',
  pascalcase: 'pascal',
  u: 'upper',
  upper: 'upper',
  screaming: 'upper',
  constant: 'upper',
  '-': 'kebab',
  k: 'kebab',
  kebab: 'kebab',
  dash: 'kebab',
  '.': 'dot',
  dot: 'dot',
  ' ': 'space',
  space: 'space',
  t: 'title',
  title: 'title',
};

/**
 * 임의의 식별자(camelCase, PascalCase, snake_case, SCREAMING_SNAKE, kebab-case, HTTPServer 등)를
 * 소문자 단어 토큰 배열로 분해합니다.
 */
export function splitIdentifierWords(identifier: string): string[] {
  if (!identifier) return [];
  // 1) 구분자(_, -, ., 공백)로 1차 분리
  const rawParts = identifier.split(/[_\-.\s]+/).filter(Boolean);
  const words: string[] = [];

  for (const part of rawParts) {
    // 2) 대문자 약어/카멜 경계 분리: HTTPServer -> HTTP, Server / userID2 -> user, ID2 / camelCase -> camel, Case
    const split = part
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(' ')
      .filter(Boolean);
    for (const w of split) {
      words.push(w.toLowerCase());
    }
  }
  return words;
}

function capitalize(word: string): string {
  if (!word) return '';
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * 식별자 문자열을 지정한 케이스 변형으로 변환합니다.
 */
export function coerceIdentifierCase(identifier: string, variant: AbolishCaseVariant): string {
  const words = splitIdentifierWords(identifier);
  if (words.length === 0) return identifier;

  switch (variant) {
    case 'snake':
      return words.join('_');
    case 'upper':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'kebab':
      return words.join('-');
    case 'dot':
      return words.join('.');
    case 'space':
      return words.join(' ');
    case 'title':
      return words.map(capitalize).join(' ');
    case 'pascal':
      return words.map(capitalize).join('');
    case 'camel':
      return words[0] + words.slice(1).map(capitalize).join('');
  }
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/**
 * 커서 위치의 식별자 범위([start, end))를 찾습니다.
 * kebab-case(`foo-bar`)의 내부 하이픈은 양옆이 영숫자일 때만 하나의 식별자로 묶습니다.
 */
export function findIdentifierRangeAtCursor(
  line: string,
  col: number
): { start: number; end: number; text: string } | null {
  if (!line || col < 0 || col >= line.length) return null;

  const isPart = (idx: number): boolean => {
    const ch = line[idx];
    if (isWordChar(ch)) return true;
    if (ch === '-' && idx > 0 && idx + 1 < line.length && isWordChar(line[idx - 1]) && isWordChar(line[idx + 1])) {
      return true;
    }
    return false;
  };

  if (!isPart(col)) return null;

  let start = col;
  while (start > 0 && isPart(start - 1)) {
    start--;
  }
  let end = col + 1;
  while (end < line.length && isPart(end)) {
    end++;
  }

  const text = line.slice(start, end);
  if (!/[A-Za-z0-9]/.test(text)) return null;
  return { start, end, text };
}

/**
 * vim-abolish `cr{key}`: 커서 아래 식별자를 지정 케이스로 변환합니다.
 */
export function applyAbolishCoerce(
  state: VimEditorState,
  variantKey: string,
  isReplayingDot = false
): VimEditorState {
  const variant = ABOLISH_KEY_TO_VARIANT[variantKey] ?? CASE_NAME_ALIASES[variantKey.toLowerCase()];
  if (!variant) {
    return { ...state, pendingKeys: undefined, bell: true };
  }

  const currentLine = state.lines[state.cursor.line] ?? '';
  const range = findIdentifierRangeAtCursor(currentLine, state.cursor.col);
  if (!range) {
    return { ...state, pendingKeys: undefined, bell: true };
  }

  const converted = coerceIdentifierCase(range.text, variant);
  if (converted === range.text) {
    return {
      ...state,
      cursor: clampCursor(state.lines, { line: state.cursor.line, col: range.start }, 'NORMAL'),
      pendingKeys: undefined,
      commandMessage: msg('[abolish] 이미 {variant} 형식입니다: {word}', {
        variant,
        word: converted,
      }),
    };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const newLines = [...state.lines];
  newLines[state.cursor.line] =
    currentLine.slice(0, range.start) + converted + currentLine.slice(range.end);

  const dotKey = Object.keys(ABOLISH_KEY_TO_VARIANT).find((k) => ABOLISH_KEY_TO_VARIANT[k] === variant) ?? 's';

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: clampCursor(newLines, { line: state.cursor.line, col: range.start }, 'NORMAL'),
    pendingKeys: undefined,
    lastChangeKeys: isReplayingDot ? state.lastChangeKeys : ['c', 'r', dotKey],
    commandMessage: msg('[abolish] {before} → {after}', {
      before: range.text,
      after: converted,
    }),
  };
}

/**
 * `:Coerce {snake|camel|pascal|upper|kebab|dot|title}` / `:AbolishCase {variant}` 실행
 */
export function executeAbolishCommand(
  state: VimEditorState,
  rawArg: string
): VimEditorState {
  const arg = rawArg.trim();
  if (!arg) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[abolish] 변환 형식을 지정하세요 (예: :Coerce snake|camel|pascal|upper|kebab)'),
    };
  }
  const variant = CASE_NAME_ALIASES[arg.toLowerCase()];
  if (!variant) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E475: 잘못된 인수입니다: {arg}', { arg }),
    };
  }
  return applyAbolishCoerce(state, arg, false);
}
