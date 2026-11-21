import { VimEditorState, VimScriptValue } from './types';
import { clampCursor } from './cursor';
import { msg } from './messages';
import { readOptionForScript, writeOptionForScript } from './setOptionsCore';
import {
  VimScriptError,
  EvalContext,
  isList,
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
  getCwdForWindow,
  getEffectiveCwd,
  getLocalDirScope,
  getVfsFile,
} from './vfs';
import {
  findNeighborPane,
  getEffectiveWindowTree,
  getPaneWinId,
  switchPaneFocusCore,
  toVimWinlayout,
} from './windowTree';

import { EXTRA_EDITOR_BUILTINS, resolveWindowIndex } from './vimscriptEditorBuiltins';
import type { ExtraBuiltin } from './vimscriptEditorBuiltins';

export type { ExtraBuiltin };

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

function resolveBufferLines(
  state: VimEditorState,
  expr: VimScriptValue | undefined
): { id: number; name: string; isCurrent: boolean; lines: string[] } | null {
  const resolved = resolveBuffer(state, expr);
  if (!resolved) return null;
  const curId = state.currentBufferId ?? 1;
  const isCurrent = resolved.id === curId;
  if (isCurrent) {
    return { ...resolved, isCurrent: true, lines: state.lines };
  }
  const buf = state.buffers?.find((b) => b.id === resolved.id);
  if (!buf) return null;
  return { ...resolved, isCurrent: false, lines: buf.lines };
}

function writeBufferLines(
  state: VimEditorState,
  target: { id: number; name: string; isCurrent: boolean },
  nextLinesRaw: string[]
): VimEditorState {
  const nextLines = nextLinesRaw.length > 0 ? nextLinesRaw : [''];
  const nextBuffers = state.buffers
    ? state.buffers.map((b) =>
        b.id === target.id
          ? {
              ...b,
              lines: [...nextLines],
              cursor: clampCursor(nextLines, b.cursor, 'NORMAL'),
              isModified: true,
            }
          : b
      )
    : undefined;

  const nextSplitPanes = state.splitPanes
    ? state.splitPanes.map((pane) => {
        const matches =
          pane.bufferId !== undefined
            ? pane.bufferId === target.id
            : Boolean(target.name && pane.filename === target.name);
        if (!matches) return pane;
        return {
          ...pane,
          lines: [...nextLines],
          cursor: clampCursor(nextLines, pane.cursor, pane.mode),
          visualAnchor: pane.visualAnchor
            ? clampCursor(nextLines, pane.visualAnchor, pane.mode)
            : undefined,
        };
      })
    : undefined;

  if (target.isCurrent) {
    return {
      ...state,
      lines: [...nextLines],
      cursor: clampCursor(nextLines, state.cursor, state.mode),
      buffers: nextBuffers,
      splitPanes: nextSplitPanes,
    };
  }

  return {
    ...state,
    buffers: nextBuffers,
    splitPanes: nextSplitPanes,
  };
}

function parseBufLineIndex(linesLen: number, arg: VimScriptValue, allowZero = false): number {
  if (arg === '$') return linesLen;
  const n = Math.trunc(toNumber(arg));
  if (allowZero && n === 0) return 0;
  return n;
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
  getbufline: {
    min: 2,
    max: 3,
    fn: (ctx, [expr, lnumArg, endArg]) => {
      const target = resolveBufferLines(ctx.state, expr);
      if (!target) return [];
      const start = parseBufLineIndex(target.lines.length, lnumArg);
      const end = endArg === undefined ? start : parseBufLineIndex(target.lines.length, endArg);
      if (start < 1 || end < start || start > target.lines.length) return [];
      return target.lines.slice(start - 1, Math.min(end, target.lines.length));
    },
  },
  setbufline: {
    min: 3,
    max: 3,
    fn: (ctx, [expr, lnumArg, text]) => {
      const target = resolveBufferLines(ctx.state, expr);
      if (!target) return 1;
      const start = parseBufLineIndex(target.lines.length, lnumArg);
      if (start < 1 || start > target.lines.length + 1) return 1;
      const incoming = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const nextLines = [...target.lines];
      incoming.forEach((line, idx) => {
        nextLines[start - 1 + idx] = line;
      });
      ctx.state = writeBufferLines(ctx.state, target, nextLines);
      return 0;
    },
  },
  appendbufline: {
    min: 3,
    max: 3,
    fn: (ctx, [expr, lnumArg, text]) => {
      const target = resolveBufferLines(ctx.state, expr);
      if (!target) return 1;
      const n = parseBufLineIndex(target.lines.length, lnumArg, true);
      if (n < 0 || n > target.lines.length) return 1;
      const incoming = isList(text) ? text.map(toVimString) : [toVimString(text)];
      const nextLines = [...target.lines.slice(0, n), ...incoming, ...target.lines.slice(n)];
      ctx.state = writeBufferLines(ctx.state, target, nextLines);
      return 0;
    },
  },
  deletebufline: {
    min: 2,
    max: 3,
    fn: (ctx, [expr, firstArg, lastArg]) => {
      const target = resolveBufferLines(ctx.state, expr);
      if (!target) return 1;
      const first = parseBufLineIndex(target.lines.length, firstArg);
      const last = lastArg === undefined ? first : parseBufLineIndex(target.lines.length, lastArg);
      if (first < 1 || last < first || first > target.lines.length) return 1;
      const clampedLast = Math.min(last, target.lines.length);
      const nextLines = [
        ...target.lines.slice(0, first - 1),
        ...target.lines.slice(clampedLast),
      ];
      ctx.state = writeBufferLines(ctx.state, target, nextLines);
      return 0;
    },
  },
  getbufvar: {
    min: 2,
    max: 3,
    fn: (ctx, [bufExpr, varNameArg, defVal]) => {
      const fallback = defVal !== undefined ? defVal : '';
      const resolved = resolveBuffer(ctx.state, bufExpr);
      if (!resolved) return fallback;
      const varName = toVimString(varNameArg);
      if (varName === '') {
        return makeDict({ ...(ctx.state.bufferVars?.[resolved.id] ?? {}) });
      }
      if (varName.startsWith('&')) {
        const val = readOptionForScript(
          { ...ctx.state, currentBufferId: resolved.id },
          `&l:${varName.slice(1).replace(/^[gl]:/, '')}`
        );
        return val !== null ? val : fallback;
      }
      const store = ctx.state.bufferVars?.[resolved.id];
      return store && varName in store ? store[varName] : fallback;
    },
  },
  setbufvar: {
    min: 3,
    max: 3,
    fn: (ctx, [bufExpr, varNameArg, val]) => {
      const resolved = resolveBuffer(ctx.state, bufExpr);
      if (!resolved) return 0;
      const varName = toVimString(varNameArg);
      if (varName.startsWith('&')) {
        const optName = `&l:${varName.slice(1).replace(/^[gl]:/, '')}`;
        const prevCurId = ctx.state.currentBufferId;
        const updated = writeOptionForScript(
          { ...ctx.state, currentBufferId: resolved.id },
          optName,
          { num: toNumber(val), str: toVimString(val), truthy: isTruthy(val) }
        );
        if (updated) {
          ctx.state = { ...updated, currentBufferId: prevCurId };
        }
        return 0;
      }
      const prev = ctx.state.bufferVars?.[resolved.id] ?? {};
      ctx.state = {
        ...ctx.state,
        bufferVars: {
          ...(ctx.state.bufferVars ?? {}),
          [resolved.id]: { ...prev, [varName]: val },
        },
      };
      return 0;
    },
  },
  getwinvar: {
    min: 2,
    max: 3,
    fn: (ctx, [nrArg, varNameArg, defVal]) => {
      const fallback = defVal !== undefined ? defVal : '';
      const winIdx = resolveWindowIndex(ctx.state, nrArg);
      if (winIdx < 0) return fallback;
      const varName = toVimString(varNameArg);
      if (varName === '') {
        return makeDict({ ...(ctx.state.windowVars?.[winIdx] ?? {}) });
      }
      if (varName.startsWith('&')) {
        const cleanOpt = varName.slice(1).replace(/^[gl]:/, '');
        if ((cleanOpt === 'scb' || cleanOpt === 'scrollbind') && ctx.state.splitPanes?.[winIdx]) {
          return ctx.state.splitPanes[winIdx].scrollbind ? 1 : 0;
        }
        const val = readOptionForScript(ctx.state, varName);
        return val !== null ? val : fallback;
      }
      const store = ctx.state.windowVars?.[winIdx];
      return store && varName in store ? store[varName] : fallback;
    },
  },
  setwinvar: {
    min: 3,
    max: 3,
    fn: (ctx, [nrArg, varNameArg, val]) => {
      const winIdx = resolveWindowIndex(ctx.state, nrArg);
      if (winIdx < 0) return 0;
      const varName = toVimString(varNameArg);
      if (varName.startsWith('&')) {
        const cleanOpt = varName.slice(1).replace(/^[gl]:/, '');
        if ((cleanOpt === 'scb' || cleanOpt === 'scrollbind') && ctx.state.splitPanes?.[winIdx]) {
          const nextScb = isTruthy(val);
          const nextPanes = ctx.state.splitPanes.map((p, i) =>
            i === winIdx ? { ...p, scrollbind: nextScb } : p
          );
          const isCurrent = (ctx.state.activePaneIndex ?? 0) === winIdx;
          ctx.state = {
            ...ctx.state,
            splitPanes: nextPanes,
            ...(isCurrent && ctx.state.options
              ? { options: { ...ctx.state.options, scrollbind: nextScb } }
              : {}),
          };
          return 0;
        }
        const updated = writeOptionForScript(ctx.state, varName, {
          num: toNumber(val),
          str: toVimString(val),
          truthy: isTruthy(val),
        });
        if (updated) ctx.state = updated;
        return 0;
      }
      const prev = ctx.state.windowVars?.[winIdx] ?? {};
      ctx.state = {
        ...ctx.state,
        windowVars: {
          ...(ctx.state.windowVars ?? {}),
          [winIdx]: { ...prev, [varName]: val },
        },
      };
      return 0;
    },
  },
  winnr: {
    min: 0,
    max: 1,
    fn: (ctx, [expr]) => {
      const s = ctx.state;
      const isSplit = Boolean(
        s.splitDirection && s.splitDirection !== 'none' && s.splitPanes && s.splitPanes.length >= 2
      );
      if (!isSplit) return 1;
      const paneCount = s.splitPanes!.length;
      if (expr === '$') return paneCount;
      if (expr === '#') return (s.previousPaneIndex ?? 0) + 1;
      if (typeof expr === 'string') {
        const dirMatch = expr.match(/^(\d*)([hjkl])$/);
        if (dirMatch) {
          const steps = dirMatch[1] ? Math.max(1, parseInt(dirMatch[1], 10)) : 1;
          const dir = dirMatch[2] as 'h' | 'j' | 'k' | 'l';
          const tree = getEffectiveWindowTree(s);
          let idx = s.activePaneIndex ?? 0;
          if (tree) {
            for (let i = 0; i < steps; i++) {
              const next = findNeighborPane(tree, idx, dir);
              if (next === null) break;
              idx = next;
            }
          }
          return idx + 1;
        }
      }
      return (s.activePaneIndex ?? 0) + 1;
    },
  },
  win_getid: {
    min: 0,
    max: 1,
    fn: (ctx, [winArg]) => {
      const s = ctx.state;
      const isSplit = Boolean(
        s.splitDirection && s.splitDirection !== 'none' && s.splitPanes && s.splitPanes.length >= 2
      );
      if (!isSplit) {
        if (winArg === undefined) return 1000;
        const n = Math.trunc(toNumber(winArg));
        return n === 1 ? 1000 : 0;
      }
      const panes = s.splitPanes!;
      if (winArg === undefined) {
        return getPaneWinId(panes, s.activePaneIndex ?? 0);
      }
      const winNum = Math.trunc(toNumber(winArg));
      if (winNum < 1 || winNum > panes.length) return 0;
      return getPaneWinId(panes, winNum - 1);
    },
  },
  win_id2win: {
    min: 1,
    max: 1,
    fn: (ctx, [idArg]) => {
      const targetId = Math.trunc(toNumber(idArg));
      const s = ctx.state;
      const isSplit = Boolean(
        s.splitDirection && s.splitDirection !== 'none' && s.splitPanes && s.splitPanes.length >= 2
      );
      if (!isSplit) return targetId === 1000 ? 1 : 0;
      const idx = s.splitPanes!.findIndex((p, i) => (p.winId ?? 1000 + i) === targetId);
      return idx >= 0 ? idx + 1 : 0;
    },
  },
  win_gotoid: {
    min: 1,
    max: 1,
    fn: (ctx, [idArg]) => {
      const targetId = Math.trunc(toNumber(idArg));
      const s = ctx.state;
      const isSplit = Boolean(
        s.splitDirection && s.splitDirection !== 'none' && s.splitPanes && s.splitPanes.length >= 2
      );
      if (!isSplit) return targetId === 1000 ? 1 : 0;
      const idx = s.splitPanes!.findIndex((p, i) => (p.winId ?? 1000 + i) === targetId);
      if (idx < 0) return 0;
      ctx.state = switchPaneFocusCore(s, idx);
      return 1;
    },
  },
  winlayout: {
    min: 0,
    max: 0,
    fn: (ctx) => toVimWinlayout(ctx.state),
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
    max: 2,
    fn: (ctx, args) => {
      const winnr = args[0] !== undefined ? Math.trunc(toNumber(args[0])) : undefined;
      const tabnr = args[1] !== undefined ? Math.trunc(toNumber(args[1])) : undefined;
      return getCwdForWindow(ctx.state, winnr, tabnr);
    },
  },
  haslocaldir: {
    min: 0,
    max: 2,
    fn: (ctx, args) => {
      const winnr = args[0] !== undefined ? Math.trunc(toNumber(args[0])) : undefined;
      const tabnr = args[1] !== undefined ? Math.trunc(toNumber(args[1])) : undefined;
      return getLocalDirScope(ctx.state, winnr, tabnr);
    },
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

  ...EXTRA_EDITOR_BUILTINS,
};
