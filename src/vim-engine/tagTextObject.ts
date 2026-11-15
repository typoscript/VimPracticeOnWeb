import { CursorPosition } from './types';
import { TextObjectRange } from './textObjectsExtended';

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
