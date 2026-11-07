import { CursorPosition, VimEditorState } from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { formatLinesRange, changeCaseVisual } from './lineOperators';
import { moveToFirstNonBlank } from './motions';

export type TextObjectModifier = 'i' | 'a';
export type TextObjectTarget =
  | 'w'
  | '"'
  | "'"
  | '`'
  | '('
  | ')'
  | '['
  | ']'
  | '{'
  | '}'
  | 'b'
  | 'B'
  | 't';

export type TextObjectType = `${TextObjectModifier}${TextObjectTarget}` | string;

export interface TextObjectRange {
  startCol: number;
  endCol: number;
  startLine?: number;
  endLine?: number;
  isEmpty?: boolean;
}

type CharClass = 'word' | 'space' | 'punct';

function getCharClass(ch: string | undefined): CharClass {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (/\w/.test(ch)) return 'word';
  return 'punct';
}

/**
 * 주어진 텍스트 객체 타입에 따라 현재 커서 위치의 범위를 구합니다.
 * (단어 iw/aw, 따옴표 i"/a"/i'/a'/i`/a`, 괄호 및 중괄호 i(/a(/i[/a[/i{/a{ 등 멀티라인 지원)
 */
export function getTextObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: TextObjectType
): TextObjectRange | null {
  const lineText = lines[cursor.line] ?? '';
  if (lines.length === 0) {
    return null;
  }

  const col = Math.min(cursor.col, Math.max(0, lineText.length - 1));

  // 1. 단어: iw, aw
  if (objectType === 'iw' || objectType === 'aw') {
    if (lineText.length === 0) return null;
    const targetClass = getCharClass(lineText[col]);

    let startCol = col;
    while (startCol > 0 && getCharClass(lineText[startCol - 1]) === targetClass) {
      startCol--;
    }

    let endCol = col;
    while (endCol < lineText.length - 1 && getCharClass(lineText[endCol + 1]) === targetClass) {
      endCol++;
    }

    if (objectType === 'iw') {
      return { startCol, endCol };
    }

    // aw: around word (단어 + 뒤 공백 또는 앞 공백)
    if (targetClass !== 'space') {
      let newEndCol = endCol;
      while (newEndCol < lineText.length - 1 && getCharClass(lineText[newEndCol + 1]) === 'space') {
        newEndCol++;
      }

      if (newEndCol > endCol) {
        return { startCol, endCol: newEndCol };
      }

      let newStartCol = startCol;
      while (newStartCol > 0 && getCharClass(lineText[newStartCol - 1]) === 'space') {
        newStartCol--;
      }
      return { startCol: newStartCol, endCol };
    } else {
      let newEndCol = endCol;
      if (newEndCol < lineText.length - 1) {
        const nextClass = getCharClass(lineText[newEndCol + 1]);
        while (newEndCol < lineText.length - 1 && getCharClass(lineText[newEndCol + 1]) === nextClass) {
          newEndCol++;
        }
      }
      return { startCol, endCol: newEndCol };
    }
  }

  // 2. 따옴표: i", a", i', a', i`, a`
  const quoteChar =
    objectType.endsWith('"') ? '"' :
    objectType.endsWith("'") ? "'" :
    objectType.endsWith('`') ? '`' : null;

  if (quoteChar) {
    if (lineText.length === 0) return null;
    const modifier = objectType[0] as 'i' | 'a';
    const quoteIndices: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
      if (lineText[i] === quoteChar) {
        quoteIndices.push(i);
      }
    }

    if (quoteIndices.length < 2) {
      return null;
    }

    const pairs: { start: number; end: number }[] = [];
    for (let i = 0; i < quoteIndices.length - 1; i += 2) {
      pairs.push({ start: quoteIndices[i], end: quoteIndices[i + 1] });
    }

    let targetPair = pairs.find((p) => p.start <= col && col <= p.end);
    if (!targetPair) {
      targetPair = pairs.find((p) => p.start >= col);
    }

    if (!targetPair) {
      return null;
    }

    if (modifier === 'i') {
      if (targetPair.start + 1 === targetPair.end) {
        return {
          startCol: targetPair.start + 1,
          endCol: targetPair.start,
          isEmpty: true,
        };
      }
      return {
        startCol: targetPair.start + 1,
        endCol: targetPair.end - 1,
      };
    } else {
      // a: 따옴표 자체를 포함
      return {
        startCol: targetPair.start,
        endCol: targetPair.end,
      };
    }
  }

  // 3. 괄호 및 블록: i(, a(, i), a), i[, a[, i], a], i{, a{, i}, a}, ib, ab, iB, aB
  const bracketModifier = objectType[0] as 'i' | 'a';
  const bracketTarget = objectType.slice(1);

  let openChar = '';
  let closeChar = '';
  if (bracketTarget === '(' || bracketTarget === ')' || bracketTarget === 'b') {
    openChar = '(';
    closeChar = ')';
  } else if (bracketTarget === '[' || bracketTarget === ']') {
    openChar = '[';
    closeChar = ']';
  } else if (bracketTarget === '{' || bracketTarget === '}' || bracketTarget === 'B') {
    openChar = '{';
    closeChar = '}';
  }

  if (openChar && closeChar) {
    interface BracketPair {
      open: CursorPosition;
      close: CursorPosition;
    }
    const pairs: BracketPair[] = [];
    const stack: CursorPosition[] = [];

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l] ?? '';
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        if (ch === openChar) {
          stack.push({ line: l, col: c });
        } else if (ch === closeChar) {
          if (stack.length > 0) {
            const openPos = stack.pop()!;
            pairs.push({ open: openPos, close: { line: l, col: c } });
          }
        }
      }
    }

    if (pairs.length === 0) {
      return null;
    }

    const posCompare = (p1: CursorPosition, p2: CursorPosition) =>
      p1.line !== p2.line ? p1.line - p2.line : p1.col - p2.col;

    // 커서를 감싸고 있는 쌍들 중 가장 안쪽(가장 범위가 작은) 쌍 찾기
    const enclosing = pairs
      .filter((p) => posCompare(p.open, cursor) <= 0 && posCompare(cursor, p.close) <= 0)
      .sort((a, b) => {
        const diffA = (a.close.line - a.open.line) * 100000 + (a.close.col - a.open.col);
        const diffB = (b.close.line - b.open.line) * 100000 + (b.close.col - b.open.col);
        return diffA - diffB;
      });

    let target = enclosing[0];

    // 커서를 감싸는 쌍이 없으면, 커서 뒤에 나타나는 첫 번째 괄호 쌍 선택
    if (!target) {
      const upcoming = pairs
        .filter((p) => posCompare(p.open, cursor) >= 0)
        .sort((a, b) => posCompare(a.open, b.open));
      target = upcoming[0];
    }

    if (!target) {
      return null;
    }

    // 단일 라인 매칭
    if (target.open.line === target.close.line) {
      const lineIdx = target.open.line;
      if (bracketModifier === 'i') {
        if (target.open.col + 1 === target.close.col) {
          // 빈 괄호
          if (lineIdx === cursor.line) {
            return {
              startCol: target.open.col + 1,
              endCol: target.open.col,
              isEmpty: true,
            };
          }
          return {
            startLine: lineIdx,
            startCol: target.open.col + 1,
            endLine: lineIdx,
            endCol: target.open.col,
            isEmpty: true,
          };
        }
        if (lineIdx === cursor.line) {
          return {
            startCol: target.open.col + 1,
            endCol: target.close.col - 1,
          };
        }
        return {
          startLine: lineIdx,
          startCol: target.open.col + 1,
          endLine: lineIdx,
          endCol: target.close.col - 1,
        };
      } else {
        // bracketModifier === 'a'
        if (lineIdx === cursor.line) {
          return {
            startCol: target.open.col,
            endCol: target.close.col,
          };
        }
        return {
          startLine: lineIdx,
          startCol: target.open.col,
          endLine: lineIdx,
          endCol: target.close.col,
        };
      }
    }

    // 멀티 라인 매칭 (target.open.line < target.close.line)
    if (bracketModifier === 'i') {
      return {
        startLine: target.open.line,
        startCol: target.open.col + 1,
        endLine: target.close.line,
        endCol: target.close.col - 1,
      };
    } else {
      // bracketModifier === 'a'
      return {
        startLine: target.open.line,
        startCol: target.open.col,
        endLine: target.close.line,
        endCol: target.close.col,
      };
    }
  }

  // 4. HTML / JSX 태그: it, at
  if (objectType === 'it' || objectType === 'at') {
    return getTagTextObjectRange(lines, cursor, objectType[0] as 'i' | 'a');
  }

  return null;
}

interface TagToken {
  name: string;
  type: 'open' | 'close' | 'self';
  startIdx: number;
  endIdx: number;
  startPos: CursorPosition;
  endPos: CursorPosition;
}

interface TagPair {
  name: string;
  isSelfClosing: boolean;
  open: TagToken;
  close?: TagToken;
}

/**
 * HTML / JSX 중첩 및 멀티라인 태그 (it / at) 범위를 구합니다.
 */
export function getTagTextObjectRange(
  lines: string[],
  cursor: CursorPosition,
  modifier: 'i' | 'a'
): TextObjectRange | null {
  if (lines.length === 0) return null;

  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }
  const fullText = lines.join('\n');
  const cursorOffset =
    (lineOffsets[cursor.line] ?? 0) + Math.min(cursor.col, (lines[cursor.line] ?? '').length);

  function offsetToPos(idx: number): CursorPosition {
    let l = 0;
    let r = lineOffsets.length - 1;
    let line = 0;
    while (l <= r) {
      const mid = Math.floor((l + r) / 2);
      if (lineOffsets[mid] <= idx) {
        line = mid;
        l = mid + 1;
      } else {
        r = mid - 1;
      }
    }
    const col = idx - lineOffsets[line];
    return { line, col };
  }

  const tagRegex = /<(\/)?([a-zA-Z0-9_\-.:]*)((?:[^>"'`]|"[^"]*"|'[^']*'|`[^`]*`)*)(\/?)>/g;
  const tokens: TagToken[] = [];
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(fullText)) !== null) {
    const isClose = m[1] === '/';
    const name = m[2];
    const attrs = m[3] ?? '';
    const isSelf = !isClose && (m[4] === '/' || attrs.trim().endsWith('/'));
    const startIdx = m.index;
    const endIdx = m.index + m[0].length - 1;

    tokens.push({
      name,
      type: isClose ? 'close' : isSelf ? 'self' : 'open',
      startIdx,
      endIdx,
      startPos: offsetToPos(startIdx),
      endPos: offsetToPos(endIdx),
    });
  }

  const pairs: TagPair[] = [];
  const openStack: TagToken[] = [];

  for (const tok of tokens) {
    if (tok.type === 'self') {
      pairs.push({
        name: tok.name,
        isSelfClosing: true,
        open: tok,
      });
    } else if (tok.type === 'open') {
      openStack.push(tok);
    } else if (tok.type === 'close') {
      let foundIdx = -1;
      for (let i = openStack.length - 1; i >= 0; i--) {
        if (openStack[i].name.toLowerCase() === tok.name.toLowerCase()) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx !== -1) {
        const openTok = openStack[foundIdx];
        openStack.splice(foundIdx, openStack.length - foundIdx);
        pairs.push({
          name: tok.name,
          isSelfClosing: false,
          open: openTok,
          close: tok,
        });
      }
    }
  }

  if (pairs.length === 0) {
    return null;
  }

  // 1. 커서가 Self-closing 태그 내부/위에 위치하는지 확인
  const selfOnCursor = pairs.find(
    (p) => p.isSelfClosing && p.open.startIdx <= cursorOffset && cursorOffset <= p.open.endIdx
  );
  if (selfOnCursor) {
    if (modifier === 'a') {
      return {
        startLine: selfOnCursor.open.startPos.line,
        startCol: selfOnCursor.open.startPos.col,
        endLine: selfOnCursor.open.endPos.line,
        endCol: selfOnCursor.open.endPos.col,
      };
    } else {
      return {
        startLine: selfOnCursor.open.startPos.line,
        startCol: selfOnCursor.open.startPos.col,
        endLine: selfOnCursor.open.startPos.line,
        endCol: selfOnCursor.open.startPos.col,
        isEmpty: true,
      };
    }
  }

  // 2. 커서를 감싸고 있는 태그 쌍 중 가장 안쪽(범위 최소) 쌍 선택
  const enclosingPairs = pairs
    .filter((p) => !p.isSelfClosing && p.open.startIdx <= cursorOffset && cursorOffset <= p.close!.endIdx)
    .sort((a, b) => {
      const spanA = a.close!.endIdx - a.open.startIdx;
      const spanB = b.close!.endIdx - b.open.startIdx;
      return spanA - spanB;
    });

  let target = enclosingPairs[0];

  // 3. 감싸는 태그가 없다면, 커서 뒤에 등장하는 첫 번째 태그 쌍 선택
  if (!target) {
    const upcoming = pairs
      .filter((p) => p.open.startIdx >= cursorOffset)
      .sort((a, b) => a.open.startIdx - b.open.startIdx);
    target = upcoming[0];
  }

  if (!target) {
    return null;
  }

  if (target.isSelfClosing) {
    if (modifier === 'a') {
      return {
        startLine: target.open.startPos.line,
        startCol: target.open.startPos.col,
        endLine: target.open.endPos.line,
        endCol: target.open.endPos.col,
      };
    }
    return null;
  }

  // 일반 여는/닫는 태그 쌍
  if (modifier === 'a') {
    return {
      startLine: target.open.startPos.line,
      startCol: target.open.startPos.col,
      endLine: target.close!.endPos.line,
      endCol: target.close!.endPos.col,
    };
  }

  // modifier === 'i': 여는 태그 '>' 직후부터 닫는 태그 '<' 직전까지
  if (target.open.endPos.line === target.close!.startPos.line) {
    if (target.open.endPos.col + 1 >= target.close!.startPos.col) {
      return {
        startLine: target.open.endPos.line,
        startCol: target.open.endPos.col + 1,
        endLine: target.open.endPos.line,
        endCol: target.open.endPos.col,
        isEmpty: true,
      };
    }
    return {
      startLine: target.open.endPos.line,
      startCol: target.open.endPos.col + 1,
      endLine: target.close!.startPos.line,
      endCol: target.close!.startPos.col - 1,
    };
  }

  // 멀티라인인 경우: 여는 태그 '>' 다음 칸부터 닫는 태그 '<' 직전 칸까지
  return {
    startLine: target.open.endPos.line,
    startCol: target.open.endPos.col + 1,
    endLine: target.close!.startPos.line,
    endCol: target.close!.startPos.col - 1,
  };
}

/**
 * 텍스트 객체와 연산자(d, c, y, v, =, gu, gU, g~)를 조합하여 실행합니다. (숫자 카운트 및 멀티라인 지원)
 */
export function executeTextObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~',
  objectType: TextObjectType,
  count = 1
): VimEditorState {
  let curState = state;

  for (let step = 0; step < count; step++) {
    const range = getTextObjectRange(curState.lines, curState.cursor, objectType);
    if (!range) {
      if (operator === 'c') {
        return {
          ...pushUndoSnapshot(curState),
          mode: 'INSERT',
          pendingKeys: undefined,
        };
      }
      return { ...curState, pendingKeys: undefined };
    }

    const startLine = range.startLine ?? curState.cursor.line;
    const endLine = range.endLine ?? curState.cursor.line;
    const startCol = range.startCol;
    const endCol = range.endCol;

    // 대소문자 변환 (gu, gU, g~)
    if (operator === 'gu' || operator === 'gU' || operator === 'g~') {
      const visualState: VimEditorState = {
        ...curState,
        mode: 'VISUAL',
        visualAnchor: {
          line: startLine,
          col: Math.min(startCol, (curState.lines[startLine] ?? '').length),
        },
        cursor: {
          line: endLine,
          col: endCol,
        },
      };
      const caseType = operator === 'g~' ? 'toggle' : operator === 'gu' ? 'lower' : 'upper';
      return changeCaseVisual(visualState, caseType);
    }

    // 자동 들여쓰기 정렬 (=)
    if (operator === '=') {
      const stateWithSnapshot = pushUndoSnapshot(curState);
      const nextLines = formatLinesRange(curState.lines, startLine, endLine);
      const newCursor = moveToFirstNonBlank(nextLines, { line: startLine, col: 0 });
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: newCursor,
        pendingKeys: undefined,
      };
    }

    // VISUAL 모드 영역 지정 (v)
    if (operator === 'v') {
      const isMulti = startLine !== endLine;
      return {
        ...curState,
        mode: 'VISUAL',
        visualAnchor: {
          line: startLine,
          col: Math.min(startCol, (curState.lines[startLine] ?? '').length),
        },
        cursor: {
          line: endLine,
          col: isMulti ? Math.max(0, endCol) : Math.max(startCol, endCol),
        },
        pendingKeys: undefined,
      };
    }

    // 클립보드에 담을 내용 추출
    let content = '';
    if (!range.isEmpty) {
      if (startLine === endLine) {
        content = (curState.lines[startLine] ?? '').slice(startCol, endCol + 1);
      } else {
        const parts: string[] = [];
        parts.push((curState.lines[startLine] ?? '').slice(startCol));
        for (let l = startLine + 1; l < endLine; l++) {
          parts.push(curState.lines[l] ?? '');
        }
        if (endCol >= 0) {
          parts.push((curState.lines[endLine] ?? '').slice(0, endCol + 1));
        }
        content = parts.join('\n');
      }
    }

    // 복사 (y)
    if (operator === 'y') {
      return {
        ...curState,
        clipboard: {
          type: 'text',
          content,
        },
        pendingKeys: undefined,
      };
    }

    // 삭제(d) 또는 수정(c)
    const stateWithSnapshot = pushUndoSnapshot(curState);

    let nextLines: string[];
    if (range.isEmpty) {
      nextLines = [...curState.lines];
    } else if (startLine === endLine) {
      const lineText = curState.lines[startLine] ?? '';
      const newLine = lineText.slice(0, startCol) + lineText.slice(endCol + 1);
      nextLines = [...curState.lines];
      nextLines[startLine] = newLine;
    } else {
      const firstLineText = curState.lines[startLine] ?? '';
      const lastLineText = curState.lines[endLine] ?? '';
      const mergedLine =
        firstLineText.slice(0, startCol) + lastLineText.slice(Math.max(0, endCol + 1));
      nextLines = [
        ...curState.lines.slice(0, startLine),
        mergedLine,
        ...curState.lines.slice(endLine + 1),
      ];
    }

    if (operator === 'c') {
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: { line: startLine, col: startCol },
        mode: 'INSERT',
        clipboard: {
          type: 'text',
          content,
        },
        pendingKeys: undefined,
      };
    }

    // operator === 'd'
    const clampedCursor = clampCursor(
      nextLines,
      { line: startLine, col: startCol },
      'NORMAL'
    );

    curState = {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: clampedCursor,
      clipboard: {
        type: 'text',
        content,
      },
      pendingKeys: undefined,
    };
  }

  return curState;
}
