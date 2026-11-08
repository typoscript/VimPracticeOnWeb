import { VimBuffer, VimEditorState } from './types';
import { getVfsFile } from './vfs';

/**
 * 버퍼 목록이 초기화되어 있지 않은 경우, 기본 1번 버퍼(및 2번 보조 버퍼)를 구성합니다.
 */
export function ensureBuffers(state: VimEditorState): VimEditorState {
  if (state.buffers && state.buffers.length > 0 && state.currentBufferId !== undefined) {
    return state;
  }

  const primaryName = state.primaryFilename || 'source.ts';
  const buf1: VimBuffer = {
    id: 1,
    name: primaryName,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    isModified: false,
  };

  const buffers: VimBuffer[] = [buf1];
  let alternateBufferId: number | undefined = undefined;

  // 보조 파일(secondaryFilename/secondaryLines)이 존재하는 경우 2번 버퍼로 등록
  if (state.secondaryLines || state.secondaryFilename) {
    const secondaryName = state.secondaryFilename || 'target.ts';
    const buf2: VimBuffer = {
      id: 2,
      name: secondaryName,
      lines: state.secondaryLines ? [...state.secondaryLines] : [''],
      cursor: { line: 0, col: 0 },
      undoStack: [],
      redoStack: [],
      isModified: false,
    };
    buffers.push(buf2);
    alternateBufferId = 2;
  }

  return {
    ...state,
    buffers,
    currentBufferId: 1,
    alternateBufferId,
    primaryFilename: primaryName,
  };
}

/**
 * 현재 활성 버퍼의 변경 상태(lines, cursor, undoStack 등)를 버퍼 저장소에 동기화합니다.
 */
export function syncCurrentBuffer(state: VimEditorState): VimEditorState {
  const s = ensureBuffers(state);
  const curId = s.currentBufferId ?? 1;

  const nextBuffers = s.buffers!.map((b) => {
    if (b.id === curId) {
      return {
        ...b,
        name: s.primaryFilename || b.name,
        lines: [...s.lines],
        cursor: { ...s.cursor },
        undoStack: s.undoStack ? [...s.undoStack] : [],
        redoStack: s.redoStack ? [...s.redoStack] : [],
      };
    }
    return b;
  });

  return {
    ...s,
    buffers: nextBuffers,
  };
}

/**
 * 지정된 버퍼(번호, 파일명, 대안 버퍼 '#')로 작업 화면을 전환합니다 (:b {target}).
 */
export function switchBuffer(state: VimEditorState, target: number | string): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  const curId = syncedState.currentBufferId ?? 1;

  let targetBuf: VimBuffer | undefined;

  if (target === '#') {
    if (!syncedState.alternateBufferId) {
      return {
        ...syncedState,
        commandMessage: 'E23: 다른 버퍼가 없습니다',
      };
    }
    targetBuf = buffers.find((b) => b.id === syncedState.alternateBufferId);
  } else if (typeof target === 'number' || /^\d+$/.test(String(target))) {
    const numId = typeof target === 'number' ? target : parseInt(String(target), 10);
    targetBuf = buffers.find((b) => b.id === numId);
  } else {
    const query = String(target).trim();
    // 정확 일치 우선 탐색 후 부분 일치 탐색
    targetBuf =
      buffers.find((b) => b.name === query) ??
      buffers.find((b) => b.name.includes(query));
  }

  if (!targetBuf) {
    return {
      ...syncedState,
      commandMessage: `E94: 일치하는 버퍼를 찾을 수 없습니다: ${target}`,
    };
  }

  if (targetBuf.id === curId) {
    return {
      ...syncedState,
      commandMessage: `"${targetBuf.name}" [버퍼 ${targetBuf.id}] 현재 활성`,
    };
  }

  return {
    ...syncedState,
    lines: [...targetBuf.lines],
    cursor: { ...targetBuf.cursor },
    undoStack: targetBuf.undoStack ? [...targetBuf.undoStack] : [],
    redoStack: targetBuf.redoStack ? [...targetBuf.redoStack] : [],
    primaryFilename: targetBuf.name,
    alternateBufferId: curId,
    currentBufferId: targetBuf.id,
    commandMessage: `"${targetBuf.name}" [버퍼 ${targetBuf.id}]`,
  };
}

/**
 * 다음 버퍼로 전환합니다 (:bn, :bnext, [count]bn).
 */
export function nextBuffer(state: VimEditorState, count = 1): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  if (buffers.length <= 1) return syncedState;

  const curId = syncedState.currentBufferId ?? 1;
  const curIdx = buffers.findIndex((b) => b.id === curId);
  const safeIdx = curIdx >= 0 ? curIdx : 0;
  const step = Math.max(1, count);
  const nextIdx = (safeIdx + step) % buffers.length;
  const targetBuf = buffers[nextIdx];

  return switchBuffer(syncedState, targetBuf.id);
}

/**
 * 이전 버퍼로 전환합니다 (:bp, :bprev, [count]bp).
 */
export function prevBuffer(state: VimEditorState, count = 1): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  if (buffers.length <= 1) return syncedState;

  const curId = syncedState.currentBufferId ?? 1;
  const curIdx = buffers.findIndex((b) => b.id === curId);
  const safeIdx = curIdx >= 0 ? curIdx : 0;
  const step = Math.max(1, count) % buffers.length;
  const prevIdx = (safeIdx - step + buffers.length) % buffers.length;
  const targetBuf = buffers[prevIdx];

  return switchBuffer(syncedState, targetBuf.id);
}

/**
 * 첫 번째 버퍼로 전환합니다 (:bf, :bfirst).
 */
export function firstBuffer(state: VimEditorState): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  if (buffers.length === 0) return syncedState;
  return switchBuffer(syncedState, buffers[0].id);
}

/**
 * 마지막 버퍼로 전환합니다 (:bl, :blast).
 */
export function lastBuffer(state: VimEditorState): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  if (buffers.length === 0) return syncedState;
  return switchBuffer(syncedState, buffers[buffers.length - 1].id);
}

/**
 * 직전 대안 버퍼와 현재 버퍼를 상호 전환합니다 (Ctrl-^ / Ctrl-6).
 */
export function alternateBuffer(state: VimEditorState): VimEditorState {
  return switchBuffer(state, '#');
}

/**
 * 새 파일을 버퍼로 열거나 기존 파일 버퍼로 전환합니다 (:e {filename}).
 */
export function editBuffer(state: VimEditorState, filename: string): VimEditorState {
  const cleanName = filename.trim();
  if (!cleanName) {
    return {
      ...state,
      commandMessage: 'E471: 인수가 필요합니다 (:e {filename})',
    };
  }

  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  const existing = buffers.find((b) => b.name === cleanName);

  if (existing) {
    return switchBuffer(syncedState, existing.id);
  }

  const maxId = buffers.reduce((max, b) => Math.max(max, b.id), 0);
  const newId = maxId + 1;
  const curId = syncedState.currentBufferId ?? 1;

  const vfsLines = getVfsFile(state.netrw?.files, cleanName);
  const initialLines = vfsLines ? [...vfsLines] : [''];

  const newBuf: VimBuffer = {
    id: newId,
    name: cleanName,
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    undoStack: [],
    redoStack: [],
    isModified: false,
  };

  const nextBuffers = [...buffers, newBuf];

  return {
    ...syncedState,
    buffers: nextBuffers,
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    undoStack: [],
    redoStack: [],
    primaryFilename: cleanName,
    alternateBufferId: curId,
    currentBufferId: newId,
    commandMessage: `"${cleanName}" [${vfsLines ? '파일 로드됨' : '새 파일'} 버퍼 ${newId}]`,
  };
}

/**
 * 버퍼를 삭제하고 다른 버퍼로 복귀합니다 (:bd, :bdelete).
 */
export function deleteBuffer(state: VimEditorState, target?: number | string): VimEditorState {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  const curId = syncedState.currentBufferId ?? 1;

  let targetBuf: VimBuffer | undefined;

  if (target === undefined || target === '') {
    targetBuf = buffers.find((b) => b.id === curId);
  } else if (typeof target === 'number' || /^\d+$/.test(String(target))) {
    const numId = typeof target === 'number' ? target : parseInt(String(target), 10);
    targetBuf = buffers.find((b) => b.id === numId);
  } else {
    const query = String(target).trim();
    targetBuf =
      buffers.find((b) => b.name === query) ??
      buffers.find((b) => b.name.includes(query));
  }

  if (!targetBuf) {
    return {
      ...syncedState,
      commandMessage: `E94: 버퍼를 찾을 수 없습니다: ${target}`,
    };
  }

  // 버퍼가 1개만 남았을 경우 빈 버퍼로 초기화
  if (buffers.length <= 1) {
    const emptyBuf: VimBuffer = {
      id: 1,
      name: '[No Name]',
      lines: [''],
      cursor: { line: 0, col: 0 },
      undoStack: [],
      redoStack: [],
      isModified: false,
    };
    return {
      ...syncedState,
      buffers: [emptyBuf],
      lines: [''],
      cursor: { line: 0, col: 0 },
      undoStack: [],
      redoStack: [],
      primaryFilename: '[No Name]',
      currentBufferId: 1,
      alternateBufferId: undefined,
      commandMessage: '버퍼 1개를 초기화했습니다',
    };
  }

  const isCurrent = targetBuf.id === curId;
  const nextBuffers = buffers.filter((b) => b.id !== targetBuf!.id);

  if (!isCurrent) {
    const nextAlt = syncedState.alternateBufferId === targetBuf.id ? undefined : syncedState.alternateBufferId;
    return {
      ...syncedState,
      buffers: nextBuffers,
      alternateBufferId: nextAlt,
      commandMessage: `버퍼 ${targetBuf.id} ("${targetBuf.name}")를 삭제했습니다`,
    };
  }

  // 현재 버퍼가 삭제된 경우: 대안 버퍼(#) 우선, 없으면 직전/다음 버퍼로 전환
  let fallbackBuf: VimBuffer | undefined;
  if (syncedState.alternateBufferId) {
    fallbackBuf = nextBuffers.find((b) => b.id === syncedState.alternateBufferId);
  }
  if (!fallbackBuf) {
    const curIdx = buffers.findIndex((b) => b.id === curId);
    const fallbackIdx = Math.min(curIdx, nextBuffers.length - 1);
    fallbackBuf = nextBuffers[fallbackIdx];
  }

  return {
    ...syncedState,
    buffers: nextBuffers,
    lines: [...fallbackBuf.lines],
    cursor: { ...fallbackBuf.cursor },
    undoStack: fallbackBuf.undoStack ? [...fallbackBuf.undoStack] : [],
    redoStack: fallbackBuf.redoStack ? [...fallbackBuf.redoStack] : [],
    primaryFilename: fallbackBuf.name,
    currentBufferId: fallbackBuf.id,
    alternateBufferId: undefined,
    commandMessage: `버퍼 ${targetBuf.id} ("${targetBuf.name}")를 삭제했습니다`,
  };
}

/**
 * 열려 있는 버퍼 목록을 순정 Vim 형식으로 포맷팅합니다 (:ls, :buffers, :files).
 */
export function formatBufferList(state: VimEditorState): string {
  const syncedState = syncCurrentBuffer(state);
  const buffers = syncedState.buffers!;
  const curId = syncedState.currentBufferId ?? 1;
  const altId = syncedState.alternateBufferId;

  const rows = buffers.map((b) => {
    const isCurrent = b.id === curId;
    const isAlternate = b.id === altId;
    const isMod = b.isModified;

    // 플래그: % (현재), # (대안), a (활성), h (숨김), + (수정됨)
    let flags = ' ';
    if (isCurrent) flags += '%';
    else if (isAlternate) flags += '#';
    else flags += ' ';

    flags += 'a'; // 웹 시뮬레이터에서는 메모리에 모두 로드됨
    if (isMod) flags += '+';
    else flags += ' ';

    const lineNum = b.cursor.line + 1;
    return `  ${b.id.toString().padStart(2, ' ')} ${flags} "${b.name}" line ${lineNum}`;
  });

  return rows.join('\n');
}
