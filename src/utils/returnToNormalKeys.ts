import { handleKey, type VimEditorState } from '../vim-engine';

/**
 * UI 버튼(바로 체험 칩, 치트시트 [▶ 실행])의 키가 에디터 NORMAL 모드에서 실행될 준비가 됐는지 여부.
 * 팝업 메뉴·프롬프트·Neo-tree 포커스처럼 키를 가로채는 상태가 하나라도 열려 있으면 준비되지 않은 것입니다.
 */
export function isReadyForUiKeys(state: VimEditorState): boolean {
  return (
    state.mode === 'NORMAL' &&
    !state.insertNormalSession &&
    !state.pendingKeys &&
    !state.spellSuggest &&
    !state.flashJump?.isOpen &&
    !state.harpoonMenu?.isOpen &&
    !state.yankyMenu?.isOpen &&
    !state.multiCursor?.isOpen &&
    !state.lspRename?.isOpen &&
    !state.lspCodeActionMenu?.isOpen &&
    !state.confirmSubstitute &&
    !state.cmdlineWindow &&
    !state.fuzzyFinder?.isOpen &&
    !(state.neotree?.isOpen && state.neotree.isFocused)
  );
}

/** 현재 상태를 한 단계 NORMAL 쪽으로 되돌리는 키 */
function nextCloseKeys(state: VimEditorState): string[] {
  // 팝업 메뉴가 열려 있으면 그 메뉴가 키를 먼저 받으므로 Escape 로 먼저 닫고, 터미널 모드는 마지막에 빠져나옴
  const popupOpen =
    state.spellSuggest ||
    state.flashJump?.isOpen ||
    state.harpoonMenu?.isOpen ||
    state.yankyMenu?.isOpen ||
    state.multiCursor?.isOpen ||
    state.lspRename?.isOpen ||
    state.lspCodeActionMenu?.isOpen ||
    state.confirmSubstitute ||
    state.cmdlineWindow ||
    state.fuzzyFinder?.isOpen;
  if (state.mode === 'TERMINAL' && !popupOpen) return ['Ctrl-\\', 'Ctrl-n'];
  // 다른 팝업이 모두 닫히고 Neo-tree 포커스만 남았을 때만 Tab 으로 에디터 창에 포커스를 돌려줌 (트리는 열린 채 유지)
  const neotreeFocusedOnly =
    state.neotree?.isOpen &&
    state.neotree.isFocused &&
    !state.neotree.prompt &&
    isReadyForUiKeys({ ...state, neotree: { ...state.neotree, isFocused: false } });
  if (neotreeFocusedOnly) return ['Tab'];
  return ['Escape'];
}

const MAX_STEPS = 6;

/**
 * UI 버튼이 키 시퀀스를 주입하기 전에 보낼 "NORMAL 복귀" 키 목록을 반환합니다.
 * 실제 엔진(`handleKey`)으로 미리 실행해 보면서, 준비 상태가 될 때까지 필요한 키만 모읍니다.
 * TERMINAL 은 `Ctrl-\ Ctrl-n`, Neo-tree 포커스는 `Tab`, 그 밖의 모드·팝업·프롬프트는 `Escape` 입니다.
 */
export function getReturnToNormalKeys(state: VimEditorState): string[] {
  const keys: string[] = [];
  let s = state;
  for (let i = 0; i < MAX_STEPS && !isReadyForUiKeys(s); i++) {
    const step = nextCloseKeys(s);
    const before = s;
    for (const k of step) s = handleKey(s, k);
    keys.push(...step);
    if (s === before) break;
  }
  return keys;
}
