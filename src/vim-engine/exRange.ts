import { VimEditorState } from './types';
import { compileVimRegex } from './vimRegex';
import { msg } from './messages';

/**
 * 버퍼에서 패턴과 매칭되는 줄 번호를 검색합니다.
 */
function searchPatternLine(
  pattern: string,
  state: VimEditorState,
  fromLine: number,
  forward: boolean
): number | null {
  if (state.lines.length === 0) return null;
  let regex: RegExp;
  try {
    regex = compileVimRegex(pattern, { ignorecase: state.options?.ignorecase, smartcase: state.options?.smartcase });
  } catch {
    return null;
  }

  const total = state.lines.length;
  if (forward) {
    for (let offset = 0; offset < total; offset++) {
      const idx = (fromLine + offset) % total;
      if (regex.test(state.lines[idx])) {
        return idx;
      }
    }
  } else {
    for (let offset = 0; offset < total; offset++) {
      const idx = (fromLine - offset + total) % total;
      if (regex.test(state.lines[idx])) {
        return idx;
      }
    }
  }
  return null;
}

/**
 * 단일 Ex 주소({address})를 파싱하여 대상 행(0-indexed)과 소비된 문자 길이를 반환합니다.
 */
export function parseSingleAddress(
  input: string,
  state: VimEditorState,
  fromLine?: number,
  isSecondAddr = false
): { line: number; consumed: number; error?: string } | null {
  const totalLines = state.lines.length;
  const baseFromLine = fromLine ?? state.cursor.line;
  let consumed = 0;
  let baseLine: number | null = null;

  // 1. 순방향 패턴 검색: /pattern/
  if (input.startsWith('/')) {
    let idx = 1;
    let pat = '';
    while (idx < input.length) {
      if (input[idx] === '\\' && idx + 1 < input.length) {
        if (input[idx + 1] === '/') {
          pat += '/';
          idx += 2;
          continue;
        }
        pat += '\\' + input[idx + 1];
        idx += 2;
        continue;
      }
      if (input[idx] === '/') {
        break;
      }
      pat += input[idx];
      idx++;
    }
    if (idx < input.length && input[idx] === '/') {
      consumed = idx + 1;
      const searchStart = isSecondAddr ? (baseFromLine + 1) % totalLines : baseFromLine;
      const matchedLine = searchPatternLine(pat, state, searchStart, true);
      if (matchedLine === null) {
        return { line: -1, consumed, error: msg('E486: 패턴을 찾을 수 없습니다: {pat}', { pat }) };
      }
      baseLine = matchedLine;
    } else {
      return null;
    }
  }
  // 2. 역방향 패턴 검색: ?pattern?
  else if (input.startsWith('?')) {
    let idx = 1;
    let pat = '';
    while (idx < input.length) {
      if (input[idx] === '\\' && idx + 1 < input.length) {
        if (input[idx + 1] === '?') {
          pat += '?';
          idx += 2;
          continue;
        }
        pat += '\\' + input[idx + 1];
        idx += 2;
        continue;
      }
      if (input[idx] === '?') {
        break;
      }
      pat += input[idx];
      idx++;
    }
    if (idx < input.length && input[idx] === '?') {
      consumed = idx + 1;
      const searchStart = isSecondAddr ? (baseFromLine - 1 + totalLines) % totalLines : baseFromLine;
      const matchedLine = searchPatternLine(pat, state, searchStart, false);
      if (matchedLine === null) {
        return { line: -1, consumed, error: msg('E486: 패턴을 찾을 수 없습니다: {pat}', { pat }) };
      }
      baseLine = matchedLine;
    } else {
      return null;
    }
  }
  // 3. 마크 주소: 'a~'z, '<, '>
  else if (input.startsWith("'")) {
    if (input.length < 2) return null;
    const m = input[1];
    consumed = 2;
    if (m === '<') {
      baseLine = Math.min(
        state.visualAnchor?.line ?? state.lastVisualSelection?.anchor.line ?? state.cursor.line,
        state.cursor.line
      );
    } else if (m === '>') {
      baseLine = Math.max(
        state.visualAnchor?.line ?? state.lastVisualSelection?.cursor.line ?? state.cursor.line,
        state.cursor.line
      );
    } else if (state.marks && state.marks[m] !== undefined) {
      baseLine = state.marks[m].row;
    } else {
      return { line: -1, consumed, error: msg('E20: 마크가 설정되지 않았습니다: \'{m}', { m }) };
    }
  }
  // 4. 현재 줄: .
  else if (input.startsWith('.')) {
    consumed = 1;
    baseLine = state.cursor.line;
  }
  // 5. 마지막 줄: $
  else if (input.startsWith('$')) {
    consumed = 1;
    baseLine = Math.max(0, totalLines - 1);
  }
  // 6. 절대 줄 번호: [0-9]+
  else if (/^\d+/.test(input)) {
    const m = input.match(/^\d+/)!;
    consumed = m[0].length;
    const n = parseInt(m[0], 10);
    baseLine = n === 0 ? -1 : n - 1;
  }
  // 7. 기준 기호 없는 상대 오프셋: + 또는 -
  else if (/^[+-]/.test(input)) {
    consumed = 0;
    baseLine = baseFromLine;
  } else {
    return null;
  }

  // 상대 오프셋 연속 파싱: (+|-)\d*
  let offset = 0;
  let rest = input.slice(consumed);
  while (rest.length > 0) {
    const offMatch = rest.match(/^\s*([+-])\s*(\d*)/);
    if (!offMatch || offMatch[0].length === 0) break;
    const sign = offMatch[1] === '-' ? -1 : 1;
    const num = offMatch[2] ? parseInt(offMatch[2], 10) : 1;
    offset += sign * num;
    consumed += offMatch[0].length;
    rest = input.slice(consumed);
  }

  return { line: baseLine + offset, consumed };
}

/**
 * 커맨드 문자열 앞부분에서 [range]와 나머지 명령어 부분을 추출합니다.
 */
export function extractRangeAndCommand(
  rawInput: string,
  state: VimEditorState
): {
  range: { startLine: number; endLine: number } | null;
  hasRange: boolean;
  command: string;
  error?: string;
  isLineZero?: boolean;
} {
  const raw = rawInput.replace(/^:\s*/, '').trimStart();
  const totalLines = state.lines.length;

  if (raw.length === 0) {
    return { range: null, hasRange: false, command: '' };
  }

  // 1. % (전체 버퍼 범위)
  if (raw.startsWith('%')) {
    const cmd = raw.slice(1).trimStart();
    return {
      range: { startLine: 0, endLine: Math.max(0, totalLines - 1) },
      hasRange: true,
      command: cmd,
    };
  }

  // 2. '<,'> 또는 <,> (비주얼 선택 영역)
  const visMatch = raw.match(/^('<,'>|<,>)/);
  if (visMatch) {
    const anchorLine =
      state.visualAnchor?.line ?? state.lastVisualSelection?.anchor.line ?? state.cursor.line;
    const cursorLine = state.cursor.line;
    const startLine = Math.max(0, Math.min(anchorLine, cursorLine));
    const endLine = Math.min(Math.max(0, totalLines - 1), Math.max(anchorLine, cursorLine));
    const cmd = raw.slice(visMatch[0].length).trimStart();
    return {
      range: { startLine, endLine },
      hasRange: true,
      command: cmd,
    };
  }

  // 3. 첫 번째 주소 시도
  const res1 = parseSingleAddress(raw, state, state.cursor.line, false);
  if (res1?.error) {
    return { range: null, hasRange: true, command: '', error: res1.error };
  }
  if (!res1 || res1.consumed === 0) {
    return { range: null, hasRange: false, command: raw };
  }

  let consumed = res1.consumed;
  const rest = raw.slice(consumed);
  const sepMatch = rest.match(/^\s*([,;])\s*/);

  if (sepMatch) {
    const afterSep = rest.slice(sepMatch[0].length);
    const res2 = parseSingleAddress(afterSep, state, res1.line, true);
    if (res2?.error) {
      return { range: null, hasRange: true, command: '', error: res2.error };
    }
    if (res2 && res2.consumed > 0) {
      consumed += sepMatch[0].length + res2.consumed;
      const startLine = Math.max(0, Math.min(res1.line, res2.line));
      const endLine = Math.min(Math.max(0, totalLines - 1), Math.max(res1.line, res2.line));
      const cmd = raw.slice(consumed).trimStart();
      return {
        range: { startLine, endLine },
        hasRange: true,
        command: cmd,
      };
    } else {
      return { range: null, hasRange: true, command: '', error: msg('E16: 유효하지 않은 범위입니다') };
    }
  } else {
    // 단일 주소 범위
    const targetLine = Math.max(0, Math.min(Math.max(0, totalLines - 1), res1.line));
    const cmd = raw.slice(consumed).trimStart();
    return {
      range: { startLine: targetLine, endLine: targetLine },
      hasRange: true,
      command: cmd,
      isLineZero: res1.line === -1,
    };
  }
}

/**
 * Ex 커맨드 주소({address}) 문자열을 해석하여 대상 행 인덱스(-1 ~ lines.length - 1)를 반환합니다.
 * -1은 0번째 행 이전(파일 최상단)을 나타냅니다.
 */
export function parseAddress(
  addrStr: string,
  state: VimEditorState
): number | null {
  const trimmed = addrStr.trim();
  const totalLines = state.lines.length;

  if (trimmed === '0') {
    return -1;
  }

  const res = parseSingleAddress(trimmed, state, state.cursor.line);
  if (!res || res.error) {
    return null;
  }

  if (res.line === -1) {
    return -1;
  }
  if (res.line >= 0 && res.line < totalLines) {
    return res.line;
  }

  return null;
}

/**
 * Ex 커맨드 범위(range) 문자열을 0-indexed 시작/끝 행으로 해석합니다.
 */
export function parseRange(
  rawRange: string,
  state: VimEditorState
): { startLine: number; endLine: number } | null {
  const trimmed = rawRange.trim();
  if (trimmed === '.' || trimmed === '') {
    return { startLine: state.cursor.line, endLine: state.cursor.line };
  }
  const extracted = extractRangeAndCommand(trimmed, state);
  return extracted.range;
}

/**
 * Ex 커맨드라인에서 파이프(|)로 구분된 다중 명령어를 분할합니다 (:help :bar).
 * 따옴표('...', "..."), 람다/블록({ ... }), 괄호, 정규식 치환(:s/.../.../), 역슬래시 이스케이프(\|) 및 || 연산자 내부의 | 는 구분자로 처리하지 않습니다.
 * 단, 글로벌 명령(:g, :v)은 행마다 실행할 명령 자체에 | 를 포함하므로 최상위에서 분할하지 않습니다.
 */
export function splitPipedCommands(input: string): string[] {
  const trimmed = input.trimStart().replace(/^:\s*/, '');
  if (!trimmed) return [];

  // :g 또는 :v 글로벌 명령은 줄 단위 명령으로 전체를 넘김
  if (/^(g|global|v|vglobal)(!?)\s*[\/|\W]/.test(trimmed)) {
    return [trimmed];
  }

  // :argdo, :bufdo, :cdo, :cfdo, :ldo, :lfdo, :tabdo 등은 파이프(|)를 자체 인자로 포함하여 순회 실행함
  if (/^(argdo|bufdo|cdo|cfdo|ldo|lfdo|tabdo)(!?)\s+/.test(trimmed)) {
    return [trimmed];
  }

  const commands: string[] = [];
  let cur = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  let regexDelimiter: string | null = null;
  let regexDelimCount = 0;

  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];

    // 역슬래시 이스케이프 (\| 등)
    if (ch === '\\' && i + 1 < trimmed.length) {
      cur += ch + trimmed[i + 1];
      i += 2;
      continue;
    }

    // 작은따옴표 내부
    if (inSingleQuote) {
      if (ch === "'") {
        if (i + 1 < trimmed.length && trimmed[i + 1] === "'") {
          cur += "''";
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      cur += ch;
      i++;
      continue;
    }

    // 큰따옴표 내부
    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false;
      }
      cur += ch;
      i++;
      continue;
    }

    // 치환 정규식 구분자 추적 (s/pat/repl/flags)
    if (regexDelimiter !== null) {
      if (ch === regexDelimiter) {
        regexDelimCount++;
        if (regexDelimCount >= 3) {
          regexDelimiter = null;
          regexDelimCount = 0;
        }
      }
      cur += ch;
      i++;
      continue;
    }

    // 따옴표 진입
    if (ch === "'") {
      inSingleQuote = true;
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      cur += ch;
      i++;
      continue;
    }

    // 괄호 깊이 추적
    if (ch === '{') {
      braceDepth++;
      cur += ch;
      i++;
      continue;
    }
    if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      cur += ch;
      i++;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
      cur += ch;
      i++;
      continue;
    }
    if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      cur += ch;
      i++;
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      cur += ch;
      i++;
      continue;
    }
    if (ch === ']') {
      if (bracketDepth > 0) bracketDepth--;
      cur += ch;
      i++;
      continue;
    }

    // :s 치환 명령의 구분자 시작 감지 (예: %s/, s/, 1,5s/)
    if (
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      regexDelimiter === null
    ) {
      const matchSub = cur.match(/(?:^|\s)(?:%|\d+(?:,\d+)?)?\s*s(?:ubstitute)?$/);
      if (matchSub && !/[A-Za-z0-9_\s]/.test(ch)) {
        regexDelimiter = ch;
        regexDelimCount = 1;
        cur += ch;
        i++;
        continue;
      }
    }

    // 논리 연산자 || (logical OR) 건너뛰기
    if (ch === '|' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      cur += '||';
      i += 2;
      continue;
    }

    // 최상위 파이프 명령 구분자 (단, :!, :[range]!, :r !, :w ! 셸 명령 내부의 | 는 셸 파이프로 유지)
    if (
      ch === '|' &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      regexDelimiter === null &&
      !isExShellSegment(cur)
    ) {
      const cmd = cur.trim();
      if (cmd.length > 0) {
        commands.push(cmd);
      }
      cur = '';
      i++;
      continue;
    }

    cur += ch;
    i++;
  }

  const finalCmd = cur.trim();
  if (finalCmd.length > 0) {
    commands.push(finalCmd);
  }

  return commands;
}

/** Ex 명령 세그먼트가 셸 파이프/필터 명령(:!, :[range]!, :r !, :w !)인지 판별합니다. */
export function isExShellSegment(segment: string): boolean {
  const s = segment.trimStart().replace(/^:\s*/, '');
  const rangePrefix = String.raw`(?:%|\d+|\.|\$|'<,'>|<,>|'[a-zA-Z]|\/(?:\\.|[^/])*\/|\?(?:\\.|[^?])*\?|[+-]\d*|\s|[,;])*`;
  const shellRe = new RegExp(
    `^${rangePrefix}(?:!|r(?:e(?:ad?)?)?\\s*!|w(?:r(?:i(?:te?)?)?)?\\s+!)`
  );
  return shellRe.test(s);
}
