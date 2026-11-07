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
  | 't'
  | 's';

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
  // 문장 객체(is, as)는 [count] 를 범위 계산에 반영하여 한 번만 적용합니다
  const isSentence = objectType === 'is' || objectType === 'as';
  const steps = isSentence ? 1 : count;

  for (let step = 0; step < steps; step++) {
    const range = isSentence
      ? getSentenceObjectRange(curState.lines, curState.cursor, objectType as 'is' | 'as', count)
      : getTextObjectRange(curState.lines, curState.cursor, objectType);
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

/** 인덴트 텍스트 객체 타입: ii(안쪽), ai(+위 헤더 줄), iI(=ii), aI(+위·아래 경계 줄) */
export type IndentObjectType = 'ii' | 'ai' | 'iI' | 'aI';

export interface IndentObjectRange {
  startLine: number;
  endLine: number;
}

function isBlankLine(text: string | undefined): boolean {
  return !text || text.trim().length === 0;
}

/** 줄 앞 공백의 화면 너비 (탭은 다음 tabstop 위치까지 확장) */
function getIndentWidth(text: string, tabstop: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width++;
    else if (ch === '\t') width += tabstop - (width % tabstop);
    else break;
  }
  return width;
}

/** from 에서 step 방향으로 빈 줄을 건너뛴 첫 비어 있지 않은 줄 번호 (없으면 -1) */
function findNonBlankLine(lines: string[], from: number, step: 1 | -1): number {
  for (let l = from; l >= 0 && l < lines.length; l += step) {
    if (!isBlankLine(lines[l])) return l;
  }
  return -1;
}

/**
 * 인덴트 텍스트 객체 범위를 구합니다. (vim-indent-object 동작 기준, 항상 줄 단위)
 * - ii / iI: 기준 줄과 들여쓰기가 같거나 더 깊은 연속 줄 (중간 빈 줄 포함, 앞뒤 빈 줄 제외)
 * - ai: ii + 바로 위의 덜 들여쓴 헤더 줄 (예: `def foo():`)
 * - aI: ai + 바로 아래의 덜 들여쓴 경계 줄 (예: 닫는 `}` / `end`)
 * - [count]: 한 단계씩 바깥 들여쓰기 블록으로 확장합니다.
 * 기준 줄이 빈 줄이면 아래(없으면 위)의 가장 가까운 비어 있지 않은 줄을 기준으로 합니다.
 */
export function getIndentObjectRange(
  lines: string[],
  line: number,
  objectType: IndentObjectType,
  count = 1,
  tabstop = 8
): IndentObjectRange | null {
  if (lines.length === 0) return null;

  let pivot = isBlankLine(lines[line]) ? findNonBlankLine(lines, line, 1) : line;
  if (pivot === -1) pivot = findNonBlankLine(lines, line, -1);
  if (pivot === -1) return null;

  const width = (l: number) => getIndentWidth(lines[l] ?? '', tabstop);
  const belongs = (l: number, indent: number) => isBlankLine(lines[l]) || width(l) >= indent;

  let indent = width(pivot);
  let start = pivot;
  let end = pivot;

  for (let level = 0; level < Math.max(1, count); level++) {
    if (level > 0) {
      // 바깥 단계: 현재 블록의 헤더 줄 들여쓰기를 기준으로 다시 확장
      const header = findNonBlankLine(lines, start - 1, -1);
      if (header === -1) break;
      indent = width(header);
      start = header;
      end = Math.max(end, header);
    }
    while (start > 0 && belongs(start - 1, indent)) start--;
    while (end < lines.length - 1 && belongs(end + 1, indent)) end++;
    while (start < end && isBlankLine(lines[start])) start++;
    while (end > start && isBlankLine(lines[end])) end--;
  }

  if (objectType === 'ai' || objectType === 'aI') {
    const header = findNonBlankLine(lines, start - 1, -1);
    if (header !== -1) start = header;
  }
  if (objectType === 'aI') {
    const footer = findNonBlankLine(lines, end + 1, 1);
    if (footer !== -1) end = footer;
  }

  return { startLine: start, endLine: end };
}

/**
 * 인덴트 텍스트 객체와 연산자(d, c, y, v, =, gu, gU, g~)를 줄 단위로 실행합니다.
 */
export function executeIndentObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~',
  objectType: IndentObjectType,
  count = 1
): VimEditorState {
  const range = getIndentObjectRange(
    state.lines,
    state.cursor.line,
    objectType,
    count,
    state.options?.tabstop ?? 8
  );
  if (!range) {
    return { ...state, pendingKeys: undefined };
  }
  return executeLinewiseObjectOperator(state, operator, range);
}

/**
 * 줄 단위 텍스트 객체(ii, ai, ip, ap) 범위에 연산자(d, c, y, v, =, gu, gU, g~)를 적용합니다.
 */
export function executeLinewiseObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~',
  range: IndentObjectRange
): VimEditorState {
  const { startLine, endLine } = range;
  const content = state.lines.slice(startLine, endLine + 1).join('\n');

  // VISUAL LINE 모드 영역 지정 (vii, vai, vip, vap)
  if (operator === 'v') {
    return {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: startLine, col: 0 },
      cursor: clampCursor(state.lines, { line: endLine, col: state.cursor.col }, 'VISUAL_LINE'),
      pendingKeys: undefined,
    };
  }

  // 대소문자 변환 (guii, gUai, g~ip)
  if (operator === 'gu' || operator === 'gU' || operator === 'g~') {
    const visualState: VimEditorState = {
      ...state,
      mode: 'VISUAL_LINE',
      visualAnchor: { line: startLine, col: 0 },
      cursor: { line: endLine, col: 0 },
    };
    const caseType = operator === 'g~' ? 'toggle' : operator === 'gu' ? 'lower' : 'upper';
    return changeCaseVisual(visualState, caseType);
  }

  // 자동 들여쓰기 정렬 (=ii, =ap)
  if (operator === '=') {
    const stateWithSnapshot = pushUndoSnapshot(state);
    const nextLines = formatLinesRange(state.lines, startLine, endLine);
    return {
      ...stateWithSnapshot,
      lines: nextLines,
      cursor: moveToFirstNonBlank(nextLines, { line: startLine, col: 0 }),
      pendingKeys: undefined,
    };
  }

  const clipboard = { type: 'line' as const, content };

  // 복사 (yii, yap): 커서는 복사 영역의 첫 줄로 이동
  if (operator === 'y') {
    return {
      ...state,
      cursor: moveToFirstNonBlank(state.lines, { line: startLine, col: 0 }),
      clipboard,
      pendingKeys: undefined,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const before = state.lines.slice(0, startLine);
  const after = state.lines.slice(endLine + 1);

  // 수정 (cii, cip): 블록을 첫 줄의 들여쓰기만 남긴 빈 줄 하나로 교체하고 INSERT 진입 (autoindent)
  if (operator === 'c') {
    const indentStr = (state.lines[startLine] ?? '').match(/^[ \t]*/)?.[0] ?? '';
    return {
      ...stateWithSnapshot,
      lines: [...before, indentStr, ...after],
      cursor: { line: startLine, col: indentStr.length },
      mode: 'INSERT',
      clipboard,
      pendingKeys: undefined,
    };
  }

  // 삭제 (dii, dap)
  const nextLines = before.length + after.length === 0 ? [''] : [...before, ...after];
  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: moveToFirstNonBlank(nextLines, { line: Math.min(startLine, nextLines.length - 1), col: 0 }),
    clipboard,
    pendingKeys: undefined,
  };
}

// ---------------------------------------------------------------------------
// 문단 텍스트 객체 (ip, ap) — Vim current_par() 규칙
// ---------------------------------------------------------------------------

export type ParagraphObjectType = 'ip' | 'ap';

/** 텍스트 객체에서 공백 문자만 있는 줄도 빈 줄로 봅니다. (Vim linewhite(), } 모션과 다름) */
function isWhiteLine(text: string | undefined): boolean {
  return (text ?? '').trim().length === 0;
}

/**
 * 문단 텍스트 객체 범위 (항상 줄 단위)
 * - ip: 커서가 있는 문단(빈 줄이 아닌 연속 줄). 빈 줄 위라면 연속된 빈 줄 묶음
 * - ap: 문단 + 뒤의 빈 줄들 (뒤에 빈 줄이 없으면 앞의 빈 줄들). 빈 줄 위라면 빈 줄 + 다음 문단
 * - [count]: ip 는 문단과 빈 줄 묶음을 각각 하나로 세고, ap 는 (문단 + 빈 줄) 단위로 셉니다.
 * 범위가 버퍼 끝을 넘어가면 null (Vim 에서는 실패)
 */
export function getParagraphObjectRange(
  lines: string[],
  line: number,
  objectType: ParagraphObjectType,
  count = 1
): IndentObjectRange | null {
  if (lines.length === 0) return null;
  const include = objectType === 'ap';
  const last = lines.length - 1;

  let start = Math.max(0, Math.min(line, last));
  const whiteInFront = isWhiteLine(lines[start]);
  // 현재 묶음(문단 또는 빈 줄)의 시작으로 이동
  while (start > 0 && isWhiteLine(lines[start - 1]) === whiteInFront) start--;

  // 시작이 빈 줄 묶음이면 그 끝까지, 문단이면 시작 바로 앞 줄을 끝으로 둡니다
  let end = start;
  while (end <= last && isWhiteLine(lines[end])) end++;
  end--;

  let remaining = Math.max(1, count);
  if (!include && whiteInFront) remaining--;
  while (remaining-- > 0) {
    if (end === last) return null;
    const doWhite = !include && isWhiteLine(lines[end + 1]);
    if (include || !doWhite) {
      end++;
      while (end < last && !isWhiteLine(lines[end + 1])) end++;
    }
    if (remaining === 0 && whiteInFront && include) break;
    if (include || doWhite) {
      while (end < last && isWhiteLine(lines[end + 1])) end++;
    }
  }

  // ap: 뒤에 빈 줄이 없으면 앞의 빈 줄을 포함
  if (include && !whiteInFront && !isWhiteLine(lines[end])) {
    while (start > 0 && isWhiteLine(lines[start - 1])) start--;
  }

  return { startLine: start, endLine: end };
}

/** 문단 텍스트 객체와 연산자를 줄 단위로 실행합니다. (dap, yip, cip, vap, =ip, gUap ...) */
export function executeParagraphObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~',
  objectType: ParagraphObjectType,
  count = 1
): VimEditorState | null {
  const range = getParagraphObjectRange(state.lines, state.cursor.line, objectType, count);
  return range ? executeLinewiseObjectOperator(state, operator, range) : null;
}

// ---------------------------------------------------------------------------
// 문장 텍스트 객체 (is, as)
// ---------------------------------------------------------------------------

interface FlatChar {
  ch: string;
  line: number;
  col: number;
}

interface Segment {
  kind: 'sentence' | 'white';
  start: number;
  end: number;
}

const SENTENCE_END = '.!?';
const SENTENCE_CLOSERS = ')]"\'';

function isWhiteChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

/**
 * 커서가 있는 문단(빈 줄로 구분)의 문자를 한 줄로 펼치고, 문장과 공백 구간으로 나눕니다.
 * 문장은 . ! ? (뒤에 ) ] " ' 가 붙을 수 있음) 다음에 공백·줄 끝이 오면 끝납니다. (:help sentence)
 */
function splitSentences(lines: string[], line: number): { chars: FlatChar[]; segments: Segment[] } | null {
  if (isWhiteLine(lines[line])) return null;
  let first = line;
  while (first > 0 && !isWhiteLine(lines[first - 1])) first--;
  let lastLine = line;
  while (lastLine < lines.length - 1 && !isWhiteLine(lines[lastLine + 1])) lastLine++;

  const chars: FlatChar[] = [];
  for (let l = first; l <= lastLine; l++) {
    const text = lines[l] ?? '';
    for (let c = 0; c < text.length; c++) chars.push({ ch: text[c], line: l, col: c });
    if (l < lastLine) chars.push({ ch: '\n', line: l, col: text.length });
  }

  const segments: Segment[] = [];
  let i = 0;
  while (i < chars.length) {
    if (isWhiteChar(chars[i].ch)) {
      let j = i;
      while (j < chars.length && isWhiteChar(chars[j].ch)) j++;
      segments.push({ kind: 'white', start: i, end: j - 1 });
      i = j;
      continue;
    }
    let end = chars.length - 1;
    for (let k = i; k < chars.length; k++) {
      if (!SENTENCE_END.includes(chars[k].ch)) continue;
      let m = k + 1;
      while (m < chars.length && SENTENCE_CLOSERS.includes(chars[m].ch)) m++;
      if (m === chars.length || isWhiteChar(chars[m].ch)) {
        end = m - 1;
        break;
      }
    }
    segments.push({ kind: 'sentence', start: i, end });
    i = end + 1;
  }
  return { chars, segments };
}

/** 공백 구간 중 지정한 줄에 속한 부분만 남깁니다. (문장 앞뒤 공백은 줄을 넘지 않음) */
function whiteOnLine(chars: FlatChar[], seg: Segment, line: number): { start: number; end: number } | null {
  let s = -1;
  let e = -1;
  for (let i = seg.start; i <= seg.end; i++) {
    if (chars[i].ch === '\n' || chars[i].line !== line) continue;
    if (s < 0) s = i;
    e = i;
  }
  return s < 0 ? null : { start: s, end: e };
}

/**
 * 문장 텍스트 객체 범위 (문자 단위, 끝 포함)
 * - is: 커서가 있는 문장 (공백 위라면 그 공백). [count] 는 문장과 공백을 각각 하나로 셉니다.
 * - as: 문장 + 뒤 공백 (뒤 공백이 없으면 앞 공백). 공백 위라면 공백 + 다음 문장.
 * 문장은 여러 줄에 걸칠 수 있지만, 앞뒤로 붙는 공백은 문장과 같은 줄까지만 포함합니다.
 */
export function getSentenceObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: 'is' | 'as',
  count = 1
): TextObjectRange | null {
  const split = splitSentences(lines, cursor.line);
  if (!split) return null;
  const { chars, segments } = split;
  const n = Math.max(1, count);

  const lineText = lines[cursor.line] ?? '';
  const col = Math.min(cursor.col, Math.max(0, lineText.length - 1));
  const flatIdx = chars.findIndex((c) => c.line === cursor.line && c.col === col);
  const k = segments.findIndex((seg) => flatIdx >= seg.start && flatIdx <= seg.end);
  if (k < 0) return null;

  let start: number;
  let end: number;

  if (objectType === 'is') {
    const lastSeg = segments[Math.min(segments.length - 1, k + n - 1)];
    start = segments[k].start;
    end = lastSeg.end;
    if (segments[k].kind === 'white') {
      const own = whiteOnLine(chars, segments[k], cursor.line);
      if (!own) return null;
      start = own.start;
      if (lastSeg === segments[k]) end = own.end;
    }
  } else if (segments[k].kind === 'sentence') {
    const lastIdx = Math.min(segments.length - 1, k + 2 * (n - 1));
    start = segments[k].start;
    end = segments[lastIdx].end;
    const trailing = segments[lastIdx + 1];
    const trailingOwn = trailing?.kind === 'white' ? whiteOnLine(chars, trailing, chars[end].line) : null;
    if (trailingOwn) {
      end = trailingOwn.end;
    } else {
      const leading = segments[k - 1];
      const leadingOwn = leading?.kind === 'white' ? whiteOnLine(chars, leading, chars[start].line) : null;
      if (leadingOwn) start = leadingOwn.start;
    }
  } else {
    // 공백 위의 as: 공백 + 다음 문장(들)
    const nextIdx = Math.min(segments.length - 1, k + 2 * n - 1);
    if (nextIdx === k) return null;
    const own = whiteOnLine(chars, segments[k], cursor.line) ?? { start: segments[k].start };
    start = own.start;
    end = segments[nextIdx].end;
  }

  // 범위의 양 끝이 줄바꿈이 되지 않도록 실제 문자 위치로 좁힙니다
  while (start < end && chars[start].ch === '\n') start++;
  while (end > start && chars[end].ch === '\n') end--;

  return {
    startLine: chars[start].line,
    startCol: chars[start].col,
    endLine: chars[end].line,
    endCol: chars[end].col,
  };
}

/**
 * 버퍼 전체의 문장 시작 위치 목록 ( / ) 모션용)
 * 문단 안의 각 문장 시작(첫 공백 아닌 문자)과, 빈 줄 묶음의 첫 줄을 문장 경계로 봅니다. (:help sentence)
 */
export function getSentenceStarts(lines: string[]): CursorPosition[] {
  const starts: CursorPosition[] = [];
  let line = 0;
  while (line < lines.length) {
    if (isWhiteLine(lines[line])) {
      starts.push({ line, col: 0 });
      while (line < lines.length && isWhiteLine(lines[line])) line++;
      continue;
    }
    const split = splitSentences(lines, line);
    if (split) {
      for (const seg of split.segments) {
        if (seg.kind === 'sentence') starts.push({ line: split.chars[seg.start].line, col: split.chars[seg.start].col });
      }
    }
    while (line < lines.length && !isWhiteLine(lines[line])) line++;
  }
  return starts;
}
