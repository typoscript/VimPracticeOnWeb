import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';
import { applyFiletypeIndent, getFiletypeCommentString } from './ftpluginEngine';
import { detectFiletype } from './syntaxEngine';

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
  list: false,
  wildmenu: true,
  spell: false,
  syntax: true,
  foldmethod: 'manual',
  foldlevel: 0,
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
  list: 'list',
  wmenu: 'wildmenu',
  wildmenu: 'wildmenu',
  spell: 'spell',
  ft: 'filetype',
  filetype: 'filetype',
  syn: 'syntax',
  syntax: 'syntax',
  fdm: 'foldmethod',
  foldmethod: 'foldmethod',
  fdl: 'foldlevel',
  foldlevel: 'foldlevel',
  cms: 'commentstring',
  commentstring: 'commentstring',
  efm: 'errorformat',
  errorformat: 'errorformat',
  gp: 'grepprg',
  grepprg: 'grepprg',
};

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
  return {
    ...global,
    ...(state.options ?? {}),
    ...local,
  };
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
  ];

  const numericKeys: (keyof VimOptions)[] = ['tabstop', 'shiftwidth', 'textwidth', 'scrolloff'];

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

  if (options.filetype && (showAll || options.filetype !== DEFAULT_VIM_OPTIONS.filetype)) {
    displayedItems.push(`filetype=${options.filetype}`);
  }

  if (options.commentstring !== undefined && (showAll || options.commentstring !== DEFAULT_VIM_OPTIONS.commentstring)) {
    displayedItems.push(`commentstring=${options.commentstring}`);
  }

  if (options.errorformat !== undefined && (showAll || options.errorformat !== DEFAULT_VIM_OPTIONS.errorformat)) {
    displayedItems.push(`errorformat=${options.errorformat}`);
  }

  if (options.grepprg !== undefined && (showAll || options.grepprg !== DEFAULT_VIM_OPTIONS.grepprg)) {
    displayedItems.push(`grepprg=${options.grepprg}`);
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
function tokenizeSetArgs(rawArgs: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const ch = rawArgs[i];
    if (quote) {
      if (ch === quote) {
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
  scope: 'both' | 'local' | 'global' = 'both'
): VimEditorState {
  const trimmed = rawArgs.trim();
  const curId = state.currentBufferId ?? 1;
  const curGlobal = getGlobalOptions(state);
  const curLocal = getLocalOptions(state, curId);
  const effective = getOptions(state);

  // 1. :set all
  if (trimmed === 'all') {
    return {
      ...state,
      commandMessage: formatOptionsList(effective, true),
    };
  }

  // 2. 인자 없음 (:set, :setlocal, :setglobal)
  if (trimmed === '') {
    if (scope === 'local') {
      const header = '--- Local Options ---';
      const modifiedKeys = Object.keys(curLocal);
      if (modifiedKeys.length === 0) {
        return {
          ...state,
          commandMessage: msg('{header}\\n(기본값과 다른 설정이 없습니다)', { header }),
        };
      }
      return {
        ...state,
        commandMessage: formatOptionsList(
          { ...DEFAULT_VIM_OPTIONS, ...curLocal },
          false,
          header
        ),
      };
    }
    if (scope === 'global') {
      return {
        ...state,
        commandMessage: formatOptionsList(curGlobal, false, '--- Global Options ---'),
      };
    }
    return {
      ...state,
      commandMessage: formatOptionsList(effective, false),
    };
  }

  const tokens = tokenizeSetArgs(trimmed);
  const nextGlobal: VimOptions = { ...curGlobal };
  const nextLocal: Partial<VimOptions> = { ...curLocal };
  const queryMessages: string[] = [];
  const appliedList: string[] = [];
  let updatedFiletype: string | undefined = undefined;

  for (const token of tokens) {
    // 3. 옵션 상태 조회 (:set opt?, :setlocal opt?, :setglobal opt?)
    if (token.endsWith('?')) {
      const queryName = token.slice(0, -1);
      const optKey = OPTION_ALIASES[queryName];
      if (!optKey) {
        return {
          ...state,
          commandMessage: msg('E518: 알 수 없는 옵션: {queryName}', { queryName }),
        };
      }
      let val: any;
      if (scope === 'local') {
        val = nextLocal[optKey] ?? nextGlobal[optKey];
      } else if (scope === 'global') {
        val = nextGlobal[optKey];
      } else {
        val = nextLocal[optKey] ?? nextGlobal[optKey];
      }
      if (optKey === 'commentstring' && val === undefined) {
        const ft = nextLocal.filetype ?? nextGlobal.filetype ?? detectFiletype(state.primaryFilename);
        val = getFiletypeCommentString(ft) ?? '// %s';
      }
      if (optKey === 'errorformat' && val === undefined) {
        val = '%f:%l:%c:%m,%f:%l:%m,%f(%l\\,%c):%m';
      }
      if (optKey === 'grepprg' && val === undefined) {
        val = 'grep -n $* /dev/null';
      }
      if (typeof val === 'boolean') {
        queryMessages.push(val ? (optKey as string) : `no${optKey}`);
      } else {
        queryMessages.push(`${optKey}=${val}`);
      }
      continue;
    }

    // 4. 숫자/값 할당 옵션 (:set ts=4, :set sw=2, :set ft=typescript, :set cms=//\ %s, :set efm+=...)
    if (token.includes('=')) {
      const eqIdx = token.indexOf('=');
      const rawKeyWithMod = token.slice(0, eqIdx);
      const mod =
        rawKeyWithMod.endsWith('+') || rawKeyWithMod.endsWith('^') || rawKeyWithMod.endsWith('-')
          ? rawKeyWithMod.slice(-1)
          : '';
      const rawKey = mod ? rawKeyWithMod.slice(0, -1) : rawKeyWithMod;
      const rawVal = token.slice(eqIdx + 1);
      const optKey = OPTION_ALIASES[rawKey];
      if (optKey === 'errorformat' || optKey === 'grepprg') {
        const currentStr =
          (nextLocal[optKey] ?? nextGlobal[optKey]) ??
          (optKey === 'errorformat' ? '%f:%l:%c:%m,%f:%l:%m,%f(%l\\,%c):%m' : 'grep -n $* /dev/null');
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
        if (scope === 'local' || scope === 'both') {
          (nextLocal as any)[optKey] = nextStr;
        }
        if (scope === 'global' || scope === 'both') {
          (nextGlobal as any)[optKey] = nextStr;
        }
        appliedList.push(`${optKey}=${nextStr}`);
        continue;
      }
      if (optKey === 'commentstring') {
        if (rawVal !== '' && !rawVal.includes('%s')) {
          return {
            ...state,
            bell: true,
            commandMessage: msg('E537: \'commentstring\' 값은 비어 있거나 %s를 포함해야 합니다: {token}', { token }),
          };
        }
        if (scope === 'local' || scope === 'both') {
          nextLocal.commentstring = rawVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.commentstring = rawVal;
        }
        appliedList.push(`commentstring=${rawVal}`);
        continue;
      }
      if (optKey === 'filetype') {
        if (scope === 'local' || scope === 'both') {
          nextLocal.filetype = rawVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.filetype = rawVal;
        }
        appliedList.push(`filetype=${rawVal}`);
        updatedFiletype = rawVal;
        continue;
      }
      if (optKey === 'syntax') {
        if (scope === 'local' || scope === 'both') {
          nextLocal.syntax = rawVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.syntax = rawVal;
        }
        appliedList.push(`syntax=${rawVal}`);
        continue;
      }
      if (optKey === 'foldmethod') {
        const validMethods = ['manual', 'indent', 'marker', 'syntax', 'expr'];
        const method = rawVal.toLowerCase() as any;
        if (!validMethods.includes(method)) {
          return {
            ...state,
            commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
          };
        }
        if (scope === 'local' || scope === 'both') {
          nextLocal.foldmethod = method;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.foldmethod = method;
        }
        appliedList.push(`foldmethod=${method}`);
        continue;
      }
      if (optKey === 'foldlevel') {
        const numVal = parseInt(rawVal, 10);
        if (isNaN(numVal) || numVal < 0) {
          return {
            ...state,
            commandMessage: msg('E521: 잘못된 숫자 인수: {token}', { token }),
          };
        }
        if (scope === 'local' || scope === 'both') {
          nextLocal.foldlevel = numVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.foldlevel = numVal;
        }
        appliedList.push(`foldlevel=${numVal}`);
        continue;
      }
      if (
        !optKey ||
        (optKey !== 'tabstop' &&
          optKey !== 'shiftwidth' &&
          optKey !== 'textwidth' &&
          optKey !== 'scrolloff')
      ) {
        return {
          ...state,
          commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
        };
      }
      const numVal = parseInt(rawVal, 10);
      if (isNaN(numVal) || numVal < (optKey === 'textwidth' || optKey === 'scrolloff' ? 0 : 1)) {
        return {
          ...state,
          commandMessage: msg('E521: 잘못된 숫자 인수: {token}', { token }),
        };
      }
      if (scope === 'local' || scope === 'both') {
        nextLocal[optKey] = numVal;
      }
      if (scope === 'global' || scope === 'both') {
        nextGlobal[optKey] = numVal;
      }
      appliedList.push(`${optKey}=${numVal}`);
      continue;
    }

    // 5. 토글 옵션 (:set nu!, :set rnu!)
    if (token.endsWith('!')) {
      const rawKey = token.slice(0, -1);
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey) {
        return {
          ...state,
          commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
        };
      }
      const curVal = nextLocal[optKey] ?? nextGlobal[optKey];
      if (typeof curVal === 'boolean' || optKey === 'syntax') {
        const nextVal = !curVal;
        if (scope === 'local' || scope === 'both') {
          (nextLocal as any)[optKey] = nextVal;
        }
        if (scope === 'global' || scope === 'both') {
          (nextGlobal as any)[optKey] = nextVal;
        }
        appliedList.push(nextVal ? (optKey as string) : `no${optKey}`);
        continue;
      }
    }

    // 6. 옵션 비활성화 (:set nonu, :set nornu, :set noic)
    if (token.startsWith('no')) {
      const rawKey = token.slice(2);
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey) {
        return {
          ...state,
          commandMessage: msg('E518: 알 수 없는 옵션: {token}', { token }),
        };
      }
      const curVal = nextLocal[optKey] ?? nextGlobal[optKey];
      if (typeof curVal === 'boolean' || optKey === 'syntax') {
        if (scope === 'local' || scope === 'both') {
          (nextLocal as any)[optKey] = false;
        }
        if (scope === 'global' || scope === 'both') {
          (nextGlobal as any)[optKey] = false;
        }
        appliedList.push(`no${optKey}`);
        continue;
      }
    }

    // 7. 옵션 활성화 (:set nu, :set rnu, :set ic, :set wrap)
    const optKey = OPTION_ALIASES[token];
    if (!optKey) {
      return {
        ...state,
        commandMessage: msg('E518: 알 수 없는 옵션: {token}', { token }),
      };
    }
    const curVal = nextLocal[optKey] ?? nextGlobal[optKey];
    if (typeof curVal === 'boolean' || optKey === 'syntax') {
      if (scope === 'local' || scope === 'both') {
        (nextLocal as any)[optKey] = true;
      }
      if (scope === 'global' || scope === 'both') {
        (nextGlobal as any)[optKey] = true;
      }
      appliedList.push(optKey as string);
      continue;
    }
  }

  const nextEffective: VimOptions = {
    ...DEFAULT_VIM_OPTIONS,
    ...nextGlobal,
    ...nextLocal,
  };

  const nextBufferLocalOptions = {
    ...(state.bufferLocalOptions ?? {}),
    [curId]: nextLocal,
  };

  const nextBuffers = state.buffers
    ? state.buffers.map((b) =>
        b.id === curId
          ? {
              ...b,
              localOptions: nextLocal,
              filetype: nextLocal.filetype ?? b.filetype,
            }
          : b
      )
    : undefined;

  let message: string | undefined = undefined;
  if (queryMessages.length > 0) {
    message = queryMessages.join('  ');
  } else if (appliedList.length > 0) {
    const scopePrefix =
      scope === 'local'
        ? '[Local Option]'
        : scope === 'global'
        ? '[Global Option]'
        : '[Option]';
    message = `${scopePrefix} ${appliedList.join(' ')}`;
  }

  let finalState: VimEditorState = {
    ...state,
    options: nextEffective,
    globalOptions: nextGlobal,
    bufferLocalOptions: nextBufferLocalOptions,
    buffers: nextBuffers,
    commandMessage: message,
  };

  if (updatedFiletype) {
    finalState = applyFiletypeIndent(finalState, updatedFiletype);
  }

  return finalState;
}
