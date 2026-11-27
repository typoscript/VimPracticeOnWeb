import type { VimEditorState } from '../vim-engine';

/**
 * UI 버튼(바로 체험 칩, 치트시트 [▶ 실행])이 키 시퀀스를 주입하기 전에
 * 현재 모드를 NORMAL 로 되돌리는 키 목록을 반환합니다.
 * TERMINAL 은 Neovim 표준 `Ctrl-\ Ctrl-n`, 그 밖의 모드·대기 키·Flash·다중 커서는 `Escape` 로 빠져나옵니다.
 */
export function getReturnToNormalKeys(
  state: Pick<VimEditorState, 'mode' | 'pendingKeys' | 'flashJump' | 'multiCursor'>
): string[] {
  if (state.mode === 'TERMINAL') return ['Ctrl-\\', 'Ctrl-n'];
  if (state.mode !== 'NORMAL' || state.pendingKeys || state.flashJump?.isOpen || state.multiCursor?.isOpen) {
    return ['Escape'];
  }
  return [];
}
