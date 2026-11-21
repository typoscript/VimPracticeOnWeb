import { ClipboardRegister, VimEditorState } from './types';
import { msg } from './messages';

/**
 * yanky.nvim 스타일 Yank Ring
 * - 모든 y/d/c 복사 이력을 링 버퍼(`yankHistory`)에 누적합니다 (블랙홀 레지스터 `"_` 제외, 중복은 맨 앞으로 이동).
 * - NORMAL 모드 `p` / `P` 직후 `Ctrl-p`(이전) / `Ctrl-n`(다음) 로 방금 붙여넣은 텍스트를 제자리 교체합니다 (단일 Undo 유지).
 * - `:YankyRingHistory` (`:Yanks`) 팝업에서 이력을 골라 바로 붙여넣습니다.
 */

export const YANK_HISTORY_LIMIT = 30;

export type YankKeyDispatcher = (state: VimEditorState, key: string) => VimEditorState;

function sameClip(a: ClipboardRegister, b: ClipboardRegister): boolean {
  return a.type === b.type && a.content === b.content;
}

function isCtrlKey(key: string, letter: 'n' | 'p'): boolean {
  return (
    key === `Ctrl+${letter}` ||
    key === `Ctrl-${letter}` ||
    key === `ctrl-${letter}` ||
    key === `<C-${letter}>`
  );
}

/** 링 순환 키(Ctrl-p / Ctrl-n) 여부 */
export function isYankRingCycleKey(key: string): boolean {
  return isCtrlKey(key, 'n') || isCtrlKey(key, 'p');
}

function previewOf(clip: ClipboardRegister): string {
  const first = clip.content.split('\n')[0] ?? '';
  return first.length > 30 ? `${first.slice(0, 30)}…` : first;
}

/**
 * 복사 이력 맨 앞에 항목을 추가합니다 (중복 제거, 최대 30건).
 */
export function pushYankHistory(state: VimEditorState, clip: ClipboardRegister): VimEditorState {
  const prev = state.yankHistory ?? [];
  if (prev.length > 0 && sameClip(prev[0], clip)) return state;
  const next = [clip, ...prev.filter((c) => !sameClip(c, clip))].slice(0, YANK_HISTORY_LIMIT);
  return { ...state, yankHistory: next };
}

/**
 * 키 처리 후 호출되어 복사 이력 기록과 `p`/`P` 링 세션 시작·종료를 갱신합니다.
 */
export function updateYankRing(
  prev: VimEditorState,
  next: VimEditorState,
  key: string,
  replaying: boolean
): VimEditorState {
  let out = next;

  // 1. 복사·삭제로 클립보드가 바뀌면 이력에 기록 (블랙홀 레지스터는 클립보드를 보존하므로 제외됨)
  if (out.clipboard && out.clipboard !== prev.clipboard && prev.activeRegister !== '_') {
    out = pushYankHistory(out, out.clipboard);
  }

  // 2. 순수 p / P 붙여넣기 직후 링 세션 시작 (레지스터 지정·diffput·gp 등은 제외)
  const isPlainPaste =
    !replaying &&
    (key === 'p' || key === 'P') &&
    prev.mode === 'NORMAL' &&
    out.mode === 'NORMAL' &&
    !prev.activeRegister &&
    !prev.yankyMenu?.isOpen &&
    (!prev.pendingKeys || /^\d+$/.test(prev.pendingKeys)) &&
    !out.pendingKeys &&
    out.lines !== prev.lines &&
    Boolean(out.clipboard);

  if (isPlainPaste && out.clipboard) {
    const withHistory = pushYankHistory(out, out.clipboard);
    const hist = withHistory.yankHistory ?? [];
    return {
      ...withHistory,
      yankRing: {
        index: Math.max(
          0,
          hist.findIndex((c) => sameClip(c, out.clipboard as ClipboardRegister))
        ),
        key,
        base: { ...prev, yankRing: undefined, yankyMenu: null },
      },
    };
  }

  // 3. 그 밖의 키 입력은 링 세션 종료
  if (prev.yankRing && out.yankRing === prev.yankRing) {
    out = { ...out, yankRing: undefined };
  }
  return out;
}

/**
 * 이력 항목 하나로 base 상태에서 붙여넣기를 다시 실행합니다 (기존 붙여넣기 결과를 대체).
 */
function pasteHistoryEntry(
  current: VimEditorState,
  base: VimEditorState,
  index: number,
  key: 'p' | 'P' | string,
  dispatch: YankKeyDispatcher
): VimEditorState {
  const hist = current.yankHistory ?? [];
  const entry = hist[index];
  if (!entry) {
    return { ...current, bell: true, commandMessage: msg('[Yanky] 복사 기록이 비어 있습니다') };
  }

  const unnamedType: 'char' | 'line' | 'block' =
    entry.type === 'line' ? 'line' : entry.type === 'block' ? 'block' : 'char';
  const replayed = dispatch(
    {
      ...base,
      clipboard: entry,
      registers: {
        ...(base.registers ?? {}),
        '"': {
          type: unnamedType,
          content: entry.content,
          ...(unnamedType === 'block' && entry.blockWidth !== undefined
            ? { blockWidth: entry.blockWidth }
            : {}),
        },
      },
      yankHistory: hist,
      yankRing: undefined,
      yankyMenu: null,
    },
    key
  );

  return {
    ...replayed,
    clipboard: current.clipboard,
    registers: current.registers,
    yankHistory: hist,
    yankRing: { index, key, base },
    yankyMenu: null,
    commandMessage: msg('[Yanky] 링 {index}/{total}: {preview}', {
      index: index + 1,
      total: hist.length,
      preview: previewOf(entry),
    }),
  };
}

/**
 * `p`/`P` 직후 Ctrl-p(이전 복사본) / Ctrl-n(다음 복사본) 로 붙여넣은 텍스트를 제자리 교체합니다.
 * 활성 링 세션이 없으면 null 을 반환합니다.
 */
export function cycleYankRing(
  state: VimEditorState,
  key: string,
  dispatch: YankKeyDispatcher
): VimEditorState | null {
  const ring = state.yankRing;
  if (!ring) return null;
  const hist = state.yankHistory ?? [];
  if (hist.length < 2) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Yanky] 순환할 다른 복사 기록이 없습니다'),
    };
  }
  const step = isCtrlKey(key, 'p') ? 1 : -1;
  const idx = (((ring.index + step) % hist.length) + hist.length) % hist.length;
  return pasteHistoryEntry(state, ring.base, idx, ring.key, dispatch);
}

/**
 * `:YankyRingHistory` / `:Yanks` 팝업을 엽니다.
 */
export function openYankyMenu(state: VimEditorState): VimEditorState {
  const hist = state.yankHistory ?? [];
  if (hist.length === 0) {
    return {
      ...state,
      yankyMenu: null,
      bell: true,
      commandMessage: msg('[Yanky] 복사 기록이 비어 있습니다'),
    };
  }
  return {
    ...state,
    yankRing: undefined,
    yankyMenu: { isOpen: true, selectedIndex: 0 },
    commandMessage: msg('[Yanky] 복사 기록 {count}건 (j/k 이동 · Enter 붙여넣기 · d 삭제 · Esc 닫기)', {
      count: hist.length,
    }),
  };
}

export function closeYankyMenu(state: VimEditorState): VimEditorState {
  return { ...state, yankyMenu: null };
}

/**
 * `:YankyClearHistory` — 복사 이력을 모두 비웁니다.
 */
export function clearYankHistory(state: VimEditorState): VimEditorState {
  return {
    ...state,
    yankHistory: [],
    yankRing: undefined,
    yankyMenu: null,
    commandMessage: msg('[Yanky] 복사 기록을 모두 비웠습니다'),
  };
}

/**
 * Yanky 팝업 메뉴 키 처리 (j/k/Ctrl-n/Ctrl-p 이동, Enter/p 뒤에·P 앞에 붙여넣기, 1-9 즉시 붙여넣기, d 삭제, Esc/q 닫기).
 */
export function handleYankyMenuKey(
  state: VimEditorState,
  key: string,
  dispatch: YankKeyDispatcher
): VimEditorState {
  const menu = state.yankyMenu;
  if (!menu?.isOpen) return state;
  const hist = state.yankHistory ?? [];

  if (key === 'Escape' || key === 'q') return closeYankyMenu(state);
  if (hist.length === 0) return closeYankyMenu(state);

  if (key === 'j' || key === 'ArrowDown' || isCtrlKey(key, 'n')) {
    return {
      ...state,
      yankyMenu: { isOpen: true, selectedIndex: (menu.selectedIndex + 1) % hist.length },
    };
  }
  if (key === 'k' || key === 'ArrowUp' || isCtrlKey(key, 'p')) {
    return {
      ...state,
      yankyMenu: {
        isOpen: true,
        selectedIndex: (menu.selectedIndex - 1 + hist.length) % hist.length,
      },
    };
  }

  if (key === 'd' || key === 'x') {
    const nextHist = hist.filter((_, i) => i !== menu.selectedIndex);
    if (nextHist.length === 0) {
      return { ...state, yankHistory: [], yankyMenu: null };
    }
    return {
      ...state,
      yankHistory: nextHist,
      yankyMenu: { isOpen: true, selectedIndex: Math.min(menu.selectedIndex, nextHist.length - 1) },
    };
  }

  const pasteAt = (index: number, pasteKey: 'p' | 'P'): VimEditorState => {
    const closed: VimEditorState = {
      ...state,
      yankyMenu: null,
      yankRing: undefined,
      mode: 'NORMAL',
    };
    return pasteHistoryEntry(closed, closed, index, pasteKey, dispatch);
  };

  if (/^[1-9]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    return idx < hist.length ? pasteAt(idx, 'p') : state;
  }
  if (key === 'Enter' || key === 'p') return pasteAt(menu.selectedIndex, 'p');
  if (key === 'P') return pasteAt(menu.selectedIndex, 'P');

  return state;
}

/**
 * `:Yanks` / `:YankyRingHistory` / `:YankyClearHistory` Ex 명령을 실행합니다.
 */
export function executeYankyCommand(state: VimEditorState, cmdName: string): VimEditorState {
  const lower = cmdName.toLowerCase();
  if (lower === 'yankyclearhistory') return clearYankHistory(state);
  return openYankyMenu(state);
}
