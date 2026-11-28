import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { getRegisterContent, macroKeyToRegisterText } from './registers';
import { recordChangePosition } from './advancedMotions';
import { lookupDigraph } from './digraphs';
import { insertTextAtCursor } from './engineHelpers';
import { getOptions } from './setOptionsCore';

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
    // Vim i_CTRL-V: Esc·Enter·Ctrl-x 는 실제 제어 글자(화면에 `^[`·`^M`·`^W`)를 넣습니다.
    const controlKey = key === 'Escape' || key === 'Enter' || /^Ctrl-[a-z[\]\\^_]$/.test(key);
    if (key.length === 1 || key === 'Tab' || controlKey) {
      const ch = key === 'Tab' ? '\t' : controlKey ? macroKeyToRegisterText(key) : key;
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

function formatIndentAdjustedRegisterText(text: string, currentLine: string, col: number): string {
  const curIndent = currentLine.match(/^[ \t]*/)?.[0] ?? '';
  const beforeCursor = currentLine.slice(0, col);
  const rawLines = text.split('\n');
  if (rawLines.length === 1) {
    return beforeCursor.trim() === '' ? rawLines[0].replace(/^[ \t]+/, '') : rawLines[0];
  }
  const nonEmptyIndents = rawLines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0);
  const minIndent = nonEmptyIndents.length > 0 ? Math.min(...nonEmptyIndents) : 0;
  return rawLines
    .map((line, idx) => {
      if (idx === 0) {
        const leadLen = line.match(/^[ \t]*/)?.[0].length ?? 0;
        return line.slice(Math.min(minIndent, leadLen));
      }
      if (line.trim().length === 0) return '';
      const leadLen = line.match(/^[ \t]*/)?.[0].length ?? 0;
      return curIndent + line.slice(Math.min(minIndent, leadLen));
    })
    .join('\n');
}

function applyAutoindentToRegisterText(text: string, currentLine: string, col: number): string {
  const rawLines = text.split('\n');
  if (rawLines.length <= 1) return text;
  let runningIndent = currentLine.slice(0, col).match(/^[ \t]*/)?.[0] ?? '';
  const out = [rawLines[0]];
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    const combined = runningIndent + line;
    out.push(combined);
    runningIndent = combined.match(/^[ \t]*/)?.[0] ?? '';
  }
  return out.join('\n');
}

/**
 * Ctrl+r / Ctrl+r Ctrl+o / Ctrl+r Ctrl+r / Ctrl+r Ctrl+p 레지스터 삽입 및 대기 상태
 */
export function handleInsertRegister(
  state: VimEditorState,
  key: string,
  isReplayingDot: boolean
): VimEditorState | null {
  if (state.insertRegisterPending) {
    if (key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
      return { ...state, insertRegisterPending: undefined, insertRegisterMode: undefined };
    }

    const regMode = state.insertRegisterMode ?? 'normal';

    // Ctrl-r Ctrl-o / Ctrl-r Ctrl-r: 리터럴(자동 들여쓰기·약어 미적용) 삽입 모드
    if (
      regMode === 'normal' &&
      (key === 'Ctrl-o' ||
        key === 'Ctrl+o' ||
        key === 'ctrl-o' ||
        key === '<C-o>' ||
        key === 'Ctrl-r' ||
        key === 'Ctrl+r' ||
        key === 'ctrl-r' ||
        key === '<C-r>')
    ) {
      return {
        ...state,
        insertRegisterPending: true,
        insertRegisterMode: 'literal',
      };
    }

    // Ctrl-r Ctrl-p: 현재 줄 들여쓰기에 맞춰 리터럴 삽입 모드
    if (
      regMode === 'normal' &&
      (key === 'Ctrl-p' || key === 'Ctrl+p' || key === 'ctrl-p' || key === '<C-p>')
    ) {
      return {
        ...state,
        insertRegisterPending: true,
        insertRegisterMode: 'indent',
      };
    }

    // Ctrl+r = (표현식 레지스터 입력 프롬프트)
    if (key === '=') {
      return {
        ...state,
        mode: 'COMMAND',
        commandType: '=',
        commandBuffer: '',
        insertRegisterPending: undefined,
        insertRegisterMode: undefined,
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
      // Vim: 줄 단위 레지스터는 내용 뒤에 줄바꿈까지 넣어 커서가 다음 줄 시작에 옵니다 (i_CTRL-R).
      const rawText = (regClip?.content ?? '') + (regClip?.type === 'line' ? '\n' : '');
      const currentLine = state.lines[state.cursor.line] ?? '';
      let textToInsert = rawText;

      if (rawText.length > 0) {
        if (regMode === 'indent') {
          textToInsert = formatIndentAdjustedRegisterText(rawText, currentLine, state.cursor.col);
        } else if (regMode === 'normal' && getOptions(state).autoindent && rawText.includes('\n')) {
          textToInsert = applyAutoindentToRegisterText(rawText, currentLine, state.cursor.col);
        }
      }

      let nextState: VimEditorState = {
        ...state,
        insertRegisterPending: undefined,
        insertRegisterMode: undefined,
      };

      if (textToInsert.length > 0) {
        nextState = insertTextAtCursor(nextState, textToInsert);
        if (!isReplayingDot && state.currentChangeKeys) {
          const modeKey =
            regMode === 'literal' ? ['Ctrl-o'] : regMode === 'indent' ? ['Ctrl-p'] : [];
          nextState.currentChangeKeys = [...state.currentChangeKeys, 'Ctrl-r', ...modeKey, regKey];
        }
      }

      return nextState;
    }

    return { ...state, insertRegisterPending: undefined, insertRegisterMode: undefined };
  }

  // Ctrl+r: 레지스터 즉시 삽입 대기 상태 진입
  if (key === 'Ctrl-r' || key === 'Ctrl+r' || key === 'ctrl-r' || key === '<C-r>') {
    return {
      ...state,
      insertRegisterPending: true,
      insertRegisterMode: 'normal',
    };
  }

  return null;
}

function exitInsertToNormal(state: VimEditorState, isReplayingDot: boolean): VimEditorState {
  let targetState = state;
  // Vim ins_esc: 'autoindent' 가 만든 들여쓰기만 있는 줄이면 들여쓰기를 지웁니다 (o<Esc> 는 빈 줄을 남김).
  if (state.autoIndentPending) {
    const cur = state.lines[state.cursor.line] ?? '';
    if (cur.length > 0 && /^[ \t]*$/.test(cur)) {
      const lines = [...state.lines];
      lines[state.cursor.line] = '';
      targetState = { ...state, lines, cursor: { line: state.cursor.line, col: 0 } };
    }
  }
  const repeatCount = state.insertRepeatCount ?? 1;
  const repeatNewline = Boolean(state.insertRepeatNewline);
  const rawInserted = state.currentInsertText ?? '';

  if (repeatCount > 1) {
    const extraCount = repeatCount - 1;
    if (repeatNewline) {
      const curRow = targetState.cursor.line;
      const lineToDuplicate = targetState.lines[curRow] ?? '';
      const duplicated = Array.from({ length: extraCount }, () => lineToDuplicate);
      const nextLines = [
        ...targetState.lines.slice(0, curRow + 1),
        ...duplicated,
        ...targetState.lines.slice(curRow + 1),
      ];
      targetState = {
        ...targetState,
        lines: nextLines,
        cursor: { line: curRow + extraCount, col: targetState.cursor.col },
      };
    } else if (rawInserted.length > 0) {
      const extraText = rawInserted.repeat(extraCount);
      targetState = insertTextAtCursor(targetState, extraText);
    }
  }

  const { line, col } = targetState.cursor;
  const nextCol = Math.max(0, col - 1);
  let nextLastChange = targetState.lastChangeKeys;
  if (!isReplayingDot && targetState.currentChangeKeys) {
    nextLastChange = [...targetState.currentChangeKeys, 'Escape'];
  }
  const lastPos = { line, col, row: line };
  const changeRecord = recordChangePosition(targetState.changeList, { line, col });

  return {
    ...targetState,
    mode: 'NORMAL',
    cursor: clampCursor(targetState.lines, { line, col: nextCol }, 'NORMAL'),
    pendingKeys: undefined,
    digraphPending: undefined,
    insertCtrlGPending: undefined,
    insertStartCol: undefined,
    insertRepeatCount: undefined,
    insertRepeatNewline: undefined,
    autoIndentPending: undefined,
    lastChangeKeys: nextLastChange,
    currentChangeKeys: undefined,
    lastInsertedText: resolveLastInsertedText(state),
    currentInsertText: undefined,
    lastInsertPos: lastPos,
    changeList: changeRecord.changeList,
    changeIndex: changeRecord.changeIndex,
    marks: { ...(targetState.marks ?? {}), '^': { row: line, col } },
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
      count = 1,
      skippedLines,
    } = state.blockInsertSession;
    const unitText = typedChars.join('');
    const repeatCount = Math.max(1, count);
    const insertedText = repeatCount > 1 ? unitText.repeat(repeatCount) : unitText;
    const skippedSet = skippedLines ? new Set(skippedLines) : null;
    const nextLines = [...state.lines];

    const firstLineIdx = targetLines[0];
    if (repeatCount > 1 && unitText.length > 0 && !skippedSet?.has(firstLineIdx)) {
      const firstLineText = nextLines[firstLineIdx] ?? '';
      const extraFirst = unitText.repeat(repeatCount - 1);
      nextLines[firstLineIdx] =
        firstLineText.slice(0, col) + extraFirst + firstLineText.slice(col);
    }

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
        if (insertCol === 0 || lineText.length >= insertCol) {
          nextLines[lineIdx] = lineText.slice(0, insertCol) + insertedText + lineText.slice(insertCol);
        } else if (insertedText.length > 0 && !skippedSet?.has(lineIdx)) {
          lineText = lineText.padEnd(insertCol, ' ');
          nextLines[lineIdx] = lineText.slice(0, insertCol) + insertedText + lineText.slice(insertCol);
        }
      } else {
        const cCol = Math.min(minCol, lineText.length);
        nextLines[lineIdx] = lineText.slice(0, cCol) + insertedText + lineText.slice(cCol);
      }
    }

    const finalFirstCol = col + (repeatCount > 1 ? unitText.length * (repeatCount - 1) : 0);
    // Vim op_insert: 블록 I / A 로 글자를 넣었으면 커서는 블록 왼쪽 위(oap->start.col)로 돌아갑니다.
    const nextCol =
      insertMode === 'A' && unitText.length > 0 ? minCol : insertMode === 'I' && unitText.length > 0 ? insertCol : Math.max(0, finalFirstCol - 1);
    const lastPos = { line: firstLineIdx, col: insertCol, row: firstLineIdx };
    const changeRecord = recordChangePosition(state.changeList, { line: firstLineIdx, col: insertCol });
    const nextLastChange =
      !isReplayingDot && state.currentChangeKeys
        ? [...state.currentChangeKeys, 'Escape']
        : state.lastChangeKeys;

    return {
      ...state,
      lines: nextLines,
      mode: 'NORMAL',
      cursor: clampCursor(nextLines, { line: firstLineIdx, col: nextCol }, 'NORMAL'),
      blockInsertSession: null,
      pendingKeys: undefined,
      digraphPending: undefined,
      lastChangeKeys: nextLastChange,
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
