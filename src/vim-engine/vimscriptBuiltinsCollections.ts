import { VimScriptFuncref } from './types';
import { msg } from './messages';
import {
  VimScriptError,
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
  indexError,
  getIn,
  removeIn,
  expandScriptExpr,
} from './vimscriptValues';
import { Builtin, asDict, asList } from './vimscriptBuiltinsText';

// ---------------------------------------------------------------------------
// 공통·리스트·딕셔너리 정적 내장 함수 (vimscriptBuiltins.ts 에서 분리)
// ---------------------------------------------------------------------------

const SUPPORTED_FEATURES = new Set([
  'vim', 'nvim', 'eval', 'syntax', 'folding', 'spell', 'quickfix', 'loclist',
  'diff', 'wildmenu', 'autocmd', 'user_commands', 'lambda', 'funcref',
  'cmdline_compl', 'multi_byte', 'timers', 'json',
]);

export const KNOWN_BUILTIN_COMMANDS = new Set([
  'e', 'edit', 'enew', 'ene', 'w', 'write', 'wa', 'wall', 'q', 'quit', 'qa', 'qall',
  'wq', 'wqa', 'wqall', 'x', 'xa', 'xall', 'saveas', 'sav', 'f', 'file', 'files', 'finish',
  'ls', 'buffers', 'b', 'buffer', 'bn', 'bnext', 'bp', 'bprev', 'bd', 'bdelete',
  'bun', 'bunload', 'bw', 'bwipeout', 'sp', 'split', 'vsp', 'vsplit', 'tabnew',
  'cd', 'chd', 'chdir', 'lcd', 'lchd', 'lchdir', 'tcd', 'tchd', 'tchdir', 'pwd', 'set', 'se', 'setlocal', 'setglobal',
  'ru', 'runtime', 'so', 'source',
  'let', 'unlet', 'ec', 'echo', 'echom', 'echomsg', 'execute', 'exe', 'call',
  'function', 'redir', 'mes', 'messages', 'silent', 'keeppatterns', 'noautocmd',
  's', 'substitute', 'g', 'global', 'v', 'vglobal', 'j', 'join', 'p', 'print',
  'nu', 'number', 'l', 'list', 'd', 'delete', 'y', 'yank', 'pu', 'put', 'norm',
  'normal', 'sort', 'r', 'read', 'retab', 'm', 'move', 't', 'co', 'copy', 'help',
  'copen', 'vimgrep', 'au', 'autocmd', 'command', 'marks', 'jumps', 'reg', 'registers',
]);

export const COMMON_STATIC_BUILTINS: Record<string, Builtin> = {
  len: {
    min: 1,
    max: 1,
    fn: (_c, [v]) => (isList(v) ? v.length : isDict(v) ? Object.keys(v.items).length : toVimString(v).length),
  },
  empty: {
    min: 1,
    max: 1,
    fn: (_c, [v]) =>
      (isFuncref(v)
        ? false
        : isList(v)
          ? v.length === 0
          : isDict(v)
            ? Object.keys(v.items).length === 0
            : typeof v === 'number'
              ? v === 0
              : v === '')
        ? 1
        : 0,
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
  type: { min: 1, max: 1, fn: (_c, [v]) => typeCode(v) },
  copy: { min: 1, max: 1, fn: (_c, [v]) => v },
  deepcopy: { min: 1, max: 1, fn: (_c, [v]) => v },
  abs: { min: 1, max: 1, fn: (_c, [n]) => Math.abs(toNumber(n)) },
  float2nr: { min: 1, max: 1, fn: (_c, [n]) => Math.trunc(toNumber(n)) },
  round: { min: 1, max: 1, fn: (_c, [n]) => Math.round(toNumber(n)) },
  floor: { min: 1, max: 1, fn: (_c, [n]) => Math.floor(toNumber(n)) },
  ceil: { min: 1, max: 1, fn: (_c, [n]) => Math.ceil(toNumber(n)) },
  trunc: { min: 1, max: 1, fn: (_c, [n]) => Math.trunc(toNumber(n)) },
  sqrt: { min: 1, max: 1, fn: (_c, [n]) => Math.sqrt(toNumber(n)) },
  pow: { min: 2, max: 2, fn: (_c, [x, y]) => Math.pow(toNumber(x), toNumber(y)) },
  fmod: {
    min: 2,
    max: 2,
    fn: (_c, [x, y]) => {
      const b = toNumber(y);
      return b === 0 ? 0 : toNumber(x) % b;
    },
  },
  str2float: {
    min: 1,
    max: 1,
    fn: (_c, [s]) => {
      const n = parseFloat(toVimString(s));
      return Number.isFinite(n) ? n : 0;
    },
  },
  sin: { min: 1, max: 1, fn: (_c, [n]) => Math.sin(toNumber(n)) },
  cos: { min: 1, max: 1, fn: (_c, [n]) => Math.cos(toNumber(n)) },
  tan: { min: 1, max: 1, fn: (_c, [n]) => Math.tan(toNumber(n)) },
  log: { min: 1, max: 1, fn: (_c, [n]) => Math.log(toNumber(n)) },
  log10: { min: 1, max: 1, fn: (_c, [n]) => Math.log10(toNumber(n)) },
  exp: { min: 1, max: 1, fn: (_c, [n]) => Math.exp(toNumber(n)) },
  has: {
    min: 1,
    max: 1,
    fn: (_ctx, [feat]) => (SUPPORTED_FEATURES.has(toVimString(feat).toLowerCase()) ? 1 : 0),
  },
  expand: {
    min: 1,
    max: 3,
    fn: (ctx, [expr]) => expandScriptExpr(ctx.state, toVimString(expr)),
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
};

export const LIST_AND_DICT_STATIC_BUILTINS: Record<string, Builtin> = {
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
    fn: (_c, [l, sep]) =>
      asList(l, 'join')
        .map((v) => (typeof v === 'string' ? v : formatValue(v)))
        .join(sep === undefined ? ' ' : toVimString(sep)),
  },
  index: {
    min: 2,
    max: 2,
    fn: (_c, [l, needle]) =>
      asList(l, 'index').findIndex((v) => typeCode(v) === typeCode(needle) && valuesEqual(v, needle, false)),
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
      const updated = isDict(a)
        ? makeDict({ ...a.items, ...asDict(b, 'extend').items })
        : [...asList(a, 'extend'), ...asList(b, 'extend')];
      return { value: updated, updated };
    },
  },
  remove: {
    min: 2,
    max: 2,
    mutates: true,
    fn: (_c, [container, key]) => {
      const k = isDict(container) ? toVimString(key) : toNumber(key);
      return { value: getIn(container, k), updated: removeIn(container, [k]) };
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
  uniq: {
    min: 1,
    max: 1,
    mutates: true,
    fn: (_c, [l]) => {
      const updated = asList(l, 'uniq').filter(
        (v, i, arr) => i === 0 || !(typeCode(v) === typeCode(arr[i - 1]) && valuesEqual(v, arr[i - 1], false))
      );
      return { value: updated, updated };
    },
  },
  keys: { min: 1, max: 1, fn: (_c, [d]) => Object.keys(asDict(d, 'keys').items) },
  values: { min: 1, max: 1, fn: (_c, [d]) => Object.values(asDict(d, 'values').items) },
  items: { min: 1, max: 1, fn: (_c, [d]) => Object.entries(asDict(d, 'items').items).map(([k, v]) => [k, v]) },
  has_key: { min: 2, max: 2, fn: (_c, [d, k]) => (toVimString(k) in asDict(d, 'has_key').items ? 1 : 0) },
};
