import {
  CursorPosition,
  MultiCursorSelection,
  MultiCursorSession,
  VimEditorState,
} from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { getWordAtCursor } from './search';
import { msg } from './messages';

function findAllLiteralOccurrences(
  lines: string[],
  query: string
): MultiCursorSelection[] {
  if (!query) return [];
  const res: MultiCursorSelection[] = [];
  for (let l = 0; l < lines.length; l++) {
    const text = lines[l] ?? '';
    let idx = 0;
    while (idx <= text.length - query.length) {
      const found = text.indexOf(query, idx);
      if (found === -1) break;
      res.push({ line: l, startCol: found, endCol: found + query.length - 1 });
      idx = found + query.length;
    }
  }
  return res;
}

function findWordSpanAtCursor(
  lineText: string,
  col: number
): { word: string; startCol: number; endCol: number } | null {
  const word = getWordAtCursor(lineText, col);
  if (!word) return null;
  // 커서를 포함하는 단어의 정확한 시작·끝 열 계산
  let start = Math.min(col, Math.max(0, lineText.length - 1));
  while (start > 0 && /[A-Za-z0-9_$]/.test(lineText[start - 1])) start--;
  let end = start;
  while (end + 1 < lineText.length && /[A-Za-z0-9_$]/.test(lineText[end + 1])) end++;
  const extracted = lineText.slice(start, end + 1);
  if (extracted) return { word: extracted, startCol: start, endCol: end };
  const idx = lineText.indexOf(word, Math.max(0, col - word.length));
  if (idx === -1) return null;
  return { word, startCol: idx, endCol: idx + word.length - 1 };
}

function sameSelection(a: MultiCursorSelection, b: MultiCursorSelection): boolean {
  return a.line === b.line && a.startCol === b.startCol && a.endCol === b.endCol;
}

function posCompare(a: { line: number; col: number }, b: { line: number; col: number }): number {
  return a.line !== b.line ? a.line - b.line : a.col - b.col;
}

/**
 * 다중 커서 세션을 시작합니다 (Normal `g Ctrl-n`, `:MultiCursor [query]`, `:MultiCursorAll [query]`).
 */
export function startMultiCursor(
  state: VimEditorState,
  options: { query?: string; selectAll?: boolean } = {}
): VimEditorState {
  const curLine = state.lines[state.cursor.line] ?? '';
  let query = (options.query ?? '').trim();
  let initialSel: MultiCursorSelection | null = null;

  if (!query) {
    const span = findWordSpanAtCursor(curLine, state.cursor.col);
    if (!span) {
      return {
        ...state,
        bell: true,
        pendingKeys: undefined,
        commandMessage: msg('[MultiCursor] 커서 위치에 선택할 단어가 없습니다'),
      };
    }
    query = span.word;
    initialSel = { line: state.cursor.line, startCol: span.startCol, endCol: span.endCol };
  }

  const allMatches = findAllLiteralOccurrences(state.lines, query);
  if (allMatches.length === 0) {
    return {
      ...state,
      bell: true,
      pendingKeys: undefined,
      commandMessage: msg('[MultiCursor] 일치하는 항목이 없습니다: "{query}"', { query }),
    };
  }

  const selections = options.selectAll
    ? allMatches
    : [initialSel ?? allMatches.find((m) => posCompare({ line: m.line, col: m.startCol }, state.cursor) >= 0) ?? allMatches[0]];

  const cursors = selections.map((s) => ({ line: s.line, col: s.startCol }));
  const session: MultiCursorSession = {
    isOpen: true,
    submode: 'select',
    query,
    selections,
    cursors,
  };

  return {
    ...state,
    mode: 'NORMAL',
    cursor: cursors[cursors.length - 1],
    pendingKeys: undefined,
    multiCursor: session,
    commandMessage: msg('[MultiCursor] "{query}" ({count}개 선택 · Ctrl-n 추가 · c/i/a 편집 · Esc 종료)', {
      query,
      count: selections.length,
    }),
  };
}

/**
 * 다중 커서 세션을 종료하고 NORMAL 모드로 복귀합니다.
 */
export function exitMultiCursor(state: VimEditorState): VimEditorState {
  const session = state.multiCursor;
  if (!session?.isOpen) return state;
  const primary = session.cursors[0] ?? state.cursor;
  return {
    ...state,
    mode: 'NORMAL',
    cursor: clampCursor(state.lines, primary, 'NORMAL'),
    multiCursor: null,
    pendingKeys: undefined,
    commandMessage: msg('[MultiCursor] 다중 커서 편집 종료'),
  };
}

function addNextOccurrence(state: VimEditorState, skipLast = false): VimEditorState {
  const session = state.multiCursor;
  if (!session?.isOpen) return state;

  const allMatches = findAllLiteralOccurrences(state.lines, session.query);
  if (allMatches.length === 0) return { ...state, bell: true };

  const lastSel = session.selections[session.selections.length - 1];
  const baseSelections =
    skipLast && session.selections.length > 0
      ? session.selections.slice(0, -1)
      : [...session.selections];

  const lastIdx = allMatches.findIndex((m) => sameSelection(m, lastSel));
  let chosen: MultiCursorSelection | null = null;
  for (let offset = 1; offset <= allMatches.length; offset++) {
    const cand = allMatches[(Math.max(0, lastIdx) + offset) % allMatches.length];
    if (!baseSelections.some((s) => sameSelection(s, cand))) {
      chosen = cand;
      break;
    }
  }

  if (!chosen) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[MultiCursor] 더 이상 추가할 "{query}" 매치가 없습니다 ({count}개)', {
        query: session.query,
        count: session.selections.length,
      }),
    };
  }

  const nextSelections = [...baseSelections, chosen];
  const nextCursors = nextSelections.map((s) => ({ line: s.line, col: s.startCol }));
  return {
    ...state,
    cursor: nextCursors[nextCursors.length - 1],
    multiCursor: {
      ...session,
      selections: nextSelections,
      cursors: nextCursors,
    },
    commandMessage: msg('[MultiCursor] "{query}" ({count}개 선택 · Ctrl-n 추가 · c/i/a 편집 · Esc 종료)', {
      query: session.query,
      count: nextSelections.length,
    }),
  };
}

function deleteSelectionsAndMaybeInsert(
  state: VimEditorState,
  enterInsert: boolean
): VimEditorState {
  const session = state.multiCursor;
  if (!session?.isOpen || session.selections.length === 0) return exitMultiCursor(state);

  const withUndo = pushUndoSnapshot(state);
  const nextLines = [...state.lines];

  // 문서 앞 -> 뒤 순서로 정렬해 각 줄의 오프셋 누적 보정
  const sorted = [...session.selections].sort(
    (a, b) => a.line - b.line || a.startCol - b.startCol
  );
  const lineShift: Record<number, number> = {};
  const nextCursors: CursorPosition[] = [];

  for (const sel of sorted) {
    const shift = lineShift[sel.line] ?? 0;
    const adjStart = Math.max(0, sel.startCol - shift);
    const adjEnd = Math.max(adjStart, sel.endCol - shift);
    const text = nextLines[sel.line] ?? '';
    nextLines[sel.line] = text.slice(0, adjStart) + text.slice(adjEnd + 1);
    const removedLen = adjEnd - adjStart + 1;
    lineShift[sel.line] = shift + removedLen;
    nextCursors.push({ line: sel.line, col: adjStart });
  }

  if (!enterInsert) {
    return {
      ...withUndo,
      lines: nextLines,
      mode: 'NORMAL',
      cursor: clampCursor(nextLines, nextCursors[0] ?? state.cursor, 'NORMAL'),
      multiCursor: null,
      commandMessage: msg('[MultiCursor] {count}개 선택 영역 삭제 완료', { count: sorted.length }),
    };
  }

  return {
    ...withUndo,
    lines: nextLines,
    mode: 'NORMAL',
    cursor: nextCursors[0] ?? state.cursor,
    multiCursor: {
      ...session,
      submode: 'insert',
      selections: [],
      cursors: nextCursors,
    },
    commandMessage: msg('[MultiCursor INSERT] {count}개 커서 동시 입력 중 (Esc 종료)', {
      count: nextCursors.length,
    }),
  };
}

function applyMultiCursorEdit(
  state: VimEditorState,
  op: { kind: 'insert'; char: string } | { kind: 'backspace' } | { kind: 'delete' }
): VimEditorState {
  const session = state.multiCursor;
  if (!session?.isOpen || session.submode !== 'insert') return state;

  const nextLines = [...state.lines];
  // 문서 앞 -> 뒤 정렬 후 각 줄별 delta 누적
  const sorted = [...session.cursors].sort((a, b) => a.line - b.line || a.col - b.col);
  const lineDelta: Record<number, number> = {};
  const nextCursors: CursorPosition[] = [];

  for (const cur of sorted) {
    const delta = lineDelta[cur.line] ?? 0;
    const col = Math.max(0, Math.min((nextLines[cur.line] ?? '').length, cur.col + delta));
    const text = nextLines[cur.line] ?? '';

    if (op.kind === 'insert') {
      nextLines[cur.line] = text.slice(0, col) + op.char + text.slice(col);
      lineDelta[cur.line] = delta + op.char.length;
      nextCursors.push({ line: cur.line, col: col + op.char.length });
    } else if (op.kind === 'backspace') {
      if (col > 0) {
        nextLines[cur.line] = text.slice(0, col - 1) + text.slice(col);
        lineDelta[cur.line] = delta - 1;
        nextCursors.push({ line: cur.line, col: col - 1 });
      } else {
        nextCursors.push({ line: cur.line, col: 0 });
      }
    } else {
      // delete
      if (col < text.length) {
        nextLines[cur.line] = text.slice(0, col) + text.slice(col + 1);
        lineDelta[cur.line] = delta - 1;
      }
      nextCursors.push({ line: cur.line, col });
    }
  }

  return {
    ...state,
    lines: nextLines,
    cursor: nextCursors[0] ?? state.cursor,
    multiCursor: {
      ...session,
      cursors: nextCursors,
    },
  };
}

/**
 * 다중 커서 세션 활성 중 키 입력을 처리합니다.
 */
export function handleMultiCursorKey(state: VimEditorState, key: string): VimEditorState {
  const session = state.multiCursor;
  if (!session?.isOpen) return state;

  if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c' || key === 'ctrl-c') {
    return exitMultiCursor(state);
  }

  if (session.submode === 'select') {
    if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'ctrl-n' || key === 'n') {
      return addNextOccurrence(state, false);
    }
    if (key === 'Ctrl-x' || key === 'Ctrl+x' || key === 'ctrl-x' || key === 'q') {
      return addNextOccurrence(state, true);
    }
    if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p' || key === 'N') {
      if (session.selections.length <= 1) return exitMultiCursor(state);
      const nextSelections = session.selections.slice(0, -1);
      const nextCursors = nextSelections.map((s) => ({ line: s.line, col: s.startCol }));
      return {
        ...state,
        cursor: nextCursors[nextCursors.length - 1],
        multiCursor: { ...session, selections: nextSelections, cursors: nextCursors },
        commandMessage: msg('[MultiCursor] "{query}" ({count}개 선택 · Ctrl-n 추가 · c/i/a 편집 · Esc 종료)', {
          query: session.query,
          count: nextSelections.length,
        }),
      };
    }
    if (key === 'c' || key === 's') {
      return deleteSelectionsAndMaybeInsert(state, true);
    }
    if (key === 'd' || key === 'x') {
      return deleteSelectionsAndMaybeInsert(state, false);
    }
    if (key === 'i' || key === 'I' || key === 'a' || key === 'A') {
      const atEnd = key === 'a' || key === 'A';
      const withUndo = pushUndoSnapshot(state);
      const nextCursors = session.selections.map((s) => ({
        line: s.line,
        col: atEnd
          ? Math.min((state.lines[s.line] ?? '').length, s.endCol + 1)
          : s.startCol,
      }));
      return {
        ...withUndo,
        cursor: nextCursors[0] ?? state.cursor,
        multiCursor: {
          ...session,
          submode: 'insert',
          selections: [],
          cursors: nextCursors,
        },
        commandMessage: msg('[MultiCursor INSERT] {count}개 커서 동시 입력 중 (Esc 종료)', {
          count: nextCursors.length,
        }),
      };
    }
    return state;
  }

  // submode === 'insert'
  if (key === 'Backspace' || key === 'Ctrl-h' || key === 'Ctrl+h') {
    return applyMultiCursorEdit(state, { kind: 'backspace' });
  }
  if (key === 'Delete') {
    return applyMultiCursorEdit(state, { kind: 'delete' });
  }
  if (key === 'ArrowLeft') {
    const nextCursors = session.cursors.map((c) => ({ line: c.line, col: Math.max(0, c.col - 1) }));
    return { ...state, cursor: nextCursors[0] ?? state.cursor, multiCursor: { ...session, cursors: nextCursors } };
  }
  if (key === 'ArrowRight') {
    const nextCursors = session.cursors.map((c) => ({
      line: c.line,
      col: Math.min((state.lines[c.line] ?? '').length, c.col + 1),
    }));
    return { ...state, cursor: nextCursors[0] ?? state.cursor, multiCursor: { ...session, cursors: nextCursors } };
  }
  if (key.length === 1) {
    return applyMultiCursorEdit(state, { kind: 'insert', char: key });
  }

  return state;
}
