import { VimEditorState, SpellError, SpellSuggestSession } from './types';
import { DEFAULT_SPELL_WORDS } from './spellData';
import { msg } from './messages';
import { pushUndoSnapshot } from './operators';

/**
 * 단어가 오탈자인지 판정합니다.
 * - 1글자 단어나 숫자가 섞인 단어는 스펠 검사 대상에서 제외합니다.
 * - spellWrongWords에 등록된 단어는 항상 오탈자로 판정합니다.
 * - spellGoodWords 또는 DEFAULT_SPELL_WORDS에 등록된 단어는 정상으로 판정합니다.
 */
export function isWordMisspelled(word: string, state?: VimEditorState): boolean {
  if (!word || word.length < 2) return false;
  // 알파벳으로만 구성된 단어만 검사
  if (!/^[a-zA-Z]+$/.test(word)) return false;

  const lower = word.toLowerCase();

  if (state?.spellWrongWords && state.spellWrongWords.includes(lower)) {
    return true;
  }
  if (state?.spellGoodWords && state.spellGoodWords.includes(lower)) {
    return false;
  }
  if (DEFAULT_SPELL_WORDS.has(lower)) {
    return false;
  }

  return true;
}

/**
 * 특정 줄에서 모든 오탈자 위치를 탐색합니다.
 */
export function findSpellErrorsInLine(
  line: string,
  lineIndex: number,
  state?: VimEditorState
): SpellError[] {
  const errors: SpellError[] = [];
  const regex = /\b[a-zA-Z]+\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const word = match[0];
    if (isWordMisspelled(word, state)) {
      errors.push({
        word,
        line: lineIndex,
        startCol: match.index,
        endCol: match.index + word.length,
      });
    }
  }

  return errors;
}

/**
 * 현재 커서 위치에서 다음 오탈자를 검색합니다 (']s' 용).
 */
export function findNextSpellError(
  state: VimEditorState,
  wrap = false
): SpellError | null {
  const { lines, cursor } = state;
  if (!lines || lines.length === 0) return null;

  // 1. 현재 줄 커서 이후
  const currentLineErrors = findSpellErrorsInLine(lines[cursor.line], cursor.line, state);
  const nextInCurrentLine = currentLineErrors.find((e) => e.startCol > cursor.col);
  if (nextInCurrentLine) return nextInCurrentLine;

  // 2. 다음 줄들
  for (let l = cursor.line + 1; l < lines.length; l++) {
    const lineErrors = findSpellErrorsInLine(lines[l], l, state);
    if (lineErrors.length > 0) return lineErrors[0];
  }

  // 3. 순환 검색 (wrap)
  if (wrap) {
    for (let l = 0; l <= cursor.line; l++) {
      const lineErrors = findSpellErrorsInLine(lines[l], l, state);
      if (l === cursor.line) {
        const wrapInCurrent = lineErrors.find((e) => e.startCol <= cursor.col);
        if (wrapInCurrent) return wrapInCurrent;
      } else if (lineErrors.length > 0) {
        return lineErrors[0];
      }
    }
  }

  return null;
}

/**
 * 현재 커서 위치에서 이전 오탈자를 검색합니다 ('[s' 용).
 */
export function findPrevSpellError(
  state: VimEditorState,
  wrap = false
): SpellError | null {
  const { lines, cursor } = state;
  if (!lines || lines.length === 0) return null;

  // 1. 현재 줄 커서 이전
  const currentLineErrors = findSpellErrorsInLine(lines[cursor.line], cursor.line, state);
  const prevInCurrentLine = [...currentLineErrors]
    .reverse()
    .find((e) => e.startCol < cursor.col);
  if (prevInCurrentLine) return prevInCurrentLine;

  // 2. 이전 줄들
  for (let l = cursor.line - 1; l >= 0; l--) {
    const lineErrors = findSpellErrorsInLine(lines[l], l, state);
    if (lineErrors.length > 0) return lineErrors[lineErrors.length - 1];
  }

  // 3. 순환 검색 (wrap)
  if (wrap) {
    for (let l = lines.length - 1; l >= cursor.line; l--) {
      const lineErrors = findSpellErrorsInLine(lines[l], l, state);
      if (l === cursor.line) {
        const wrapInCurrent = [...lineErrors]
          .reverse()
          .find((e) => e.startCol >= cursor.col);
        if (wrapInCurrent) return wrapInCurrent;
      } else if (lineErrors.length > 0) {
        return lineErrors[lineErrors.length - 1];
      }
    }
  }

  return null;
}

/**
 * Damerau-Levenshtein 편집 거리 계산 (인접 문자 교환 전치 지원)
 */
export function damerauLevenshtein(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const dp: number[][] = Array.from({ length: al + 1 }, () => Array(bl + 1).fill(0));

  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // 삭제
        dp[i][j - 1] + 1,       // 삽입
        dp[i - 1][j - 1] + cost // 치환
      );

      // 인접 문자 전치(transposition)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[al][bl];
}

/**
 * 오탈자에 대한 추천 단어 목록을 산출합니다.
 */
export function getSpellSuggestions(
  word: string,
  state?: VimEditorState,
  limit = 9
): string[] {
  const lower = word.toLowerCase();
  const candidates: Array<{ word: string; dist: number }> = [];

  const checkSet = new Set<string>();
  DEFAULT_SPELL_WORDS.forEach((w) => checkSet.add(w));
  if (state?.spellGoodWords) {
    state.spellGoodWords.forEach((w) => checkSet.add(w));
  }

  // 편집 거리 1~2인 단어 수집
  for (const candidate of checkSet) {
    const lenDiff = Math.abs(candidate.length - lower.length);
    if (lenDiff > 2) continue;

    const dist = damerauLevenshtein(lower, candidate);
    if (dist <= 2) {
      candidates.push({ word: candidate, dist });
    }
  }

  candidates.sort((a, b) => {
    if (a.dist !== b.dist) return a.dist - b.dist;
    // 첫 글자가 같은 후보 우선
    const aFirst = a.word[0] === lower[0] ? 0 : 1;
    const bFirst = b.word[0] === lower[0] ? 0 : 1;
    if (aFirst !== bFirst) return aFirst - bFirst;
    return a.word.localeCompare(b.word);
  });

  // 원래 단어가 대문자로 시작했으면 추천 단어도 대문자로 맞춰줌
  const isTitle = word[0] >= 'A' && word[0] <= 'Z';

  return candidates.slice(0, limit).map((c) => {
    if (isTitle && c.word.length > 0) {
      return c.word[0].toUpperCase() + c.word.slice(1);
    }
    return c.word;
  });
}

/**
 * 커서 위치의 단어 정보를 가져옵니다.
 */
export function getWordAtCursor(state: VimEditorState): {
  word: string;
  startCol: number;
  endCol: number;
} | null {
  const { lines, cursor } = state;
  const line = lines[cursor.line] ?? '';
  const regex = /\b[a-zA-Z]+\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (cursor.col >= start && cursor.col <= end) {
      return { word: match[0], startCol: start, endCol: end };
    }
  }

  return null;
}

/**
 * 다음 오탈자로 점프합니다 (']s').
 */
export function jumpToNextSpellError(state: VimEditorState): VimEditorState {
  if (!state.options?.spell) {
    return { ...state, bell: true };
  }

  const next = findNextSpellError(state, false);
  if (!next) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E752: 철자 오류를 찾을 수 없습니다'),
    };
  }

  return {
    ...state,
    cursor: { line: next.line, col: next.startCol },
    commandMessage: undefined,
  };
}

/**
 * 이전 오탈자로 점프합니다 ('[s').
 */
export function jumpToPrevSpellError(state: VimEditorState): VimEditorState {
  if (!state.options?.spell) {
    return { ...state, bell: true };
  }

  const prev = findPrevSpellError(state, false);
  if (!prev) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E752: 철자 오류를 찾을 수 없습니다'),
    };
  }

  return {
    ...state,
    cursor: { line: prev.line, col: prev.startCol },
    commandMessage: undefined,
  };
}

/**
 * z= 추천 프롬프트 메시지 문자열을 구성합니다.
 */
export function formatSpellSuggestPrompt(
  word: string,
  suggestions: string[],
  input: string
): string {
  const items = suggestions.map((s, idx) => ` ${idx + 1} "${s}"`).join('\n');
  return `Change "${word}" to:\n${items}\nType number and <Enter> (empty cancels): ${input}`;
}

/**
 * 커서 위치의 단어에 대해 z= 맞춤법 교체 추천 세션을 시작합니다.
 */
export function startSpellSuggest(state: VimEditorState): VimEditorState {
  const target = getWordAtCursor(state);
  if (!target) {
    return { ...state, bell: true };
  }

  const { word, startCol } = target;
  if (!isWordMisspelled(word, state)) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('철자 오류가 아닙니다'),
    };
  }

  const suggestions = getSpellSuggestions(word, state, 9);
  if (suggestions.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('"{word}"에 대한 추천 단어가 없습니다', { word }),
    };
  }

  const session: SpellSuggestSession = {
    word,
    line: state.cursor.line,
    col: startCol,
    suggestions,
    input: '',
  };

  return {
    ...state,
    spellSuggest: session,
    commandMessage: formatSpellSuggestPrompt(word, suggestions, ''),
  };
}

/**
 * z= 맞춤법 추천 세션 중 키 입력을 처리합니다.
 */
export function handleSpellSuggestKey(
  state: VimEditorState,
  key: string
): VimEditorState {
  const session = state.spellSuggest;
  if (!session) return state;

  if (key === 'Escape' || key === '<Esc>') {
    return {
      ...state,
      spellSuggest: null,
      commandMessage: undefined,
    };
  }

  if (key === 'Enter' || key === '<Enter>' || key === '<CR>') {
    const num = parseInt(session.input, 10);
    if (!isNaN(num) && num >= 1 && num <= session.suggestions.length) {
      return applySpellReplacement(state, session, num - 1);
    }
    // 유효하지 않은 입력 또는 빈 Enter는 취소
    return {
      ...state,
      spellSuggest: null,
      commandMessage: undefined,
    };
  }

  // 1~9 숫자 입력 처리
  if (/^[1-9]$/.test(key)) {
    const num = parseInt(key, 10);
    // 단일 자릿수 선택: 후보 개수 이하이면 즉시 확정 적용
    if (num >= 1 && num <= session.suggestions.length) {
      return applySpellReplacement(state, session, num - 1);
    }
    // 그 외에는 input에 기록
    const nextInput = session.input + key;
    return {
      ...state,
      spellSuggest: { ...session, input: nextInput },
      commandMessage: formatSpellSuggestPrompt(session.word, session.suggestions, nextInput),
    };
  }

  if (key === 'Backspace' || key === '<BS>') {
    const nextInput = session.input.slice(0, -1);
    return {
      ...state,
      spellSuggest: { ...session, input: nextInput },
      commandMessage: formatSpellSuggestPrompt(session.word, session.suggestions, nextInput),
    };
  }

  return state;
}

function applySpellReplacement(
  state: VimEditorState,
  session: SpellSuggestSession,
  selectedIndex: number
): VimEditorState {
  const replacement = session.suggestions[selectedIndex];
  if (!replacement) {
    return { ...state, spellSuggest: null, commandMessage: undefined };
  }

  const nextState = pushUndoSnapshot(state);
  const { line, col, word } = session;
  const currentLine = nextState.lines[line] ?? '';

  const newLine = currentLine.slice(0, col) + replacement + currentLine.slice(col + word.length);
  const nextLines = [...nextState.lines];
  nextLines[line] = newLine;

  return {
    ...nextState,
    lines: nextLines,
    cursor: {
      line,
      col: Math.max(0, col + replacement.length - 1),
    },
    spellSuggest: null,
    commandMessage: undefined,
    lastChangeKeys: ['z', '='],
  };
}

/**
 * 커서 위치의 단어를 양호한 단어로 등록합니다 ('zg').
 */
export function addSpellGoodWord(state: VimEditorState): VimEditorState {
  const target = getWordAtCursor(state);
  if (!target) {
    return { ...state, bell: true };
  }

  const lower = target.word.toLowerCase();
  const currentGood = state.spellGoodWords ?? [];
  const currentWrong = state.spellWrongWords ?? [];

  const nextGood = currentGood.includes(lower) ? currentGood : [...currentGood, lower];
  const nextWrong = currentWrong.filter((w) => w !== lower);

  return {
    ...state,
    spellGoodWords: nextGood,
    spellWrongWords: nextWrong,
    commandMessage: msg('"{word}" 단어가 사전에 추가되었습니다', { word: target.word }),
  };
}

/**
 * 커서 위치의 단어를 오탈자로 등록합니다 ('zw').
 */
export function addSpellWrongWord(state: VimEditorState): VimEditorState {
  const target = getWordAtCursor(state);
  if (!target) {
    return { ...state, bell: true };
  }

  const lower = target.word.toLowerCase();
  const currentGood = state.spellGoodWords ?? [];
  const currentWrong = state.spellWrongWords ?? [];

  const nextWrong = currentWrong.includes(lower) ? currentWrong : [...currentWrong, lower];
  const nextGood = currentGood.filter((w) => w !== lower);

  return {
    ...state,
    spellGoodWords: nextGood,
    spellWrongWords: nextWrong,
    commandMessage: msg('"{word}" 단어가 오탈자로 등록되었습니다', { word: target.word }),
  };
}
