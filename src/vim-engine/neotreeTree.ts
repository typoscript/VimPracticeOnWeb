// Neo-tree 파일 트리 노드 계산 (경로 헬퍼, VFS 병합, 가시 노드 목록). neotreeEngine.ts 에서 분리.
import { NeotreeGitStatus, NeotreeNode, VimEditorState } from './types';
import { buildVfsMap } from './vfs';
import { ensureBuffers, isCurrentBufferModified, syncCurrentBuffer } from './bufferEngine';

export function normalizePath(raw: string): string {
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

export function parentDirOf(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

export function basenameOf(path: string): string {
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

export function getEffectiveNeotreeVfs(state: VimEditorState): Record<string, string[]> {
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
