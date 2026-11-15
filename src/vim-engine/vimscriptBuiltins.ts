import { VimEditorState, VimScriptDict, VimScriptFuncref, VimScriptValue } from './types';
import { msg } from './messages';
import {
  VimScriptError,
  EvalContext,
  isList,
  isDict,
  isFuncref,
  makeDict,
  makeFuncref,
  toNumber,
  toVimString,
  isTruthy,
  formatValue,
  typeCode,
  valuesEqual,
  compileVimPattern,
  indexError,
  getIn,
  removeIn,
  readVariable,
} from './vimscriptValues';

// ---------------------------------------------------------------------------
// 내장 함수
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

function asList(value: VimScriptValue, fn: string): VimScriptValue[] {
  if (!isList(value)) throw new VimScriptError(msg('E714: {fn}() 의 인자는 리스트여야 합니다', { fn }));
  return value;
}

function asDict(value: VimScriptValue, fn: string): VimScriptDict {
  if (!isDict(value)) throw new VimScriptError(msg('E715: {fn}() 의 인자는 딕셔너리여야 합니다', { fn }));
  return value;
}

/** line('.'), getline('$') 등 줄 지정 인자를 0-based 줄 번호로 변환합니다. (범위 밖이면 -1) */
function resolveLineArg(state: VimEditorState, arg: VimScriptValue): number {
  if (arg === '.') return state.cursor.line;
  if (arg === '$') return state.lines.length - 1;
  const n = toNumber(arg);
  return n >= 1 && n <= state.lines.length ? n - 1 : -1;
}

/** Funcref 또는 람다를 호출합니다 */

/**
 * evaluateExpr 콜백을 주입받아 순환 참조 없이 Vim script 내장 함수 레지스트리와 Funcref 실행기를 생성합니다.
 */
export function createBuiltinRegistry(
  evaluateExpr: (source: string, ctx: EvalContext) => VimScriptValue
) {
  function invokeFuncref(
    ctx: EvalContext,
    funcref: VimScriptFuncref,
    passedArgs: VimScriptValue[]
  ): VimScriptValue {
    const allArgs = [...(funcref.args ?? []), ...passedArgs];
    if (funcref.lambda) {
      const { params, bodyExpr, closureVars, closureArgs } = funcref.lambda;
      const lambdaLocals: Record<string, VimScriptValue> = {
        ...(closureVars ?? {}),
        ...(closureArgs ?? {}),
      };
      const lambdaArgs: Record<string, VimScriptValue> = {
        ...(closureArgs ?? {}),
      };

      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        if (p === '...') {
          const extra = allArgs.slice(i);
          lambdaArgs['0'] = extra.length;
          lambdaArgs['000'] = extra;
          extra.forEach((v, idx) => (lambdaArgs[String(idx + 1)] = v));
          break;
        }
        const val = allArgs[i] ?? 0;
        lambdaLocals[p] = val;
        lambdaArgs[p] = val;
      }
      if (funcref.dict) {
        lambdaLocals['self'] = funcref.dict;
      }

      const lambdaCtx: EvalContext = {
        state: ctx.state,
        locals: lambdaLocals,
        args: lambdaArgs,
        vvars: ctx.vvars,
        submatches: ctx.submatches,
        callUserFunction: ctx.callUserFunction,
      };

      const result = evaluateExpr(bodyExpr, lambdaCtx);
      ctx.state = lambdaCtx.state;
      return result;
    }

    if (funcref.name) {
      const name = funcref.name;
      if (/^[A-Z]/.test(name) || name.startsWith('g:') || name.startsWith('s:')) {
        const subCtx = funcref.dict ? { ...ctx, locals: { ...(ctx.locals ?? {}), self: funcref.dict } } : ctx;
        return subCtx.callUserFunction(subCtx, name.replace(/^g:/, ''), allArgs);
      }
      const builtin = BUILTINS[name];
      if (builtin) {
        if (allArgs.length < builtin.min) throw new VimScriptError(msg('E119: 함수의 인자가 부족합니다: {name}', { name }));
        if (allArgs.length > builtin.max) throw new VimScriptError(msg('E118: 함수의 인자가 너무 많습니다: {name}', { name }));
        const res = builtin.fn(ctx, allArgs);
        if (builtin.mutates) {
          return (res as MutationResult).value;
        }
        return res as VimScriptValue;
      }
      throw new VimScriptError(msg('E117: 알 수 없는 함수입니다: {name}', { name }));
    }

    throw new VimScriptError(msg('E129: 잘못된 funcref 호출입니다'));
  }

  /** map() / filter() 의 표현식을 평가합니다. (람다/funcref 또는 v:val, v:key 문자열) */
  function evalWithItem(ctx: EvalContext, expr: VimScriptValue, val: VimScriptValue, key: VimScriptValue): VimScriptValue {
    if (isFuncref(expr)) {
      return invokeFuncref(ctx, expr, [key, val]);
    }
    const inner: EvalContext = { ...ctx, vvars: { ...(ctx.vvars ?? {}), val, key } };
    const result = evaluateExpr(toVimString(expr), inner);
    ctx.state = inner.state;
    return result;
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
      if (argIdx >= args.length) throw new VimScriptError(msg('E766: printf() 의 인자가 부족합니다: {fmt}', { fmt }));
      return args[argIdx++];
    };
    const out = fmt.replace(/%([-0]*)(\d*)(?:\.(\d+))?([dsxXocS%])/g, (_m, flags: string, width: string, prec: string | undefined, conv: string) => {
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
    });
    if (argIdx < args.length) throw new VimScriptError(msg('E767: printf() 의 인자가 너무 많습니다: {fmt}', { fmt }));
    return out;
  }

  function compareForSort(ctx: EvalContext, how: VimScriptValue | undefined) {
    if (how && isFuncref(how)) {
      return (a: VimScriptValue, b: VimScriptValue): number => {
        const res = invokeFuncref(ctx, how, [a, b]);
        return toNumber(res);
      };
    }
    const mode = how === undefined ? '' : typeof how === 'number' ? (how ? 'i' : '') : how;
    return (a: VimScriptValue, b: VimScriptValue): number => {
      if (mode === 'n' || mode === 'N') return toNumber(a) - toNumber(b);
      const sa = typeof a === 'string' ? a : formatValue(a);
      const sb = typeof b === 'string' ? b : formatValue(b);
      const x = mode === 'i' ? sa.toLowerCase() : sa;
      const y = mode === 'i' ? sb.toLowerCase() : sb;
      return x < y ? -1 : x > y ? 1 : 0;
    };
  }

  const BUILTINS: Record<string, Builtin> = {
    // ---- 버퍼·커서 ----
    line: { min: 1, max: 1, fn: (ctx, [a]) => resolveLineArg(ctx.state, a) + 1 },
    col: {
      min: 1,
      max: 1,
      fn: (ctx, [a]) =>
        a === '.' ? ctx.state.cursor.col + 1 : a === '$' ? (ctx.state.lines[ctx.state.cursor.line] ?? '').length + 1 : 0,
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

    // ---- :s 의 \= 치환식 ----
    submatch: {
      min: 1,
      max: 1,
      fn: (ctx, [n]) => {
        if (!ctx.submatches) throw new VimScriptError(msg('E935: submatch() 는 :s 의 \\= 치환식 안에서만 쓸 수 있습니다'));
        return ctx.submatches[toNumber(n)] ?? '';
      },
    },

    // ---- 문자열 ----
    strlen: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).length },
    toupper: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toUpperCase() },
    tolower: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).toLowerCase() },
    trim: { min: 1, max: 1, fn: (_c, [s]) => toVimString(s).trim() },
    str2nr: { min: 1, max: 1, fn: (_c, [s]) => toNumber(toVimString(s)) },
    string: { min: 1, max: 1, fn: (_c, [v]) => formatValue(v) },
    stridx: {
      min: 2,
      max: 3,
      fn: (_c, [s, sub, start]) => toVimString(s).indexOf(toVimString(sub), start === undefined ? 0 : toNumber(start)),
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
          const groups = m.slice(0, -2).filter((g) => typeof g === 'string' || g === undefined).map((g) => (g as string) ?? '');
          return expandReplacement(template, groups);
        });
      },
    },
    matchstr: {
      min: 2,
      max: 2,
      fn: (ctx, [s, pat]) => compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase).exec(toVimString(s))?.[0] ?? '',
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
        const re = pat === undefined || toVimString(pat) === ''
          ? /\s+/
          : compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
        const parts = text.split(re);
        if (keepEmpty !== undefined && isTruthy(keepEmpty)) return parts;
        // keepempty 가 아니면 맨 앞·맨 뒤의 빈 항목을 버림 (Vim 동작)
        while (parts.length > 0 && parts[0] === '') parts.shift();
        while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
        return parts;
      },
    },
    printf: { min: 1, max: 20, fn: (_c, [fmt, ...rest]) => formatPrintf(toVimString(fmt), rest) },

    // ---- 공통 ----
    len: {
      min: 1,
      max: 1,
      fn: (_c, [v]) => (isList(v) ? v.length : isDict(v) ? Object.keys(v.items).length : toVimString(v).length),
    },
    empty: {
      min: 1,
      max: 1,
      fn: (_c, [v]) => (isFuncref(v) ? false : isList(v) ? v.length === 0 : isDict(v) ? Object.keys(v.items).length === 0 : typeof v === 'number' ? v === 0 : v === '') ? 1 : 0,
    },
    function: {
      min: 1,
      max: 3,
      fn: (_ctx, [target, args, dict]) => {
        const argList = args !== undefined ? asList(args, 'function') : undefined;
        const d = dict !== undefined ? asDict(dict, 'function') : undefined;
        return makeFuncref(target as string | VimScriptFuncref, argList, d);
      },
    },
    funcref: {
      min: 1,
      max: 3,
      fn: (_ctx, [target, args, dict]) => {
        const argList = args !== undefined ? asList(args, 'funcref') : undefined;
        const d = dict !== undefined ? asDict(dict, 'funcref') : undefined;
        return makeFuncref(target as string | VimScriptFuncref, argList, d);
      },
    },
    call: {
      min: 2,
      max: 3,
      fn: (ctx, [func, argsList, dict]) => {
        if (!isList(argsList)) throw new VimScriptError(msg('E714: call() 에는 인자 리스트가 필요합니다'));
        const d = dict !== undefined ? asDict(dict, 'call') : undefined;
        if (isFuncref(func)) {
          return invokeFuncref(ctx, d ? { ...func, dict: d } : func, argsList);
        }
        if (typeof func === 'string') {
          const fn = makeFuncref(func, undefined, d);
          return invokeFuncref(ctx, fn, argsList);
        }
        throw new VimScriptError(msg('E129: 함수 이름 또는 funcref 가 필요합니다'));
      },
    },
    type: { min: 1, max: 1, fn: (_c, [v]) => typeCode(v) },
    copy: { min: 1, max: 1, fn: (_c, [v]) => v },
    deepcopy: { min: 1, max: 1, fn: (_c, [v]) => v },
    abs: { min: 1, max: 1, fn: (_c, [n]) => Math.abs(toNumber(n)) },
    exists: {
      min: 1,
      max: 1,
      fn: (ctx, [s]) => {
        const name = toVimString(s);
        if (name.startsWith('*')) return ctx.state.userFunctions?.[name.slice(1)] || BUILTINS[name.slice(1)] ? 1 : 0;
        try {
          readVariable(ctx, name);
          return 1;
        } catch {
          return 0;
        }
      },
    },
    get: {
      min: 2,
      max: 3,
      fn: (_c, [container, key, def]) => {
        if (isList(container)) {
          const n = toNumber(key);
          const idx = n < 0 ? container.length + n : n;
          return idx >= 0 && idx < container.length ? container[idx] : def ?? 0;
        }
        const k = toVimString(key);
        const dict = asDict(container, 'get');
        return k in dict.items ? dict.items[k] : def ?? 0;
      },
    },
    count: {
      min: 2,
      max: 3,
      fn: (_c, [container, needle, ic]) => {
        const items = isDict(container) ? Object.values(container.items) : asList(container, 'count');
        return items.filter((v) => typeCode(v) === typeCode(needle) && valuesEqual(v, needle, !!ic && isTruthy(ic))).length;
      },
    },

    // ---- 리스트 ----
    range: {
      min: 1,
      max: 3,
      fn: (_c, [a, b, c]) => {
        const start = b === undefined ? 0 : toNumber(a);
        const end = b === undefined ? toNumber(a) - 1 : toNumber(b);
        const step = c === undefined ? 1 : toNumber(c);
        if (step === 0) throw new VimScriptError(msg('E726: range() 의 간격은 0 일 수 없습니다'));
        const out: number[] = [];
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          out.push(i);
          if (out.length > 100000) break;
        }
        return out;
      },
    },
    join: {
      min: 1,
      max: 2,
      fn: (_c, [l, sep]) => asList(l, 'join').map((v) => (typeof v === 'string' ? v : formatValue(v))).join(sep === undefined ? ' ' : toVimString(sep)),
    },
    index: {
      min: 2,
      max: 2,
      fn: (_c, [l, needle]) => asList(l, 'index').findIndex((v) => typeCode(v) === typeCode(needle) && valuesEqual(v, needle, false)),
    },
    max: {
      min: 1,
      max: 1,
      fn: (_c, [l]) => {
        const items = isDict(l) ? Object.values(l.items) : asList(l, 'max');
        return items.length === 0 ? 0 : Math.max(...items.map(toNumber));
      },
    },
    min: {
      min: 1,
      max: 1,
      fn: (_c, [l]) => {
        const items = isDict(l) ? Object.values(l.items) : asList(l, 'min');
        return items.length === 0 ? 0 : Math.min(...items.map(toNumber));
      },
    },
    add: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (_c, [l, item]) => {
        const updated = [...asList(l, 'add'), item];
        return { value: updated, updated };
      },
    },
    insert: {
      min: 2,
      max: 3,
      mutates: true,
      fn: (_c, [l, item, at]) => {
        const list = asList(l, 'insert');
        const n = at === undefined ? 0 : toNumber(at);
        const idx = n < 0 ? list.length + n : n;
        if (idx < 0 || idx > list.length) throw indexError(n);
        const updated = [...list.slice(0, idx), item, ...list.slice(idx)];
        return { value: updated, updated };
      },
    },
    extend: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (_c, [a, b]) => {
        const updated = isDict(a) ? makeDict({ ...a.items, ...asDict(b, 'extend').items }) : [...asList(a, 'extend'), ...asList(b, 'extend')];
        return { value: updated, updated };
      },
    },
    remove: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (_c, [container, key]) => {
        const removed = getIn(container, isDict(container) ? toVimString(key) : toNumber(key));
        return { value: removed, updated: removeIn(container, [isDict(container) ? toVimString(key) : toNumber(key)]) };
      },
    },
    reverse: {
      min: 1,
      max: 1,
      mutates: true,
      fn: (_c, [l]) => {
        const updated = [...asList(l, 'reverse')].reverse();
        return { value: updated, updated };
      },
    },
    sort: {
      min: 1,
      max: 2,
      mutates: true,
      fn: (ctx, [l, how]) => {
        const updated = [...asList(l, 'sort')].sort(compareForSort(ctx, how));
        return { value: updated, updated };
      },
    },
    uniq: {
      min: 1,
      max: 1,
      mutates: true,
      fn: (_c, [l]) => {
        // Vim 의 uniq() 는 연속으로 반복되는 항목만 하나로 줄입니다
        const updated = asList(l, 'uniq').filter((v, i, arr) => i === 0 || !(typeCode(v) === typeCode(arr[i - 1]) && valuesEqual(v, arr[i - 1], false)));
        return { value: updated, updated };
      },
    },
    map: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (ctx, [container, expr]) => {
        const updated = isDict(container)
          ? makeDict(Object.fromEntries(Object.entries(container.items).map(([k, v]) => [k, evalWithItem(ctx, expr, v, k)])))
          : asList(container, 'map').map((v, i) => evalWithItem(ctx, expr, v, i));
        return { value: updated, updated };
      },
    },
    filter: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (ctx, [container, expr]) => {
        const updated = isDict(container)
          ? makeDict(Object.fromEntries(Object.entries(container.items).filter(([k, v]) => isTruthy(evalWithItem(ctx, expr, v, k)))))
          : asList(container, 'filter').filter((v, i) => isTruthy(evalWithItem(ctx, expr, v, i)));
        return { value: updated, updated };
      },
    },

    // ---- 딕셔너리 ----
    keys: { min: 1, max: 1, fn: (_c, [d]) => Object.keys(asDict(d, 'keys').items) },
    values: { min: 1, max: 1, fn: (_c, [d]) => Object.values(asDict(d, 'values').items) },
    items: { min: 1, max: 1, fn: (_c, [d]) => Object.entries(asDict(d, 'items').items).map(([k, v]) => [k, v]) },
    has_key: { min: 2, max: 2, fn: (_c, [d, k]) => (toVimString(k) in asDict(d, 'has_key').items ? 1 : 0) },
  };

  return { BUILTINS, invokeFuncref };
}
