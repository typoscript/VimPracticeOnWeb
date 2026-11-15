import { VimEditorState } from './types';
import { moveToLineEnd, moveToFirstNonBlank } from './motions';
import { switchPaneFocus } from './splitWindow';
import { executeCommandLine } from './commandLine';
import {
  ResolvedKeymap,
  applySilentKeymapResult,
  evaluateExprKeymap,
  isKeymapPrefix,
  parseKeySequence,
  resolveKeymapWithMeta,
} from './keymapEngine';
import { DispatchKeyFn, RunHandleKeyFn } from './engineHelpers';
import { PrefixStepResult } from './normalGPrefix';

function runResolvedNormalMapping(
  state: VimEditorState,
  resolved: ResolvedKeymap,
  dispatchKey: DispatchKeyFn,
  runHandleKey: RunHandleKeyFn,
  isReplayingDot: boolean,
  macroDepth: number
): VimEditorState {
  const prevMessage = state.commandMessage;
  const leaderKey = state.leaderKey || ' ';
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, runHandleKey);
  const rhs = resolved.expr ? evaluateExprKeymap(state, resolved.rhs, runEx) : resolved.rhs;
  if (!rhs) return applySilentKeymapResult(prevMessage, state, resolved.silent);

  if (rhs === '^') {
    return applySilentKeymapResult(prevMessage, { ...state, cursor: moveToFirstNonBlank(state.lines, state.cursor) }, resolved.silent);
  }
  if (rhs === '$') {
    return applySilentKeymapResult(prevMessage, { ...state, cursor: moveToLineEnd(state.lines, state.cursor) }, resolved.silent);
  }
  if (rhs === 'Ctrl-w h' || rhs === 'Ctrl-w k') {
    return applySilentKeymapResult(prevMessage, switchPaneFocus(state, 0), resolved.silent);
  }
  if (rhs === 'Ctrl-w l' || rhs === 'Ctrl-w j') {
    return applySilentKeymapResult(prevMessage, switchPaneFocus(state, 1), resolved.silent);
  }
  if (rhs.startsWith(':')) {
    const cmd = rhs.slice(1).replace(/<(?:CR|Enter)>$/i, '').replace(/Enter$/, '');
    return applySilentKeymapResult(prevMessage, runEx(state, cmd), resolved.silent);
  }

  let s: VimEditorState = state;
  const tokens = parseKeySequence(rhs, leaderKey);
  for (const tok of tokens) {
    s = dispatchKey(s, tok, isReplayingDot, macroDepth + 1);
    if (s.bell) break;
  }
  return applySilentKeymapResult(prevMessage, s, resolved.silent);
}

/**
 * NORMAL 모드 사용자 커스텀 키매핑 및 리더 키(<leader>) 조합을 처리합니다.
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

  // 3. 단일 키 매핑 처리 (H -> ^, L -> $, Ctrl-h -> Ctrl-w h, Y -> y$, <expr>, <silent>, <buffer> 등)
  if (!state.pendingKeys && macroDepth === 0) {
    const singleResolved = resolveKeymapWithMeta(state, 'n', key);
    if (singleResolved) {
      return {
        handled: true,
        state: runResolvedNormalMapping(state, singleResolved, dispatchKey, runHandleKey, isReplayingDot, macroDepth),
      };
    }
  }

  return null;
}
