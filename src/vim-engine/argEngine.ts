import { ArgListState, VimEditorState } from './types';
import { editBuffer, switchBuffer, syncCurrentBuffer, ensureBuffers } from './bufferEngine';
import { msg } from './messages';

/**
 * 아규먼트 파일로 에디터 화면을 전환합니다.
 * 버퍼 목록에 이미 존재하면 전환하고, 없으면 새로 버퍼를 생성합니다.
 */
export function switchToArgFile(state: VimEditorState, filename: string): VimEditorState {
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const cleanName = filename.trim();
  if (!cleanName) return synced;

  const existing = synced.buffers?.find((b) => b.name === cleanName);
  if (existing) {
    return switchBuffer(synced, existing.id);
  }

  return editBuffer(synced, cleanName);
}

function isSplitActive(state: VimEditorState): boolean {
  return Boolean(state.splitDirection && state.splitDirection !== 'none' && state.splitPanes);
}

function cloneArgList(al: ArgListState | null | undefined): ArgListState | null {
  if (!al) return null;
  return { files: [...al.files], currentIndex: al.currentIndex };
}

/** 현재 창이 로컬 아규먼트 리스트(:arglocal) 사용 중이면 창 로컬에만, 아니면 전역에도 반영합니다. */
function writeArgList(state: VimEditorState, nextArgList: ArgListState | null): VimEditorState {
  if (state.usesLocalArgList) {
    const nextPanes = isSplitActive(state)
      ? state.splitPanes!.map((pane, idx) =>
          idx === (state.activePaneIndex ?? 0) ? { ...pane, localArgList: nextArgList } : pane
        )
      : state.splitPanes;
    return {
      ...state,
      argList: nextArgList,
      ...(nextPanes ? { splitPanes: nextPanes } : {}),
    };
  }
  return {
    ...state,
    argList: nextArgList,
    globalArgList: nextArgList,
  };
}

/**
 * 아규먼트 리스트(:args)를 새 파일 목록으로 설정하고 첫 번째 파일로 전환합니다.
 */
export function setArgs(state: VimEditorState, files: string[]): VimEditorState {
  const cleanFiles = files.map((f) => f.trim()).filter((f) => f.length > 0);
  if (cleanFiles.length === 0) {
    return {
      ...state,
      commandMessage: 'E471: Argument required',
    };
  }

  const nextArgList: ArgListState = {
    files: cleanFiles,
    currentIndex: 0,
  };

  const base = writeArgList(state, nextArgList);
  const switched = switchToArgFile(base, cleanFiles[0]);
  const finalState = writeArgList(switched, nextArgList);

  return {
    ...finalState,
    commandMessage: formatArgs(finalState),
  };
}

/**
 * 창 로컬 아규먼트 리스트를 활성화하거나 새 파일 목록으로 설정합니다 (:arglocal [files...]).
 */
export function setLocalArgs(state: VimEditorState, files?: string[]): VimEditorState {
  const cleanFiles = files ? files.map((f) => f.trim()).filter((f) => f.length > 0) : [];
  const preservedGlobal =
    state.globalArgList !== undefined
      ? state.globalArgList
      : !state.usesLocalArgList
        ? cloneArgList(state.argList)
        : null;

  const baseState: VimEditorState = {
    ...state,
    globalArgList: preservedGlobal,
    usesLocalArgList: true,
  };

  if (cleanFiles.length > 0) {
    return setArgs(baseState, cleanFiles);
  }

  const copiedLocal = cloneArgList(state.argList ?? preservedGlobal);
  const finalState = writeArgList(baseState, copiedLocal);
  return {
    ...finalState,
    commandMessage: formatArgs(finalState),
  };
}

/**
 * 현재 창을 전역 아규먼트 리스트로 복귀시키거나 전역 목록을 재설정합니다 (:argglobal [files...]).
 */
export function setGlobalArgs(state: VimEditorState, files?: string[]): VimEditorState {
  const cleanFiles = files ? files.map((f) => f.trim()).filter((f) => f.length > 0) : [];
  const nextPanes = isSplitActive(state)
    ? state.splitPanes!.map((pane, idx) =>
        idx === (state.activePaneIndex ?? 0) ? { ...pane, localArgList: undefined } : pane
      )
    : state.splitPanes;

  const restoredGlobal =
    state.globalArgList !== undefined ? cloneArgList(state.globalArgList) : cloneArgList(state.argList);

  const baseState: VimEditorState = {
    ...state,
    usesLocalArgList: false,
    argList: restoredGlobal,
    globalArgList: restoredGlobal,
    ...(nextPanes ? { splitPanes: nextPanes } : {}),
  };

  if (cleanFiles.length > 0) {
    return setArgs(baseState, cleanFiles);
  }

  return {
    ...baseState,
    commandMessage: formatArgs(baseState),
  };
}

/**
 * 아규먼트 리스트에 파일을 추가합니다 (:argadd {file} ...).
 */
export function addArgs(state: VimEditorState, newFiles: string[]): VimEditorState {
  const cleanFiles = newFiles.map((f) => f.trim()).filter((f) => f.length > 0);
  if (cleanFiles.length === 0) return state;

  const currentFiles = state.argList ? [...state.argList.files] : [];
  if (currentFiles.length === 0) {
    const currentName =
      state.primaryFilename ||
      (state.buffers && state.currentBufferId
        ? state.buffers.find((b) => b.id === state.currentBufferId)?.name
        : null) ||
      'source.ts';
    currentFiles.push(currentName);
  }

  for (const f of cleanFiles) {
    if (!currentFiles.includes(f)) {
      currentFiles.push(f);
    }
  }

  const nextArgList: ArgListState = {
    files: currentFiles,
    currentIndex: state.argList?.currentIndex ?? 0,
  };

  const updated = writeArgList(state, nextArgList);
  return {
    ...updated,
    commandMessage: formatArgs(updated),
  };
}

/**
 * 아규먼트 리스트에서 특정 패턴의 파일을 제거합니다 (:argdelete {pattern}, :argd).
 */
export function deleteArgs(state: VimEditorState, pattern: string): VimEditorState {
  if (!state.argList || state.argList.files.length === 0) {
    return {
      ...state,
      commandMessage: 'E163: There is only one file to edit',
    };
  }

  const cleanPattern = pattern.trim();
  const regex = new RegExp(`^${cleanPattern.replace(/\*/g, '.*')}$`);
  const remaining = state.argList.files.filter((f) => !regex.test(f));

  if (remaining.length === 0) {
    return {
      ...writeArgList(state, null),
      commandMessage: msg('아규먼트 리스트가 비워졌습니다'),
    };
  }

  const newIdx = Math.min(state.argList.currentIndex, remaining.length - 1);
  const nextArgList: ArgListState = {
    files: remaining,
    currentIndex: newIdx,
  };

  const updated = writeArgList(state, nextArgList);
  return {
    ...updated,
    commandMessage: formatArgs(updated),
  };
}

/**
 * 아규먼트 리스트의 다음 파일로 전환합니다 (:next, :n, [count]next).
 */
export function nextArg(state: VimEditorState, count = 1): VimEditorState {
  const al = state.argList;
  if (!al || al.files.length <= 1) {
    return {
      ...state,
      commandMessage: 'E99: No more files to edit',
    };
  }

  const step = Math.max(1, count);
  const targetIdx = al.currentIndex + step;

  if (targetIdx >= al.files.length) {
    return {
      ...state,
      commandMessage: 'E99: No more files to edit',
    };
  }

  const targetFile = al.files[targetIdx];
  const nextArgList: ArgListState = {
    ...al,
    currentIndex: targetIdx,
  };

  const switched = switchToArgFile(writeArgList(state, nextArgList), targetFile);
  return {
    ...writeArgList(switched, nextArgList),
    commandMessage: `(${targetIdx + 1} of ${al.files.length}): ${targetFile}`,
  };
}

/**
 * 아규먼트 리스트의 이전 파일로 전환합니다 (:prev, :previous, :Next, :N, [count]prev).
 */
export function prevArg(state: VimEditorState, count = 1): VimEditorState {
  const al = state.argList;
  if (!al || al.files.length <= 1) {
    return {
      ...state,
      commandMessage: 'E163: There is only one file to edit',
    };
  }

  const step = Math.max(1, count);
  const targetIdx = al.currentIndex - step;

  if (targetIdx < 0) {
    return {
      ...state,
      commandMessage: 'E164: Cannot go before first file',
    };
  }

  const targetFile = al.files[targetIdx];
  const nextArgList: ArgListState = {
    ...al,
    currentIndex: targetIdx,
  };

  const switched = switchToArgFile(writeArgList(state, nextArgList), targetFile);
  return {
    ...writeArgList(switched, nextArgList),
    commandMessage: `(${targetIdx + 1} of ${al.files.length}): ${targetFile}`,
  };
}

/**
 * 아규먼트 리스트의 첫 번째 파일로 전환합니다 (:first, :fir, :rewind, :rew).
 */
export function firstArg(state: VimEditorState): VimEditorState {
  const al = state.argList;
  if (!al || al.files.length === 0) {
    return {
      ...state,
      commandMessage: 'E163: There is only one file to edit',
    };
  }

  const targetFile = al.files[0];
  const nextArgList: ArgListState = {
    ...al,
    currentIndex: 0,
  };

  const switched = switchToArgFile(writeArgList(state, nextArgList), targetFile);
  return {
    ...writeArgList(switched, nextArgList),
    commandMessage: `(1 of ${al.files.length}): ${targetFile}`,
  };
}

/**
 * 아규먼트 리스트의 마지막 파일로 전환합니다 (:last, :la).
 */
export function lastArg(state: VimEditorState): VimEditorState {
  const al = state.argList;
  if (!al || al.files.length === 0) {
    return {
      ...state,
      commandMessage: 'E163: There is only one file to edit',
    };
  }

  const targetIdx = al.files.length - 1;
  const targetFile = al.files[targetIdx];
  const nextArgList: ArgListState = {
    ...al,
    currentIndex: targetIdx,
  };

  const switched = switchToArgFile(writeArgList(state, nextArgList), targetFile);
  return {
    ...writeArgList(switched, nextArgList),
    commandMessage: `(${targetIdx + 1} of ${al.files.length}): ${targetFile}`,
  };
}

/**
 * 아규먼트 목록을 순정 Vim 표준 문자열로 포맷팅합니다 (:args).
 * 현재 활성 파일은 대괄호([filename])로 표시됩니다.
 */
export function formatArgs(state: VimEditorState): string {
  const al = state.argList;
  if (!al || al.files.length === 0) {
    const curName =
      state.primaryFilename ||
      (state.buffers && state.currentBufferId
        ? state.buffers.find((b) => b.id === state.currentBufferId)?.name
        : null) ||
      'source.ts';
    return `[${curName}]`;
  }

  return al.files
    .map((file, idx) => (idx === al.currentIndex ? `[${file}]` : file))
    .join(' ');
}

/**
 * 아규먼트 리스트의 모든 파일에 대해 지정된 Ex 명령어를 일괄 실행합니다 (:argdo[!] {cmd}).
 */
export function argdo(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isBang = false
): VimEditorState {
  const cleanCmd = commandStr.trim();
  if (!cleanCmd) {
    return {
      ...state,
      commandMessage: 'E471: Argument required',
      bell: true,
    };
  }

  const files =
    state.argList && state.argList.files.length > 0
      ? state.argList.files
      : [
          state.primaryFilename ||
            (state.buffers && state.currentBufferId
              ? state.buffers.find((b) => b.id === state.currentBufferId)?.name
              : null) ||
            'source.ts',
        ];

  let currState = state;
  let executedCount = 0;

  // 순정 Vim: argdo 실행 시 각 파일을 순회하며 명령어 적용
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    currState = switchToArgFile(currState, file);
    if (currState.argList) {
      currState = {
        ...currState,
        argList: {
          ...currState.argList,
          currentIndex: i,
        },
      };
    }
    // 치환 또는 Ex 명령어 실행
    currState = executeCmd(currState, cleanCmd);
    currState = syncCurrentBuffer(currState);
    executedCount++;

    if (currState.bell) {
      if (!isBang) {
        break;
      } else {
        currState = { ...currState, bell: false };
      }
    }
  }

  return {
    ...currState,
    commandMessage: msg('({filesCount}개 파일에 대해 :argdo \'{cleanCmd}\' 실행 완료)', { filesCount: executedCount, cleanCmd }),
  };
}
