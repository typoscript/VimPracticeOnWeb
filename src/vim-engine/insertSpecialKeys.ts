import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { getRegisterContent } from './registers';
import { recordChangePosition } from './advancedMotions';
import { lookupDigraph } from './digraphs';
import { insertTextAtCursor } from './engineHelpers';

export function resolveLastInsertedText(state: VimEditorState, candidate?: string): string | undefined {
  const txt = candidate !== undefined ? candidate : state.currentInsertText;
  return txt && txt.length > 0 ? txt : state.lastInsertedText;
}

function insertLiteralChar(
  targetState: VimEditorState,
  ch: string,
  extraChangeKeys: string[],
  isReplayingDot: boolean
): VimEditorState {
  const tLine = targetState.cursor.line;
  const tCol = targetState.cursor.col;
  const lineStr = targetState.lines[tLine] ?? '';
  const nextBlock = targetState.blockInsertSession
    ? { ...targetState.blockInsertSession, typedChars: [...targetState.blockInsertSession.typedChars, ch] }
    : undefined;
  const nextLines = [...targetState.lines];
  nextLines[tLine] = lineStr.slice(0, tCol) + ch + lineStr.slice(tCol);
  const nextChangeKeys =
    !isReplayingDot && targetState.currentChangeKeys
      ? [...targetState.currentChangeKeys, ...extraChangeKeys]
      : targetState.currentChangeKeys;
  return {
    ...targetState,
    lines: nextLines,
    cursor: { line: tLine, col: tCol + ch.length },
    literalNextPending: undefined,
    blockInsertSession: nextBlock,
    currentChangeKeys: nextChangeKeys,
    currentInsertText: (targetState.currentInsertText ?? '') + ch,
  };
}

/**
 * Ctrl+v 리터럴 삽입 및 uXXXX / UXXXXXXXX 유니코드 16진수 코드 포인트 입력
 */
export function handleInsertLiteralNext(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): { handled: boolean; state: VimEditorState } {
  if (state.literalNextPending) {
    if (typeof state.literalNextPending === 'object') {
      const { kind, digits } = state.literalNextPending;
      const prefixKey = kind === 'hex4' ? 'u' : 'U';
      const maxLen = kind === 'hex4' ? 4 : 8;
      const decodeHex = (): string | null => {
        if (!digits) return null;
        const cp = parseInt(digits, 16);
        if (Number.isNaN(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
          return null;
        }
        return String.fromCodePoint(cp);
      };

      if (/^[0-9a-fA-F]$/.test(key)) {
        const nextDigits = digits + key;
        if (nextDigits.length >= maxLen) {
          const cp = parseInt(nextDigits, 16);
          const ch =
            !Number.isNaN(cp) && cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)
              ? String.fromCodePoint(cp)
              : '';
          return {
            handled: true,
            state: ch
              ? insertLiteralChar(state, ch, ['Ctrl-v', prefixKey, ...nextDigits], isReplayingDot)
              : { ...state, literalNextPending: undefined },
          };
        }
        return {
          handled: true,
          state: {
            ...state,
            literalNextPending: { kind, digits: nextDigits },
          },
        };
      }

      const resolved = decodeHex();
      const afterHex: VimEditorState = resolved
        ? insertLiteralChar(
            state,
            resolved,
            ['Ctrl-v', prefixKey, ...digits, key === 'Enter' || key === ' ' ? key : ''].filter(Boolean),
            isReplayingDot
          )
        : { ...state, literalNextPending: undefined };

      // 16진수 조기 종료 후 Enter/Space가 아닌 키(예: Escape, 일반 문자)는 이어서 정상 처리
      if (key === 'Enter' || key === ' ') {
        return { handled: true, state: afterHex };
      }
      return { handled: false, state: afterHex };
    }

    if (key === 'u') {
      return { handled: true, state: { ...state, literalNextPending: { kind: 'hex4', digits: '' } } };
    }
    if (key === 'U') {
      return { handled: true, state: { ...state, literalNextPending: { kind: 'hex8', digits: '' } } };
    }
    if (key.length === 1 || key === 'Tab') {
      const ch = key === 'Tab' ? '\t' : key;
      return { handled: true, state: insertLiteralChar(state, ch, ['Ctrl-v', key], isReplayingDot) };
    }
    return { handled: false, state: { ...state, literalNextPending: undefined } };
  }

  if (key === 'Ctrl-v' || key === 'Ctrl+v' || key === 'ctrl-v' || key === '<C-v>') {
    return {
      handled: true,
      state: {
        ...state,
        literalNextPending: true,
      },
    };
  }

  return { handled: false, state };
}

/**
 * Ctrl+k 다이그래프 입력 (Ctrl-k {c1}{c2} -> 특수/유니코드 문자 삽입, :help i_CTRL-K)
 */
export function handleInsertDigraph(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): { handled: boolean; state: VimEditorState } {
  if (state.digraphPending !== undefined && state.digraphPending !== null) {
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      return { handled: true, state: { ...state, digraphPending: undefined } };
    }
    if (state.digraphPending === '') {
      if (key.length === 1) {
        return { handled: true, state: { ...state, digraphPending: key } };
      }
      if (key === 'Backspace') {
        return { handled: true, state: { ...state, digraphPending: undefined } };
      }
      return { handled: false, state: { ...state, digraphPending: undefined } };
    } else {
      const c1 = state.digraphPending;
      if (key.length === 1) {
        const { char: ch } = lookupDigraph(c1, key, state.userDigraphs);
        const inserted = insertTextAtCursor({ ...state, digraphPending: undefined }, ch);
        const nextChangeKeys =
          !isReplayingDot && state.currentChangeKeys
            ? [...state.currentChangeKeys, 'Ctrl-k', c1, key]
            : state.currentChangeKeys;
        return {
          handled: true,
          state: {
            ...inserted,
            currentChangeKeys: nextChangeKeys,
          },
        };
      }
      if (key === 'Backspace') {
        return { handled: true, state: { ...state, digraphPending: undefined } };
      }
      return { handled: false, state: { ...state, digraphPending: undefined } };
    }
  }

  if (key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ctrl-k' || key === '<C-k>') {
    return {
      handled: true,
      state: {
        ...state,
        digraphPending: '',
        completionSession: state.completionSession ? null : state.completionSession,
      },
    };
  }

  return { handled: false, state };
}

/**
 * Ctrl+r 레지스터 삽입 및 대기 상태 (INSERT_REGISTER_PENDING)
 */
export function handleInsertRegister(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): VimEditorState | null {
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

  return null;
}

function exitInsertToNormal(state: VimEditorState, isReplayingDot: boolean): VimEditorState {
  const { line, col } = state.cursor;
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
    digraphPending: undefined,
    lastChangeKeys: nextLastChange,
    currentChangeKeys: undefined,
    lastInsertedText: resolveLastInsertedText(state),
    currentInsertText: undefined,
    lastInsertPos: lastPos,
    changeList: changeRecord.changeList,
    changeIndex: changeRecord.changeIndex,
    marks: { ...(state.marks ?? {}), '^': { row: line, col } },
  };
}

/**
 * ESC: NORMAL 모드로 복귀 (비주얼 블록 삽입 세션 일괄 반영 포함)
 */
export function handleInsertEscape(state: VimEditorState, isReplayingDot: boolean): VimEditorState {
  const { col } = state.cursor;
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
      digraphPending: undefined,
      currentChangeKeys: undefined,
      lastInsertedText: resolveLastInsertedText(state, insertedText),
      currentInsertText: undefined,
      lastInsertPos: lastPos,
      changeList: changeRecord.changeList,
      changeIndex: changeRecord.changeIndex,
      marks: { ...(state.marks ?? {}), '^': { row: firstLineIdx, col: insertCol } },
    };
  }

  return exitInsertToNormal(state, isReplayingDot);
}

/**
 * Ctrl+a / Ctrl+@: 직전 INSERT 세션에서 삽입한 텍스트 재삽입 (:help i_CTRL-A / i_CTRL-@)
 */
export function handleInsertLastInserted(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): VimEditorState | null {
  if (
    key !== 'Ctrl-a' &&
    key !== 'Ctrl+a' &&
    key !== 'ctrl-a' &&
    key !== '<C-a>' &&
    key !== 'Ctrl-@' &&
    key !== 'Ctrl+@' &&
    key !== 'ctrl-@' &&
    key !== '<C-@>'
  ) {
    return null;
  }

  const text = state.lastInsertedText ?? '';
  const isExitInsert = key.endsWith('@');
  let nextState = state;
  if (text.length > 0) {
    nextState = insertTextAtCursor(state, text);
    if (!isReplayingDot && state.currentChangeKeys) {
      const insertedKeys = [...text].map((ch) => (ch === '\n' ? 'Enter' : ch === '\t' ? 'Tab' : ch));
      nextState = {
        ...nextState,
        currentChangeKeys: [...state.currentChangeKeys, ...insertedKeys],
      };
    }
  }
  if (isExitInsert) {
    return exitInsertToNormal(nextState, isReplayingDot);
  }
  return nextState;
}
