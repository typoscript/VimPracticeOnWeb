import { VimEditorState, VimScriptValue } from './types';
import { msg } from './messages';
import { compileVimRegex, computeSearchCount } from './vimRegex';
import { getOptions } from './setOptionsCore';
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
} from './vimscriptValues';

export interface ExtraBuiltin {
  min: number;
  max: number;
  fn: (ctx: EvalContext, args: VimScriptValue[]) => VimScriptValue;
}

export function resolveWindowIndex(state: VimEditorState, nrArg: VimScriptValue): number {
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
 * 레지스터·태그 스택·점프 리스트·키매핑·명령행·검색 카운트·커스텀 매치·JSON 내장 함수 레지스트리
 */
export const EXTRA_EDITOR_BUILTINS: Record<string, ExtraBuiltin> = {
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

  // ---- 검색 카운트 & 커스텀 패턴 하이라이트 (searchcount / matchadd / matchdelete / getmatches / clearmatches) ----
  searchcount: {
    min: 0,
    max: 1,
    fn: (ctx, [optsArg]) => {
      const s = ctx.state;
      const vimOpts = getOptions(s);
      let pattern = s.lastSearchQuery ?? '';
      let maxcount = 99;
      let cursor = { ...s.cursor };
      if (optsArg !== undefined && isDict(optsArg)) {
        if ('pattern' in optsArg.items) {
          pattern = toVimString(optsArg.items.pattern);
        }
        if ('maxcount' in optsArg.items) {
          maxcount = Math.max(0, Math.trunc(toNumber(optsArg.items.maxcount)));
        }
        if ('pos' in optsArg.items && isList(optsArg.items.pos) && optsArg.items.pos.length >= 2) {
          const lnum = Math.max(1, Math.trunc(toNumber(optsArg.items.pos[0])));
          const col = Math.max(1, Math.trunc(toNumber(optsArg.items.pos[1])));
          cursor = { line: lnum - 1, col: col - 1 };
        }
      }
      const res = computeSearchCount(s.lines, pattern, cursor, {
        ignorecase: vimOpts.ignorecase,
        smartcase: vimOpts.smartcase,
        maxcount,
      });
      return makeDict({
        current: res.current,
        total: res.total,
        exact_match: res.exact_match,
        incomplete: res.incomplete,
        maxcount: res.maxcount,
      });
    },
  },
  matchadd: {
    min: 2,
    max: 4,
    fn: (ctx, [groupArg, patternArg, priorityArg, idArg]) => {
      const group = toVimString(groupArg).trim();
      const pattern = toVimString(patternArg);
      const priority = priorityArg !== undefined ? Math.trunc(toNumber(priorityArg)) : 10;
      if (!group || !pattern) return -1;
      try {
        compileVimRegex(pattern);
      } catch {
        return -1;
      }
      const existing = ctx.state.customMatches ?? [];
      let assignedId: number;
      if (idArg !== undefined) {
        const reqId = Math.trunc(toNumber(idArg));
        if (reqId === -1) {
          const maxExisting = existing.reduce((acc, m) => Math.max(acc, m.id), 3);
          assignedId = Math.max(ctx.state.nextMatchId ?? 4, maxExisting + 1);
        } else if (reqId <= 0 || existing.some((m) => m.id === reqId)) {
          return -1;
        } else {
          assignedId = reqId;
        }
      } else {
        const maxExisting = existing.reduce((acc, m) => Math.max(acc, m.id), 3);
        assignedId = Math.max(ctx.state.nextMatchId ?? 4, maxExisting + 1);
      }
      ctx.state = {
        ...ctx.state,
        customMatches: [...existing, { id: assignedId, group, pattern, priority }],
        nextMatchId: Math.max(ctx.state.nextMatchId ?? 4, assignedId + 1),
      };
      return assignedId;
    },
  },
  matchdelete: {
    min: 1,
    max: 1,
    fn: (ctx, [idArg]) => {
      const targetId = Math.trunc(toNumber(idArg));
      const existing = ctx.state.customMatches ?? [];
      const next = existing.filter((m) => m.id !== targetId);
      if (next.length === existing.length) return -1;
      ctx.state = {
        ...ctx.state,
        customMatches: next.length > 0 ? next : undefined,
      };
      return 0;
    },
  },
  getmatches: {
    min: 0,
    max: 0,
    fn: (ctx) =>
      (ctx.state.customMatches ?? []).map((m) =>
        makeDict({
          group: m.group,
          pattern: m.pattern,
          priority: m.priority,
          id: m.id,
        })
      ),
  },
  clearmatches: {
    min: 0,
    max: 0,
    fn: (ctx) => {
      ctx.state = {
        ...ctx.state,
        customMatches: undefined,
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
