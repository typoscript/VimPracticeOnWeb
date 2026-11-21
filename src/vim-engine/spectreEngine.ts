import {
  SpectreMatchItem,
  SpectreSessionState,
  VimEditorState,
} from './types';
import { compileVimRegex } from './vimRegex';
import { buildVfsMap } from './vfs';
import { pushUndoSnapshot } from './operators';
import { clampCursor } from './cursor';
import { editBuffer, ensureBuffers } from './bufferEngine';
import { getWordAtCursor } from './search';
import { msg } from './messages';

function collectFileLinesMap(state: VimEditorState): Record<string, string[]> {
  const curFile = state.primaryFilename || 'sandbox.ts';
  const hasExplicitVirtual =
    state.virtualFiles && Object.keys(state.virtualFiles).length > 0;
  const baseFiles = hasExplicitVirtual ? state.virtualFiles! : buildVfsMap(state);
  const fileMap: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(baseFiles)) {
    fileMap[k] = [...v];
  }
  fileMap[curFile] = [...state.lines];
  for (const buf of state.buffers ?? []) {
    if (buf.name && buf.name !== curFile) {
      fileMap[buf.name] = [...buf.lines];
    }
  }
  return fileMap;
}

/**
 * 프로젝트 전체 VFS 및 열린 버퍼에서 Spectre 정규식 검색 매치와 치환 미리보기를 계산합니다.
 */
export function collectSpectreMatches(
  state: VimEditorState,
  searchQuery: string,
  replaceQuery: string,
  ignoreCase = false,
  disabledIds?: ReadonlySet<string>
): SpectreMatchItem[] {
  const query = searchQuery;
  if (!query) return [];

  let regexSingle: RegExp;
  let regexGlobal: RegExp;
  try {
    regexSingle = compileVimRegex(query, { ignorecase: ignoreCase });
    regexGlobal = compileVimRegex(query, { ignorecase: ignoreCase, flags: 'g' });
  } catch {
    return [];
  }

  const fileMap = collectFileLinesMap(state);
  const sortedFiles = Object.keys(fileMap).sort((a, b) => a.localeCompare(b));
  const items: SpectreMatchItem[] = [];

  for (const filename of sortedFiles) {
    const lines = fileMap[filename] ?? [];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineText = lines[lineIdx] ?? '';
      const m = regexSingle.exec(lineText);
      if (!m) continue;
      // 빈 문자열 매치 무한루프 방지
      if (m[0].length === 0 && query.length === 0) continue;
      const col = m.index ?? 0;
      regexGlobal.lastIndex = 0;
      const previewText = lineText.replace(regexGlobal, replaceQuery);
      const id = `${filename}:${lineIdx}`;
      items.push({
        id,
        filename,
        line: lineIdx,
        col,
        lineText,
        previewText,
        enabled: disabledIds ? !disabledIds.has(id) : true,
      });
    }
  }

  return items;
}

/**
 * `:Spectre [searchQuery] [replaceQuery]` — 프로젝트 대화형 검색·치환 분할 패널을 엽니다.
 */
export function openSpectrePanel(
  state: VimEditorState,
  initialQuery?: string,
  initialReplace = ''
): VimEditorState {
  const curLineText = state.lines[state.cursor.line] ?? '';
  const fallbackWord =
    getWordAtCursor(curLineText, state.cursor.col) || state.lastSearchQuery || '';
  const searchQuery = initialQuery !== undefined ? initialQuery : fallbackWord;
  const replaceQuery = initialReplace;
  const ignoreCase = Boolean(state.options?.ignorecase);
  const items = collectSpectreMatches(state, searchQuery, replaceQuery, ignoreCase);

  const session: SpectreSessionState = {
    isOpen: true,
    searchQuery,
    replaceQuery,
    ignoreCase,
    items,
  };

  return {
    ...state,
    spectrePanel: session,
    commandMessage: searchQuery
      ? msg('[Spectre] "{query}" 매치 {count}건 발견', {
          query: searchQuery,
          count: items.length,
        })
      : msg('[Spectre] 프로젝트 검색·치환 패널 열림'),
  };
}

/**
 * `:SpectreClose` — Spectre 패널을 닫습니다.
 */
export function closeSpectrePanel(state: VimEditorState): VimEditorState {
  return {
    ...state,
    spectrePanel: null,
    commandMessage: msg('[Spectre] 패널을 닫았습니다'),
  };
}

/**
 * `:SpectreToggle` — Spectre 패널을 토글합니다.
 */
export function toggleSpectrePanel(
  state: VimEditorState,
  initialQuery?: string
): VimEditorState {
  if (state.spectrePanel?.isOpen) {
    return closeSpectrePanel(state);
  }
  return openSpectrePanel(state, initialQuery);
}

/**
 * Spectre 검색어·치환어·대소문자 옵션을 실시간 갱신합니다. (비활성 체크 해제 상태 유지)
 */
export function updateSpectreQuery(
  state: VimEditorState,
  searchQuery: string,
  replaceQuery: string,
  ignoreCase?: boolean
): VimEditorState {
  const prev = state.spectrePanel;
  const nextIgnoreCase = ignoreCase ?? prev?.ignoreCase ?? Boolean(state.options?.ignorecase);
  const disabledIds = new Set<string>(
    (prev?.items ?? []).filter((item) => !item.enabled).map((item) => item.id)
  );
  const items = collectSpectreMatches(
    state,
    searchQuery,
    replaceQuery,
    nextIgnoreCase,
    disabledIds
  );

  return {
    ...state,
    spectrePanel: {
      isOpen: true,
      searchQuery,
      replaceQuery,
      ignoreCase: nextIgnoreCase,
      items,
    },
  };
}

/**
 * 특정 매치 항목의 치환 포함 여부(enabled)를 토글합니다.
 */
export function toggleSpectreItem(
  state: VimEditorState,
  itemId: string
): VimEditorState {
  const prev = state.spectrePanel;
  if (!prev?.isOpen) return state;
  return {
    ...state,
    spectrePanel: {
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, enabled: !item.enabled } : item
      ),
    },
  };
}

/**
 * 전체 매치 항목의 선택 상태를 일괄 변경합니다.
 */
export function toggleAllSpectreItems(
  state: VimEditorState,
  enabled: boolean
): VimEditorState {
  const prev = state.spectrePanel;
  if (!prev?.isOpen) return state;
  return {
    ...state,
    spectrePanel: {
      ...prev,
      items: prev.items.map((item) => ({ ...item, enabled })),
    },
  };
}

/**
 * Spectre 매치 항목을 클릭했을 때 해당 파일과 줄로 점프합니다.
 */
export function jumpToSpectreItem(
  state: VimEditorState,
  index: number
): VimEditorState {
  const panel = state.spectrePanel;
  if (!panel || panel.items.length === 0) return state;
  const clampedIdx = Math.max(0, Math.min(index, panel.items.length - 1));
  const item = panel.items[clampedIdx];
  const curFile = state.primaryFilename || 'sandbox.ts';

  let next = state;
  if (item.filename && item.filename !== curFile) {
    const withBufs = ensureBuffers(state);
    next = editBuffer(withBufs, item.filename);
  }

  const targetCursor = clampCursor(
    next.lines,
    { line: item.line, col: item.col },
    'NORMAL'
  );

  return {
    ...next,
    mode: 'NORMAL',
    cursor: targetCursor,
    spectrePanel: panel,
  };
}

/**
 * 활성화된(`enabled === true`) 모든 Spectre 매치 항목에 대해 프로젝트 일괄 치환을 수행합니다 (:SpectreApply).
 */
export function applySpectreReplaceAll(state: VimEditorState): VimEditorState {
  const panel = state.spectrePanel;
  if (!panel?.isOpen || !panel.searchQuery) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Spectre] 치환할 활성 항목이 없습니다'),
    };
  }

  const enabledItems = panel.items.filter((item) => item.enabled);
  if (enabledItems.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Spectre] 치환할 활성 항목이 없습니다'),
    };
  }

  let regexGlobal: RegExp;
  try {
    regexGlobal = compileVimRegex(panel.searchQuery, {
      ignorecase: panel.ignoreCase,
      flags: 'g',
    });
  } catch {
    return {
      ...state,
      bell: true,
      commandMessage: msg('[Spectre] 잘못된 정규식 패턴입니다'),
    };
  }

  const curFile = state.primaryFilename || 'sandbox.ts';
  const fileMap = collectFileLinesMap(state);

  // 파일별 변경 대상 줄 번호 집합
  const linesByFile = new Map<string, Set<number>>();
  for (const item of enabledItems) {
    const set = linesByFile.get(item.filename) ?? new Set<number>();
    set.add(item.line);
    linesByFile.set(item.filename, set);
  }

  let baseState = linesByFile.has(curFile) ? pushUndoSnapshot(state) : state;
  let nextVirtualFiles: Record<string, string[]> = { ...(baseState.virtualFiles ?? {}) };
  let nextNetrwFiles: Record<string, string[]> | undefined = baseState.netrw?.files
    ? { ...baseState.netrw.files }
    : undefined;

  const updatedFileLines = new Map<string, string[]>();
  for (const [filename, lineSet] of linesByFile.entries()) {
    const srcLines = fileMap[filename] ?? [];
    const nextLines = srcLines.map((lineText, idx) => {
      if (!lineSet.has(idx)) return lineText;
      regexGlobal.lastIndex = 0;
      return lineText.replace(regexGlobal, panel.replaceQuery);
    });
    updatedFileLines.set(filename, nextLines);
    nextVirtualFiles[filename] = nextLines;
    if (nextNetrwFiles) {
      nextNetrwFiles[filename] = nextLines;
    }
  }

  const nextCurrentLines = updatedFileLines.get(curFile) ?? baseState.lines;
  const nextBuffers = baseState.buffers
    ? baseState.buffers.map((b) => {
        const replaced = updatedFileLines.get(b.name);
        if (!replaced) return b;
        return {
          ...b,
          lines: [...replaced],
          cursor: clampCursor(replaced, b.cursor, 'NORMAL'),
          isModified: true,
        };
      })
    : undefined;

  const nextSplitPanes = baseState.splitPanes
    ? baseState.splitPanes.map((p) => {
        const replaced = p.filename ? updatedFileLines.get(p.filename) : undefined;
        if (!replaced) return p;
        return {
          ...p,
          lines: [...replaced],
          cursor: clampCursor(replaced, p.cursor, p.mode),
        };
      })
    : undefined;

  const updatedState: VimEditorState = {
    ...baseState,
    lines: nextCurrentLines,
    cursor: clampCursor(nextCurrentLines, baseState.cursor, 'NORMAL'),
    buffers: nextBuffers,
    splitPanes: nextSplitPanes,
    virtualFiles: nextVirtualFiles,
    netrw: baseState.netrw && nextNetrwFiles
      ? { ...baseState.netrw, files: nextNetrwFiles }
      : baseState.netrw,
  };

  const remaining = collectSpectreMatches(
    updatedState,
    panel.searchQuery,
    panel.replaceQuery,
    panel.ignoreCase
  );

  return {
    ...updatedState,
    spectrePanel: {
      ...panel,
      items: remaining,
    },
    commandMessage: msg('[Spectre] {files}개 파일에서 {count}개 줄 치환 완료', {
      files: linesByFile.size,
      count: enabledItems.length,
    }),
  };
}

/**
 * `:Spectre*` Ex 명령 디스패처
 */
export function executeSpectreCommand(
  state: VimEditorState,
  cmdName: string,
  rawArg: string
): VimEditorState {
  const lower = cmdName.toLowerCase();
  const arg = rawArg.trim();

  if (lower === 'spectreclose') return closeSpectrePanel(state);
  if (lower === 'spectretoggle') return toggleSpectrePanel(state, arg || undefined);
  if (lower === 'spectreapply') return applySpectreReplaceAll(state);

  if (!arg) {
    return openSpectrePanel(state);
  }
  const parts = arg.split(/\s+/);
  const sub = parts[0].toLowerCase();
  if (sub === 'close') return closeSpectrePanel(state);
  if (sub === 'toggle') return toggleSpectrePanel(state, parts.slice(1).join(' ') || undefined);
  if (sub === 'apply') return applySpectreReplaceAll(state);

  const searchQuery = parts[0] ?? '';
  const replaceQuery = parts.slice(1).join(' ');
  return openSpectrePanel(state, searchQuery, replaceQuery);
}
