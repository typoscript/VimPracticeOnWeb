import { VimScriptFuncref, VimScriptValue } from './types';
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
  valuesEqual,
  readVariable,
  hasEnvVar,
} from './vimscriptValues';
import { OPTION_ALIASES } from './setOptionsCore';
import { EXTRA_BUILTINS } from './vimscriptBuiltinsExtra';
import { Builtin, MutationResult, asDict, asList, BUFFER_AND_CURSOR_BUILTINS, STRING_BUILTINS } from './vimscriptBuiltinsText';
import {
  KNOWN_BUILTIN_COMMANDS,
  COMMON_STATIC_BUILTINS,
  LIST_AND_DICT_STATIC_BUILTINS,
} from './vimscriptBuiltinsCollections';

export type { Builtin, MutationResult } from './vimscriptBuiltinsText';

// ---------------------------------------------------------------------------
// 내장 함수 레지스트리 (정적 그룹은 vimscriptBuiltinsText.ts · vimscriptBuiltinsCollections.ts)
// ---------------------------------------------------------------------------

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
        const val = subCtx.callUserFunction(subCtx, name.replace(/^g:/, ''), allArgs);
        ctx.state = subCtx.state;
        return val;
      }
      const builtin = BUILTINS[name];
      if (builtin) {
        if (allArgs.length < builtin.min) throw new VimScriptError(msg('E119: 함수의 인자가 부족합니다: {name}', { name }));
        if (allArgs.length > builtin.max) throw new VimScriptError(msg('E118: 함수의 인자가 너무 많습니다: {name}', { name }));
        const res = builtin.fn(ctx, allArgs);
        return builtin.mutates ? (res as MutationResult).value : (res as VimScriptValue);
      }
      throw new VimScriptError(msg('E117: 알 수 없는 함수입니다: {name}', { name }));
    }

    throw new VimScriptError(msg('E129: 잘못된 funcref 호출입니다'));
  }

  /** map() / filter() 의 표현식을 평가합니다. (람다/funcref 또는 v:val, v:key 문자열) */
  function evalWithItem(
    ctx: EvalContext,
    expr: VimScriptValue,
    val: VimScriptValue,
    key: VimScriptValue
  ): VimScriptValue {
    if (isFuncref(expr)) {
      return invokeFuncref(ctx, expr, [key, val]);
    }
    const inner: EvalContext = { ...ctx, vvars: { ...(ctx.vvars ?? {}), val, key } };
    const result = evaluateExpr(toVimString(expr), inner);
    ctx.state = inner.state;
    return result;
  }

  function compareForSort(ctx: EvalContext, how: VimScriptValue | undefined) {
    if (how && isFuncref(how)) {
      return (a: VimScriptValue, b: VimScriptValue): number => toNumber(invokeFuncref(ctx, how, [a, b]));
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
    ...EXTRA_BUILTINS,
    ...BUFFER_AND_CURSOR_BUILTINS,
    ...STRING_BUILTINS,
    ...COMMON_STATIC_BUILTINS,
    ...LIST_AND_DICT_STATIC_BUILTINS,
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
          return invokeFuncref(ctx, makeFuncref(func, undefined, d), argsList);
        }
        throw new VimScriptError(msg('E129: 함수 이름 또는 funcref 가 필요합니다'));
      },
    },
    exists: {
      min: 1,
      max: 1,
      fn: (ctx, [s]) => {
        const name = toVimString(s);
        if (name.startsWith('*')) return ctx.state.userFunctions?.[name.slice(1)] || BUILTINS[name.slice(1)] ? 1 : 0;
        if (name.startsWith('&') || name.startsWith('+')) {
          const opt = name.slice(1).replace(/^[gl]:/, '');
          return OPTION_ALIASES[opt] ? 1 : 0;
        }
        if (name.startsWith(':')) {
          const cmd = name.slice(1);
          return ctx.state.userCommands?.[cmd] || KNOWN_BUILTIN_COMMANDS.has(cmd) ? 2 : 0;
        }
        if (name.startsWith('$')) {
          return hasEnvVar(ctx.state, name.slice(1)) ? 1 : 0;
        }
        if (name.startsWith('@')) {
          return name.length === 2 && /^[a-zA-Z0-9"_+*/%.:=-]$/.test(name[1]) ? 1 : 0;
        }
        try {
          readVariable(ctx, name);
          return 1;
        } catch {
          return 0;
        }
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
    map: {
      min: 2,
      max: 2,
      mutates: true,
      fn: (ctx, [container, expr]) => {
        const updated = isDict(container)
          ? makeDict(
              Object.fromEntries(
                Object.entries(container.items).map(([k, v]) => [k, evalWithItem(ctx, expr, v, k)])
              )
            )
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
          ? makeDict(
              Object.fromEntries(
                Object.entries(container.items).filter(([k, v]) => isTruthy(evalWithItem(ctx, expr, v, k)))
              )
            )
          : asList(container, 'filter').filter((v, i) => isTruthy(evalWithItem(ctx, expr, v, i)));
        return { value: updated, updated };
      },
    },
    uniq: {
      min: 1,
      max: 2,
      mutates: true,
      fn: (ctx, [l, how]) => {
        const list = asList(l, 'uniq');
        const cmp = how !== undefined ? compareForSort(ctx, how) : null;
        const updated: VimScriptValue[] = [];
        for (const item of list) {
          if (updated.length === 0) {
            updated.push(item);
            continue;
          }
          const prev = updated[updated.length - 1];
          const same = cmp ? cmp(prev, item) === 0 : valuesEqual(prev, item, false);
          if (!same) updated.push(item);
        }
        return { value: updated, updated };
      },
    },
    reduce: {
      min: 2,
      max: 3,
      fn: (ctx, [container, func, initial]) => {
        const items: VimScriptValue[] = isList(container)
          ? container
          : typeof container === 'string'
            ? [...container]
            : isDict(container)
              ? Object.values(container.items)
              : [];
        const hasInitial = initial !== undefined;
        if (items.length === 0) {
          return hasInitial ? initial : 0;
        }
        let acc: VimScriptValue = hasInitial ? initial : items[0];
        const startIdx = hasInitial ? 0 : 1;
        for (let i = startIdx; i < items.length; i++) {
          const item = items[i];
          if (isFuncref(func)) {
            acc = invokeFuncref(ctx, func, [acc, item]);
          } else {
            const inner: EvalContext = { ...ctx, vvars: { ...(ctx.vvars ?? {}), acc, val: item } };
            acc = evaluateExpr(toVimString(func), inner);
            ctx.state = inner.state;
          }
        }
        return acc;
      },
    },
    flattennew: {
      min: 1,
      max: 2,
      fn: (_ctx, [l, maxDepthArg]) => {
        const list = asList(l, 'flattennew');
        const maxDepth = maxDepthArg === undefined ? Infinity : Math.max(0, Math.trunc(toNumber(maxDepthArg)));
        const flatten = (arr: VimScriptValue[], depth: number): VimScriptValue[] => {
          const out: VimScriptValue[] = [];
          for (const item of arr) {
            if (isList(item) && depth > 0) {
              out.push(...flatten(item, depth - 1));
            } else {
              out.push(item);
            }
          }
          return out;
        };
        return flatten(list, maxDepth);
      },
    },
  };

  return { BUILTINS, invokeFuncref };
}
