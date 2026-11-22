import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';
import { DEFAULT_MATCHPAIRS, parseMatchpairs } from './bracketMatch';
import { getFiletypeCommentString } from './ftpluginEngine';
import { detectFiletype } from './syntaxEngine';
import {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
  WINDOW_LOCAL_OPTION_KEYS,
  parseListcharsEntries,
  validateColorcolumn,
} from './setOptionsCore';
import type { ListcharsEntry, ParsedListchars } from './setOptionsCore';

export type SetScope = 'both' | 'local' | 'global';

type FoldMethod = NonNullable<VimOptions['foldmethod']>;
type NumericOptionKey =
  | 'tabstop'
  | 'shiftwidth'
  | 'softtabstop'
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
  | 'cursorcolumn'
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
  | 'shiftround'
  | 'wrapscan'
  | 'foldenable'
  | 'startofline'
  | 'smarttab'
  | 'autopairs'
  | 'cmdlinepopup'
  | 'indentline'
  | 'matchparen'
  | 'rainbow'
  | 'bufferline'
  | 'satellite'
  | 'tscontext'
  | 'winbar'
  | 'colorizer'
  | 'illuminate';

const VALID_FOLDMETHODS: readonly FoldMethod[] = ['manual', 'indent', 'marker', 'syntax', 'expr'];
const VALID_NRFORMATS = new Set(['bin', 'octal', 'hex', 'alpha', 'unsigned', 'blank']);
const VALID_VIRTUALEDIT = new Set(['block', 'insert', 'all', 'onemore', 'none']);
const VALID_WILDMODE_ATOMS = new Set(['', 'full', 'longest', 'list', 'lastused']);
const VALID_WHICHWRAP_FLAGS = new Set(['b', 's', 'h', 'l', '<', '>', '~', '[', ']']);
const VALID_FORMATOPTIONS_FLAGS = new Set([
  't', 'c', 'r', 'o', 'q', 'w', 'a', 'n', '2', 'v', 'b', 'l', 'm', 'M', 'B', '1', 'j', 'p', '/',
]);
const NUMERIC_OPTION_KEYS = new Set<NumericOptionKey>([
  'tabstop',
  'shiftwidth',
  'softtabstop',
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
  'cursorcolumn',
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
  'wrapscan',
  'foldenable',
  'startofline',
  'smarttab',
  'autopairs',
  'cmdlinepopup',
  'indentline',
  'matchparen',
  'rainbow',
  'bufferline',
  'satellite',
  'tscontext',
  'winbar',
  'colorizer',
  'illuminate',
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

export interface SetDraftContext {
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

export function writeScopedOption<K extends keyof VimOptions>(
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

export function handleOptionQuery(ctx: SetDraftContext, token: string): VimEditorState | null {
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
    } else if (optKey === 'shortmess') {
      val = DEFAULT_VIM_OPTIONS.shortmess ?? 'filnxtToOF';
    } else if (optKey === 'colorcolumn') {
      val = DEFAULT_VIM_OPTIONS.colorcolumn ?? '';
    } else if (optKey === 'wildmode') {
      val = DEFAULT_VIM_OPTIONS.wildmode ?? 'full';
    } else if (optKey === 'whichwrap') {
      val = DEFAULT_VIM_OPTIONS.whichwrap ?? 'b,s';
    }
  }

  ctx.queryMessages.push(
    typeof val === 'boolean' ? (val ? optKey : `no${optKey}`) : `${optKey}=${val}`
  );
  return null;
}

export function handleOptionReset(ctx: SetDraftContext, token: string): VimEditorState | null {
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

function mergeCommaList(curParts: string[], newParts: string[], mod: string): string[] {
  if (mod === '+') {
    const out = [...curParts];
    for (const p of newParts) {
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }
  if (mod === '^') {
    const out = [...newParts];
    for (const p of curParts) {
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }
  if (mod === '-') {
    return curParts.filter((p) => !newParts.includes(p));
  }
  const out: string[] = [];
  for (const p of newParts) {
    if (!out.includes(p)) out.push(p);
  }
  return out;
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
  const nextVal = mergeCommaList(parseParts(curStr), rawParts, mod).join(',');
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

  if (mod === '-') {
    nextParts = curParts.filter((p) => !rawParts.includes(p));
    for (const p of rawParts) {
      if (p.length === 1 && /^[0-9]$/.test(p) && curParts.includes('48-57')) {
        nextParts.push(`^${p}`);
      } else if (p.length === 1 && /^[A-Za-z]$/.test(p) && curParts.includes('@')) {
        nextParts.push(`^${p}`);
      }
    }
  } else {
    nextParts = mod ? mergeCommaList(curParts, rawParts, mod) : rawParts;
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
  const nextParts = rawParts.includes('none')
    ? []
    : mergeCommaList(parseParts(curStr), rawParts, mod);
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
  const curRaw = ctx.nextLocal.matchpairs ?? ctx.nextGlobal.matchpairs ?? DEFAULT_MATCHPAIRS;
  const parsedCur = parseMatchpairs(curRaw);
  const curTokens = parsedCur.ok ? parsedCur.pairs.map(([o, c]) => `${o}:${c}`) : [];
  const nextVal = mergeCommaList(curTokens, newTokens, mod).join(',');
  writeScopedOption(ctx, 'matchpairs', nextVal);
  ctx.appliedList.push(`matchpairs=${nextVal}`);
  return null;
}

function handleShortmessAssignment(ctx: SetDraftContext, mod: string, rawVal: string): VimEditorState | null {
  const curVal =
    ctx.nextLocal.shortmess ?? ctx.nextGlobal.shortmess ?? DEFAULT_VIM_OPTIONS.shortmess ?? 'filnxtToOF';
  let nextVal = rawVal;
  if (mod === '+') {
    nextVal = curVal;
    for (const ch of rawVal) {
      if (!nextVal.includes(ch)) nextVal += ch;
    }
  } else if (mod === '^') {
    let prep = '';
    for (const ch of rawVal) {
      if (!prep.includes(ch)) prep += ch;
    }
    for (const ch of curVal) {
      if (!prep.includes(ch)) prep += ch;
    }
    nextVal = prep;
  } else if (mod === '-') {
    nextVal = [...curVal].filter((ch) => !rawVal.includes(ch)).join('');
  }
  writeScopedOption(ctx, 'shortmess', nextVal);
  ctx.appliedList.push(`shortmess=${nextVal}`);
  return null;
}

function handleColorcolumnAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  if (!validateColorcolumn(rawVal)) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }
  const curRaw =
    (ctx.isSplit ? ctx.nextPaneLocal.colorcolumn : undefined) ??
    ctx.nextLocal.colorcolumn ??
    ctx.nextGlobal.colorcolumn ??
    '';
  const parseParts = (s: string) =>
    s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  const nextVal = mergeCommaList(parseParts(curRaw), parseParts(rawVal), mod).join(',');
  writeScopedOption(ctx, 'colorcolumn', nextVal);
  ctx.appliedList.push(`colorcolumn=${nextVal}`);
  return null;
}

function handleWildmodeAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const parseWimStages = (raw: string) =>
    raw === '' ? [''] : raw.split(',').map((s) => s.trim().toLowerCase());
  const isValidStage = (stage: string): boolean => {
    if (stage === '') return true;
    const atoms = stage.split(':');
    if (atoms.length > 2) return false;
    return atoms.every((a) => VALID_WILDMODE_ATOMS.has(a));
  };
  const newStages = parseWimStages(rawVal);
  if (newStages.length > 4 || newStages.some((s) => !isValidStage(s))) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }
  const curStr =
    ctx.nextLocal.wildmode ?? ctx.nextGlobal.wildmode ?? DEFAULT_VIM_OPTIONS.wildmode ?? 'full';
  const curStages = curStr ? curStr.split(',').map((s) => s.trim().toLowerCase()) : [];
  let nextStages: string[];
  if (mod === '+') {
    nextStages = [...curStages, ...newStages.filter(Boolean)].slice(0, 4);
  } else if (mod === '^') {
    nextStages = [...newStages.filter(Boolean), ...curStages].slice(0, 4);
  } else if (mod === '-') {
    nextStages = curStages.filter((s) => !newStages.includes(s));
  } else {
    nextStages = newStages;
  }
  const nextVal = nextStages.join(',');
  writeScopedOption(ctx, 'wildmode', nextVal);
  ctx.appliedList.push(`wildmode=${nextVal}`);
  return null;
}

function handleWhichwrapAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  const parseParts = (s: string) =>
    s
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  const rawParts = parseParts(rawVal);
  if (rawParts.some((p) => !VALID_WHICHWRAP_FLAGS.has(p))) {
    return {
      ...ctx.state,
      bell: true,
      commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
    };
  }
  const curStr =
    ctx.nextLocal.whichwrap ?? ctx.nextGlobal.whichwrap ?? DEFAULT_VIM_OPTIONS.whichwrap ?? 'b,s';
  const nextVal = mergeCommaList(parseParts(curStr), rawParts, mod).join(',');
  writeScopedOption(ctx, 'whichwrap', nextVal);
  ctx.appliedList.push(`whichwrap=${nextVal}`);
  return null;
}

function handleFormatoptionsAssignment(
  ctx: SetDraftContext,
  mod: string,
  rawVal: string,
  token: string
): VimEditorState | null {
  for (const ch of rawVal) {
    if (!VALID_FORMATOPTIONS_FLAGS.has(ch)) {
      return {
        ...ctx.state,
        bell: true,
        commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
      };
    }
  }
  const curVal =
    ctx.nextLocal.formatoptions ?? ctx.nextGlobal.formatoptions ?? DEFAULT_VIM_OPTIONS.formatoptions ?? 'tcqj';
  let nextVal = rawVal;
  if (mod === '+') {
    nextVal = curVal;
    for (const ch of rawVal) {
      if (!nextVal.includes(ch)) nextVal += ch;
    }
  } else if (mod === '^') {
    let prep = '';
    for (const ch of rawVal) {
      if (!prep.includes(ch)) prep += ch;
    }
    for (const ch of curVal) {
      if (!prep.includes(ch)) prep += ch;
    }
    nextVal = prep;
  } else if (mod === '-') {
    nextVal = [...curVal].filter((ch) => !rawVal.includes(ch)).join('');
  }
  writeScopedOption(ctx, 'formatoptions', nextVal);
  ctx.appliedList.push(`formatoptions=${nextVal}`);
  return null;
}

export function handleOptionAssignment(ctx: SetDraftContext, token: string): VimEditorState | null {
  const eqIdx = token.indexOf('=');
  const rawKeyWithMod = token.slice(0, eqIdx);
  const mod =
    rawKeyWithMod.endsWith('+') || rawKeyWithMod.endsWith('^') || rawKeyWithMod.endsWith('-')
      ? rawKeyWithMod.slice(-1)
      : '';
  const rawKey = mod ? rawKeyWithMod.slice(0, -1) : rawKeyWithMod;
  const rawVal = token.slice(eqIdx + 1);
  const optKey = OPTION_ALIASES[rawKey];

  if (optKey === 'listchars') return handleListcharsAssignment(ctx, mod, rawVal, token);
  if (optKey === 'nrformats') return handleNrformatsAssignment(ctx, mod, rawVal, token);
  if (optKey === 'iskeyword') return handleIskeywordAssignment(ctx, mod, rawVal);
  if (optKey === 'virtualedit') return handleVirtualeditAssignment(ctx, mod, rawVal, token);
  if (optKey === 'matchpairs') return handleMatchpairsAssignment(ctx, mod, rawVal, token);
  if (optKey === 'shortmess') return handleShortmessAssignment(ctx, mod, rawVal);
  if (optKey === 'colorcolumn') return handleColorcolumnAssignment(ctx, mod, rawVal, token);
  if (optKey === 'wildmode') return handleWildmodeAssignment(ctx, mod, rawVal, token);
  if (optKey === 'whichwrap') return handleWhichwrapAssignment(ctx, mod, rawVal, token);
  if (optKey === 'formatoptions') return handleFormatoptionsAssignment(ctx, mod, rawVal, token);

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
  const minVal =
    optKey === 'softtabstop' ? -1 : ZERO_ALLOWED_NUMERIC_KEYS.has(optKey) ? 0 : 1;
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

export function handleBooleanOption(
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
