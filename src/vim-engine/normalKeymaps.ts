import { VimEditorState } from './types';
import { moveToLineEnd, moveToFirstNonBlank } from './motions';
import { switchPaneFocus } from './splitWindow';
import { executeCommandLine } from './commandLine';
import { parseKeySequence } from './keymapEngine';
import { DispatchKeyFn, RunHandleKeyFn } from './engineHelpers';
import { PrefixStepResult } from './normalGPrefix';

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
  const leaderKey = state.leaderKey || ' ';

  // 1. 대기 중인 리더 키('<leader>') 조합 처리
  if (state.pendingKeys === '<leader>' || state.pendingKeys === leaderKey) {
    const leaderCombo = `<leader>${key}`;
    const mapped =
      state.userKeymaps?.[`n:${leaderCombo}`] ||
      state.userKeymaps?.[leaderCombo] ||
      state.userKeymaps?.[`n:${leaderKey}${key}`] ||
      state.userKeymaps?.[`${leaderKey}${key}`];

    if (mapped) {
      if (mapped.startsWith(':')) {
        const cmd = mapped.slice(1).replace(/<CR>$/i, '');
        return {
          handled: true,
          state: executeCommandLine({ ...state, pendingKeys: undefined }, cmd, runHandleKey),
        };
      }
      let s: VimEditorState = { ...state, pendingKeys: undefined };
      const tokens = parseKeySequence(mapped, leaderKey);
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, macroDepth + 1);
        if (s.bell) break;
      }
      return { handled: true, state: s };
    }

    // 일치하는 리더 키 매핑이 없으면 pending 해제 후 일반 키로 계속 처리
    return { handled: false, state: { ...state, pendingKeys: undefined } };
  }

  // 2. 리더 키 입력 감지 (대기 상태로 전환)
  const isLeaderKey =
    key === leaderKey || (leaderKey === ' ' && (key === ' ' || key === 'Space'));
  if (isLeaderKey && !state.pendingKeys) {
    const hasLeaderMap = Object.keys(state.userKeymaps ?? {}).some(
      (k) =>
        k.includes('<leader>') ||
        k.startsWith(`n:${leaderKey}`) ||
        k.startsWith(leaderKey)
    );
    if (hasLeaderMap) {
      return {
        handled: true,
        state: {
          ...state,
          pendingKeys: '<leader>',
        },
      };
    }
  }

  // 3. 단일 키 매핑 처리 (H -> ^, L -> $, Ctrl-h -> Ctrl-w h, Y -> y$ 등)
  if (!state.pendingKeys && macroDepth === 0) {
    const singleMapped =
      state.userKeymaps?.[`n:${key}`] || state.userKeymaps?.[key];
    if (singleMapped) {
      if (singleMapped === '^') {
        return {
          handled: true,
          state: { ...state, cursor: moveToFirstNonBlank(state.lines, state.cursor) },
        };
      }
      if (singleMapped === '$') {
        return {
          handled: true,
          state: { ...state, cursor: moveToLineEnd(state.lines, state.cursor) },
        };
      }
      if (singleMapped === 'Ctrl-w h' || singleMapped === 'Ctrl-w k') {
        return { handled: true, state: switchPaneFocus(state, 0) };
      }
      if (singleMapped === 'Ctrl-w l' || singleMapped === 'Ctrl-w j') {
        return { handled: true, state: switchPaneFocus(state, 1) };
      }
      if (singleMapped.startsWith(':')) {
        const cmd = singleMapped.slice(1).replace(/<CR>$/i, '');
        return {
          handled: true,
          state: executeCommandLine(state, cmd, runHandleKey),
        };
      }
      let s: VimEditorState = state;
      const tokens = parseKeySequence(singleMapped, leaderKey);
      for (const tok of tokens) {
        s = dispatchKey(s, tok, isReplayingDot, macroDepth + 1);
        if (s.bell) break;
      }
      return { handled: true, state: s };
    }
  }

  return null;
}
