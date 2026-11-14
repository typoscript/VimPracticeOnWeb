import { VimEditorState } from './types';
import { clampCursor, getMaxCol } from './cursor';
import { getRegisterContent } from './registers';
import { parseKeySequence } from './keymapEngine';
import { findMatchingAbbrev, isAbbrevTriggerKey } from './abbrevEngine';
import {
  startOrCycleCompletion,
  cancelCompletion,
  acceptCompletion,
  startFilenameCompletion,
  startWholeLineCompletion,
} from './completion';
import { getOptions } from './setEngine';
import { recordChangePosition } from './advancedMotions';
import {
  AbbrevReplayCtx,
  INITIAL_ABBREV_CTX,
  DispatchKeyFn,
  insertTextAtCursor,
} from './engineHelpers';

export function applyInsertAbbrev(
  state: VimEditorState,
  triggerKey: string,
  isReplayingDot: boolean,
  macroDepth: number,
  abbrevCtx: AbbrevReplayCtx,
  dispatchKey: DispatchKeyFn
): VimEditorState | null {
  if (abbrevCtx.depth >= 20) return null;
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';
  const match = findMatchingAbbrev(state, 'i', currentLine.slice(0, col), triggerKey, abbrevCtx.seen);
  if (!match) return null;

  const startCol = col - match.lhsLen;
  const nextLines = [...state.lines];
  nextLines[line] = currentLine.slice(0, startCol) + currentLine.slice(col);

  const nextBlock = state.blockInsertSession
    ? {
        ...state.blockInsertSession,
        typedChars: state.blockInsertSession.typedChars.slice(
          0,
          Math.max(0, state.blockInsertSession.typedChars.length - match.lhsLen)
        ),
      }
    : undefined;

  const nextChangeKeys =
    !isReplayingDot && state.currentChangeKeys
      ? state.currentChangeKeys.slice(0, Math.max(0, state.currentChangeKeys.length - match.lhsLen))
      : state.currentChangeKeys;

  let s: VimEditorState = {
    ...state,
    lines: nextLines,
    cursor: { line, col: startCol },
    pendingKeys: undefined,
    blockInsertSession: nextBlock,
    currentChangeKeys: nextChangeKeys,
  };

  const nextCtx: AbbrevReplayCtx = match.entry.noremap
    ? { depth: 99, seen: abbrevCtx.seen }
    : { depth: abbrevCtx.depth + 1, seen: new Set([...abbrevCtx.seen, match.entry.lhs]) };

  const tokens = parseKeySequence(match.entry.rhs, state.leaderKey || ' ');
  for (const tok of tokens) {
    s = dispatchKey(s, tok, isReplayingDot, macroDepth, nextCtx);
    if (s.bell) break;
  }

  if (
    triggerKey !== 'Ctrl-]' &&
    triggerKey !== 'Ctrl+]' &&
    triggerKey !== 'ctrl-]' &&
    triggerKey !== '<C-]>'
  ) {
    s = dispatchKey(s, triggerKey, isReplayingDot, macroDepth, nextCtx);
  }
  return s;
}

/**
 * INSERT 모드 키 입력 처리
 */
export function handleInsertModeKey(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  isReplayingDot = false,
  macroDepth = 0,
  abbrevCtx: AbbrevReplayCtx = INITIAL_ABBREV_CTX
): VimEditorState {
  const { line, col } = state.cursor;
  const currentLine = state.lines[line] ?? '';

  // 타임아웃 발생 시 대기 버퍼 초기화
  if (key === 'Timeout') {
    return {
      ...state,
      pendingKeys: undefined,
      insertRegisterPending: undefined,
      literalNextPending: undefined,
    };
  }

  // Ctrl+v 다음 문자 리터럴 삽입 (약어 확장 억제)
  if (state.literalNextPending) {
    if (key.length === 1 || key === 'Tab') {
      const ch = key === 'Tab' ? '\t' : key;
      const nextBlock = state.blockInsertSession
        ? { ...state.blockInsertSession, typedChars: [...state.blockInsertSession.typedChars, ch] }
        : undefined;
      const newLine = currentLine.slice(0, col) + ch + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      const nextChangeKeys =
        !isReplayingDot && state.currentChangeKeys
          ? [...state.currentChangeKeys, 'Ctrl-v', key]
          : state.currentChangeKeys;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col + ch.length },
        literalNextPending: undefined,
        blockInsertSession: nextBlock,
        currentChangeKeys: nextChangeKeys,
      };
    }
    state = { ...state, literalNextPending: undefined };
  }

  if (key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>') {
    return {
      ...state,
      literalNextPending: true,
    };
  }

  // Ctrl+r 레지스터 대기 상태 (INSERT_REGISTER_PENDING)
  if (state.insertRegisterPending) {
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      return { ...state, insertRegisterPending: undefined };
    }

    // Ctrl+r = (표현식 레지스터 입력 프롬프트)
    if (key === '=') {
      return {
        ...state,
        mode: 'COMMAND',
        commandType: '=',
        commandBuffer: '',
        insertRegisterPending: undefined,
        expressionReturnContext: {
          mode: 'INSERT',
          cursor: state.cursor,
        },
      };
    }

    // 레지스터 키 입력 (", 0~9, a~z, %, /, _, =)
    const regKey = key.length === 1 ? key : undefined;
    if (regKey) {
      const regClip = getRegisterContent(state, regKey);
      const textToInsert = regClip?.content ?? '';

      let nextState: VimEditorState = {
        ...state,
        insertRegisterPending: undefined,
      };

      if (textToInsert.length > 0) {
        nextState = insertTextAtCursor(nextState, textToInsert);
        if (!isReplayingDot && state.currentChangeKeys) {
          nextState.currentChangeKeys = [...state.currentChangeKeys, 'Ctrl-r', regKey];
        }
      }

      return nextState;
    }

    return { ...state, insertRegisterPending: undefined };
  }

  // Ctrl+r: 레지스터 즉시 삽입 대기 상태 진입
  if (key === 'Ctrl-r' || key === 'Ctrl+r' || key === 'ctrl-r' || key === '<C-r>') {
    return {
      ...state,
      insertRegisterPending: true,
    };
  }

  // 커스텀 키매핑 검사 (예: Insert 모드 jk 또는 jj -> <Esc>)
  if (state.pendingKeys) {
    const combined = `${state.pendingKeys}${key}`;
    const mapped =
      state.userKeymaps?.[`i:${combined}`] ||
      state.userKeymaps?.[combined];

    if (mapped === '<Esc>' || mapped === '<esc>' || mapped === 'Escape') {
      // 직전에 입력되어 버퍼에 기록된 pendingKeys 문자(예: 'j')를 삭제
      const cleanedLine =
        currentLine.slice(0, Math.max(0, col - 1)) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = cleanedLine;
      const nextCol = Math.max(0, col - 2);

      let nextLastChange = state.lastChangeKeys;
      if (!isReplayingDot && state.currentChangeKeys) {
        nextLastChange = [...state.currentChangeKeys.slice(0, -1), 'Escape'];
      }

      const lastPos = { line, col: nextCol, row: line };
      const changeRecord = recordChangePosition(state.changeList, { line, col: nextCol });

      return {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line, col: nextCol }, 'NORMAL'),
        pendingKeys: undefined,
        lastChangeKeys: nextLastChange,
        currentChangeKeys: undefined,
        lastInsertPos: lastPos,
        changeList: changeRecord.changeList,
        changeIndex: changeRecord.changeIndex,
        marks: { ...(state.marks ?? {}), '^': { row: line, col: nextCol } },
      };
    } else if (mapped) {
      // 일반 Insert 모드 커스텀 키매핑 확장
      const cleanedLine =
        currentLine.slice(0, Math.max(0, col - 1)) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = cleanedLine;
      const nextCol = Math.max(0, col - 1);
      let s: VimEditorState = {
        ...state,
        lines: nextLines,
        cursor: { line, col: nextCol },
        pendingKeys: undefined,
      };
      const tokens = parseKeySequence(mapped, state.leaderKey || ' ');
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, 1);
        if (s.bell) break;
      }
      return s;
    }
  }

  // 1. Ctrl+x 자동완성 서브모드 진입 (^X mode)
  if (key === 'Ctrl-x' || key === 'Ctrl+x') {
    return {
      ...state,
      insertCtrlXMode: true,
      commandMessage: undefined,
    };
  }

  // 2. ^X mode 상태에서의 서브 자동완성 명령 처리
  if (state.insertCtrlXMode) {
    if (key === 'Ctrl-f' || key === 'Ctrl+f' || key === 'f') {
      return startFilenameCompletion(state, 'next');
    }
    if (key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'l') {
      return startWholeLineCompletion(state, 'next');
    }
    if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'n') {
      return startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'next');
    }
    if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'p') {
      return startOrCycleCompletion({ ...state, insertCtrlXMode: false }, 'prev');
    }
    if (key === 'Escape' || key === 'Ctrl-e' || key === 'Ctrl+e') {
      return { ...state, insertCtrlXMode: false };
    }
    // 기타 키 입력 시 ^X mode 해제 후 계속 진행
    state = { ...state, insertCtrlXMode: false };
  }

  // 자동완성 (Ctrl+n / Ctrl+p / Ctrl+e / Ctrl+y)
  if (key === 'Ctrl-n' || key === 'Ctrl+n' || key === 'Alt-n' || key === 'Alt+n') {
    return startOrCycleCompletion(state, 'next');
  }
  if (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'Alt-p' || key === 'Alt+p') {
    return startOrCycleCompletion(state, 'prev');
  }
  if (key === 'Ctrl-e' || key === 'Ctrl+e') {
    if (state.completionSession) {
      return cancelCompletion(state);
    }
  }
  if (key === 'Ctrl-y' || key === 'Ctrl+y' || (key === 'Enter' && state.completionSession)) {
    if (state.completionSession) {
      return acceptCompletion(state);
    }
  }

  if (state.completionSession) {
    if (key === 'ArrowDown') {
      return startOrCycleCompletion(state, 'next');
    }
    if (key === 'ArrowUp') {
      return startOrCycleCompletion(state, 'prev');
    }
  }

  // 자동완성 이외의 키가 입력되면 활성 자동완성 세션 해제
  if (state.completionSession) {
    state = { ...state, completionSession: null };
  }

  // Ctrl-]: 수동 약어 확장 (트리거 키 삽입 없이 약어만 치환)
  if (key === 'Ctrl-]' || key === 'Ctrl+]' || key === 'ctrl-]' || key === '<C-]>') {
    return applyInsertAbbrev(state, 'Ctrl-]', isReplayingDot, macroDepth, abbrevCtx, dispatchKey) ?? state;
  }

  // INSERT 모드 약어 자동 확장 (비단어 문자, Space, Enter, Tab, Escape)
  if (isAbbrevTriggerKey(key, true)) {
    const expanded = applyInsertAbbrev(state, key, isReplayingDot, macroDepth, abbrevCtx, dispatchKey);
    if (expanded) return expanded;
  }

  // Ctrl+o: 단 1회의 Normal 명령 실행 (INSERT (normal))
  if (key === 'Ctrl-o' || key === 'Ctrl+o' || key === 'Alt-o' || key === 'Alt+o') {
    return {
      ...state,
      mode: 'NORMAL',
      insertNormalSession: true,
      cursor: clampCursor(state.lines, state.cursor, 'NORMAL'),
      pendingKeys: undefined,
    };
  }

  // ESC: NORMAL 모드로 복귀 (커서 1칸 좌측 보정)
  if (key === 'Escape') {
    // 비주얼 블록(Ctrl+v) 삽입 세션 중인 경우 나머지 행에 일괄 복제 반영
    if (state.blockInsertSession) {
      const {
        typedChars,
        lines: targetLines,
        col: insertCol,
        insertMode,
        endOfLine,
        minCol = 0,
        skippedLines,
      } = state.blockInsertSession;
      const insertedText = typedChars.join('');
      const skippedSet = skippedLines ? new Set(skippedLines) : null;
      const nextLines = [...state.lines];

      for (let i = 1; i < targetLines.length; i++) {
        const lineIdx = targetLines[i];
        if (skippedSet?.has(lineIdx)) continue;
        let lineText = nextLines[lineIdx] ?? '';
        if (endOfLine) {
          nextLines[lineIdx] = lineText + insertedText;
        } else if (insertMode === 'A') {
          if (insertedText.length > 0) {
            if (lineText.length < insertCol) {
              lineText = lineText.padEnd(insertCol, ' ');
            }
            nextLines[lineIdx] = lineText.slice(0, insertCol) + insertedText + lineText.slice(insertCol);
          }
        } else if (insertMode === 'I') {
          if (insertCol === 0 || lineText.length > insertCol) {
            nextLines[lineIdx] = lineText.slice(0, insertCol) + insertedText + lineText.slice(insertCol);
          }
        } else {
          const cCol = Math.min(minCol, lineText.length);
          nextLines[lineIdx] = lineText.slice(0, cCol) + insertedText + lineText.slice(cCol);
        }
      }

      const firstLineIdx = targetLines[0];
      const nextCol = Math.max(0, col - 1);
      const lastPos = { line: firstLineIdx, col: insertCol, row: firstLineIdx };
      const changeRecord = recordChangePosition(state.changeList, { line: firstLineIdx, col: insertCol });

      return {
        ...state,
        lines: nextLines,
        mode: 'NORMAL',
        cursor: clampCursor(nextLines, { line: firstLineIdx, col: nextCol }, 'NORMAL'),
        blockInsertSession: null,
        pendingKeys: undefined,
        currentChangeKeys: undefined,
        lastInsertPos: lastPos,
        changeList: changeRecord.changeList,
        changeIndex: changeRecord.changeIndex,
        marks: { ...(state.marks ?? {}), '^': { row: firstLineIdx, col: insertCol } },
      };
    }

    const nextCol = Math.max(0, col - 1);

    let nextLastChange = state.lastChangeKeys;
    if (!isReplayingDot && state.currentChangeKeys) {
      nextLastChange = [...state.currentChangeKeys, 'Escape'];
    }

    const lastPos = { line, col, row: line };
    const changeRecord = recordChangePosition(state.changeList, { line, col });

    return {
      ...state,
      mode: 'NORMAL',
      cursor: clampCursor(state.lines, { line, col: nextCol }, 'NORMAL'),
      pendingKeys: undefined,
      lastChangeKeys: nextLastChange,
      currentChangeKeys: undefined,
      lastInsertPos: lastPos,
      changeList: changeRecord.changeList,
      changeIndex: changeRecord.changeIndex,
      marks: { ...(state.marks ?? {}), '^': { row: line, col } },
    };
  }

  // 키 입력 기록 (Dot Repeat 용)
  const appendCurrentChange = (k: string) => {
    if (isReplayingDot || !state.currentChangeKeys) return state.currentChangeKeys;
    return [...state.currentChangeKeys, k];
  };

  // Ctrl+w: 커서 앞의 단어 하나 즉시 삭제
  if (key === 'Ctrl-w' || key === 'Ctrl+w' || key === 'Alt-w' || key === 'Alt+w') {
    const nextChangeKeys = appendCurrentChange('Ctrl-w');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }
    if (col > 0) {
      let start = col;
      while (start > 0 && /\s/.test(currentLine[start - 1])) {
        start--;
      }
      if (start > 0) {
        const isWordChar = /\w/.test(currentLine[start - 1]);
        while (
          start > 0 &&
          (isWordChar
            ? /\w/.test(currentLine[start - 1])
            : !/\w/.test(currentLine[start - 1]) && !/\s/.test(currentLine[start - 1]))
        ) {
          start--;
        }
      }
      const newLine = currentLine.slice(0, start) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: start },
        currentChangeKeys: nextChangeKeys,
      };
    }
    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Ctrl+u: 현재 줄의 커서 앞쪽 내용을 줄 시작까지 통째로 삭제
  if (key === 'Ctrl-u' || key === 'Ctrl+u' || key === 'Alt-u' || key === 'Alt+u') {
    const nextChangeKeys = appendCurrentChange('Ctrl-u');
    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }
    const newLine = currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: 0 },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // Backspace 또는 Ctrl+h: 이전 문자 삭제 또는 윗줄과 병합
  if (
    key === 'Backspace' ||
    key === 'Ctrl-h' ||
    key === 'Ctrl+h' ||
    key === 'Alt-h' ||
    key === 'Alt+h'
  ) {
    if (state.blockInsertSession) {
      const updatedChars = state.blockInsertSession.typedChars.slice(0, -1);
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange('Backspace');

    if (col > 0) {
      const newLine = currentLine.slice(0, col - 1) + currentLine.slice(col);
      const nextLines = [...state.lines];
      nextLines[line] = newLine;
      return {
        ...state,
        lines: nextLines,
        cursor: { line, col: col - 1 },
        currentChangeKeys: nextChangeKeys,
      };
    }

    if (col === 0 && line > 0) {
      const prevLine = state.lines[line - 1] ?? '';
      const mergedLine = prevLine + currentLine;
      const nextLines = [
        ...state.lines.slice(0, line - 1),
        mergedLine,
        ...state.lines.slice(line + 1),
      ];
      return {
        ...state,
        lines: nextLines,
        cursor: { line: line - 1, col: prevLine.length },
        currentChangeKeys: nextChangeKeys,
      };
    }

    return { ...state, currentChangeKeys: nextChangeKeys };
  }

  // Enter: 줄 분할 및 다음 줄 맨 앞으로 이동
  if (key === 'Enter') {
    const nextChangeKeys = appendCurrentChange('Enter');
    const firstPart = currentLine.slice(0, col);
    const secondPart = currentLine.slice(col);

    const nextLines = [
      ...state.lines.slice(0, line),
      firstPart,
      secondPart,
      ...state.lines.slice(line + 1),
    ];

    return {
      ...state,
      lines: nextLines,
      cursor: { line: line + 1, col: 0 },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // Tab: 들여쓰기 삽입 (tabstop / shiftwidth / expandtab 설정 반영)
  if (key === 'Tab') {
    const nextChangeKeys = appendCurrentChange('Tab');
    const opts = getOptions(state);
    const ts = opts.tabstop || opts.shiftwidth || 2;
    const et = opts.expandtab !== false;
    const indent = et ? ' '.repeat(ts) : '\t';
    if (state.blockInsertSession) {
      const updatedChars = [...state.blockInsertSession.typedChars, ...indent.split('')];
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const newLine = currentLine.slice(0, col) + indent + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + indent.length },
      currentChangeKeys: nextChangeKeys,
    };
  }

  // 방향키 이동 지원
  if (key === 'ArrowLeft') {
    return {
      ...state,
      cursor: { line, col: Math.max(0, col - 1) },
    };
  }

  if (key === 'ArrowRight') {
    return {
      ...state,
      cursor: { line, col: Math.min(currentLine.length, col + 1) },
    };
  }

  if (key === 'ArrowUp') {
    const targetLine = Math.max(0, line - 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  if (key === 'ArrowDown') {
    const targetLine = Math.min(state.lines.length - 1, line + 1);
    const targetText = state.lines[targetLine] ?? '';
    return {
      ...state,
      cursor: { line: targetLine, col: Math.min(col, targetText.length) },
    };
  }

  // 일반 타이핑 문자 입력 (길이가 1인 모든 문자 및 공백)
  if (key.length === 1) {
    if (state.blockInsertSession) {
      const updatedChars = [...state.blockInsertSession.typedChars, key];
      state = {
        ...state,
        blockInsertSession: {
          ...state.blockInsertSession,
          typedChars: updatedChars,
        },
      };
    }
    const nextChangeKeys = appendCurrentChange(key);
    const newLine = currentLine.slice(0, col) + key + currentLine.slice(col);
    const nextLines = [...state.lines];
    nextLines[line] = newLine;
    // 현재 입력된 문자가 Insert 모드 다중 키 매핑의 접두사인지 확인 (예: 'jk'의 'j')
    const isMappingPrefix = Object.keys(state.userKeymaps ?? {}).some((k) => {
      const from = k.startsWith('i:') ? k.slice(2) : k;
      return from.length > 1 && from.startsWith(key);
    });

    return {
      ...state,
      lines: nextLines,
      cursor: { line, col: col + 1 },
      pendingKeys: isMappingPrefix ? key : undefined,
      currentChangeKeys: nextChangeKeys,
    };
  }

  return state;
}

/**
 * REPLACE (R) 모드 키 입력 처리:
 * 1:1 글자 덮어쓰기 및 Backspace 시 원본 글자 복원
 */
export function handleReplaceModeKey(
  state: VimEditorState,
  key: string,
  isReplayingDot = false,
  _macroDepth = 0
): VimEditorState {
  if (key === 'Escape') {
    const curLine = state.lines[state.cursor.line] ?? '';
    const maxCol = getMaxCol(curLine, 'NORMAL');
    const newCol = Math.max(0, Math.min(state.cursor.col - 1, maxCol));
    const nextLastChange = state.currentChangeKeys ? [...state.currentChangeKeys, 'Escape'] : undefined;
    return {
      ...state,
      mode: 'NORMAL',
      cursor: { line: state.cursor.line, col: newCol },
      replaceStack: undefined,
      currentChangeKeys: undefined,
      lastChangeKeys: isReplayingDot ? state.lastChangeKeys : nextLastChange,
    };
  }

  if (key === 'Backspace') {
    const stack = state.replaceStack ?? [];
    if (stack.length === 0) {
      // 교체 모드 진입 지점 이전으로는 백스페이스 이동 불가
      return state;
    }
    const last = stack[stack.length - 1];
    const newStack = stack.slice(0, -1);
    const lineIdx = last.line;
    const curLine = state.lines[lineIdx] ?? '';
    let newLine: string;

    if (last.char === '') {
      // 줄 끝을 초과하여 덧붙여졌던 문자 삭제
      newLine = curLine.slice(0, last.col) + curLine.slice(last.col + 1);
    } else {
      // 덮어써졌던 원본 문자 복구
      newLine = curLine.slice(0, last.col) + last.char + curLine.slice(last.col + 1);
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Backspace'] : undefined;

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: last.col },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'Enter') {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const before = curLine.slice(0, col);
    const after = curLine.slice(col);
    const nextLines = [
      ...state.lines.slice(0, lineIdx),
      before,
      after,
      ...state.lines.slice(lineIdx + 1),
    ];
    const nextChangeKeys = state.currentChangeKeys ? [...state.currentChangeKeys, 'Enter'] : undefined;
    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx + 1, col: 0 },
      replaceStack: [],
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  if (key === 'ArrowLeft') {
    return { ...state, cursor: { line: state.cursor.line, col: Math.max(0, state.cursor.col - 1) } };
  }
  if (key === 'ArrowRight') {
    return { ...state, cursor: { line: state.cursor.line, col: state.cursor.col + 1 } };
  }
  if (key === 'ArrowUp') {
    return { ...state, cursor: { line: Math.max(0, state.cursor.line - 1), col: state.cursor.col } };
  }
  if (key === 'ArrowDown') {
    return { ...state, cursor: { line: Math.min(state.lines.length - 1, state.cursor.line + 1), col: state.cursor.col } };
  }

  // 단일 입력 문자 1:1 덮어쓰기
  if (key.length === 1) {
    const lineIdx = state.cursor.line;
    const col = state.cursor.col;
    const curLine = state.lines[lineIdx] ?? '';
    const stack = state.replaceStack ?? [];

    let newLine: string;
    let oldChar = '';

    if (col < curLine.length) {
      oldChar = curLine[col];
      newLine = curLine.slice(0, col) + key + curLine.slice(col + 1);
    } else {
      const padding = ' '.repeat(col - curLine.length);
      newLine = curLine + padding + key;
      oldChar = '';
    }

    const nextLines = [...state.lines];
    nextLines[lineIdx] = newLine;
    const newStack = [...stack, { char: oldChar, line: lineIdx, col }];
    const nextChangeKeys = state.currentChangeKeys
      ? [...state.currentChangeKeys, key]
      : ['R', key];

    return {
      ...state,
      lines: nextLines,
      cursor: { line: lineIdx, col: col + 1 },
      replaceStack: newStack,
      currentChangeKeys: isReplayingDot ? state.currentChangeKeys : nextChangeKeys,
    };
  }

  return state;
}
