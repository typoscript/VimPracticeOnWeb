import { VimEditorState } from './types';
import { getVimEngineConfig } from './config';

/** configureVimEngine({ workspaceFiles }) 로 지정한 가상 워크스페이스 파일 */
export function getWorkspaceFiles(): Record<string, string[]> {
  return getVimEngineConfig().workspaceFiles;
}


/**
 * 가상 파일 시스템 또는 시스템 기본 파일에서 파일 내용을 가져옵니다.
 */
export function getVfsFile(
  customFiles: Record<string, string[]> | undefined,
  filename: string
): string[] | undefined {
  if (customFiles && customFiles[filename]) {
    return customFiles[filename];
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
  const map: Record<string, string[]> = { ...getWorkspaceFiles() };

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
