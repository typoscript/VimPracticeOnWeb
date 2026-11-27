/**
 * Neovim Lua 미니 런타임: 실행 컨텍스트, vim.* 환경 변수·옵션·키매핑 헬퍼와 내장 함수 호출 (luaEngine.ts 에서 분리)
 */
import { VimEditorState } from './types';
import { clampCursor } from './cursor';
import { pushUndoSnapshot } from './operators';
import { executeSetCommand } from './setEngine';
import { readOptionForScript } from './setOptionsCore';
import { registerKeymap, unregisterKeymap, KeymapModifiers } from './keymapEngine';
import { appendRedirText, EvalContext, VimScriptError } from './vimscriptValues';
import { evaluateVimScript } from './vimscriptEval';
import { callUserFunction, ExRunner } from './vimscriptEngine';
import { msg } from './messages';
import { LuaValue, makeTable, makeRef, isLuaTable, isLuaRef, toLuaNumber, formatLuaValue, luaToVimScript, vimScriptToLua, toVimLiteral } from './luaValues';

// ---------------------------------------------------------------------------
// AST / 파서 & 실행 컨텍스트
// ---------------------------------------------------------------------------

export interface LuaRuntime {
  state: VimEditorState;
  runEx: ExRunner;
  outputs: string[];
  scopes: Array<Record<string, LuaValue>>;
  globals: Record<string, LuaValue>;
}

export const MAX_LUA_LOOP = 5000;

export function readEnvVar(rt: LuaRuntime, name: string): LuaValue {
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

export function writeEnvVar(rt: LuaRuntime, name: string, value: LuaValue, isLocal: boolean): void {
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

export function emitOutput(rt: LuaRuntime, text: string): void {
  rt.outputs.push(text);
  const nextHistory = [...(rt.state.messageHistory ?? []), text].slice(-200);
  let nextState: VimEditorState = { ...rt.state, commandMessage: text, messageHistory: nextHistory };
  if (nextState.redirSession) nextState = appendRedirText(nextState, text);
  rt.state = nextState;
}

export function setVimOption(rt: LuaRuntime, scope: 'opt' | 'o' | 'bo' | 'wo', optName: string, val: LuaValue): void {
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

export function getVimOption(rt: LuaRuntime, optName: string): LuaValue {
  const val = readOptionForScript(rt.state, `&${optName}`);
  if (val === null) return null;
  return vimScriptToLua(val);
}

export function readScopeVar(rt: LuaRuntime, scope: 'g' | 'b' | 'w' | 't', key: string): LuaValue {
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

export function writeScopeVar(rt: LuaRuntime, scope: 'g' | 'b' | 'w' | 't', key: string, val: LuaValue): void {
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

export function resolveKeymapModes(modeArg: LuaValue): string[] {
  if (typeof modeArg === 'string') return [modeArg];
  if (isLuaTable(modeArg)) {
    return modeArg.array.map((m) => formatLuaValue(m));
  }
  return ['n'];
}

export function modeToMapCommand(mode: string, noremap: boolean): string {
  const m = mode.toLowerCase();
  if (m === '' || m === 'all') return noremap ? 'noremap' : 'map';
  if (m === '!') return noremap ? 'noremap!' : 'map!';
  if ('nivxsoc'.includes(m)) return noremap ? `${m}noremap` : `${m}map`;
  return noremap ? 'nnoremap' : 'nmap';
}

export function modeToUnmapCommand(mode: string): string {
  const m = mode.toLowerCase();
  if (m === '' || m === 'all') return 'unmap';
  if (m === '!') return 'unmap!';
  if ('nivxsoc'.includes(m)) return `${m}unmap`;
  return 'nunmap';
}

export function parseKeymapOpts(optsArg: LuaValue | undefined): { noremap: boolean; modifiers: KeymapModifiers } {
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

export function invokeLuaRef(rt: LuaRuntime, path: string, args: LuaValue[]): LuaValue {
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

  // vim.snippets.add(trigger, body, description?) / remove(trigger) / clear() / list()
  if (path === 'vim.snippets.add') {
    const trigger = formatLuaValue(args[0] ?? '').trim();
    if (!trigger || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trigger)) {
      throw new Error(msg('Lua 오류: 유효한 스니펫 트리거 이름이 필요합니다: {trigger}', { trigger }));
    }
    const bodyArg = args[1];
    let body: string[] = [];
    if (bodyArg && isLuaTable(bodyArg)) {
      body = bodyArg.array.map((line) => formatLuaValue(line));
    } else if (typeof bodyArg === 'string') {
      body = bodyArg.replace(/\r\n/g, '\n').split('\n');
    }
    if (body.length === 0) {
      throw new Error(msg('Lua 오류: 스니펫 본문(문자열 또는 문자열 테이블)이 필요합니다'));
    }
    const description = args[2] ? formatLuaValue(args[2]) : 'custom snippet';
    const prev = rt.state.customSnippets ?? [];
    const next = [
      { trigger, description, body },
      ...prev.filter((s) => s.trigger !== trigger),
    ];
    rt.state = {
      ...rt.state,
      customSnippets: next,
    };
    return null;
  }
  if (path === 'vim.snippets.remove') {
    const trigger = formatLuaValue(args[0] ?? '').trim();
    const prev = rt.state.customSnippets ?? [];
    rt.state = {
      ...rt.state,
      customSnippets: prev.filter((s) => s.trigger !== trigger),
    };
    return null;
  }
  if (path === 'vim.snippets.clear') {
    rt.state = {
      ...rt.state,
      customSnippets: [],
    };
    return null;
  }
  if (path === 'vim.snippets.list') {
    return makeTable((rt.state.customSnippets ?? []).map((s) => s.trigger));
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

export function readMember(rt: LuaRuntime, obj: LuaValue, key: string): LuaValue {
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

export function writeMember(rt: LuaRuntime, obj: LuaValue, key: string, value: LuaValue): void {
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
