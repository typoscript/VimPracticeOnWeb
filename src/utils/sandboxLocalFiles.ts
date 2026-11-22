import { VimBuffer, VimEditorState, syncCurrentBuffer } from '../vim-engine';

/** 로컬 파일 불러오기 1개당 최대 크기 (512 KB) */
export const MAX_LOCAL_FILE_BYTES = 512 * 1024;

/** 파일 선택 다이얼로그 기본 허용 확장자 */
export const LOCAL_FILE_ACCEPT =
  '.ts,.tsx,.js,.jsx,.mjs,.cjs,.py,.rs,.go,.java,.c,.cc,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.kt,.sh,.bash,.zsh,.vim,.lua,.html,.htm,.css,.scss,.less,.json,.yaml,.yml,.toml,.xml,.sql,.md,.mdx,.txt,.env,.gitignore';

export interface LoadedLocalFile {
  name: string;
  lines: string[];
  size: number;
}

export interface SkippedLocalFile {
  name: string;
  reason: 'too-large' | 'binary' | 'read-error';
}

export interface ReadLocalFilesResult {
  loaded: LoadedLocalFile[];
  skipped: SkippedLocalFile[];
}

/**
 * 로컬 파일 경로를 VFS 에 맞는 상대 경로로 정규화합니다.
 */
export function normalizeLocalFilePath(rawName: string, relativePath?: string): string {
  const candidate = (relativePath && relativePath.trim()) || rawName.trim() || 'untitled.txt';
  const normalized = candidate
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
  return normalized || 'untitled.txt';
}

/**
 * 텍스트를 줄 배열로 변환합니다 (CRLF/CR 정규화, 최소 1줄 보장).
 */
export function splitTextToLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  // 파일 끝의 단일 개행은 Vim 버퍼 줄 모델에 맞춰 제거 (단, 빈 파일은 [''] 유지)
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.length > 0 ? lines : [''];
}

/**
 * 바이너리 파일 여부(NUL 바이트 포함)를 간단히 판별합니다.
 */
export function isBinaryText(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}

function readSingleFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('File read error'));
    reader.readAsText(file);
  });
}

/**
 * 브라우저 FileList/File[] 을 읽어 텍스트 파일은 파싱하고 바이너리·대용량 파일은 분류합니다.
 */
export async function readLocalFiles(
  files: FileList | File[]
): Promise<ReadLocalFilesResult> {
  const list = Array.from(files);
  const loaded: LoadedLocalFile[] = [];
  const skipped: SkippedLocalFile[] = [];

  for (const file of list) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const name = normalizeLocalFilePath(file.name, relPath);

    if (file.size > MAX_LOCAL_FILE_BYTES) {
      skipped.push({ name, reason: 'too-large' });
      continue;
    }

    try {
      const text = await readSingleFileAsText(file);
      if (isBinaryText(text)) {
        skipped.push({ name, reason: 'binary' });
        continue;
      }
      loaded.push({
        name,
        lines: splitTextToLines(text),
        size: file.size,
      });
    } catch {
      skipped.push({ name, reason: 'read-error' });
    }
  }

  return { loaded, skipped };
}

/**
 * 불러온 로컬 파일들을 현재 VimEditorState 의 VFS·버퍼·Harpoon·Git 기준선에 불변 마운트하고
 * 첫 번째 불러온 파일을 활성 버퍼로 엽니다.
 */
export function mountLocalFilesIntoState(
  state: VimEditorState,
  loaded: LoadedLocalFile[]
): VimEditorState {
  if (loaded.length === 0) return state;

  const synced = syncCurrentBuffer(state);
  const prevBuffers = synced.buffers ?? [];
  const prevCurId = synced.currentBufferId ?? 1;

  // 기존 VFS 에 현재 버퍼 최신 내용과 새 로컬 파일들을 병합
  const nextVirtualFiles: Record<string, string[]> = {
    ...(synced.virtualFiles ?? {}),
  };
  if (synced.primaryFilename) {
    nextVirtualFiles[synced.primaryFilename] = [...synced.lines];
  }
  for (const file of loaded) {
    nextVirtualFiles[file.name] = [...file.lines];
  }

  // 버퍼 목록에 추가하거나 동일 파일명 버퍼 내용 갱신
  const nextBuffers: VimBuffer[] = prevBuffers.map((b) => ({
    ...b,
    lines: [...b.lines],
    cursor: { ...b.cursor },
    undoStack: [...(b.undoStack ?? [])],
    redoStack: [...(b.redoStack ?? [])],
  }));

  let maxId = nextBuffers.reduce((max, b) => Math.max(max, b.id), 0);
  let firstTargetId = prevCurId;

  loaded.forEach((file, idx) => {
    const existingIdx = nextBuffers.findIndex((b) => b.name === file.name);
    if (existingIdx >= 0) {
      const existing = nextBuffers[existingIdx];
      nextBuffers[existingIdx] = {
        ...existing,
        lines: [...file.lines],
        cursor: { line: 0, col: 0 },
        undoStack: [],
        redoStack: [],
        isModified: false,
        savedLines: [...file.lines],
      };
      if (idx === 0) firstTargetId = existing.id;
    } else {
      maxId += 1;
      const newBuf: VimBuffer = {
        id: maxId,
        name: file.name,
        lines: [...file.lines],
        cursor: { line: 0, col: 0 },
        undoStack: [],
        redoStack: [],
        isModified: false,
        savedLines: [...file.lines],
      };
      nextBuffers.push(newBuf);
      if (idx === 0) firstTargetId = newBuf.id;
    }
  });

  const first = loaded[0];
  const alternateBufferId =
    firstTargetId !== prevCurId ? prevCurId : synced.alternateBufferId;

  // Harpoon 목록에도 불러온 파일(최대 4개 우선)을 중복 없이 반영
  const existingHarpoon = synced.harpoonList ?? [];
  const importedNames = loaded.slice(0, 4).map((f) => f.name);
  const nextHarpoon = [
    ...importedNames,
    ...existingHarpoon.filter((p) => !importedNames.includes(p)),
  ].slice(0, 9);

  // 분할 창이 열려 있다면 활성 창도 새 파일로 동기화
  const nextSplitPanes =
    synced.splitPanes && synced.splitPanes.length > 0
      ? synced.splitPanes.map((pane, idx) =>
          idx === (synced.activePaneIndex ?? 0)
            ? {
                ...pane,
                filename: first.name,
                lines: [...first.lines],
                cursor: { line: 0, col: 0 },
                mode: 'NORMAL' as const,
                visualAnchor: undefined,
              }
            : pane
        )
      : synced.splitPanes;

  return {
    ...synced,
    lines: [...first.lines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    visualAnchor: undefined,
    pendingKeys: '',
    undoStack: [],
    redoStack: [],
    undoTreeNodes: undefined,
    currentUndoSeq: undefined,
    maxUndoSeq: undefined,
    undoTimeHistory: undefined,
    undoTimeIndex: undefined,
    primaryFilename: first.name,
    buffers: nextBuffers,
    currentBufferId: firstTargetId,
    alternateBufferId,
    virtualFiles: nextVirtualFiles,
    gitBaseLines: [...first.lines],
    gitStaged: false,
    gitBlameVisible: false,
    harpoonList: nextHarpoon,
    splitPanes: nextSplitPanes,
    oilSession: null,
    terminalSession: null,
    flashJump: null,
    multiCursor: null,
  };
}

export interface ExportBufferPayload {
  filename: string;
  content: string;
  lineCount: number;
}

/**
 * 현재 활성 버퍼를 로컬 다운로드용 페이로드로 직렬화합니다.
 */
export function buildExportPayload(state: VimEditorState): ExportBufferPayload {
  let rawName = state.primaryFilename || 'sandbox.ts';
  if (state.splitPanes && state.splitPanes.length > 0) {
    const activePane = state.splitPanes[state.activePaneIndex ?? 0];
    if (activePane?.filename) {
      rawName = activePane.filename;
    }
  }
  const baseName = rawName.split('/').pop()?.trim() || 'sandbox.ts';
  const lines = state.lines.length > 0 ? state.lines : [''];
  return {
    filename: baseName,
    content: lines.join('\n') + '\n',
    lineCount: lines.length,
  };
}

/**
 * 현재 활성 버퍼 내용을 브라우저 다운로드로 저장합니다.
 */
export function downloadCurrentBuffer(state: VimEditorState): ExportBufferPayload {
  const payload = buildExportPayload(state);
  if (typeof URL.createObjectURL !== 'function') {
    return payload;
  }
  const blob = new Blob([payload.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = payload.filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
  return payload;
}
