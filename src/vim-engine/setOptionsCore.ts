import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';

export const DEFAULT_VIM_OPTIONS: VimOptions = {
  number: true,
  relativenumber: false,
  ignorecase: false,
  smartcase: false,
  hlsearch: true,
  incsearch: true,
  inccommand: 'nosplit',
  wrap: true,
  cursorline: true,
  tabstop: 2,
  shiftwidth: 2,
  expandtab: true,
  textwidth: 0,
  formatoptions: 'tcqj',
  scrolloff: 0,
  sidescroll: 0,
  sidescrolloff: 0,
  list: false,
  listchars: 'tab:> ,trail:-,nbsp:+',
  wildmenu: true,
  spell: false,
  syntax: true,
  foldmethod: 'manual',
  foldexpr: '0',
  foldmarker: '{{{,}}}',
  foldlevel: 0,
  foldenable: true,
  scrollbind: false,
  nrformats: 'bin,hex',
  modifiable: true,
  readonly: false,
  iskeyword: '@,48-57,_,192-255',
  virtualedit: '',
  autoindent: false,
  smartindent: false,
  shiftround: false,
  matchpairs: '(:),{:},[:]',
  shortmess: 'filnxtToOF',
  colorcolumn: '',
  cursorcolumn: false,
  wildmode: 'full',
  wrapscan: true,
  whichwrap: 'b,s',
  softtabstop: 0,
  startofline: false,
  smarttab: false,
};

export const OPTION_ALIASES: Record<string, keyof VimOptions> = {
  nu: 'number',
  number: 'number',
  rnu: 'relativenumber',
  relativenumber: 'relativenumber',
  ic: 'ignorecase',
  ignorecase: 'ignorecase',
  scs: 'smartcase',
  smartcase: 'smartcase',
  hls: 'hlsearch',
  hlsearch: 'hlsearch',
  is: 'incsearch',
  incsearch: 'incsearch',
  icm: 'inccommand',
  inccommand: 'inccommand',
  wrap: 'wrap',
  cul: 'cursorline',
  cursorline: 'cursorline',
  ts: 'tabstop',
  tabstop: 'tabstop',
  sw: 'shiftwidth',
  shiftwidth: 'shiftwidth',
  et: 'expandtab',
  expandtab: 'expandtab',
  tw: 'textwidth',
  textwidth: 'textwidth',
  fo: 'formatoptions',
  formatoptions: 'formatoptions',
  so: 'scrolloff',
  scrolloff: 'scrolloff',
  ss: 'sidescroll',
  sidescroll: 'sidescroll',
  siso: 'sidescrolloff',
  sidescrolloff: 'sidescrolloff',
  list: 'list',
  lcs: 'listchars',
  listchars: 'listchars',
  wmenu: 'wildmenu',
  wildmenu: 'wildmenu',
  spell: 'spell',
  ft: 'filetype',
  filetype: 'filetype',
  syn: 'syntax',
  syntax: 'syntax',
  fdm: 'foldmethod',
  foldmethod: 'foldmethod',
  fde: 'foldexpr',
  foldexpr: 'foldexpr',
  fmr: 'foldmarker',
  foldmarker: 'foldmarker',
  fdl: 'foldlevel',
  foldlevel: 'foldlevel',
  fen: 'foldenable',
  foldenable: 'foldenable',
  cms: 'commentstring',
  commentstring: 'commentstring',
  efm: 'errorformat',
  errorformat: 'errorformat',
  gp: 'grepprg',
  grepprg: 'grepprg',
  scb: 'scrollbind',
  scrollbind: 'scrollbind',
  nf: 'nrformats',
  nrformats: 'nrformats',
  ma: 'modifiable',
  modifiable: 'modifiable',
  ro: 'readonly',
  readonly: 'readonly',
  isk: 'iskeyword',
  iskeyword: 'iskeyword',
  ve: 'virtualedit',
  virtualedit: 'virtualedit',
  ai: 'autoindent',
  autoindent: 'autoindent',
  si: 'smartindent',
  smartindent: 'smartindent',
  sr: 'shiftround',
  shiftround: 'shiftround',
  mps: 'matchpairs',
  matchpairs: 'matchpairs',
  shm: 'shortmess',
  shortmess: 'shortmess',
  cc: 'colorcolumn',
  colorcolumn: 'colorcolumn',
  cuc: 'cursorcolumn',
  cursorcolumn: 'cursorcolumn',
  wim: 'wildmode',
  wildmode: 'wildmode',
  ws: 'wrapscan',
  wrapscan: 'wrapscan',
  ww: 'whichwrap',
  whichwrap: 'whichwrap',
  sts: 'softtabstop',
  softtabstop: 'softtabstop',
  sol: 'startofline',
  startofline: 'startofline',
  sta: 'smarttab',
  smarttab: 'smarttab',
};

export const WINDOW_LOCAL_OPTION_KEYS = new Set<keyof VimOptions>([
  'number',
  'relativenumber',
  'wrap',
  'cursorline',
  'cursorcolumn',
  'colorcolumn',
  'list',
  'listchars',
  'spell',
  'foldmethod',
  'foldexpr',
  'foldmarker',
  'foldlevel',
  'foldenable',
  'scrolloff',
  'sidescroll',
  'sidescrolloff',
  'scrollbind',
]);

export interface ParsedListchars {
  eol?: string;
  tab?: string;
  space?: string;
  multispace?: string;
  lead?: string;
  leadmultispace?: string;
  trail?: string;
  extends?: string;
  precedes?: string;
  conceal?: string;
  nbsp?: string;
}

const VALID_LISTCHARS_KEYS = new Set<keyof ParsedListchars>([
  'eol',
  'tab',
  'space',
  'multispace',
  'lead',
  'leadmultispace',
  'trail',
  'extends',
  'precedes',
  'conceal',
  'nbsp',
]);

export interface ListcharsEntry {
  key: keyof ParsedListchars;
  val: string;
}

export function parseListcharsEntries(
  raw: string,
  fullToken = raw
): { ok: true; entries: ListcharsEntry[] } | { ok: false; error: string } {
  if (raw === '') {
    return { ok: true, entries: [] };
  }
  const entries: ListcharsEntry[] = [];
  for (const part of raw.split(',')) {
    const colonIdx = part.indexOf(':');
    if (colonIdx <= 0) {
      return {
        ok: false,
        error: msg('E474: 잘못된 인수입니다: {token}', { token: fullToken }),
      };
    }
    const key = part.slice(0, colonIdx) as keyof ParsedListchars;
    const val = part.slice(colonIdx + 1);
    if (!VALID_LISTCHARS_KEYS.has(key)) {
      return {
        ok: false,
        error: msg('E474: 잘못된 인수입니다: {token}', { token: fullToken }),
      };
    }
    if (key === 'tab') {
      if (val.length < 2 || val.length > 3) {
        return {
          ok: false,
          error: msg('E1511: "{field}" 필드의 문자 수가 잘못되었습니다: {token}', {
            field: key,
            token: fullToken,
          }),
        };
      }
    } else if (key === 'multispace' || key === 'leadmultispace') {
      if (val.length < 1) {
        return {
          ok: false,
          error: msg('E1511: "{field}" 필드의 문자 수가 잘못되었습니다: {token}', {
            field: key,
            token: fullToken,
          }),
        };
      }
    } else if (val.length !== 1) {
      return {
        ok: false,
        error: msg('E1511: "{field}" 필드의 문자 수가 잘못되었습니다: {token}', {
          field: key,
          token: fullToken,
        }),
      };
    }
    entries.push({ key, val });
  }
  return { ok: true, entries };
}

/**
 * colorcolumn 옵션 문자열의 유효성을 검사합니다. (예: "80", "80,100", "+1,-2", "")
 */
export function validateColorcolumn(raw: string): boolean {
  if (raw.trim() === '') return true;
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (!/^[+-]?\d+$/.test(t)) return false;
  }
  return true;
}

/**
 * colorcolumn 옵션 문자열을 0-based 컬럼 인덱스 배열로 변환합니다.
 */
export function parseColorcolumn(raw?: string, textwidth = 0): number[] {
  if (!raw || raw.trim() === '') return [];
  const cols = new Set<number>();
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.startsWith('+') || t.startsWith('-')) {
      if (textwidth <= 0) continue;
      const delta = parseInt(t, 10);
      const target = textwidth + delta;
      if (target > 0) cols.add(target - 1);
    } else {
      const absCol = parseInt(t, 10);
      if (absCol > 0) cols.add(absCol - 1);
    }
  }
  return Array.from(cols).sort((a, b) => a - b);
}

/**
 * listchars 문자열을 파싱해 키별 표시 문자를 반환합니다.
 */
export function parseListchars(raw?: string): ParsedListchars {
  const effective = raw !== undefined ? raw : DEFAULT_VIM_OPTIONS.listchars ?? 'tab:> ,trail:-,nbsp:+';
  const parsed: ParsedListchars = {};
  if (!effective) return parsed;
  for (const part of effective.split(',')) {
    const colonIdx = part.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = part.slice(0, colonIdx) as keyof ParsedListchars;
    if (!VALID_LISTCHARS_KEYS.has(key)) continue;
    parsed[key] = part.slice(colonIdx + 1);
  }
  return parsed;
}

/**
 * 전역 설정 옵션을 조회합니다. (:setglobal)
 */
export function getGlobalOptions(state: VimEditorState): VimOptions {
  return {
    ...DEFAULT_VIM_OPTIONS,
    ...(state.globalOptions ?? state.options ?? {}),
  };
}

/**
 * 특정 버퍼(기본값: 현재 버퍼)의 로컬 옵션 오버라이드를 조회합니다. (:setlocal)
 */
export function getLocalOptions(state: VimEditorState, bufferId?: number): Partial<VimOptions> {
  const bId = bufferId ?? state.currentBufferId ?? 1;
  return state.bufferLocalOptions?.[bId] ?? {};
}

/**
 * 상태 객체에서 현재 버퍼의 유효한(Effective) VimOptions를 조회합니다. (전역 + 로컬 합성)
 */
export function getOptions(state: VimEditorState): VimOptions {
  const global = getGlobalOptions(state);
  const local = getLocalOptions(state);
  const base: VimOptions = {
    ...global,
    ...local,
  };
  if (state.splitPanes && state.splitDirection && state.splitDirection !== 'none') {
    const pane = state.splitPanes[state.activePaneIndex ?? 0];
    if (pane) {
      if (pane.localOptions) {
        Object.assign(base, pane.localOptions);
      }
      if (pane.scrollbind !== undefined) {
        base.scrollbind = pane.scrollbind;
      }
    }
  }
  return base;
}

/**
 * 옵션 상태를 순정 Vim 포맷으로 출력합니다 (:set, :set all, :setlocal, :setglobal).
 */
export function formatOptionsList(
  options: VimOptions,
  showAll = false,
  customHeader?: string
): string {
  const booleanKeys: (keyof VimOptions)[] = [
    'number',
    'relativenumber',
    'ignorecase',
    'smartcase',
    'hlsearch',
    'incsearch',
    'wrap',
    'cursorline',
    'cursorcolumn',
    'list',
    'expandtab',
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
  ];

  const numericKeys: (keyof VimOptions)[] = ['tabstop', 'shiftwidth', 'softtabstop', 'textwidth', 'scrolloff', 'sidescroll', 'sidescrolloff'];

  const displayedItems: string[] = [];

  for (const k of booleanKeys) {
    const val = options[k];
    const def = DEFAULT_VIM_OPTIONS[k];
    if (typeof val === 'string') {
      if (showAll || val !== def) {
        displayedItems.push(`${k}=${val}`);
      }
    } else if (showAll || val !== def) {
      displayedItems.push(val ? (k as string) : `no${k}`);
    }
  }

  for (const k of numericKeys) {
    const val = options[k] as number;
    const def = DEFAULT_VIM_OPTIONS[k] as number;
    if (showAll || val !== def) {
      displayedItems.push(`${k}=${val}`);
    }
  }

  const stringKeys: (keyof VimOptions)[] = [
    'filetype',
    'foldmethod',
    'foldexpr',
    'foldmarker',
    'commentstring',
    'errorformat',
    'grepprg',
    'nrformats',
    'listchars',
    'inccommand',
    'iskeyword',
    'virtualedit',
    'matchpairs',
    'shortmess',
    'colorcolumn',
    'wildmode',
    'whichwrap',
    'formatoptions',
  ];

  for (const k of stringKeys) {
    const val = options[k];
    if (k === 'filetype' && !val) continue;
    if (val !== undefined && (showAll || val !== DEFAULT_VIM_OPTIONS[k])) {
      displayedItems.push(`${k}=${val}`);
    }
  }

  const defaultHeader = showAll ? '--- All Options ---' : '--- Modified Options ---';
  const header = customHeader ?? defaultHeader;

  if (displayedItems.length === 0) {
    return msg('{header}\\n(기본값과 다른 설정이 없습니다)', { header });
  }

  return `${header}\n  ${displayedItems.join('  ')}`;
}

/**
 * :set 인자 문자열을 토큰으로 분리합니다.
 * 백슬래시 공백('\ ') 이스케이프와 따옴표를 보존합니다 (예: cms=//\ %s, cms="# %s").
 */
export function tokenizeSetArgs(rawArgs: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const ch = rawArgs[i];
    const preserveQuotes = current.startsWith('fde=') || current.startsWith('foldexpr=');
    if (quote) {
      if (ch === quote) {
        if (preserveQuotes) current += ch;
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '\\' && i + 1 < rawArgs.length) {
      const next = rawArgs[i + 1];
      if (next === ' ' || next === '\t' || next === '\\' || next === '"' || next === "'") {
        current += next;
        i++;
        continue;
      }
    }
    if (ch === '"' || ch === "'") {
      if (preserveQuotes) current += ch;
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

const NUMERIC_OPTION_KEYS = new Set<keyof VimOptions>([
  'tabstop',
  'shiftwidth',
  'softtabstop',
  'textwidth',
  'scrolloff',
  'sidescroll',
  'sidescrolloff',
  'foldlevel',
]);

const BOOLEAN_OPTION_KEYS = new Set<keyof VimOptions>([
  'number',
  'relativenumber',
  'ignorecase',
  'smartcase',
  'hlsearch',
  'incsearch',
  'wrap',
  'cursorline',
  'cursorcolumn',
  'list',
  'wildmenu',
  'expandtab',
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
]);

/**
 * whichwrap 옵션 문자열을 파싱하여 활성화된 플래그 집합을 반환합니다. (기본값: 'b,s')
 */
export function parseWhichwrapFlags(raw?: string): Set<string> {
  const effective = raw !== undefined ? raw : (DEFAULT_VIM_OPTIONS.whichwrap ?? 'b,s');
  const flags = new Set<string>();
  for (const part of effective.split(',')) {
    const trimmed = part.trim();
    if (trimmed) flags.add(trimmed);
  }
  return flags;
}

export function hasFormatOption(opts: Pick<VimOptions, 'formatoptions'>, flag: string): boolean {
  const fo = opts.formatoptions !== undefined ? opts.formatoptions : (DEFAULT_VIM_OPTIONS.formatoptions ?? 'tcqj');
  return fo.includes(flag);
}

/** 줄 앞의 주석 리더(//, #, %, >, --, /*, *)를 추출합니다 (formatoptions r/o/j/c 용). */
export function extractCommentPrefix(
  line: string
): { indent: string; leader: string; ws: string; fullPrefix: string; contPrefix: string } | null {
  const m = line.match(/^([ \t]*)(\/\/|\/\*|\*|--|[#%>])([ \t]*)/);
  if (!m) return null;
  const [, indent, leader, ws] = m;
  const rest = line.slice(m[0].length);
  if ((leader === '#' || leader === '%' || leader === '>' || leader === '--' || leader === '*') && ws.length === 0 && rest.length > 0) {
    return null;
  }
  if (leader === '/*' && rest.includes('*/')) return null;
  const fullPrefix = indent + leader + (ws || (rest.length > 0 || leader === '//' || leader === '*' ? ' ' : ''));
  const contPrefix = leader === '/*' ? `${indent} * ` : fullPrefix;
  return { indent, leader, ws, fullPrefix, contPrefix };
}

/** '&nu', '&g:sw', '&l:wrap' 문자열에서 스코프와 정규화된 옵션 키를 해석합니다. */
export function parseOptionRef(raw: string): { scope: 'default' | 'g' | 'l'; key: keyof VimOptions } | null {
  const m = raw.trim().match(/^&(?:([gl]):)?([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!m) return null;
  const scope = (m[1] as 'g' | 'l' | undefined) ?? 'default';
  const key = OPTION_ALIASES[m[2]];
  if (!key) return null;
  return { scope, key };
}

/** &option 값을 Vim script 표현식 값(불리언 1/0, 숫자, 문자열)으로 읽습니다. */
export function readOptionForScript(state: VimEditorState, raw: string): number | string | null {
  const parsed = parseOptionRef(raw);
  if (!parsed) return null;
  const { scope, key } = parsed;
  const curId = state.currentBufferId ?? 1;
  const isSplit = Boolean(state.splitPanes && state.splitDirection && state.splitDirection !== 'none');
  const activePane = isSplit ? state.splitPanes?.[state.activePaneIndex ?? 0] : undefined;
  const paneScb =
    key === 'scrollbind' && scope !== 'g' && isSplit
      ? activePane?.scrollbind
      : undefined;
  const paneLocalVal =
    scope !== 'g' && isSplit && WINDOW_LOCAL_OPTION_KEYS.has(key)
      ? activePane?.localOptions?.[key]
      : undefined;
  const rawVal =
    paneScb !== undefined
      ? paneScb
      : paneLocalVal !== undefined
        ? paneLocalVal
        : scope === 'l'
          ? state.bufferLocalOptions?.[curId]?.[key] ?? state.options?.[key] ?? DEFAULT_VIM_OPTIONS[key]
          : scope === 'g'
            ? state.globalOptions?.[key] ?? state.options?.[key] ?? DEFAULT_VIM_OPTIONS[key]
            : state.options?.[key] ?? state.globalOptions?.[key] ?? DEFAULT_VIM_OPTIONS[key];

  if (BOOLEAN_OPTION_KEYS.has(key)) {
    return rawVal ? 1 : 0;
  }
  if (NUMERIC_OPTION_KEYS.has(key)) {
    return typeof rawVal === 'number' ? rawVal : Number(rawVal ?? 0) || 0;
  }
  return rawVal === undefined ? '' : String(rawVal);
}

/** :let &option = value 결과를 에디터 옵션 상태에 반영합니다. */
export function writeOptionForScript(
  state: VimEditorState,
  raw: string,
  coerced: { num: number; str: string; truthy: boolean }
): VimEditorState | null {
  const parsed = parseOptionRef(raw);
  if (!parsed) return null;
  const { scope, key } = parsed;
  const nextVal: VimOptions[keyof VimOptions] = BOOLEAN_OPTION_KEYS.has(key)
    ? (coerced.truthy as VimOptions[typeof key])
    : NUMERIC_OPTION_KEYS.has(key)
      ? (coerced.num as VimOptions[typeof key])
      : (coerced.str as VimOptions[typeof key]);

  const baseGlobal = { ...DEFAULT_VIM_OPTIONS, ...(state.globalOptions ?? state.options ?? {}) };
  const baseEffective = { ...DEFAULT_VIM_OPTIONS, ...(state.options ?? {}) };
  const curId = state.currentBufferId ?? 1;
  const isSplit = Boolean(state.splitPanes && state.splitDirection && state.splitDirection !== 'none');
  const activePaneIdx = state.activePaneIndex ?? 0;

  const nextSplitPanes =
    scope !== 'g' && isSplit && state.splitPanes && WINDOW_LOCAL_OPTION_KEYS.has(key)
      ? state.splitPanes.map((pane, idx) =>
          idx === activePaneIdx
            ? {
                ...pane,
                ...(key === 'scrollbind' ? { scrollbind: Boolean(nextVal) } : {}),
                localOptions: { ...(pane.localOptions ?? {}), [key]: nextVal },
              }
            : pane
        )
      : state.splitPanes;

  if (scope === 'g') {
    const nextGlobal = { ...baseGlobal, [key]: nextVal };
    return { ...state, globalOptions: nextGlobal, options: { ...baseEffective, [key]: nextVal } };
  }
  if (scope === 'l') {
    const prevLocal = state.bufferLocalOptions?.[curId] ?? {};
    const nextLocal = { ...prevLocal, [key]: nextVal };
    const nextBuffers = state.buffers
      ? state.buffers.map((b) =>
          b.id === curId
            ? {
                ...b,
                localOptions: nextLocal,
                ...(key === 'filetype' ? { filetype: String(nextVal) } : {}),
              }
            : b
        )
      : undefined;
    return {
      ...state,
      bufferLocalOptions: { ...(state.bufferLocalOptions ?? {}), [curId]: nextLocal },
      buffers: nextBuffers,
      splitPanes: nextSplitPanes,
      options: { ...baseEffective, [key]: nextVal },
    };
  }

  return {
    ...state,
    globalOptions: { ...baseGlobal, [key]: nextVal },
    splitPanes: nextSplitPanes,
    options: { ...baseEffective, [key]: nextVal },
  };
}
