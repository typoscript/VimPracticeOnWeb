import { VimEditorState, CursorPosition, ChangeListItem } from './types';
import { clampCursor } from './cursor';
import { recordJump } from './marks';
import { getWordAtCursor, escapeRegExp } from './search';
import { pushUndoSnapshot } from './operators';
import { msg } from './messages';

/**
 * 줄이 비어있거나 공백 문자만으로 구성되었는지 검사합니다. (Vim 문단 구분 기준)
 */
export function isBlankLine(lineText: string | undefined): boolean {
  if (lineText === undefined) return true;
  return lineText.trim().length === 0;
}

/**
 * Vim findpar(): '}' / '{' 의 목표 위치를 찾습니다.
 * - 문단 경계는 완전히 빈 줄입니다 (공백만 있는 줄은 경계가 아님. ip/ap 텍스트 객체와 다름).
 * - count 가 남았는데 버퍼 끝/처음에 닿으면 실패(null)이며 커서는 움직이지 않습니다.
 * - '}' 가 마지막 줄에서 멈추면 그 줄의 마지막 문자로 가고 모션은 inclusive 가 됩니다 (:help }).
 */
export function findParagraphTarget(
  lines: string[],
  cursor: CursorPosition,
  dir: 'next' | 'prev',
  count = 1
): { target: CursorPosition; inclusive: boolean } | null {
  const max = lines.length - 1;
  if (max < 0) return { target: { line: 0, col: 0 }, inclusive: false };
  const step = dir === 'next' ? 1 : -1;
  let curr = Math.max(0, Math.min(cursor.line, max));

  for (let remaining = Math.max(1, count); remaining > 0; ) {
    remaining--;
    let didSkip = false;
    for (let first = true; ; first = false) {
      if ((lines[curr] ?? '') !== '') didSkip = true;
      if (!first && didSkip && (lines[curr] ?? '') === '') break;
      curr += step;
      if (curr < 0 || curr > max) {
        if (remaining > 0) return null;
        curr -= step;
        break;
      }
    }
  }

  if (dir === 'next' && curr === max) {
    const len = (lines[curr] ?? '').length;
    if (len > 0) return { target: { line: curr, col: len - 1 }, inclusive: true };
  }
  return { target: { line: curr, col: 0 }, inclusive: false };
}

/**
 * '}' : 다음 문단 경계(빈 줄 또는 파일 끝)로 이동합니다. 실패하면 커서를 그대로 돌려줍니다.
 * @param count 반복 횟수 (기본 1)
 */
export function moveToNextParagraph(
  lines: string[],
  cursor: CursorPosition,
  count = 1
): CursorPosition {
  return findParagraphTarget(lines, cursor, 'next', count)?.target ?? cursor;
}

/** '}' 의 목표가 마지막 줄이면 inclusive 이므로 끝 문자까지 포함하는 배타적 끝 컬럼을 돌려줍니다. */
function paragraphEndCol(lines: string[], target: CursorPosition): number {
  return target.line === lines.length - 1 ? target.col + 1 : target.col;
}

/**
 * '{' : 이전 문단 경계(빈 줄 또는 파일 시작)로 이동합니다. 실패하면 커서를 그대로 돌려줍니다.
 * @param count 반복 횟수 (기본 1)
 */
export function moveToPrevParagraph(
  lines: string[],
  cursor: CursorPosition,
  count = 1
): CursorPosition {
  return findParagraphTarget(lines, cursor, 'prev', count)?.target ?? cursor;
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
      const endCol = paragraphEndCol(state.lines, target);
      let deleted: string;
      let nextLines: string[];
      if (cur.line === target.line) {
        deleted = startLineText.slice(cur.col, endCol);
        const newLine = startLineText.slice(0, cur.col) + startLineText.slice(endCol);
        nextLines = [...state.lines];
        nextLines[cur.line] = newLine;
      } else {
        const intermediate = state.lines.slice(cur.line + 1, target.line);
        deleted = [
          startLineText.slice(cur.col),
          ...intermediate,
          endLineText.slice(0, endCol),
        ].join('\n');
        const merged = startLineText.slice(0, cur.col) + endLineText.slice(endCol);
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
    // 문자 단위 변경은 삭제한 범위의 시작 위치에서 INSERT ('}' 는 커서, '{' 는 목표 위치)
    cursor: {
      line: cursorLine,
      col: isLinewise ? 0 : Math.min(direction === 'next' ? state.cursor.col : target.col, (nextLines[cursorLine] ?? '').length),
    },
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
      const endCol = paragraphEndCol(state.lines, target);
      let yanked: string;
      if (cur.line === target.line) {
        yanked = startLineText.slice(cur.col, endCol);
      } else {
        const intermediate = state.lines.slice(cur.line + 1, target.line);
        yanked = [
          startLineText.slice(cur.col),
          ...intermediate,
          endLineText.slice(0, endCol),
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
 * 'gd' / 'gD' : 로컬(local) 또는 전역(global) 선언부로 즉시 점프합니다.
 */
export function goToDeclaration(
  state: VimEditorState,
  scope: 'local' | 'global' = 'local'
): VimEditorState {
  const currentLine = state.lines[state.cursor.line] ?? '';
  const word = getWordAtCursor(currentLine, state.cursor.col);
  if (!word) {
    return { ...state, pendingKeys: undefined };
  }

  const escaped = escapeRegExp(word);
  const declRegex = new RegExp(`\\b(?:export\\s+)?(?:const|let|var|function|class|type|interface)\\s+${escaped}\\b`);
  const topLevelDeclRegex = new RegExp(`^(?:export\\s+)?(?:const|let|var|function|class|type|interface)\\s+${escaped}\\b`);
  const wordRegex = new RegExp(`\\b${escaped}\\b`);

  const jumpTo = (lineIdx: number, colIdx: number, fallback = false): VimEditorState => {
    const stateWithJump = recordJump(state);
    return {
      ...stateWithJump,
      cursor: clampCursor(state.lines, { line: lineIdx, col: Math.max(0, colIdx) }, 'NORMAL'),
      commandMessage: fallback
        ? msg('선언부(첫 등장)로 이동: {word} ({v}번째 줄)', { word, v: lineIdx + 1 })
        : msg('선언부로 이동: {word} ({v}번째 줄)', { word, v: lineIdx + 1 }),
      pendingKeys: undefined,
    };
  };

  const scanLines = (fromLine: number, regex: RegExp, findWordCol: boolean): VimEditorState | null => {
    for (let l = fromLine; l < state.lines.length; l++) {
      const text = state.lines[l] ?? '';
      const match = regex.exec(text);
      if (match) {
        const col = findWordCol ? text.indexOf(word, match.index) : match.index;
        return jumpTo(l, col, !findWordCol);
      }
    }
    return null;
  };

  if (scope === 'global') {
    // gD: 0열 최상위 전역 선언 우선 탐색 -> 전체 파일 선언 탐색 -> 첫 등장 fallback
    return (
      scanLines(0, topLevelDeclRegex, true) ??
      scanLines(0, declRegex, true) ??
      scanLines(0, wordRegex, false) ?? {
        ...state,
        commandMessage: msg('E486: 선언부를 찾을 수 없습니다: {word}', { word }),
        pendingKeys: undefined,
      }
    );
  }

  // gd: 현재 함수/블록 시작 행부터 탐색
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

  return (
    scanLines(functionStartLine, declRegex, true) ??
    scanLines(0, declRegex, true) ??
    scanLines(0, wordRegex, false) ?? {
      ...state,
      commandMessage: msg('E486: 선언부를 찾을 수 없습니다: {word}', { word }),
      pendingKeys: undefined,
    }
  );
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
  // Vim nv_gv: 이전 비주얼 선택이 없으면 벨만 울리고 NORMAL 유지
  return { ...state, pendingKeys: undefined, bell: true };
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
      commandMessage: msg('E664: 변경 목록이 비어 있습니다 (changelist is empty)'),
      pendingKeys: undefined,
      bell: true,
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
        commandMessage: msg('E662: 변경 목록의 시작입니다 (At start of changelist)'),
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
      commandMessage: msg('변경 목록 이전 위치 ({v}/{listCount})', { v: newIdx + 1, listCount: list.length }),
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
        commandMessage: msg('E663: 변경 목록의 끝입니다 (At end of changelist)'),
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
      commandMessage: msg('변경 목록 다음 위치 ({v}/{listCount})', { v: newIdx + 1, listCount: list.length }),
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
    return msg('E664: 변경 목록이 비어 있습니다 (changelist is empty)');
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

