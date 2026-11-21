import { VimEditorState } from './types';
import { editBuffer, ensureBuffers } from './bufferEngine';
import { msg } from './messages';

function getList(state: VimEditorState): string[] {
  return state.harpoonList ? [...state.harpoonList] : [];
}

/**
 * 현재 버퍼(또는 지정 경로)를 Harpoon 핀 목록에 등록합니다 (:HarpoonAdd [path]).
 */
export function addHarpoonFile(state: VimEditorState, rawPath?: string): VimEditorState {
  const path = (rawPath ?? '').trim() || (state.primaryFilename ?? '').trim();
  if (!path || path.startsWith('oil://')) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Harpoon] 등록할 파일 경로가 없습니다'),
    };
  }
  const list = getList(state);
  const existingIdx = list.indexOf(path);
  if (existingIdx !== -1) {
    return {
      ...state,
      harpoonList: list,
      commandMessage: msg('[Harpoon] 이미 #{slot} 슬롯에 등록되어 있습니다: {path}', {
        slot: existingIdx + 1,
        path,
      }),
    };
  }
  const nextList = [...list, path];
  return {
    ...state,
    harpoonList: nextList,
    commandMessage: msg('[Harpoon] #{slot} 슬롯에 핀 등록: {path}', {
      slot: nextList.length,
      path,
    }),
  };
}

/**
 * Harpoon 핀 목록에서 지정 슬롯 번호(1-based) 또는 경로(기본: 현재 파일)를 제거합니다.
 */
export function removeHarpoonFile(state: VimEditorState, rawTarget?: string): VimEditorState {
  const list = getList(state);
  if (list.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Harpoon] 등록된 핀 파일이 없습니다'),
    };
  }
  const target = (rawTarget ?? '').trim();
  let removeIdx = -1;
  if (/^\d+$/.test(target)) {
    const slot = parseInt(target, 10) - 1;
    if (slot >= 0 && slot < list.length) removeIdx = slot;
  } else {
    const lookup = target || (state.primaryFilename ?? '').trim();
    removeIdx = list.indexOf(lookup);
  }
  if (removeIdx === -1) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Harpoon] 목록에서 대상을 찾을 수 없습니다: {target}', {
        target: target || state.primaryFilename || '',
      }),
    };
  }
  const removed = list[removeIdx];
  const nextList = list.filter((_, i) => i !== removeIdx);
  const nextMenu = state.harpoonMenu?.isOpen
    ? {
        isOpen: true,
        selectedIndex: Math.max(0, Math.min(state.harpoonMenu.selectedIndex, nextList.length - 1)),
      }
    : state.harpoonMenu;
  return {
    ...state,
    harpoonList: nextList,
    harpoonMenu: nextMenu,
    commandMessage: msg('[Harpoon] 핀 제거됨: {path}', { path: removed }),
  };
}

/**
 * Harpoon 핀 목록을 모두 비웁니다 (:HarpoonClear).
 */
export function clearHarpoonList(state: VimEditorState): VimEditorState {
  return {
    ...state,
    harpoonList: [],
    harpoonMenu: null,
    commandMessage: msg('[Harpoon] 핀 목록을 모두 비웠습니다'),
  };
}

/**
 * Harpoon 퀵 메뉴 플로팅 팝업을 엽니다 (:HarpoonMenu / :Harpoon).
 */
export function openHarpoonMenu(state: VimEditorState): VimEditorState {
  const list = getList(state);
  const curIdx = state.primaryFilename ? list.indexOf(state.primaryFilename) : -1;
  return {
    ...state,
    pendingKeys: undefined,
    harpoonList: list,
    harpoonMenu: {
      isOpen: true,
      selectedIndex: curIdx >= 0 ? curIdx : 0,
    },
    commandMessage:
      list.length > 0
        ? msg('[Harpoon] 퀵 메뉴 열림 ({count}개 핀 · 1-9 즉시 전환 · d 삭제 · Esc 닫기)', {
            count: list.length,
          })
        : msg('[Harpoon] 핀이 비어 있습니다 (a 로 현재 파일 추가 · Esc 닫기)'),
  };
}

/**
 * Harpoon 퀵 메뉴 팝업을 닫습니다.
 */
export function closeHarpoonMenu(state: VimEditorState): VimEditorState {
  if (!state.harpoonMenu?.isOpen) return state;
  return {
    ...state,
    harpoonMenu: null,
    commandMessage: undefined,
  };
}

/**
 * 1-based 슬롯 번호로 Harpoon 핀 파일에 즉시 점프합니다 (:Harpoon [1-9]).
 */
export function selectHarpoonSlot(state: VimEditorState, oneBasedSlot: number): VimEditorState {
  const list = getList(state);
  const idx = oneBasedSlot - 1;
  if (idx < 0 || idx >= list.length) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Harpoon] #{slot} 슬롯이 비어 있습니다', { slot: oneBasedSlot }),
    };
  }
  const targetPath = list[idx];
  const base: VimEditorState = {
    ...ensureBuffers(state),
    harpoonMenu: null,
    oilSession: null,
    pendingKeys: undefined,
  };
  const switched = editBuffer(base, targetPath);
  return {
    ...switched,
    harpoonList: list,
    harpoonMenu: null,
    commandMessage: msg('[Harpoon] #{slot} 전환: {path}', {
      slot: oneBasedSlot,
      path: targetPath,
    }),
  };
}

/**
 * Harpoon 핀 목록에서 다음(+1) 또는 이전(-1) 파일로 순환 전환합니다.
 */
export function cycleHarpoonFile(state: VimEditorState, delta: 1 | -1): VimEditorState {
  const list = getList(state);
  if (list.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Harpoon] 등록된 핀 파일이 없습니다'),
    };
  }
  const curIdx = state.primaryFilename ? list.indexOf(state.primaryFilename) : -1;
  const nextIdx =
    curIdx === -1
      ? delta > 0
        ? 0
        : list.length - 1
      : (curIdx + delta + list.length) % list.length;
  return selectHarpoonSlot(state, nextIdx + 1);
}

/**
 * Harpoon 퀵 메뉴 활성 중 키 입력을 처리합니다.
 */
export function handleHarpoonMenuKey(state: VimEditorState, key: string): VimEditorState {
  const menu = state.harpoonMenu;
  if (!menu?.isOpen) return state;

  if (key === 'Escape' || key === 'q' || key === 'Ctrl-c' || key === 'Ctrl+c' || key === 'ctrl-c') {
    return closeHarpoonMenu(state);
  }

  const list = getList(state);

  if (key === 'a') {
    const added = addHarpoonFile(state);
    const nextList = added.harpoonList ?? list;
    return {
      ...added,
      harpoonMenu: {
        isOpen: true,
        selectedIndex: Math.max(0, nextList.length - 1),
      },
    };
  }

  if (/^[1-9]$/.test(key)) {
    return selectHarpoonSlot(state, parseInt(key, 10));
  }

  if (list.length === 0) return state;

  if (key === 'j' || key === 'ArrowDown' || key === 'Ctrl-n' || key === 'Ctrl+n') {
    return {
      ...state,
      harpoonMenu: {
        isOpen: true,
        selectedIndex: (menu.selectedIndex + 1) % list.length,
      },
    };
  }

  if (key === 'k' || key === 'ArrowUp' || key === 'Ctrl-p' || key === 'Ctrl+p') {
    return {
      ...state,
      harpoonMenu: {
        isOpen: true,
        selectedIndex: (menu.selectedIndex - 1 + list.length) % list.length,
      },
    };
  }

  if (key === 'Enter') {
    return selectHarpoonSlot(state, menu.selectedIndex + 1);
  }

  if (key === 'd' || key === 'x') {
    return removeHarpoonFile(state, String(menu.selectedIndex + 1));
  }

  if (key === 'K' && menu.selectedIndex > 0) {
    const nextList = [...list];
    const i = menu.selectedIndex;
    [nextList[i - 1], nextList[i]] = [nextList[i], nextList[i - 1]];
    return {
      ...state,
      harpoonList: nextList,
      harpoonMenu: { isOpen: true, selectedIndex: i - 1 },
    };
  }

  if (key === 'J' && menu.selectedIndex < list.length - 1) {
    const nextList = [...list];
    const i = menu.selectedIndex;
    [nextList[i], nextList[i + 1]] = [nextList[i + 1], nextList[i]];
    return {
      ...state,
      harpoonList: nextList,
      harpoonMenu: { isOpen: true, selectedIndex: i + 1 },
    };
  }

  return state;
}

/**
 * `:Harpoon*` 계열 Ex 명령을 통합 실행합니다.
 */
export function executeHarpoonCommand(
  state: VimEditorState,
  cmdName: string,
  rawArg: string
): VimEditorState {
  const lowerCmd = cmdName.toLowerCase();
  const arg = rawArg.trim();

  if (lowerCmd === 'harpoonadd') return addHarpoonFile(state, arg);
  if (lowerCmd === 'harpoonremove') return removeHarpoonFile(state, arg);
  if (lowerCmd === 'harpoonclear') return clearHarpoonList(state);
  if (lowerCmd === 'harpoonmenu') return openHarpoonMenu(state);
  if (lowerCmd === 'harpoonnext') return cycleHarpoonFile(state, 1);
  if (lowerCmd === 'harpoonprev') return cycleHarpoonFile(state, -1);

  // :Harpoon [arg]
  if (!arg || arg.toLowerCase() === 'menu') return openHarpoonMenu(state);
  if (/^\d+$/.test(arg)) return selectHarpoonSlot(state, parseInt(arg, 10));

  const [sub, ...rest] = arg.split(/\s+/);
  const subLower = sub.toLowerCase();
  const restStr = rest.join(' ');
  if (subLower === 'add') return addHarpoonFile(state, restStr);
  if (subLower === 'remove' || subLower === 'rm' || subLower === 'del') {
    return removeHarpoonFile(state, restStr);
  }
  if (subLower === 'clear') return clearHarpoonList(state);
  if (subLower === 'next') return cycleHarpoonFile(state, 1);
  if (subLower === 'prev') return cycleHarpoonFile(state, -1);

  return {
    ...state,
    bell: true,
    commandMessage: msg('[Harpoon] 알 수 없는 하위 명령입니다: {sub}', { sub }),
  };
}
