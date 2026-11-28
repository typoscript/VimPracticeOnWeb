import { CursorPosition, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { isKeywordChar } from './wordMotion';
import { pushUndoSnapshot } from './operators';
import { pushUndoSnapshotAt } from './undoHistory';
import { formatLinesRange, cindentOptionsFor, equalOperatorCursor, changeCaseVisual, caseTypeForOperator } from './lineOperators';
import { getTagTextObjectRange } from './tagTextObject';
export { getTagTextObjectRange };
import {
  TreesitterObjectType,
  getTreesitterObjectRange,
  detectFunctions,
  detectClasses,
  findFunctionJumpTarget,
} from './treesitterTextObjects';
export type { TreesitterObjectType };
export { getTreesitterObjectRange, detectFunctions, detectClasses, findFunctionJumpTarget };
import { MiniAiScope, getMiniAiNextLastRange } from './miniAiTextObjects';
export type { MiniAiScope };
export { getMiniAiNextLastRange };
import {
  TextObjectRange,
  IndentObjectType,
  IndentObjectRange,
  ParagraphObjectType,
  getIndentObjectRange,
  executeIndentObjectOperator,
  executeLinewiseObjectOperator,
  getParagraphObjectRange,
  executeParagraphObjectOperator,
  getSentenceObjectRange,
  getSentenceStarts,
} from './textObjectsExtended';

export type { TextObjectRange, IndentObjectType, IndentObjectRange, ParagraphObjectType };
export {
  getIndentObjectRange,
  executeIndentObjectOperator,
  executeLinewiseObjectOperator,
  getParagraphObjectRange,
  executeParagraphObjectOperator,
  getSentenceObjectRange,
  getSentenceStarts,
};

export type TextObjectModifier = 'i' | 'a';
export type TextObjectTarget =
  | 'w'
  | 'W'
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

type CharClass = 'word' | 'space' | 'punct';

function getCharClass(ch: string | undefined): CharClass {
  if (!ch) return 'space';
  if (/\s/.test(ch)) return 'space';
  if (isKeywordChar(ch)) return 'word';
  return 'punct';
}

/**
 * 주어진 텍스트 객체 타입에 따라 현재 커서 위치의 범위를 구합니다.
 * (단어 iw/aw, 따옴표 i"/a"/i'/a'/i`/a`, 괄호 및 중괄호 i(/a(/i[/a[/i{/a{ 등 멀티라인 지원)
 */
export function getTextObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: TextObjectType,
  count = 1
): TextObjectRange | null {
  const lineText = lines[cursor.line] ?? '';
  if (lines.length === 0) {
    return null;
  }

  // 0. mini.ai 스타일 Next/Last 텍스트 객체 (in"/an"/il"/al", in(/an(/il(/al{ 등)
  const miniAiMatch = objectType.match(/^([ia])([nl])(.)$/);
  if (miniAiMatch) {
    return getMiniAiNextLastRange(
      lines,
      cursor,
      miniAiMatch[1] as 'i' | 'a',
      miniAiMatch[2] as MiniAiScope,
      miniAiMatch[3],
      count
    );
  }

  const col = Math.min(cursor.col, Math.max(0, lineText.length - 1));

  // 1. 단어 / WORD: iw, aw, iW, aW
  if (objectType === 'iw' || objectType === 'aw' || objectType === 'iW' || objectType === 'aW') {
    // Vim current_word: 버퍼 맨 끝 빈 줄의 iw 는 앞 줄 마지막 글자부터 줄바꿈까지 고릅니다 (yiw 가 ".\n").
    if (lineText.length === 0 && objectType[0] === 'i' && cursor.line === lines.length - 1 && cursor.line > 0) {
      const prev = lines[cursor.line - 1] ?? '';
      return { startLine: cursor.line - 1, startCol: Math.max(0, prev.length - 1), endLine: cursor.line, endCol: 0 };
    }
    if (lineText.length === 0) return null;
    const isBigWord = objectType[1] === 'W';
    const clsAt = (ch: string | undefined): CharClass => {
      const c = getCharClass(ch);
      return isBigWord ? (c === 'space' ? 'space' : 'word') : c;
    };
    const targetClass = clsAt(lineText[col]);

    let startCol = col;
    while (startCol > 0 && clsAt(lineText[startCol - 1]) === targetClass) {
      startCol--;
    }

    let endCol = col;
    while (endCol < lineText.length - 1 && clsAt(lineText[endCol + 1]) === targetClass) {
      endCol++;
    }

    if (objectType[0] === 'i') {
      return { startCol, endCol };
    }

    // aw / aW: around word/WORD (뒤 공백 또는 앞 공백 포함)
    if (targetClass !== 'space') {
      let newEndCol = endCol;
      while (newEndCol < lineText.length - 1 && clsAt(lineText[newEndCol + 1]) === 'space') {
        newEndCol++;
      }

      if (newEndCol > endCol) {
        return { startCol, endCol: newEndCol };
      }

      let newStartCol = startCol;
      while (newStartCol > 0 && clsAt(lineText[newStartCol - 1]) === 'space') {
        newStartCol--;
      }
      return { startCol: newStartCol, endCol };
    } else {
      let newEndCol = endCol;
      if (newEndCol < lineText.length - 1) {
        const nextClass = clsAt(lineText[newEndCol + 1]);
        while (newEndCol < lineText.length - 1 && clsAt(lineText[newEndCol + 1]) === nextClass) {
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
  } else if (bracketTarget === '<' || bracketTarget === '>') {
    // i< / a< : 꺾쇠 괄호 (HTML 태그 속성, 제네릭 타입 등)
    openChar = '<';
    closeChar = '>';
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
      // Vim current_block(): 여는 괄호가 줄 끝이면 다음 줄 처음부터, 닫는 괄호 앞이 들여쓰기뿐이면 이전 줄 끝까지.
      // 둘 다 해당하면 사이 줄들을 줄 단위로 다룹니다. (di{ 는 { 줄과 } 줄을 남기고 안쪽 줄만 삭제)
      const openAtEol = (lines[target.open.line] ?? '').slice(target.open.col + 1).trim() === '';
      const closeAtSol = (lines[target.close.line] ?? '').slice(0, target.close.col).trim() === '';
      const start = openAtEol
        ? { line: target.open.line + 1, col: 0 }
        : { line: target.open.line, col: target.open.col + 1 };
      const end = closeAtSol
        ? { line: target.close.line - 1, col: Math.max(0, (lines[target.close.line - 1] ?? '').length - 1) }
        : { line: target.close.line, col: target.close.col - 1 };
      if (start.line > end.line) {
        // 괄호 사이에 내용이 없음 ({ 다음 줄에 바로 })
        return {
          startLine: target.open.line,
          startCol: target.open.col + 1,
          endLine: target.open.line,
          endCol: target.open.col,
          isEmpty: true,
        };
      }
      return {
        startLine: start.line,
        startCol: start.col,
        endLine: end.line,
        endCol: end.col,
        linewise: openAtEol && closeAtSol,
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

  // 5. Treesitter 스타일 구조적 텍스트 객체: af/if (함수), ac/ic (클래스), aa/ia (인자)
  if (
    objectType === 'af' ||
    objectType === 'if' ||
    objectType === 'ac' ||
    objectType === 'ic' ||
    objectType === 'aa' ||
    objectType === 'ia'
  ) {
    return getTreesitterObjectRange(lines, cursor, objectType);
  }

  return null;
}

/**
 * count 번째로 커서를 감싼 괄호·태그 쌍의 범위 (Vim current_block / current_tagblock 의 [count]).
 * 바깥쪽 쌍으로 가려면 지금 쌍의 여는 기호 바로 앞 글자에서 다시 찾습니다. 쌍이 모자라면 null.
 */
function getNestedPairRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: TextObjectType,
  count: number
): TextObjectRange | null {
  const around = `a${objectType.slice(1)}` as TextObjectType;
  let outer = getTextObjectRange(lines, cursor, around);
  for (let level = 2; level <= count; level++) {
    if (!outer) return null;
    const line = outer.startLine ?? cursor.line;
    const col = outer.startCol;
    let back: CursorPosition | null = null;
    if (col > 0) back = { line, col: col - 1 };
    else if (line > 0) back = { line: line - 1, col: Math.max(0, (lines[line - 1] ?? '').length - 1) };
    if (!back) return null;
    const next = getTextObjectRange(lines, back, around);
    // 새 쌍이 이전 쌍을 실제로 감싸야 합니다 (커서 뒤쪽 쌍을 잡으면 실패).
    const prevStart = { line, col };
    const prevEnd = { line: outer.endLine ?? line, col: outer.endCol };
    const contains =
      next &&
      ((next.startLine ?? back.line) < prevStart.line ||
        ((next.startLine ?? back.line) === prevStart.line && next.startCol < prevStart.col)) &&
      ((next.endLine ?? back.line) > prevEnd.line ||
        ((next.endLine ?? back.line) === prevEnd.line && next.endCol > prevEnd.col));
    if (!contains) return null;
    outer = next;
  }
  if (!outer) return null;
  const opening = { line: outer.startLine ?? cursor.line, col: outer.startCol };
  return getTextObjectRange(lines, opening, objectType);
}

/**
 * 텍스트 객체와 연산자(d, c, y, v, =, gu, gU, g~)를 조합하여 실행합니다. (숫자 카운트 및 멀티라인 지원)
 */
export function executeTextObjectOperator(
  state: VimEditorState,
  operator: 'd' | 'c' | 'y' | 'v' | '=' | 'gu' | 'gU' | 'g~' | 'g?',
  objectType: TextObjectType,
  count = 1
): VimEditorState {
  let curState = state;
  // 문장(is, as) 및 구조적 블록(af, if, ac, ic)은 [count] 를 범위 계산에 반영하여 한 번만 적용합니다
  const isSentence = objectType === 'is' || objectType === 'as';
  const isStructuralBlock =
    objectType === 'af' || objectType === 'if' || objectType === 'ac' || objectType === 'ic';
  const isMiniAi = /^[ia][nl].$/.test(objectType);
  // 괄호·태그 객체의 [count] 는 count 번째로 감싼 쌍을 고릅니다 (d2i( 는 바깥 괄호 안쪽). 쌍이 모자라면 실패.
  const isNestedPair = /^[ia][()[\]{}<>bBt]$/.test(objectType);
  const nestedRange = isNestedPair && count > 1 ? getNestedPairRange(curState.lines, curState.cursor, objectType, count) : undefined;
  if (nestedRange === null) return { ...curState, bell: true, pendingKeys: undefined };
  const steps = isSentence || isStructuralBlock || isMiniAi || isNestedPair ? 1 : count;

  for (let step = 0; step < steps; step++) {
    const range = nestedRange ?? (isSentence
      ? getSentenceObjectRange(curState.lines, curState.cursor, objectType as 'is' | 'as', count)
      : isStructuralBlock
        ? getTreesitterObjectRange(curState.lines, curState.cursor, objectType as TreesitterObjectType, count)
        : getTextObjectRange(curState.lines, curState.cursor, objectType, count));
    if (!range) {
      // 빈 줄의 iw / iW / is 는 Vim 에서 빈 범위로 성공합니다 (ciw 는 INSERT 로 들어감).
      const emptyLineWordObject =
        step === 0 &&
        (objectType === 'iw' || objectType === 'iW' || objectType === 'is') &&
        (curState.lines[curState.cursor.line] ?? '') === '';
      if (emptyLineWordObject) {
        if (operator === 'c') return { ...pushUndoSnapshot(curState), mode: 'INSERT', pendingKeys: undefined };
        if (operator === '=') return { ...pushUndoSnapshot(curState), pendingKeys: undefined };
        // Vim: 빈 범위의 복사는 빈 문자열을 레지스터에 씁니다 (삭제는 레지스터를 건드리지 않음).
        if (operator === 'y') return { ...curState, clipboard: { type: 'text', content: '' }, pendingKeys: undefined };
        return { ...curState, pendingKeys: undefined };
      }
      // Vim: 그 밖에 텍스트 객체가 없으면 연산자는 실패합니다 (ca( 가 INSERT 로 들어가지 않음, bell).
      if (isMiniAi || step === 0) {
        return { ...curState, bell: true, pendingKeys: undefined };
      }
      return { ...curState, pendingKeys: undefined };
    }

    const startLine = range.startLine ?? curState.cursor.line;
    const endLine = range.endLine ?? curState.cursor.line;
    const startCol = range.startCol;
    const endCol = range.endCol;

    // 줄 단위 블록 (여러 줄 i{ 등): d / c / y / = / 대소문자 연산은 줄 단위로
    if (range.linewise && operator !== 'v') {
      return executeLinewiseObjectOperator(curState, operator, { startLine, endLine }, true);
    }

    // 대소문자 변환 (gu, gU, g~)
    if (operator === 'gu' || operator === 'gU' || operator === 'g~' || operator === 'g?') {
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
      const caseType = caseTypeForOperator(operator);
      return changeCaseVisual(visualState, caseType);
    }

    // 자동 들여쓰기 정렬 (=)
    if (operator === '=') {
      // Vim op_reindent: 바뀐 줄이 없어도 실행 취소 단위가 생기고, 실행 취소 커서는 객체 시작(oap->start)입니다.
      const stateWithSnapshot = pushUndoSnapshotAt(curState, { line: startLine, col: startCol }, { start: startLine, end: endLine });
      const nextLines = formatLinesRange(curState.lines, startLine, endLine, cindentOptionsFor(curState));
      return {
        ...stateWithSnapshot,
        lines: nextLines,
        cursor: equalOperatorCursor(curState, nextLines, startLine),
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
        // Vim: 복사 후 커서는 복사한 범위의 시작으로 갑니다 (yiw 는 단어 첫 글자).
        cursor: range.isEmpty ? curState.cursor : { line: startLine, col: startCol },
        clipboard: {
          type: 'text',
          content,
        },
        lastBracketMarks: {
          start: { row: startLine, col: startCol },
          end: { row: endLine, col: endCol },
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
