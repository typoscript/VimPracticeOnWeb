import { VimEditorState } from './types';
import { moveToLineEnd, moveToFirstNonBlank } from './motions';
import { executeWincmd } from './splitWindow';
import { executeCommandLine } from './commandLine';
import {
  MAX_REMAP_DEPTH,
  ResolvedKeymap,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
  runKeymapTokens,
} from './keymapEngine';
import { DispatchKeyFn, RunHandleKeyFn, parsePending } from './engineHelpers';
import { PrefixStepResult } from './normalGPrefix';

const OPERATOR_PENDING_OPS = new Set([
  'd', 'c', 'y', '>', '<', '=', '!', 'gu', 'gU', 'g~', 'gc', 'gq', 'gw', 'g?',
]);

function executeNormalTokens(
  state: VimEditorState,
  tokens: string[],
  dispatchKey: DispatchKeyFn,
  isReplayingDot: boolean,
  depth: number
): VimEditorState {
  let s = state;
  for (const tok of tokens) {
    s = dispatchKey(s, tok, isReplayingDot, depth);
    if (s.bell) break;
  }
  return s;
}

function runResolvedNormalMapping(
  state: VimEditorState,
  resolved: ResolvedKeymap,
  dispatchKey: DispatchKeyFn,
  runHandleKey: RunHandleKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): VimEditorState {
  const leaderKey = state.leaderKey || ' ';
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, runHandleKey, 0, true);
  return runKeymapTokens(
    state,
    resolved,
    macroDepth,
    (runState, rhs, isNoremap, nextDepth) => {
      if (isNoremap && rhs === '^') {
        return { ...runState, cursor: moveToFirstNonBlank(runState.lines, runState.cursor) };
      }
      if (isNoremap && rhs === '$') {
        return { ...runState, cursor: moveToLineEnd(runState.lines, runState.cursor) };
      }
      if (isNoremap && (rhs === 'Ctrl-w h' || rhs === 'Ctrl-w k' || rhs === 'Ctrl-w l' || rhs === 'Ctrl-w j')) {
        return executeWincmd(runState, rhs.slice(-1));
      }
      if (rhs.startsWith(':')) {
        const cmd = rhs.slice(1).replace(/<(?:CR|Enter)>$/i, '').replace(/Enter$/, '');
        return runEx(runState, cmd);
      }
      return executeNormalTokens(
        runState,
        parseKeySequence(rhs, leaderKey),
        dispatchKey,
        isReplayingDot,
        nextDepth
      );
    },
    runEx
  );
}

/**
 * NORMAL 및 연산자 대기(Operator-pending) 모드 사용자 커스텀 키매핑과 리더 키 조합을 처리합니다.
 */
export function handleNormalUserKeymap(
  state: VimEditorState,
  key: string,
  dispatchKey: DispatchKeyFn,
  runHandleKey: RunHandleKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): PrefixStepResult | null {
  if (state.keymapsDisabled) return null;
  const leaderKey = state.leaderKey || ' ';

  // 0. 연산자 대기 모드 (:omap / :onoremap) 키매핑 처리
  const parsedOp = parsePending(state.pendingKeys).operator;
  if (parsedOp && OPERATOR_PENDING_OPS.has(parsedOp) && macroDepth <= MAX_REMAP_DEPTH) {
    const prefix = state.pendingKeymapPrefix ?? '';
    const combined = `${prefix}${key}`;
    const opResolved = resolveKeymapWithMeta(state, 'o', combined);
    if (opResolved) {
      const cleanState: VimEditorState = { ...state, pendingKeymapPrefix: undefined };
      const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, runHandleKey, 0, true);
      return {
        handled: true,
        state: runKeymapTokens(
          cleanState,
          opResolved,
          macroDepth,
          (runState, rhs, _isNoremap, nextDepth) =>
            executeNormalTokens(runState, parseKeySequence(rhs, leaderKey), dispatchKey, isReplayingDot, nextDepth),
          runEx
        ),
      };
    }
    if (isKeymapPrefix(state, 'o', combined)) {
      return {
        handled: true,
        state: { ...state, pendingKeymapPrefix: combined },
      };
    }
    if (prefix) {
      const prevDisabled = state.keymapsDisabled;
      const flushed = executeNormalTokens(
        { ...state, pendingKeymapPrefix: undefined, keymapsDisabled: true },
        parseKeySequence(prefix, leaderKey),
        dispatchKey,
        isReplayingDot,
        macroDepth
      );
      const restored = flushed.keymapsDisabled === prevDisabled ? flushed : { ...flushed, keymapsDisabled: prevDisabled };
      return {
        handled: true,
        state: dispatchKey(restored, key, isReplayingDot, macroDepth),
      };
    }
  }

  // 1. 대기 중인 리더 키('<leader>') 조합 처리
  if (state.pendingKeys === '<leader>' || state.pendingKeys === leaderKey) {
    const resolved =
      resolveKeymapWithMeta(state, 'n', `<leader>${key}`) ??
      resolveKeymapWithMeta(state, 'n', `${leaderKey}${key}`);

    if (resolved) {
      return {
        handled: true,
        state: runResolvedNormalMapping(
          { ...state, pendingKeys: undefined },
          resolved,
          dispatchKey,
          runHandleKey,
          isReplayingDot,
          macroDepth
        ),
      };
    }

    // 일치하는 리더 키 매핑이 없으면 pending 해제 후 일반 키로 계속 처리
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 2. 리더 키 입력 감지 (대기 상태로 전환)
  const isLeaderKey =
    key === leaderKey || (leaderKey === ' ' && (key === ' ' || key === 'Space'));
  if (isLeaderKey && !state.pendingKeys) {
    if (isKeymapPrefix(state, 'n', '<leader>') || isKeymapPrefix(state, 'n', leaderKey)) {
      return {
        handled: true,
        state: {
          ...state,
          pendingKeys: '<leader>',
        },
      };
    }
  }

  // 3. 일반 모드 단일/다중 키 매핑 처리 (재귀 *map, noremap, <nowait> 구분)
  if (!state.pendingKeys && macroDepth <= MAX_REMAP_DEPTH) {
    const prefix = state.pendingKeymapPrefix ?? '';
    if (prefix && key === 'Timeout') {
      const prefixResolved = resolveKeymapWithMeta(state, 'n', prefix);
      if (prefixResolved) {
        return {
          handled: true,
          state: runResolvedNormalMapping(
            { ...state, pendingKeymapPrefix: undefined },
            prefixResolved,
            dispatchKey,
            runHandleKey,
            isReplayingDot,
            macroDepth
          ),
        };
      }
      const prevDisabled = state.keymapsDisabled;
      const flushed = executeNormalTokens(
        { ...state, pendingKeymapPrefix: undefined, keymapsDisabled: true },
        parseKeySequence(prefix, leaderKey),
        dispatchKey,
        isReplayingDot,
        macroDepth
      );
      const restored = flushed.keymapsDisabled === prevDisabled ? flushed : { ...flushed, keymapsDisabled: prevDisabled };
      return { handled: true, state: restored };
    }
    const combined = `${prefix}${key}`;
    const resolved = resolveKeymapWithMeta(state, 'n', combined);
    const hasLongerPrefix = (!isLeaderKey || Boolean(prefix)) && isKeymapPrefix(state, 'n', combined);
    if (resolved && (!hasLongerPrefix || resolved.nowait)) {
      return {
        handled: true,
        state: runResolvedNormalMapping(
          { ...state, pendingKeymapPrefix: undefined },
          resolved,
          dispatchKey,
          runHandleKey,
          isReplayingDot,
          macroDepth
        ),
      };
    }
    if (hasLongerPrefix) {
      return {
        handled: true,
        state: { ...state, pendingKeymapPrefix: combined },
      };
    }
    if (prefix) {
      const prefixResolved = resolveKeymapWithMeta(state, 'n', prefix);
      if (prefixResolved) {
        const afterPrefix = runResolvedNormalMapping(
          { ...state, pendingKeymapPrefix: undefined },
          prefixResolved,
          dispatchKey,
          runHandleKey,
          isReplayingDot,
          macroDepth
        );
        return {
          handled: true,
          state: dispatchKey(afterPrefix, key, isReplayingDot, macroDepth),
        };
      }
      const prevDisabled = state.keymapsDisabled;
      const flushed = executeNormalTokens(
        { ...state, pendingKeymapPrefix: undefined, keymapsDisabled: true },
        parseKeySequence(prefix, leaderKey),
        dispatchKey,
        isReplayingDot,
        macroDepth
      );
      const restored = flushed.keymapsDisabled === prevDisabled ? flushed : { ...flushed, keymapsDisabled: prevDisabled };
      return {
        handled: true,
        state: dispatchKey(restored, key, isReplayingDot, macroDepth),
      };
    }
  }

  return null;
}
