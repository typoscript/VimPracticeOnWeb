import { VimEditorState } from '../types/vim';

/**
 * 커서 바로 앞의 접두사(Prefix)를 검출합니다.
 * 접두사는 영문자, 숫자, 언더스코어로 구성되며 최소 2자 이상이어야 합니다.
 */
export function findCompletionPrefix(
  lineText: string,
  col: number
): { prefix: string; startCol: number } | null {
  const textBeforeCursor = lineText.slice(0, col);
  const match = textBeforeCursor.match(/([a-zA-Z_0-9]+)$/);
  if (!match || match[1].length < 2) {
    return null;
  }
  const prefix = match[1];
  return {
    prefix,
    startCol: col - prefix.length,
  };
}

/**
 * 에디터 버퍼의 모든 줄에서 접두사로 시작하는 고유 단어 목록을 추출합니다.
 */
export function scanBufferWords(
  lines: string[],
  prefix: string,
  _cursorLine?: number,
  _currentCol?: number
): string[] {

  const seen = new Set<string>();
  const candidates: string[] = [];

  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    const words = line.match(/[a-zA-Z_0-9]+/g) || [];
    for (const word of words) {
      if (word.startsWith(prefix) && word !== prefix && !seen.has(word)) {
        seen.add(word);
        candidates.push(word);
      }
    }
  }

  return candidates;
}

/**
 * Ctrl+n (next) 또는 Ctrl+p (prev) 입력 시 자동완성을 시작하거나 후보를 순환 교체합니다.
 */
export function startOrCycleCompletion(
  state: VimEditorState,
  direction: 'next' | 'prev'
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  if (state.completionSession) {
    const { prefix, prefixStartCol, candidates, selectedIndex, originalWord } =
      state.completionSession;
    if (candidates.length === 0) {
      return state;
    }

    const nextIndex =
      direction === 'next'
        ? (selectedIndex + 1) % candidates.length
        : (selectedIndex - 1 + candidates.length) % candidates.length;

    const chosenWord = candidates[nextIndex];
    const newLine =
      currentLine.slice(0, prefixStartCol) + chosenWord + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    const nextCol = prefixStartCol + chosenWord.length;

    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: nextCol },
      completionSession: {
        prefix,
        prefixStartCol,
        candidates,
        selectedIndex: nextIndex,
        originalWord,
      },
    };
  }

  // 아직 세션이 없으면 접두사 검출 후 세션 시작
  const found = findCompletionPrefix(currentLine, col);
  if (!found) {
    return state;
  }

  const candidates = scanBufferWords(state.lines, found.prefix, line, col);
  if (candidates.length === 0) {
    return state;
  }

  const initialIndex = direction === 'next' ? 0 : candidates.length - 1;
  const chosenWord = candidates[initialIndex];
  const newLine =
    currentLine.slice(0, found.startCol) + chosenWord + currentLine.slice(col);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;
  const nextCol = found.startCol + chosenWord.length;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: nextCol },
    completionSession: {
      prefix: found.prefix,
      prefixStartCol: found.startCol,
      candidates,
      selectedIndex: initialIndex,
      originalWord: found.prefix,
    },
  };
}

/**
 * 자동완성 세션을 취소하고 원래 타이핑했던 단어로 복원합니다 (Ctrl+e).
 */
export function cancelCompletion(state: VimEditorState): VimEditorState {
  if (!state.completionSession) {
    return state;
  }

  const { prefixStartCol, originalWord } = state.completionSession;
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  const newLine =
    currentLine.slice(0, prefixStartCol) + originalWord + currentLine.slice(col);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: prefixStartCol + originalWord.length },
    completionSession: null,
  };
}

/**
 * 현재 선택된 단어를 확정하고 세션을 닫습니다 (Ctrl+y 또는 타이핑 지속).
 */
export function acceptCompletion(state: VimEditorState): VimEditorState {
  if (!state.completionSession) {
    return state;
  }
  return {
    ...state,
    completionSession: null,
  };
}
