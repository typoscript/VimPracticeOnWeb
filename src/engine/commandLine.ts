import {
  VimEditorState,
  ConfirmSubstituteMatch,
  ConfirmSubstituteSession,
} from '../types/vim';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { splitWindow, closeSplitWindow, closeOtherPanes, resizeSplit } from './splitWindow';
import {
  formatBufferList,
  switchBuffer,
  nextBuffer,
  prevBuffer,
  firstBuffer,
  lastBuffer,
  deleteBuffer,
  editBuffer,
} from './bufferEngine';
import {
  openNewTab,
  closeTab,
  closeOtherTabs,
  nextTab,
  prevTab,
  firstTab,
  lastTab,
  moveTab,
} from './tabEngine';

export type KeyRunner = (
  state: VimEditorState,
  key: string,
  isReplayingDot?: boolean
) => VimEditorState;

export type ReplaceToken =
  | { type: 'char'; char: string }
  | { type: 'group'; index: number }
  | { type: 'modifier'; mod: 'u' | 'U' | 'l' | 'L' | 'E' };

/**
 * 순정 Vim 정규식 패턴을 JavaScript RegExp 패턴으로 변환합니다.
 * - \( 및 \) -> ( 및 ) (캡처 그룹 추출, 표준 ( )도 호환)
 * - \+ -> + (1회 이상 반복)
 * - \? -> ? (0회 또는 1회)
 * - \| -> | (선택 분기)
 * - \{n,m\} -> {n,m} (수량자)
 * - \< 및 \> -> \b (단어 경계)
 * - \s, \d, \w 등 표준 이스케이프 유지
 * - [...] 문자 클래스 내부 내용은 그대로 보존
 */
export function vimRegexToJsRegex(vimPattern: string): string {
  let jsPattern = '';
  let i = 0;
  let inCharClass = false;

  while (i < vimPattern.length) {
    const ch = vimPattern[i];

    if (inCharClass) {
      if (ch === '\\' && i + 1 < vimPattern.length) {
        jsPattern += ch + vimPattern[i + 1];
        i += 2;
        continue;
      }
      if (ch === ']') {
        inCharClass = false;
      }
      jsPattern += ch;
      i++;
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      jsPattern += ch;
      i++;
      continue;
    }

    if (ch === '\\') {
      if (i + 1 >= vimPattern.length) {
        jsPattern += '\\\\';
        i++;
        continue;
      }
      const next = vimPattern[i + 1];
      if (next === '(') {
        jsPattern += '(';
        i += 2;
      } else if (next === ')') {
        jsPattern += ')';
        i += 2;
      } else if (next === '+') {
        jsPattern += '+';
        i += 2;
      } else if (next === '?') {
        jsPattern += '?';
        i += 2;
      } else if (next === '|') {
        jsPattern += '|';
        i += 2;
      } else if (next === '{') {
        jsPattern += '{';
        i += 2;
      } else if (next === '}') {
        jsPattern += '}';
        i += 2;
      } else if (next === '<' || next === '>') {
        jsPattern += '\\b';
        i += 2;
      } else if (next === '\\') {
        jsPattern += '\\\\';
        i += 2;
      } else if (next === '/') {
        jsPattern += '/';
        i += 2;
      } else {
        jsPattern += '\\' + next;
        i += 2;
      }
      continue;
    }

    jsPattern += ch;
    i++;
  }

  return jsPattern;
}

/**
 * 치환 문자열(replacement)을 파싱하여 토큰 목록으로 분해합니다.
 * \1~\9 (캡처 그룹 역참조), & 및 \0 (전체 매칭), \u, \U, \l, \L, \E (대소문자 제어)
 */
export function parseReplacementTokens(rep: string): ReplaceToken[] {
  const tokens: ReplaceToken[] = [];
  let i = 0;

  while (i < rep.length) {
    const ch = rep[i];

    if (ch === '&') {
      tokens.push({ type: 'group', index: 0 });
      i++;
      continue;
    }

    if (ch === '\\') {
      if (i + 1 >= rep.length) {
        tokens.push({ type: 'char', char: '\\' });
        i++;
        continue;
      }

      const next = rep[i + 1];

      if (next === '&') {
        tokens.push({ type: 'char', char: '&' });
        i += 2;
      } else if (next === '\\') {
        tokens.push({ type: 'char', char: '\\' });
        i += 2;
      } else if (next === '0') {
        tokens.push({ type: 'group', index: 0 });
        i += 2;
      } else if (next >= '1' && next <= '9') {
        tokens.push({ type: 'group', index: parseInt(next, 10) });
        i += 2;
      } else if (next === 'u' || next === 'U' || next === 'l' || next === 'L') {
        tokens.push({ type: 'modifier', mod: next });
        i += 2;
      } else if (next === 'e' || next === 'E') {
        tokens.push({ type: 'modifier', mod: 'E' });
        i += 2;
      } else if (next === 'n') {
        tokens.push({ type: 'char', char: '\n' });
        i += 2;
      } else if (next === 'r') {
        tokens.push({ type: 'char', char: '\n' });
        i += 2;
      } else if (next === 't') {
        tokens.push({ type: 'char', char: '\t' });
        i += 2;
      } else {
        tokens.push({ type: 'char', char: next });
        i += 2;
      }
      continue;
    }

    tokens.push({ type: 'char', char: ch });
    i++;
  }

  return tokens;
}

/**
 * 매칭 결과와 캡처 그룹을 바탕으로 치환 문자열 토큰을 전개합니다.
 * \u: 다음 1글자만 대문자
 * \l: 다음 1글자만 소문자
 * \U: 이후 모든 문자 대문자 (또는 \E까지)
 * \L: 이후 모든 문자 소문자 (또는 \E까지)
 */
export function evaluateReplacement(
  tokens: ReplaceToken[],
  match: string,
  groups: (string | undefined)[]
): string {
  let streamCase: 'none' | 'upper' | 'lower' = 'none';
  let nextCharCase: 'none' | 'upper' | 'lower' = 'none';
  let result = '';

  const applyCase = (c: string): string => {
    let res = c;
    if (nextCharCase === 'upper') {
      res = res.toUpperCase();
      nextCharCase = 'none';
    } else if (nextCharCase === 'lower') {
      res = res.toLowerCase();
      nextCharCase = 'none';
    } else if (streamCase === 'upper') {
      res = res.toUpperCase();
    } else if (streamCase === 'lower') {
      res = res.toLowerCase();
    }
    return res;
  };

  for (const token of tokens) {
    if (token.type === 'char') {
      result += applyCase(token.char);
    } else if (token.type === 'modifier') {
      if (token.mod === 'u') {
        nextCharCase = 'upper';
      } else if (token.mod === 'l') {
        nextCharCase = 'lower';
      } else if (token.mod === 'U') {
        streamCase = 'upper';
      } else if (token.mod === 'L') {
        streamCase = 'lower';
      } else if (token.mod === 'E') {
        streamCase = 'none';
      }
    } else if (token.type === 'group') {
      const text = token.index === 0 ? match : (groups[token.index - 1] ?? '');
      for (let j = 0; j < text.length; j++) {
        result += applyCase(text[j]);
      }
    }
  }

  return result;
}

/**
 * :s/old/new/flags 커맨드를 구분자(/ 또는 기타) 기준으로 분해합니다.
 */
export function parseSubstitutionCommand(cmd: string): {
  oldText: string;
  newText: string;
  flags: string;
} | null {
  const m = cmd.match(/^(?:s|substitute)(?![a-zA-Z])\s*/);
  if (!m) return null;
  const afterS = cmd.slice(m[0].length);
  if (afterS.length === 0) return null;

  const delim = afterS[0];
  if (/[a-zA-Z0-9\s]/.test(delim)) {
    return null;
  }

  let idx = 1;
  let oldText = '';
  while (idx < afterS.length) {
    if (afterS[idx] === '\\' && idx + 1 < afterS.length) {
      if (afterS[idx + 1] === delim) {
        oldText += '\\' + delim;
        idx += 2;
        continue;
      }
      oldText += '\\' + afterS[idx + 1];
      idx += 2;
      continue;
    }
    if (afterS[idx] === delim) {
      break;
    }
    oldText += afterS[idx];
    idx++;
  }

  if (idx >= afterS.length || afterS[idx] !== delim) {
    return null;
  }

  idx++;
  let newText = '';
  while (idx < afterS.length) {
    if (afterS[idx] === '\\' && idx + 1 < afterS.length) {
      if (afterS[idx + 1] === delim) {
        newText += delim;
        idx += 2;
        continue;
      }
      newText += '\\' + afterS[idx + 1];
      idx += 2;
      continue;
    }
    if (afterS[idx] === delim) {
      break;
    }
    newText += afterS[idx];
    idx++;
  }

  let flags = '';
  if (idx < afterS.length && afterS[idx] === delim) {
    flags = afterS.slice(idx + 1).trim();
  }

  return { oldText, newText, flags };
}

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
  const jsPat = vimRegexToJsRegex(pattern);
  let regex: RegExp;
  try {
    regex = new RegExp(jsPat);
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
        return { line: -1, consumed, error: `E486: 패턴을 찾을 수 없습니다: ${pat}` };
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
        return { line: -1, consumed, error: `E486: 패턴을 찾을 수 없습니다: ${pat}` };
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
      return { line: -1, consumed, error: `E20: 마크가 설정되지 않았습니다: '${m}` };
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
      return { range: null, hasRange: true, command: '', error: 'E16: 유효하지 않은 범위입니다' };
    }
  } else {
    // 단일 주소 범위
    const targetLine = Math.max(0, Math.min(Math.max(0, totalLines - 1), res1.line));
    const cmd = raw.slice(consumed).trimStart();
    return {
      range: { startLine: targetLine, endLine: targetLine },
      hasRange: true,
      command: cmd,
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
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  const trimmed = commandStr.trimStart();

  // 1. 빈 명령인 경우 NORMAL 모드로 복귀
  if (trimmed.trim().length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  // 2. 글로벌 명령: :g/pattern/cmd, :v/pattern/cmd, :g!/pattern/cmd
  const gMatch = trimmed.match(/^:?\s*(g|global|v|vglobal)(!?)\s*\/([^\/]+)\/(.*)$/);
  if (gMatch) {
    return executeGlobalCommand(state, gMatch, commandStr, keyRunner);
  }

  // 3. 창 분할 및 종료, 설정, 키매핑 명령어
  const cleanCmdRaw = trimmed.replace(/^:/, '').trim();
  const splitMatch = cleanCmdRaw.match(/^(sp|split|vsp|vsplit)(?:\s+(.+))?$/i);
  if (splitMatch) {
    const isVertical = splitMatch[1].toLowerCase().startsWith('v');
    const targetFile = splitMatch[2]?.trim();
    const splitRes = splitWindow(
      state,
      isVertical ? 'vertical' : 'horizontal',
      state.secondaryLines,
      targetFile || state.secondaryFilename
    );
    return {
      ...splitRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 새 파일 창 분할: :new, :vnew [filename]
  const newWinMatch = cleanCmdRaw.match(/^(new|vnew)(?:\s+(.+))?$/i);
  if (newWinMatch) {
    const isVertical = newWinMatch[1].toLowerCase() === 'vnew';
    const targetFile = newWinMatch[2]?.trim() || '[No Name]';
    const splitRes = splitWindow(
      state,
      isVertical ? 'vertical' : 'horizontal',
      [''],
      targetFile
    );
    return {
      ...splitRes,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  const cleanCmd = cleanCmdRaw.toLowerCase();

  // 창 닫기: :close, :clo
  if (cleanCmd === 'close' || cleanCmd === 'clo') {
    const res = closeSplitWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 현재 창만 유지: :only, :on
  if (cleanCmd === 'only' || cleanCmd === 'on') {
    const res = closeOtherPanes(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 창 크기 조절: :res, :resize, :vertical res
  const resizeMatch = cleanCmdRaw.match(/^(?:(vertical|vert)\s+)?(?:res|resize)(?:\s+([+-]?\d+|=))?$/i);
  if (resizeMatch) {
    const deltaStr = resizeMatch[2];
    const delta = deltaStr === '=' ? '=' : deltaStr ? parseInt(deltaStr, 10) : 5;
    const res = resizeSplit(state, delta);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 목록 조회: :ls, :buffers, :files
  if (cleanCmd === 'ls' || cleanCmd === 'buffers' || cleanCmd === 'files') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatBufferList(state),
    };
  }

  // 버퍼 순회: :bn, :bnext, :bp, :bprev, :bprevious ([count] 지원)
  const bnMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(bn|bnext|bp|bprev|bprevious)$/i);
  if (bnMatch) {
    const count = bnMatch[1] ? parseInt(bnMatch[1], 10) : 1;
    const isNext = bnMatch[2].toLowerCase().startsWith('bn');
    const res = isNext ? nextBuffer(state, count) : prevBuffer(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 양 끝 이동: :bf, :bfirst, :bl, :blast
  if (cleanCmd === 'bf' || cleanCmd === 'bfirst') {
    return {
      ...firstBuffer(state),
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'bl' || cleanCmd === 'blast') {
    return {
      ...lastBuffer(state),
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 삭제: :bd, :bdelete, :bdel
  const bdMatch = cleanCmdRaw.match(/^(?:bd|bdelete|bdel)(?:\s+(.+))?$/i);
  if (bdMatch) {
    const target = bdMatch[1]?.trim();
    const res = deleteBuffer(state, target);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 파일 열기/새 버퍼 생성: :e, :edit
  const eMatch = cleanCmdRaw.match(/^(?:e|edit)\s+(\S+)$/i);
  if (eMatch) {
    const filename = eMatch[1].trim();
    const res = editBuffer(state, filename);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 전환: :b {target}, :buffer {target}
  const bMatch = cleanCmdRaw.match(/^(?:b|buffer)(?:\s+(.+))?$/i);
  if (bMatch && !cleanCmdRaw.match(/^(?:bn|bnext|bp|bprev|bprevious|bf|bfirst|bl|blast|bd|bdelete|bdel)/i)) {
    const target = bMatch[1]?.trim();
    const res = target ? switchBuffer(state, target) : nextBuffer(state, 1);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 생성: :tabnew, :tabedit, :tabe [filename]
  const tabNewMatch = cleanCmdRaw.match(/^(?:tabnew|tabedit|tabe)(?:\s+(.+))?$/i);
  if (tabNewMatch) {
    const filename = tabNewMatch[1]?.trim();
    const res = openNewTab(state, filename);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 닫기: :tabc, :tabclose [N]
  const tabCloseMatch = cleanCmdRaw.match(/^(?:tabc|tabclose)(?:\s+(\d+))?$/i);
  if (tabCloseMatch) {
    const targetIdx = tabCloseMatch[1] ? parseInt(tabCloseMatch[1], 10) : undefined;
    const res = closeTab(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 다른 탭 모두 닫기: :tabo, :tabonly
  if (cleanCmd === 'tabo' || cleanCmd === 'tabonly') {
    const res = closeOtherTabs(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 순회(다음): :tabn, :tabnext [count]
  const tabNextMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabn|tabnext)(?:\s+(\d+))?$/i);
  if (tabNextMatch) {
    const countRaw = tabNextMatch[1] || tabNextMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : undefined;
    const res = nextTab(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 순회(이전): :tabp, :tabprev, :tabprevious [count]
  const tabPrevMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:tabp|tabprev|tabprevious)(?:\s+(\d+))?$/i);
  if (tabPrevMatch) {
    const countRaw = tabPrevMatch[1] || tabPrevMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevTab(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 양 끝 이동: :tabfirst, :tabfir, :tabr, :tabrewind, :tablast, :tabl
  if (
    cleanCmd === 'tabfirst' ||
    cleanCmd === 'tabfir' ||
    cleanCmd === 'tabr' ||
    cleanCmd === 'tabrewind'
  ) {
    const res = firstTab(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'tablast' || cleanCmd === 'tabl') {
    const res = lastTab(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 이동: :tabmove, :tabm [N]
  const tabMoveMatch = cleanCmdRaw.match(/^(?:tabmove|tabm)(?:\s+(.+))?$/i);
  if (tabMoveMatch) {
    const targetPos = tabMoveMatch[1]?.trim();
    const res = moveTab(state, targetPos);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (cleanCmd === 'w' || cleanCmd === 'write') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.',
    };
  }

  if (cleanCmd === 'q' || cleanCmd === 'quit') {
    if (state.splitDirection && state.splitDirection !== 'none') {
      const closed = closeSplitWindow(state);
      return {
        ...closed,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '단일 창 상태입니다 (:q)',
    };
  }

  if (cleanCmd === 'h' || cleanCmd === 'help') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '지원 명령어: :[범위]d (삭제), :[범위]y (복사), :[범위]norm [명령], :g/패턴/d (글로벌), :s/이전/새문자/g',
    };
  }

  // 리더 키(Leader Key) 설정: :let mapleader = " "
  const leaderMatch = trimmed.match(/^:?\s*let\s+(?:g:)?mapleader\s*=\s*(["'])(.*?)\1/i);
  if (leaderMatch) {
    let newLeader = leaderMatch[2];
    if (newLeader.toLowerCase() === '<space>') newLeader = ' ';
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      leaderKey: newLeader,
      commandMessage: `[리더 키 설정] mapleader = "${newLeader === ' ' ? '<Space>' : newLeader}"`,
    };
  }

  // 커스텀 키매핑 등록: :imap, :inoremap, :nmap, :nnoremap, :vmap, :vnoremap, :map, :noremap
  const mapMatch = trimmed.match(
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|map|noremap)\s+(\S+)\s+(.+)$/i
  );
  if (mapMatch) {
    const cmdType = mapMatch[1].toLowerCase();
    const from = mapMatch[2];
    const to = mapMatch[3].trim();
    let modePrefix = 'all';
    if (cmdType.startsWith('i')) modePrefix = 'i';
    else if (cmdType.startsWith('n')) modePrefix = 'n';
    else if (cmdType.startsWith('v')) modePrefix = 'v';

    const newKeymaps = { ...(state.userKeymaps ?? {}) };
    if (modePrefix === 'all') {
      newKeymaps[`n:${from}`] = to;
      newKeymaps[`i:${from}`] = to;
      newKeymaps[`v:${from}`] = to;
      newKeymaps[from] = to;
    } else {
      newKeymaps[`${modePrefix}:${from}`] = to;
      newKeymaps[from] = to;
    }

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      userKeymaps: newKeymaps,
      commandMessage: `[키매핑 등록] ${cmdType}: ${from} -> ${to}`,
    };
  }

  // 키매핑 해제: :unmap, :nunmap, :iunmap, :vunmap
  const unmapMatch = trimmed.match(/^:?\s*(unmap|nunmap|iunmap|vunmap)\s+(\S+)$/i);
  if (unmapMatch) {
    const from = unmapMatch[2];
    const newKeymaps = { ...(state.userKeymaps ?? {}) };
    delete newKeymaps[`n:${from}`];
    delete newKeymaps[`i:${from}`];
    delete newKeymaps[`v:${from}`];
    delete newKeymaps[from];

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      userKeymaps: newKeymaps,
      commandMessage: `[키매핑 해제] ${from}`,
    };
  }

  // 4. 공통 Range 파서 및 Ex 명령어 실행
  const extracted = extractRangeAndCommand(trimmed, state);
  if (extracted.error) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: extracted.error,
    };
  }

  const { range, hasRange, command } = extracted;
  const cmdTrimmed = command.trim();

  // 4-1. 명령어 없이 범위 또는 주소만 주어진 경우: 라인 이동 (예: ':10', ':$', ':+3', ':-2', ':\'a')
  if (hasRange && cmdTrimmed.length === 0 && range) {
    const targetLine = Math.max(0, Math.min(range.endLine, state.lines.length - 1));
    const nextCursor = clampCursor(
      state.lines,
      { line: targetLine, col: state.cursor.col },
      'NORMAL'
    );
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      cursor: nextCursor,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `${targetLine + 1}번째 줄로 이동했습니다.`,
    };
  }

  const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
  const fullBufferRange = { startLine: 0, endLine: Math.max(0, state.lines.length - 1) };

  // 4-2. 치환: :[range]s/old/new/flags 또는 :s/old/new/flags
  const sub = parseSubstitutionCommand(command);
  if (sub) {
    const targetRange = range ?? currentLineRange;
    return executeSubstitution(state, targetRange, sub.oldText, sub.newText, sub.flags, trimmed);
  }

  // 4-3. 삭제: :[range]d, :d, :[range]delete
  if (cmdTrimmed === 'd' || cmdTrimmed === 'delete') {
    const targetRange = range ?? currentLineRange;
    return executeRangeDelete(state, targetRange, trimmed);
  }

  // 4-4. 복사: :[range]y, :y, :[range]yank
  if (cmdTrimmed === 'y' || cmdTrimmed === 'yank') {
    const targetRange = range ?? currentLineRange;
    return executeRangeYank(state, targetRange);
  }

  // 4-5. Normal 모드 명령 실행: :[range]norm {keys}, :norm {keys}
  const normMatch = command.match(/^(?:norm|normal)(!?)\s+(.*)$/);
  if (normMatch) {
    const targetRange = range ?? currentLineRange;
    return executeRangeNorm(state, targetRange, normMatch[2], trimmed, keyRunner);
  }

  // 4-6. 정렬: :[range]sort, :sort
  const sortMatch = cmdTrimmed.match(/^sort(!?)(?:\s+(.*))?$/);
  if (sortMatch) {
    const targetRange = range ?? fullBufferRange;
    return executeSort(state, targetRange, sortMatch[1], sortMatch[2]);
  }

  // 4-7. 이동: :[range]m {address}, :m {address}
  const moveMatch = cmdTrimmed.match(/^(?:m|move)\s+(.*)$/);
  if (moveMatch) {
    const targetRange = range ?? currentLineRange;
    return executeMove(state, targetRange, moveMatch[1]);
  }

  // 4-8. 복제: :[range]t {address}, :t {address}, :co, :copy
  const copyMatch = cmdTrimmed.match(/^(?:t|co|copy)\s+(.*)$/);
  if (copyMatch) {
    const targetRange = range ?? currentLineRange;
    return executeCopy(state, targetRange, copyMatch[1]);
  }

  // 5. 알 수 없는 명령어는 에러 메시지와 함께 NORMAL 모드로 복귀
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `E492: 지원하지 않는 에디터 명령어입니다: ${trimmed}`,
  };
}

/**
 * [range]sort [u][!] [n] 명령어를 실행합니다.
 */
export function executeSort(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  bang: string,
  argsStr?: string
): VimEditorState {
  const minLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const maxLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  if (minLine > maxLine || state.lines.length === 0) {
    return { ...state, mode: 'NORMAL', commandBuffer: undefined, commandType: undefined };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const flags = (argsStr ?? '').trim();
  const isDescending = bang === '!' || flags.includes('!');
  const isUnique = flags.includes('u');
  const isNumeric = flags.includes('n');

  const selectedLines = state.lines.slice(minLine, maxLine + 1);

  const extractNumber = (line: string): number | null => {
    const m = line.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  };

  // 안정 정렬(Stable Sort)을 위해 원본 인덱스 유지
  const indexed = selectedLines.map((line, idx) => ({ line, idx }));

  indexed.sort((a, b) => {
    if (isNumeric) {
      const numA = extractNumber(a.line);
      const numB = extractNumber(b.line);
      if (numA !== null && numB !== null) {
        if (numA !== numB) {
          return isDescending ? numB - numA : numA - numB;
        }
      } else if (numA !== null) {
        return isDescending ? 1 : -1;
      } else if (numB !== null) {
        return isDescending ? -1 : 1;
      }
      return a.idx - b.idx;
    }

    const cmp = a.line.localeCompare(b.line);
    if (cmp !== 0) {
      return isDescending ? -cmp : cmp;
    }
    return a.idx - b.idx;
  });

  const sortedLines = indexed.map((item) => item.line);

  let finalLines: string[];
  if (isUnique) {
    finalLines = [];
    for (let i = 0; i < sortedLines.length; i++) {
      if (i === 0 || sortedLines[i] !== sortedLines[i - 1]) {
        finalLines.push(sortedLines[i]);
      }
    }
  } else {
    finalLines = sortedLines;
  }

  const newLines = [
    ...state.lines.slice(0, minLine),
    ...finalLines,
    ...state.lines.slice(maxLine + 1),
  ];

  if (newLines.length === 0) {
    newLines.push('');
  }

  const nextCursor = clampCursor(
    newLines,
    { line: minLine, col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${finalLines.length}개 줄 정렬 완료`,
  };
}

/**
 * :[range]m[ove] {address} 명령어를 실행합니다.
 */
export function executeMove(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  destStr: string
): VimEditorState {
  const targetLine = parseAddress(destStr, state);
  if (targetLine === null) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E14: 잘못된 주소입니다: ${destStr}`,
    };
  }

  const startLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const endLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  // E134: Cannot move a range of lines into itself
  if (targetLine >= startLine && targetLine < endLine) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: 'E134: Cannot move a range of lines into itself',
    };
  }

  const stateWithUndo = pushUndoSnapshot(state);
  const count = endLine - startLine + 1;
  const linesToMove = state.lines.slice(startLine, endLine + 1);

  const remainingLines = [
    ...state.lines.slice(0, startLine),
    ...state.lines.slice(endLine + 1),
  ];

  let insertIndex: number;
  if (targetLine < startLine) {
    insertIndex = targetLine + 1;
  } else {
    insertIndex = targetLine + 1 - count;
  }

  const newLines = [
    ...remainingLines.slice(0, insertIndex),
    ...linesToMove,
    ...remainingLines.slice(insertIndex),
  ];

  const finalCursorLine = insertIndex + linesToMove.length - 1;
  const nextCursor = clampCursor(
    newLines,
    { line: finalCursorLine, col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${linesToMove.length}개 줄 이동 완료`,
  };
}

/**
 * :[range]t {address} 또는 :[range]co[py] {address} 명령어를 실행합니다.
 */
export function executeCopy(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  destStr: string
): VimEditorState {
  const targetLine = parseAddress(destStr, state);
  if (targetLine === null) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E14: 잘못된 주소입니다: ${destStr}`,
    };
  }

  const startLine = Math.max(0, Math.min(range.startLine, range.endLine));
  const endLine = Math.min(state.lines.length - 1, Math.max(range.startLine, range.endLine));

  const stateWithUndo = pushUndoSnapshot(state);
  const linesToCopy = state.lines.slice(startLine, endLine + 1);
  const insertIndex = targetLine + 1;

  const newLines = [
    ...state.lines.slice(0, insertIndex),
    ...linesToCopy,
    ...state.lines.slice(insertIndex),
  ];

  const finalCursorLine = insertIndex + linesToCopy.length - 1;
  const nextCursor = clampCursor(
    newLines,
    { line: finalCursorLine, col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${linesToCopy.length}개 줄 복제 완료`,
  };
}

/**
 * :g 및 :v 글로벌 명령을 실행합니다.
 */
function executeGlobalCommand(
  state: VimEditorState,
  gMatch: RegExpMatchArray,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  const gType = gMatch[1];
  const bang = gMatch[2];
  const pattern = gMatch[3];
  let action = gMatch[4].trim();
  if (action.endsWith('/')) {
    action = action.slice(0, -1).trim();
  }

  const isInverse = gType.startsWith('v') || bang === '!';

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 잘못된 정규식 패턴입니다: ${pattern}`,
    };
  }

  const matchedIndices: number[] = [];
  state.lines.forEach((lineText, idx) => {
    const matched = regex.test(lineText);
    if (isInverse ? !matched : matched) {
      matchedIndices.push(idx);
    }
  });

  if (matchedIndices.length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${pattern}`,
    };
  }

  // 1. :g/pattern/d (매칭 줄 일괄 삭제)
  if (action === 'd' || action === 'delete' || action === '') {
    const stateWithUndo = pushUndoSnapshot(state);
    const deleteSet = new Set(matchedIndices);
    const yanked = state.lines.filter((_, idx) => deleteSet.has(idx));
    const newLines = state.lines.filter((_, idx) => !deleteSet.has(idx));
    const finalLines = newLines.length === 0 ? [''] : newLines;
    const nextCursor = clampCursor(
      finalLines,
      { line: Math.min(matchedIndices[0], finalLines.length - 1), col: 0 },
      'NORMAL'
    );

    return {
      ...stateWithUndo,
      lines: finalLines,
      cursor: nextCursor,
      mode: 'NORMAL',
      visualAnchor: undefined,
      clipboard: {
        type: 'line',
        content: yanked.join('\n'),
      },
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `${matchedIndices.length}개 줄이 일괄 삭제되었습니다.`,
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  // 2. :g/pattern/norm {cmd} (매칭 줄마다 Normal 명령어 일괄 실행)
  const normMatch = action.match(/^(norm|normal)(!?)\s*(.*)$/);
  if (normMatch) {
    const normKeys = normMatch[3];
    let curState = pushUndoSnapshot(state);

    // 'dd' 줄 삭제인 경우 줄 번호 왜곡을 방지하기 위해 역순(아래에서 위로) 실행
    const isLineDelete = normKeys.trim() === 'dd';
    const sortedIndices = isLineDelete ? [...matchedIndices].reverse() : matchedIndices;

    for (const idx of sortedIndices) {
      curState = executeNormalKeysOnLine(curState, idx, normKeys, keyRunner);
    }

    return {
      ...curState,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `${matchedIndices.length}개 줄에 normal 명령을 실행했습니다.`,
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `지원하지 않는 글로벌 작업입니다: ${action}`,
  };
}

/**
 * :[range]d 줄 삭제를 실행합니다.
 */
function executeRangeDelete(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  commandStr: string
): VimEditorState {
  const stateWithUndo = pushUndoSnapshot(state);
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  const remaining = [
    ...state.lines.slice(0, range.startLine),
    ...state.lines.slice(range.endLine + 1),
  ];
  const newLines = remaining.length === 0 ? [''] : remaining;
  const nextCursor = clampCursor(
    newLines,
    { line: Math.min(range.startLine, newLines.length - 1), col: 0 },
    'NORMAL'
  );

  return {
    ...stateWithUndo,
    lines: newLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    clipboard: {
      type: 'line',
      content: yanked.join('\n'),
    },
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${range.endLine - range.startLine + 1}개 줄이 삭제되었습니다.`,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * :[range]y 줄 복사를 실행합니다.
 */
function executeRangeYank(
  state: VimEditorState,
  range: { startLine: number; endLine: number }
): VimEditorState {
  const yanked = state.lines.slice(range.startLine, range.endLine + 1);
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    clipboard: {
      type: 'line',
      content: yanked.join('\n'),
    },
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${range.endLine - range.startLine + 1}개 줄이 복사되었습니다.`,
  };
}

/**
 * :[range]norm {keys}를 실행합니다.
 */
function executeRangeNorm(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  normKeys: string,
  commandStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  let curState = pushUndoSnapshot(state);
  const count = range.endLine - range.startLine + 1;

  for (let l = range.startLine; l <= range.endLine; l++) {
    curState = executeNormalKeysOnLine(curState, l, normKeys, keyRunner);
  }

  return {
    ...curState,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${count}개 줄에 normal 명령을 실행했습니다.`,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * 특정 줄 번호에 Normal 모드 키 시퀀스를 실행합니다.
 */
export function executeNormalKeysOnLine(
  state: VimEditorState,
  lineIdx: number,
  keysStr: string,
  keyRunner?: KeyRunner
): VimEditorState {
  if (lineIdx < 0 || lineIdx >= state.lines.length) {
    return state;
  }

  let curState: VimEditorState = {
    ...state,
    cursor: { line: lineIdx, col: 0 },
    mode: 'NORMAL',
    pendingKeys: undefined,
  };

  const tokens = parseKeyTokens(keysStr);
  if (!keyRunner) {
    return curState;
  }

  for (const token of tokens) {
    curState = keyRunner(curState, token, true);
  }

  // 명령어 수행 후 여전히 INSERT 모드인 경우 자동으로 Escape 호출하여 완료
  if (curState.mode !== 'NORMAL') {
    curState = keyRunner(curState, 'Escape', true);
  }

  return curState;
}

/**
 * 키 시퀀스 문자열을 개별 토큰 목록으로 파싱합니다. (<Esc>, <Enter> 등 지원)
 */
export function parseKeyTokens(keysStr: string): string[] {
  const tokens: string[] = [];
  const regex = /<Esc>|<CR>|<Enter>|<Space>|./gi;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(keysStr)) !== null) {
    const tok = match[0];
    const lower = tok.toLowerCase();
    if (lower === '<esc>') {
      tokens.push('Escape');
    } else if (lower === '<cr>' || lower === '<enter>') {
      tokens.push('Enter');
    } else if (lower === '<space>') {
      tokens.push(' ');
    } else {
      tokens.push(tok);
    }
  }

  return tokens;
}

/**
 * 지정된 범위 내 텍스트 치환을 실행합니다.
 * 순정 Vim 정규식 캡처 그룹(\1~\9, &) 및 대소문자 변환 플래그(\u, \U, \l, \L, \E)를 완벽하게 지원합니다.
 */
export function executeSubstitution(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  oldText: string,
  newText: string,
  flags: string,
  commandStr: string
): VimEditorState {
  if (oldText.length === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: '치환할 대상 패턴(oldText)이 비어 있습니다.',
    };
  }

  const isGlobal = flags.includes('g');
  const isIgnoreCase = flags.includes('i');
  let regFlags = '';
  if (isGlobal) regFlags += 'g';
  if (isIgnoreCase) regFlags += 'i';

  const jsPattern = vimRegexToJsRegex(oldText);
  let regex: RegExp;
  try {
    regex = new RegExp(jsPattern, regFlags);
  } catch {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 잘못된 정규식 패턴입니다: ${oldText}`,
    };
  }

  const repTokens = parseReplacementTokens(newText);

  // 대화형 확인 플래그 (c) 처리 (:s/old/new/gc)
  if (flags.includes('c')) {
    const firstMatch = findNextSubstituteOccurrence(
      state.lines,
      range,
      oldText,
      newText,
      flags,
      { line: range.startLine, col: 0 }
    );

    if (!firstMatch) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: `E486: 패턴을 찾을 수 없습니다: ${oldText}`,
      };
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      mode: 'NORMAL',
      cursor: { line: firstMatch.line, col: firstMatch.col },
      confirmSubstitute: {
        range,
        oldText,
        newText,
        flags,
        isGlobal,
        isIgnoreCase,
        commandStr,
        substitutedCount: 0,
        currentMatch: firstMatch,
      },
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  let totalSubCount = 0;

  const nextLines = [...state.lines];
  for (let l = range.startLine; l <= range.endLine; l++) {
    const line = nextLines[l];
    // 패턴 매칭 여부 사전 테스트
    const testRegex = new RegExp(jsPattern, isIgnoreCase ? 'i' : '');
    if (!testRegex.test(line)) {
      continue;
    }

    if (isGlobal) {
      regex.lastIndex = 0;
    }

    const replacedLine = line.replace(regex, (...args) => {
      totalSubCount++;
      const match = args[0] as string;
      const offsetIndex = args.findIndex((arg, idx) => idx > 0 && typeof arg === 'number');
      const groups = (offsetIndex > 1 ? args.slice(1, offsetIndex) : []) as (string | undefined)[];
      return evaluateReplacement(repTokens, match, groups);
    });

    nextLines[l] = replacedLine;
  }

  if (totalSubCount === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: `E486: 패턴을 찾을 수 없습니다: ${oldText}`,
    };
  }

  const stateWithSnapshot = pushUndoSnapshot(state);
  const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

  return {
    ...stateWithSnapshot,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: `${totalSubCount}개 항목을 치환했습니다.`,
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/**
 * 대화형 치환 확인(:s/.../.../gc) 모드에서 다음 매치 위치를 검색합니다.
 */
export function findNextSubstituteOccurrence(
  lines: string[],
  range: { startLine: number; endLine: number },
  oldText: string,
  newText: string,
  flags: string,
  fromPos: { line: number; col: number }
): ConfirmSubstituteMatch | null {
  const isGlobal = flags.includes('g');
  const isIgnoreCase = flags.includes('i');
  const jsPattern = vimRegexToJsRegex(oldText);
  let regex: RegExp;
  try {
    regex = new RegExp(jsPattern, isIgnoreCase ? 'gi' : 'g');
  } catch {
    return null;
  }

  const repTokens = parseReplacementTokens(newText);

  for (let l = fromPos.line; l <= range.endLine; l++) {
    const lineText = lines[l] ?? '';
    regex.lastIndex = l === fromPos.line ? fromPos.col : 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const matchIndex = match.index;
      const matchedText = match[0];
      const matchLength = matchedText.length > 0 ? matchedText.length : 1;
      const groups = match.slice(1);
      const replacement = evaluateReplacement(repTokens, matchedText, groups);

      return {
        line: l,
        col: matchIndex,
        length: matchLength,
        matchedText,
        groups,
        replacement,
      };
    }

    if (!isGlobal && l === fromPos.line && fromPos.col > 0) {
      continue;
    }
  }

  return null;
}

/**
 * 대화형 치환 확인(:s/.../.../gc) 모드에서 키(y/n/a/q/l) 입력을 처리합니다.
 */
export function handleConfirmSubstituteKey(
  state: VimEditorState,
  key: string
): VimEditorState {
  const session = state.confirmSubstitute;
  if (!session) return state;

  const { currentMatch, range, oldText, newText, flags, isGlobal, commandStr, substitutedCount } = session;

  // 1. 'y': 현재 매치 치환 후 다음 매치로 이동
  if (key === 'y' || key === 'Y') {
    const lineText = state.lines[currentMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, currentMatch.col) +
      currentMatch.replacement +
      lineText.slice(currentMatch.col + currentMatch.length);

    const nextLines = [...state.lines];
    nextLines[currentMatch.line] = newLineText;
    const newCount = substitutedCount + 1;

    const nextSearchPos = isGlobal
      ? { line: currentMatch.line, col: currentMatch.col + currentMatch.replacement.length }
      : { line: currentMatch.line + 1, col: 0 };

    const nextMatch = findNextSubstituteOccurrence(
      nextLines,
      range,
      oldText,
      newText,
      flags,
      nextSearchPos
    );

    if (nextMatch) {
      return {
        ...state,
        lines: nextLines,
        cursor: { line: nextMatch.line, col: nextMatch.col },
        confirmSubstitute: {
          ...session,
          substitutedCount: newCount,
          currentMatch: nextMatch,
        },
      };
    } else {
      return {
        ...state,
        lines: nextLines,
        cursor: clampCursor(nextLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
        confirmSubstitute: null,
        commandMessage: `${newCount}개 항목을 치환했습니다.`,
        lastChangeKeys: [':', commandStr, 'Enter'],
      };
    }
  }

  // 2. 'n': 현재 매치 건너뛰고 다음 매치로 이동
  if (key === 'n' || key === 'N') {
    const nextSearchPos = isGlobal
      ? { line: currentMatch.line, col: currentMatch.col + currentMatch.length }
      : { line: currentMatch.line + 1, col: 0 };

    const nextMatch = findNextSubstituteOccurrence(
      state.lines,
      range,
      oldText,
      newText,
      flags,
      nextSearchPos
    );

    if (nextMatch) {
      return {
        ...state,
        cursor: { line: nextMatch.line, col: nextMatch.col },
        confirmSubstitute: {
          ...session,
          currentMatch: nextMatch,
        },
      };
    } else {
      return {
        ...state,
        confirmSubstitute: null,
        commandMessage: substitutedCount > 0
          ? `${substitutedCount}개 항목을 치환했습니다.`
          : '치환을 완료했습니다.',
      };
    }
  }

  // 3. 'a': 현재 매치 및 나머지 모든 매치 일괄 치환 후 종료
  if (key === 'a' || key === 'A') {
    return substituteAllRemaining(state, session);
  }

  // 4. 'l': 현재 매치 치환하고 즉시 종료 (last)
  if (key === 'l' || key === 'L') {
    const lineText = state.lines[currentMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, currentMatch.col) +
      currentMatch.replacement +
      lineText.slice(currentMatch.col + currentMatch.length);

    const nextLines = [...state.lines];
    nextLines[currentMatch.line] = newLineText;
    const newCount = substitutedCount + 1;

    return {
      ...state,
      lines: nextLines,
      cursor: clampCursor(nextLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
      confirmSubstitute: null,
      commandMessage: `${newCount}개 항목을 치환했습니다.`,
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  // 5. 'q', 'Escape', 'Ctrl-c': 치환 중단 및 즉시 복귀
  if (key === 'q' || key === 'Q' || key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
    return {
      ...state,
      confirmSubstitute: null,
      commandMessage: substitutedCount > 0
        ? `${substitutedCount}개 항목을 치환했습니다.`
        : '치환이 취소되었습니다.',
    };
  }

  return state;
}

/**
 * 대화형 치환 확인 모드에서 나머지 모든 일치 항목을 일괄 치환합니다.
 */
export function substituteAllRemaining(
  state: VimEditorState,
  session: ConfirmSubstituteSession
): VimEditorState {
  let curLines = [...state.lines];
  let totalCount = session.substitutedCount;
  let curMatch: ConfirmSubstituteMatch | null = session.currentMatch;
  let lastPos = { line: curMatch.line, col: curMatch.col };

  while (curMatch) {
    const lineText = curLines[curMatch.line] ?? '';
    const newLineText =
      lineText.slice(0, curMatch.col) +
      curMatch.replacement +
      lineText.slice(curMatch.col + curMatch.length);
    curLines[curMatch.line] = newLineText;
    totalCount++;
    lastPos = { line: curMatch.line, col: curMatch.col };

    const nextSearchPos = session.isGlobal
      ? { line: curMatch.line, col: curMatch.col + curMatch.replacement.length }
      : { line: curMatch.line + 1, col: 0 };

    curMatch = findNextSubstituteOccurrence(
      curLines,
      session.range,
      session.oldText,
      session.newText,
      session.flags,
      nextSearchPos
    );
  }

  return {
    ...state,
    lines: curLines,
    cursor: clampCursor(curLines, lastPos, 'NORMAL'),
    confirmSubstitute: null,
    commandMessage: `${totalCount}개 항목을 치환했습니다.`,
    lastChangeKeys: [':', session.commandStr, 'Enter'],
  };
}
