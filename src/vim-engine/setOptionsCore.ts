import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';

export const DEFAULT_VIM_OPTIONS: VimOptions = {
  number: true,
  relativenumber: false,
  ignorecase: false,
  smartcase: false,
  hlsearch: true,
  wrap: true,
  cursorline: true,
  tabstop: 2,
  shiftwidth: 2,
  expandtab: true,
  textwidth: 0,
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
  scrollbind: false,
  nrformats: 'bin,hex',
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
};

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
    ...(state.options ?? {}),
    ...local,
  };
  if (state.splitPanes && state.splitDirection && state.splitDirection !== 'none') {
    const pane = state.splitPanes[state.activePaneIndex ?? 0];
    if (pane && pane.scrollbind !== undefined) {
      base.scrollbind = pane.scrollbind;
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
    'wrap',
    'cursorline',
    'list',
    'expandtab',
    'spell',
    'syntax',
    'scrollbind',
  ];

  const numericKeys: (keyof VimOptions)[] = ['tabstop', 'shiftwidth', 'textwidth', 'scrolloff', 'sidescroll', 'sidescrolloff'];

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
