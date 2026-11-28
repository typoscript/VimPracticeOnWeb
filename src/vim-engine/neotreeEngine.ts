import { NeotreeSessionState, VimEditorState } from './types';
import { addBuffer, editBuffer, ensureBuffers, syncCurrentBuffer } from './bufferEngine';
import { splitWindow, switchPaneFocus } from './splitWindow';
import { openNewTab } from './tabEngine';
import { msg } from './messages';
import {
  buildNeotreeNodes,
  getEffectiveNeotreeVfs,
  normalizePath,
  parentDirOf,
} from './neotreeTree';
import {
  cancelNeotreePrompt,
  confirmNeotreePrompt,
  deleteNeotreeNode,
  startNeotreeAddPrompt,
  startNeotreeRenamePrompt,
  updateNeotreePromptValue,
} from './neotreePrompts';

export { buildNeotreeNodes } from './neotreeTree';
export {
  cancelNeotreePrompt,
  confirmNeotreePrompt,
  deleteNeotreeNode,
  startNeotreeAddPrompt,
  startNeotreeRenamePrompt,
  updateNeotreePromptValue,
} from './neotreePrompts';

/**
 * `:Neotree [focus|show|reveal]` — neo-tree.nvim 스타일 좌측 영구 파일 트리 사이드바를 엽니다.
 */
export function openNeotree(
  state: VimEditorState,
  options?: { focus?: boolean; reveal?: boolean }
): VimEditorState {
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const vfs = getEffectiveNeotreeVfs(synced);
  const focus = options?.focus ?? true;
  const reveal = options?.reveal ?? !synced.neotree?.isOpen;

  const prev = synced.neotree;
  const initialFilePaths =
    prev?.initialFilePaths ?? Object.keys(vfs).map(normalizePath).filter(Boolean);
  let collapsedDirs = prev?.collapsedDirs ? [...prev.collapsedDirs] : [];

  const activeFile = normalizePath(synced.primaryFilename || '');
  if (reveal && activeFile.includes('/')) {
    const parts = activeFile.split('/');
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      collapsedDirs = collapsedDirs.filter((d) => d !== prefix);
    }
  }

  const tempSession: NeotreeSessionState = {
    isOpen: true,
    isFocused: focus,
    selectedIndex: prev?.selectedIndex ?? 0,
    collapsedDirs,
    prompt: null,
    initialFilePaths,
  };

  const tempState: VimEditorState = {
    ...synced,
    virtualFiles: vfs,
    neotree: tempSession,
  };

  const nodes = buildNeotreeNodes(tempState);
  let selectedIndex = Math.max(0, Math.min(tempSession.selectedIndex, Math.max(0, nodes.length - 1)));
  if (reveal && activeFile) {
    const foundIdx = nodes.findIndex((n) => !n.isDir && n.path === activeFile);
    if (foundIdx >= 0) {
      selectedIndex = foundIdx;
    }
  }

  return {
    ...tempState,
    neotree: {
      ...tempSession,
      selectedIndex,
    },
    pendingKeys: undefined,
    commandMessage: msg(
      '[Neo-tree] 파일 트리 열림 (j/k 이동 · Enter 열기 · s 분할 · a 생성 · r 이름변경 · d 삭제 · q 닫기)'
    ),
  };
}

/**
 * `:Neotree close` / `:NvimTreeClose` — Neo-tree 사이드바를 닫습니다.
 */
export function closeNeotree(state: VimEditorState): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  return {
    ...state,
    neotree: {
      ...state.neotree,
      isOpen: false,
      isFocused: false,
      prompt: null,
    },
    pendingKeys: undefined,
    commandMessage: msg('[Neo-tree] 파일 트리를 닫았습니다'),
  };
}

/**
 * `:Neotree toggle` / `:NvimTreeToggle` — Neo-tree 사이드바를 토글합니다.
 */
export function toggleNeotree(state: VimEditorState): VimEditorState {
  if (state.neotree?.isOpen) {
    return closeNeotree(state);
  }
  return openNeotree(state, { focus: true, reveal: true });
}

/**
 * Neo-tree 사이드바의 키보드 포커스 여부를 변경합니다.
 */
export function setNeotreeFocus(state: VimEditorState, isFocused: boolean): VimEditorState {
  if (!state.neotree?.isOpen) {
    return isFocused ? openNeotree(state, { focus: true }) : state;
  }
  return {
    ...state,
    neotree: {
      ...state.neotree,
      isFocused,
    },
  };
}

/**
 * Neo-tree 커서 선택 인덱스를 변경합니다.
 */
export function selectNeotreeIndex(state: VimEditorState, index: number): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const nodes = buildNeotreeNodes(state);
  if (nodes.length === 0) return state;
  const clamped = Math.max(0, Math.min(index, nodes.length - 1));
  return {
    ...state,
    neotree: {
      ...state.neotree,
      selectedIndex: clamped,
    },
  };
}

/**
 * 지정 디렉터리 경로의 펼침/접힘 상태를 토글합니다.
 */
export function toggleNeotreeDir(state: VimEditorState, dirPath: string): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const norm = normalizePath(dirPath);
  const collapsed = state.neotree.collapsedDirs ?? [];
  const nextCollapsed = collapsed.includes(norm)
    ? collapsed.filter((d) => d !== norm)
    : [...collapsed, norm];

  const nextState: VimEditorState = {
    ...state,
    neotree: {
      ...state.neotree,
      collapsedDirs: nextCollapsed,
    },
  };
  const nodes = buildNeotreeNodes(nextState);
  const clampedIdx = Math.max(
    0,
    Math.min(nextState.neotree!.selectedIndex, Math.max(0, nodes.length - 1))
  );
  return {
    ...nextState,
    neotree: {
      ...nextState.neotree!,
      selectedIndex: clampedIdx,
    },
  };
}

/**
 * 선택된(또는 지정 인덱스의) Neo-tree 노드를 열거나(폴더면 펼침/접힘) 분할 창·새 탭으로 엽니다.
 */
export function openNeotreeNode(
  state: VimEditorState,
  index?: number,
  mode: 'edit' | 'vsplit' | 'split' | 'tab' = 'edit'
): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const nodes = buildNeotreeNodes(synced);
  if (nodes.length === 0) return synced;

  const targetIdx = index ?? synced.neotree!.selectedIndex;
  const node = nodes[targetIdx] ?? nodes[0];
  if (!node) return synced;

  if (node.isDir) {
    const toggled = toggleNeotreeDir(synced, node.path);
    return {
      ...toggled,
      neotree: {
        ...toggled.neotree!,
        selectedIndex: targetIdx,
      },
    };
  }

  const vfs = getEffectiveNeotreeVfs(synced);
  const fileLines = vfs[node.path] ? [...vfs[node.path]] : [''];

  // 사이드바는 열린 채로 유지하고 포커스만 에디터로 이동
  const unfocusedState: VimEditorState = {
    ...synced,
    virtualFiles: vfs,
    neotree: {
      ...synced.neotree!,
      selectedIndex: targetIdx,
      isFocused: false,
      prompt: null,
    },
  };

  if (mode === 'vsplit' || mode === 'split') {
    const withBuf = addBuffer(unfocusedState, node.path);
    const dir = mode === 'vsplit' ? 'vertical' : 'horizontal';
    const splitted = splitWindow(withBuf, dir, fileLines, node.path);
    const newPaneIdx = Math.max(0, (splitted.splitPanes?.length ?? 1) - 1);
    const focusedPane = switchPaneFocus(splitted, newPaneIdx);
    return {
      ...focusedPane,
      commandMessage: msg('[Neo-tree] 분할 열기: "{path}"', { path: node.path }),
    };
  }

  if (mode === 'tab') {
    const tabbed = openNewTab(unfocusedState, node.path);
    return {
      ...tabbed,
      lines: fileLines,
      cursor: { line: 0, col: 0 },
      commandMessage: msg('[Neo-tree] 새 탭 열기: "{path}"', { path: node.path }),
    };
  }

  const edited = editBuffer(unfocusedState, node.path);
  return {
    ...edited,
    commandMessage: msg('[Neo-tree] 열기: "{path}"', { path: node.path }),
  };
}


/**
 * `:Neotree [action]` 및 `:NvimTreeToggle` / `:NvimTreeFocus` / `:NvimTreeOpen` / `:NvimTreeClose` / `:NvimTreeFindFile` 명령 처리기.
 */
export function executeNeotreeCommand(
  state: VimEditorState,
  cmdName: string,
  rawArgs: string
): VimEditorState {
  const lowerCmd = cmdName.toLowerCase();
  const arg = rawArgs.trim().toLowerCase();

  if (lowerCmd === 'nvimtreetoggle') {
    return toggleNeotree(state);
  }
  if (lowerCmd === 'nvimtreeclose') {
    return closeNeotree(state);
  }
  if (lowerCmd === 'nvimtreefocus' || lowerCmd === 'nvimtreeopen') {
    return openNeotree(state, { focus: true, reveal: false });
  }
  if (lowerCmd === 'nvimtreefindfile') {
    return openNeotree(state, { focus: true, reveal: true });
  }

  // :Neotree [toggle|focus|show|close|reveal]
  if (arg === 'close' || arg === 'hide') {
    return closeNeotree(state);
  }
  if (arg === 'toggle') {
    return toggleNeotree(state);
  }
  if (arg === 'show') {
    return openNeotree(state, { focus: false, reveal: false });
  }
  if (arg === 'reveal') {
    return openNeotree(state, { focus: true, reveal: true });
  }
  if (arg === 'focus' || arg === '') {
    return openNeotree(state, { focus: true, reveal: !state.neotree?.isOpen });
  }

  return openNeotree(state, { focus: true, reveal: true });
}

/**
 * Neo-tree 사이드바가 포커스된 상태(`neotree.isOpen && neotree.isFocused`)일 때 키 입력을 처리합니다.
 * `:` 입력 시에는 `null`을 반환해 일반 Ex 커맨드라인 진입을 허용합니다.
 */
export function handleNeotreeKey(
  state: VimEditorState,
  key: string
): VimEditorState | null {
  const neotree = state.neotree;
  if (!neotree?.isOpen || !neotree.isFocused) return null;

  // 1. 인라인 프롬프트(a 생성 / r 이름변경) 입력 중일 때
  if (neotree.prompt) {
    if (key === 'Escape') {
      return cancelNeotreePrompt(state);
    }
    if (key === 'Enter') {
      return confirmNeotreePrompt(state);
    }
    if (key === 'Backspace') {
      return updateNeotreePromptValue(state, neotree.prompt.value.slice(0, -1));
    }
    if (key.length === 1 && !key.startsWith('Ctrl-') && !key.startsWith('Alt-')) {
      return updateNeotreePromptValue(state, neotree.prompt.value + key);
    }
    return state;
  }

  // 2. Ex 커맨드라인(:) 진입은 일반 엔진으로 넘김
  if (key === ':' && !state.pendingKeys) {
    return null;
  }

  const nodes = buildNeotreeNodes(state);
  const count = nodes.length;
  const curIdx = neotree.selectedIndex;

  // Ctrl-w l / Ctrl-w w / Tab 으로 에디터 창으로 포커스 이동
  if (state.pendingKeys === 'Ctrl-w') {
    if (key === 'l' || key === 'w' || key === 'p' || key === 'Ctrl-w') {
      return {
        ...setNeotreeFocus(state, false),
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }
  if (key === 'Ctrl-w') {
    return { ...state, pendingKeys: 'Ctrl-w' };
  }
  if (key === 'Tab') {
    return setNeotreeFocus(state, false);
  }

  // gg 대기 키 처리
  if (state.pendingKeys === 'g') {
    if (key === 'g') {
      return {
        ...selectNeotreeIndex(state, 0),
        pendingKeys: undefined,
      };
    }
    return { ...state, pendingKeys: undefined };
  }
  if (key === 'g') {
    return { ...state, pendingKeys: 'g' };
  }

  if (key === 'G') {
    return selectNeotreeIndex(state, Math.max(0, count - 1));
  }
  if (key === 'j' || key === 'ArrowDown') {
    return selectNeotreeIndex(state, Math.min(Math.max(0, count - 1), curIdx + 1));
  }
  if (key === 'k' || key === 'ArrowUp') {
    return selectNeotreeIndex(state, Math.max(0, curIdx - 1));
  }

  if (key === 'Enter' || key === 'o' || key === 'l' || key === 'ArrowRight') {
    return openNeotreeNode(state, curIdx, 'edit');
  }
  if (key === 'h' || key === 'Backspace' || key === 'ArrowLeft') {
    const curNode = nodes[curIdx];
    if (!curNode) return state;
    if (curNode.isDir && curNode.isExpanded) {
      return toggleNeotreeDir(state, curNode.path);
    }
    const parentPath = parentDirOf(curNode.path);
    if (parentPath) {
      const parentIdx = nodes.findIndex((n) => n.isDir && n.path === parentPath);
      if (parentIdx >= 0) {
        return selectNeotreeIndex(state, parentIdx);
      }
    }
    return state;
  }

  if (key === 's' || key === 'v') {
    return openNeotreeNode(state, curIdx, 'vsplit');
  }
  if (key === 'S') {
    return openNeotreeNode(state, curIdx, 'split');
  }
  if (key === 't') {
    return openNeotreeNode(state, curIdx, 'tab');
  }
  if (key === 'a') {
    return startNeotreeAddPrompt(state, curIdx);
  }
  if (key === 'r') {
    return startNeotreeRenamePrompt(state, curIdx);
  }
  if (key === 'd' || key === 'D') {
    return deleteNeotreeNode(state, curIdx);
  }
  if (key === 'q' || key === 'Escape') {
    return closeNeotree(state);
  }

  return state;
}
