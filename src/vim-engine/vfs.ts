import { VimEditorState } from './types';
import { getVimEngineConfig } from './config';
import { msg } from './messages';

export const DEFAULT_VFS_CWD = '/workspace';

/** 현재 활성 창/탭/전역 계층을 반영한 유효 작업 디렉터리 경로를 반환합니다. */
export function getEffectiveCwd(state: VimEditorState): string {
  const isSplit = Boolean(
    state.splitDirection && state.splitDirection !== 'none' && state.splitPanes
  );
  if (isSplit) {
    const paneCwd = state.splitPanes![state.activePaneIndex ?? 0]?.cwd;
    if (paneCwd) return paneCwd;
  } else if (state.windowCwd) {
    return state.windowCwd;
  }
  const activeTabCwd = state.tabPages?.find((t) => t.id === (state.currentTabId ?? 1))?.cwd;
  if (activeTabCwd) return activeTabCwd;
  return state.globalCwd || state.cwd || DEFAULT_VFS_CWD;
}

/** getcwd([winnr [, tabnr]]) 용 지정 창/탭의 작업 디렉터리를 반환합니다. */
export function getCwdForWindow(
  state: VimEditorState,
  winnr?: number,
  tabnr?: number
): string {
  const globalDir = state.globalCwd || state.cwd || DEFAULT_VFS_CWD;
  if (winnr === -1 && (tabnr === undefined || tabnr === 0)) {
    return globalDir;
  }
  if (tabnr !== undefined && tabnr > 0 && state.tabPages) {
    const tab = state.tabPages[tabnr - 1];
    if (!tab) return '';
    if (winnr === -1) return tab.cwd ?? globalDir;
    const isCurTab = tab.id === (state.currentTabId ?? 1);
    const panes = isCurTab ? state.splitPanes : tab.splitPanes;
    const winIdx =
      winnr && winnr > 0
        ? winnr - 1
        : isCurTab
          ? (state.activePaneIndex ?? 0)
          : (tab.activePaneIndex ?? 0);
    if (panes && panes[winIdx]?.cwd) return panes[winIdx].cwd!;
    if (isCurTab && !panes && state.windowCwd) return state.windowCwd;
    return tab.cwd ?? globalDir;
  }
  if (winnr !== undefined && winnr > 0) {
    const activeTabCwd = state.tabPages?.find((t) => t.id === (state.currentTabId ?? 1))?.cwd;
    if (state.splitPanes && state.splitDirection && state.splitDirection !== 'none') {
      const pane = state.splitPanes[winnr - 1];
      if (!pane) return '';
      return pane.cwd ?? activeTabCwd ?? globalDir;
    }
    return winnr === 1 ? getEffectiveCwd(state) : '';
  }
  return getEffectiveCwd(state);
}

/** haslocaldir([winnr [, tabnr]]) 용: 창 로컬(:lcd)=1, 탭 로컬(:tcd)=2, 전역(:cd)=0 */
export function getLocalDirScope(
  state: VimEditorState,
  winnr?: number,
  tabnr?: number
): 0 | 1 | 2 {
  if (tabnr !== undefined && tabnr > 0 && state.tabPages) {
    const tab = state.tabPages[tabnr - 1];
    if (!tab) return 0;
    const isCurTab = tab.id === (state.currentTabId ?? 1);
    const panes = isCurTab ? state.splitPanes : tab.splitPanes;
    const winIdx =
      winnr && winnr > 0
        ? winnr - 1
        : isCurTab
          ? (state.activePaneIndex ?? 0)
          : (tab.activePaneIndex ?? 0);
    if (panes && panes[winIdx]?.cwd) return 1;
    if (isCurTab && !panes && state.windowCwd) return 1;
    return tab.cwd ? 2 : 0;
  }
  const activeTabCwd = state.tabPages?.find((t) => t.id === (state.currentTabId ?? 1))?.cwd;
  const isSplit = Boolean(
    state.splitDirection && state.splitDirection !== 'none' && state.splitPanes
  );
  if (winnr !== undefined && winnr > 0) {
    if (isSplit) {
      const pane = state.splitPanes![winnr - 1];
      if (!pane) return 0;
      if (pane.cwd) return 1;
      return activeTabCwd ? 2 : 0;
    }
    if (winnr !== 1) return 0;
    if (state.windowCwd) return 1;
    return activeTabCwd ? 2 : 0;
  }
  if (isSplit) {
    if (state.splitPanes![state.activePaneIndex ?? 0]?.cwd) return 1;
  } else if (state.windowCwd) {
    return 1;
  }
  return activeTabCwd ? 2 : 0;
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
 * :cd / :lcd / :tcd 명령으로 가상 작업 디렉터리를 변경합니다.
 * - global (:cd): 전역 작업 디렉터리 변경 (활성 창/탭 로컬 오버라이드 해제)
 * - tab (:tcd): 현재 탭 로컬 작업 디렉터리 변경 (활성 창 로컬 오버라이드 해제)
 * - window (:lcd): 현재 창 전용 작업 디렉터리 변경 (다른 창·전역에 영향 없음)
 */
export function changeWorkingDirectory(
  state: VimEditorState,
  rawDir?: string,
  scope: 'global' | 'tab' | 'window' = 'global'
): VimEditorState {
  const arg = rawDir?.trim();
  const curCwd = getEffectiveCwd(state);
  const prevGlobal = state.globalCwd ?? state.cwd ?? DEFAULT_VFS_CWD;
  const isSplit = Boolean(
    state.splitDirection && state.splitDirection !== 'none' && state.splitPanes
  );
  const activeIdx = state.activePaneIndex ?? 0;
  const curTabId = state.currentTabId ?? 1;

  let nextCwd: string;
  if (arg === '-') {
    const storedPrev =
      scope === 'window' && isSplit
        ? (state.splitPanes![activeIdx]?.prevCwd ?? state.prevCwd)
        : scope === 'tab'
          ? (state.tabPages?.find((t) => t.id === curTabId)?.prevCwd ?? state.prevCwd)
          : state.prevCwd;
    if (!storedPrev) {
      return {
        ...state,
        commandMessage: msg('E186: 이전 디렉터리가 없습니다'),
        bell: true,
      };
    }
    nextCwd = storedPrev;
  } else {
    nextCwd = !arg ? DEFAULT_VFS_CWD : normalizeVirtualCwd(curCwd, arg);

    if (arg) {
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
    }
  }

  if (scope === 'window') {
    const nextSplitPanes = isSplit
      ? state.splitPanes!.map((pane, idx) =>
          idx === activeIdx ? { ...pane, cwd: nextCwd, prevCwd: curCwd } : pane
        )
      : state.splitPanes;
    return {
      ...state,
      cwd: nextCwd,
      globalCwd: prevGlobal,
      windowCwd: isSplit ? state.windowCwd : nextCwd,
      prevCwd: curCwd,
      ...(nextSplitPanes ? { splitPanes: nextSplitPanes } : {}),
      commandMessage: nextCwd,
    };
  }

  // :cd 또는 :tcd 는 현재 창의 :lcd 오버라이드를 해제합니다
  const clearedSplitPanes = isSplit
    ? state.splitPanes!.map((pane, idx) =>
        idx === activeIdx ? { ...pane, cwd: undefined } : pane
      )
    : state.splitPanes;

  const nextTabPages = state.tabPages?.map((tab) =>
    tab.id === curTabId
      ? {
          ...tab,
          cwd: scope === 'tab' ? nextCwd : undefined,
          ...(scope === 'tab' ? { prevCwd: curCwd } : {}),
        }
      : tab
  );

  return {
    ...state,
    cwd: nextCwd,
    globalCwd: scope === 'tab' ? prevGlobal : nextCwd,
    windowCwd: undefined,
    prevCwd: curCwd,
    ...(clearedSplitPanes ? { splitPanes: clearedSplitPanes } : {}),
    ...(nextTabPages ? { tabPages: nextTabPages } : {}),
    commandMessage: nextCwd,
  };
}
