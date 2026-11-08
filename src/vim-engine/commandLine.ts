import {
  VimEditorState,
  ConfirmSubstituteMatch,
  ConfirmSubstituteSession,
} from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot, undo, redo } from './operators';
import {
  formatUndoList,
  jumpUndoSeq,
  recordFileSave,
  travelEarlier,
  travelLater,
} from './undoTreeEngine';
import { splitWindow, closeSplitWindow, closeOtherPanes, resizeSplit, executeWincmd } from './splitWindow';
import {
  formatBufferList,
  switchBuffer,
  nextBuffer,
  prevBuffer,
  firstBuffer,
  lastBuffer,
  deleteBuffer,
  editBuffer,
  addBuffer,
  bufdo,
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
  tabdo,
} from './tabEngine';
import {
  openQuickfixWindow,
  closeQuickfixWindow,
  toggleQuickfixWindow,
  nextQuickfix,
  prevQuickfix,
  firstQuickfix,
  lastQuickfix,
  jumpToQuickfixItem,
  formatQuickfixList,
  vimgrep,
  setQuickfixList,
  loadQuickfixFromFile,
  cdo,
  cfdo,
} from './quickfixEngine';
import {
  openLocationListWindow,
  closeLocationListWindow,
  toggleLocationListWindow,
  nextLocationList,
  prevLocationList,
  firstLocationList,
  lastLocationList,
  jumpToLocationListItem,
  formatLocationList,
  lvimgrep,
  setLocationList,
  loadLocationListFromFile,
  ldo,
  lfdo,
} from './locationListEngine';
import { formatChangeList } from './advancedMotions';
import {
  formatMarksList,
  formatJumpsList,
  clearJumps,
  deleteMarks,
} from './marks';
import {
  startDiffSplit,
  diffThis,
  diffOff,
  diffUpdate,
  diffObtain,
  diffPut,
} from './diffEngine';
import {
  setArgs,
  addArgs,
  deleteArgs,
  nextArg,
  prevArg,
  firstArg,
  lastArg,
  formatArgs,
  argdo,
} from './argEngine';
import { openNetrw } from './netrwEngine';
import { formatRegisters } from './registers';
import { executeSetCommand } from './setEngine';
import { sourceScript } from './sourceEngine';
import { executeMakeSession } from './sessionEngine';
import { jumpToTag, popTagStack, formatTagStack } from './tagEngine';
import {
  registerKeymap,
  unregisterKeymap,
  formatKeymapsList,
} from './keymapEngine';
import { executeUserCommandDefinition, executeUserCommand, lookupUserCommand } from './userCommandEngine';
import {
  appendFunctionDraftLine,
  callUserFunction,
  executeCallCommand,
  executeScriptBlock,
  executeScriptCommandLine,
} from './vimscriptEngine';
import { compileVimRegex, translateVimPattern, vimRegexToJsRegex } from './vimRegex';
import { EvalContext, VimScriptError, evaluateVimScript, isList, toVimString } from './vimscriptEval';
import { msg } from './messages';

export { vimRegexToJsRegex };

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

    // 최상위 파이프 명령 구분자
    if (
      ch === '|' &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      regexDelimiter === null
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

/** 파이프로 연결된 다중 명령어 실행 */
function executePipedCommands(
  state: VimEditorState,
  commands: string[],
  keyRunner?: KeyRunner,
  userCommandDepth = 0
): VimEditorState {
  const isControlFlow = (cmd: string) => {
    const word = cmd.trim().replace(/^:\s*/, '').match(/^(\w+)/)?.[1] ?? '';
    return /^(if|elseif|elsei|else|el|endif|en|while|wh|endwhile|endw|for|endfor|endfo|try|catch|cat|finally|fin|endtry|endt|throw|th|return|retu)$/.test(word);
  };

  const hasControlFlow = commands.some(isControlFlow);
  const runEx = (s: VimEditorState, c: string) => executeCommandLine(s, c, keyRunner, userCommandDepth);

  if (hasControlFlow) {
    return executeScriptBlock(state, commands, runEx);
  }

  let cur = state;
  for (const cmd of commands) {
    const cleaned = cmd.trim();
    if (cleaned.length === 0) continue;
    cur = executeCommandLine(cur, cleaned, keyRunner, userCommandDepth);
    if (cur.bell) {
      break;
    }
  }
  return cur;
}

/**
 * COMMAND 모드(:)에서 입력된 명령어를 파싱하고 실행합니다.
 */
export function executeCommandLine(
  state: VimEditorState,
  commandStr: string,
  keyRunner?: KeyRunner,
  userCommandDepth = 0
): VimEditorState {
  const trimmed = commandStr.trimStart();

  // 0. :function 본문 입력 중이면 입력한 줄을 본문에 추가 (endfunction 에서 확정)
  if (state.functionDraft) {
    return appendFunctionDraftLine(state, commandStr);
  }

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

  // 1-0. 다중 파이프(|) 명령어 분할 및 순차/스크립트 실행 (:help :bar)
  const pipedCommands = splitPipedCommands(trimmed);
  if (pipedCommands.length > 1) {
    return executePipedCommands(state, pipedCommands, keyRunner, userCommandDepth);
  }

  // 1-1. Vim script: :function, :endfunction, :delfunction, :let, :unlet, :echo, :execute, :[range]call
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, keyRunner, userCommandDepth);
  const scriptRes = executeScriptCommandLine(state, trimmed, runEx);
  if (scriptRes) {
    return scriptRes;
  }
  const callExtracted = extractRangeAndCommand(trimmed, state);
  const callMatch = !callExtracted.error && callExtracted.command.trim().match(/^cal(?:l)?\s+(.+)$/);
  if (callMatch) {
    return executeCallCommand(state, callMatch[1], callExtracted.hasRange ? callExtracted.range : null, runEx);
  }

  // 2. 글로벌 명령: :g/pattern/cmd, :v/pattern/cmd, :g!/pattern/cmd
  const gMatch = trimmed.match(/^:?\s*(g|global|v|vglobal)(!?)\s*\/([^\/]+)\/(.*)$/);
  if (gMatch) {
    return executeGlobalCommand(state, gMatch, commandStr, keyRunner);
  }

  // 3. 창 분할 및 종료, 설정, 키매핑 명령어
  let cleanCmdRaw = trimmed.replace(/^:/, '').trim();
  if (/^silent!?\s+/i.test(cleanCmdRaw)) {
    cleanCmdRaw = cleanCmdRaw.replace(/^silent!?\s+/i, '');
  }
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

  // 순정 Vim Diff 모드 분할: :diffsplit, :diffs, :vert diffsplit, :vertical diffsplit
  const diffSplitMatch = cleanCmdRaw.match(/^(?:(vert(?:ical)?|hor(?:izontal)?)\s+)?(diffs(?:plit)?)(?:\s+(.+))?$/i);
  if (diffSplitMatch) {
    const mod = diffSplitMatch[1]?.toLowerCase();
    const isVert = mod ? mod.startsWith('vert') : true; // 기본값 세로(vertical) 분할
    const targetFile = diffSplitMatch[3]?.trim();
    const res = startDiffSplit(state, targetFile, isVert ? 'vertical' : 'horizontal');
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffthis, :difft
  if (cleanCmdRaw.toLowerCase() === 'diffthis' || cleanCmdRaw.toLowerCase() === 'difft') {
    const res = diffThis(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffoff, :diffo, :diffoff!
  if (/^diffo(?:ff)?!?$/i.test(cleanCmdRaw)) {
    const isAll = cleanCmdRaw.includes('!');
    const res = diffOff(state, isAll);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffupdate, :diffu
  if (cleanCmdRaw.toLowerCase() === 'diffupdate' || cleanCmdRaw.toLowerCase() === 'diffu') {
    const res = diffUpdate(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffget, :diffg (do)
  if (cleanCmdRaw.toLowerCase() === 'diffget' || cleanCmdRaw.toLowerCase() === 'diffg') {
    const res = diffObtain(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // :diffput, :diffp (dp)
  if (cleanCmdRaw.toLowerCase() === 'diffput' || cleanCmdRaw.toLowerCase() === 'diffp') {
    const res = diffPut(state);
    return {
      ...res,
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

  // 창 제어 Ex 명령: :wincmd {arg}, :1wincmd w, :2wincmd w 등
  const wincmdMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?wincmd\s+(\S+)$/i);
  if (wincmdMatch) {
    const count = wincmdMatch[1] ? parseInt(wincmdMatch[1], 10) : undefined;
    const arg = wincmdMatch[2];
    const res = executeWincmd(state, arg, count);
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

  // 순정 파일 탐색기 Netrw 열기: :Explore, :E, :Vexplore, :Ve, :Sexplore, :Se, :Hexplore, :He, :Texplore, :Te
  const netrwMatch = cleanCmdRaw.match(/^(?:Explore|E|Vexplore|Ve|Sexplore|Se|Hexplore|He|Texplore|Te)(?:\s+(.*))?$/);
  if (netrwMatch) {
    const cmdName = netrwMatch[0].split(/\s+/)[0];
    const targetDir = netrwMatch[1]?.trim() || '';
    let mode: 'current' | 'vsplit' | 'split' | 'tab' = 'current';
    if (cmdName === 'Vexplore' || cmdName === 'Ve') {
      mode = 'vsplit';
    } else if (cmdName === 'Sexplore' || cmdName === 'Se' || cmdName === 'Hexplore' || cmdName === 'He') {
      mode = 'split';
    } else if (cmdName === 'Texplore' || cmdName === 'Te') {
      mode = 'tab';
    }
    const res = openNetrw(state, targetDir, mode);
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
    if (filename === '.' || filename === './') {
      const res = openNetrw(state, '', 'current');
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    }
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

  // 버퍼 추가: :badd, :bad [+line] {file}
  const baddMatch = cleanCmdRaw.match(/^(?:badd|bad)(?:\s+\+(\d+))?\s+(\S+)$/i);
  if (baddMatch) {
    const lineNum = baddMatch[1] ? parseInt(baddMatch[1], 10) : undefined;
    const file = baddMatch[2];
    const res = addBuffer(state, file, lineNum);
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

  // 퀵픽스 창 열기: :copen [height], :cope [height]
  const copenMatch = cleanCmdRaw.match(/^(?:copen|cope)(?:\s+(\d+))?$/i);
  if (copenMatch) {
    const height = copenMatch[1] ? parseInt(copenMatch[1], 10) : undefined;
    const res = openQuickfixWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 창 닫기: :cclose, :ccl
  if (cleanCmd === 'cclose' || cleanCmd === 'ccl') {
    const res = closeQuickfixWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 창 토글/열기: :cwindow [height], :cw [height]
  const cwMatch = cleanCmdRaw.match(/^(?:cwindow|cw)(?:\s+(\d+))?$/i);
  if (cwMatch) {
    const height = cwMatch[1] ? parseInt(cwMatch[1], 10) : undefined;
    const res = toggleQuickfixWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 다음 에러 이동: :cnext [count], :cn [count]
  const cnMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:cnext|cn)(?:\s+(\d+))?$/i);
  if (cnMatch) {
    const countRaw = cnMatch[1] || cnMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextQuickfix(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 이전 에러 이동: :cprev [count], :cp [count], :cprevious [count]
  const cpMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:cprev|cp|cprevious)(?:\s+(\d+))?$/i);
  if (cpMatch) {
    const countRaw = cpMatch[1] || cpMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevQuickfix(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 양 끝 이동: :cfirst, :cr, :crewind, :clast, :cla
  if (cleanCmd === 'cfirst' || cleanCmd === 'cr' || cleanCmd === 'crewind') {
    const res = firstQuickfix(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'clast' || cleanCmd === 'cla') {
    const res = lastQuickfix(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 특정 번호 점프: :cc [N]
  const ccMatch = cleanCmdRaw.match(/^(?:cc)(?:\s+(\d+))?$/i);
  if (ccMatch) {
    const targetIdx = ccMatch[1] ? parseInt(ccMatch[1], 10) - 1 : (state.quickfix?.currentIndex ?? 0);
    const res = jumpToQuickfixItem(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 목록 조회: :clist, :cl
  if (cleanCmd === 'clist' || cleanCmd === 'cl') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatQuickfixList(state),
    };
  }

  // 퀵픽스 파일 로드 및 첫 에러 점프: :cfile [filename], :cf [filename]
  const cfileMatch = cleanCmdRaw.match(/^(?:cfile|cf)\s+(.+)$/i);
  if (cfileMatch) {
    const filename = cfileMatch[1].trim();
    const res = loadQuickfixFromFile(state, filename, true);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 파일 로드(점프 없음): :cgetfile [filename], :cg [filename]
  const cgetfileMatch = cleanCmdRaw.match(/^(?:cgetfile|cg)\s+(.+)$/i);
  if (cgetfileMatch) {
    const filename = cgetfileMatch[1].trim();
    const res = loadQuickfixFromFile(state, filename, false);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // vimgrep / vimgrepadd 검색: :vimgrep /pat/[flags] {file}, :vimgrepadd ...
  const vimgrepMatch = cleanCmdRaw.match(/^(vimgrep|vimgrepadd)\s+(.*)$/i);
  if (vimgrepMatch) {
    const isAppend = vimgrepMatch[1].toLowerCase() === 'vimgrepadd';
    const args = vimgrepMatch[2];
    const res = vimgrep(state, args, isAppend);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 표현식 설정/초기화: :cexpr []
  const cexprMatch = cleanCmdRaw.match(/^cexpr\s*(.*)$/i);
  if (cexprMatch) {
    const expr = cexprMatch[1].trim();
    if (expr === '[]' || expr === '') {
      const res = setQuickfixList(state, [], false);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('퀵픽스 목록 초기화됨'),
      };
    }
  }

  // --- 로케이션 리스트 (Location List) Ex 명령 ---
  // 로케이션 리스트 창 열기: :lopen [height], :lope [height]
  const lopenMatch = cleanCmdRaw.match(/^(?:lopen|lope)(?:\s+(\d+))?$/i);
  if (lopenMatch) {
    const height = lopenMatch[1] ? parseInt(lopenMatch[1], 10) : undefined;
    const res = openLocationListWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 창 닫기: :lclose, :lcl
  if (cleanCmd === 'lclose' || cleanCmd === 'lcl') {
    const res = closeLocationListWindow(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 창 토글/열기: :lwindow [height], :lw [height]
  const lwMatch = cleanCmdRaw.match(/^(?:lwindow|lw)(?:\s+(\d+))?$/i);
  if (lwMatch) {
    const height = lwMatch[1] ? parseInt(lwMatch[1], 10) : undefined;
    const res = toggleLocationListWindow(state, height);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 다음 에러 이동: :lnext [count], :lne [count]
  const lneMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:lnext|lne)(?:\s+(\d+))?$/i);
  if (lneMatch) {
    const countRaw = lneMatch[1] || lneMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextLocationList(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 이전 에러 이동: :lprev [count], :lp [count], :lprevious [count]
  const lpMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:lprev|lp|lprevious)(?:\s+(\d+))?$/i);
  if (lpMatch) {
    const countRaw = lpMatch[1] || lpMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevLocationList(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 양 끝 이동: :lfirst, :lr, :lrewind, :llast, :lla
  if (cleanCmd === 'lfirst' || cleanCmd === 'lr' || cleanCmd === 'lrewind') {
    const res = firstLocationList(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'llast' || cleanCmd === 'lla') {
    const res = lastLocationList(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 특정 번호 점프: :ll [N]
  const llMatch = cleanCmdRaw.match(/^(?:ll)(?:\s+(\d+))?$/i);
  if (llMatch) {
    const targetIdx = llMatch[1] ? parseInt(llMatch[1], 10) - 1 : (state.locationList?.currentIndex ?? 0);
    const res = jumpToLocationListItem(state, targetIdx);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 목록 조회: :llist, :lli
  if (cleanCmd === 'llist' || cleanCmd === 'lli') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatLocationList(state),
    };
  }

  // 로케이션 리스트 파일 로드 및 첫 에러 점프: :lfile [filename], :lf [filename]
  const lfileMatch = cleanCmdRaw.match(/^(?:lfile|lf)\s+(.+)$/i);
  if (lfileMatch) {
    const filename = lfileMatch[1].trim();
    const res = loadLocationListFromFile(state, filename, true);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 파일 로드(점프 없음): :lgetfile [filename], :lg [filename]
  const lgetfileMatch = cleanCmdRaw.match(/^(?:lgetfile|lg)\s+(.+)$/i);
  if (lgetfileMatch) {
    const filename = lgetfileMatch[1].trim();
    const res = loadLocationListFromFile(state, filename, false);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // lvimgrep / lvimgrepadd / lv 검색: :lvimgrep /pat/[flags] {file}, :lv ...
  const lvimgrepMatch = cleanCmdRaw.match(/^(lvimgrep|lvimgrepadd|lv)\s+(.*)$/i);
  if (lvimgrepMatch) {
    const isAppend = lvimgrepMatch[1].toLowerCase() === 'lvimgrepadd';
    const args = lvimgrepMatch[2];
    const res = lvimgrep(state, args, isAppend);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 표현식 설정/초기화: :lexpr []
  const lexprMatch = cleanCmdRaw.match(/^lexpr\s*(.*)$/i);
  if (lexprMatch) {
    const expr = lexprMatch[1].trim();
    if (expr === '[]' || expr === '') {
      const res = setLocationList(state, [], false);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('로케이션 리스트 초기화됨'),
      };
    }
  }

  // 체인지 리스트 조회: :changes
  if (cleanCmd === 'changes') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatChangeList(state),
    };
  }

  // 마크/점프 뷰어 닫기: :marks close, :jumps close, :marksclose, :jumpsclose
  if (
    /^(?:marks|jumps)\s+close$/i.test(cleanCmdRaw) ||
    cleanCmdRaw === 'marksclose' ||
    cleanCmdRaw === 'jumpsclose'
  ) {
    return {
      ...state,
      showMarksVisualizer: false,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('마크/점프 뷰어 닫힘'),
    };
  }

  // 마크 목록 조회: :marks [filter]
  const marksMatch = cleanCmdRaw.match(/^(?:marks)(?:\s+(.*))?$/i);
  if (marksMatch) {
    const filter = marksMatch[1]?.trim();
    return {
      ...state,
      showMarksVisualizer: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatMarksList(state, filter),
    };
  }

  // 점프 목록 조회: :jumps
  if (/^jumps$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      showMarksVisualizer: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatJumpsList(state),
    };
  }

  // 점프 목록 초기화: :clearjumps, :cle
  if (/^(?:clearjumps|cle)$/i.test(cleanCmdRaw)) {
    const res = clearJumps(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 마크 삭제: :delmarks[!] [args], :delm[!] [args]
  const delmarksMatch = cleanCmdRaw.match(/^(?:delmarks|delm)(!?)(?:\s+(.*))?$/i);
  if (delmarksMatch) {
    const bang = delmarksMatch[1] === '!';
    const args = delmarksMatch[2]?.trim() ?? '';
    const res = deleteMarks(state, args, bang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 레지스터 뷰어 닫기: :reg close, :registers close, :regclose
  if (/^(?:reg|registers|display|di)\s+close$/i.test(cleanCmdRaw) || cleanCmdRaw === 'regclose') {
    return {
      ...state,
      showRegisterInspector: false,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('레지스터 뷰어 닫힘'),
    };
  }

  // 레지스터 뷰어 조회: :reg, :registers, :display, :di ([arg] 필터링 지원)
  const regMatch = cleanCmdRaw.match(/^(?:reg|registers|display|di)(?:!?)(?:\s+(.*))?$/i);
  if (regMatch) {
    const filterArg = regMatch[1]?.trim();
    const formatted = formatRegisters(state, filterArg);
    return {
      ...state,
      showRegisterInspector: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatted,
    };
  }

  // 순정 Vim 환경 옵션 설정: :set [args]
  const setMatch = cleanCmdRaw.match(/^set(?:\s+(.*))?$/i);
  if (setMatch) {
    const rawArgs = setMatch[1] ?? '';
    const res = executeSetCommand(state, rawArgs);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // .vimrc / 설정 내보내기 및 다운로드 모달 열기: :vimrc, :config, :export
  if (/^(?:vimrc|config|export)$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      showConfigModal: true,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('설정 및 .vimrc 내보내기/다운로드 창 열림'),
    };
  }

  // 스크립트 소싱 실행: :source, :so (:so %, :so ~/.vimrc 등)
  const sourceMatch = cleanCmdRaw.match(/^(?:source|so)(?:\s+(.*))?$/i);
  if (sourceMatch) {
    const targetFile = sourceMatch[1]?.trim() || '%';
    const res = sourceScript(state, targetFile, (s, cmd) => executeCommandLine(s, cmd, keyRunner));
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 세션 파일 저장: :mksession, :mks [file]
  const mksessionMatch = cleanCmdRaw.match(/^(?:mksession|mks)(!?)(?:\s+(.*))?$/i);
  if (mksessionMatch) {
    const bang = Boolean(mksessionMatch[1]);
    const filename = mksessionMatch[2]?.trim() || 'Session.vim';
    const res = executeMakeSession(state, filename, bang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 스택 조회: :tags
  if (/^tags$/i.test(cleanCmdRaw)) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatTagStack(state),
    };
  }

  // 태그 스택 팝 복귀: :pop, :po, :[count]pop
  const popMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:pop|po)$/i);
  if (popMatch) {
    const count = popMatch[1] ? parseInt(popMatch[1], 10) : 1;
    const res = popTagStack(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 태그 점프: :tag [name], :ta [name]
  const tagMatch = cleanCmdRaw.match(/^(?:tag|ta)(?:\s+(.*))?$/i);
  if (tagMatch) {
    const tagName = tagMatch[1]?.trim() || '';
    const res = jumpToTag(state, tagName);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 일괄 실행: :argdo[!] {cmd}
  const argdoMatch = cleanCmdRaw.match(/^argdo(!?)(?:\s+(.*))?$/i);
  if (argdoMatch) {
    const isBang = argdoMatch[1] === '!';
    const cmdToRun = argdoMatch[2] ?? '';
    const res = argdo(state, cmdToRun, (s, c) => executeCommandLine(s, c, keyRunner), isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 버퍼 일괄 실행: :bufdo[!] {cmd}
  const bufdoMatch = cleanCmdRaw.match(/^bufdo(!?)(?:\s+(.*))?$/i);
  if (bufdoMatch) {
    const isBang = bufdoMatch[1] === '!';
    const cmdToRun = bufdoMatch[2] ?? '';
    const res = bufdo(state, cmdToRun, (s, c) => executeCommandLine(s, c, keyRunner), isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 탭 일괄 실행: :tabdo[!] {cmd}
  const tabdoMatch = cleanCmdRaw.match(/^tabdo(!?)(?:\s+(.*))?$/i);
  if (tabdoMatch) {
    const isBang = tabdoMatch[1] === '!';
    const cmdToRun = tabdoMatch[2] ?? '';
    const res = tabdo(state, cmdToRun, (s, c) => executeCommandLine(s, c, keyRunner), isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 퀵픽스 일괄 실행: :cdo[!] {cmd}, :cfdo[!] {cmd}
  const cdoMatch = cleanCmdRaw.match(/^(cdo|cfdo)(!?)(?:\s+(.*))?$/i);
  if (cdoMatch) {
    const isFile = cdoMatch[1].toLowerCase() === 'cfdo';
    const isBang = cdoMatch[2] === '!';
    const cmdToRun = cdoMatch[3] ?? '';
    const runner = (s: VimEditorState, c: string) => executeCommandLine(s, c, keyRunner);
    const res = isFile
      ? cfdo(state, cmdToRun, runner, isBang)
      : cdo(state, cmdToRun, runner, false, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 로케이션 리스트 일괄 실행: :ldo[!] {cmd}, :lfdo[!] {cmd}
  const ldoMatch = cleanCmdRaw.match(/^(ldo|lfdo)(!?)(?:\s+(.*))?$/i);
  if (ldoMatch) {
    const isFile = ldoMatch[1].toLowerCase() === 'lfdo';
    const isBang = ldoMatch[2] === '!';
    const cmdToRun = ldoMatch[3] ?? '';
    const runner = (s: VimEditorState, c: string) => executeCommandLine(s, c, keyRunner);
    const res = isFile
      ? lfdo(state, cmdToRun, runner, isBang)
      : ldo(state, cmdToRun, runner, false, isBang);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 추가: :argadd {file} ...
  const argaddMatch = cleanCmdRaw.match(/^argadd\s+(.*)$/i);
  if (argaddMatch) {
    const files = argaddMatch[1].trim().split(/\s+/);
    const res = addArgs(state, files);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 삭제: :argdelete {pattern}, :argd {pattern}
  const argdMatch = cleanCmdRaw.match(/^(?:argdelete|argd)\s+(.*)$/i);
  if (argdMatch) {
    const pattern = argdMatch[1].trim();
    const res = deleteArgs(state, pattern);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 설정 및 조회: :args [file1 file2 ...]
  const argsMatch = cleanCmdRaw.match(/^args(?:\s+(.*))?$/i);
  if (argsMatch) {
    const filesStr = argsMatch[1]?.trim();
    if (filesStr) {
      const files = filesStr.split(/\s+/);
      const res = setArgs(state, files);
      return {
        ...res,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
      };
    } else {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: formatArgs(state),
      };
    }
  }

  // 아규먼트 다음 파일 이동: :next, :n ([count] 지원)
  const nextArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:next|n)(?:\s+(\d+))?$/i);
  if (nextArgMatch) {
    const countRaw = nextArgMatch[1] || nextArgMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = nextArg(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 이전 파일 이동: :prev, :previous, :Next, :N ([count] 지원)
  const prevArgMatch = cleanCmdRaw.match(/^(?:(\d+)\s*)?(?:prev|previous|Next|N)(?:\s+(\d+))?$/);
  if (prevArgMatch) {
    const countRaw = prevArgMatch[1] || prevArgMatch[2];
    const count = countRaw ? parseInt(countRaw, 10) : 1;
    const res = prevArg(state, count);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 아규먼트 양 끝 파일 이동: :first, :fir, :rewind, :rew, :last, :la
  if (
    cleanCmd === 'first' ||
    cleanCmd === 'fir' ||
    cleanCmd === 'rewind' ||
    cleanCmd === 'rew'
  ) {
    const res = firstArg(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }
  if (cleanCmd === 'last' || cleanCmd === 'la') {
    const res = lastArg(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (
    (cleanCmd === 'w' || cleanCmd === 'write' || cleanCmd === 'update' || cleanCmdRaw === 'up') &&
    !(state.userCommands && lookupUserCommand(state, cleanCmdRaw).kind === 'found')
  ) {
    const savedState = recordFileSave(state);
    return {
      ...savedState,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('[가상 저장 완료] 변경사항이 안전하게 메모리에 저장되었습니다.'),
    };
  }

  // Undo Tree 목록 확인: :undolist, :undol
  if (cleanCmd === 'undolist' || cleanCmd === 'undol') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatUndoList(state),
    };
  }

  // 이전 상태로 시간 여행: :earlier [count][s|m|h|d|f], :ea [count]...
  const earlierMatch = trimmed.match(/^:?\s*(?:earlier|ea)(?:\s+(.*))?$/i);
  if (earlierMatch) {
    const res = travelEarlier(state, earlierMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 이후 상태로 시간 여행: :later [count][s|m|h|d|f], :lat [count]...
  const laterMatch = trimmed.match(/^:?\s*(?:later|lat)(?:\s+(.*))?$/i);
  if (laterMatch) {
    const res = travelLater(state, laterMatch[1]);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 변경 번호로 직접 이동: :undo {seq}, :u {seq}
  const undoJumpMatch = trimmed.match(/^:?\s*u(?:ndo)?\s+(\d+)$/i);
  if (undoJumpMatch) {
    const seq = parseInt(undoJumpMatch[1], 10);
    const res = jumpUndoSeq(state, seq);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  // 단순 실행 취소 및 재실행: :u, :undo, :red, :redo
  if (cleanCmd === 'u' || cleanCmd === 'undo') {
    const res = undo(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
    };
  }

  if (cleanCmd === 'red' || cleanCmd === 'redo') {
    const res = redo(state);
    return {
      ...res,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
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
      commandMessage: msg('단일 창 상태입니다 (:q)'),
    };
  }

  if (cleanCmd === 'h' || cleanCmd === 'help') {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('지원 명령어: :[범위]d (삭제), :[범위]y (복사), :[범위]norm [명령], :g/패턴/d (글로벌), :s/이전/새문자/g'),
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
      commandMessage: msg('[리더 키 설정] mapleader = "{v}"', { v: newLeader === ' ' ? '<Space>' : newLeader }),
    };
  }

  // 3-x. 키매핑 목록 조회: :map, :nmap, :imap, :vmap, :noremap, :nnoremap, :inoremap, :vnoremap (인자 없음)
  const listMatch = trimmed.match(
    /^:?\s*(map|nmap|imap|vmap|noremap|nnoremap|inoremap|vnoremap)$/i
  );
  if (listMatch) {
    const cmd = listMatch[1].toLowerCase();
    let modeFilter = 'all';
    if (cmd.startsWith('i')) modeFilter = 'i';
    else if (cmd.startsWith('n')) modeFilter = 'n';
    else if (cmd.startsWith('v')) modeFilter = 'v';

    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: formatKeymapsList(state, modeFilter),
    };
  }

  // 커스텀 키매핑 등록: :imap, :inoremap, :nmap, :nnoremap, :vmap, :vnoremap, :map, :noremap
  const mapMatch = trimmed.match(
    /^:?\s*(nmap|nnoremap|imap|inoremap|vmap|vnoremap|map|noremap)\s+(\S+)\s+(.+)$/i
  );
  if (mapMatch) {
    const cmdType = mapMatch[1];
    const from = mapMatch[2];
    const to = mapMatch[3].trim();
    return registerKeymap(state, cmdType, from, to);
  }

  // 사용자 정의 명령 등록·삭제·목록: :command[!], :delcommand, :comclear
  const userCmdDef = executeUserCommandDefinition(state, cleanCmdRaw);
  if (userCmdDef) {
    return userCmdDef;
  }

  // 키매핑 해제: :unmap, :nunmap, :iunmap, :vunmap
  const unmapMatch = trimmed.match(/^:?\s*(unmap|nunmap|iunmap|vunmap)\s+(\S+)$/i);
  if (unmapMatch) {
    const cmdType = unmapMatch[1];
    const from = unmapMatch[2];
    return unregisterKeymap(state, cmdType, from);
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
      bell: true,
    };
  }

  const { range, hasRange, command } = extracted;
  const cmdTrimmed = command.trim();

  // 4-0. 사용자 정의 명령 호출 (:Name[!] [args], :[range]Name) - 내장 명령보다 뒤에 평가되어 내장 명령을 가리지 않음
  const userCmdCall = cmdTrimmed.match(/^([A-Z][A-Za-z0-9]*)(!?)(?:\s+(.*))?$/);
  if (userCmdCall && state.userCommands) {
    const lookup = lookupUserCommand(state, userCmdCall[1]);
    if (lookup.kind === 'ambiguous') {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E464: 사용자 정의 명령 이름이 모호합니다: {v} ({v2})', { v: userCmdCall[1], v2: lookup.candidates.join(', ') }),
        bell: true,
      };
    }
    if (lookup.kind === 'found') {
      return executeUserCommand(
        state,
        lookup.command,
        { bang: userCmdCall[2] === '!', args: (userCmdCall[3] ?? '').trim(), range: hasRange ? range : null },
        (s, cmd) => executeCommandLine(s, cmd, keyRunner, userCommandDepth + 1),
        userCommandDepth
      );
    }
  }

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
      commandMessage: msg('{v}번째 줄로 이동했습니다.', { v: targetLine + 1 }),
    };
  }

  const currentLineRange = { startLine: state.cursor.line, endLine: state.cursor.line };
  const fullBufferRange = { startLine: 0, endLine: Math.max(0, state.lines.length - 1) };

  // 4-1-1. :nohlsearch / :noh — 다음 검색 전까지 검색 하이라이트 끄기
  if (/^noh(?:l(?:s(?:e(?:a(?:r(?:c(?:h)?)?)?)?)?)?)?$/.test(cmdTrimmed)) {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
      hlsearchSuppressed: true,
    };
  }

  // 4-2. 치환: :[range]s/old/new/flags 또는 :s/old/new/flags
  const sub = parseSubstitutionCommand(command);
  if (sub) {
    const targetRange = range ?? currentLineRange;
    return executeSubstitution(state, targetRange, sub.oldText, sub.newText, sub.flags, trimmed, { keyRunner });
  }

  // 4-2-1. 직전 치환 반복: :& (플래그 없이), :&& (플래그 유지), :s (인자 없이), 뒤에 플래그 추가 가능
  const repeatSub = cmdTrimmed.match(/^(?:&(&?)|s)([cegiInI]*)$/);
  if (repeatSub && (cmdTrimmed.startsWith('&') || cmdTrimmed === 's')) {
    const last = state.lastSubstitute;
    if (!last) {
      return {
        ...state,
        mode: 'NORMAL',
        visualAnchor: undefined,
        commandBuffer: undefined,
        commandType: undefined,
        commandMessage: msg('E35: 이전에 사용한 치환 명령이 없습니다'),
        bell: true,
      };
    }
    const repeatFlags = (repeatSub[1] === '&' ? last.flags : '') + (repeatSub[2] ?? '');
    return executeSubstitution(state, range ?? currentLineRange, last.pattern, last.replacement, repeatFlags, trimmed, {
      keyRunner,
      replacementExpanded: true,
    });
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
  // :m0 / :t. 처럼 공백 없이 주소를 바로 붙여 쓸 수 있습니다 (주소 문자가 올 때만, :marks 등과 구분)
  const moveMatch = cmdTrimmed.match(/^(?:m|move)(?=\s|[\d.$+\-'])\s*(.*)$/);
  if (moveMatch) {
    const targetRange = range ?? currentLineRange;
    return executeMove(state, targetRange, moveMatch[1]);
  }

  // 4-8. 복제: :[range]t {address}, :t {address}, :co, :copy
  const copyMatch = cmdTrimmed.match(/^(?:t|co|copy)(?=\s|[\d.$+\-'])\s*(.*)$/);
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
    commandMessage: msg('E492: 지원하지 않는 에디터 명령어입니다: {trimmed}', { trimmed }),
    bell: true,
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
    commandMessage: msg('{finalLinesCount}개 줄 정렬 완료', { finalLinesCount: finalLines.length }),
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
      commandMessage: msg('E14: 잘못된 주소입니다: {destStr}', { destStr }),
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
    commandMessage: msg('{linesToMoveCount}개 줄 이동 완료', { linesToMoveCount: linesToMove.length }),
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
      commandMessage: msg('E14: 잘못된 주소입니다: {destStr}', { destStr }),
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
    commandMessage: msg('{linesToCopyCount}개 줄 복제 완료', { linesToCopyCount: linesToCopy.length }),
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
    regex = compileVimRegex(pattern, { ignorecase: state.options?.ignorecase, smartcase: state.options?.smartcase });
  } catch {
    return {
      ...state,
      mode: 'NORMAL',
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E486: 잘못된 정규식 패턴입니다: {pattern}', { pattern }),
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
      commandMessage: msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }),
      bell: true,
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
      commandMessage: msg('{matchedIndicesCount}개 줄이 일괄 삭제되었습니다.', { matchedIndicesCount: matchedIndices.length }),
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
      commandMessage: msg('{matchedIndicesCount}개 줄에 normal 명령을 실행했습니다.', { matchedIndicesCount: matchedIndices.length }),
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('지원하지 않는 글로벌 작업입니다: {action}', { action }),
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
    commandMessage: msg('{v}개 줄이 삭제되었습니다.', { v: range.endLine - range.startLine + 1 }),
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
    commandMessage: msg('{v}개 줄이 복사되었습니다.', { v: range.endLine - range.startLine + 1 }),
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
    commandMessage: msg('{count}개 줄에 normal 명령을 실행했습니다.', { count }),
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
    // 실제 Vim과 동일하게 키가 실패하면 해당 줄의 남은 키를 버립니다.
    if (curState.bell) break;
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

/** :s 실행에 필요한 부가 정보 */
export interface SubstituteOptions {
  /** \= 치환식에서 사용자 함수를 호출할 때의 키 실행기 */
  keyRunner?: KeyRunner;
  /** :& / :&& 반복처럼 이미 ~ 를 펼친 치환 문자열이면 다시 펼치지 않음 */
  replacementExpanded?: boolean;
}

/**
 * :s 의 대소문자 무시 여부: I 플래그는 구분, i 플래그는 무시, 그 밖에는 'ignorecase' + 'smartcase' (:help :s_i)
 * 패턴 안의 \c / \C 는 compileVimRegex 에서 이 값보다 우선합니다.
 */
function resolveSubstituteIgnoreCase(pattern: string, flags: string, state: VimEditorState): boolean {
  if (flags.includes('I')) return false;
  if (flags.includes('i')) return true;
  const ignorecase = !!state.options?.ignorecase;
  return ignorecase && !(state.options?.smartcase && translateVimPattern(pattern).hasUppercase);
}

/** 치환 문자열의 ~ 를 직전 치환 문자열로 펼칩니다. (\~ 는 리터럴 ~, \= 치환식은 그대로) */
function expandReplacementTilde(replacement: string, previous: string | undefined): string {
  if (replacement.startsWith('\\=')) return replacement;
  let out = '';
  for (let i = 0; i < replacement.length; i++) {
    const ch = replacement[i];
    if (ch === '\\' && i + 1 < replacement.length) {
      out += ch + replacement[i + 1];
      i++;
    } else if (ch === '~') {
      // 직전 치환 문자열 안의 특수 문자는 글자 그대로 들어가도록 이스케이프
      out += (previous ?? '').replace(/[\\&~]/g, '\\$&');
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 치환 문자열을 "일치 → 바꿀 문자열" 함수로 만듭니다.
 * \=expr 이면 Vim script 식으로 평가하며 submatch(n) 으로 그룹을 읽습니다. (리스트는 줄 단위로 이어 붙임)
 */
function makeReplacer(
  replacement: string,
  state: VimEditorState,
  keyRunner?: KeyRunner
): (match: string, groups: (string | undefined)[], line?: number) => string {
  if (!replacement.startsWith('\\=')) {
    const tokens = parseReplacementTokens(replacement);
    return (match, groups) => evaluateReplacement(tokens, match, groups);
  }
  const expr = replacement.slice(2);
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, keyRunner);
  return (match, groups, line) => {
    // Vim 처럼 치환 중인 줄이 line('.') 이 되도록 커서를 그 줄 첫 칸에 둡니다
    const ctx: EvalContext = {
      state: line === undefined ? state : { ...state, cursor: { line, col: 0 } },
      submatches: [match, ...groups.map((g) => g ?? '')],
      callUserFunction: (c, name, args) => {
        const r = callUserFunction(c.state, name, args, runEx);
        if (r.error) throw new VimScriptError(r.error);
        return r.value;
      },
    };
    const value = evaluateVimScript(expr, ctx);
    if (isList(value)) return value.map(toVimString).join('\n');
    return toVimString(value);
  };
}

/** 치환 결과에 들어간 줄바꿈(\r, \n, \= 식의 "\n")으로 줄을 나눕니다. */
function splitReplacedLines(lines: string[]): string[] {
  return lines.some((l) => l.includes('\n')) ? lines.flatMap((l) => l.split('\n')) : lines;
}

function substituteError(state: VimEditorState, message: string): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: message,
    bell: true,
  };
}

/**
 * 지정된 범위 내 텍스트 치환을 실행합니다.
 * 순정 Vim 정규식 캡처 그룹(\1~\9, &) 및 대소문자 변환 플래그(\u, \U, \l, \L, \E)를 완벽하게 지원합니다.
 * - 빈 패턴(:s//new/)은 직전 치환 또는 검색 패턴을 사용합니다.
 * - 치환 문자열의 ~ 는 직전 치환 문자열, 패턴의 ~ 도 직전 치환 문자열과 일치합니다.
 * - \=expr 치환식과 submatch(n), \r 줄 나누기를 지원합니다.
 * - 성공하면 패턴이 마지막 검색 패턴이 되어 n / N 으로 이어서 찾을 수 있습니다.
 */
export function executeSubstitution(
  state: VimEditorState,
  range: { startLine: number; endLine: number },
  oldText: string,
  newText: string,
  flags: string,
  commandStr: string,
  options: SubstituteOptions = {}
): VimEditorState {
  const pattern = oldText.length > 0 ? oldText : state.lastSubstitute?.pattern ?? state.lastSearchQuery ?? '';
  if (pattern.length === 0) {
    return substituteError(state, msg('E35: 이전에 사용한 정규식이 없습니다'));
  }

  const isGlobal = flags.includes('g');
  const isIgnoreCase = resolveSubstituteIgnoreCase(pattern, flags, state);
  const tildeText = state.lastSubstitute?.replacement;
  const replacement = options.replacementExpanded ? newText : expandReplacementTilde(newText, tildeText);

  let regex: RegExp;
  let testRegex: RegExp;
  try {
    regex = compileVimRegex(pattern, { ignorecase: isIgnoreCase, flags: isGlobal ? 'g' : '', lastSubstitute: tildeText });
    testRegex = compileVimRegex(pattern, { ignorecase: isIgnoreCase, lastSubstitute: tildeText });
  } catch {
    return substituteError(state, msg('E486: 잘못된 정규식 패턴입니다: {pattern}', { pattern }));
  }

  // 직전 치환·검색 패턴 기록 (Vim 처럼 :s 의 패턴으로 n 을 이어서 쓸 수 있음)
  const remembered: Partial<VimEditorState> = {
    lastSubstitute: { pattern, replacement, flags },
    lastSearchQuery: pattern,
  };

  // 대화형 확인 플래그 (c) 처리 (:s/old/new/gc)
  if (flags.includes('c')) {
    let firstMatch: ConfirmSubstituteMatch | null;
    try {
      firstMatch = findNextSubstituteOccurrence(
        state.lines,
        range,
        pattern,
        replacement,
        flags,
        { line: range.startLine, col: 0 },
        { ignoreCase: isIgnoreCase, tildeText, exprState: state, keyRunner: options.keyRunner }
      );
    } catch (err) {
      return substituteError(state, err instanceof Error ? err.message : String(err));
    }

    if (!firstMatch) {
      return substituteError({ ...state, ...remembered }, msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }));
    }

    const stateWithSnapshot = pushUndoSnapshot(state);
    return {
      ...stateWithSnapshot,
      ...remembered,
      mode: 'NORMAL',
      cursor: { line: firstMatch.line, col: firstMatch.col },
      confirmSubstitute: {
        range,
        oldText: pattern,
        newText: replacement,
        flags,
        isGlobal,
        isIgnoreCase,
        commandStr,
        substitutedCount: 0,
        currentMatch: firstMatch,
        tildeText,
      },
      visualAnchor: undefined,
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: undefined,
    };
  }

  const replacer = makeReplacer(replacement, state, options.keyRunner);
  let totalSubCount = 0;

  let nextLines = [...state.lines];
  try {
    for (let l = range.startLine; l <= range.endLine; l++) {
      const line = nextLines[l];
      // 패턴 매칭 여부 사전 테스트
      if (!testRegex.test(line)) {
        continue;
      }

      if (isGlobal) {
        regex.lastIndex = 0;
      }

      nextLines[l] = line.replace(regex, (...args) => {
        totalSubCount++;
        const match = args[0] as string;
        const offsetIndex = args.findIndex((arg, idx) => idx > 0 && typeof arg === 'number');
        const groups = (offsetIndex > 1 ? args.slice(1, offsetIndex) : []) as (string | undefined)[];
        return replacer(match, groups, l);
      });
    }
  } catch (err) {
    return substituteError(state, err instanceof Error ? err.message : String(err));
  }

  if (totalSubCount === 0) {
    return substituteError({ ...state, ...remembered }, msg('E486: 패턴을 찾을 수 없습니다: {pattern}', { pattern }));
  }

  nextLines = splitReplacedLines(nextLines);
  const stateWithSnapshot = pushUndoSnapshot(state);
  const nextCursor = clampCursor(nextLines, state.cursor, 'NORMAL');

  return {
    ...stateWithSnapshot,
    ...remembered,
    lines: nextLines,
    cursor: nextCursor,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage: msg('{totalSubCount}개 항목을 치환했습니다.', { totalSubCount }),
    lastChangeKeys: [':', commandStr, 'Enter'],
  };
}

/** findNextSubstituteOccurrence 의 부가 옵션 */
export interface SubstituteSearchOptions {
  /** 확정된 대소문자 무시 여부 (없으면 i 플래그로 판단) */
  ignoreCase?: boolean;
  /** 패턴 안의 ~ 가 가리키는 직전 치환 문자열 */
  tildeText?: string;
  /** \= 치환식을 평가할 때 사용할 에디터 상태 */
  exprState?: VimEditorState;
  keyRunner?: KeyRunner;
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
  fromPos: { line: number; col: number },
  opts: SubstituteSearchOptions = {}
): ConfirmSubstituteMatch | null {
  const isGlobal = flags.includes('g');
  const isIgnoreCase = opts.ignoreCase ?? flags.includes('i');
  let regex: RegExp;
  try {
    regex = compileVimRegex(oldText, { ignorecase: isIgnoreCase, flags: 'g', lastSubstitute: opts.tildeText });
  } catch {
    return null;
  }

  const exprState: VimEditorState = opts.exprState ?? { lines, cursor: { line: fromPos.line, col: 0 }, mode: 'NORMAL' };
  const replacer = makeReplacer(newText, { ...exprState, lines }, opts.keyRunner);

  for (let l = fromPos.line; l <= range.endLine; l++) {
    const lineText = lines[l] ?? '';
    regex.lastIndex = l === fromPos.line ? fromPos.col : 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      const matchIndex = match.index;
      const matchedText = match[0];
      const matchLength = matchedText.length > 0 ? matchedText.length : 1;
      const groups = match.slice(1);
      const replacement = replacer(matchedText, groups, l);

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

/** 확인 모드 세션의 다음 매치 검색 */
function findNextInSession(
  state: VimEditorState,
  session: ConfirmSubstituteSession,
  lines: string[],
  fromPos: { line: number; col: number }
): ConfirmSubstituteMatch | null {
  return findNextSubstituteOccurrence(lines, session.range, session.oldText, session.newText, session.flags, fromPos, {
    ignoreCase: session.isIgnoreCase,
    tildeText: session.tildeText,
    exprState: state,
  });
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

  const { currentMatch, isGlobal, commandStr, substitutedCount } = session;

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

    const nextMatch = findNextInSession(state, session, nextLines, nextSearchPos);

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
      const finalLines = splitReplacedLines(nextLines);
      return {
        ...state,
        lines: finalLines,
        cursor: clampCursor(finalLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
        confirmSubstitute: null,
        commandMessage: msg('{newCount}개 항목을 치환했습니다.', { newCount }),
        lastChangeKeys: [':', commandStr, 'Enter'],
      };
    }
  }

  // 2. 'n': 현재 매치 건너뛰고 다음 매치로 이동
  if (key === 'n' || key === 'N') {
    const nextSearchPos = isGlobal
      ? { line: currentMatch.line, col: currentMatch.col + currentMatch.length }
      : { line: currentMatch.line + 1, col: 0 };

    const nextMatch = findNextInSession(state, session, state.lines, nextSearchPos);

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
        lines: splitReplacedLines(state.lines),
        confirmSubstitute: null,
        commandMessage: substitutedCount > 0
          ? msg('{substitutedCount}개 항목을 치환했습니다.', { substitutedCount })
          : msg('치환을 완료했습니다.'),
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
    const finalLines = splitReplacedLines(nextLines);

    return {
      ...state,
      lines: finalLines,
      cursor: clampCursor(finalLines, { line: currentMatch.line, col: currentMatch.col }, 'NORMAL'),
      confirmSubstitute: null,
      commandMessage: msg('{newCount}개 항목을 치환했습니다.', { newCount }),
      lastChangeKeys: [':', commandStr, 'Enter'],
    };
  }

  // 5. 'q', 'Escape', 'Ctrl-c': 치환 중단 및 즉시 복귀
  if (key === 'q' || key === 'Q' || key === 'Escape' || key === 'Ctrl-c' || key === 'Ctrl+c') {
    return {
      ...state,
      lines: splitReplacedLines(state.lines),
      confirmSubstitute: null,
      commandMessage: substitutedCount > 0
        ? msg('{substitutedCount}개 항목을 치환했습니다.', { substitutedCount })
        : msg('치환이 취소되었습니다.'),
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
  const curLines = [...state.lines];
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

    curMatch = findNextInSession(state, session, curLines, nextSearchPos);
  }

  const finalLines = splitReplacedLines(curLines);
  return {
    ...state,
    lines: finalLines,
    cursor: clampCursor(finalLines, lastPos, 'NORMAL'),
    confirmSubstitute: null,
    commandMessage: msg('{totalCount}개 항목을 치환했습니다.', { totalCount }),
    lastChangeKeys: [':', session.commandStr, 'Enter'],
  };
}
