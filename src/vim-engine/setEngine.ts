import { VimEditorState, VimOptions } from './types';
import { msg } from './messages';
import { setActiveCursorContext } from './cursor';
import { setActiveIskeyword } from './wordMotion';
import { setActiveMatchpairs } from './bracketMatch';
import { applyFiletypeIndent } from './ftpluginEngine';
import {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
  parseListchars,
  parseColorcolumn,
  getGlobalOptions,
  getLocalOptions,
  getOptions,
  formatOptionsList,
  tokenizeSetArgs,
} from './setOptionsCore';
import type { ParsedListchars } from './setOptionsCore';
import {
  SetScope,
  SetDraftContext,
  handleOptionQuery,
  handleOptionReset,
  handleOptionAssignment,
  handleBooleanOption,
} from './setOptionAssigners';

export {
  DEFAULT_VIM_OPTIONS,
  OPTION_ALIASES,
  parseListchars,
  parseColorcolumn,
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
 *  - 'local': :setlocal / :setl (현재 버퍼/창 전용 로컬 오버라이드 갱신)
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
