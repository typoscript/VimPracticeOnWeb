import { editBuffer, syncPerFileState } from '../vim-engine';
import type { VimEditorState } from '../vim-engine';
import { STORAGE_KEYS, readStorageJson, removeStorageItem, writeStorageRaw } from './localStorageClient';

/** 자유 연습장 자동 저장본 (브라우저 저장소 `vim_sandbox_autosave_v1`) */
export interface SandboxAutosave {
  version: 1;
  savedAt: number;
  /** 포커스를 가진 파일 */
  primaryFilename: string;
  cursor: { line: number; col: number };
  /** 파일 내용. 저장하지 않은(:w 전) 버퍼 편집도 여기에 넣습니다. */
  files: Record<string, string[]>;
  /** 열려 있던 버퍼 이름 (열린 순서) */
  openBuffers: string[];
  /** 불러온 로컬 파일 칩 목록 */
  localFiles: string[];
}

/** 저장본 상한 (문자 수). 큰 로컬 파일을 불러와 이를 넘으면 자동 저장을 건너뜁니다. */
export const SANDBOX_AUTOSAVE_MAX_CHARS = 2_000_000;

/** 현재 자유 연습장 상태에서 저장본을 만듭니다. */
export function buildSandboxAutosave(state: VimEditorState, localFiles: readonly string[]): SandboxAutosave {
  const primary = state.primaryFilename ?? 'sandbox.ts';
  const files: Record<string, string[]> = { ...(state.virtualFiles ?? {}) };
  for (const buffer of state.buffers ?? []) {
    if (buffer.name && buffer.name !== primary) files[buffer.name] = buffer.lines;
  }
  files[primary] = state.lines;
  return {
    version: 1,
    savedAt: Date.now(),
    primaryFilename: primary,
    cursor: { line: state.cursor.line, col: state.cursor.col },
    files,
    openBuffers: (state.buffers ?? []).map((b) => b.name).filter(Boolean),
    localFiles: [...localFiles],
  };
}

/**
 * 저장본을 브라우저 저장소에 씁니다. 상한을 넘거나 저장에 실패하면 false.
 */
export function saveSandboxAutosave(state: VimEditorState, localFiles: readonly string[]): boolean {
  const json = JSON.stringify(buildSandboxAutosave(state, localFiles));
  if (json.length > SANDBOX_AUTOSAVE_MAX_CHARS) return false;
  return writeStorageRaw(STORAGE_KEYS.SANDBOX_AUTOSAVE, json);
}

export function loadSandboxAutosave(): SandboxAutosave | null {
  const saved = readStorageJson<SandboxAutosave | null>(STORAGE_KEYS.SANDBOX_AUTOSAVE, null);
  if (!saved || saved.version !== 1 || !saved.files || !saved.primaryFilename) return null;
  return saved;
}

export function clearSandboxAutosave(): void {
  removeStorageItem(STORAGE_KEYS.SANDBOX_AUTOSAVE);
}

/**
 * 새로 만든 자유 연습장 상태(`base`)에 저장본을 덮어 이어서 편집할 수 있게 합니다.
 * 파일 내용은 가상 파일 시스템으로 되살리고, 열려 있던 버퍼를 다시 연 뒤 포커스 파일과 커서를 맞춥니다.
 */
export function restoreSandboxAutosave(base: VimEditorState, saved: SandboxAutosave): VimEditorState {
  const baseName = base.primaryFilename ?? 'sandbox.ts';
  let state: VimEditorState = {
    ...base,
    virtualFiles: { ...(base.virtualFiles ?? {}), ...saved.files },
    lines: saved.files[baseName] ?? base.lines,
  };
  const reopen = [...saved.openBuffers.filter((name) => name !== baseName), saved.primaryFilename];
  for (const name of reopen) {
    if (name === (state.primaryFilename ?? baseName)) continue;
    if (!saved.files[name]) continue;
    state = syncPerFileState(state, editBuffer(state, name));
  }
  if (saved.primaryFilename !== state.primaryFilename && saved.files[saved.primaryFilename]) {
    state = syncPerFileState(state, editBuffer(state, saved.primaryFilename));
  }
  const line = Math.min(Math.max(0, saved.cursor.line), state.lines.length - 1);
  const col = Math.min(Math.max(0, saved.cursor.col), Math.max(0, (state.lines[line] ?? '').length - 1));
  return { ...state, cursor: { line, col }, mode: 'NORMAL', commandMessage: undefined };
}
