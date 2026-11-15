import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';
import { applyFiletypeIndent, getFiletypeCommentString } from './ftpluginEngine';
import { detectFiletype } from './syntaxEngine';
import {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
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
  let updatedScrollbind: boolean | undefined = undefined;
  const isSplit = !!(state.splitPanes && state.splitDirection && state.splitDirection !== 'none');
  const activePaneIdx = state.activePaneIndex ?? 0;
  const activePaneScrollbind = isSplit ? state.splitPanes![activePaneIdx]?.scrollbind : undefined;

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
      if (optKey === 'scrollbind' && scope !== 'global' && activePaneScrollbind !== undefined) {
        val = updatedScrollbind ?? activePaneScrollbind;
      } else if (scope === 'local') {
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
      if (optKey === 'foldexpr' && val === undefined) {
        val = '0';
      }
      if (optKey === 'foldmarker' && val === undefined) {
        val = '{{{,}}}';
      }
      if (optKey === 'nrformats' && val === undefined) {
        val = 'bin,hex';
      }
      if (optKey === 'listchars' && val === undefined) {
        val = DEFAULT_VIM_OPTIONS.listchars;
      }
      if (typeof val === 'boolean') {
        queryMessages.push(val ? (optKey as string) : `no${optKey}`);
      } else {
        queryMessages.push(`${optKey}=${val}`);
      }
      continue;
    }

    // 3b. 기본값 복원 (:set nrformats&)
    if (token.endsWith('&')) {
      const rawKey = token.slice(0, -1);
      const optKey = OPTION_ALIASES[rawKey];
      if (!optKey) {
        return {
          ...state,
          bell: true,
          commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
        };
      }
      const defVal = (DEFAULT_VIM_OPTIONS as any)[optKey];
      if (scope === 'local' || scope === 'both') {
        (nextLocal as any)[optKey] = defVal;
      }
      if (scope === 'global' || scope === 'both') {
        (nextGlobal as any)[optKey] = defVal;
      }
      appliedList.push(typeof defVal === 'boolean' ? (defVal ? (optKey as string) : `no${optKey}`) : `${optKey}=${defVal ?? ''}`);
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
      if (optKey === 'listchars') {
        const curStr =
          nextLocal.listchars ??
          nextGlobal.listchars ??
          DEFAULT_VIM_OPTIONS.listchars ??
          'tab:> ,trail:-,nbsp:+';
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
            return {
              ...state,
              bell: true,
              commandMessage: parsedVal.error,
            };
          }
          if (mod === '+' || mod === '^') {
            const incomingKeys = new Set(parsedVal.entries.map((e) => e.key));
            const remaining = curEntries.filter((e) => !incomingKeys.has(e.key));
            nextEntries =
              mod === '^'
                ? [...parsedVal.entries, ...remaining]
                : [...remaining, ...parsedVal.entries];
          } else {
            // 중복 키는 나중 항목으로 덮어쓰기
            const map = new Map<keyof ParsedListchars, string>();
            for (const entry of parsedVal.entries) {
              map.set(entry.key, entry.val);
            }
            nextEntries = Array.from(map.entries()).map(([key, val]) => ({ key, val }));
          }
        }

        const nextVal = nextEntries.map((e) => `${e.key}:${e.val}`).join(',');
        if (scope === 'local' || scope === 'both') {
          nextLocal.listchars = nextVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.listchars = nextVal;
        }
        appliedList.push(`listchars=${nextVal}`);
        continue;
      }
      if (optKey === 'nrformats') {
        const VALID_NRFORMATS = new Set(['bin', 'octal', 'hex', 'alpha', 'unsigned', 'blank']);
        const parseParts = (s: string) =>
          s
            .split(',')
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean);
        const rawParts = parseParts(rawVal);
        const invalidPart = rawParts.find((p) => !VALID_NRFORMATS.has(p));
        if (invalidPart) {
          return {
            ...state,
            bell: true,
            commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
          };
        }
        const curStr = (nextLocal.nrformats ?? nextGlobal.nrformats ?? DEFAULT_VIM_OPTIONS.nrformats ?? 'bin,hex');
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
        if (scope === 'local' || scope === 'both') {
          nextLocal.nrformats = nextVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.nrformats = nextVal;
        }
        appliedList.push(`nrformats=${nextVal}`);
        continue;
      }
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
      if (optKey === 'foldexpr') {
        const exprVal = rawVal.length > 0 ? rawVal : '0';
        if (scope === 'local' || scope === 'both') {
          nextLocal.foldexpr = exprVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.foldexpr = exprVal;
        }
        appliedList.push(`foldexpr=${exprVal}`);
        continue;
      }
      if (optKey === 'foldmarker') {
        const commaIdx = rawVal.indexOf(',');
        const startM = commaIdx >= 0 ? rawVal.slice(0, commaIdx) : '';
        const endM = commaIdx >= 0 ? rawVal.slice(commaIdx + 1) : '';
        if (commaIdx <= 0 || !startM || !endM) {
          return {
            ...state,
            bell: true,
            commandMessage: msg('E474: 잘못된 인수입니다: {token}', { token }),
          };
        }
        if (scope === 'local' || scope === 'both') {
          nextLocal.foldmarker = rawVal;
        }
        if (scope === 'global' || scope === 'both') {
          nextGlobal.foldmarker = rawVal;
        }
        appliedList.push(`foldmarker=${rawVal}`);
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
          optKey !== 'scrolloff' &&
          optKey !== 'sidescroll' &&
          optKey !== 'sidescrolloff')
      ) {
        return {
          ...state,
          commandMessage: msg('E518: 알 수 없는 옵션: {rawKey}', { rawKey }),
        };
      }
      const numVal = parseInt(rawVal, 10);
      const allowsZero =
        optKey === 'textwidth' ||
        optKey === 'scrolloff' ||
        optKey === 'sidescroll' ||
        optKey === 'sidescrolloff';
      if (isNaN(numVal) || numVal < (allowsZero ? 0 : 1)) {
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
      const curVal: VimOptions[keyof VimOptions] =
        optKey === 'scrollbind' && scope !== 'global' && (updatedScrollbind !== undefined || activePaneScrollbind !== undefined)
          ? (updatedScrollbind ?? activePaneScrollbind)
          : (nextLocal[optKey] ?? nextGlobal[optKey]);
      if (typeof curVal === 'boolean' || optKey === 'syntax') {
        const nextVal: boolean = !curVal;
        if (optKey === 'scrollbind' && isSplit) {
          if (scope !== 'global') updatedScrollbind = nextVal;
          if (scope === 'global' || scope === 'both') nextGlobal.scrollbind = nextVal;
        } else {
          if (scope === 'local' || scope === 'both') {
            (nextLocal as any)[optKey] = nextVal;
          }
          if (scope === 'global' || scope === 'both') {
            (nextGlobal as any)[optKey] = nextVal;
          }
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
        if (optKey === 'scrollbind' && isSplit) {
          if (scope !== 'global') updatedScrollbind = false;
          if (scope === 'global' || scope === 'both') nextGlobal.scrollbind = false;
        } else {
          if (scope === 'local' || scope === 'both') {
            (nextLocal as any)[optKey] = false;
          }
          if (scope === 'global' || scope === 'both') {
            (nextGlobal as any)[optKey] = false;
          }
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
      if (optKey === 'scrollbind' && isSplit) {
        if (scope !== 'global') updatedScrollbind = true;
        if (scope === 'global' || scope === 'both') nextGlobal.scrollbind = true;
      } else {
        if (scope === 'local' || scope === 'both') {
          (nextLocal as any)[optKey] = true;
        }
        if (scope === 'global' || scope === 'both') {
          (nextGlobal as any)[optKey] = true;
        }
      }
      appliedList.push(optKey as string);
      continue;
    }
  }

  const nextEffective: VimOptions = {
    ...DEFAULT_VIM_OPTIONS,
    ...nextGlobal,
    ...nextLocal,
    ...(isSplit && (updatedScrollbind !== undefined || activePaneScrollbind !== undefined)
      ? { scrollbind: updatedScrollbind ?? activePaneScrollbind }
      : {}),
  };

  const nextSplitPanes =
    isSplit && updatedScrollbind !== undefined && state.splitPanes
      ? ([
          activePaneIdx === 0 ? { ...state.splitPanes[0], scrollbind: updatedScrollbind } : state.splitPanes[0],
          activePaneIdx === 1 ? { ...state.splitPanes[1], scrollbind: updatedScrollbind } : state.splitPanes[1],
        ] as [typeof state.splitPanes[0], typeof state.splitPanes[1]])
      : state.splitPanes;

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
    splitPanes: nextSplitPanes,
    commandMessage: message,
  };

  if (updatedFiletype) {
    finalState = applyFiletypeIndent(finalState, updatedFiletype);
  }

  return finalState;
}
