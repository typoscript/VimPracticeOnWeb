import {
  VimEditorState,
  ConfirmSubstituteMatch,
  ConfirmSubstituteSession,
} from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { compileVimRegex, translateVimPattern } from './vimRegex';
import { EvalContext, VimScriptError, evaluateVimScript, isList, toVimString } from './vimscriptEval';
import { callUserFunction } from './vimscriptEngine';
import { msg } from './messages';

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

/** :s 실행에 필요한 부가 정보 */
export interface SubstituteOptions {
  /** \= 치환식에서 사용자 함수를 호출할 때의 키 실행기 */
  keyRunner?: KeyRunner;
  /** :& / :&& 반복처럼 이미 ~ 를 펼친 치환 문자열이면 다시 펼치지 않음 */
  replacementExpanded?: boolean;
  /** Ex 명령 실행 콜백 (사용자 함수 호출 시 사용) */
  runEx?: (state: VimEditorState, cmd: string) => VimEditorState;
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
  runExOverride?: (state: VimEditorState, cmd: string) => VimEditorState
): (match: string, groups: (string | undefined)[], line?: number) => string {
  if (!replacement.startsWith('\\=')) {
    const tokens = parseReplacementTokens(replacement);
    return (match, groups) => evaluateReplacement(tokens, match, groups);
  }
  const expr = replacement.slice(2);
  const runEx = runExOverride ?? ((s: VimEditorState) => s);
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
        { ignoreCase: isIgnoreCase, tildeText, exprState: state, keyRunner: options.keyRunner, runEx: options.runEx }
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

  const replacer = makeReplacer(replacement, state, options.runEx);
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
  runEx?: (state: VimEditorState, cmd: string) => VimEditorState;
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
  const replacer = makeReplacer(newText, { ...exprState, lines }, opts.runEx);

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
