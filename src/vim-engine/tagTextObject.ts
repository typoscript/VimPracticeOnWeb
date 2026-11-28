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

/** Vim current_tagblock() 결과: 연산자 범위(끝 포함 여부) 또는 비주얼 선택 */
export interface VimTagBlock {
  start: CursorPosition;
  end: CursorPosition;
  /** 끝 위치를 포함하는지 (닫는 태그가 줄 처음이면 it 는 그 앞 줄바꿈까지, 끝은 제외) */
  inclusive: boolean;
  /** 태그 사이가 비었음 (끝이 시작보다 앞) */
  empty: boolean;
}

// Vim current_tagblock 의 검색 패턴 (\_s 는 줄바꿈 포함 공백, [^/] 처럼 \_ 없는 모음은 줄바꿈 제외)
const TAG_START_RE = /<[^ \t>/!\n]+(?:\s[^>]*?[^/\n]>|(?=\n|$)|\s?>)/y;
const TAG_END_RE = /<\/[^>\n]*>/y;

/**
 * Neovim textobject.c 의 current_tagblock() 이식 (it / at, [count], 비주얼 확장).
 * 커서 앞쪽으로 닫히지 않은 여는 태그를 searchpair 로 찾고, 그 이름의 닫는 태그를 앞으로 찾습니다.
 * 닫는 태그가 없거나 커서보다 앞이면 더 바깥 여는 태그를 찾습니다. 커서 뒤쪽 태그는 고르지 않습니다.
 */
export function vimTagBlock(
  lines: string[],
  cursor: CursorPosition,
  include: boolean,
  countArg: number,
  visualAnchor?: CursorPosition
): VimTagBlock | null {
  if (lines.length === 0) return null;
  const offsets: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) offsets.push(offsets[i] + lines[i].length + 1);
  const text = lines.join('\n');
  const toOff = (p: CursorPosition) => offsets[p.line] + Math.min(p.col, lines[p.line].length);
  const charAt = (p: CursorPosition) => (p.col < lines[p.line].length ? lines[p.line][p.col] : '');
  const lt = (a: CursorPosition, b: CursorPosition) => a.line < b.line || (a.line === b.line && a.col < b.col);
  const eq = (a: CursorPosition, b: CursorPosition) => a.line === b.line && a.col === b.col;
  // Vim inc() / dec(): 0 같은 줄, 1 다른 줄, 2 줄 끝(NUL), -1 실패
  const inc = (p: CursorPosition): [CursorPosition, number] => {
    const len = lines[p.line].length;
    if (p.col < len) return [{ line: p.line, col: p.col + 1 }, p.col + 1 < len ? 0 : 2];
    if (p.line < lines.length - 1) return [{ line: p.line + 1, col: 0 }, 1];
    return [p, -1];
  };
  const dec = (p: CursorPosition): [CursorPosition, number] => {
    if (p.col > 0) return [{ line: p.line, col: p.col - 1 }, 0];
    if (p.line > 0) return [{ line: p.line - 1, col: lines[p.line - 1].length }, 1];
    return [p, -1];
  };
  const matchesAt = (re: RegExp, off: number) => {
    re.lastIndex = off;
    return re.test(text);
  };
  const ltOffsets: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === '<') ltOffsets.push(i);
  // do_searchpair(BACKWARD): 커서보다 앞에서 닫히지 않은 여는 태그
  const pairBackward = (from: number): number => {
    let nest = 1;
    for (let k = ltOffsets.length - 1; k >= 0; k--) {
      const o = ltOffsets[k];
      if (o >= from) continue;
      if (matchesAt(TAG_START_RE, o)) {
        if (--nest === 0) return o;
      } else if (matchesAt(TAG_END_RE, o)) {
        nest++;
      }
    }
    return -1;
  };
  // do_searchpair(FORWARD): 같은 이름의 짝 닫는 태그
  const pairForward = (from: number, spat: RegExp, epat: RegExp): number => {
    let nest = 1;
    for (const o of ltOffsets) {
      if (o <= from) continue;
      if (matchesAt(spat, o)) nest++;
      else if (matchesAt(epat, o) && --nest === 0) return o;
    }
    return -1;
  };
  const toPos = (off: number): CursorPosition => {
    let line = 0;
    while (line + 1 < offsets.length && offsets[line + 1] <= off) line++;
    return { line, col: off - offsets[line] };
  };
  const inHtmlTag = (p: CursorPosition, endTag: boolean): boolean => {
    const line = lines[p.line];
    let i = Math.min(p.col, line.length);
    while (i > 0) {
      if (line[i] === '<') break;
      i--;
      if (line[i] === '>') break;
    }
    if (line[i] !== '<') return false;
    if (endTag) return line[i + 1] === '/';
    if (line[i + 1] === '/') return false;
    let pos: CursorPosition = { line: p.line, col: i };
    let lc = '';
    for (;;) {
      const [next, r] = inc(pos);
      if (r < 0) return false;
      pos = next;
      const ch = charAt(pos);
      if (ch === '>') break;
      lc = ch;
    }
    return lc !== '/';
  };

  let c: CursorPosition = { ...cursor };
  let oldEnd: CursorPosition = { ...cursor };
  let oldStart: CursorPosition = { ...cursor };
  const visual = visualAnchor !== undefined;
  if (!visual) oldEnd = dec(oldEnd)[0];
  if (!visual || eq(visualAnchor, cursor)) {
    // 들여쓰기 안이면 첫 비공백으로
    while (lines[c.line].match(/^[ \t]*/)![0].length >= c.col + 1) {
      const [next, r] = inc(c);
      c = next;
      if (r !== 0) break;
    }
    if (inHtmlTag(c, false)) {
      while (charAt(c) !== '>') {
        const [next, r] = inc(c);
        if (r < 0) break;
        c = next;
      }
    } else if (inHtmlTag(c, true)) {
      while (charAt(c) !== '<') {
        const [next, r] = dec(c);
        if (r < 0) break;
        c = next;
      }
      c = dec(c)[0];
      oldEnd = c;
    }
  } else if (lt(visualAnchor, cursor)) {
    oldStart = { ...visualAnchor };
    c = { ...visualAnchor };
  } else {
    oldEnd = { ...visualAnchor };
  }

  let count = countArg;
  let doInclude = include;
  for (let guard = 0; guard < 10000; guard++) {
    let found = true;
    for (let n = 0; n < count; n++) {
      const o = pairBackward(toOff(c));
      if (o < 0) {
        found = false;
        break;
      }
      c = toPos(o);
    }
    if (!found) return null;
    let startPos = c;
    const nameStart = toOff(c) + 1;
    let nameEnd = nameStart;
    while (nameEnd < text.length && !/[\n> \t]/.test(text[nameEnd])) nameEnd++;
    const name = text.slice(nameStart, nameEnd);
    if (!name) return null;
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const spat = new RegExp(`<${esc}(?<=\\w)(?!\\w)(?:\\s[^>]*?[^/]>|\\s?>)`, 'iy');
    const epat = new RegExp(`</${esc}>`, 'iy');
    const endOff = pairForward(nameStart, spat, epat);
    if (endOff < 0 || lt(toPos(endOff), oldEnd)) {
      // 짝이 없거나 커서보다 앞에서 닫힘: 더 바깥 여는 태그를 찾습니다.
      count = 1;
      c = startPos;
      continue;
    }
    c = toPos(endOff);
    let inclusive = true;
    if (doInclude) {
      while (charAt(c) !== '>') {
        const [next, r] = inc(c);
        if (r < 0) break;
        c = next;
      }
    } else if (charAt(c) === '<' && !visual && c.col === 0) {
      inclusive = false;
    } else if (charAt(c) === '<') {
      c = dec(c)[0];
    }
    const endPos = c;
    if (!doInclude) {
      let p = startPos;
      for (;;) {
        const [next, r] = inc(p);
        if (r < 0) break;
        p = next;
        if (charAt(p) === '>') {
          startPos = inc(p)[0];
          break;
        }
      }
      if (visual && eq(startPos, oldStart) && eq(endPos, oldEnd)) {
        doInclude = true;
        c = oldStart;
        count = countArg;
        continue;
      }
    }
    return { start: startPos, end: endPos, inclusive, empty: lt(endPos, startPos) };
  }
  return null;
}
