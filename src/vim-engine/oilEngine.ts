import { OilEntrySnapshot, OilSessionState, VimEditorState } from './types';
import { clampCursor } from './cursor';
import { buildVfsMap } from './vfs';
import { editBuffer, ensureBuffers } from './bufferEngine';
import { msg } from './messages';

function normalizeVfsPath(raw: string): string {
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

function normalizeDirPath(raw: string): string {
  const cleaned = normalizeVfsPath(raw).replace(/^\/+/, '').replace(/\/+$/, '');
  return cleaned === '.' ? '' : cleaned;
}

function parentDirOf(dir: string): string {
  const norm = normalizeDirPath(dir);
  if (!norm) return '';
  const idx = norm.lastIndexOf('/');
  return idx === -1 ? '' : norm.slice(0, idx);
}

/**
 * 지정 디렉터리의 직계 하위 폴더·파일 항목 목록을 수집해 Oil 버퍼 줄 배열과 스냅샷을 만듭니다.
 */
export function buildOilDirectoryEntries(
  vfs: Record<string, string[]>,
  dir: string
): { lines: string[]; entries: OilEntrySnapshot[] } {
  const normDir = normalizeDirPath(dir);
  const prefix = normDir ? `${normDir}/` : '';
  const childDirs = new Set<string>();
  const childFiles = new Set<string>();

  for (const rawPath of Object.keys(vfs)) {
    const p = normalizeVfsPath(rawPath).replace(/^\/+/, '');
    if (!p.startsWith(prefix)) continue;
    const rel = p.slice(prefix.length);
    if (!rel) continue;
    const slashIdx = rel.indexOf('/');
    if (slashIdx !== -1) {
      childDirs.add(rel.slice(0, slashIdx));
    } else if (rel !== '.gitkeep') {
      childFiles.add(rel);
    }
  }

  const sortedDirs = Array.from(childDirs).sort((a, b) => a.localeCompare(b));
  const sortedFiles = Array.from(childFiles).sort((a, b) => a.localeCompare(b));

  const entries: OilEntrySnapshot[] = [];
  const lines: string[] = [];
  let seq = 1;

  for (const d of sortedDirs) {
    const id = `/${String(seq++).padStart(3, '0')}`;
    const displayName = `${d}/`;
    const fullPath = prefix + d;
    entries.push({ id, originalPath: fullPath, originalName: displayName, isDir: true });
    lines.push(`${id} ${displayName}`);
  }
  for (const f of sortedFiles) {
    const id = `/${String(seq++).padStart(3, '0')}`;
    const fullPath = prefix + f;
    entries.push({ id, originalPath: fullPath, originalName: f, isDir: false });
    lines.push(`${id} ${f}`);
  }

  if (lines.length === 0) {
    lines.push('');
  }

  return { lines, entries };
}

/**
 * `:Oil [dir]` — oil.nvim 스타일 편집 가능한 디렉터리 버퍼를 엽니다.
 */
export function openOilBuffer(state: VimEditorState, targetDir?: string): VimEditorState {
  const withBuf = ensureBuffers(state);
  const prevOil = state.oilSession?.isOpen ? state.oilSession : null;
  let dir: string;
  if (targetDir !== undefined && targetDir.trim() !== '') {
    dir = normalizeDirPath(targetDir);
  } else if (prevOil) {
    dir = prevOil.currentDir;
  } else {
    const curFile = state.primaryFilename ?? '';
    const normFile = normalizeVfsPath(curFile);
    dir = normFile.includes('/') ? parentDirOf(normFile) : '';
  }

  const vfs = buildVfsMap(withBuf);
  const { lines, entries } = buildOilDirectoryEntries(vfs, dir);

  const oilSession: OilSessionState = {
    isOpen: true,
    currentDir: dir,
    returnBufferId: prevOil?.returnBufferId ?? withBuf.currentBufferId,
    returnFilename: prevOil?.returnFilename ?? state.primaryFilename,
    returnLines: prevOil?.returnLines ?? [...state.lines],
    returnCursor: prevOil?.returnCursor ?? { ...state.cursor },
    entries,
  };

  return {
    ...withBuf,
    lines,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: `oil://${dir || '/'}`,
    oilSession,
    undoStack: [],
    redoStack: [],
    pendingKeys: undefined,
    commandMessage: msg('[Oil] "{dir}" 열림 (dd 삭제 · cw 이름변경 · o 생성 · :w 반영 · Enter 열기 · - 상위)', {
      dir: dir || '/',
    }),
  };
}

/**
 * Oil 버퍼를 닫고 이전 버퍼로 복귀합니다.
 */
export function closeOilBuffer(state: VimEditorState): VimEditorState {
  const oil = state.oilSession;
  if (!oil?.isOpen) return state;

  const lines = oil.returnLines && oil.returnLines.length > 0 ? [...oil.returnLines] : [''];
  const cursor = oil.returnCursor ? clampCursor(lines, oil.returnCursor, 'NORMAL') : { line: 0, col: 0 };

  return {
    ...state,
    lines,
    cursor,
    mode: 'NORMAL',
    primaryFilename: oil.returnFilename ?? state.primaryFilename,
    currentBufferId: oil.returnBufferId ?? state.currentBufferId,
    oilSession: null,
    pendingKeys: undefined,
    commandMessage: msg('[Oil] 탐색기 버퍼를 닫았습니다'),
  };
}

function parseOilLine(rawLine: string): { id?: string; name: string; isDir: boolean } | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const idMatch = trimmed.match(/^(\/\d{3})\s+(.+)$/);
  const id = idMatch ? idMatch[1] : undefined;
  const rawName = (idMatch ? idMatch[2] : trimmed).trim();
  if (!rawName) return null;
  const isDir = rawName.endsWith('/');
  return { id, name: rawName, isDir };
}

/**
 * Oil 버퍼에서 편집한 변경 사항(생성·삭제·이름 변경)을 `:w` 시 실제 가상 파일 시스템(VFS)에 반영합니다.
 */
export function applyOilBufferChanges(state: VimEditorState): VimEditorState {
  const oil = state.oilSession;
  if (!oil?.isOpen) return state;

  const prefix = oil.currentDir ? `${oil.currentDir}/` : '';
  const currentVfs: Record<string, string[]> = { ...buildVfsMap(state) };
  const parsedItems = state.lines
    .map(parseOilLine)
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const entryById = new Map(oil.entries.map((e) => [e.id, e]));
  const seenIds = new Set<string>();

  let created = 0;
  let renamed = 0;
  let deleted = 0;

  let nextBuffers = state.buffers ? [...state.buffers] : undefined;

  // 1. 이름 변경 & 신규 생성 처리
  for (const item of parsedItems) {
    if (item.id && entryById.has(item.id)) {
      seenIds.add(item.id);
      const orig = entryById.get(item.id)!;
      if (item.name !== orig.originalName) {
        const cleanNew = item.name.replace(/\/+$/, '');
        const newFullPath = prefix + cleanNew;
        if (orig.isDir) {
          const oldPrefix = `${orig.originalPath}/`;
          const newPrefix = `${newFullPath}/`;
          for (const key of Object.keys(currentVfs)) {
            if (key.startsWith(oldPrefix)) {
              const movedKey = newPrefix + key.slice(oldPrefix.length);
              currentVfs[movedKey] = currentVfs[key];
              delete currentVfs[key];
            }
          }
        } else {
          const content = currentVfs[orig.originalPath] ?? [''];
          delete currentVfs[orig.originalPath];
          currentVfs[newFullPath] = content;
          if (nextBuffers) {
            nextBuffers = nextBuffers.map((b) =>
              b.name === orig.originalPath ? { ...b, name: newFullPath } : b
            );
          }
        }
        renamed++;
      }
    } else {
      // 새 파일 또는 폴더 생성
      const cleanName = item.name.replace(/^\/+/, '').replace(/\/+$/, '');
      if (!cleanName) continue;
      const newFullPath = prefix + cleanName;
      if (item.isDir) {
        const marker = `${newFullPath}/.gitkeep`;
        if (!(marker in currentVfs)) {
          currentVfs[marker] = [''];
          created++;
        }
      } else if (!(newFullPath in currentVfs)) {
        currentVfs[newFullPath] = [''];
        created++;
      }
    }
  }

  // 2. 삭제된 항목 처리
  for (const orig of oil.entries) {
    if (seenIds.has(orig.id)) continue;
    if (orig.isDir) {
      const oldPrefix = `${orig.originalPath}/`;
      for (const key of Object.keys(currentVfs)) {
        if (key === orig.originalPath || key.startsWith(oldPrefix)) {
          delete currentVfs[key];
        }
      }
    } else {
      delete currentVfs[orig.originalPath];
    }
    deleted++;
  }

  const rebuilt = buildOilDirectoryEntries(currentVfs, oil.currentDir);
  const nextCursor = clampCursor(rebuilt.lines, state.cursor, 'NORMAL');

  return {
    ...state,
    lines: rebuilt.lines,
    cursor: nextCursor,
    virtualFiles: currentVfs,
    ...(state.netrw ? { netrw: { ...state.netrw, files: { ...currentVfs } } } : {}),
    buffers: nextBuffers,
    oilSession: {
      ...oil,
      entries: rebuilt.entries,
    },
    commandMessage:
      created === 0 && renamed === 0 && deleted === 0
        ? msg('[Oil] 변경 사항이 없습니다')
        : msg('[Oil] 반영 완료 (생성 {created} · 이름변경 {renamed} · 삭제 {deleted})', {
            created,
            renamed,
            deleted,
          }),
  };
}

/**
 * Oil 버퍼 NORMAL 모드 특수 탐색 키(Enter: 열기, -: 상위 폴더, q: 닫기)를 처리합니다.
 * 그 외 모든 키는 null 을 반환해 일반 Vim 편집 엔진(dd, o, cw, u 등)이 그대로 처리하도록 합니다.
 */
export function handleOilNavigationKey(
  state: VimEditorState,
  key: string
): VimEditorState | null {
  const oil = state.oilSession;
  if (!oil?.isOpen || state.mode !== 'NORMAL' || state.pendingKeys) return null;

  if (key === '-') {
    const parent = parentDirOf(oil.currentDir);
    return openOilBuffer(state, parent);
  }

  if (key === 'Enter') {
    const curLine = state.lines[state.cursor.line] ?? '';
    const parsed = parseOilLine(curLine);
    if (!parsed) return state;
    const prefix = oil.currentDir ? `${oil.currentDir}/` : '';
    const cleanName = parsed.name.replace(/\/+$/, '');
    const fullPath = prefix + cleanName;
    if (parsed.isDir) {
      return openOilBuffer(state, fullPath);
    }
    const cleared: VimEditorState = { ...state, oilSession: null };
    return editBuffer(cleared, fullPath);
  }

  return null;
}
