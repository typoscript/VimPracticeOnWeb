import { VimEditorState, VimScriptValue } from './types';
import { msg } from './messages';
import {
  VimScriptError,
  EvalContext,
  isList,
  isFuncref,
  makeDict,
  toNumber,
  toVimString,
  isTruthy,
  compileVimPattern,
  applyPathModifiers,
} from './vimscriptValues';
import {
  buildVfsMap,
  getAvailableDirectories,
  getEffectiveCwd,
  getVfsFile,
} from './vfs';

export interface ExtraBuiltin {
  min: number;
  max: number;
  fn: (ctx: EvalContext, args: VimScriptValue[]) => VimScriptValue;
}

function resolveBuffer(state: VimEditorState, expr: VimScriptValue | undefined): { id: number; name: string } | null {
  const curId = state.currentBufferId ?? 1;
  const curName = state.primaryFilename ?? '';
  const list = state.buffers && state.buffers.length > 0
    ? state.buffers
    : [{ id: curId, name: curName }];

  if (expr === undefined || expr === '%') {
    return { id: curId, name: curName };
  }
  if (expr === '#') {
    const altId = state.alternateBufferId;
    if (!altId) return null;
    const found = list.find((b) => b.id === altId);
    return found ? { id: found.id, name: found.name } : { id: altId, name: state.secondaryFilename ?? '' };
  }
  if (expr === '$') {
    const maxId = Math.max(...list.map((b) => b.id));
    const found = list.find((b) => b.id === maxId);
    return found ? { id: found.id, name: found.name } : null;
  }
  if (typeof expr === 'number') {
    const found = list.find((b) => b.id === expr);
    return found ? { id: found.id, name: found.name } : null;
  }
  const needle = toVimString(expr);
  if (needle === '') return { id: curId, name: curName };
  const exact = list.find((b) => b.name === needle);
  if (exact) return { id: exact.id, name: exact.name };
  const partial = list.find((b) => b.name.includes(needle));
  return partial ? { id: partial.id, name: partial.name } : null;
}

function normalizeVfsLookupKey(state: VimEditorState, raw: string): string {
  const cwdPrefix = `${getEffectiveCwd(state).replace(/\/$/, '')}/`;
  let key = raw.trim();
  if (key.startsWith(cwdPrefix)) key = key.slice(cwdPrefix.length);
  if (key.startsWith('./')) key = key.slice(2);
  return key;
}

function lookupVfsLines(state: VimEditorState, rawPath: string): string[] | undefined {
  const norm = normalizeVfsLookupKey(state, rawPath);
  const direct = getVfsFile(state.netrw?.files, rawPath, state.virtualFiles)
    ?? getVfsFile(state.netrw?.files, norm, state.virtualFiles);
  if (direct) return direct;
  const vfs = buildVfsMap(state);
  return vfs[rawPath] ?? vfs[norm];
}

function globToRegex(pat: string): RegExp {
  let out = '^';
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '*') {
      if (pat[i + 1] === '*') {
        out += '.*';
        i++;
        if (pat[i + 1] === '/') i++;
        out += '(?:.*/)?';
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${out}$`);
}

function executeBufferSearch(
  ctx: EvalContext,
  pattern: string,
  flagsStr: string,
  stopline: number
): [number, number] {
  const state = ctx.state;
  const lines = state.lines;
  if (lines.length === 0) return [0, 0];

  const backward = flagsStr.includes('b');
  const acceptCursor = flagsStr.includes('c');
  const moveEnd = flagsStr.includes('e');
  const noMove = flagsStr.includes('n');
  const wrap = flagsStr.includes('w') || !flagsStr.includes('W');

  const re = compileVimPattern(pattern, !!state.options?.ignorecase, 'g');
  const curLine = state.cursor.line;
  const curCol = state.cursor.col;
  const stopIdx = stopline > 0 ? stopline - 1 : -1;

  const findInRange = (startL: number, endL: number, step: 1 | -1): [number, number] | null => {
    for (let l = startL; step > 0 ? l <= endL : l >= endL; l += step) {
      if (stopIdx >= 0 && ((step > 0 && l > stopIdx) || (step < 0 && l < stopIdx))) break;
      const lineText = lines[l] ?? '';
      re.lastIndex = 0;
      const matches: Array<{ col: number; endCol: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(lineText)) !== null) {
        const col = m.index;
        const endCol = col + Math.max(0, m[0].length - 1);
        matches.push({ col, endCol });
        if (m[0].length === 0) re.lastIndex++;
      }
      if (step < 0) matches.reverse();
      for (const hit of matches) {
        if (l === curLine) {
          if (step > 0 && (acceptCursor ? hit.col < curCol : hit.col <= curCol)) continue;
          if (step < 0 && (acceptCursor ? hit.col > curCol : hit.col >= curCol)) continue;
        }
        return [l, moveEnd ? hit.endCol : hit.col];
      }
    }
    return null;
  };

  let found: [number, number] | null = backward
    ? findInRange(curLine, 0, -1)
    : findInRange(curLine, lines.length - 1, 1);

  if (!found && wrap) {
    found = backward
      ? findInRange(lines.length - 1, curLine, -1)
      : findInRange(0, curLine, 1);
  }

  if (!found) return [0, 0];
  if (!noMove) {
    ctx.state = { ...ctx.state, cursor: { line: found[0], col: found[1] } };
  }
  return [found[0] + 1, found[1] + 1];
}

function toJsonFriendly(v: VimScriptValue): unknown {
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (isFuncref(v)) throw new VimScriptError(msg('E474: funcref 는 JSON 으로 변환할 수 없습니다'));
  if (Array.isArray(v)) return v.map(toJsonFriendly);
  const obj: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v.items)) obj[k] = toJsonFriendly(val);
  return obj;
}

function fromJsonValue(v: unknown): VimScriptValue {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(fromJsonValue);
  if (typeof v === 'object') {
    const out: Record<string, VimScriptValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = fromJsonValue(val);
    }
    return makeDict(out);
  }
  return 0;
}

/**
 * 버퍼·창·탭·VFS 파일·검색·문자열·JSON 관련 확장 Vim script 내장 함수 레지스트리
 */
export const EXTRA_BUILTINS: Record<string, ExtraBuiltin> = {
  // ---- 버퍼·창·탭 ----
  bufnr: {
    min: 0,
    max: 1,
    fn: (ctx, [expr]) => resolveBuffer(ctx.state, expr)?.id ?? -1,
  },
  bufname: {
    min: 0,
    max: 1,
    fn: (ctx, [expr]) => {
      const b = resolveBuffer(ctx.state, expr);
      return b && b.name !== '[No Name]' ? b.name : '';
    },
  },
  bufexists: {
    min: 1,
    max: 1,
    fn: (ctx, [expr]) => (resolveBuffer(ctx.state, expr) ? 1 : 0),
  },
  buflisted: {
    min: 1,
    max: 1,
    fn: (ctx, [expr]) => (resolveBuffer(ctx.state, expr) ? 1 : 0),
  },
  winnr: {
    min: 0,
    max: 1,
    fn: (ctx, [expr]) => {
      const s = ctx.state;
      const isSplit = !!s.splitDirection && s.splitDirection !== 'none';
      if (!isSplit) return 1;
      if (expr === '$') return 2;
      if (expr === '#') return (s.previousPaneIndex ?? 0) + 1;
      return (s.activePaneIndex ?? 0) + 1;
    },
  },
  tabpagenr: {
    min: 0,
    max: 1,
    fn: (ctx, [expr]) => {
      const tabs = ctx.state.tabPages ?? [];
      if (expr === '$') return tabs.length || 1;
      const idx = tabs.findIndex((t) => t.id === ctx.state.currentTabId);
      return idx >= 0 ? idx + 1 : 1;
    },
  },

  // ---- VFS 파일·디렉터리·경로 ----
  getcwd: {
    min: 0,
    max: 0,
    fn: (ctx) => getEffectiveCwd(ctx.state),
  },
  fnamemodify: {
    min: 2,
    max: 2,
    fn: (ctx, [fname, mods]) => applyPathModifiers(toVimString(fname), toVimString(mods), ctx.state),
  },
  filereadable: {
    min: 1,
    max: 1,
    fn: (ctx, [fname]) => (lookupVfsLines(ctx.state, toVimString(fname)) ? 1 : 0),
  },
  isdirectory: {
    min: 1,
    max: 1,
    fn: (ctx, [dname]) => {
      const raw = toVimString(dname).replace(/\/+$/, '') || '/';
      if (raw === '/' || raw === '.' || raw === getEffectiveCwd(ctx.state).replace(/\/+$/, '')) return 1;
      const norm = normalizeVfsLookupKey(ctx.state, raw).replace(/\/+$/, '');
      const dirs = getAvailableDirectories(ctx.state);
      return dirs.includes(raw) || dirs.includes(norm) ? 1 : 0;
    },
  },
  glob: {
    min: 1,
    max: 3,
    fn: (ctx, [pat, _nosuf, listFlag]) => {
      const pattern = normalizeVfsLookupKey(ctx.state, toVimString(pat));
      const re = globToRegex(pattern);
      const vfs = buildVfsMap(ctx.state);
      const matches = Object.keys(vfs).filter((k) => re.test(k)).sort();
      return listFlag !== undefined && isTruthy(listFlag) ? matches : matches.join('\n');
    },
  },
  readfile: {
    min: 1,
    max: 3,
    fn: (ctx, [fname, _type, max]) => {
      const target = toVimString(fname);
      const lines = lookupVfsLines(ctx.state, target);
      if (!lines) throw new VimScriptError(msg('E484: 파일을 열 수 없습니다: "{target}"', { target }));
      if (max === undefined) return [...lines];
      const limit = toNumber(max);
      return limit >= 0 ? lines.slice(0, limit) : lines.slice(limit);
    },
  },
  writefile: {
    min: 2,
    max: 3,
    fn: (ctx, [list, fname, flags]) => {
      if (!isList(list)) return -1;
      const key = normalizeVfsLookupKey(ctx.state, toVimString(fname));
      if (!key) return -1;
      const incoming = list.map(toVimString);
      const append = flags !== undefined && toVimString(flags).includes('a');
      const existing = append ? (lookupVfsLines(ctx.state, key) ?? []) : [];
      const nextLines = [...existing, ...incoming];
      ctx.state = {
        ...ctx.state,
        virtualFiles: { ...(ctx.state.virtualFiles ?? {}), [key]: nextLines },
      };
      return 0;
    },
  },

  // ---- 검색·매칭·문자열 ----
  strpart: {
    min: 2,
    max: 3,
    fn: (_c, [src, startArg, lenArg]) => {
      const s = toVimString(src);
      const start = toNumber(startArg);
      if (lenArg === undefined) return start < 0 ? s : s.slice(start);
      const len = toNumber(lenArg);
      if (len <= 0) return '';
      const from = Math.max(0, start);
      const to = Math.max(0, start + len);
      return s.slice(from, to);
    },
  },
  strchars: {
    min: 1,
    max: 2,
    fn: (_c, [expr]) => [...toVimString(expr)].length,
  },
  matchlist: {
    min: 2,
    max: 4,
    fn: (ctx, [expr, pat, startArg]) => {
      const s = toVimString(expr);
      const start = startArg === undefined ? 0 : Math.max(0, toNumber(startArg));
      const re = compileVimPattern(toVimString(pat), !!ctx.state.options?.ignorecase);
      const m = re.exec(s.slice(start));
      if (!m) return [];
      return Array.from({ length: 10 }, (_, i) => m[i] ?? '');
    },
  },
  search: {
    min: 1,
    max: 3,
    fn: (ctx, [pat, flags, stopline]) =>
      executeBufferSearch(ctx, toVimString(pat), flags ? toVimString(flags) : '', stopline ? toNumber(stopline) : 0)[0],
  },
  searchpos: {
    min: 1,
    max: 3,
    fn: (ctx, [pat, flags, stopline]) =>
      executeBufferSearch(ctx, toVimString(pat), flags ? toVimString(flags) : '', stopline ? toNumber(stopline) : 0),
  },

  // ---- Ex 실행 ----
  execute: {
    min: 1,
    max: 2,
    fn: (ctx, [cmdArg, silentArg]) => {
      if (!ctx.runEx) return '';
      const mode = silentArg === undefined ? 'silent' : toVimString(silentArg);
      const silentBang = mode === 'silent!';
      const silent = mode === 'silent' || silentBang;
      const cmds = isList(cmdArg) ? cmdArg.map(toVimString) : toVimString(cmdArg).split(/\r?\n/);

      const capKey = '__exec_cap__';
      const prevRedir = ctx.state.redirSession;
      const prevMsg = ctx.state.commandMessage;
      const prevHadCap = ctx.state.globalVars ? capKey in ctx.state.globalVars : false;
      const prevCapVal = prevHadCap ? ctx.state.globalVars?.[capKey] : undefined;

      let work: VimEditorState = {
        ...ctx.state,
        bell: undefined,
        redirSession: { target: capKey, append: false },
        globalVars: { ...(ctx.state.globalVars ?? {}), [capKey]: '' },
      };

      let errMsg: string | undefined;
      for (const raw of cmds) {
        const cleaned = raw.replace(/^\s*:/, '').trim();
        if (!cleaned) continue;
        const step = ctx.runEx(work, cleaned);
        work = step;
        if (step.bell) {
          errMsg = step.commandMessage ?? msg('E492: 명령 실행에 실패했습니다: {command}', { command: cleaned });
          break;
        }
      }

      const rawCap = work.globalVars?.[capKey];
      const captured = typeof rawCap === 'string' ? rawCap : '';
      const nextGlobals = { ...(work.globalVars ?? {}) };
      if (prevHadCap && prevCapVal !== undefined) nextGlobals[capKey] = prevCapVal;
      else delete nextGlobals[capKey];

      ctx.state = {
        ...work,
        redirSession: prevRedir,
        globalVars: nextGlobals,
        bell: silentBang ? undefined : work.bell,
        commandMessage: silent ? prevMsg : work.commandMessage,
      };

      if (errMsg && !silentBang) {
        throw new VimScriptError(errMsg);
      }
      return captured;
    },
  },

  // ---- JSON ----
  json_encode: {
    min: 1,
    max: 1,
    fn: (_c, [val]) => JSON.stringify(toJsonFriendly(val)),
  },
  json_decode: {
    min: 1,
    max: 1,
    fn: (_c, [str]) => {
      const raw = toVimString(str);
      try {
        return fromJsonValue(JSON.parse(raw));
      } catch {
        throw new VimScriptError(msg('E474: 유효하지 않은 JSON 입니다: {v}', { v: raw }));
      }
    },
  },
};
