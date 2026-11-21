import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';
import { setActiveCursorContext } from './cursor';
import { setActiveIskeyword } from './wordMotion';
import { DEFAULT_MATCHPAIRS, parseMatchpairs, setActiveMatchpairs } from './bracketMatch';
import { applyFiletypeIndent, getFiletypeCommentString } from './ftpluginEngine';
import { detectFiletype } from './syntaxEngine';
import {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
  WINDOW_LOCAL_OPTION_KEYS,
  parseListcharsEntries,
  parseListchars,
  getGlobalOptions,
  getLocalOptions,
  getOptions,
  formatOptionsList,
  tokenizeSetArgs,
} from './setOptionsCore';
import type { ListcharsEntry, ParsedListchars } from './setOptionsCore';

export {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
  parseListchars,
  getGlobalOptions,
  getLocalOptions,
  getOptions,
  formatOptionsList,
};
export type { ParsedListchars };

type SetScope = 'both' | 'local' | 'global';
type FoldMethod = NonNullable<VimOptions['foldmethod']>;
type NumericOptionKey =
  | 'tabstop'
  | 'shiftwidth'
  | 'textwidth'
  | 'scrolloff'
  | 'sidescroll'
  | 'sidescrolloff';
type BooleanOrSyntaxOptionKey =
  | 'number'
  | 'relativenumber'
  | 'ignorecase'
  | 'smartcase'
  | 'hlsearch'
  | 'incsearch'
  | 'wrap'
  | 'cursorline'
  | 'expandtab'
  | 'list'
  | 'wildmenu'
  | 'spell'
  | 'syntax'
  | 'scrollbind'
  | 'modifiable'
  | 'readonly'
  | 'autoindent'
  | 'smartindent'
  | 'shiftround';

const VALID_FOLDMETHODS: readonly FoldMethod[] = ['manual', 'indent', 'marker', 'syntax', 'expr'];
const VALID_NRFORMATS = new Set(['bin', 'octal', 'hex', 'alpha', 'unsigned', 'blank']);
const VALID_VIRTUALEDIT = new Set(['block', 'insert', 'all', 'onemore', 'none']);
const NUMERIC_OPTION_KEYS = new Set<NumericOptionKey>([
  'tabstop',
  'shiftwidth',
  'textwidth',
  'scrolloff',
  'sidescroll',
  'sidescrolloff',
]);
const ZERO_ALLOWED_NUMERIC_KEYS = new Set<NumericOptionKey>([
  'textwidth',
  'scrolloff',
  'sidescroll',
  'sidescrolloff',
]);
const BOOLEAN_OR_SYNTAX_KEYS = new Set<BooleanOrSyntaxOptionKey>([
  'number',
  'relativenumber',
  'ignorecase',
  'smartcase',
  'hlsearch',
  'incsearch',
  'wrap',
  'cursorline',
  'expandtab',
  'list',
  'wildmenu',
  'spell',
  'syntax',
  'scrollbind',
  'modifiable',
  'readonly',
  'autoindent',
  'smartindent',
  'shiftround',
]);

const DEFAULT_ERRORFORMAT = '%f:%l:%c:%m,%f:%l:%m,%f(%l\\,%c):%m';
const DEFAULT_GREPPRG = 'grep -n $* /dev/null';
const DEFAULT_LISTCHARS = DEFAULT_VIM_OPTIONS.listchars ?? 'tab:> ,trail:-,nbsp:+';

function isFoldMethod(val: string): val is FoldMethod {
  return (VALID_FOLDMETHODS as readonly string[]).includes(val);
}

function isNumericOptionKey(key: keyof VimOptions): key is NumericOptionKey {
  return NUMERIC_OPTION_KEYS.has(key as NumericOptionKey);
}

function isBooleanOrSyntaxOptionKey(key: keyof VimOptions): key is BooleanOrSyntaxOptionKey {
  return BOOLEAN_OR_SYNTAX_KEYS.has(key as BooleanOrSyntaxOptionKey);
}

interface SetDraftContext {
  state: VimEditorState;
  scope: SetScope;
  nextGlobal: VimOptions;
  nextLocal: Partial<VimOptions>;
  nextPaneLocal: Partial<VimOptions>;
  isSplit: boolean;
  activePaneScrollbind: boolean | undefined;
  updatedFiletype: string | undefined;
  updatedScrollbind: boolean | undefined;
  queryMessages: string[];
  appliedList: string[];
}

function writeScopedOption<K extends keyof VimOptions>(
  ctx: SetDraftContext,
  optKey: K,
  value: VimOptions[K]
): void {
  if (ctx.isSplit && WINDOW_LOCAL_OPTION_KEYS.has(optKey)) {
    if (ctx.scope === 'local' || ctx.scope === 'both') {
      ctx.nextPaneLocal[optKey] = value;
    }
    if (ctx.scope === 'both' && !(ctx.scope as string === 'local')) {
      ctx.nextLocal[optKey] = value;
    }
  } else if (ctx.scope === 'local' || ctx.scope === 'both') {
    ctx.nextLocal[optKey] = value;
  }
  if (ctx.scope === 'global' || ctx.scope === 'both') {
    ctx.nextGlobal[optKey] = value;
  }
}

function resetOptionToDefault<K extends keyof VimOptions>(
  ctx: SetDraftContext,
  optKey: K
): void {
  const defVal = DEFAULT_VIM_OPTIONS[optKey];
  writeScopedOption(ctx, optKey, defVal);
  ctx.appliedList.push(
    typeof defVal === 'boolean'
      ? defVal
        ? optKey
        : `no${optKey}`
      : `${optKey}=${defVal ?? ''}`
  );
}

function handleOptionQuery(ctx: SetDraftContext, token: string): VimEditorState | null {
  const queryName = token.slice(0, -1);
  const optKey = OPTION_ALIASES[queryName];
  if (!optKey) {
    return {
      ...ctx.state,
      commandMessage: msg('E518: 알 수 없는 옵션: {queryName}', { queryName }),
    };
  }

  let val: VimOptions[keyof VimOptions];
  if (optKey === 'scrollbind' && ctx.scope !== 'global' && ctx.activePaneScrollbind !== undefined) {
    val = ctx.updatedScrollbind ?? ctx.activePaneScrollbind;
  } else if (ctx.scope === 'global') {
    val = ctx.nextGlobal[optKey];
  } else if (ctx.isSplit && WINDOW_LOCAL_OPTION_KEYS.has(optKey) && ctx.nextPaneLocal[optKey] !== undefined) {
    val = ctx.nextPaneLocal[optKey];
  } else {
    val = ctx.nextLocal[optKey] ?? ctx.nextGlobal[optKey];
  }

  if (val === undefined) {
    if (optKey === 'commentstring') {
      const ft =
        ctx.nextLocal.filetype ?? ctx.nextGlobal.filetype ?? detectFiletype(ctx.state.primaryFilename);
      val = getFiletypeCommentString(ft) ?? '// %s';
    } else if (optKey === 'errorformat') {
      val = DEFAULT_ERRORFORMAT;
    } else if (optKey === 'grepprg') {
      val = DEFAULT_GREPPRG;
    } else if (optKey === 'foldexpr') {
      val = '0';
    } else if (optKey === 'foldmarker') {
      val = '{{{,}}}';
    } else if (optKey === 'nrformats') {
      val = 'bin,hex';
    } else if (optKey === 'listchars') {
      val = DEFAULT_VIM_OPTIONS.listchars;
    } else if (optKey === 'inccommand') {
      val = DEFAULT_VIM_OPTIONS.inccommand ?? 'nosplit';
    } else if (optKey === 'iskeyword') {
      val = DEFAULT_VIM_OPTIONS.iskeyword ?? '@,48-57,_,192-255';
    } else if (optKey === 'virtualedit') {
      val = DEFAULT_VIM_OPTIONS.virtualedit ?? '';
    } else if (optKey === 'matchpairs') {
      val = DEFAULT_MATCHPAIRS;
    }
  }

  ctx.queryMessages.push(
    typeof val === 'boolean' ? (val ? optKey : `no${optKey}`) : `${optKey}=${val}`
  );
  return null;
}

function handleOptionReset(ctx: SetDraftContext, token: string): VimEditorState | null {
  const rawKey = token.slice(0, -1);
  const optKey = OPTION_ALIASES[rawKey];
  if (!optKey) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
    };
  }
  resetOptionToDefault(ctx, optKey);
  return null;
}

function handleListcharsAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const curStr = ctx.nextLocal.listchars ?? ctx.nextGlobal.listchars ?? DEFAULT_LISTCHARS;
  const curParsed = parseListcharsEntries(curStr);
  const curEntries = curParsed.ok ? curParsed.entries : [];
  let nextEntries: ListcharsEntry[];

  if (mod === '-') {
    const removeParts = rawVal ? rawVal.split(',').filter(Boolean) : [];
    nextEntries = curEntries.filter((entry) => {
      for (const rem of removeParts) {
        if (rem.includes(':')) {
          if (`${entry.key}:${entry.val}` === rem) return false;
        } else if (entry.key === rem) {
          return false;
        }
      }
      return true;
    });
  } else {
    const parsedVal = parseListcharsEntries(rawVal, token);
    if (!parsedVal.ok) {
      return { ...ctx.state, bell: true, commandMessage: parsedVal.error };
    }
    if (mod === '+' || mod === '^') {
      const incomingKeys = new Set(parsedVal.entries.map((e) => e.key));
      const remaining = curEntries.filter((e) => !incomingKeys.has(e.key));
      nextEntries =
        mod === '^' ? [...parsedVal.entries, ...remaining] : [...remaining, ...parsedVal.entries];
    } else {
      const map = new Map<keyof ParsedListchars, string>();
      for (const entry of parsedVal.entries) {
        map.set(entry.key, entry.val);
      }
      nextEntries = Array.from(map.entries()).map(([key, val]) => ({ key, val }));
    }
  }

  const nextVal = nextEntries.map((e) => `${e.key}:${e.val}`).join(',');
  writeScopedOption(ctx, 'listchars', nextVal);
  ctx.appliedList.push(`listchars=${nextVal}`);
  return null;
}

function handleNrformatsAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const parseParts = (s: string) =>
    s
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
  const rawParts = parseParts(rawVal);
  if (rawParts.some((p) => !VALID_NRFORMATS.has(p))) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }

  const curStr =
    ctx.nextLocal.nrformats ?? ctx.nextGlobal.nrformats ?? DEFAULT_VIM_OPTIONS.nrformats ?? 'bin,hex';
  const curParts = parseParts(curStr);
  let nextParts: string[];

  if (mod === '+') {
    nextParts = [...curParts];
    for (const p of rawParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '^') {
    nextParts = [...rawParts];
    for (const p of curParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '-') {
    nextParts = curParts.filter((p) => !rawParts.includes(p));
  } else {
    nextParts = [];
    for (const p of rawParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  }

  const nextVal = nextParts.join(',');
  writeScopedOption(ctx, 'nrformats', nextVal);
  ctx.appliedList.push(`nrformats=${nextVal}`);
  return null;
}

function handleIskeywordAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string
): VimEditorState | null {
  const parseParts = (s: string) =>
    s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  const rawParts = parseParts(rawVal);
  const curStr =
    ctx.nextLocal.iskeyword ??
    ctx.nextGlobal.iskeyword ??
    DEFAULT_VIM_OPTIONS.iskeyword ??
    '@,48-57,_,192-255';
  const curParts = parseParts(curStr);
  let nextParts: string[];

  if (mod === '+') {
    nextParts = [...curParts];
    for (const p of rawParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '^') {
    nextParts = [...rawParts];
    for (const p of curParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '-') {
    nextParts = curParts.filter((p) => !rawParts.includes(p));
    for (const p of rawParts) {
      if (p.length === 1 && /^[0-9]$/.test(p) && curParts.includes('48-57')) {
        nextParts.push(`^${p}`);
      } else if (p.length === 1 && /^[A-Za-z]$/.test(p) && curParts.includes('@')) {
        nextParts.push(`^${p}`);
      }
    }
  } else {
    nextParts = rawParts;
  }

  const nextVal = nextParts.join(',');
  writeScopedOption(ctx, 'iskeyword', nextVal);
  ctx.appliedList.push(`iskeyword=${nextVal}`);
  return null;
}

function handleVirtualeditAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const parseParts = (s: string) =>
    s
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
  const rawParts = parseParts(rawVal);
  if (rawParts.some((p) => !VALID_VIRTUALEDIT.has(p))) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }

  const curStr =
    ctx.nextLocal.virtualedit ?? ctx.nextGlobal.virtualedit ?? DEFAULT_VIM_OPTIONS.virtualedit ?? '';
  const curParts = parseParts(curStr);
  let nextParts: string[];

  if (rawParts.includes('none')) {
    nextParts = [];
  } else if (mod === '+') {
    nextParts = [...curParts];
    for (const p of rawParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '^') {
    nextParts = [...rawParts];
    for (const p of curParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  } else if (mod === '-') {
    nextParts = curParts.filter((p) => !rawParts.includes(p));
  } else {
    nextParts = [];
    for (const p of rawParts) {
      if (!nextParts.includes(p)) nextParts.push(p);
    }
  }

  const nextVal = nextParts.join(',');
  writeScopedOption(ctx, 'virtualedit', nextVal);
  ctx.appliedList.push(`virtualedit=${nextVal}`);
  return null;
}

function handleMatchpairsAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const parsedNew = parseMatchpairs(rawVal);
  if (!parsedNew.ok) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }
  const newTokens = parsedNew.pairs.map(([o, c]) => `${o}:${c}`);
  const curRaw =
    ctx.nextLocal.matchpairs ?? ctx.nextGlobal.matchpairs ?? DEFAULT_MATCHPAIRS;
  const parsedCur = parseMatchpairs(curRaw);
  const curTokens = parsedCur.ok ? parsedCur.pairs.map(([o, c]) => `${o}:${c}`) : [];

  let nextTokens: string[];
  if (mod === '+') {
    nextTokens = [...curTokens];
    for (const t of newTokens) {
      if (!nextTokens.includes(t)) nextTokens.push(t);
    }
  } else if (mod === '^') {
    nextTokens = [...newTokens];
    for (const t of curTokens) {
      if (!nextTokens.includes(t)) nextTokens.push(t);
    }
  } else if (mod === '-') {
    nextTokens = curTokens.filter((t) => !newTokens.includes(t));
  } else {
    nextTokens = [];
    for (const t of newTokens) {
      if (!nextTokens.includes(t)) nextTokens.push(t);
    }
  }

  const nextVal = nextTokens.join(',');
  writeScopedOption(ctx, 'matchpairs', nextVal);
  ctx.appliedList.push(`matchpairs=${nextVal}`);
  return null;
}

function handleOptionAssignment(ctx: SetDraftContext, token: string): VimEditorState | null {
  const eqIdx = token.indexOf('=');
  const rawKeyWithMod = token.slice(0, eqIdx);
  const mod =
    rawKeyWithMod.endsWith('+') || rawKeyWithMod.endsWith('^') || rawKeyWithMod.endsWith('-')
      ? rawKeyWithMod.slice(-1)
      : '';
  const rawKey = mod ? rawKeyWithMod.slice(0, -1) : rawKeyWithMod;
  const rawVal = token.slice(eqIdx + 1);
  const optKey = OPTION_ALIASES[rawKey];

  if (optKey === 'listchars') {
    return handleListcharsAssignment(ctx, mod, rawVal, token);
  }
  if (optKey === 'nrformats') {
    return handleNrformatsAssignment(ctx, mod, rawVal, token);
  }
  if (optKey === 'iskeyword') {
    return handleIskeywordAssignment(ctx, mod, rawVal);
  }
  if (optKey === 'virtualedit') {
    return handleVirtualeditAssignment(ctx, mod, rawVal, token);
  }
  if (optKey === 'matchpairs') {
    return handleMatchpairsAssignment(ctx, mod, rawVal, token);
  }
  if (optKey === 'errorformat' || optKey === 'grepprg') {
    const currentStr =
      (ctx.nextLocal[optKey] ?? ctx.nextGlobal[optKey]) ??
      (optKey === 'errorformat' ? DEFAULT_ERRORFORMAT : DEFAULT_GREPPRG);
    let nextStr = rawVal;
    if (optKey === 'errorformat' && mod === '+') {
      nextStr = currentStr ? `${currentStr},${rawVal}` : rawVal;
    } else if (optKey === 'errorformat' && mod === '^') {
      nextStr = currentStr ? `${rawVal},${currentStr}` : rawVal;
    } else if (optKey === 'errorformat' && mod === '-') {
      nextStr = currentStr
        .split(',')
        .filter((part) => part !== rawVal)
        .join(',');
    }
    writeScopedOption(ctx, optKey, nextStr);
    ctx.appliedList.push(`${optKey}=${nextStr}`);
    return null;
  }
  if (optKey === 'commentstring') {
    if (rawVal !== '' && !rawVal.includes('%s')) {
      return {
        ...ctx.state,
        bell: true,
        commandMessage: msg(
          'E537: \'commentstring\' 값은 비어 있거나 %s를 포함해야 합니다: {token}',
          { token }
        ),
      };
    }
    writeScopedOption(ctx, 'commentstring', rawVal);
    ctx.appliedList.push(`commentstring=${rawVal}`);
    return null;
  }
  if (optKey === 'filetype') {
    writeScopedOption(ctx, 'filetype', rawVal);
    ctx.appliedList.push(`filetype=${rawVal}`);
    ctx.updatedFiletype = rawVal;
    return null;
  }
  if (optKey === 'syntax') {
    writeScopedOption(ctx, 'syntax', rawVal);
    ctx.appliedList.push(`syntax=${rawVal}`);
    return null;
  }
  if (optKey === 'inccommand') {
    const icmVal = rawVal.toLowerCase();
    if (icmVal !== '' && icmVal !== 'nosplit' && icmVal !== 'split') {
      return {
        ...ctx.state,
        bell: true,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
      };
    }
    writeScopedOption(ctx, 'inccommand', icmVal as '' | 'nosplit' | 'split');
    ctx.appliedList.push(`inccommand=${icmVal}`);
    return null;
  }
  if (optKey === 'foldmethod') {
    const method = rawVal.toLowerCase();
    if (!isFoldMethod(method)) {
      return {
        ...ctx.state,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
      };
    }
    writeScopedOption(ctx, 'foldmethod', method);
    ctx.appliedList.push(`foldmethod=${method}`);
    return null;
  }
  if (optKey === 'foldexpr') {
    const exprVal = rawVal.length > 0 ? rawVal : '0';
    writeScopedOption(ctx, 'foldexpr', exprVal);
    ctx.appliedList.push(`foldexpr=${exprVal}`);
    return null;
  }
  if (optKey === 'foldmarker') {
    const commaIdx = rawVal.indexOf(',');
    const startM = commaIdx >= 0 ? rawVal.slice(0, commaIdx) : '';
    const endM = commaIdx >= 0 ? rawVal.slice(commaIdx + 1) : '';
    if (commaIdx <= 0 || !startM || !endM) {
      return {
        ...ctx.state,
        bell: true,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
      };
    }
    writeScopedOption(ctx, 'foldmarker', rawVal);
    ctx.appliedList.push(`foldmarker=${rawVal}`);
    return null;
  }
  if (optKey === 'foldlevel') {
    const numVal = parseInt(rawVal, 10);
    if (isNaN(numVal) || numVal < 0) {
      return {
        ...ctx.state,
        commandMessage: msg('E521: 잘못된 숫자 인수: {token}', { token }),
      };
    }
    writeScopedOption(ctx, 'foldlevel', numVal);
    ctx.appliedList.push(`foldlevel=${numVal}`);
    return null;
  }
  if (!optKey || !isNumericOptionKey(optKey)) {
    return {
      ...ctx.state,
      commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
    };
  }

  const numVal = parseInt(rawVal, 10);
  const minVal = ZERO_ALLOWED_NUMERIC_KEYS.has(optKey) ? 0 : 1;
  if (isNaN(numVal) || numVal < minVal) {
    return {
      ...ctx.state,
      commandMessage: msg('E521: 잘못된 숫자 인수: {token}', { token }),
    };
  }
  writeScopedOption(ctx, optKey, numVal);
  ctx.appliedList.push(`${optKey}=${numVal}`);
  return null;
}

function handleBooleanOption(
  ctx: SetDraftContext,
  token: string,
  mode: 'toggle' | 'off' | 'on'
): VimEditorState | null {
  const rawKey = mode === 'toggle' ? token.slice(0, -1) : mode === 'off' ? token.slice(2) : token;
  const optKey = OPTION_ALIASES[rawKey];
  if (!optKey) {
    return {
      ...ctx.state,
      commandMessage:
        mode === 'toggle'
          ? msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey })
          : msg('E518: 알 수 없는 옵션: {token}', { token }),
    };
  }

  if (!isBooleanOrSyntaxOptionKey(optKey)) {
    return null;
  }

  const curVal =
    optKey === 'scrollbind' &&
    ctx.scope !== 'global' &&
    (ctx.updatedScrollbind !== undefined || ctx.activePaneScrollbind !== undefined)
      ? (ctx.updatedScrollbind ?? ctx.activePaneScrollbind)
      : ctx.isSplit && ctx.scope !== 'global' && WINDOW_LOCAL_OPTION_KEYS.has(optKey) && ctx.nextPaneLocal[optKey] !== undefined
        ? ctx.nextPaneLocal[optKey]
        : (ctx.nextLocal[optKey] ?? ctx.nextGlobal[optKey]);

  if (typeof curVal !== 'boolean' && optKey !== 'syntax') {
    return null;
  }

  const nextVal = mode === 'toggle' ? !curVal : mode === 'on';
  if (optKey === 'scrollbind' && ctx.isSplit) {
    if (ctx.scope !== 'global') ctx.updatedScrollbind = nextVal;
    if (ctx.scope === 'global' || ctx.scope === 'both') ctx.nextGlobal.scrollbind = nextVal;
  } else {
    writeScopedOption(ctx, optKey, nextVal);
  }
  ctx.appliedList.push(nextVal ? optKey : `no${optKey}`);
  return null;
}

/**
 * :set, :setlocal, :setglobal 커맨드를 파싱하여 상태의 옵션을 갱신합니다.
 * scope:
 *  - 'both': :set / :se (전역 및 현재 버퍼 로컬 모두 갱신)
 *  - 'local': :setlocal / :setl (현재 버퍼 전용 로컬 오버라이드 갱신)
 *  - 'global': :setglobal / :setg (전역 기본값만 갱신)
 */
export function executeSetCommand(
  state: VimEditorState,
  rawArgs: string,
  scope: SetScope = 'both'
): VimEditorState {
  const trimmed = rawArgs.trim();
  const curId = state.currentBufferId ?? 1;
  const curGlobal = getGlobalOptions(state);
  const curLocal = getLocalOptions(state, curId);
  const effective = getOptions(state);

  // 1. :set all
  if (trimmed === 'all') {
    return { ...state, commandMessage: formatOptionsList(effective, true) };
  }

  const isSplit = !!(state.splitPanes && state.splitDirection && state.splitDirection !== 'none');
  const activePaneIdx = state.activePaneIndex ?? 0;
  const activePane = isSplit ? state.splitPanes?.[activePaneIdx] : undefined;
  const activePaneScrollbind = activePane?.scrollbind;

  // 2. 인자 없음 (:set, :setlocal, :setglobal)
  if (trimmed === '') {
    if (scope === 'local') {
      const header = '--- Local Options ---';
      const mergedLocal = { ...curLocal, ...(activePane?.localOptions ?? {}) };
      if (Object.keys(mergedLocal).length === 0) {
        return {
          ...state,
          commandMessage: msg('{header}\\n(기본값과 다른 설정이 없습니다)', { header }),
        };
      }
      return {
        ...state,
        commandMessage: formatOptionsList({ ...DEFAULT_VIM_OPTIONS, ...mergedLocal }, false, header),
      };
    }
    if (scope === 'global') {
      return {
        ...state,
        commandMessage: formatOptionsList(curGlobal, false, '--- Global Options ---'),
      };
    }
    return { ...state, commandMessage: formatOptionsList(effective, false) };
  }

  const ctx: SetDraftContext = {
    state,
    scope,
    nextGlobal: { ...curGlobal },
    nextLocal: { ...curLocal },
    nextPaneLocal: { ...(activePane?.localOptions ?? {}) },
    isSplit,
    activePaneScrollbind,
    updatedFiletype: undefined,
    updatedScrollbind: undefined,
    queryMessages: [],
    appliedList: [],
  };

  for (const token of tokenizeSetArgs(trimmed)) {
    let errState: VimEditorState | null = null;
    if (token.endsWith('?')) {
      errState = handleOptionQuery(ctx, token);
    } else if (token.endsWith('&')) {
      errState = handleOptionReset(ctx, token);
    } else if (token.includes('=')) {
      errState = handleOptionAssignment(ctx, token);
    } else if (token.endsWith('!')) {
      errState = handleBooleanOption(ctx, token, 'toggle');
    } else if (token.startsWith('no')) {
      errState = handleBooleanOption(ctx, token, 'off');
    } else {
      errState = handleBooleanOption(ctx, token, 'on');
    }
    if (errState) return errState;
  }

  const nextEffective: VimOptions = {
    ...DEFAULT_VIM_OPTIONS,
    ...ctx.nextGlobal,
    ...ctx.nextLocal,
    ...(isSplit ? ctx.nextPaneLocal : {}),
    ...(isSplit && (ctx.updatedScrollbind !== undefined || activePaneScrollbind !== undefined)
      ? { scrollbind: ctx.updatedScrollbind ?? activePaneScrollbind }
      : {}),
  };

  setActiveIskeyword(nextEffective.iskeyword);
  setActiveMatchpairs(nextEffective.matchpairs);
  setActiveCursorContext(state.mode, nextEffective.virtualedit);

  const hasPaneLocalUpdates = Object.keys(ctx.nextPaneLocal).length > 0;
  const nextSplitPanes =
    isSplit && (ctx.updatedScrollbind !== undefined || hasPaneLocalUpdates) && state.splitPanes
      ? state.splitPanes.map((pane, idx) =>
          idx === activePaneIdx
            ? {
                ...pane,
                ...(ctx.updatedScrollbind !== undefined ? { scrollbind: ctx.updatedScrollbind } : {}),
                ...(hasPaneLocalUpdates ? { localOptions: ctx.nextPaneLocal } : {}),
              }
            : pane
        )
      : state.splitPanes;

  const nextBufferLocalOptions = {
    ...(state.bufferLocalOptions ?? {}),
    [curId]: ctx.nextLocal,
  };

  const nextBuffers = state.buffers
    ? state.buffers.map((b) =>
        b.id === curId
          ? {
              ...b,
              localOptions: ctx.nextLocal,
              filetype: ctx.nextLocal.filetype ?? b.filetype,
            }
          : b
      )
    : undefined;

  let message: string | undefined;
  if (ctx.queryMessages.length > 0) {
    message = ctx.queryMessages.join('  ');
  } else if (ctx.appliedList.length > 0) {
    const scopePrefix =
      scope === 'local'
        ? '[Local Option]'
        : scope === 'global'
          ? '[Global Option]'
          : '[Option]';
    message = `${scopePrefix} ${ctx.appliedList.join(' ')}`;
  }

  let finalState: VimEditorState = {
    ...state,
    options: nextEffective,
    globalOptions: ctx.nextGlobal,
    bufferLocalOptions: nextBufferLocalOptions,
    buffers: nextBuffers,
    splitPanes: nextSplitPanes,
    commandMessage: message,
  };

  if (ctx.updatedFiletype) {
    finalState = applyFiletypeIndent(finalState, ctx.updatedFiletype);
  }

  return finalState;
}
