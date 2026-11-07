import { VimEditorState, CursorPosition, ChangeListItem } from '../types/vim';
import { clampCursor } from './cursor';
import { recordJump } from './marks';
import { getWordAtCursor, escapeRegExp } from './search';
import { pushUndoSnapshot } from './operators';

/**
 * 줄이 비어있거나 공백 문자만으로 구성되었는지 검사합니다. (Vim 문단 구분 기준)
 */
export function isBlankLine(lineText: string | undefined): boolean {
  if (lineText === undefined) return true;
  return lineText.trim().length === 0;
}

/**
 * '}' : 다음 문단 경계(빈 줄 또는 파일 끝)로 이동합니다.
 * @param count 반복 횟수 (기본 1)
 */
export function moveToNextParagraph(
  lines: string[],
  cursor: CursorPosition,
  count = 1
): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };
  let currentLine = Math.max(0, Math.min(cursor.line, lines.length - 1));
  const maxLine = lines.length - 1;

  for (let c = 0; c < count; c++) {
    if (currentLine >= maxLine) break;

    // 1. 현재 줄이 빈 줄인 경우, 연속된 빈 줄을 건너뜁니다.
    while (currentLine < maxLine && isBlankLine(lines[currentLine])) {
      currentLine++;
    }

    // 2. 내용이 있는 줄들을 건너뛰어 다음 빈 줄을 찾습니다.
    while (currentLine < maxLine && !isBlankLine(lines[currentLine])) {
      currentLine++;
    }
  }

  return { line: currentLine, col: 0 };
}

/**
 * '{' : 이전 문단 경계(빈 줄 또는 파일 시작)로 이동합니다.
 * @param count 반복 횟수 (기본 1)
 */
export function moveToPrevParagraph(
  lines: string[],
  cursor: CursorPosition,
  count = 1
): CursorPosition {
  if (lines.length === 0) return { line: 0, col: 0 };
  let currentLine = Math.max(0, Math.min(cursor.line, lines.length - 1));

  for (let c = 0; c < count; c++) {
    if (currentLine <= 0) break;

    // 1. 현재 줄이 빈 줄인 경우, 연속된 빈 줄을 뒤로 건너뜁니다.
    while (currentLine > 0 && isBlankLine(lines[currentLine])) {
      currentLine--;
    }

    // 2. 내용이 있는 줄들을 뒤로 건너뛰어 이전 빈 줄을 찾습니다.
    while (currentLine > 0 && !isBlankLine(lines[currentLine])) {
      currentLine--;
    }
  }

  return { line: currentLine, col: 0 };
}

/**
 * 'd}' 또는 'd{' : 문단 범위 삭제 연산자
 */
export function deleteParagraph(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const target = direction === 'next'
    ? moveToNextParagraph(state.lines, state.cursor, count)
    : moveToPrevParagraph(state.lines, state.cursor, count);

  if (target.line === state.cursor.line && target.col === state.cursor.col) {
    return { ...state, pendingKeys: undefined };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const cur = state.cursor;

  if (direction === 'next') {
    const isTargetEofNonBlank =
      target.line === state.lines.length - 1 && !isBlankLine(state.lines[target.line]);
    const endLineExclusive = isTargetEofNonBlank ? target.line + 1 : target.line;

    if (cur.col === 0) {
      const deleted = state.lines.slice(cur.line, endLineExclusive).join('\n') + '\n';
      let nextLines = [
        ...state.lines.slice(0, cur.line),
        ...state.lines.slice(endLineExclusive),
      ];
      if (nextLines.length === 0) nextLines = [''];
      const clamped = clampCursor(nextLines, { line: cur.line, col: 0 }, 'NORMAL');
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: clamped,
        clipboard: { type: 'line', content: deleted },
        pendingKeys: undefined,
      };
    } else {
      const startLineText = state.lines[cur.line] ?? '';
      const endLineText = state.lines[target.line] ?? '';
      let deleted: string;
      let nextLines: string[];
      if (cur.line === target.line) {
        deleted = startLineText.slice(cur.col, target.col);
        const newLine = startLineText.slice(0, cur.col) + startLineText.slice(target.col);
        nextLines = [...state.lines];
        nextLines[cur.line] = newLine;
      } else {
        const intermediate = state.lines.slice(cur.line + 1, target.line);
        deleted = [
          startLineText.slice(cur.col),
          ...intermediate,
          endLineText.slice(0, target.col),
        ].join('\n');
        const merged = startLineText.slice(0, cur.col) + endLineText.slice(target.col);
        nextLines = [
          ...state.lines.slice(0, cur.line),
          merged,
          ...state.lines.slice(target.line + 1),
        ];
      }
      if (nextLines.length === 0) nextLines = [''];
      const clamped = clampCursor(nextLines, cur, 'NORMAL');
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: clamped,
        clipboard: { type: 'text', content: deleted },
        pendingKeys: undefined,
      };
    }
  } else {
    // direction === 'prev'
    if (cur.col === 0) {
      const startLine = target.line;
      const endLine = cur.line;
      const deleted = state.lines.slice(startLine, endLine).join('\n') + '\n';
      let nextLines = [
        ...state.lines.slice(0, startLine),
        ...state.lines.slice(endLine),
      ];
      if (nextLines.length === 0) nextLines = [''];
      const clamped = clampCursor(nextLines, { line: startLine, col: 0 }, 'NORMAL');
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: clamped,
        clipboard: { type: 'line', content: deleted },
        pendingKeys: undefined,
      };
    } else {
      const startLineText = state.lines[target.line] ?? '';
      const endLineText = state.lines[cur.line] ?? '';
      let deleted: string;
      let nextLines: string[];
      if (target.line === cur.line) {
        deleted = startLineText.slice(target.col, cur.col);
        const newLine = startLineText.slice(0, target.col) + startLineText.slice(cur.col);
        nextLines = [...state.lines];
        nextLines[target.line] = newLine;
      } else {
        const intermediate = state.lines.slice(target.line + 1, cur.line);
        deleted = [
          startLineText.slice(target.col),
          ...intermediate,
          endLineText.slice(0, cur.col),
        ].join('\n');
        const merged = startLineText.slice(0, target.col) + endLineText.slice(cur.col);
        nextLines = [
          ...state.lines.slice(0, target.line),
          merged,
          ...state.lines.slice(cur.line + 1),
        ];
      }
      if (nextLines.length === 0) nextLines = [''];
      const clamped = clampCursor(nextLines, target, 'NORMAL');
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: clamped,
        clipboard: { type: 'text', content: deleted },
        pendingKeys: undefined,
      };
    }
  }
}

/**
 * 'c}' 또는 'c{' : 문단 범위 변경 연산자
 */
export function changeParagraph(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const target = direction === 'next'
    ? moveToNextParagraph(state.lines, state.cursor, count)
    : moveToPrevParagraph(state.lines, state.cursor, count);

  if (target.line === state.cursor.line && target.col === state.cursor.col) {
    return { ...state, mode: 'INSERT', pendingKeys: undefined };
  }

  const isLinewise = state.cursor.col === 0;
  const delState = deleteParagraph(state, direction, count);
  let nextLines = [...delState.lines];
  let cursorLine = Math.min(delState.cursor.line, nextLines.length - 1);
  if (isLinewise) {
    nextLines.splice(cursorLine, 0, '');
  }

  return {
    ...delState,
    lines: nextLines,
    mode: 'INSERT',
    cursor: { line: cursorLine, col: 0 },
    pendingKeys: undefined,
  };
}

/**
 * 'y}' 또는 'y{' : 문단 범위 복사(Yank) 연산자
 */
export function yankParagraph(
  state: VimEditorState,
  direction: 'next' | 'prev',
  count = 1
): VimEditorState {
  const target = direction === 'next'
    ? moveToNextParagraph(state.lines, state.cursor, count)
    : moveToPrevParagraph(state.lines, state.cursor, count);

  if (target.line === state.cursor.line && target.col === state.cursor.col) {
    return { ...state, pendingKeys: undefined };
  }

  const cur = state.cursor;
  if (direction === 'next') {
    const isTargetEofNonBlank =
      target.line === state.lines.length - 1 && !isBlankLine(state.lines[target.line]);
    const endLineExclusive = isTargetEofNonBlank ? target.line + 1 : target.line;

    if (cur.col === 0) {
      const yanked = state.lines.slice(cur.line, endLineExclusive).join('\n') + '\n';
      return {
        ...state,
        clipboard: { type: 'line', content: yanked },
        pendingKeys: undefined,
      };
    } else {
      const startLineText = state.lines[cur.line] ?? '';
      const endLineText = state.lines[target.line] ?? '';
      let yanked: string;
      if (cur.line === target.line) {
        yanked = startLineText.slice(cur.col, target.col);
      } else {
        const intermediate = state.lines.slice(cur.line + 1, target.line);
        yanked = [
          startLineText.slice(cur.col),
          ...intermediate,
          endLineText.slice(0, target.col),
        ].join('\n');
      }
      return {
        ...state,
        clipboard: { type: 'text', content: yanked },
        pendingKeys: undefined,
      };
    }
  } else {
    // direction === 'prev'
    if (cur.col === 0) {
      const yanked = state.lines.slice(target.line, cur.line).join('\n') + '\n';
      return {
        ...state,
        clipboard: { type: 'line', content: yanked },
        pendingKeys: undefined,
      };
    } else {
      const startLineText = state.lines[target.line] ?? '';
      const endLineText = state.lines[cur.line] ?? '';
      let yanked: string;
      if (target.line === cur.line) {
        yanked = startLineText.slice(target.col, cur.col);
      } else {
        const intermediate = state.lines.slice(target.line + 1, cur.line);
        yanked = [
          startLineText.slice(target.col),
          ...intermediate,
          endLineText.slice(0, cur.col),
        ].join('\n');
      }
      return {
        ...state,
        clipboard: { type: 'text', content: yanked },
        pendingKeys: undefined,
      };
    }
  }
}

/**
 * 'gd' : Go to Local Declaration (로컬 선언부로 즉시 점프)
 */
export function goToDeclaration(state: VimEditorState): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const word = getWordAtCursor(currentLine, state.cursor.col);
  if (!word) {
    return { ...state, pendingKeys: undefined };
  }

  // 1. 현재 함수/블록의 시작 행 탐색
  let functionStartLine = 0;
  for (let l = state.cursor.line; l >= 0; l--) {
    const lineText = state.lines[l] ?? '';
    if (
      /^(function|\w+\s*\([^)]*\)\s*\{|const\s+\w+\s*=\s*(\([^)]*\)|function)|\s*function\b)/.test(lineText.trim()) ||
      /^\{/.test(lineText.trim())
    ) {
      functionStartLine = l;
      break;
    }
  }

  // 선언 키워드 패턴 및 일반 단어 패턴
  const declRegex = new RegExp(`\\b(const|let|var|function|class|type|interface)\\s+${escapeRegExp(word)}\\b`);
  const wordRegex = new RegExp(`\\b${escapeRegExp(word)}\\b`);

  // A. 먼저 현재 함수 블록 내에서 선언 키워드 우선 탐색
  for (let l = functionStartLine; l < state.lines.length; l++) {
    const text = state.lines[l] ?? '';
    const match = declRegex.exec(text);
    if (match) {
      const col = text.indexOf(word, match.index);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: clampCursor(state.lines, { line: l, col: Math.max(0, col) }, 'NORMAL'),
        commandMessage: `선언부로 이동: ${word} (${l + 1}번째 줄)`,
        pendingKeys: undefined,
      };
    }
  }

  // B. 파일 전체(0행부터)에서 선언 키워드 탐색
  for (let l = 0; l < state.lines.length; l++) {
    const text = state.lines[l] ?? '';
    const match = declRegex.exec(text);
    if (match) {
      const col = text.indexOf(word, match.index);
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: clampCursor(state.lines, { line: l, col: Math.max(0, col) }, 'NORMAL'),
        commandMessage: `선언부로 이동: ${word} (${l + 1}번째 줄)`,
        pendingKeys: undefined,
      };
    }
  }

  // C. 선언 키워드가 없으면 파일 맨 위(0행)부터 최초 등장 위치로 점프 (순정 Vim fallback)
  for (let l = 0; l < state.lines.length; l++) {
    const text = state.lines[l] ?? '';
    const match = wordRegex.exec(text);
    if (match) {
      const stateWithJump = recordJump(state);
      return {
        ...stateWithJump,
        cursor: clampCursor(state.lines, { line: l, col: match.index }, 'NORMAL'),
        commandMessage: `선언부(첫 등장)로 이동: ${word} (${l + 1}번째 줄)`,
        pendingKeys: undefined,
      };
    }
  }

  return {
    ...state,
    commandMessage: `E486: 선언부를 찾을 수 없습니다: ${word}`,
    pendingKeys: undefined,
  };
}

/**
 * 'gi' : Go to Last Insert (마지막 INSERT 모드 종료 위치로 점프 후 INSERT 모드 진입)
 */
export function goToLastInsert(state: VimEditorState): VimEditorState {
  const target = state.lastInsertPos ?? {
    line: state.cursor.line,
    col: state.cursor.col,
    row: state.cursor.line,
  };
  const clamped = clampCursor(state.lines, { line: target.line, col: target.col }, 'INSERT');
  const stateWithJump = recordJump(state);
  return {
    ...stateWithJump,
    mode: 'INSERT',
    cursor: clamped,
    pendingKeys: undefined,
  };
}

/**
 * 'gv' : Reselect Last Visual (직전 비주얼 모드 선택 영역 복원)
 */
export function reselectLastVisual(state: VimEditorState): VimEditorState {
  if (state.lastVisualSelection) {
    const { mode, anchor, cursor } = state.lastVisualSelection;
    const clampedAnchor = clampCursor(state.lines, anchor, mode);
    const clampedCursor = clampCursor(state.lines, cursor, mode);
    return {
      ...state,
      mode,
      visualAnchor: clampedAnchor,
      cursor: clampedCursor,
      pendingKeys: undefined,
    };
  }
  return {
    ...state,
    mode: 'VISUAL',
    visualAnchor: { ...state.cursor },
    pendingKeys: undefined,
  };
}

/**
 * 'g;' 및 'g,' : Change List 순회 이동
 */
export function traverseChangeList(
  state: VimEditorState,
  direction: 'prev' | 'next',
  count = 1
): VimEditorState {
  const list = state.changeList ?? [];
  if (list.length === 0) {
    return {
      ...state,
      commandMessage: 'E662: 변경 목록이 비어 있습니다 (Empty changelist)',
      pendingKeys: undefined,
    };
  }

  // changeIndex가 없으면 최신 변경 뒤(list.length)에서 시작
  let idx = state.changeIndex ?? list.length;


  if (direction === 'prev') {
    // 만약 현재 커서가 이미 최신 변경 위치에 서 있다면, 한 단계 더 이전 변경으로 점프
    if (idx >= list.length && list.length > 0) {
      const last = list[list.length - 1];
      if (last.row === state.cursor.line && last.col === state.cursor.col) {
        idx = list.length - 1;
      }
    }

    if (idx <= 0) {
      const target = list[0];
      const clamped = clampCursor(state.lines, { line: target.row, col: target.col }, 'NORMAL');
      return {
        ...state,
        cursor: clamped,
        changeIndex: 0,
        commandMessage: 'E662: 변경 목록의 시작입니다 (At start of changelist)',
        pendingKeys: undefined,
      };
    }
    const newIdx = Math.max(0, idx - count);
    const target = list[newIdx];
    const clamped = clampCursor(state.lines, { line: target.row, col: target.col }, 'NORMAL');
    const stateWithJump = recordJump(state);
    return {
      ...stateWithJump,
      cursor: clamped,
      changeIndex: newIdx,
      commandMessage: `변경 목록 이전 위치 (${newIdx + 1}/${list.length})`,
      pendingKeys: undefined,
    };
  } else {
    // direction === 'next'
    if (idx >= list.length - 1) {
      const target = list[list.length - 1];
      const clamped = clampCursor(state.lines, { line: target.row, col: target.col }, 'NORMAL');
      return {
        ...state,
        cursor: clamped,
        changeIndex: list.length - 1,
        commandMessage: 'E663: 변경 목록의 끝입니다 (At end of changelist)',
        pendingKeys: undefined,
      };
    }
    const newIdx = Math.min(list.length - 1, idx + count);
    const target = list[newIdx];
    const clamped = clampCursor(state.lines, { line: target.row, col: target.col }, 'NORMAL');
    const stateWithJump = recordJump(state);
    return {
      ...stateWithJump,
      cursor: clamped,
      changeIndex: newIdx,
      commandMessage: `변경 목록 다음 위치 (${newIdx + 1}/${list.length})`,
      pendingKeys: undefined,
    };
  }
}

/**
 * 텍스트 변경 위치를 changeList에 누적 기록합니다.
 * 동일한 줄에서 연속된 변경은 하나로 병합(Vim 스펙)됩니다.
 */
export function recordChangePosition(
  changeList: ChangeListItem[] | undefined,
  pos: CursorPosition
): { changeList: ChangeListItem[]; changeIndex: number } {
  const list = changeList ? [...changeList] : [];
  const last = list[list.length - 1];

  if (last && last.row === pos.line) {
    list[list.length - 1] = { row: pos.line, col: pos.col, line: pos.line };
  } else {
    list.push({ row: pos.line, col: pos.col, line: pos.line });
    if (list.length > 50) {
      list.shift();
    }
  }

  return {
    changeList: list,
    changeIndex: list.length,
  };
}

/**
 * :changes 명령어를 위한 체인지 리스트 포맷팅 문자열을 생성합니다.
 */
export function formatChangeList(state: VimEditorState): string {
  const list = state.changeList ?? [];
  if (list.length === 0) {
    return 'E664: 변경 목록이 비어 있습니다 (changelist is empty)';
  }

  const header = 'change line  col text';
  const lines = list.map((item, idx) => {
    const isCurrent = idx === state.changeIndex;
    const mark = isCurrent ? '>' : ' ';
    const num = String(idx + 1).padStart(5, ' ');
    const lineNum = String(item.line + 1).padStart(5, ' ');
    const colNum = String(item.col + 1).padStart(4, ' ');
    const textPreview = (state.lines[item.line] ?? '').trim();
    return `${mark} ${num} ${lineNum} ${colNum} ${textPreview}`;
  });

  return [header, ...lines].join('\n');
}

