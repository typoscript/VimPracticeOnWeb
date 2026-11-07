import { QuickfixItem, QuickfixState, VimEditorState, SplitPaneState } from '../types/vim';
import { switchBuffer, syncCurrentBuffer } from './bufferEngine';
import { parseQuickfixErrorLines } from './quickfixEngine';

/**
 * 활성 분할 창이 있을 경우 해당 창의 locationList도 동기화합니다.
 */
function syncPaneLocationList(
  state: VimEditorState,
  locList: QuickfixState | null | undefined
): [SplitPaneState, SplitPaneState] | undefined {
  if (!state.splitPanes || state.activePaneIndex === undefined) {
    return state.splitPanes;
  }
  const curIdx = state.activePaneIndex;
  const newPanes: [SplitPaneState, SplitPaneState] = [
    state.splitPanes[0],
    state.splitPanes[1],
  ];
  newPanes[curIdx] = {
    ...newPanes[curIdx],
    locationList: locList,
  };
  return newPanes;
}

/**
 * 현재 창의 로케이션 리스트(Location List)를 설정합니다.
 */
export function setLocationList(
  state: VimEditorState,
  items: QuickfixItem[],
  jumpToFirst = true
): VimEditorState {
  const currentLoc = state.locationList;
  const nextLoc: QuickfixState = {
    items,
    currentIndex: 0,
    isOpen: currentLoc?.isOpen ?? false,
    height: currentLoc?.height,
  };

  const nextPanes = syncPaneLocationList(state, nextLoc);

  const nextState: VimEditorState = {
    ...state,
    locationList: nextLoc,
    splitPanes: nextPanes,
    commandMessage: `(${items.length} of ${items.length}) 로케이션 리스트 로드됨`,
  };

  if (jumpToFirst && items.length > 0) {
    return jumpToLocationListItem(nextState, 0);
  }

  return nextState;
}

/**
 * 지정된 인덱스(0-based)의 로케이션 리스트 항목 위치로 커서를 점프합니다.
 */
export function jumpToLocationListItem(
  state: VimEditorState,
  index: number
): VimEditorState {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return { ...state, commandMessage: 'E776: No location list' };
  }
  if (index < 0 || index >= loc.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  const item = loc.items[index];
  let targetState = state;

  // 1. 해당 항목이 다른 버퍼에 속해 있는 경우 해당 버퍼로 전환
  if (targetState.buffers && targetState.buffers.length > 0) {
    const targetBuf =
      (item.bufferId !== undefined
        ? targetState.buffers.find((b) => b.id === item.bufferId)
        : null) ||
      targetState.buffers.find((b) => b.name === item.filename);

    if (targetBuf && targetBuf.id !== targetState.currentBufferId) {
      targetState = switchBuffer(targetState, targetBuf.id);
    }
  }

  // 2. 라인 및 컬럼 위치로 커서 이동 (1-based -> 0-based)
  const lineIdx = Math.max(0, Math.min(item.line - 1, targetState.lines.length - 1));
  const lineText = targetState.lines[lineIdx] ?? '';
  const colIdx = Math.max(
    0,
    Math.min(item.col - 1, lineText.length > 0 ? lineText.length - 1 : 0)
  );

  const updatedLoc: QuickfixState = {
    ...loc,
    currentIndex: index,
  };

  const updatedPanes = syncPaneLocationList(targetState, updatedLoc);

  return {
    ...targetState,
    cursor: { line: lineIdx, col: colIdx },
    locationList: updatedLoc,
    splitPanes: updatedPanes,
    commandMessage: `(${index + 1} of ${loc.items.length}): ${item.filename}:${item.line}:${item.col} ${item.text}`,
  };
}

/**
 * 다음 로케이션 리스트 에러 항목으로 이동합니다 (:lnext, :lne, [count]lne).
 */
export function nextLocationList(state: VimEditorState, count = 1): VimEditorState {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return { ...state, commandMessage: 'E776: No location list' };
  }

  const step = Math.max(1, count);
  const nextIdx = loc.currentIndex + step;
  if (nextIdx >= loc.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToLocationListItem(state, nextIdx);
}

/**
 * 이전 로케이션 리스트 에러 항목으로 이동합니다 (:lprev, :lp, :lprevious, [count]lp).
 */
export function prevLocationList(state: VimEditorState, count = 1): VimEditorState {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return { ...state, commandMessage: 'E776: No location list' };
  }

  const step = Math.max(1, count);
  const prevIdx = loc.currentIndex - step;
  if (prevIdx < 0) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToLocationListItem(state, prevIdx);
}

/**
 * 첫 번째 로케이션 리스트 항목으로 이동합니다 (:lfirst, :lr, :lrewind).
 */
export function firstLocationList(state: VimEditorState): VimEditorState {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return { ...state, commandMessage: 'E776: No location list' };
  }
  return jumpToLocationListItem(state, 0);
}

/**
 * 마지막 로케이션 리스트 항목으로 이동합니다 (:llast, :lla).
 */
export function lastLocationList(state: VimEditorState): VimEditorState {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return { ...state, commandMessage: 'E776: No location list' };
  }
  return jumpToLocationListItem(state, loc.items.length - 1);
}

/**
 * 로케이션 리스트 윈도우를 엽니다 (:lopen [height], :lope).
 */
export function openLocationListWindow(
  state: VimEditorState,
  height?: number
): VimEditorState {
  const loc = state.locationList ?? { items: [], currentIndex: 0, isOpen: false };
  const updatedLoc: QuickfixState = {
    ...loc,
    isOpen: true,
    height: height ?? loc.height ?? 6,
  };
  const updatedPanes = syncPaneLocationList(state, updatedLoc);
  return {
    ...state,
    locationList: updatedLoc,
    splitPanes: updatedPanes,
    commandMessage: `로케이션 리스트 윈도우 열림 (${loc.items.length}개 항목)`,
  };
}

/**
 * 로케이션 리스트 윈도우를 닫습니다 (:lclose, :lcl).
 */
export function closeLocationListWindow(state: VimEditorState): VimEditorState {
  if (!state.locationList || !state.locationList.isOpen) return state;
  const updatedLoc: QuickfixState = {
    ...state.locationList,
    isOpen: false,
  };
  const updatedPanes = syncPaneLocationList(state, updatedLoc);
  return {
    ...state,
    locationList: updatedLoc,
    splitPanes: updatedPanes,
    commandMessage: '로케이션 리스트 윈도우 닫힘',
  };
}

/**
 * 로케이션 리스트에 항목이 있으면 창을 열고, 없으면 닫습니다 (:lwindow [height], :lw).
 */
export function toggleLocationListWindow(
  state: VimEditorState,
  height?: number
): VimEditorState {
  const loc = state.locationList;
  if (loc && loc.items.length > 0) {
    return openLocationListWindow(state, height);
  } else {
    return closeLocationListWindow(state);
  }
}

/**
 * 로케이션 리스트 목록을 문자열로 포맷팅합니다 (:llist, :lli).
 */
export function formatLocationList(state: VimEditorState): string {
  const loc = state.locationList;
  if (!loc || loc.items.length === 0) {
    return 'E776: No location list';
  }

  return loc.items
    .map((item, idx) => {
      const activeMark = idx === loc.currentIndex ? '>' : ' ';
      return `${activeMark} ${idx + 1} | ${item.filename}:${item.line}:${item.col} | ${item.text}`;
    })
    .join('\n');
}

/**
 * 현재 창과 버퍼 내에서 정규식 패턴을 검색하여 로케이션 리스트를 구성합니다 (:lvimgrep, :lvimgrepadd, :lv).
 */
export function lvimgrep(
  state: VimEditorState,
  args: string,
  isAppend = false
): VimEditorState {
  const trimmed = args.trim();
  if (!trimmed) {
    return { ...state, commandMessage: 'E471: Argument required' };
  }

  let pattern = '';
  let flags = '';
  let fileTarget = '%';

  if (trimmed.startsWith('/')) {
    const match = trimmed.match(/^\/((?:\\\/|[^\/])+)\/([a-z]*)(?:\s+(.*))?$/i);
    if (!match) {
      return { ...state, commandMessage: 'E486: Pattern not found' };
    }
    pattern = match[1];
    flags = match[2];
    fileTarget = match[3]?.trim() || '%';
  } else {
    const parts = trimmed.split(/\s+/);
    pattern = parts[0];
    fileTarget = parts.slice(1).join(' ') || '%';
  }

  try {
    new RegExp(pattern, flags.includes('g') ? 'g' : '');
  } catch {
    return { ...state, commandMessage: `E486: Pattern not found: ${pattern}` };
  }

  const synced = syncCurrentBuffer(state);
  interface BufferToSearch {
    id?: number;
    name: string;
    lines: string[];
  }

  const targets: BufferToSearch[] = [];
  const currentBufName =
    (synced.buffers && synced.currentBufferId
      ? synced.buffers.find((b) => b.id === synced.currentBufferId)?.name
      : null) ||
    synced.primaryFilename ||
    'source.ts';

  if (fileTarget === '%' || fileTarget === currentBufName) {
    targets.push({
      id: synced.currentBufferId,
      name: currentBufName,
      lines: synced.lines,
    });
  } else if (fileTarget === '*' || fileTarget === '**/*') {
    if (synced.buffers && synced.buffers.length > 0) {
      for (const b of synced.buffers) {
        targets.push({
          id: b.id,
          name: b.name,
          lines: b.id === synced.currentBufferId ? synced.lines : b.lines,
        });
      }
    } else {
      targets.push({
        id: synced.currentBufferId,
        name: currentBufName,
        lines: synced.lines,
      });
      if (synced.secondaryFilename && synced.secondaryLines) {
        targets.push({
          name: synced.secondaryFilename,
          lines: synced.secondaryLines,
        });
      }
    }
  } else {
    const foundBuf = synced.buffers?.find((b) => b.name === fileTarget);
    if (foundBuf) {
      targets.push({
        id: foundBuf.id,
        name: foundBuf.name,
        lines: foundBuf.id === synced.currentBufferId ? synced.lines : foundBuf.lines,
      });
    } else if (synced.secondaryFilename === fileTarget && synced.secondaryLines) {
      targets.push({
        name: synced.secondaryFilename,
        lines: synced.secondaryLines,
      });
    } else {
      targets.push({
        id: synced.currentBufferId,
        name: currentBufName,
        lines: synced.lines,
      });
    }
  }

  const matchedItems: QuickfixItem[] = [];
  const regexFlags = (flags.includes('i') ? 'i' : '') + 'g';

  for (const target of targets) {
    for (let lineIdx = 0; lineIdx < target.lines.length; lineIdx++) {
      const lineStr = target.lines[lineIdx] ?? '';
      const regex = new RegExp(pattern, regexFlags);
      let m: RegExpExecArray | null;

      while ((m = regex.exec(lineStr)) !== null) {
        matchedItems.push({
          filename: target.name,
          bufferId: target.id,
          line: lineIdx + 1,
          col: m.index + 1,
          text: lineStr.trim(),
        });
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
  }

  if (matchedItems.length === 0) {
    return { ...state, commandMessage: `E480: No match: ${pattern}` };
  }

  const existingItems = isAppend && state.locationList ? state.locationList.items : [];
  const finalItems = [...existingItems, ...matchedItems];
  const jumpImmediately = !flags.includes('j');

  return setLocationList(state, finalItems, jumpImmediately);
}

/**
 * 외부 에러 로그 파일에서 에러 목록을 읽어 로케이션 리스트로 로드합니다 (:lfile, :lf, :lgetfile, :lg).
 */
export function loadLocationListFromFile(
  state: VimEditorState,
  filename: string,
  jumpToFirst = true
): VimEditorState {
  const synced = syncCurrentBuffer(state);
  let fileLines: string[] | undefined = undefined;

  if (synced.buffers && synced.buffers.length > 0) {
    const buf = synced.buffers.find((b) => b.name === filename);
    if (buf) {
      fileLines = buf.lines;
    }
  }

  if (!fileLines && synced.secondaryFilename === filename && synced.secondaryLines) {
    fileLines = synced.secondaryLines;
  }

  if (!fileLines && synced.primaryFilename === filename) {
    fileLines = synced.lines;
  }

  if (!fileLines) {
    return { ...state, commandMessage: `E484: Can't open file ${filename}` };
  }

  const items = parseQuickfixErrorLines(fileLines);
  if (items.length === 0) {
    return {
      ...state,
      commandMessage: `(${filename}): 파싱 가능한 에러 항목이 없습니다`,
    };
  }

  return setLocationList(state, items, jumpToFirst);
}
