import { VimEditorState } from './types';
import { gotoFileUnderCursor } from './gotoFileEngine';
import { getWordAtCursor } from './search';
import { jumpToTag, tjumpTag } from './tagEngine';
import { nextTab, prevTab } from './tabEngine';
import {
  splitWindow,
  closeSplitWindow,
  closeOtherPanes,
  switchPaneFocus,
  moveFocusByDirection,
  cyclePaneFocus,
  exchangePanes,
  rotatePanes,
  movePaneToDirection,
  resizeSplit,
  moveWindowToNewTab,
} from './splitWindow';
import { msg } from './messages';
import { ringBell } from './engineHelpers';

/* 노멀·비주얼 모드의 창 명령 접두 키 Ctrl-w / Ctrl-w g (engineHelpers.ts 에서 분리) */

/**
 * 순정 Vim 윈도우/스플릿 제어 키스트로크 (Ctrl-w) 처리
 */
export function handleCtrlWKey(
  state: VimEditorState,
  key: string,
  count?: number
): VimEditorState {
  const isAlreadySplit = Boolean(
    state.splitDirection && state.splitDirection !== 'none' && state.splitPanes && state.splitPanes.length >= 2
  );
  // 창 생성: s, v, n
  if (key === 's' || key === 'Ctrl-s' || key === 'Ctrl+s') {
    return {
      ...splitWindow(state, 'horizontal', isAlreadySplit ? undefined : state.secondaryLines),
      pendingKeys: undefined,
    };
  }
  if (key === 'v' || key === 'Ctrl-v' || key === 'Ctrl+v') {
    return {
      ...splitWindow(state, 'vertical', isAlreadySplit ? undefined : state.secondaryLines),
      pendingKeys: undefined,
    };
  }
  if (key === 'n' || key === 'Ctrl-n' || key === 'Ctrl+n') {
    return { ...splitWindow(state, 'horizontal', [''], '[No Name]'), pendingKeys: undefined };
  }

  // 창 포커스 이동: w, W, h, l, k, j, t, b, p
  const paneCount = state.splitPanes?.length ?? 0;
  if (key === 'w' || key === 'Ctrl-w' || key === 'Ctrl+w') {
    return { ...cyclePaneFocus(state, 1, count), pendingKeys: undefined };
  }
  if (key === 'W') {
    return { ...cyclePaneFocus(state, -1, count), pendingKeys: undefined };
  }
  if (key === 'h' || key === 'Ctrl-h' || key === 'Ctrl+h' || key === 'ArrowLeft') {
    return { ...moveFocusByDirection(state, 'h'), pendingKeys: undefined };
  }
  if (key === 'l' || key === 'Ctrl-l' || key === 'Ctrl+l' || key === 'ArrowRight') {
    return { ...moveFocusByDirection(state, 'l'), pendingKeys: undefined };
  }
  if (key === 'k' || key === 'Ctrl-k' || key === 'Ctrl+k' || key === 'ArrowUp') {
    return { ...moveFocusByDirection(state, 'k'), pendingKeys: undefined };
  }
  if (key === 'j' || key === 'Ctrl-j' || key === 'Ctrl+j' || key === 'ArrowDown') {
    return { ...moveFocusByDirection(state, 'j'), pendingKeys: undefined };
  }
  if (key === 't' || key === 'Ctrl-t' || key === 'Ctrl+t') {
    return { ...switchPaneFocus(state, 0), pendingKeys: undefined };
  }
  if (key === 'b' || key === 'Ctrl-b' || key === 'Ctrl+b') {
    return {
      ...switchPaneFocus(state, paneCount > 0 ? paneCount - 1 : 0),
      pendingKeys: undefined,
    };
  }
  if (key === 'p' || key === 'Ctrl-p' || key === 'Ctrl+p') {
    const fallback = (state.activePaneIndex ?? 0) === 0 ? Math.min(1, Math.max(0, paneCount - 1)) : 0;
    const prev = state.previousPaneIndex ?? fallback;
    return { ...switchPaneFocus(state, prev), pendingKeys: undefined };
  }

  // 창 닫기 및 유일 창: c, q, o
  if (key === 'c' || key === 'q') {
    return { ...closeSplitWindow(state), pendingKeys: undefined };
  }
  if (key === 'o' || key === 'Ctrl-o' || key === 'Ctrl+o') {
    return { ...closeOtherPanes(state), pendingKeys: undefined };
  }

  // 창 위치 맞바꾸기 및 회전: x, r, R
  if (key === 'x' || key === 'Ctrl-x' || key === 'Ctrl+x') {
    return { ...exchangePanes(state, count), pendingKeys: undefined };
  }
  if (key === 'r' || key === 'Ctrl-r' || key === 'Ctrl+r') {
    return { ...rotatePanes(state, false), pendingKeys: undefined };
  }
  if (key === 'R') {
    return { ...rotatePanes(state, true), pendingKeys: undefined };
  }

  // 레이아웃 이동 및 전환: H, J, K, L, T
  if (key === 'H') {
    return { ...movePaneToDirection(state, 'H'), pendingKeys: undefined };
  }
  if (key === 'L') {
    return { ...movePaneToDirection(state, 'L'), pendingKeys: undefined };
  }
  if (key === 'K') {
    return { ...movePaneToDirection(state, 'K'), pendingKeys: undefined };
  }
  if (key === 'J') {
    return { ...movePaneToDirection(state, 'J'), pendingKeys: undefined };
  }
  if (key === 'T') {
    return { ...moveWindowToNewTab(state), pendingKeys: undefined };
  }
  if (key === 'f' || key === 'Ctrl-f' || key === 'Ctrl+f') {
    return { ...gotoFileUnderCursor(state, { split: true }), pendingKeys: undefined };
  }
  if (key === 'F') {
    return { ...gotoFileUnderCursor(state, { withLineNumber: true, split: true }), pendingKeys: undefined };
  }
  if (key === ']' || key === 'Ctrl-]' || key === 'Ctrl+]') {
    return splitAndJumpToTag(state, false, count);
  }
  if (key === 'g') {
    return { ...state, pendingKeys: `${state.pendingKeys ?? 'Ctrl-w'} g` };
  }

  // 창 크기 조절: =, +, -, >, <, _, |
  if (key === '=') {
    return { ...resizeSplit(state, '='), pendingKeys: undefined };
  }
  if (key === '_') {
    return { ...resizeSplit(state, '_', 'horizontal'), pendingKeys: undefined };
  }
  if (key === '|') {
    return { ...resizeSplit(state, '|', 'vertical'), pendingKeys: undefined };
  }
  if (key === '+') {
    return { ...resizeSplit(state, count ?? 5, 'horizontal'), pendingKeys: undefined };
  }
  if (key === '-') {
    return { ...resizeSplit(state, -(count ?? 5), 'horizontal'), pendingKeys: undefined };
  }
  if (key === '>') {
    return { ...resizeSplit(state, count ?? 5, 'vertical'), pendingKeys: undefined };
  }
  if (key === '<') {
    return { ...resizeSplit(state, -(count ?? 5), 'vertical'), pendingKeys: undefined };
  }

  return {
    ...state,
    pendingKeys: undefined,
  };
}

function splitAndJumpToTag(
  state: VimEditorState,
  useTjump: boolean,
  count?: number
): VimEditorState {
  const curLine = state.lines[state.cursor.line] ?? '';
  const word = getWordAtCursor(curLine, state.cursor.col);
  if (!word) {
    return {
      ...ringBell(state),
      commandMessage: msg('E349: 커서 위치에 식별자가 없습니다 (no identifier under cursor)'),
    };
  }
  const splitState = splitWindow(state, 'horizontal');
  const jumped = useTjump
    ? tjumpTag(splitState, word)
    : jumpToTag(splitState, word, count || 1);
  const activeIdx = jumped.activePaneIndex ?? 0;
  const syncedPanes = jumped.splitPanes
    ? jumped.splitPanes.map((pane, idx) =>
        idx === activeIdx
          ? {
              ...pane,
              lines: [...jumped.lines],
              cursor: { ...jumped.cursor },
              filename: jumped.primaryFilename ?? pane.filename,
              bufferId: jumped.currentBufferId ?? pane.bufferId,
            }
          : pane
      )
    : jumped.splitPanes;
  return {
    ...jumped,
    splitPanes: syncedPanes,
    pendingKeys: undefined,
  };
}

/**
 * Ctrl-w g 접두 키 시퀀스 (Ctrl-w gf, Ctrl-w gF, Ctrl-w g], Ctrl-w gt, Ctrl-w gT)를 처리합니다.
 */
export function handleCtrlWGKey(
  state: VimEditorState,
  key: string,
  count?: number
): VimEditorState {
  if (key === 'f') {
    return { ...gotoFileUnderCursor(state, { withLineNumber: false, tab: true }), pendingKeys: undefined };
  }
  if (key === 'F') {
    return { ...gotoFileUnderCursor(state, { withLineNumber: true, tab: true }), pendingKeys: undefined };
  }
  if (key === ']' || key === 'Ctrl-]' || key === 'Ctrl+]') {
    return splitAndJumpToTag(state, true, count);
  }
  if (key === 't') {
    return { ...nextTab(state, count), pendingKeys: undefined };
  }
  if (key === 'T') {
    return { ...prevTab(state, count ?? 1), pendingKeys: undefined };
  }
  return { ...state, pendingKeys: undefined };
}
