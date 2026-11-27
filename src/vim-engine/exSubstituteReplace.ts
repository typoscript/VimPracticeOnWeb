// :s 치환 문자열 파싱·전개와 공통 헬퍼 (exSubstitute.ts 에서 분리)
import { VimEditorState } from './types';
import { translateVimPattern } from './vimRegex';
import { EvalContext, VimScriptError, evaluateVimScript, isList, toVimString } from './vimscriptEval';
import { callUserFunction } from './vimscriptEngine';

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
 * :s 의 대소문자 무시 여부: I 플래그는 구분, i 플래그는 무시, 그 밖에는 'ignorecase' + 'smartcase' (:help :s_i)
 * 패턴 안의 \c / \C 는 compileVimRegex 에서 이 값보다 우선합니다.
 */
export function resolveSubstituteIgnoreCase(pattern: string, flags: string, state: VimEditorState): boolean {
  if (flags.includes('I')) return false;
  if (flags.includes('i')) return true;
  const ignorecase = !!state.options?.ignorecase;
  return ignorecase && !(state.options?.smartcase && translateVimPattern(pattern).hasUppercase);
}

/** 치환 문자열의 ~ 를 직전 치환 문자열로 펼칩니다. (\~ 는 리터럴 ~, \= 치환식은 그대로) */
export function expandReplacementTilde(replacement: string, previous: string | undefined): string {
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
export function makeReplacer(
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
export function splitReplacedLines(lines: string[]): string[] {
  return lines.some((l) => l.includes('\n')) ? lines.flatMap((l) => l.split('\n')) : lines;
}

export function substituteError(state: VimEditorState, message: string): VimEditorState {
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
