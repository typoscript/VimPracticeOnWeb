import { CursorPosition } from './types';
import type { TextObjectRange } from './textObjectsExtended';

export type TreesitterObjectType = 'af' | 'if' | 'ac' | 'ic' | 'aa' | 'ia';

export interface StructuralNode {
  kind: 'function' | 'class';
  startLine: number;
  endLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
  /** 단일 줄 중괄호 또는 단일 줄 화살표 함수의 내부 범위 */
  inlineBody?: { startCol: number; endCol: number };
  openBrace?: CursorPosition;
  closeBrace?: CursorPosition;
}

const CONTROL_FLOW_NAMES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'else',
  'return',
  'with',
  'typeof',
  'delete',
  'new',
  'throw',
  'case',
]);

function getIndentWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w += 1;
    else if (ch === '\t') w += 4;
    else break;
  }
  return w;
}

function firstNonBlankCol(line: string): number {
  const m = line.match(/^[ \t]*/);
  const col = m ? m[0].length : 0;
  return col >= line.length ? Math.max(0, line.length - 1) : col;
}

function isBlank(line: string | undefined): boolean {
  return !line || line.trim().length === 0;
}

/**
 * (openLine, openCol) 의 여는 중괄호 '{' 와 짝을 이루는 닫는 중괄호 '}' 위치를 찾습니다.
 * 문자열 리터럴과 주석 내부의 중괄호는 무시합니다.
 */
function findMatchingCloseBrace(
  lines: string[],
  openLine: number,
  openCol: number
): CursorPosition | null {
  let depth = 0;
  let inBlockComment = false;

  for (let l = openLine; l < lines.length; l++) {
    const text = lines[l] ?? '';
    let inString: string | null = null;
    const startC = l === openLine ? openCol : 0;

    for (let c = startC; c < text.length; c++) {
      const ch = text[c];
      const next = text[c + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          c++;
        }
        continue;
      }

      if (inString) {
        if (ch === '\\') {
          c++;
          continue;
        }
        if (ch === inString) {
          inString = null;
        }
        continue;
      }

      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        c++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }

      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return { line: l, col: c };
        }
      }
    }
  }

  return null;
}

/** 주어진 헤더 줄(또는 다음 최대 3줄 이내)에서 본문 시작 중괄호 '{' 를 찾습니다. */
function findHeaderOpenBrace(lines: string[], headerLine: number, searchFromCol = 0): CursorPosition | null {
  const maxLine = Math.min(lines.length - 1, headerLine + 3);
  for (let l = headerLine; l <= maxLine; l++) {
    const text = lines[l] ?? '';
    let inString: string | null = null;
    const startC = l === headerLine ? searchFromCol : 0;
    for (let c = startC; c < text.length; c++) {
      const ch = text[c];
      const next = text[c + 1];
      if (inString) {
        if (ch === '\\') {
          c++;
          continue;
        }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        continue;
      }
      if (ch === '{') {
        return { line: l, col: c };
      }
      // 세미콜론으로 끝나는 타입 선언/호출은 본문 없음
      if (ch === ';') return null;
    }
  }
  return null;
}

/** 파이썬 등 들여쓰기 기반 블록(def / class)의 마지막 줄을 구합니다. */
function findIndentBlockEnd(lines: string[], headerLine: number): { bodyStart: number; endLine: number } | null {
  const baseIndent = getIndentWidth(lines[headerLine] ?? '');
  let bodyStart = headerLine + 1;
  // 여러 줄 시그니처(예: def foo(\n a,\n):)가 끝나는 ':' 줄까지 전진
  let colonLine = headerLine;
  while (colonLine < lines.length && !(lines[colonLine] ?? '').replace(/#.*$/, '').trimEnd().endsWith(':')) {
    colonLine++;
  }
  if (colonLine >= lines.length) return null;
  bodyStart = colonLine + 1;
  if (bodyStart >= lines.length) return null;

  let endLine = colonLine;
  for (let l = bodyStart; l < lines.length; l++) {
    if (isBlank(lines[l])) continue;
    if (getIndentWidth(lines[l]) > baseIndent) {
      endLine = l;
    } else {
      break;
    }
  }
  if (endLine < bodyStart) return null;
  return { bodyStart, endLine };
}

function buildBraceNode(
  kind: 'function' | 'class',
  lines: string[],
  startLine: number,
  openBrace: CursorPosition
): StructuralNode | null {
  const closeBrace = findMatchingCloseBrace(lines, openBrace.line, openBrace.col);
  if (!closeBrace) return null;

  if (openBrace.line === closeBrace.line) {
    return {
      kind,
      startLine,
      endLine: closeBrace.line,
      bodyStartLine: openBrace.line,
      bodyEndLine: closeBrace.line,
      inlineBody: { startCol: openBrace.col + 1, endCol: closeBrace.col - 1 },
      openBrace,
      closeBrace,
    };
  }

  return {
    kind,
    startLine,
    endLine: closeBrace.line,
    bodyStartLine: openBrace.line + 1,
    bodyEndLine: closeBrace.line - 1,
    openBrace,
    closeBrace,
  };
}

/**
 * 버퍼 내의 모든 함수/메서드 노드를 감지합니다 (JS/TS/Python/Go/Rust/C 계열 지원).
 */
export function detectFunctions(lines: string[]): StructuralNode[] {
  const nodes: StructuralNode[] = [];
  const seenStarts = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue;
    }

    // 1. Python def / async def
    if (/^[ \t]*(?:async\s+)?def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(raw)) {
      const py = findIndentBlockEnd(lines, i);
      if (py && !seenStarts.has(i)) {
        seenStarts.add(i);
        nodes.push({
          kind: 'function',
          startLine: i,
          endLine: py.endLine,
          bodyStartLine: py.bodyStart,
          bodyEndLine: py.endLine,
        });
      }
      continue;
    }

    // 2. function / fn / func 키워드 선언
    if (
      /^[ \t]*(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:function\*?|fn|func)\b/.test(
        raw
      )
    ) {
      const open = findHeaderOpenBrace(lines, i);
      if (open && !seenStarts.has(i)) {
        const node = buildBraceNode('function', lines, i, open);
        if (node) {
          seenStarts.add(i);
          nodes.push(node);
        }
      }
      continue;
    }

    // 3. 화살표 함수: const foo = (...) => { ... } 또는 const foo = (a) => expr;
    const arrowMatch = raw.match(
      /^[ \t]*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=>{]+)?=>/
    );
    if (arrowMatch && !seenStarts.has(i)) {
      const arrowEnd = arrowMatch[0].length;
      const afterArrow = raw.slice(arrowEnd);
      const braceOffset = afterArrow.indexOf('{');
      if (braceOffset >= 0) {
        const open = { line: i, col: arrowEnd + braceOffset };
        const node = buildBraceNode('function', lines, i, open);
        if (node) {
          seenStarts.add(i);
          nodes.push(node);
        }
      } else {
        // 단일 줄 표현식 화살표 함수
        const exprLead = afterArrow.match(/^[ \t]*/)?.[0].length ?? 0;
        let exprEnd = raw.trimEnd().length - 1;
        if (raw[exprEnd] === ';') exprEnd--;
        const exprStart = arrowEnd + exprLead;
        seenStarts.add(i);
        nodes.push({
          kind: 'function',
          startLine: i,
          endLine: i,
          bodyStartLine: i,
          bodyEndLine: i,
          inlineBody: { startCol: exprStart, endCol: Math.max(exprStart, exprEnd) },
        });
      }
      continue;
    }

    // 4. 클래스/객체 메서드: `  async fetchUser(id: string): Promise<User> {`
    const methodMatch = raw.match(
      /^[ \t]+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::[^{;]+)?\{/
    );
    if (methodMatch && !CONTROL_FLOW_NAMES.has(methodMatch[1]) && !seenStarts.has(i)) {
      const openCol = raw.indexOf('{', methodMatch[0].length - 1);
      if (openCol >= 0) {
        const node = buildBraceNode('function', lines, i, { line: i, col: openCol });
        if (node) {
          seenStarts.add(i);
          nodes.push(node);
        }
      }
    }
  }

  return nodes;
}

/**
 * 버퍼 내의 모든 클래스·인터페이스·구조체·트레이트·enum 노드를 감지합니다.
 */
export function detectClasses(lines: string[]): StructuralNode[] {
  const nodes: StructuralNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue;
    }

    // 1. Python class Foo:
    if (/^[ \t]*class\s+[A-Za-z_][A-Za-z0-9_]*\b.*:\s*(?:#.*)?$/.test(raw)) {
      const py = findIndentBlockEnd(lines, i);
      if (py) {
        nodes.push({
          kind: 'class',
          startLine: i,
          endLine: py.endLine,
          bodyStartLine: py.bodyStart,
          bodyEndLine: py.endLine,
        });
      }
      continue;
    }

    // 2. Brace-based class / interface / struct / enum / impl / trait
    if (
      /^[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:class|interface|struct|enum|impl|trait)\s+[A-Za-z_$][A-Za-z0-9_$]*/.test(
        raw
      )
    ) {
      const open = findHeaderOpenBrace(lines, i);
      if (open) {
        const node = buildBraceNode('class', lines, i, open);
        if (node) nodes.push(node);
      }
    }
  }

  return nodes;
}

/**
 * 함수(`af`/`if`) 또는 클래스(`ac`/`ic`) 텍스트 객체의 범위를 계산합니다.
 */
export function getStructuralObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: 'af' | 'if' | 'ac' | 'ic',
  count = 1
): TextObjectRange | null {
  const nodes = objectType[1] === 'f' ? detectFunctions(lines) : detectClasses(lines);
  const enclosing = nodes
    .filter((n) => n.startLine <= cursor.line && cursor.line <= n.endLine)
    .sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine));

  if (enclosing.length === 0) return null;

  const target = enclosing[Math.min(Math.max(1, count) - 1, enclosing.length - 1)];
  const isInner = objectType[0] === 'i';

  if (!isInner) {
    if (target.startLine === target.endLine) {
      const text = lines[target.startLine] ?? '';
      return {
        startLine: target.startLine,
        startCol: firstNonBlankCol(text),
        endLine: target.endLine,
        endCol: Math.max(0, text.trimEnd().length - 1),
      };
    }
    return {
      startLine: target.startLine,
      startCol: 0,
      endLine: target.endLine,
      endCol: Math.max(0, (lines[target.endLine] ?? '').length - 1),
      linewise: true,
    };
  }

  // Inner (if / ic)
  if (target.inlineBody) {
    if (target.inlineBody.startCol > target.inlineBody.endCol) {
      return {
        startLine: target.startLine,
        startCol: target.inlineBody.startCol,
        endLine: target.startLine,
        endCol: target.inlineBody.startCol - 1,
        isEmpty: true,
      };
    }
    return {
      startLine: target.startLine,
      startCol: target.inlineBody.startCol,
      endLine: target.startLine,
      endCol: target.inlineBody.endCol,
    };
  }

  if (target.bodyStartLine > target.bodyEndLine) {
    const line = target.openBrace?.line ?? target.startLine;
    const col = target.openBrace ? target.openBrace.col + 1 : 0;
    return {
      startLine: line,
      startCol: col,
      endLine: line,
      endCol: col - 1,
      isEmpty: true,
    };
  }

  return {
    startLine: target.bodyStartLine,
    startCol: 0,
    endLine: target.bodyEndLine,
    endCol: Math.max(0, (lines[target.bodyEndLine] ?? '').length - 1),
    linewise: true,
  };
}

// ---- 인자/매개변수 텍스트 객체 (aa / ia) ------------------------------------

interface OffsetPair {
  open: number;
  close: number;
}

function buildLineOffsets(lines: string[]): { flat: string; starts: number[] } {
  const starts: number[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    starts.push(offset);
    offset += (lines[i] ?? '').length + 1; // '\n' 포함
  }
  return { flat: lines.join('\n'), starts };
}

function offsetToCursor(starts: number[], offset: number): CursorPosition {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, col: Math.max(0, offset - starts[lo]) };
}

function findEnclosingArgContainer(flat: string, cursorOffset: number, lineStart: number, lineEnd: number): OffsetPair | null {
  const pairs: OffsetPair[] = [];
  const stack: Array<{ ch: string; idx: number }> = [];
  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    const next = flat[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '(' || ch === '[') {
      stack.push({ ch, idx: i });
    } else if (ch === ')' || ch === ']') {
      const expected = ch === ')' ? '(' : '[';
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].ch === expected) {
          const open = stack[s].idx;
          stack.splice(s);
          pairs.push({ open, close: i });
          break;
        }
      }
    }
  }

  // 커서를 감싸는 가장 안쪽 () 또는 [] 컨테이너
  const enclosing = pairs
    .filter((p) => p.open <= cursorOffset && cursorOffset <= p.close)
    .sort((a, b) => a.close - a.open - (b.close - b.open));
  if (enclosing.length > 0) return enclosing[0];

  // 같은 줄에서 커서 앞쪽에 있는 가장 가까운 () / [] 컨테이너 폴백
  const forwardOnLine = pairs
    .filter((p) => p.open >= cursorOffset && p.open <= lineEnd && p.open >= lineStart)
    .sort((a, b) => a.open - b.open);
  return forwardOnLine[0] ?? null;
}

interface ArgSpan {
  rawStart: number;
  rawEnd: number; // exclusive
  trimStart: number;
  trimEnd: number; // exclusive
  prevComma?: number;
  nextComma?: number;
}

function splitTopLevelArgs(flat: string, innerStart: number, innerEnd: number): ArgSpan[] {
  const commaIndices: number[] = [];
  let depth = 0;
  let inString: string | null = null;

  for (let i = innerStart; i < innerEnd; i++) {
    const ch = flat[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') {
      if (depth > 0) depth--;
    } else if (ch === ',' && depth === 0) {
      commaIndices.push(i);
    }
  }

  const rawBounds: Array<[number, number, number | undefined, number | undefined]> = [];
  let segStart = innerStart;
  for (let i = 0; i < commaIndices.length; i++) {
    const comma = commaIndices[i];
    rawBounds.push([segStart, comma, i > 0 ? commaIndices[i - 1] : undefined, comma]);
    segStart = comma + 1;
  }
  rawBounds.push([
    segStart,
    innerEnd,
    commaIndices.length > 0 ? commaIndices[commaIndices.length - 1] : undefined,
    undefined,
  ]);

  const spans: ArgSpan[] = [];
  for (const [rawStart, rawEnd, prevComma, nextComma] of rawBounds) {
    let ts = rawStart;
    while (ts < rawEnd && /\s/.test(flat[ts])) ts++;
    let te = rawEnd;
    while (te > ts && /\s/.test(flat[te - 1])) te--;
    if (ts < te) {
      spans.push({ rawStart, rawEnd, trimStart: ts, trimEnd: te, prevComma, nextComma });
    }
  }

  return spans;
}

/**
 * 인자/매개변수 텍스트 객체(`aa` / `ia`)의 범위를 계산합니다.
 * 단일 줄 및 멀티라인 괄호/배열 내부의 최상위 쉼표 구분 인자를 정확히 인식합니다.
 */
export function getArgumentObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: 'aa' | 'ia'
): TextObjectRange | null {
  if (lines.length === 0) return null;
  const { flat, starts } = buildLineOffsets(lines);
  const lineStart = starts[cursor.line] ?? 0;
  const lineLen = (lines[cursor.line] ?? '').length;
  const lineEnd = lineStart + lineLen;
  const cursorOffset = lineStart + Math.min(cursor.col, Math.max(0, lineLen - 1));

  const container = findEnclosingArgContainer(flat, cursorOffset, lineStart, lineEnd);
  if (!container) return null;

  const args = splitTopLevelArgs(flat, container.open + 1, container.close);
  if (args.length === 0) return null;

  let idx = args.findIndex((a) => cursorOffset >= a.rawStart && cursorOffset <= a.rawEnd);
  if (idx < 0) {
    idx = cursorOffset <= args[0].rawStart ? 0 : args.length - 1;
  }

  const arg = args[idx];
  let rangeStart = arg.trimStart;
  let rangeEndExcl = arg.trimEnd;

  if (objectType === 'aa') {
    if (arg.nextComma !== undefined) {
      // 뒤따르는 쉼표와 공백(멀티라인이면 다음 인자 시작 전 공백까지) 포함
      let after = arg.nextComma + 1;
      while (after < container.close && /[ \t]/.test(flat[after])) after++;
      if (after < container.close && flat[after] === '\n') {
        after++;
        while (after < container.close && /[ \t]/.test(flat[after])) after++;
      }
      rangeEndExcl = after;
    } else if (arg.prevComma !== undefined) {
      // 마지막 인자는 앞선 쉼표부터 인자 끝까지 포함 (dangling comma 방지)
      rangeStart = arg.prevComma;
    }
  }

  const startPos = offsetToCursor(starts, rangeStart);
  const endPos = offsetToCursor(starts, Math.max(rangeStart, rangeEndExcl - 1));
  return {
    startLine: startPos.line,
    startCol: startPos.col,
    endLine: endPos.line,
    endCol: endPos.col,
  };
}

/**
 * 통합 Treesitter 텍스트 객체 범위 계산 진입점 (`af`/`if`, `ac`/`ic`, `aa`/`ia`).
 */
export function getTreesitterObjectRange(
  lines: string[],
  cursor: CursorPosition,
  objectType: TreesitterObjectType,
  count = 1
): TextObjectRange | null {
  if (objectType === 'aa' || objectType === 'ia') {
    return getArgumentObjectRange(lines, cursor, objectType);
  }
  return getStructuralObjectRange(lines, cursor, objectType, count);
}

/**
 * `]f` / `[f` (다음/이전 함수 시작) 및 `]F` / `[F` (다음/이전 함수 끝) 점프 대상을 계산합니다.
 */
export function findFunctionJumpTarget(
  lines: string[],
  cursor: CursorPosition,
  key: ']f' | '[f' | ']F' | '[F',
  count = 1
): CursorPosition | null {
  const funcs = detectFunctions(lines);
  if (funcs.length === 0) return null;

  const n = Math.max(1, count);
  const isEnd = key === ']F' || key === '[F';
  const forward = key === ']f' || key === ']F';

  const targetLines = Array.from(
    new Set(funcs.map((f) => (isEnd ? f.endLine : f.startLine)))
  ).sort((a, b) => a - b);

  if (forward) {
    const candidates = targetLines.filter((l) => l > cursor.line);
    if (candidates.length === 0) return null;
    const line = candidates[Math.min(n - 1, candidates.length - 1)];
    return { line, col: firstNonBlankCol(lines[line] ?? '') };
  }

  const candidates = targetLines.filter((l) => l < cursor.line).reverse();
  if (candidates.length === 0) return null;
  const line = candidates[Math.min(n - 1, candidates.length - 1)];
  return { line, col: firstNonBlankCol(lines[line] ?? '') };
}
