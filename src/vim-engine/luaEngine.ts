import { VimEditorState, VimScriptValue } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { executeSetCommand } from './setEngine';
import { readOptionForScript } from './setOptionsCore';
import { registerKeymap, unregisterKeymap, KeymapModifiers } from './keymapEngine';
import { getVfsFile } from './vfs';
import { appendRedirText, EvalContext, formatValue, isDict, isList, VimScriptError } from './vimscriptValues';
import { evaluateVimScript } from './vimscriptEval';
import { callUserFunction, ExRunner } from './vimscriptEngine';
import { msg } from './messages';

/**
 * Neovim Lua 미니 런타임 (:lua, :=expr, :luafile, :source init.lua)
 *
 * eval / Function 을 전혀 사용하지 않는 순수 TypeScript 토크나이저 + 재귀 하강 파서입니다.
 * 지원 API:
 * - vim.opt / vim.o / vim.bo / vim.wo (=, :append, :remove, :prepend, :get)
 * - vim.g / vim.b / vim.w / vim.t (vim.g.mapleader 포함)
 * - vim.keymap.set / vim.keymap.del (단일/다중 모드 테이블, silent/expr/buffer/nowait/remap)
 * - vim.cmd / vim.fn.* / vim.api.* (nvim_get_current_line, nvim_set_current_line,
 *   nvim_buf_get_lines, nvim_buf_set_lines, nvim_buf_line_count, nvim_buf_get_name,
 *   nvim_win_get_cursor, nvim_win_set_cursor, nvim_set_keymap, nvim_del_keymap, nvim_command)
 * - vim.inspect, vim.notify, print, vim.tbl_*, vim.split, vim.trim, vim.startswith/endswith
 * - local/전역 변수, 테이블, 산술/비교/논리/문자열 연결(..), if/elseif/else, for, ipairs/pairs, while
 */

interface LuaTable {
  __luaTable: true;
  array: LuaValue[];
  map: Record<string, LuaValue>;
}

interface LuaRef {
  __luaRef: true;
  path: string;
}

type LuaValue = null | boolean | number | string | LuaTable | LuaRef;

function makeTable(array: LuaValue[] = [], map: Record<string, LuaValue> = {}): LuaTable {
  return { __luaTable: true, array, map };
}

function makeRef(path: string): LuaRef {
  return { __luaRef: true, path };
}

function isLuaTable(v: LuaValue): v is LuaTable {
  return typeof v === 'object' && v !== null && '__luaTable' in v;
}

function isLuaRef(v: LuaValue): v is LuaRef {
  return typeof v === 'object' && v !== null && '__luaRef' in v;
}

function isLuaTruthy(v: LuaValue): boolean {
  return v !== null && v !== false;
}

function toLuaNumber(v: LuaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  throw new Error(msg('Lua 오류: 숫자가 필요합니다: {v}', { v: formatLuaValue(v) }));
}

export function formatLuaValue(v: LuaValue, inspect = false): string {
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return inspect ? JSON.stringify(v) : v;
  if (isLuaRef(v)) return `<${v.path}>`;
  const parts: string[] = [];
  for (const item of v.array) {
    parts.push(formatLuaValue(item, true));
  }
  for (const [k, val] of Object.entries(v.map)) {
    const keyStr = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`;
    parts.push(`${keyStr} = ${formatLuaValue(val, true)}`);
  }
  return `{ ${parts.join(', ')} }`;
}

function luaToVimScript(v: LuaValue): VimScriptValue {
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (isLuaTable(v)) {
    if (Object.keys(v.map).length === 0) {
      return v.array.map(luaToVimScript);
    }
    const items: Record<string, VimScriptValue> = {};
    v.array.forEach((item, idx) => {
      items[String(idx + 1)] = luaToVimScript(item);
    });
    for (const [k, val] of Object.entries(v.map)) {
      items[k] = luaToVimScript(val);
    }
    return { kind: 'dict', items };
  }
  return formatLuaValue(v);
}

function vimScriptToLua(v: VimScriptValue): LuaValue {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (isList(v)) return makeTable(v.map(vimScriptToLua));
  if (isDict(v)) {
    const map: Record<string, LuaValue> = {};
    for (const [k, val] of Object.entries(v.items)) {
      map[k] = vimScriptToLua(val);
    }
    return makeTable([], map);
  }
  return formatValue(v);
}

function toVimLiteral(v: LuaValue): string {
  return formatValue(luaToVimScript(v));
}

// ---------------------------------------------------------------------------
// 토크나이저
// ---------------------------------------------------------------------------

type LuaTokenType = 'num' | 'str' | 'ident' | 'op' | 'eof';

interface LuaToken {
  type: LuaTokenType;
  value: string | number;
}

const LUA_MULTI_OPS = ['..', '==', '~=', '<=', '>='];

function tokenizeLua(src: string): LuaToken[] {
  const tokens: LuaToken[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // 주석: --[[ ... ]] 또는 -- ...
    if (ch === '-' && src[i + 1] === '-') {
      if (src.startsWith('--[[', i)) {
        const end = src.indexOf(']]', i + 4);
        i = end === -1 ? src.length : end + 2;
      } else {
        const nl = src.indexOf('\n', i + 2);
        i = nl === -1 ? src.length : nl + 1;
      }
      continue;
    }

    // 긴 문자열 [[ ... ]]
    if (ch === '[' && src[i + 1] === '[') {
      let start = i + 2;
      if (src[start] === '\n') start++;
      const end = src.indexOf(']]', start);
      if (end === -1) throw new Error(msg('Lua 오류: 닫히지 않은 [[ 문자열입니다'));
      tokens.push({ type: 'str', value: src.slice(start, end) });
      i = end + 2;
      continue;
    }

    // 일반 문자열 '...' / "..."
    if (ch === '"' || ch === "'") {
      let out = '';
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const esc = src[j + 1];
          out += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new Error(msg('Lua 오류: 닫히지 않은 문자열입니다'));
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }

    // 숫자
    const num = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+\.\d+(?:[eE][+-]?\d+)?|\d+)/);
    if (num) {
      const raw = num[1];
      const val = raw.toLowerCase().startsWith('0x') ? parseInt(raw, 16) : parseFloat(raw);
      tokens.push({ type: 'num', value: val });
      i += raw.length;
      continue;
    }

    // 식별자 / 키워드
    const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) {
      tokens.push({ type: 'ident', value: id[0] });
      i += id[0].length;
      continue;
    }

    // 2글자 연산자
    const multi = LUA_MULTI_OPS.find((op) => src.startsWith(op, i));
    if (multi) {
      tokens.push({ type: 'op', value: multi });
      i += multi.length;
      continue;
    }

    // 단일 기호
    if ('+-*/%#=<>(){}[].:,;'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new Error(msg('Lua 오류: 알 수 없는 토큰입니다: {tok}', { tok: ch }));
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST / 파서 & 실행 컨텍스트
// ---------------------------------------------------------------------------

interface LuaRuntime {
  state: VimEditorState;
  runEx: ExRunner;
  outputs: string[];
  scopes: Array<Record<string, LuaValue>>;
  globals: Record<string, LuaValue>;
}

const MAX_LUA_LOOP = 5000;

function readEnvVar(rt: LuaRuntime, name: string): LuaValue {
  for (let i = rt.scopes.length - 1; i >= 0; i--) {
    if (name in rt.scopes[i]) return rt.scopes[i][name];
  }
  if (name in rt.globals) return rt.globals[name];
  if (name === 'vim') return makeRef('vim');
  if (name === 'string') return makeRef('string');
  if (name === 'table') return makeRef('table');
  if (name === 'math') return makeRef('math');
  if (
    name === 'print' ||
    name === 'tostring' ||
    name === 'tonumber' ||
    name === 'type' ||
    name === 'ipairs' ||
    name === 'pairs'
  ) {
    return makeRef(name);
  }
  return null;
}

function writeEnvVar(rt: LuaRuntime, name: string, value: LuaValue, isLocal: boolean): void {
  if (isLocal) {
    rt.scopes[rt.scopes.length - 1][name] = value;
    return;
  }
  for (let i = rt.scopes.length - 1; i >= 0; i--) {
    if (name in rt.scopes[i]) {
      rt.scopes[i][name] = value;
      return;
    }
  }
  rt.globals[name] = value;
}

function emitOutput(rt: LuaRuntime, text: string): void {
  rt.outputs.push(text);
  const nextHistory = [...(rt.state.messageHistory ?? []), text].slice(-200);
  let nextState: VimEditorState = { ...rt.state, commandMessage: text, messageHistory: nextHistory };
  if (nextState.redirSession) nextState = appendRedirText(nextState, text);
  rt.state = nextState;
}

function setVimOption(rt: LuaRuntime, scope: 'opt' | 'o' | 'bo' | 'wo', optName: string, val: LuaValue): void {
  const isLocal = scope === 'bo' || scope === 'wo';
  let expr: string;
  if (typeof val === 'boolean') {
    expr = val ? optName : `no${optName}`;
  } else if (isLuaTable(val)) {
    const joined = val.array.map((x) => formatLuaValue(x)).join(',');
    expr = `${optName}=${joined}`;
  } else if (val === null) {
    expr = `${optName}=`;
  } else {
    expr = `${optName}=${formatLuaValue(val)}`;
  }
  rt.state = executeSetCommand(rt.state, expr, isLocal ? 'local' : 'both');
}

function getVimOption(rt: LuaRuntime, optName: string): LuaValue {
  const val = readOptionForScript(rt.state, `&${optName}`);
  if (val === null) return null;
  return vimScriptToLua(val);
}

function readScopeVar(rt: LuaRuntime, scope: 'g' | 'b' | 'w' | 't', key: string): LuaValue {
  const s = rt.state;
  if (scope === 'g' && key === 'mapleader') {
    return s.leaderKey ?? ' ';
  }
  const store =
    scope === 'g'
      ? s.globalVars
      : scope === 'b'
        ? s.bufferVars?.[s.currentBufferId ?? 1]
        : scope === 'w'
          ? s.windowVars?.[s.activePaneIndex ?? 0]
          : s.tabVars?.[s.currentTabId ?? 1];
  if (!store || !(key in store)) return null;
  return vimScriptToLua(store[key]);
}

function writeScopeVar(rt: LuaRuntime, scope: 'g' | 'b' | 'w' | 't', key: string, val: LuaValue): void {
  const s = rt.state;
  if (scope === 'g' && key === 'mapleader') {
    let leader = formatLuaValue(val);
    if (leader.toLowerCase() === '<space>') leader = ' ';
    rt.state = {
      ...s,
      leaderKey: leader,
      globalVars: { ...(s.globalVars ?? {}), mapleader: leader },
    };
    return;
  }
  const vimVal = luaToVimScript(val);
  if (scope === 'g') {
    rt.state = { ...s, globalVars: { ...(s.globalVars ?? {}), [key]: vimVal } };
  } else if (scope === 'b') {
    const id = s.currentBufferId ?? 1;
    const prev = s.bufferVars?.[id] ?? {};
    rt.state = { ...s, bufferVars: { ...(s.bufferVars ?? {}), [id]: { ...prev, [key]: vimVal } } };
  } else if (scope === 'w') {
    const id = s.activePaneIndex ?? 0;
    const prev = s.windowVars?.[id] ?? {};
    rt.state = { ...s, windowVars: { ...(s.windowVars ?? {}), [id]: { ...prev, [key]: vimVal } } };
  } else {
    const id = s.currentTabId ?? 1;
    const prev = s.tabVars?.[id] ?? {};
    rt.state = { ...s, tabVars: { ...(s.tabVars ?? {}), [id]: { ...prev, [key]: vimVal } } };
  }
}

function resolveKeymapModes(modeArg: LuaValue): string[] {
  if (typeof modeArg === 'string') return [modeArg];
  if (isLuaTable(modeArg)) {
    return modeArg.array.map((m) => formatLuaValue(m));
  }
  return ['n'];
}

function modeToMapCommand(mode: string, noremap: boolean): string {
  const m = mode.toLowerCase();
  if (m === '' || m === 'all') return noremap ? 'noremap' : 'map';
  if (m === '!') return noremap ? 'noremap!' : 'map!';
  if ('nivxsoc'.includes(m)) return noremap ? `${m}noremap` : `${m}map`;
  return noremap ? 'nnoremap' : 'nmap';
}

function modeToUnmapCommand(mode: string): string {
  const m = mode.toLowerCase();
  if (m === '' || m === 'all') return 'unmap';
  if (m === '!') return 'unmap!';
  if ('nivxsoc'.includes(m)) return `${m}unmap`;
  return 'nunmap';
}

function parseKeymapOpts(optsArg: LuaValue | undefined): { noremap: boolean; modifiers: KeymapModifiers } {
  let noremap = true;
  const modifiers: KeymapModifiers = {};
  if (optsArg && isLuaTable(optsArg)) {
    if (optsArg.map.remap === true) noremap = false;
    if (optsArg.map.noremap === false) noremap = false;
    if (optsArg.map.noremap === true) noremap = true;
    if (optsArg.map.silent === true) modifiers.silent = true;
    if (optsArg.map.expr === true) modifiers.expr = true;
    if (optsArg.map.nowait === true) modifiers.nowait = true;
    if (optsArg.map.unique === true) modifiers.unique = true;
    if (optsArg.map.buffer === true || typeof optsArg.map.buffer === 'number') modifiers.buffer = true;
  }
  return { noremap, modifiers };
}

function invokeLuaRef(rt: LuaRuntime, path: string, args: LuaValue[]): LuaValue {
  // 최상위 Lua 표준 함수
  if (path === 'print') {
    emitOutput(rt, args.map((a) => formatLuaValue(a)).join('\t'));
    return null;
  }
  if (path === 'tostring') return formatLuaValue(args[0] ?? null);
  if (path === 'tonumber') {
    const raw = args[0] ?? null;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const n = Number(raw.trim());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  if (path === 'type') {
    const v = args[0] ?? null;
    if (v === null) return 'nil';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (isLuaTable(v)) return 'table';
    return 'function';
  }

  // string.* / table.* / math.*
  if (path.startsWith('string.')) {
    const fn = path.slice('string.'.length);
    const s = formatLuaValue(args[0] ?? '');
    if (fn === 'upper') return s.toUpperCase();
    if (fn === 'lower') return s.toLowerCase();
    if (fn === 'len') return s.length;
    if (fn === 'rep') return s.repeat(Math.max(0, Math.trunc(toLuaNumber(args[1] ?? 1))));
    if (fn === 'sub') {
      const start = Math.trunc(toLuaNumber(args[1] ?? 1));
      const end = args[2] !== undefined ? Math.trunc(toLuaNumber(args[2])) : s.length;
      const sIdx = start < 0 ? Math.max(0, s.length + start) : Math.max(0, start - 1);
      const eIdx = end < 0 ? s.length + end + 1 : end;
      return s.slice(sIdx, Math.max(sIdx, eIdx));
    }
    if (fn === 'gsub') {
      const pat = formatLuaValue(args[1] ?? '');
      const rep = formatLuaValue(args[2] ?? '');
      return s.split(pat).join(rep);
    }
  }
  if (path.startsWith('table.')) {
    const fn = path.slice('table.'.length);
    const tbl = args[0];
    if (!tbl || !isLuaTable(tbl)) throw new Error(msg('Lua 오류: table.{fn}() 에는 테이블이 필요합니다', { fn }));
    if (fn === 'insert') {
      if (args.length >= 3) {
        const pos = Math.max(0, Math.trunc(toLuaNumber(args[1])) - 1);
        tbl.array.splice(pos, 0, args[2]);
      } else {
        tbl.array.push(args[1] ?? null);
      }
      return null;
    }
    if (fn === 'remove') {
      if (args.length >= 2) {
        const pos = Math.max(0, Math.trunc(toLuaNumber(args[1])) - 1);
        return tbl.array.splice(pos, 1)[0] ?? null;
      }
      return tbl.array.pop() ?? null;
    }
    if (fn === 'concat') {
      const sep = args[1] !== undefined ? formatLuaValue(args[1]) : '';
      return tbl.array.map((x) => formatLuaValue(x)).join(sep);
    }
  }
  if (path.startsWith('math.')) {
    const fn = path.slice('math.'.length);
    if (fn === 'abs') return Math.abs(toLuaNumber(args[0] ?? 0));
    if (fn === 'floor') return Math.floor(toLuaNumber(args[0] ?? 0));
    if (fn === 'ceil') return Math.ceil(toLuaNumber(args[0] ?? 0));
    if (fn === 'sqrt') return Math.sqrt(toLuaNumber(args[0] ?? 0));
    if (fn === 'pow') return Math.pow(toLuaNumber(args[0] ?? 0), toLuaNumber(args[1] ?? 1));
    if (fn === 'max') return Math.max(...args.map(toLuaNumber));
    if (fn === 'min') return Math.min(...args.map(toLuaNumber));
  }

  // vim.inspect / vim.notify / vim.tbl_* / vim.split / vim.trim / vim.startswith / vim.endswith
  if (path === 'vim.inspect') return formatLuaValue(args[0] ?? null, true);
  if (path === 'vim.notify') {
    emitOutput(rt, formatLuaValue(args[0] ?? ''));
    return null;
  }
  if (path === 'vim.trim') return formatLuaValue(args[0] ?? '').trim();
  if (path === 'vim.startswith') {
    return formatLuaValue(args[0] ?? '').startsWith(formatLuaValue(args[1] ?? ''));
  }
  if (path === 'vim.endswith') {
    return formatLuaValue(args[0] ?? '').endsWith(formatLuaValue(args[1] ?? ''));
  }
  if (path === 'vim.split') {
    const s = formatLuaValue(args[0] ?? '');
    const sep = formatLuaValue(args[1] ?? '');
    return makeTable(sep ? s.split(sep) : [...s]);
  }
  if (path === 'vim.tbl_contains') {
    const tbl = args[0];
    const target = args[1] ?? null;
    if (!tbl || !isLuaTable(tbl)) return false;
    return tbl.array.some((item) => item === target);
  }
  if (path === 'vim.tbl_keys') {
    const tbl = args[0];
    if (!tbl || !isLuaTable(tbl)) return makeTable();
    return makeTable(Object.keys(tbl.map));
  }
  if (path === 'vim.tbl_count') {
    const tbl = args[0];
    if (!tbl || !isLuaTable(tbl)) return 0;
    return tbl.array.length + Object.keys(tbl.map).length;
  }

  // vim.opt.<name>:{append,remove,prepend,get}()
  const optMethod = path.match(/^vim\.(opt|opt_local|opt_global)\.([A-Za-z_][A-Za-z0-9_]*)\.(append|remove|prepend|get)$/);
  if (optMethod) {
    const [, optScope, optName, method] = optMethod;
    const setScope = optScope === 'opt_local' ? 'local' : optScope === 'opt_global' ? 'global' : 'both';
    if (method === 'get') return getVimOption(rt, optName);
    const valStr = formatLuaValue(args[0] ?? '');
    const op = method === 'append' ? '+=' : method === 'remove' ? '-=' : '^=';
    rt.state = executeSetCommand(rt.state, `${optName}${op}${valStr}`, setScope);
    return null;
  }

  // vim.keymap.set / vim.keymap.del
  if (path === 'vim.keymap.set') {
    const modes = resolveKeymapModes(args[0] ?? 'n');
    const lhs = formatLuaValue(args[1] ?? '');
    const rhs = formatLuaValue(args[2] ?? '');
    const { noremap, modifiers } = parseKeymapOpts(args[3]);
    for (const m of modes) {
      rt.state = registerKeymap(rt.state, modeToMapCommand(m, noremap), lhs, rhs, modifiers);
    }
    return null;
  }
  if (path === 'vim.keymap.del') {
    const modes = resolveKeymapModes(args[0] ?? 'n');
    const lhs = formatLuaValue(args[1] ?? '');
    const { modifiers } = parseKeymapOpts(args[2]);
    for (const m of modes) {
      rt.state = unregisterKeymap(rt.state, modeToUnmapCommand(m), lhs, { buffer: modifiers.buffer });
    }
    return null;
  }

  // vim.cmd(...) / vim.cmd.<excmd>(arg)
  if (path === 'vim.cmd') {
    const script = formatLuaValue(args[0] ?? '');
    for (const rawLine of script.split('\n')) {
      const cmd = rawLine.trim().replace(/^:/, '');
      if (!cmd) continue;
      rt.state = rt.runEx(rt.state, cmd);
      if (rt.state.bell) {
        throw new Error(rt.state.commandMessage ?? msg('Lua 오류: vim.cmd 실행 실패: {cmd}', { cmd }));
      }
    }
    return null;
  }
  if (path.startsWith('vim.cmd.')) {
    const cmdName = path.slice('vim.cmd.'.length);
    const argStr = args.map((a) => formatLuaValue(a)).join(' ').trim();
    const fullCmd = argStr ? `${cmdName} ${argStr}` : cmdName;
    rt.state = rt.runEx(rt.state, fullCmd);
    if (rt.state.bell) {
      throw new Error(rt.state.commandMessage ?? msg('Lua 오류: vim.cmd 실행 실패: {cmd}', { cmd: fullCmd }));
    }
    return null;
  }

  // vim.fn.<name>(...)
  if (path.startsWith('vim.fn.')) {
    const fnName = path.slice('vim.fn.'.length);
    const argExprs = args.map(toVimLiteral).join(', ');
    const ctx: EvalContext = {
      state: rt.state,
      runEx: rt.runEx,
      callUserFunction: (c, n, a) => {
        const r = callUserFunction(c.state, n, a, rt.runEx);
        c.state = r.state;
        if (r.error) throw new VimScriptError(r.error);
        return r.value;
      },
    };
    const res = evaluateVimScript(`${fnName}(${argExprs})`, ctx);
    rt.state = ctx.state;
    return vimScriptToLua(res);
  }

  // vim.api.*
  if (path.startsWith('vim.api.')) {
    const apiName = path.slice('vim.api.'.length);
    if (apiName === 'nvim_get_current_line') {
      return rt.state.lines[rt.state.cursor.line] ?? '';
    }
    if (apiName === 'nvim_set_current_line') {
      const nextLine = formatLuaValue(args[0] ?? '');
      const withUndo = pushUndoSnapshot(rt.state);
      const nextLines = [...rt.state.lines];
      nextLines[rt.state.cursor.line] = nextLine;
      rt.state = {
        ...withUndo,
        lines: nextLines,
        cursor: clampCursor(nextLines, rt.state.cursor, rt.state.mode),
      };
      return null;
    }
    if (apiName === 'nvim_buf_line_count') {
      return rt.state.lines.length;
    }
    if (apiName === 'nvim_buf_get_name') {
      return rt.state.primaryFilename ?? '';
    }
    if (apiName === 'nvim_buf_get_lines') {
      const total = rt.state.lines.length;
      let start = Math.trunc(toLuaNumber(args[1] ?? 0));
      let end = Math.trunc(toLuaNumber(args[2] ?? -1));
      if (start < 0) start = Math.max(0, total + start + 1);
      if (end < 0) end = total + end + 1;
      return makeTable(rt.state.lines.slice(Math.max(0, start), Math.min(total, end)));
    }
    if (apiName === 'nvim_buf_set_lines') {
      const total = rt.state.lines.length;
      let start = Math.trunc(toLuaNumber(args[1] ?? 0));
      let end = Math.trunc(toLuaNumber(args[2] ?? -1));
      const repArg = args[4];
      const replacement = repArg && isLuaTable(repArg) ? repArg.array.map((x) => formatLuaValue(x)) : [];
      if (start < 0) start = Math.max(0, total + start + 1);
      if (end < 0) end = total + end + 1;
      const withUndo = pushUndoSnapshot(rt.state);
      let nextLines = [
        ...rt.state.lines.slice(0, Math.max(0, start)),
        ...replacement,
        ...rt.state.lines.slice(Math.min(total, end)),
      ];
      if (nextLines.length === 0) nextLines = [''];
      rt.state = {
        ...withUndo,
        lines: nextLines,
        cursor: clampCursor(nextLines, rt.state.cursor, rt.state.mode),
      };
      return null;
    }
    if (apiName === 'nvim_win_get_cursor') {
      return makeTable([rt.state.cursor.line + 1, rt.state.cursor.col]);
    }
    if (apiName === 'nvim_win_set_cursor') {
      const posTbl = args[1];
      if (!posTbl || !isLuaTable(posTbl) || posTbl.array.length < 2) {
        throw new Error(msg('Lua 오류: nvim_win_set_cursor 에는 {row, col} 테이블이 필요합니다'));
      }
      const row = Math.max(0, Math.trunc(toLuaNumber(posTbl.array[0])) - 1);
      const col = Math.max(0, Math.trunc(toLuaNumber(posTbl.array[1])));
      rt.state = {
        ...rt.state,
        cursor: clampCursor(rt.state.lines, { line: row, col }, rt.state.mode),
      };
      return null;
    }
    if (apiName === 'nvim_set_keymap') {
      const mode = formatLuaValue(args[0] ?? 'n');
      const lhs = formatLuaValue(args[1] ?? '');
      const rhs = formatLuaValue(args[2] ?? '');
      const { noremap, modifiers } = parseKeymapOpts(args[3]);
      rt.state = registerKeymap(rt.state, modeToMapCommand(mode, noremap), lhs, rhs, modifiers);
      return null;
    }
    if (apiName === 'nvim_del_keymap') {
      const mode = formatLuaValue(args[0] ?? 'n');
      const lhs = formatLuaValue(args[1] ?? '');
      rt.state = unregisterKeymap(rt.state, modeToUnmapCommand(mode), lhs);
      return null;
    }
    if (apiName === 'nvim_command' || apiName === 'nvim_exec2') {
      return invokeLuaRef(rt, 'vim.cmd', [args[0] ?? '']);
    }
    if (apiName === 'nvim_echo') {
      const chunks = args[0];
      if (chunks && isLuaTable(chunks)) {
        const text = chunks.array
          .map((c) => (isLuaTable(c) ? formatLuaValue(c.array[0] ?? '') : formatLuaValue(c)))
          .join('');
        emitOutput(rt, text);
      }
      return null;
    }
  }

  throw new Error(msg('Lua 오류: 알 수 없는 함수입니다: {path}', { path }));
}

function readMember(rt: LuaRuntime, obj: LuaValue, key: string): LuaValue {
  if (isLuaRef(obj)) {
    const nextPath = `${obj.path}.${key}`;
    if (obj.path === 'vim.o' || obj.path === 'vim.bo' || obj.path === 'vim.wo') {
      return getVimOption(rt, key);
    }
    if (obj.path === 'vim.g') return readScopeVar(rt, 'g', key);
    if (obj.path === 'vim.b') return readScopeVar(rt, 'b', key);
    if (obj.path === 'vim.w') return readScopeVar(rt, 'w', key);
    if (obj.path === 'vim.t') return readScopeVar(rt, 't', key);
    return makeRef(nextPath);
  }
  if (isLuaTable(obj)) {
    return key in obj.map ? obj.map[key] : null;
  }
  return null;
}

function writeMember(rt: LuaRuntime, obj: LuaValue, key: string, value: LuaValue): void {
  if (isLuaRef(obj)) {
    if (obj.path === 'vim.opt' || obj.path === 'vim.opt_global') {
      setVimOption(rt, 'opt', key, value);
      return;
    }
    if (obj.path === 'vim.opt_local' || obj.path === 'vim.bo') {
      setVimOption(rt, 'bo', key, value);
      return;
    }
    if (obj.path === 'vim.wo') {
      setVimOption(rt, 'wo', key, value);
      return;
    }
    if (obj.path === 'vim.o') {
      setVimOption(rt, 'o', key, value);
      return;
    }
    if (obj.path === 'vim.g') {
      writeScopeVar(rt, 'g', key, value);
      return;
    }
    if (obj.path === 'vim.b') {
      writeScopeVar(rt, 'b', key, value);
      return;
    }
    if (obj.path === 'vim.w') {
      writeScopeVar(rt, 'w', key, value);
      return;
    }
    if (obj.path === 'vim.t') {
      writeScopeVar(rt, 't', key, value);
      return;
    }
    throw new Error(msg('Lua 오류: 대입할 수 없는 대상입니다: {path}', { path: `${obj.path}.${key}` }));
  }
  if (isLuaTable(obj)) {
    obj.map[key] = value;
    return;
  }
  throw new Error(msg('Lua 오류: 테이블이 아닌 값에 필드를 대입할 수 없습니다'));
}

// ---------------------------------------------------------------------------
// 재귀 하강 파서 + 인터프리터
// ---------------------------------------------------------------------------

class LuaInterpreter {
  private pos = 0;
  private loopCount = 0;

  constructor(private tokens: LuaToken[], private rt: LuaRuntime) {}

  private peek(offset = 0): LuaToken {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === v;
  }

  private isKw(v: string): boolean {
    const t = this.peek();
    return t.type === 'ident' && t.value === v;
  }

  private expectOp(v: string): void {
    if (!this.isOp(v)) {
      throw new Error(msg('Lua 구문 오류: "{expected}" 이(가) 필요합니다', { expected: v }));
    }
    this.pos++;
  }

  private expectKw(v: string): void {
    if (!this.isKw(v)) {
      throw new Error(msg('Lua 구문 오류: "{expected}" 키워드가 필요합니다', { expected: v }));
    }
    this.pos++;
  }

  private expectIdent(): string {
    const t = this.peek();
    if (t.type !== 'ident') {
      throw new Error(msg('Lua 구문 오류: 식별자가 필요합니다'));
    }
    this.pos++;
    return String(t.value);
  }

  runBlock(stopKeywords: string[] = []): 'normal' | 'break' | 'return' {
    while (this.peek().type !== 'eof') {
      if (this.isOp(';')) {
        this.pos++;
        continue;
      }
      if (stopKeywords.some((kw) => this.isKw(kw))) {
        return 'normal';
      }
      const res = this.runStatement();
      if (res !== 'normal') return res;
    }
    return 'normal';
  }

  private skipBlock(stopKeywords: string[]): void {
    let depth = 0;
    while (this.peek().type !== 'eof') {
      if (depth === 0 && stopKeywords.some((kw) => this.isKw(kw))) return;
      if (this.isKw('if') || this.isKw('for') || this.isKw('while')) {
        depth++;
      } else if (this.isKw('end')) {
        if (depth === 0) return;
        depth--;
      }
      this.pos++;
    }
  }

  private runStatement(): 'normal' | 'break' | 'return' {
    if (this.isKw('local')) {
      this.pos++;
      const names = [this.expectIdent()];
      while (this.isOp(',')) {
        this.pos++;
        names.push(this.expectIdent());
      }
      const vals: LuaValue[] = [];
      if (this.isOp('=')) {
        this.pos++;
        vals.push(this.parseExpr());
        while (this.isOp(',')) {
          this.pos++;
          vals.push(this.parseExpr());
        }
      }
      names.forEach((n, idx) => writeEnvVar(this.rt, n, vals[idx] ?? null, true));
      return 'normal';
    }

    if (this.isKw('if')) {
      this.pos++;
      let taken = false;
      const cond = this.parseExpr();
      this.expectKw('then');
      if (isLuaTruthy(cond)) {
        taken = true;
        this.rt.scopes.push({});
        const res = this.runBlock(['elseif', 'else', 'end']);
        this.rt.scopes.pop();
        if (res !== 'normal') {
          this.skipBlock(['end']);
          if (this.isKw('end')) this.pos++;
          return res;
        }
      } else {
        this.skipBlock(['elseif', 'else', 'end']);
      }
      while (this.isKw('elseif')) {
        this.pos++;
        if (taken) {
          this.skipBlock(['elseif', 'else', 'end']);
        } else {
          const c2 = this.parseExpr();
          this.expectKw('then');
          if (isLuaTruthy(c2)) {
            taken = true;
            this.rt.scopes.push({});
            const res = this.runBlock(['elseif', 'else', 'end']);
            this.rt.scopes.pop();
            if (res !== 'normal') {
              this.skipBlock(['end']);
              if (this.isKw('end')) this.pos++;
              return res;
            }
          } else {
            this.skipBlock(['elseif', 'else', 'end']);
          }
        }
      }
      if (this.isKw('else')) {
        this.pos++;
        if (!taken) {
          this.rt.scopes.push({});
          const res = this.runBlock(['end']);
          this.rt.scopes.pop();
          if (res !== 'normal') {
            this.skipBlock(['end']);
            if (this.isKw('end')) this.pos++;
            return res;
          }
        } else {
          this.skipBlock(['end']);
        }
      }
      this.expectKw('end');
      return 'normal';
    }

    if (this.isKw('for')) {
      this.pos++;
      const firstVar = this.expectIdent();
      if (this.isOp('=')) {
        this.pos++;
        const start = toLuaNumber(this.parseExpr());
        this.expectOp(',');
        const stop = toLuaNumber(this.parseExpr());
        let step = 1;
        if (this.isOp(',')) {
          this.pos++;
          step = toLuaNumber(this.parseExpr());
        }
        this.expectKw('do');
        const bodyStart = this.pos;
        this.skipBlock(['end']);
        const bodyEnd = this.pos;
        this.expectKw('end');
        const afterLoop = this.pos;

        for (let i = start; step > 0 ? i <= stop : i >= stop; i += step) {
          if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
          this.pos = bodyStart;
          this.rt.scopes.push({ [firstVar]: i });
          const res = this.runBlock(['end']);
          this.rt.scopes.pop();
          if (res === 'break') break;
          if (res === 'return') {
            this.pos = afterLoop;
            return 'return';
          }
          if (this.pos > bodyEnd) break;
        }
        this.pos = afterLoop;
        return 'normal';
      }

      // Generic for: for k, v in ipairs(t) / pairs(t) do ... end
      const vars = [firstVar];
      while (this.isOp(',')) {
        this.pos++;
        vars.push(this.expectIdent());
      }
      this.expectKw('in');
      const iterName = this.expectIdent();
      this.expectOp('(');
      const targetTbl = this.parseExpr();
      this.expectOp(')');
      this.expectKw('do');
      const bodyStart = this.pos;
      this.skipBlock(['end']);
      this.expectKw('end');
      const afterLoop = this.pos;

      const entries: Array<[LuaValue, LuaValue]> = [];
      if (isLuaTable(targetTbl)) {
        if (iterName === 'ipairs') {
          targetTbl.array.forEach((v, idx) => entries.push([idx + 1, v]));
        } else {
          targetTbl.array.forEach((v, idx) => entries.push([idx + 1, v]));
          for (const [k, v] of Object.entries(targetTbl.map)) entries.push([k, v]);
        }
      }

      for (const [k, v] of entries) {
        if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
        this.pos = bodyStart;
        const scope: Record<string, LuaValue> = {};
        if (vars[0]) scope[vars[0]] = k;
        if (vars[1]) scope[vars[1]] = v;
        this.rt.scopes.push(scope);
        const res = this.runBlock(['end']);
        this.rt.scopes.pop();
        if (res === 'break') break;
        if (res === 'return') {
          this.pos = afterLoop;
          return 'return';
        }
      }
      this.pos = afterLoop;
      return 'normal';
    }

    if (this.isKw('while')) {
      this.pos++;
      const condStart = this.pos;
      this.skipBlock(['do']);
      this.expectKw('do');
      const bodyStart = this.pos;
      this.skipBlock(['end']);
      this.expectKw('end');
      const afterLoop = this.pos;

      for (;;) {
        if (++this.loopCount > MAX_LUA_LOOP) throw new Error(msg('Lua 오류: 반복 횟수 제한을 초과했습니다'));
        this.pos = condStart;
        const cond = this.parseExpr();
        if (!isLuaTruthy(cond)) break;
        this.pos = bodyStart;
        this.rt.scopes.push({});
        const res = this.runBlock(['end']);
        this.rt.scopes.pop();
        if (res === 'break') break;
        if (res === 'return') {
          this.pos = afterLoop;
          return 'return';
        }
      }
      this.pos = afterLoop;
      return 'normal';
    }

    if (this.isKw('break')) {
      this.pos++;
      return 'break';
    }
    if (this.isKw('return')) {
      this.pos++;
      if (this.peek().type !== 'eof' && !this.isKw('end') && !this.isKw('else') && !this.isKw('elseif') && !this.isOp(';')) {
        this.parseExpr();
      }
      return 'return';
    }

    // 대입 또는 함수/메서드 호출
    const startPos = this.pos;
    const lhs = this.parseLhsOrCall();
    if (this.isOp('=')) {
      this.pos++;
      const val = this.parseExpr();
      lhs.assign(val);
      return 'normal';
    }
    if (!lhs.wasCall) {
      throw new Error(msg('Lua 구문 오류: 유효하지 않은 문장입니다 (위치 {pos})', { pos: startPos }));
    }
    return 'normal';
  }

  private parseLhsOrCall(): { assign: (v: LuaValue) => void; wasCall: boolean } {
    const rootName = this.expectIdent();
    let curVal: LuaValue = readEnvVar(this.rt, rootName);
    let assignFn: ((v: LuaValue) => void) | null = (v) => writeEnvVar(this.rt, rootName, v, false);
    let wasCall = false;

    for (;;) {
      if (this.isOp('.')) {
        this.pos++;
        const prop = this.expectIdent();
        const parentObj = curVal;
        curVal = readMember(this.rt, parentObj, prop);
        assignFn = (v) => writeMember(this.rt, parentObj, prop, v);
        wasCall = false;
      } else if (this.isOp('[')) {
        this.pos++;
        const keyVal = this.parseExpr();
        this.expectOp(']');
        const parentObj = curVal;
        if (isLuaTable(parentObj)) {
          if (typeof keyVal === 'number' && Number.isInteger(keyVal) && keyVal >= 1) {
            curVal = parentObj.array[keyVal - 1] ?? null;
            assignFn = (v) => {
              parentObj.array[keyVal - 1] = v;
            };
          } else {
            const kStr = formatLuaValue(keyVal);
            curVal = parentObj.map[kStr] ?? null;
            assignFn = (v) => {
              parentObj.map[kStr] = v;
            };
          }
        } else {
          curVal = readMember(this.rt, parentObj, formatLuaValue(keyVal));
          assignFn = (v) => writeMember(this.rt, parentObj, formatLuaValue(keyVal), v);
        }
        wasCall = false;
      } else if (this.isOp(':')) {
        this.pos++;
        const method = this.expectIdent();
        const args = this.parseCallArgs();
        if (isLuaRef(curVal)) {
          curVal = invokeLuaRef(this.rt, `${curVal.path}.${method}`, args);
        } else if (typeof curVal === 'string') {
          curVal = invokeLuaRef(this.rt, `string.${method}`, [curVal, ...args]);
        } else {
          throw new Error(msg('Lua 오류: 메서드 호출 대상이 유효하지 않습니다: {method}', { method }));
        }
        assignFn = null;
        wasCall = true;
      } else if (this.isOp('(') || this.peek().type === 'str' || this.isOp('{')) {
        const args = this.parseCallArgs();
        if (!isLuaRef(curVal)) {
          throw new Error(msg('Lua 오류: 호출할 수 없는 값입니다: {v}', { v: formatLuaValue(curVal) }));
        }
        curVal = invokeLuaRef(this.rt, curVal.path, args);
        assignFn = null;
        wasCall = true;
      } else {
        break;
      }
    }

    return {
      wasCall,
      assign: (v) => {
        if (!assignFn) throw new Error(msg('Lua 구문 오류: 대입할 수 없는 좌변입니다'));
        assignFn(v);
      },
    };
  }

  private parseCallArgs(): LuaValue[] {
    if (this.peek().type === 'str') {
      const s = String(this.peek().value);
      this.pos++;
      return [s];
    }
    if (this.isOp('{')) {
      return [this.parseTable()];
    }
    this.expectOp('(');
    const args: LuaValue[] = [];
    if (!this.isOp(')')) {
      args.push(this.parseExpr());
      while (this.isOp(',')) {
        this.pos++;
        if (this.isOp(')')) break;
        args.push(this.parseExpr());
      }
    }
    this.expectOp(')');
    return args;
  }

  parseExpr(): LuaValue {
    return this.parseOr();
  }

  private parseOr(): LuaValue {
    let left = this.parseAnd();
    while (this.isKw('or')) {
      this.pos++;
      const right = this.parseAnd();
      left = isLuaTruthy(left) ? left : right;
    }
    return left;
  }

  private parseAnd(): LuaValue {
    let left = this.parseCompare();
    while (this.isKw('and')) {
      this.pos++;
      const right = this.parseCompare();
      left = isLuaTruthy(left) ? right : left;
    }
    return left;
  }

  private parseCompare(): LuaValue {
    let left = this.parseConcat();
    while (
      this.isOp('==') ||
      this.isOp('~=') ||
      this.isOp('<') ||
      this.isOp('<=') ||
      this.isOp('>') ||
      this.isOp('>=')
    ) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseConcat();
      if (op === '==') left = left === right;
      else if (op === '~=') left = left !== right;
      else if (op === '<') left = toLuaNumber(left) < toLuaNumber(right);
      else if (op === '<=') left = toLuaNumber(left) <= toLuaNumber(right);
      else if (op === '>') left = toLuaNumber(left) > toLuaNumber(right);
      else left = toLuaNumber(left) >= toLuaNumber(right);
    }
    return left;
  }

  private parseConcat(): LuaValue {
    let left = this.parseAdditive();
    while (this.isOp('..')) {
      this.pos++;
      const right = this.parseAdditive();
      left = formatLuaValue(left) + formatLuaValue(right);
    }
    return left;
  }

  private parseAdditive(): LuaValue {
    let left = this.parseMultiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseMultiplicative();
      left = op === '+' ? toLuaNumber(left) + toLuaNumber(right) : toLuaNumber(left) - toLuaNumber(right);
    }
    return left;
  }

  private parseMultiplicative(): LuaValue {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = String(this.peek().value);
      this.pos++;
      const right = this.parseUnary();
      const l = toLuaNumber(left);
      const r = toLuaNumber(right);
      if (op === '*') left = l * r;
      else if (op === '/') left = r === 0 ? NaN : l / r;
      else left = r === 0 ? NaN : l % r;
    }
    return left;
  }

  private parseUnary(): LuaValue {
    if (this.isKw('not')) {
      this.pos++;
      return !isLuaTruthy(this.parseUnary());
    }
    if (this.isOp('-')) {
      this.pos++;
      return -toLuaNumber(this.parseUnary());
    }
    if (this.isOp('#')) {
      this.pos++;
      const v = this.parseUnary();
      if (typeof v === 'string') return v.length;
      if (isLuaTable(v)) return v.array.length;
      return 0;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): LuaValue {
    let val = this.parsePrimary();
    for (;;) {
      if (this.isOp('.')) {
        this.pos++;
        const prop = this.expectIdent();
        val = readMember(this.rt, val, prop);
      } else if (this.isOp('[')) {
        this.pos++;
        const keyVal = this.parseExpr();
        this.expectOp(']');
        if (isLuaTable(val)) {
          if (typeof keyVal === 'number' && Number.isInteger(keyVal) && keyVal >= 1) {
            val = val.array[keyVal - 1] ?? null;
          } else {
            val = val.map[formatLuaValue(keyVal)] ?? null;
          }
        } else {
          val = readMember(this.rt, val, formatLuaValue(keyVal));
        }
      } else if (this.isOp(':')) {
        this.pos++;
        const method = this.expectIdent();
        const args = this.parseCallArgs();
        if (isLuaRef(val)) {
          val = invokeLuaRef(this.rt, `${val.path}.${method}`, args);
        } else if (typeof val === 'string') {
          val = invokeLuaRef(this.rt, `string.${method}`, [val, ...args]);
        } else {
          throw new Error(msg('Lua 오류: 메서드 호출 대상이 유효하지 않습니다: {method}', { method }));
        }
      } else if (this.isOp('(') || this.peek().type === 'str' || this.isOp('{')) {
        const args = this.parseCallArgs();
        if (!isLuaRef(val)) {
          throw new Error(msg('Lua 오류: 호출할 수 없는 값입니다: {v}', { v: formatLuaValue(val) }));
        }
        val = invokeLuaRef(this.rt, val.path, args);
      } else {
        return val;
      }
    }
  }

  private parseTable(): LuaTable {
    this.expectOp('{');
    const array: LuaValue[] = [];
    const map: Record<string, LuaValue> = {};
    while (!this.isOp('}') && this.peek().type !== 'eof') {
      if (this.peek().type === 'ident' && this.peek(1).type === 'op' && this.peek(1).value === '=') {
        const k = this.expectIdent();
        this.pos++;
        map[k] = this.parseExpr();
      } else if (this.isOp('[')) {
        this.pos++;
        const k = this.parseExpr();
        this.expectOp(']');
        this.expectOp('=');
        map[formatLuaValue(k)] = this.parseExpr();
      } else {
        array.push(this.parseExpr());
      }
      if (this.isOp(',') || this.isOp(';')) {
        this.pos++;
      } else {
        break;
      }
    }
    this.expectOp('}');
    return makeTable(array, map);
  }

  private parsePrimary(): LuaValue {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'str') {
      this.pos++;
      return t.value;
    }
    if (t.type === 'ident') {
      if (t.value === 'true') {
        this.pos++;
        return true;
      }
      if (t.value === 'false') {
        this.pos++;
        return false;
      }
      if (t.value === 'nil') {
        this.pos++;
        return null;
      }
      this.pos++;
      return readEnvVar(this.rt, String(t.value));
    }
    if (this.isOp('{')) {
      return this.parseTable();
    }
    if (this.isOp('(')) {
      this.pos++;
      const v = this.parseExpr();
      this.expectOp(')');
      return v;
    }
    throw new Error(msg('Lua 구문 오류: 예상치 못한 토큰입니다: {tok}', { tok: String(t.value) || 'EOF' }));
  }
}

// ---------------------------------------------------------------------------
// 공개 진입점
// ---------------------------------------------------------------------------

/**
 * `:lua {code}` Lua 코드 청크를 실행합니다.
 */
export function executeLuaChunk(
  state: VimEditorState,
  code: string,
  runEx: ExRunner
): VimEditorState {
  const trimmed = code.trim();
  if (!trimmed) return state;

  const rt: LuaRuntime = {
    state,
    runEx,
    outputs: [],
    scopes: [{}],
    globals: {},
  };

  try {
    const tokens = tokenizeLua(trimmed);
    const interp = new LuaInterpreter(tokens, rt);
    interp.runBlock();
    return {
      ...rt.state,
      ...(rt.outputs.length > 0 ? { commandMessage: rt.outputs.join('\n') } : {}),
    };
  } catch (err) {
    return {
      ...rt.state,
      bell: true,
      commandMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `:= {expr}` (Neovim 단축 표현식 평가 출력)
 */
export function executeLuaPrintExpr(
  state: VimEditorState,
  expr: string,
  runEx: ExRunner
): VimEditorState {
  const trimmed = expr.trim();
  if (!trimmed) return state;

  const rt: LuaRuntime = {
    state,
    runEx,
    outputs: [],
    scopes: [{}],
    globals: {},
  };

  try {
    const tokens = tokenizeLua(trimmed);
    const interp = new LuaInterpreter(tokens, rt);
    const val = interp.parseExpr();
    emitOutput(rt, formatLuaValue(val, true));
    return rt.state;
  } catch (err) {
    return {
      ...rt.state,
      bell: true,
      commandMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `:luafile {file}` 또는 `:source init.lua` 로 Lua 스크립트 파일을 실행합니다.
 */
export function executeLuaFile(
  state: VimEditorState,
  targetFile: string,
  runEx: ExRunner
): VimEditorState {
  const target = targetFile.trim();
  let linesToRun: string[] | null = null;
  let sourceName = target || '%';

  if (target === '%' || target === '' || target === state.primaryFilename) {
    linesToRun = [...state.lines];
    sourceName = state.primaryFilename ?? '%';
  } else {
    const foundBuf = state.buffers?.find((b) => b.name === target || b.name.endsWith(target));
    if (foundBuf) {
      linesToRun = [...foundBuf.lines];
      sourceName = foundBuf.name;
    } else {
      const vfsLines = getVfsFile(state.netrw?.files, target, state.virtualFiles);
      if (vfsLines) {
        linesToRun = [...vfsLines];
        sourceName = target;
      }
    }
  }

  if (!linesToRun) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('E484: 파일을 열 수 없습니다: "{target}"', { target }),
    };
  }

  const res = executeLuaChunk(state, linesToRun.join('\n'), runEx);
  if (res.bell) return res;
  return {
    ...res,
    commandMessage: res.commandMessage ?? msg('[Lua] "{sourceName}" 실행 완료', { sourceName }),
  };
}
