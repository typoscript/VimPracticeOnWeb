import { VimEditorState, VimScriptDict, VimScriptValue } from './types';
import { clampCursor } from './cursor';
import { msg } from './messages';
import {
  VimScriptError,
  EvalContext,
  isList,
  isDict,
  toNumber,
  toVimString,
  isTruthy,
  formatValue,
  compileVimPattern,
} from './vimscriptValues';

// ---------------------------------------------------------------------------
// 내장 함수 공통 타입·헬퍼와 버퍼·커서·문자열 내장 함수 (vimscriptBuiltins.ts 에서 분리)
// ---------------------------------------------------------------------------

export interface MutationResult {
  value: VimScriptValue;
  updated: VimScriptValue;
}

export interface Builtin {
  min: number;
  max: number;
  /** 첫 인자를 제자리에서 바꾸는 함수 (add, sort ...): { value, updated } 를 반환 */
  mutates?: boolean;
  fn: (ctx: EvalContext, args: VimScriptValue[]) => VimScriptValue | MutationResult;
}

export function asList(value: VimScriptValue, fn: string): VimScriptValue[] {
  if (!isList(value)) throw new VimScriptError(msg('E714: {fn}() 의 인자는 리스트여야 합니다', { fn }));
  return value;
}

export function asDict(value: VimScriptValue, fn: string): VimScriptDict {
  if (!isDict(value)) throw new VimScriptError(msg('E715: {fn}() 의 인자는 딕셔너리여야 합니다', { fn }));
  return value;
}

/** Vimscript 마크 문자열('a, '<, '>, '., '^, '[, '], '')의 0-based 좌표를 해석합니다. */
function resolveScriptMarkPosition(
  state: VimEditorState,
  markChar: string
): { row: number; col: number } | null {
  if (/^[a-zA-Z]$/.test(markChar)) {
    return state.marks?.[markChar] ?? null;
  }
  if (markChar === "'" || markChar === '`') {
    return state.lastJumpPos ? { ...state.lastJumpPos } : { row: 0, col: 0 };
  }
  if (markChar === '.') {
    if (state.lastChangeMark) return { ...state.lastChangeMark };
    if (state.changeList && state.changeList.length > 0) {
      const last = state.changeList[state.changeList.length - 1];
      return { row: last.row, col: last.col };
    }
    return state.marks?.['.'] ?? null;
  }
  if (markChar === '^') {
    if (state.lastInsertPos) return { row: state.lastInsertPos.row, col: state.lastInsertPos.col };
    return state.marks?.['^'] ?? null;
  }
  if (markChar === '<' || markChar === '>') {
    const vis = state.lastVisualSelection;
    if (vis) {
      const isAnchorFirst =
        vis.anchor.line < vis.cursor.line ||
        (vis.anchor.line === vis.cursor.line && vis.anchor.col <= vis.cursor.col);
      const pos =
        markChar === '<'
          ? isAnchorFirst
            ? vis.anchor
            : vis.cursor
          : isAnchorFirst
            ? vis.cursor
            : vis.anchor;
      return { row: pos.line, col: pos.col };
    }
    return state.marks?.[markChar] ?? null;
  }
  if (markChar === '[') {
    return state.lastBracketMarks?.start ? { ...state.lastBracketMarks.start } : state.marks?.['['] ?? null;
  }
  if (markChar === ']') {
    return state.lastBracketMarks?.end ? { ...state.lastBracketMarks.end } : state.marks?.[']'] ?? null;
  }
  return null;
}

/** line('.'), line("'<"), getline('$') 등 줄 지정 인자를 0-based 줄 번호로 변환합니다. (범위 밖이면 -1) */
function resolveLineArg(state: VimEditorState, arg: VimScriptValue): number {
  if (arg === '.') return state.cursor.line;
  if (arg === '$') return state.lines.length - 1;
  if (arg === 'v') {
    const isVisual =
      state.mode === 'VISUAL' ||
      state.mode === 'VISUAL_LINE' ||
      state.mode === 'VISUAL_BLOCK' ||
      state.mode === 'SELECT' ||
      state.mode === 'SELECT_LINE' ||
      state.mode === 'SELECT_BLOCK';
    return isVisual && state.visualAnchor ? state.visualAnchor.line : state.cursor.line;
  }
  if (typeof arg === 'string' && arg.length === 2 && arg[0] === "'") {
    const pos = resolveScriptMarkPosition(state, arg[1]);
    return pos && pos.row >= 0 && pos.row < state.lines.length ? pos.row : -1;
  }
  const n = toNumber(arg);
  return n >= 1 && n <= state.lines.length ? n - 1 : -1;
}

/** substitute() 의 치환 문자열: & / \0 (전체), \1~\9 (그룹), \n, \\, \u \U \l \L \e \E (대소문자) */
function expandReplacement(rep: string, groups: string[]): string {
  let out = '';
  let caseMode: 'u' | 'l' | null = null;
  let oneShot: 'u' | 'l' | null = null;
  const emit = (text: string) => {
    for (const ch of text) {
      let c = caseMode === 'u' ? ch.toUpperCase() : caseMode === 'l' ? ch.toLowerCase() : ch;
      if (oneShot) {
        c = oneShot === 'u' ? c.toUpperCase() : c.toLowerCase();
        oneShot = null;
      }
      out += c;
    }
  };
  for (let i = 0; i < rep.length; i++) {
    const ch = rep[i];
    if (ch === '&') {
      emit(groups[0] ?? '');
    } else if (ch === '\\' && i + 1 < rep.length) {
      const next = rep[++i];
      if (/[0-9]/.test(next)) emit(groups[Number(next)] ?? '');
      else if (next === 'n') out += '\n';
      else if (next === 't') out += '\t';
      else if (next === 'u' || next === 'l') oneShot = next;
      else if (next === 'U' || next === 'L') caseMode = next === 'U' ? 'u' : 'l';
      else if (next === 'e' || next === 'E') caseMode = null;
      else emit(next);
    } else {
      emit(ch);
    }
  }
  return out;
}

/** printf() 서식: %[-0][폭][.정밀도](d s x X o c %) */
function formatPrintf(fmt: string, args: VimScriptValue[]): string {
  let argIdx = 0;
  const next = (): VimScriptValue => {
    if (argIdx >= args.length) {
      throw new VimScriptError(msg('E766: printf() 의 인자가 부족합니다: {fmt}', { fmt }));
    }
    return args[argIdx++];
  };
  const out = fmt.replace(
    /%([-0]*)(\d*)(?:\.(\d+))?([dsxXocS%])/g,
    (_m, flags: string, width: string, prec: string | undefined, conv: string) => {
      if (conv === '%') return '%';
      let body: string;
      if (conv === 'd') body = String(toNumber(next()));
      else if (conv === 'x' || conv === 'X') {
        body = toNumber(next()).toString(16);
        if (conv === 'X') body = body.toUpperCase();
      } else if (conv === 'o') body = toNumber(next()).toString(8);
      else if (conv === 'c') body = String.fromCharCode(toNumber(next()));
      else {
        const v = next();
        body = typeof v === 'string' ? v : formatValue(v);
        if (prec !== undefined) body = body.slice(0, Number(prec));
      }
      const w = width ? Number(width) : 0;
      if (body.length >= w) return body;
      if (flags.includes('-')) return body.padEnd(w);
      if (flags.includes('0') && conv !== 's' && conv !== 'S') {
        const neg = body.startsWith('-');
        return (neg ? '-' : '') + body.slice(neg ? 1 : 0).padStart(w - (neg ? 1 : 0), '0');
      }
      return body.padStart(w);
    }
  );
  if (argIdx < args.length) {
    throw new VimScriptError(msg('E767: printf() 의 인자가 너무 많습니다: {fmt}', { fmt }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 정적 내장 함수 그룹 (버퍼·커서·문자열)
// ---------------------------------------------------------------------------

export const BUFFER_AND_CURSOR_BUILTINS: Record<string, Builtin> = {
  line: { min: 1, max: 1, fn: (ctx, [a]) => resolveLineArg(ctx.state, a) + 1 },
  col: {
    min: 1,
    max: 1,
    fn: (ctx, [a]) => {
      const s = ctx.state;
      if (a === '.') return s.cursor.col + 1;
      if (a === '$') return (s.lines[s.cursor.line] ?? '').length + 1;
      if (a === 'v') {
        const isVisual =
          s.mode === 'VISUAL' ||
          s.mode === 'VISUAL_LINE' ||
          s.mode === 'VISUAL_BLOCK' ||
          s.mode === 'SELECT' ||
          s.mode === 'SELECT_LINE' ||
          s.mode === 'SELECT_BLOCK';
        const col = isVisual && s.visualAnchor ? s.visualAnchor.col : s.cursor.col;
        return col + 1;
      }
      if (typeof a === 'string' && a.length === 2 && a[0] === "'") {
        const pos = resolveScriptMarkPosition(s, a[1]);
        return pos ? pos.col + 1 : 0;
      }
      if (Array.isArray(a) && a.length >= 2) {
        const row = resolveLineArg(s, a[0]);
        if (row < 0) return 0;
        const lineLen = (s.lines[row] ?? '').length;
        if (a[1] === '$') return lineLen + 1;
        const colNum = toNumber(a[1]);
        return colNum >= 1 ? Math.min(colNum, lineLen + 1) : 0;
      }
      return 0;
    },
  },
  getline: {
    min: 1,
    max: 2,
    fn: (ctx, [a, b]) => {
      const start = resolveLineArg(ctx.state, a);
      if (b === undefined) return start >= 0 ? ctx.state.lines[start] ?? '' : '';
      const end = resolveLineArg(ctx.state, b);
      return start < 0 || end < start ? [] : ctx.state.lines.slice(start, end + 1);
    },
  },
  indent: {
    min: 1,
    max: 1,
    fn: (ctx, [a]) => {
      const idx = resolveLineArg(ctx.state, a);
      if (idx < 0) return -1;
      const line = ctx.state.lines[idx] ?? '';
      const ts = ctx.state.options?.tabstop ?? 8;
      let cols = 0;
      for (const ch of line) {
        if (ch === ' ') cols += 1;
        else if (ch === '\t') cols += ts - (cols % ts);
        else break;
      }
      return cols;
    },
  },
  setline: {
    min: 2,
    max: 2,
    fn: (ctx, [a, text]) => {
      const l = resolveLineArg(ctx.state, a);
      // 마지막 줄 바로 다음 줄 번호는 줄 추가로 처리 (Vim 과 동일)
      const at = l >= 0 ? l : toNumber(a) === ctx.state.lines.length + 1 ? ctx.state.lines.length : -1;
      if (at < 0) return 1;
      const newLines = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const lines = [...ctx.state.lines];
      newLines.forEach((t, i) => (lines[at + i] = t));
      ctx.state = { ...ctx.state, lines };
      return 0;
    },
  },
  append: {
    min: 2,
    max: 2,
    fn: (ctx, [a, text]) => {
      const n = a === '.' ? ctx.state.cursor.line + 1 : a === '$' ? ctx.state.lines.length : toNumber(a);
      if (n < 0 || n > ctx.state.lines.length) return 1;
      const newLines = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const lines = [...ctx.state.lines.slice(0, n), ...newLines, ...ctx.state.lines.slice(n)];
      ctx.state = { ...ctx.state, lines };
      return 0;
    },
  },
  cursor: {
    min: 1,
    max: 3,
    fn: (ctx, args) => {
      let lnum: number;
      let colNum: number;
      if (isList(args[0])) {
        if (args[0].length < 2) return -1;
        lnum = Math.trunc(toNumber(args[0][0]));
        colNum = Math.trunc(toNumber(args[0][1]));
      } else {
        if (args.length < 2) return -1;
        lnum = Math.trunc(toNumber(args[0]));
        colNum = Math.trunc(toNumber(args[1]));
      }
      const nextRow = lnum > 0 ? lnum - 1 : ctx.state.cursor.line;
      const nextCol = colNum > 0 ? colNum - 1 : ctx.state.cursor.col;
      const clamped = clampCursor(ctx.state.lines, { line: nextRow, col: nextCol }, ctx.state.mode);
      ctx.state = { ...ctx.state, cursor: clamped };
      return 0;
    },
  },
  getpos: {
    min: 1,
    max: 1,
    fn: (ctx, [expr]) => {
      const s = ctx.state;
      const key = toVimString(expr);
      if (key === '.') return [0, s.cursor.line + 1, s.cursor.col + 1, 0];
      if (key === '$') return [0, s.lines.length, 1, 0];
      if (key === "'<" || key === "'>") {
        const sel = s.lastVisualSelection;
        if (!sel) return [0, 0, 0, 0];
        const a = sel.anchor;
        const b = sel.cursor;
        const first = a.line < b.line || (a.line === b.line && a.col <= b.col) ? a : b;
        const last = first === a ? b : a;
        const p = key === "'<" ? first : last;
        return [0, p.line + 1, p.col + 1, 0];
      }
      if (key.startsWith("'") && key.length === 2) {
        const mark = s.marks?.[key[1]];
        if (!mark) return [0, 0, 0, 0];
        return [mark.bufferId ?? 0, mark.row + 1, mark.col + 1, 0];
      }
      return [0, 0, 0, 0];
    },
  },
  setpos: {
    min: 2,
    max: 2,
    fn: (ctx, [expr, posVal]) => {
      if (!isList(posVal) || posVal.length < 3) return -1;
      const key = toVimString(expr);
      const lnum = Math.max(1, Math.trunc(toNumber(posVal[1])));
      const colNum = Math.max(1, Math.trunc(toNumber(posVal[2])));
      const clamped = clampCursor(
        ctx.state.lines,
        { line: lnum - 1, col: colNum - 1 },
        ctx.state.mode
      );
      if (key === '.') {
        ctx.state = { ...ctx.state, cursor: clamped };
        return 0;
      }
      if (key.startsWith("'") && key.length === 2 && /^[a-zA-Z]$/.test(key[1])) {
        const markChar = key[1];
        const bufId = Math.trunc(toNumber(posVal[0])) || ctx.state.currentBufferId;
        ctx.state = {
          ...ctx.state,
          marks: {
            ...(ctx.state.marks ?? {}),
            [markChar]: {
              row: clamped.line,
              col: clamped.col,
              ...(bufId ? { bufferId: bufId } : {}),
            },
          },
        };
        return 0;
      }
      return -1;
    },
  },
  submatch: {
    min: 1,
    max: 1,
    fn: (ctx, [n]) => {
      if (!ctx.submatches) {
        throw new VimScriptError(msg('E935: submatch() 는 :s 의 \\= 치환식 안에서만 쓸 수 있습니다'));
      }
      return ctx.submatches[toNumber(n)] ?? '';
    },
  },
};

export const STRING_BUILTINS: Record<string, Builtin> = {
  strlen: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).length },
  toupper: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toUpperCase() },
  tolower: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toLowerCase() },
  trim: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).trim() },
  str2nr: { min: 1, max: 1, fn: (_c, [s]) => toNumber(toVimString(s)) },
  string: { min: 1, max: 1, fn: (_c, [v]) => formatValue(v) },
  stridx: {
    min: 2,
    max: 3,
    fn: (_c, [s, sub, start]) =>
      toVimString(s).indexOf(toVimString(sub), start === undefined ? 0 : toNumber(start)),
  },
  escape: {
    min: 2,
    max: 2,
    fn: (_c, [s, chars]) => {
      const set = toVimString(chars);
      return [...toVimString(s)].map((c) => (set.includes(c) || c === '\\' ? `\\${c}` : c)).join('');
    },
  },
  repeat: {
    min: 2,
    max: 2,
    fn: (_c, [v, n]) => {
      const times = Math.max(0, toNumber(n));
      if (isList(v)) return Array.from({ length: times }, () => v).flat();
      return toVimString(v).repeat(times);
    },
  },
  substitute: {
    min: 4,
    max: 4,
    fn: (ctx, [s, pat, rep, flags]) => {
      const global = toVimString(flags).includes('g');
      const re = compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase, global ? 'g' : '');
      const template = toVimString(rep);
      return toVimString(s).replace(re, (...m: unknown[]) => {
        const groups = m
          .slice(0, -2)
          .filter((g) => typeof g === 'string' || g === undefined)
          .map((g) => (g as string) ?? '');
        return expandReplacement(template, groups);
      });
    },
  },
  matchstr: {
    min: 2,
    max: 2,
    fn: (ctx, [s, pat]) =>
      compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase).exec(toVimString(s))?.[0] ?? '',
  },
  match: {
    min: 2,
    max: 2,
    fn: (ctx, [s, pat]) => {
      if (isList(s)) {
        const re = compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
        return s.findIndex((item) => re.test(toVimString(item)));
      }
      return toVimString(s).search(compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase));
    },
  },
  split: {
    min: 1,
    max: 3,
    fn: (ctx, [s, pat, keepEmpty]) => {
      const text = toVimString(s);
      const re =
        pat === undefined || toVimString(pat) === ''
          ? /\s+/
          : compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
      const parts = text.split(re);
      if (keepEmpty !== undefined && isTruthy(keepEmpty)) return parts;
      while (parts.length > 0 && parts[0] === '') parts.shift();
      while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      return parts;
    },
  },
  printf: { min: 1, max: 20, fn: (_c, [fmt, ...rest]) => formatPrintf(toVimString(fmt), rest) },
};
