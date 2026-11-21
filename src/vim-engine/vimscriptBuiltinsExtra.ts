import { VimEditorState, VimScriptValue } from './types';
import { clampCursor } from './cursor';
import { msg } from './messages';
import { readOptionForScript, writeOptionForScript } from './setOptionsCore';
import {
  VimScriptError,
  EvalContext,
  isList,
  isDict,
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
import {
  findNeighborPane,
  getEffectiveWindowTree,
  getPaneWinId,
  switchPaneFocusCore,
  toVimWinlayout,
} from './windowTree';

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

function resolveWindowIndex(state: VimEditorState, nrArg: VimScriptValue): number {
  const nr = Math.trunc(toNumber(nrArg));
  const isSplit = Boolean(
    state.splitDirection && state.splitDirection !== 'none' && state.splitPanes && state.splitPanes.length >= 2
  );
  if (nr === 0) return isSplit ? (state.activePaneIndex ?? 0) : 0;
  const maxWin = isSplit ? state.splitPanes!.length : 1;
  if (nr < 1 || nr > maxWin) return -1;
  return nr - 1;
}

function buildLhsVariants(lhs: string, leaderKey: string): string[] {
  const variants = [lhs];
  if (lhs.includes('<leader>')) {
    variants.push(lhs.replace(/<leader>/gi, leaderKey));
  } else if (lhs.startsWith(leaderKey)) {
    variants.push('<leader>' + lhs.slice(leaderKey.length));
  }
  const ctrlBracket = lhs.match(/^<(?:c|ctrl)-([a-z0-9])>$/i);
  if (ctrlBracket) variants.push(`Ctrl-${ctrlBracket[1].toLowerCase()}`);
  const ctrlDash = lhs.match(/^Ctrl-([a-z0-9])$/i);
  if (ctrlDash) variants.push(`<C-${ctrlDash[1].toLowerCase()}>`, `<c-${ctrlDash[1].toLowerCase()}>`);
  return Array.from(new Set(variants));
}

function lookupKeymapForScript(
  state: VimEditorState,
  name: string,
  modeRaw: string,
  isAbbr: boolean,
  prefixMatch: boolean
): {
  lhs: string;
  rhs: string;
  mode: string;
  silent: number;
  expr: number;
  noremap: number;
  nowait: number;
  buffer: number;
} | null {
  const mode = (modeRaw || 'n').trim().toLowerCase() || 'n';
  if (isAbbr) {
    const bufId = state.currentBufferId ?? 1;
    const sources: Array<{ map: Record<string, import('./types').AbbreviationEntry> | undefined; isBuf: boolean }> = [
      { map: state.bufferAbbreviations?.[bufId], isBuf: true },
      { map: state.abbreviations, isBuf: false },
    ];
    const checkModes = mode === 'i' || mode === 'c' ? [mode] : ['i', 'c'];
    for (const { map, isBuf } of sources) {
      if (!map) continue;
      for (const m of checkModes) {
        for (const [k, entry] of Object.entries(map)) {
          if (entry.mode !== m && !k.startsWith(`${m}:`)) continue;
          const match = prefixMatch
            ? entry.lhs === name || entry.lhs.startsWith(name) || name.startsWith(entry.lhs)
            : entry.lhs === name;
          if (match) {
            return {
              lhs: entry.lhs,
              rhs: entry.rhs,
              mode: entry.mode,
              silent: entry.silent ? 1 : 0,
              expr: entry.expr ? 1 : 0,
              noremap: entry.noremap ? 1 : 0,
              nowait: 0,
              buffer: isBuf || entry.buffer ? 1 : 0,
            };
          }
        }
      }
    }
    return null;
  }

  const leaderKey = state.leaderKey || ' ';
  const variants = buildLhsVariants(name, leaderKey);
  const bufId = state.currentBufferId ?? 1;
  const sources: Array<{ map: Record<string, string> | undefined; isBuf: boolean }> = [
    { map: state.bufferKeymaps?.[bufId], isBuf: true },
    { map: state.userKeymaps, isBuf: false },
  ];
  const strictModeOnly = mode === 'x' || mode === 'o' || mode === 'c';

  for (const { map, isBuf } of sources) {
    if (!map) continue;
    for (const v of variants) {
      const keysToCheck = strictModeOnly ? [`${mode}:${v}`] : [`${mode}:${v}`, v];
      for (const mapKey of keysToCheck) {
        if (map[mapKey] !== undefined) {
          const metaKey = isBuf ? `b:${bufId}:${mode}:${v}` : `${mode}:${v}`;
          const meta =
            state.keymapMeta?.[metaKey] ??
            (strictModeOnly ? undefined : state.keymapMeta?.[isBuf ? `b:${bufId}:${v}` : v]);
          return {
            lhs: v,
            rhs: map[mapKey],
            mode,
            silent: meta?.silent ? 1 : 0,
            expr: meta?.expr ? 1 : 0,
            noremap: meta?.noremap === false ? 0 : 1,
            nowait: meta?.nowait ? 1 : 0,
            buffer: isBuf ? 1 : 0,
          };
        }
      }
    }
    if (prefixMatch) {
      for (const [rawKey, rhs] of Object.entries(map)) {
        let entryMode = 'all';
        let entryLhs = rawKey;
        if (/^[nivxoc]:/.test(rawKey)) {
          entryMode = rawKey[0];
          entryLhs = rawKey.slice(2);
        }
        if (entryMode !== 'all' && entryMode !== mode) continue;
        if (entryMode === 'all' && strictModeOnly) continue;
        const entryVariants = buildLhsVariants(entryLhs, leaderKey);
        const matched = entryVariants.some((ev) =>
          variants.some((v) => ev.startsWith(v) || v.startsWith(ev))
        );
        if (matched) {
          const metaKey = isBuf ? `b:${bufId}:${mode}:${entryLhs}` : `${mode}:${entryLhs}`;
          const meta = state.keymapMeta?.[metaKey];
          return {
            lhs: entryLhs,
            rhs,
            mode: entryMode === 'all' ? mode : entryMode,
            silent: meta?.silent ? 1 : 0,
            expr: meta?.expr ? 1 : 0,
            noremap: meta?.noremap === false ? 0 : 1,
            nowait: meta?.nowait ? 1 : 0,
            buffer: isBuf ? 1 : 0,
          };
        }
      }
    }
  }
  return null;
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

  // ---- 레지스터 조회/설정 (getreg / getregtype / setreg) ----
  getreg: {
    min: 0,
    max: 3,
    fn: (ctx, [regArg, _keepList, asListArg]) => {
      const rawName = regArg === undefined ? '"' : toVimString(regArg) || '"';
      const asList = asListArg !== undefined && isTruthy(asListArg);
      const s = ctx.state;
      if (rawName === '_') return asList ? [] : '';
      if (rawName === '%') {
        const val = s.primaryFilename ?? '';
        return asList ? (val ? [val] : []) : val;
      }
      if (rawName === '#') {
        const altBuffer =
          s.alternateBufferId !== undefined
            ? s.buffers?.find((b) => b.id === s.alternateBufferId)
            : undefined;
        const val = altBuffer?.name ?? s.secondaryFilename ?? '';
        return asList ? (val ? [val] : []) : val;
      }
      if (rawName === '.') {
        const val = s.lastInsertedText ?? '';
        return asList ? (val ? val.split('\n') : []) : val;
      }
      if (rawName === '/') {
        const val = s.lastSearchQuery ?? '';
        return asList ? (val ? [val] : []) : val;
      }
      if (rawName === ':') {
        const val = s.commandHistory?.[s.commandHistory.length - 1] ?? '';
        return asList ? (val ? [val] : []) : val;
      }
      const key = rawName === '"' ? '"' : rawName.toLowerCase();
      const entry = s.registers?.[key];
      let content: string | undefined;
      if (entry) {
        content = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
      } else if (key === '"' && s.clipboard) {
        content = s.clipboard.content;
      } else if ((key === '+' || key === '*') && s.systemClipboard !== undefined) {
        content = s.systemClipboard;
      }
      if (content === undefined) return asList ? [] : '';
      return asList ? content.split('\n') : content;
    },
  },
  getregtype: {
    min: 0,
    max: 1,
    fn: (ctx, [regArg]) => {
      const rawName = regArg === undefined ? '"' : toVimString(regArg) || '"';
      const s = ctx.state;
      if (rawName === '_') return '';
      if (rawName === '%' || rawName === '#' || rawName === '.' || rawName === '/' || rawName === ':') return 'v';
      const key = rawName === '"' ? '"' : rawName.toLowerCase();
      const entry = s.registers?.[key];
      if (entry) {
        if (entry.type === 'line') return 'V';
        if (entry.type === 'block') {
          const text = Array.isArray(entry.content) ? entry.content.join('') : entry.content;
          const w = entry.blockWidth ?? Math.max(0, ...text.split('\n').map((l) => l.length));
          return `\x16${w}`;
        }
        return 'v';
      }
      if (key === '"' && s.clipboard) {
        if (s.clipboard.type === 'line') return 'V';
        if (s.clipboard.type === 'block') {
          const w =
            s.clipboard.blockWidth ??
            Math.max(0, ...s.clipboard.content.split('\n').map((l) => l.length));
          return `\x16${w}`;
        }
        return 'v';
      }
      return '';
    },
  },
  setreg: {
    min: 2,
    max: 3,
    fn: (ctx, [regArg, valArg, optArg]) => {
      const rawName = toVimString(regArg) || '"';
      if (rawName === '%' || rawName === '.' || rawName === ':') return -1;
      if (rawName === '/') {
        ctx.state = {
          ...ctx.state,
          lastSearchQuery: isList(valArg) ? valArg.map(toVimString).join('\n') : toVimString(valArg),
          hlsearchSuppressed: false,
        };
        return 0;
      }
      if (rawName === '#') {
        const targetName = isList(valArg) ? valArg.map(toVimString).join('\n') : toVimString(valArg);
        const found = ctx.state.buffers?.find(
          (b) => b.name === targetName || String(b.id) === targetName
        );
        ctx.state = {
          ...ctx.state,
          ...(found ? { alternateBufferId: found.id } : {}),
          secondaryFilename: found ? found.name : targetName,
        };
        return 0;
      }
      if (rawName.length !== 1 || !/^[a-zA-Z0-9"_+*=-]$/.test(rawName)) return -1;
      if (rawName === '_') return 0;

      const isUpperAppend = /^[A-Z]$/.test(rawName);
      const key = rawName === '"' ? '"' : rawName.toLowerCase();
      const opt = optArg !== undefined ? toVimString(optArg) : '';
      const isAppend = isUpperAppend || opt.includes('a');
      const incomingIsList = isList(valArg);
      const incomingText = incomingIsList
        ? valArg.map(toVimString).join('\n')
        : toVimString(valArg);

      let nextType: 'char' | 'line' | 'block';
      let blockWidth: number | undefined;
      const blockMatch = opt.match(/(?:b|\x16)(\d*)/);
      if (blockMatch) {
        nextType = 'block';
        blockWidth = blockMatch[1]
          ? parseInt(blockMatch[1], 10)
          : Math.max(0, ...incomingText.split('\n').map((l) => l.length));
      } else if (opt.includes('l') || opt.includes('V')) {
        nextType = 'line';
      } else if (opt.includes('c') || opt.includes('v')) {
        nextType = 'char';
      } else {
        nextType = incomingIsList ? 'line' : 'char';
      }

      const existing = ctx.state.registers?.[key];
      let finalContent = incomingText;
      if (isAppend && existing) {
        const prevText = Array.isArray(existing.content)
          ? existing.content.join('')
          : existing.content;
        finalContent =
          nextType === 'line' || nextType === 'block' || existing.type === 'line'
            ? `${prevText}\n${incomingText}`
            : `${prevText}${incomingText}`;
        if (nextType === 'block') {
          blockWidth = Math.max(
            blockWidth ?? 0,
            existing.blockWidth ?? 0,
            ...finalContent.split('\n').map((l) => l.length)
          );
        }
      }

      const nextEntry = {
        type: nextType,
        content: finalContent,
        ...(nextType === 'block' && blockWidth !== undefined ? { blockWidth } : {}),
      };

      const nextRegisters = {
        ...(ctx.state.registers ?? {}),
        [key]: nextEntry,
        ...(key === '+' || key === '*' ? { '+': nextEntry, '*': nextEntry } : {}),
      };

      const nextClipboard =
        key === '"'
          ? {
              type: (nextType === 'line' ? 'line' : nextType === 'block' ? 'block' : 'text') as
                | 'line'
                | 'text'
                | 'block',
              content: finalContent,
              ...(nextType === 'block' && blockWidth !== undefined ? { blockWidth } : {}),
            }
          : ctx.state.clipboard;

      ctx.state = {
        ...ctx.state,
        registers: nextRegisters,
        clipboard: nextClipboard,
        ...(key === '+' || key === '*' ? { systemClipboard: finalContent } : {}),
      };
      return 0;
    },
  },

  // ---- 태그 스택 & 점프 리스트 (gettagstack / settagstack / getjumplist) ----
  gettagstack: {
    min: 0,
    max: 1,
    fn: (ctx, [winArg]) => {
      if (winArg !== undefined) {
        const winIdx = resolveWindowIndex(ctx.state, winArg);
        if (winIdx < 0) return makeDict({});
      }
      const s = ctx.state;
      const stack = s.tagStackHistory ?? s.tagStack ?? [];
      const curIdx = s.tagStackIndex ?? (s.tagStack ?? []).length;
      const curBufId = s.currentBufferId ?? 1;
      const items = stack.map((entry) => {
        const bufId =
          entry.bufferId ??
          s.buffers?.find((b) => b.name === entry.filename)?.id ??
          curBufId;
        return makeDict({
          tagname: entry.tag,
          from: [bufId, entry.cursor.line + 1, entry.cursor.col + 1, 0],
          matchnr: entry.matchnr ?? 1,
        });
      });
      return makeDict({
        length: stack.length,
        curidx: Math.min(stack.length + 1, Math.max(1, curIdx + 1)),
        items,
      });
    },
  },
  settagstack: {
    min: 2,
    max: 3,
    fn: (ctx, [winArg, dictArg, actionArg]) => {
      const winIdx = resolveWindowIndex(ctx.state, winArg);
      if (winIdx < 0 || !isDict(dictArg)) return -1;
      const action = actionArg !== undefined ? toVimString(actionArg) : 'r';
      const s = ctx.state;
      const prevStack = s.tagStackHistory ?? s.tagStack ?? [];
      let nextStack = [...prevStack];
      let nextIdx = s.tagStackIndex ?? (s.tagStack ?? []).length;

      if (action === 't') {
        const truncAt = Math.min(nextIdx, nextStack.length);
        nextStack = nextStack.slice(0, truncAt);
      } else if (action === 'r') {
        if ('items' in dictArg.items) {
          nextStack = [];
        }
      }

      const rawItems = dictArg.items.items;
      if (rawItems !== undefined) {
        if (!isList(rawItems)) return -1;
        const parsedItems = rawItems
          .filter(isDict)
          .map((d) => {
            const tag = toVimString(d.items.tagname ?? '');
            const fromList = isList(d.items.from) ? d.items.from : [1, 1, 1, 0];
            const bufId = Math.max(1, toNumber(fromList[0] ?? 1));
            const lnum = Math.max(1, toNumber(fromList[1] ?? 1));
            const col = Math.max(1, toNumber(fromList[2] ?? 1));
            const matchnr = d.items.matchnr !== undefined ? Math.max(1, toNumber(d.items.matchnr)) : 1;
            const foundBuf = s.buffers?.find((b) => b.id === bufId);
            const filename =
              foundBuf?.name ??
              (bufId === (s.currentBufferId ?? 1) ? s.primaryFilename || 'source.ts' : 'source.ts');
            return {
              tag,
              filename,
              bufferId: bufId,
              cursor: { line: lnum - 1, col: col - 1 },
              matchnr,
            };
          });
        nextStack = action === 'a' || action === 't' ? [...nextStack, ...parsedItems] : parsedItems;
        nextIdx = nextStack.length;
      }

      if (dictArg.items.curidx !== undefined) {
        const reqIdx = Math.trunc(toNumber(dictArg.items.curidx));
        nextIdx = Math.max(0, Math.min(nextStack.length, reqIdx - 1));
      }

      ctx.state = {
        ...s,
        tagStack: nextStack.slice(0, nextIdx),
        tagStackHistory: nextStack,
        tagStackIndex: nextIdx,
      };
      return 0;
    },
  },
  getjumplist: {
    min: 0,
    max: 2,
    fn: (ctx, [winArg, tabArg]) => {
      if (tabArg !== undefined) {
        const tabs = ctx.state.tabPages ?? [];
        const tnr = Math.trunc(toNumber(tabArg));
        if (tnr < 1 || (tabs.length > 0 && tnr > tabs.length) || (tabs.length === 0 && tnr > 1)) {
          return [];
        }
      }
      if (winArg !== undefined) {
        const winIdx = resolveWindowIndex(ctx.state, winArg);
        if (winIdx < 0) return [];
      }
      const s = ctx.state;
      const list = s.jumpList ?? [];
      const curBufId = s.currentBufferId ?? 1;
      const entries = list.map((item) => {
        const bufId =
          item.bufferId ??
          (item.filename ? s.buffers?.find((b) => b.name === item.filename)?.id : undefined) ??
          curBufId;
        return makeDict({
          bufnr: bufId,
          filename: item.filename ?? s.primaryFilename ?? '',
          lnum: item.row + 1,
          col: item.col,
          coladd: 0,
        });
      });
      const lastPos = Math.min(s.jumpIndex ?? list.length, list.length);
      return [entries, lastPos];
    },
  },

  // ---- 키매핑 조회 (maparg / mapcheck) ----
  maparg: {
    min: 1,
    max: 4,
    fn: (ctx, [nameArg, modeArg, abbrArg, dictArg]) => {
      const name = toVimString(nameArg);
      const mode = modeArg !== undefined ? toVimString(modeArg) : 'n';
      const isAbbr = abbrArg !== undefined && isTruthy(abbrArg);
      const asDict = dictArg !== undefined && isTruthy(dictArg);
      const hit = lookupKeymapForScript(ctx.state, name, mode, isAbbr, false);
      if (!hit) return asDict ? makeDict({}) : '';
      if (!asDict) return hit.rhs;
      return makeDict({
        lhs: hit.lhs,
        rhs: hit.rhs,
        mode: hit.mode,
        silent: hit.silent,
        expr: hit.expr,
        noremap: hit.noremap,
        nowait: hit.nowait,
        buffer: hit.buffer,
      });
    },
  },
  mapcheck: {
    min: 1,
    max: 3,
    fn: (ctx, [nameArg, modeArg, abbrArg]) => {
      const name = toVimString(nameArg);
      const mode = modeArg !== undefined ? toVimString(modeArg) : 'n';
      const isAbbr = abbrArg !== undefined && isTruthy(abbrArg);
      const hit = lookupKeymapForScript(ctx.state, name, mode, isAbbr, true);
      return hit ? hit.rhs : '';
    },
  },

  // ---- 커맨드라인 컨텍스트 조회 (getcmdtype / getcmdline / getcmdpos / setcmdpos) ----
  getcmdtype: {
    min: 0,
    max: 0,
    fn: (ctx) => {
      const s = ctx.state;
      if (s.mode !== 'COMMAND' && s.mode !== 'SEARCH') return '';
      return s.commandType ?? (s.mode === 'COMMAND' ? ':' : '/');
    },
  },
  getcmdline: {
    min: 0,
    max: 0,
    fn: (ctx) => {
      const s = ctx.state;
      if (s.mode !== 'COMMAND' && s.mode !== 'SEARCH') return '';
      return s.commandBuffer ?? '';
    },
  },
  getcmdpos: {
    min: 0,
    max: 0,
    fn: (ctx) => {
      const s = ctx.state;
      if (s.mode !== 'COMMAND' && s.mode !== 'SEARCH') return 0;
      const buf = s.commandBuffer ?? '';
      const col = s.commandCursorCol !== undefined ? s.commandCursorCol : buf.length;
      return col + 1;
    },
  },
  setcmdpos: {
    min: 1,
    max: 1,
    fn: (ctx, [posArg]) => {
      const s = ctx.state;
      if (s.mode !== 'COMMAND' && s.mode !== 'SEARCH') return 1;
      const pos = Math.trunc(toNumber(posArg));
      if (pos < 1) return 0;
      const buf = s.commandBuffer ?? '';
      const targetCol = Math.min(buf.length, pos - 1);
      ctx.state = {
        ...s,
        commandCursorCol: targetCol >= buf.length ? undefined : targetCol,
      };
      return 0;
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
