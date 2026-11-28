import { CursorPosition } from './types';
import { VimPositionOps, comparePositions, vimPositionOps } from './vimPosition';

/**
 * Vim textobject.c 의 문장 처리(findsent · current_sent) 이식입니다. `(` `)` 모션과 `is` `as` 객체가 씁니다.
 * 'cpoptions' 의 J 는 없는 것(기본값), 'sections'·'paragraphs' 는 기본값으로 봅니다.
 */

const SECTIONS = 'SHNHH HUnhsh';
const PARAGRAPHS = 'IPLPPPQPP TPHPLIPpLpItpplpipbp';

/** Vim inmacro(): 옵션의 두 글자 매크로 이름과 줄의 '.' 뒤 두 글자를 비교합니다. */
function inMacro(opt: string, s: string): boolean {
  for (let i = 0; i < opt.length; i += 2) {
    const m0 = opt[i];
    const m1 = opt[i + 1] ?? '';
    const s0 = s[0] ?? '';
    const s1 = s[1] ?? '';
    if ((m0 === s0 || (m0 === ' ' && (s0 === '' || s0 === ' '))) && (m1 === s1 || ((m1 === '' || m1 === ' ') && (s0 === '' || s1 === '' || s1 === ' ')))) {
      return true;
    }
    if (m1 === '') break;
  }
  return false;
}

/** Vim startPS(lnum, NUL, FALSE): 빈 줄·폼피드·nroff 문단/섹션 매크로 줄이면 문단 시작입니다. */
function startPS(lines: string[], line: number): boolean {
  const s = lines[line] ?? '';
  if (s === '' || s[0] === '\f') return true;
  return s[0] === '.' && (inMacro(SECTIONS, s.slice(1)) || inMacro(PARAGRAPHS, s.slice(1)));
}

const isWhite = (c: string) => c === ' ' || c === '\t';

/** Vim findsent(dir, count). 실패하면 null. */
export function findSentence(lines: string[], from: CursorPosition, forward: boolean, count: number): CursorPosition | null {
  const ops = vimPositionOps(lines);
  const { gchar, inc, incl, decl } = ops;
  const func = forward ? incl : decl;
  let pos = { ...from };
  let noskip = false;
  let remaining = count;
  while (remaining-- > 0) {
    const prevPos = pos;
    let skipToFound = false;
    if (gchar(pos) === '') {
      // 빈 줄(또는 줄 끝)에서는 빈 칸이 아닌 곳까지 건너뜁니다.
      for (;;) {
        const [q, r] = func(pos);
        if (r === -1) break;
        pos = q;
        if (gchar(pos) !== '') break;
      }
      if (forward) skipToFound = true;
    } else if (forward && pos.col === 0 && startPS(lines, pos.line)) {
      if (pos.line === ops.lastLine) return null;
      pos = { line: pos.line + 1, col: 0 };
      skipToFound = true;
    } else if (!forward) {
      pos = decl(pos)[0];
    }

    if (!skipToFound) {
      // 앞쪽의 공백·문장부호가 아닌 글자로 돌아갑니다.
      let foundDot = false;
      for (;;) {
        const c = gchar(pos);
        if (!(isWhite(c) || (c !== '' && '.!?)]"\''.includes(c)))) break;
        const [tpos, r] = decl(pos);
        if (r === -1 || (ops.lineLen(tpos.line) === 0 && forward)) break;
        if (foundDot) break;
        if ('.!?'.includes(c)) foundDot = true;
        const tc = gchar(tpos);
        if (')]"\''.includes(c) && !(tc !== '' && '.!?)]"\''.includes(tc))) break;
        pos = decl(pos)[0];
      }

      const startLine = pos.line;
      for (;;) {
        const c = gchar(pos);
        if (c === '' || (pos.col === 0 && startPS(lines, pos.line))) {
          if (!forward && pos.line !== startLine) pos = { line: pos.line + 1, col: 0 };
          break;
        }
        if (c === '.' || c === '!' || c === '?') {
          let tpos = pos;
          let tc: string | -1;
          for (;;) {
            const [q, r] = inc(tpos);
            tpos = q;
            if (r === -1) {
              tc = -1;
              break;
            }
            tc = gchar(tpos);
            if (!(tc !== '' && ')]"\''.includes(tc))) break;
          }
          if (tc === -1 || tc === ' ' || tc === '\t' || tc === '') {
            pos = tpos;
            if (gchar(pos) === '') pos = inc(pos)[0];
            break;
          }
        }
        const [q, r] = func(pos);
        if (r === -1) {
          pos = q;
          if (remaining > 0) return null;
          noskip = true;
          break;
        }
        pos = q;
      }
    }

    // found: 공백을 건너뜁니다.
    while (!noskip && isWhite(gchar(pos))) {
      const [q, r] = incl(pos);
      if (r === -1) break;
      pos = q;
    }
    if (comparePositions(prevPos, pos) === 0) {
      // 움직이지 않았으면 한 칸 옮겨 다시 찾습니다.
      const [q, r] = func(pos);
      if (r === -1) {
        if (remaining > 0) return null;
        break;
      }
      pos = q;
      remaining++;
    }
  }
  return pos;
}

/** Vim find_first_blank(): 앞쪽 공백의 첫 칸으로 갑니다. */
function findFirstBlank(ops: VimPositionOps, p: CursorPosition): CursorPosition {
  let pos = p;
  for (;;) {
    const [q, r] = ops.decl(pos);
    if (r === -1) return pos;
    pos = q;
    if (!isWhite(ops.gchar(pos))) return ops.incl(pos)[0];
  }
}

function findSentenceOrStay(lines: string[], p: CursorPosition, forward: boolean): CursorPosition {
  return findSentence(lines, p, forward, 1) ?? p;
}

/** Vim findsent_forward(count, at_start_sent) */
function findSentenceForward(lines: string[], ops: VimPositionOps, p: CursorPosition, count: number, atStartSent: boolean): CursorPosition {
  let pos = p;
  let atStart = atStartSent;
  for (let left = count; left > 0; left--) {
    pos = findSentenceOrStay(lines, pos, true);
    if (atStart) pos = findFirstBlank(ops, pos);
    if (left === 1 || atStart) pos = ops.decl(pos)[0];
    atStart = !atStart;
  }
  return pos;
}

export type SentenceObjectResult =
  | { kind: 'operator'; start: CursorPosition; end: CursorPosition; inclusive: boolean }
  | { kind: 'visual'; anchor: CursorPosition; cursor: CursorPosition };

/**
 * Vim current_sent(): 연산자 대기 중이면 범위(배타/포함), 비주얼 모드면 새 선택을 돌려줍니다.
 * visualAnchor 는 비주얼 모드일 때의 선택 시작(VIsual)입니다.
 */
export function currentSentence(
  lines: string[],
  cursor: CursorPosition,
  count: number,
  include: boolean,
  visualAnchor?: CursorPosition
): SentenceObjectResult {
  const ops = vimPositionOps(lines);
  const { gchar, incl, decl } = ops;
  let startPos = { ...cursor };
  let pos = { ...cursor };
  let cur = findSentenceOrStay(lines, cursor, true);

  const extend = (): SentenceObjectResult => {
    const anchor = visualAnchor ?? startPos;
    let n = count;
    if (comparePositions(startPos, anchor) < 0) {
      // 선택의 앞쪽 끝에서 뒤로 넓힙니다.
      let atStartSent = true;
      while (comparePositions(pos, cur) < 0) {
        if (!isWhite(gchar(pos))) {
          atStartSent = false;
          break;
        }
        pos = incl(pos)[0];
      }
      if (!atStartSent) {
        cur = findSentenceOrStay(lines, cur, false);
        if (comparePositions(cur, startPos) === 0) atStartSent = true;
        else cur = findSentenceOrStay(lines, cur, true);
      }
      if (include) n *= 2;
      while (n-- > 0) {
        if (atStartSent) cur = findFirstBlank(ops, cur);
        if (!atStartSent || (!include && !isWhite(gchar(cur)))) cur = findSentenceOrStay(lines, cur, false);
        atStartSent = !atStartSent;
      }
    } else {
      // 선택의 뒤쪽 끝에서 앞으로 넓힙니다.
      pos = incl(pos)[0];
      let atStartSent = true;
      if (comparePositions(pos, cur) !== 0) {
        atStartSent = false;
        while (comparePositions(pos, cur) < 0) {
          if (!isWhite(gchar(pos))) {
            atStartSent = true;
            break;
          }
          pos = incl(pos)[0];
        }
        if (atStartSent) cur = findSentenceOrStay(lines, cur, false);
        else cur = startPos;
      }
      if (include) n *= 2;
      cur = findSentenceForward(lines, ops, cur, n, atStartSent);
    }
    return { kind: 'visual', anchor, cursor: cur };
  };

  if (visualAnchor && comparePositions(startPos, visualAnchor) !== 0) return extend();

  while (isWhite(gchar(pos))) pos = incl(pos)[0];
  let startBlank: boolean;
  if (comparePositions(pos, cur) === 0) {
    startBlank = true;
    startPos = findFirstBlank(ops, startPos);
  } else {
    startBlank = false;
    cur = findSentenceOrStay(lines, cur, false);
    startPos = cur;
  }
  let ncount = include ? count * 2 : count - (startBlank ? 1 : 0);
  if (ncount > 0) cur = findSentenceForward(lines, ops, cur, ncount, true);
  else cur = decl(cur)[0];

  if (include) {
    // 앞 공백을 넣었으면 뒤 공백은 빼고, 뒤 공백이 없으면 앞 공백을 넣습니다.
    if (startBlank) {
      cur = findFirstBlank(ops, cur);
      if (isWhite(gchar(cur))) cur = decl(cur)[0];
    } else if (!isWhite(gchar(cur))) {
      startPos = findFirstBlank(ops, startPos);
    }
  }

  if (visualAnchor) {
    if (comparePositions(startPos, cur) === 0) {
      // "is" 가 문장 앞 공백 한 칸에 갇히지 않게 넓힙니다 (Vim 의 goto extend: 지금까지 옮긴 위치 그대로).
      return extend();
    }
    return { kind: 'visual', anchor: startPos, cursor: cur };
  }
  // 문장 뒤에 줄바꿈이 있으면 그것까지 (배타적 끝)
  const [after, r] = incl(cur);
  return { kind: 'operator', start: startPos, end: after, inclusive: r === -1 };
}
