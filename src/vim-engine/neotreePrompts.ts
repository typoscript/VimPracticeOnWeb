// Neo-tree 파일 생성·이름 변경 프롬프트와 삭제. neotreeEngine.ts 에서 분리.
import { VimEditorState } from './types';
import { ensureBuffers, syncCurrentBuffer } from './bufferEngine';
import { msg } from './messages';
import {
  basenameOf,
  buildNeotreeNodes,
  getEffectiveNeotreeVfs,
  normalizePath,
  parentDirOf,
} from './neotreeTree';

/**
 * `a` 키 또는 `+ File` 버튼: 현재 선택된 폴더(또는 파일의 부모 폴더)에 새 파일/폴더 생성 프롬프트를 시작합니다.
 */
export function startNeotreeAddPrompt(state: VimEditorState, index?: number): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const nodes = buildNeotreeNodes(state);
  const idx = index ?? state.neotree.selectedIndex;
  const node = nodes[idx];
  const targetDir = node ? (node.isDir ? node.path : parentDirOf(node.path)) : '';

  return {
    ...state,
    neotree: {
      ...state.neotree,
      selectedIndex: node ? idx : 0,
      isFocused: true,
      prompt: {
        type: 'add',
        targetDir,
        value: '',
      },
    },
    commandMessage: msg('[Neo-tree] 생성할 파일명(폴더는 끝에 /) 입력: {dir}/', {
      dir: targetDir || '.',
    }),
  };
}

/**
 * `r` 키 또는 이름 변경 버튼: 현재 선택된 노드의 이름 변경 프롬프트를 시작합니다.
 */
export function startNeotreeRenamePrompt(state: VimEditorState, index?: number): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const nodes = buildNeotreeNodes(state);
  const idx = index ?? state.neotree.selectedIndex;
  const node = nodes[idx];
  if (!node) return state;

  return {
    ...state,
    neotree: {
      ...state.neotree,
      selectedIndex: idx,
      isFocused: true,
      prompt: {
        type: 'rename',
        targetDir: parentDirOf(node.path),
        targetPath: node.path,
        isDir: node.isDir,
        value: '',
      },
    },
    commandMessage: msg('[Neo-tree] "{name}"의 새 이름 입력:', { name: node.name }),
  };
}

/**
 * Neo-tree 인라인 프롬프트 입력값을 갱신합니다.
 */
export function updateNeotreePromptValue(state: VimEditorState, value: string): VimEditorState {
  if (!state.neotree?.isOpen || !state.neotree.prompt) return state;
  return {
    ...state,
    neotree: {
      ...state.neotree,
      prompt: {
        ...state.neotree.prompt,
        value,
      },
    },
  };
}

/**
 * Neo-tree 인라인 프롬프트를 취소합니다.
 */
export function cancelNeotreePrompt(state: VimEditorState): VimEditorState {
  if (!state.neotree?.isOpen || !state.neotree.prompt) return state;
  return {
    ...state,
    neotree: {
      ...state.neotree,
      prompt: null,
    },
    commandMessage: msg('[Neo-tree] 입력 취소됨'),
  };
}

/**
 * Neo-tree 인라인 프롬프트(파일/폴더 생성 또는 이름 변경)를 확정해 VFS 와 버퍼에 즉시 반영합니다.
 */
export function confirmNeotreePrompt(
  state: VimEditorState,
  explicitValue?: string
): VimEditorState {
  if (!state.neotree?.isOpen || !state.neotree.prompt) return state;
  const prompt = state.neotree.prompt;
  const rawInput = (explicitValue ?? prompt.value).trim();
  if (!rawInput) {
    return cancelNeotreePrompt(state);
  }

  const synced = syncCurrentBuffer(ensureBuffers(state));
  const nextVfs: Record<string, string[]> = { ...getEffectiveNeotreeVfs(synced) };

  if (prompt.type === 'add') {
    const isDir = rawInput.endsWith('/');
    const cleanRel = normalizePath(rawInput.replace(/\/+$/, ''));
    if (!cleanRel) return cancelNeotreePrompt(state);

    const fullPath = prompt.targetDir ? `${prompt.targetDir}/${cleanRel}` : cleanRel;
    if (isDir) {
      const keepKey = `${fullPath}/.gitkeep`;
      if (!(keepKey in nextVfs)) {
        nextVfs[keepKey] = [''];
      }
    } else if (!(fullPath in nextVfs)) {
      nextVfs[fullPath] = [''];
    }

    const collapsedDirs = (synced.neotree!.collapsedDirs ?? []).filter(
      (d) => d !== prompt.targetDir && !fullPath.startsWith(`${d}/`)
    );

    const nextState: VimEditorState = {
      ...synced,
      virtualFiles: nextVfs,
      neotree: {
        ...synced.neotree!,
        collapsedDirs,
        prompt: null,
      },
    };
    const nodes = buildNeotreeNodes(nextState);
    const createdIdx = nodes.findIndex((n) => n.path === fullPath);

    return {
      ...nextState,
      neotree: {
        ...nextState.neotree!,
        selectedIndex: createdIdx >= 0 ? createdIdx : nextState.neotree!.selectedIndex,
      },
      commandMessage: isDir
        ? msg('[Neo-tree] 폴더 생성: "{path}/"', { path: fullPath })
        : msg('[Neo-tree] 파일 생성: "{path}"', { path: fullPath }),
    };
  }

  // rename 처리
  const oldPath = prompt.targetPath;
  if (!oldPath) return cancelNeotreePrompt(state);

  const cleanNewName = normalizePath(rawInput.replace(/\/+$/, ''));
  if (!cleanNewName) return cancelNeotreePrompt(state);

  const newFullPath = prompt.targetDir
    ? `${prompt.targetDir}/${basenameOf(cleanNewName)}`
    : cleanNewName;

  if (newFullPath === oldPath) {
    return cancelNeotreePrompt(state);
  }

  let nextBuffers = synced.buffers ? [...synced.buffers] : undefined;
  let nextPrimary = synced.primaryFilename;
  let nextSplitPanes = synced.splitPanes ? [...synced.splitPanes] : undefined;

  if (prompt.isDir) {
    const oldPrefix = `${oldPath}/`;
    const newPrefix = `${newFullPath}/`;
    for (const key of Object.keys(nextVfs)) {
      const normKey = normalizePath(key);
      if (normKey === oldPath || normKey.startsWith(oldPrefix)) {
        const suffix = normKey.slice(oldPath.length);
        const movedKey = `${newFullPath}${suffix}`;
        nextVfs[movedKey] = nextVfs[key];
        delete nextVfs[key];
      }
    }
    if (nextBuffers) {
      nextBuffers = nextBuffers.map((b) => {
        const normName = normalizePath(b.name);
        if (normName.startsWith(oldPrefix)) {
          return { ...b, name: newPrefix + normName.slice(oldPrefix.length) };
        }
        return b;
      });
    }
    if (nextPrimary && normalizePath(nextPrimary).startsWith(oldPrefix)) {
      nextPrimary = newPrefix + normalizePath(nextPrimary).slice(oldPrefix.length);
    }
  } else {
    const content = nextVfs[oldPath] ?? [''];
    delete nextVfs[oldPath];
    nextVfs[newFullPath] = content;

    if (nextBuffers) {
      nextBuffers = nextBuffers.map((b) =>
        normalizePath(b.name) === oldPath ? { ...b, name: newFullPath } : b
      );
    }
    if (nextPrimary && normalizePath(nextPrimary) === oldPath) {
      nextPrimary = newFullPath;
    }
    if (nextSplitPanes) {
      nextSplitPanes = nextSplitPanes.map((p) =>
        p.filename && normalizePath(p.filename) === oldPath ? { ...p, filename: newFullPath } : p
      );
    }
  }

  const nextState: VimEditorState = {
    ...synced,
    virtualFiles: nextVfs,
    buffers: nextBuffers,
    primaryFilename: nextPrimary,
    splitPanes: nextSplitPanes,
    neotree: {
      ...synced.neotree!,
      prompt: null,
    },
  };

  const nodes = buildNeotreeNodes(nextState);
  const renamedIdx = nodes.findIndex((n) => n.path === newFullPath);

  return {
    ...nextState,
    neotree: {
      ...nextState.neotree!,
      selectedIndex: renamedIdx >= 0 ? renamedIdx : nextState.neotree!.selectedIndex,
    },
    commandMessage: msg('[Neo-tree] 이름 변경: "{old}" → "{new}"', {
      old: oldPath,
      new: newFullPath,
    }),
  };
}

/**
 * `d` 키 또는 삭제 버튼: 선택된 파일 또는 폴더를 VFS 에서 삭제합니다.
 */
export function deleteNeotreeNode(state: VimEditorState, index?: number): VimEditorState {
  if (!state.neotree?.isOpen) return state;
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const nodes = buildNeotreeNodes(synced);
  const idx = index ?? synced.neotree!.selectedIndex;
  const node = nodes[idx];
  if (!node) return state;

  const nextVfs: Record<string, string[]> = { ...getEffectiveNeotreeVfs(synced) };
  if (node.isDir) {
    const dirPrefix = `${node.path}/`;
    for (const key of Object.keys(nextVfs)) {
      const normKey = normalizePath(key);
      if (normKey === node.path || normKey.startsWith(dirPrefix)) {
        delete nextVfs[key];
      }
    }
  } else {
    delete nextVfs[node.path];
  }

  const nextBuffers = synced.buffers?.filter((b) => {
    const normName = normalizePath(b.name);
    if (b.id === (synced.currentBufferId ?? 1)) return true;
    if (node.isDir) return !normName.startsWith(`${node.path}/`);
    return normName !== node.path;
  });

  const tempState: VimEditorState = {
    ...synced,
    virtualFiles: nextVfs,
    buffers: nextBuffers,
  };
  const remainingNodes = buildNeotreeNodes(tempState);
  const clampedIdx = Math.max(0, Math.min(idx, Math.max(0, remainingNodes.length - 1)));

  return {
    ...tempState,
    neotree: {
      ...synced.neotree!,
      selectedIndex: clampedIdx,
      prompt: null,
    },
    commandMessage: msg('[Neo-tree] 삭제 완료: "{path}"', { path: node.path }),
  };
}
