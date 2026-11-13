import { NetrwState, VimEditorState } from './types';
import { editBuffer, syncCurrentBuffer, ensureBuffers } from './bufferEngine';
import { splitWindow } from './splitWindow';
import { openNewTab } from './tabEngine';

export const BANNER_LINES_COUNT = 5;

import { buildVfsMap, getDirectoryListing } from './vfs';
import { msg } from './messages';
export { getWorkspaceFiles, buildVfsMap, getDirectoryListing } from './vfs';

/**
 * Netrw 브라우저 버퍼 라인을 생성합니다.
 */
export function generateNetrwLines(
  files: Record<string, string[]>,
  currentPath: string
): string[] {
  const displayPath = currentPath ? `/${currentPath}` : '/';
  const banner = [
    '" ==============================================================================',
    '" Netrw Directory Listing                                   (netrw v173)',
    `"   /workspace${displayPath === '/' ? '' : displayPath}`,
    '"   Quick Help: <CR>:open  -:up-dir  mb:bookmark  gb:jump  v:vsplit  o:split  t:tab  q:close',
    '" ==============================================================================',
    '../',
    './',
  ];

  const { dirs, files: fileList } = getDirectoryListing(files, currentPath);
  for (const d of dirs) {
    banner.push(`${d}/`);
  }
  for (const f of fileList) {
    banner.push(f);
  }

  return banner;
}

/**
 * Netrw 파일 탐색기를 엽니다 (:Explore, :Vexplore, :Sexplore, :Texplore, :edit .).
 */
export function openNetrw(
  state: VimEditorState,
  targetDir = '',
  mode: 'current' | 'vsplit' | 'split' | 'tab' = 'current'
): VimEditorState {
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const vfs = state.virtualFiles
    ? { ...state.virtualFiles }
    : (state.netrw?.files ? { ...state.netrw.files } : buildVfsMap(synced));

  let targetState = synced;
  if (mode === 'vsplit') {
    targetState = splitWindow(targetState, 'vertical', [''], 'Netrw');
  } else if (mode === 'split') {
    targetState = splitWindow(targetState, 'horizontal', [''], 'Netrw');
  } else if (mode === 'tab') {
    targetState = openNewTab(targetState, 'Netrw');
  }

  const netrwLines = generateNetrwLines(vfs, targetDir);
  const netrwName = `Netrw [${targetDir || '/'}]`;

  const buffers = targetState.buffers ?? [];
  const maxId = buffers.reduce((max, b) => Math.max(max, b.id), 0);
  const netrwBufId = maxId + 1;
  const netrwBuf = {
    id: netrwBufId,
    name: netrwName,
    lines: netrwLines,
    cursor: { line: BANNER_LINES_COUNT, col: 0 },
    undoStack: [],
    redoStack: [],
    isModified: false,
  };

  const netrwSession: NetrwState = {
    isOpen: true,
    currentPath: targetDir,
    returnBufferId: synced.currentBufferId,
    returnFilename: synced.primaryFilename,
    files: vfs,
  };

  return {
    ...targetState,
    buffers: [...buffers, netrwBuf],
    currentBufferId: netrwBufId,
    alternateBufferId: synced.currentBufferId,
    primaryFilename: netrwName,
    lines: netrwLines,
    cursor: { line: BANNER_LINES_COUNT, col: 0 }, // '../' 위치에 커서 시작
    mode: 'NORMAL',
    netrw: netrwSession,
    virtualFiles: vfs,
    commandMessage: msg('[Netrw] /workspace/{targetDir} (Enter: 열기, -: 상위, q: 닫기)', { targetDir }),
  };
}

/**
 * Netrw 탐색기 창을 닫고 원래 버퍼/파일로 복귀합니다.
 */
export function closeNetrw(state: VimEditorState): VimEditorState {
  if (!state.netrw) return state;

  const returnBufId = state.netrw.returnBufferId;
  const returnFile = state.netrw.returnFilename;
  const curBufId = state.currentBufferId;
  const vfs = state.netrw.files ?? state.virtualFiles;

  const remainingBuffers =
    state.buffers?.filter((b) => b.id !== curBufId && !b.name.startsWith('Netrw')) ?? [];

  const targetBuf =
    remainingBuffers.find((b) => b.id === returnBufId) ??
    remainingBuffers.find((b) => b.name === returnFile);

  if (targetBuf) {
    return {
      ...state,
      buffers: remainingBuffers,
      currentBufferId: targetBuf.id,
      primaryFilename: targetBuf.name,
      lines: [...targetBuf.lines],
      cursor: { ...targetBuf.cursor },
      undoStack: targetBuf.undoStack ? [...targetBuf.undoStack] : [],
      redoStack: targetBuf.redoStack ? [...targetBuf.redoStack] : [],
      netrw: null,
      virtualFiles: vfs,
      commandMessage: msg('Netrw 닫힘'),
    };
  }

  if (returnFile) {
    const fileLines = state.netrw.files?.[returnFile] ?? [''];
    return {
      ...state,
      buffers: remainingBuffers,
      primaryFilename: returnFile,
      lines: [...fileLines],
      cursor: { line: 0, col: 0 },
      netrw: null,
      virtualFiles: vfs,
      commandMessage: msg('Netrw 닫힘'),
    };
  }

  return {
    ...state,
    buffers: remainingBuffers,
    netrw: null,
    virtualFiles: vfs,
    commandMessage: msg('Netrw 닫힘'),
  };
}

/**
 * Netrw 북마크에 디렉터리 경로를 추가합니다 (:Bookmark, mb).
 */
export function addNetrwBookmark(
  state: VimEditorState,
  targetPath: string
): VimEditorState {
  const cleanPath = targetPath.replace(/^\/+|\/+$/g, '');
  const existing = state.netrwBookmarks ? [...state.netrwBookmarks] : [];
  if (!existing.includes(cleanPath)) {
    existing.push(cleanPath);
  }
  const display = cleanPath ? `/${cleanPath}` : '/';
  const updatedNetrw = state.netrw ? { ...state.netrw, pendingKey: undefined } : state.netrw;

  return {
    ...state,
    netrw: updatedNetrw,
    netrwBookmarks: existing,
    commandMessage: msg('[Netrw 북마크 추가] {path}', { path: display }),
  };
}

/**
 * Netrw 북마크에서 디렉터리 경로를 삭제합니다 (mB).
 */
export function removeNetrwBookmark(
  state: VimEditorState,
  targetPath: string
): VimEditorState {
  const cleanPath = targetPath.replace(/^\/+|\/+$/g, '');
  const existing = (state.netrwBookmarks ?? []).filter((b) => b !== cleanPath);
  const display = cleanPath ? `/${cleanPath}` : '/';
  const updatedNetrw = state.netrw ? { ...state.netrw, pendingKey: undefined } : state.netrw;

  return {
    ...state,
    netrw: updatedNetrw,
    netrwBookmarks: existing,
    commandMessage: msg('[Netrw 북마크 삭제] {path}', { path: display }),
  };
}

/**
 * Netrw 북마크 목록으로 이동합니다 (gb 순환 이동 또는 특정 인덱스).
 */
export function goToNetrwBookmark(
  state: VimEditorState,
  targetIndex?: number
): VimEditorState {
  const bookmarks = state.netrwBookmarks ?? [];
  if (bookmarks.length === 0) {
    const updatedNetrw = state.netrw ? { ...state.netrw, pendingKey: undefined } : state.netrw;
    return {
      ...state,
      netrw: updatedNetrw,
      bell: true,
      commandMessage: msg('등록된 Netrw 북마크가 없습니다.'),
    };
  }

  let nextIdx: number;
  if (targetIndex !== undefined) {
    nextIdx = Math.max(0, Math.min(targetIndex, bookmarks.length - 1));
  } else {
    const curIdx = state.netrwBookmarkIndex ?? -1;
    nextIdx = (curIdx + 1) % bookmarks.length;
  }

  const targetPath = bookmarks[nextIdx];
  const display = targetPath || '';

  if (state.netrw && state.netrw.isOpen) {
    const newLines = generateNetrwLines(state.netrw.files, targetPath);
    return {
      ...state,
      lines: newLines,
      cursor: { line: BANNER_LINES_COUNT, col: 0 },
      netrw: {
        ...state.netrw,
        currentPath: targetPath,
        pendingKey: undefined,
      },
      netrwBookmarkIndex: nextIdx,
      commandMessage: msg('[Netrw 북마크 이동] /workspace/{path}', { path: display }),
    };
  }

  const opened = openNetrw(state, targetPath);
  return {
    ...opened,
    netrwBookmarkIndex: nextIdx,
    commandMessage: msg('[Netrw 북마크 이동] /workspace/{path}', { path: display }),
  };
}

/**
 * Netrw 북마크 목록을 서식화합니다 (:Bookmarks).
 */
export function formatNetrwBookmarks(state: VimEditorState): string {
  const bookmarks = state.netrwBookmarks ?? [];
  if (bookmarks.length === 0) {
    return msg('등록된 Netrw 북마크가 없습니다.');
  }

  const lines = [msg('--- Netrw Bookmarks ---')];
  bookmarks.forEach((bm, idx) => {
    const pathStr = bm ? `/${bm}` : '/';
    lines.push(`  ${idx + 1}: /workspace${pathStr === '/' ? '' : pathStr}`);
  });
  return lines.join('\n');
}

/**
 * Netrw 버퍼에서 키 입력을 처리합니다 (<CR>, -, v, o, t, q, %, d, D, mb, gb 등).
 */
export function handleNetrwKey(
  state: VimEditorState,
  key: string
): VimEditorState | null {
  const netrw = state.netrw;
  if (!netrw || !netrw.isOpen) return null;

  // 1. 'q': Netrw 종료 및 복귀
  if (key === 'q' || key === 'Escape') {
    return closeNetrw(state);
  }

  const curLineIdx = state.cursor.line;
  const lineText = (state.lines[curLineIdx] ?? '').trim();

  // 2. 접두어 키 상태 처리 ('m', 'g')
  if (netrw.pendingKey === 'm') {
    if (key === 'b') {
      let targetPath = netrw.currentPath;
      if (curLineIdx >= BANNER_LINES_COUNT) {
        if (lineText === '../') {
          const parts = netrw.currentPath.split('/').filter(Boolean);
          parts.pop();
          targetPath = parts.join('/');
        } else if (lineText !== './' && lineText.endsWith('/')) {
          const dir = lineText.slice(0, -1);
          targetPath = netrw.currentPath ? `${netrw.currentPath}/${dir}` : dir;
        }
      }
      return addNetrwBookmark(state, targetPath);
    }
    if (key === 'B') {
      let targetPath = netrw.currentPath;
      if (curLineIdx >= BANNER_LINES_COUNT) {
        if (lineText !== '../' && lineText !== './' && lineText.endsWith('/')) {
          const dir = lineText.slice(0, -1);
          targetPath = netrw.currentPath ? `${netrw.currentPath}/${dir}` : dir;
        }
      }
      return removeNetrwBookmark(state, targetPath);
    }
    return {
      ...state,
      netrw: { ...netrw, pendingKey: undefined },
    };
  }

  if (netrw.pendingKey === 'g') {
    if (key === 'b') {
      return goToNetrwBookmark(state);
    }
    if (key === 'g') {
      return {
        ...state,
        cursor: { line: BANNER_LINES_COUNT, col: 0 },
        netrw: { ...netrw, pendingKey: undefined },
      };
    }
    return {
      ...state,
      netrw: { ...netrw, pendingKey: undefined },
    };
  }

  // 접두어 키 감지
  if (key === 'm') {
    return {
      ...state,
      netrw: { ...netrw, pendingKey: 'm' },
    };
  }
  if (key === 'g') {
    return {
      ...state,
      netrw: { ...netrw, pendingKey: 'g' },
    };
  }

  // 배너 영역 내 일반 키 입력은 기본 Vim 모션(j, k 등)에 위임
  if (curLineIdx < BANNER_LINES_COUNT) {
    return null;
  }

  // 3. '-' : 상위 디렉터리로 이동 (cd ..)
  if (key === '-') {
    const parts = netrw.currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    const newLines = generateNetrwLines(netrw.files, parentPath);
    return {
      ...state,
      lines: newLines,
      cursor: { line: BANNER_LINES_COUNT, col: 0 },
      netrw: {
        ...netrw,
        currentPath: parentPath,
      },
      commandMessage: `[Netrw] /workspace/${parentPath}`,
    };
  }

  // 3. 'Enter' (<CR>): 디렉터리 진입 또는 파일 열기
  if (key === 'Enter') {
    if (lineText === '../') {
      const parts = netrw.currentPath.split('/').filter(Boolean);
      parts.pop();
      const parentPath = parts.join('/');
      const newLines = generateNetrwLines(netrw.files, parentPath);
      return {
        ...state,
        lines: newLines,
        cursor: { line: BANNER_LINES_COUNT, col: 0 },
        netrw: {
          ...netrw,
          currentPath: parentPath,
        },
        commandMessage: `[Netrw] /workspace/${parentPath}`,
      };
    }

    if (lineText === './') {
      // 새로고침
      const newLines = generateNetrwLines(netrw.files, netrw.currentPath);
      return {
        ...state,
        lines: newLines,
        commandMessage: msg('[Netrw] 새로고침 완료'),
      };
    }

    // 디렉터리 진입
    if (lineText.endsWith('/')) {
      const dirName = lineText.slice(0, -1);
      const newPath = netrw.currentPath ? `${netrw.currentPath}/${dirName}` : dirName;
      const newLines = generateNetrwLines(netrw.files, newPath);
      return {
        ...state,
        lines: newLines,
        cursor: { line: BANNER_LINES_COUNT, col: 0 },
        netrw: {
          ...netrw,
          currentPath: newPath,
        },
        commandMessage: `[Netrw] /workspace/${newPath}`,
      };
    }

    // 파일 열기 (현재 창)
    const filePath = netrw.currentPath ? `${netrw.currentPath}/${lineText}` : lineText;
    const fileLines = netrw.files[filePath] ?? [''];
    const cleanBuffers = state.buffers?.filter((b) => !b.name.startsWith('Netrw')) ?? [];
    const returnBuf = cleanBuffers.find((b) => b.id === netrw.returnBufferId) ?? cleanBuffers[0];

    let opened = editBuffer(
      {
        ...state,
        buffers: cleanBuffers,
        currentBufferId: returnBuf?.id ?? 1,
        primaryFilename: returnBuf?.name ?? netrw.returnFilename ?? 'source.ts',
        lines: returnBuf ? [...returnBuf.lines] : [''],
        cursor: returnBuf ? { ...returnBuf.cursor } : { line: 0, col: 0 },
        netrw: null,
        virtualFiles: netrw.files,
      },
      filePath
    );

    // VFS 파일 내용 복원
    opened = {
      ...opened,
      lines: [...fileLines],
      cursor: { line: 0, col: 0 },
      virtualFiles: netrw.files,
      commandMessage: msg('"{filePath}" 열림', { filePath }),
    };
    return syncCurrentBuffer(opened);
  }

  // 4. 'v': 세로 분할(vsplit) 창에서 파일 열기
  if (key === 'v' && !lineText.endsWith('/')) {
    const filePath = netrw.currentPath ? `${netrw.currentPath}/${lineText}` : lineText;
    const fileLines = netrw.files[filePath] ?? [''];
    const cleanBuffers = state.buffers?.filter((b) => !b.name.startsWith('Netrw')) ?? [];
    const splitted = splitWindow({ ...state, buffers: cleanBuffers }, 'vertical', fileLines, filePath);
    return {
      ...splitted,
      netrw: null,
      virtualFiles: netrw.files,
      commandMessage: msg('"{filePath}" 세로 분할 창에서 열림', { filePath }),
    };
  }

  // 5. 'o': 가로 분할(split) 창에서 파일 열기
  if (key === 'o' && !lineText.endsWith('/')) {
    const filePath = netrw.currentPath ? `${netrw.currentPath}/${lineText}` : lineText;
    const fileLines = netrw.files[filePath] ?? [''];
    const cleanBuffers = state.buffers?.filter((b) => !b.name.startsWith('Netrw')) ?? [];
    const splitted = splitWindow({ ...state, buffers: cleanBuffers }, 'horizontal', fileLines, filePath);
    return {
      ...splitted,
      netrw: null,
      virtualFiles: netrw.files,
      commandMessage: msg('"{filePath}" 가로 분할 창에서 열림', { filePath }),
    };
  }

  // 6. 't': 새 탭 페이지(tabnew)에서 파일 열기
  if (key === 't' && !lineText.endsWith('/')) {
    const filePath = netrw.currentPath ? `${netrw.currentPath}/${lineText}` : lineText;
    const fileLines = netrw.files[filePath] ?? [''];
    const cleanBuffers = state.buffers?.filter((b) => !b.name.startsWith('Netrw')) ?? [];
    const tabbed = openNewTab({ ...state, buffers: cleanBuffers }, filePath);
    return {
      ...tabbed,
      lines: [...fileLines],
      cursor: { line: 0, col: 0 },
      netrw: null,
      virtualFiles: netrw.files,
      commandMessage: msg('"{filePath}" 새 탭에서 열림', { filePath }),
    };
  }

  // 7. 'd': 새 디렉터리 생성 (mock)
  if (key === 'd') {
    const newDirName = 'new_dir';
    const newDirPath = netrw.currentPath ? `${netrw.currentPath}/${newDirName}/dummy.txt` : `${newDirName}/dummy.txt`;
    const updatedFiles = { ...netrw.files, [newDirPath]: [''] };
    const newLines = generateNetrwLines(updatedFiles, netrw.currentPath);
    return {
      ...state,
      lines: newLines,
      netrw: {
        ...netrw,
        files: updatedFiles,
      },
      virtualFiles: updatedFiles,
      commandMessage: msg('디렉터리 생성됨: {newDirName}/', { newDirName }),
    };
  }

  // 8. '%': 새 파일 생성 (mock)
  if (key === '%') {
    const newFileName = 'new_file.txt';
    const newFilePath = netrw.currentPath ? `${netrw.currentPath}/${newFileName}` : newFileName;
    const updatedFiles = { ...netrw.files, [newFilePath]: [''] };
    const newLines = generateNetrwLines(updatedFiles, netrw.currentPath);
    return {
      ...state,
      lines: newLines,
      netrw: {
        ...netrw,
        files: updatedFiles,
      },
      virtualFiles: updatedFiles,
      commandMessage: msg('파일 생성됨: {newFileName}', { newFileName }),
    };
  }

  // 9. 'D': 파일 삭제
  if (key === 'D' && !lineText.endsWith('/')) {
    const filePath = netrw.currentPath ? `${netrw.currentPath}/${lineText}` : lineText;
    const updatedFiles = { ...netrw.files };
    delete updatedFiles[filePath];
    const newLines = generateNetrwLines(updatedFiles, netrw.currentPath);
    return {
      ...state,
      lines: newLines,
      netrw: {
        ...netrw,
        files: updatedFiles,
      },
      virtualFiles: updatedFiles,
      commandMessage: msg('파일 삭제됨: {lineText}', { lineText }),
    };
  }

  // 기타 키(j, k, gg, G 등)는 일반 Vim 모션 핸들러가 처리하도록 위임
  return null;
}
