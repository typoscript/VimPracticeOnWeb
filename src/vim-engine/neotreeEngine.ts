import {
  NeotreeGitStatus,
  NeotreeNode,
  NeotreeSessionState,
  VimEditorState,
} from './types';
import { buildVfsMap } from './vfs';
import {
  addBuffer,
  editBuffer,
  ensureBuffers,
  isCurrentBufferModified,
  syncCurrentBuffer,
} from './bufferEngine';
import { splitWindow, switchPaneFocus } from './splitWindow';
import { openNewTab } from './tabEngine';
import { msg } from './messages';

function normalizePath(raw: string): string {
  const parts = raw.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

function parentDirOf(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

function basenameOf(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? norm : norm.slice(idx + 1);
}

interface InternalDirTree {
  dirs: Map<string, InternalDirTree>;
  files: Set<string>;
}

function makeInternalDirTree(): InternalDirTree {
  return { dirs: new Map(), files: new Set() };
}

function getEffectiveNeotreeVfs(state: VimEditorState): Record<string, string[]> {
  if (state.virtualFiles) {
    const map: Record<string, string[]> = { ...state.virtualFiles };
    if (state.buffers) {
      for (const b of state.buffers) {
        if (b.name && b.name in map) {
          map[b.name] = [...b.lines];
        }
      }
    }
    const curName = state.primaryFilename;
    if (curName && curName in map) {
      map[curName] = [...state.lines];
    }
    return map;
  }
  return buildVfsMap(state);
}

/**
 * 현재 VFS·열린 버퍼·진단·Git 상태를 기반으로 Neo-tree 가시 노드 배열을 생성합니다.
 */
export function buildNeotreeNodes(state: VimEditorState): NeotreeNode[] {
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const vfs = getEffectiveNeotreeVfs(synced);
  const collapsedSet = new Set(synced.neotree?.collapsedDirs ?? []);
  const initialSet = synced.neotree?.initialFilePaths
    ? new Set(synced.neotree.initialFilePaths.map(normalizePath))
    : null;

  const activeFile = normalizePath(synced.primaryFilename || 'sandbox.ts');
  const root = makeInternalDirTree();

  for (const rawKey of Object.keys(vfs)) {
    const norm = normalizePath(rawKey);
    if (!norm || norm.startsWith('Netrw') || norm.startsWith('oil://') || norm.startsWith('term://')) {
      continue;
    }
    const segments = norm.split('/');
    let curr = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const dirName = segments[i];
      let child = curr.dirs.get(dirName);
      if (!child) {
        child = makeInternalDirTree();
        curr.dirs.set(dirName, child);
      }
      curr = child;
    }
    const lastSeg = segments[segments.length - 1];
    if (lastSeg !== '.gitkeep') {
      curr.files.add(lastSeg);
    }
  }

  const computeFileStatus = (
    fullPath: string
  ): {
    isActiveBuffer: boolean;
    isModified: boolean;
    gitStatus?: NeotreeGitStatus;
    errorCount?: number;
    warningCount?: number;
  } => {
    const isActiveBuffer = fullPath === activeFile;
    const buf = synced.buffers?.find((b) => normalizePath(b.name) === fullPath);

    let isModified = false;
    if (isActiveBuffer) {
      const diffFromGitBase =
        Array.isArray(synced.gitBaseLines) &&
        (synced.gitBaseLines.length !== synced.lines.length ||
          synced.gitBaseLines.some((l, i) => l !== synced.lines[i]));
      isModified = Boolean(buf?.isModified) || isCurrentBufferModified(synced) || diffFromGitBase;
    } else if (buf) {
      const diffFromBufGitBase =
        Array.isArray(buf.gitBaseLines) &&
        (buf.gitBaseLines.length !== buf.lines.length ||
          buf.gitBaseLines.some((l, i) => l !== buf.lines[i]));
      isModified = Boolean(buf.isModified) || diffFromBufGitBase;
    }

    let gitStatus: NeotreeGitStatus | undefined;
    if (isActiveBuffer && synced.gitStaged) {
      gitStatus = 'S';
    } else if (initialSet && !initialSet.has(fullPath)) {
      gitStatus = 'U';
    } else if (isModified) {
      gitStatus = 'M';
    }

    let errorCount = 0;
    let warningCount = 0;
    if (isActiveBuffer && synced.lspDiagnostics) {
      for (const d of synced.lspDiagnostics) {
        if (d.severity === 'error') errorCount++;
        else if (d.severity === 'warning') warningCount++;
      }
    }

    return {
      isActiveBuffer,
      isModified,
      gitStatus,
      errorCount: errorCount > 0 ? errorCount : undefined,
      warningCount: warningCount > 0 ? warningCount : undefined,
    };
  };

  const computeDirGitStatus = (tree: InternalDirTree, prefix: string): NeotreeGitStatus | undefined => {
    let foundStatus: NeotreeGitStatus | undefined;
    for (const fileName of tree.files) {
      const st = computeFileStatus(prefix ? `${prefix}/${fileName}` : fileName).gitStatus;
      if (st === 'M') return 'M';
      if (st === 'U') foundStatus = 'U';
      else if (st === 'S' && !foundStatus) foundStatus = 'S';
    }
    for (const [dirName, childTree] of tree.dirs.entries()) {
      const childPath = prefix ? `${prefix}/${dirName}` : dirName;
      const st = computeDirGitStatus(childTree, childPath);
      if (st === 'M') return 'M';
      if (st === 'U') foundStatus = 'U';
      else if (st === 'S' && !foundStatus) foundStatus = 'S';
    }
    return foundStatus;
  };

  const out: NeotreeNode[] = [];

  const traverse = (tree: InternalDirTree, prefix: string, depth: number) => {
    const sortedDirs = Array.from(tree.dirs.keys()).sort((a, b) => a.localeCompare(b));
    const sortedFiles = Array.from(tree.files).sort((a, b) => a.localeCompare(b));

    for (const dirName of sortedDirs) {
      const dirPath = prefix ? `${prefix}/${dirName}` : dirName;
      const isExpanded = !collapsedSet.has(dirPath);
      const childTree = tree.dirs.get(dirName)!;
      const dirGitStatus = computeDirGitStatus(childTree, dirPath);
      out.push({
        path: dirPath,
        name: dirName,
        depth,
        isDir: true,
        isExpanded,
        gitStatus: dirGitStatus,
      });
      if (isExpanded) {
        traverse(childTree, dirPath, depth + 1);
      }
    }

    for (const fileName of sortedFiles) {
      const filePath = prefix ? `${prefix}/${fileName}` : fileName;
      const meta = computeFileStatus(filePath);
      out.push({
        path: filePath,
        name: fileName,
        depth,
        isDir: false,
        ...meta,
      });
    }
  };

  traverse(root, '', 0);
  return out;
}

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
