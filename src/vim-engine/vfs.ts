import { VimEditorState } from './types';
import { getVimEngineConfig } from './config';
import { msg } from './messages';

export const DEFAULT_VFS_CWD = '/workspace';

/** 현재 작업 디렉터리 경로를 반환합니다. */
export function getEffectiveCwd(state: VimEditorState): string {
  return state.cwd || DEFAULT_VFS_CWD;
}

/** configureVimEngine({ workspaceFiles }) 로 지정한 가상 워크스페이스 파일 */
export function getWorkspaceFiles(): Record<string, string[]> {
  return getVimEngineConfig().workspaceFiles;
}


/**
 * 가상 파일 시스템 또는 시스템 기본 파일에서 파일 내용을 가져옵니다.
 */
export function getVfsFile(
  customFiles: Record<string, string[]> | undefined,
  filename: string,
  stateVirtualFiles?: Record<string, string[]>
): string[] | undefined {
  if (customFiles && customFiles[filename]) {
    return customFiles[filename];
  }
  if (stateVirtualFiles && stateVirtualFiles[filename]) {
    return stateVirtualFiles[filename];
  }
  const workspace = getWorkspaceFiles();
  if (workspace[filename]) {
    return workspace[filename];
  }
  if (filename === '~/.vimrc' || filename === '.vimrc' || filename === 'vimrc') {
    return getVimEngineConfig().vimrc;
  }
  return undefined;
}

/**
 * 현재 버퍼 및 기본 파일들로부터 VFS 파일 맵을 구성합니다.
 */
export function buildVfsMap(state: VimEditorState): Record<string, string[]> {
  const map: Record<string, string[]> = {
    ...getWorkspaceFiles(),
    ...(state.virtualFiles ?? {}),
  };

  if (state.buffers && state.buffers.length > 0) {
    for (const b of state.buffers) {
      if (b.name && !b.name.startsWith('Netrw') && !b.name.startsWith('~')) {
        map[b.name] = [...b.lines];
      }
    }
  }

  const curName = state.primaryFilename;
  if (curName && !curName.startsWith('Netrw') && !curName.startsWith('~')) {
    map[curName] = [...state.lines];
  }

  return map;
}

/**
 * 지정된 가상 경로(currentPath)의 파일 및 디렉터리 목록을 생성합니다.
 */
export function getDirectoryListing(
  files: Record<string, string[]>,
  currentPath: string
): { dirs: string[]; files: string[] } {
  const prefix = currentPath ? (currentPath.endsWith('/') ? currentPath : `${currentPath}/`) : '';
  const dirSet = new Set<string>();
  const fileSet = new Set<string>();

  for (const filePath of Object.keys(files)) {
    if (prefix === '' || filePath.startsWith(prefix)) {
      const rest = filePath.slice(prefix.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx >= 0) {
        dirSet.add(rest.slice(0, slashIdx));
      } else if (rest.length > 0) {
        fileSet.add(rest);
      }
    }
  }

  return {
    dirs: Array.from(dirSet).sort(),
    files: Array.from(fileSet).sort(),
  };
}

/**
 * VFS 내 모든 디렉터리 경로(작업공간 상대 경로)를 수집합니다.
 */
export function getAvailableDirectories(state: VimEditorState): string[] {
  const files: Record<string, string[]> = {
    ...buildVfsMap(state),
    ...(state.netrw?.files ?? {}),
  };
  const dirs = new Set<string>();
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }
  return Array.from(dirs).sort();
}

function normalizeVirtualCwd(baseCwd: string, target: string): string {
  const raw =
    target === '~' || target.startsWith('~/')
      ? DEFAULT_VFS_CWD + target.slice(1)
      : target.startsWith('/')
        ? target
        : `${baseCwd}/${target}`;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

/**
 * 현재 작업 디렉터리(cwd)를 반영하여 VFS 상대 파일 경로를 해석합니다.
 */
export function resolveVfsFilename(state: VimEditorState, filename: string): string {
  const clean = filename.trim();
  const cwd = getEffectiveCwd(state);
  if (!clean || cwd === DEFAULT_VFS_CWD || clean.startsWith('/') || clean.startsWith('~')) {
    return clean;
  }
  const vfs = buildVfsMap(state);
  if (vfs[clean]) return clean;
  const relPrefix = cwd.startsWith(`${DEFAULT_VFS_CWD}/`)
    ? cwd.slice(DEFAULT_VFS_CWD.length + 1)
    : '';
  return relPrefix ? `${relPrefix}/${clean}` : clean;
}

/**
 * :cd / :lcd 명령으로 가상 작업 디렉터리를 변경합니다.
 */
export function changeWorkingDirectory(state: VimEditorState, rawDir?: string): VimEditorState {
  const arg = rawDir?.trim();
  if (!arg) {
    return {
      ...state,
      cwd: DEFAULT_VFS_CWD,
      commandMessage: DEFAULT_VFS_CWD,
    };
  }

  const nextCwd = normalizeVirtualCwd(getEffectiveCwd(state), arg);
  let exists = nextCwd === '/' || nextCwd === DEFAULT_VFS_CWD;

  if (!exists && nextCwd.startsWith(`${DEFAULT_VFS_CWD}/`)) {
    const relDir = nextCwd.slice(DEFAULT_VFS_CWD.length + 1);
    const allDirs = getAvailableDirectories(state);
    exists = allDirs.includes(relDir);
  }

  if (!exists) {
    return {
      ...state,
      commandMessage: msg('E344: cdpath에서 "{dir}" 디렉터리를 찾을 수 없습니다', { dir: arg }),
      bell: true,
    };
  }

  return {
    ...state,
    cwd: nextCwd,
    commandMessage: nextCwd,
  };
}
