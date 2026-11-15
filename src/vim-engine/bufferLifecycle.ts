import { VimBuffer, VimEditorState } from './types';
import { msg } from './messages';
import { getVfsFile, resolveVfsFilename } from './vfs';
import { ensureBuffers, isCurrentBufferModified, syncCurrentBuffer } from './bufferEngine';
import { closeHelp } from './helpEngine';

/** 현재 버퍼가 저장 완료되었음을 버퍼 목록에 반영합니다. */
export function markCurrentBufferSaved(state: VimEditorState): VimEditorState {
  const s = syncCurrentBuffer(state);
  const curId = s.currentBufferId ?? 1;
  return {
    ...s,
    buffers: s.buffers!.map((b) =>
      b.id === curId ? { ...b, isModified: false, savedLines: [...s.lines] } : b
    ),
  };
}

/** 열려 있는 버퍼 중 저장되지 않은 수정사항이 있는지 확인합니다. */
export function hasModifiedBuffers(state: VimEditorState): boolean {
  const s = syncCurrentBuffer(state);
  return s.buffers!.some((b) => Boolean(b.isModified));
}

/**
 * 현재 창에 빈 [No Name] 버퍼를 생성합니다 (:enew[!]).
 */
export function newEmptyBuffer(state: VimEditorState, force = false): VimEditorState {
  if (!force && isCurrentBufferModified(state)) {
    return {
      ...state,
      commandMessage: msg('E37: 마지막 변경 이후 저장되지 않았습니다 (무시하려면 ! 추가)'),
      bell: true,
    };
  }
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  const maxId = buffers.reduce((max, b) => Math.max(max, b.id), 0);
  const newId = maxId + 1;
  const curId = syncedState.currentBufferId ?? 1;
  const newBuf: VimBuffer = {
    id: newId,
    name: '[No Name]',
    lines: [''],
    cursor: { line: 0, col: 0 },
    undoStack: [],
    redoStack: [],
    isModified: false,
    savedLines: [''],
  };
  return {
    ...syncedState,
    buffers: [...buffers, newBuf],
    lines: [''],
    cursor: { line: 0, col: 0 },
    undoStack: [],
    redoStack: [],
    undoTreeNodes: undefined,
    currentUndoSeq: undefined,
    maxUndoSeq: undefined,
    undoTimeHistory: undefined,
    undoTimeIndex: undefined,
    primaryFilename: '[No Name]',
    alternateBufferId: curId,
    currentBufferId: newId,
    commandMessage: msg('"[이름 없음]" [새 버퍼 {id}]', { id: newId }),
  };
}

/**
 * 현재 버퍼의 파일 정보를 출력하거나 파일명을 변경합니다 (:file [name], :f [name]).
 */
export function fileBufferCommand(state: VimEditorState, newName?: string): VimEditorState {
  const cleanNew = newName?.trim();
  let nextState = state;
  if (cleanNew) {
    const resolved = resolveVfsFilename(state, cleanNew);
    const s = ensureBuffers(state);
    const curId = s.currentBufferId ?? 1;
    nextState = {
      ...s,
      primaryFilename: resolved,
      buffers: s.buffers!.map((b) => (b.id === curId ? { ...b, name: resolved } : b)),
    };
  }

  const filename = nextState.primaryFilename || msg('[이름 없음]');
  const mod = isCurrentBufferModified(nextState) ? msg('[수정됨] ') : '';
  const lineCount = nextState.lines.length;
  if (lineCount === 0) {
    return { ...nextState, commandMessage: msg('"{filename}" [버퍼에 줄 없음]', { filename }) };
  }
  const percent = Math.floor(((nextState.cursor.line + 1) * 100) / lineCount);
  return {
    ...nextState,
    commandMessage: msg('"{filename}" {mod}{lineCount}줄 --{percent}%--', {
      filename,
      mod,
      lineCount,
      percent,
    }),
  };
}

/**
 * 다른 이름으로 현재 버퍼 저장 대상 이름을 검증 및 반영합니다 (:saveas[!]).
 */
export function renameBufferForSaveAs(
  state: VimEditorState,
  filename: string,
  force = false
): { ok: true; state: VimEditorState; filename: string } | { ok: false; state: VimEditorState } {
  const raw = filename.trim();
  if (!raw) {
    return {
      ok: false,
      state: { ...state, commandMessage: msg('E471: 인수가 필요합니다'), bell: true },
    };
  }
  const targetName = resolveVfsFilename(state, raw);
  const currentName = state.primaryFilename;
  const vfsExists = Boolean(getVfsFile(state.netrw?.files, targetName, state.virtualFiles));
  const bufExists = Boolean(state.buffers?.some((b) => b.name === targetName));
  if (!force && targetName !== currentName && (vfsExists || bufExists)) {
    return {
      ok: false,
      state: {
        ...state,
        commandMessage: msg('E13: 파일이 이미 존재합니다 (덮어쓰려면 ! 추가)'),
        bell: true,
      },
    };
  }
  const s = syncCurrentBuffer(state);
  const curId = s.currentBufferId ?? 1;
  return {
    ok: true,
    filename: targetName,
    state: {
      ...s,
      primaryFilename: targetName,
      buffers: s.buffers!.map((b) => (b.id === curId ? { ...b, name: targetName } : b)),
    },
  };
}

/**
 * 이름이 지정된 모든 수정된 버퍼를 저장합니다 (:wa, :wall).
 */
export function writeAllNamedBuffers(state: VimEditorState): { ok: boolean; state: VimEditorState; savedCount: number } {
  const synced = syncCurrentBuffer(state);
  const nextVfs: Record<string, string[]> = { ...(synced.virtualFiles ?? {}) };
  let savedCount = 0;

  for (const b of synced.buffers!) {
    if (b.isModified && (!b.name || b.name === '[No Name]')) {
      return {
        ok: false,
        savedCount,
        state: {
          ...synced,
          commandMessage: msg('E141: 버퍼 {id}에 대한 파일 이름이 없습니다', { id: b.id }),
          bell: true,
        },
      };
    }
  }

  const nextBuffers = synced.buffers!.map((b) => {
    if (b.name && b.name !== '[No Name]') {
      nextVfs[b.name] = [...b.lines];
      if (b.isModified) savedCount++;
      return { ...b, isModified: false, savedLines: [...b.lines] };
    }
    return b;
  });

  if (savedCount === 0 && nextBuffers.some((b) => b.name && b.name !== '[No Name]')) {
    savedCount = nextBuffers.filter((b) => b.name && b.name !== '[No Name]').length;
  }

  return {
    ok: true,
    savedCount,
    state: {
      ...synced,
      buffers: nextBuffers,
      virtualFiles: nextVfs,
    },
  };
}

/**
 * 열려 있는 모든 분할 창·탭·도움말·보조 패널을 닫습니다 (:qa[!], :qall[!]).
 */
export function quitAllWindows(state: VimEditorState, force = false): VimEditorState {
  if (!force && hasModifiedBuffers(state)) {
    return {
      ...state,
      commandMessage: msg('E37: 마지막 변경 이후 저장되지 않았습니다 (무시하려면 ! 추가)'),
      bell: true,
    };
  }

  let next = state.helpSession?.isOpen ? closeHelp(state) : state;
  const activeTab =
    next.tabPages && next.tabPages.length > 1
      ? [next.tabPages.find((t) => t.id === (next.currentTabId ?? 1)) ?? next.tabPages[0]]
      : next.tabPages;

  return {
    ...next,
    splitDirection: 'none',
    splitPanes: undefined,
    activePaneIndex: 0,
    previousPaneIndex: undefined,
    tabPages: activeTab,
    currentTabId: activeTab ? activeTab[0].id : next.currentTabId,
    quickfix: next.quickfix ? { ...next.quickfix, isOpen: false } : next.quickfix,
    locationList: next.locationList ? { ...next.locationList, isOpen: false } : next.locationList,
    netrw: next.netrw ? { ...next.netrw, isOpen: false } : next.netrw,
    commandMessage: force ? msg('모든 창 종료 무시 (:qall!)') : msg('모든 창을 닫았습니다 (:qall)'),
  };
}
