import { VimEditorState } from '../types/vim';
import { buildVfsMap } from './vfs';

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
 * 파일 경로 자동완성용 접두사 및 시작 열 위치를 찾습니다.
 * 따옴표/공백 뒤의 경로 문자(예: './src/', 'src/', 'utils', 'assets/icon')를 추출합니다.
 */
export function findFilePrefix(
  lineText: string,
  col: number
): { prefix: string; startCol: number } {
  const textBeforeCursor = lineText.slice(0, col);
  const match = textBeforeCursor.match(/(?:['"`(\s]|^)([a-zA-Z0-9_.\-\/~]*)$/);
  const prefix = match ? match[1] : '';
  const startCol = col - prefix.length;
  return { prefix, startCol };
}

/**
 * VFS, 열려 있는 버퍼, 프로젝트 파일 목록에서 경로 접두사와 일치하는 파일 목록을 반환합니다.
 */
export function scanWorkspaceFiles(
  state: VimEditorState,
  prefix: string
): string[] {
  const vfsMap = buildVfsMap(state);
  const fileList = Object.keys(vfsMap);

  if (state.secondaryFilename && !fileList.includes(state.secondaryFilename)) {
    fileList.push(state.secondaryFilename);
  }

  const cleanPrefix = prefix.toLowerCase();
  const startsWithDotSlash = prefix.startsWith('./');
  const targetPrefix = startsWithDotSlash ? cleanPrefix.slice(2) : cleanPrefix;

  const matched = fileList.filter((f) => {
    const lower = f.toLowerCase();
    if (!targetPrefix) return true;
    return lower.startsWith(targetPrefix) || lower.includes(targetPrefix);
  });

  const formatted = matched.map((f) => (startsWithDotSlash ? `./${f}` : f));
  return Array.from(new Set(formatted)).sort();
}

/**
 * Ctrl+x Ctrl+f 파일 경로 자동완성을 시작합니다.
 */
export function startFilenameCompletion(
  state: VimEditorState,
  direction: 'next' | 'prev' = 'next'
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const found = findFilePrefix(currentLine, col);

  const candidates = scanWorkspaceFiles(state, found.prefix);
  if (candidates.length === 0) {
    return {
      ...state,
      insertCtrlXMode: false,
      commandMessage: '-- Pattern not found --',
    };
  }

  const initialIndex = direction === 'next' ? 0 : candidates.length - 1;
  const chosen = candidates[initialIndex];
  const newLine =
    currentLine.slice(0, found.startCol) + chosen + currentLine.slice(col);
  const nextLines = [...state.lines];
  nextLines[line] = newLine;
  const nextCol = found.startCol + chosen.length;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: nextCol },
    insertCtrlXMode: false,
    commandMessage: undefined,
    completionSession: {
      prefix: found.prefix,
      prefixStartCol: found.startCol,
      candidates,
      selectedIndex: initialIndex,
      originalWord: found.prefix,
      type: 'file',
    },
  };
}

/**
 * 전체 라인(Whole Line) 자동완성용 접두사를 찾습니다.
 */
export function findLinePrefix(
  lineText: string,
  col: number
): { prefix: string; startCol: number } {
  const prefix = lineText.slice(0, col);
  return { prefix, startCol: 0 };
}

/**
 * 현재 버퍼 및 열려 있는 다른 버퍼들에서 현재 행의 접두사로 시작하는 전체 라인 목록을 수집합니다.
 */
export function scanBufferLines(
  state: VimEditorState,
  prefix: string,
  currentLineIdx: number
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const trimmedPrefix = prefix.trimStart();

  const checkAndAdd = (line: string) => {
    if (!line || line.length === 0) return;
    if (seen.has(line)) return;

    if (prefix.length === 0) {
      seen.add(line);
      candidates.push(line);
      return;
    }

    if (line.startsWith(prefix) || line.trimStart().startsWith(trimmedPrefix)) {
      seen.add(line);
      candidates.push(line);
    }
  };

  // 1. 현재 버퍼의 다른 줄들 탐색
  for (let i = 0; i < state.lines.length; i++) {
    if (i === currentLineIdx) continue;
    checkAndAdd(state.lines[i]);
  }

  // 2. 분할 창의 줄들 탐색
  if (state.splitPanes) {
    for (const pane of state.splitPanes) {
      for (const l of pane.lines) {
        checkAndAdd(l);
      }
    }
  }

  // 3. 다른 버퍼들의 줄들 탐색
  if (state.buffers) {
    for (const b of state.buffers) {
      for (const l of b.lines) {
        checkAndAdd(l);
      }
    }
  }

  return candidates;
}

/**
 * Ctrl+x Ctrl+l 전체 라인 자동완성을 시작합니다.
 */
export function startWholeLineCompletion(
  state: VimEditorState,
  direction: 'next' | 'prev' = 'next'
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const found = findLinePrefix(currentLine, col);

  const candidates = scanBufferLines(state, found.prefix, line);
  if (candidates.length === 0) {
    return {
      ...state,
      insertCtrlXMode: false,
      commandMessage: '-- Pattern not found --',
    };
  }

  const initialIndex = direction === 'next' ? 0 : candidates.length - 1;
  const chosen = candidates[initialIndex];
  const nextLines = [...state.lines];
  nextLines[line] = chosen;
  const nextCol = chosen.length;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: nextCol },
    insertCtrlXMode: false,
    commandMessage: undefined,
    completionSession: {
      prefix: found.prefix,
      prefixStartCol: 0,
      candidates,
      selectedIndex: initialIndex,
      originalWord: currentLine,
      type: 'line',
    },
  };
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
    const { prefix, prefixStartCol, candidates, selectedIndex, originalWord, type: sessionType } =
      state.completionSession;
    if (candidates.length === 0) {
      return state;
    }

    const nextIndex =
      direction === 'next'
        ? (selectedIndex + 1) % candidates.length
        : (selectedIndex - 1 + candidates.length) % candidates.length;

    const chosen = candidates[nextIndex];
    let newLine: string;
    let nextCol: number;

    if (sessionType === 'line') {
      newLine = chosen;
      nextCol = chosen.length;
    } else {
      newLine =
        currentLine.slice(0, prefixStartCol) + chosen + currentLine.slice(col);
      nextCol = prefixStartCol + chosen.length;
    }

    const nextLines = [...state.lines];
    nextLines[line] = newLine;

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
        type: sessionType,
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
      type: 'keyword',
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

  const { prefixStartCol, originalWord, type: sessionType } = state.completionSession;
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  let newLine: string;
  let nextCol: number;

  if (sessionType === 'line') {
    newLine = originalWord;
    nextCol = originalWord.length;
  } else {
    newLine =
      currentLine.slice(0, prefixStartCol) + originalWord + currentLine.slice(col);
    nextCol = prefixStartCol + originalWord.length;
  }

  const nextLines = [...state.lines];
  nextLines[line] = newLine;

  return {
    ...state,
    lines: nextLines,
    cursor: { line, col: nextCol },
    completionSession: null,
    insertCtrlXMode: false,
  };
}

/**
 * 현재 선택된 단어를 확정하고 세션을 닫습니다 (Ctrl+y 또는 타이핑 지속).
 */
export function acceptCompletion(state: VimEditorState): VimEditorState {
  if (!state.completionSession) {
    return {
      ...state,
      insertCtrlXMode: false,
    };
  }
  return {
    ...state,
    completionSession: null,
    insertCtrlXMode: false,
  };
}
