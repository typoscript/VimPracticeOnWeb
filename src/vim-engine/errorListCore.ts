import { QuickfixItem, QuickfixState, VimEditorState } from './types';
import { switchBuffer, syncCurrentBuffer, editBuffer } from './bufferEngine';
import { compileVimRegex } from './vimRegex';
import { getOptions } from './setOptionsCore';
import { buildVfsMap } from './vfs';
import {
  parseLinesWithErrorformat,
  evaluateErrorExprLines,
  runVfsGrep,
  ErrorExprUserFn,
} from './errorformat';

export interface ErrorListAdapter {
  getList(state: VimEditorState): QuickfixState | null | undefined;
  writeList(state: VimEditorState, nextList: QuickfixState): VimEditorState;
  emptyError: string;
  loadedMessage(itemsCount: number): string;
  openedMessage(itemsCount: number): string;
  closedMessage(): string;
  batchDoneMessage(count: number, cleanCmd: string, isFile: boolean): string;
  fileOpenFailedMessage(filename: string): string;
  fileEmptyErrorsMessage(filename: string): string;
  vimgrepOptions?: {
    alwaysGlobalLineMatch?: boolean;
    jumpIndexOnAppend?: 'newFirst' | 'first';
    noJumpMessage?: (totalCount: number) => string;
  };
}

interface BufferToSearch {
  id?: number;
  name: string;
  lines: string[];
}

export function setErrorList(
  state: VimEditorState,
  items: QuickfixItem[],
  jumpToFirst: boolean,
  adapter: ErrorListAdapter
): VimEditorState {
  const current = adapter.getList(state);
  const nextList: QuickfixState = {
    items,
    currentIndex: 0,
    isOpen: current?.isOpen ?? false,
    height: current?.height,
  };

  const nextState: VimEditorState = {
    ...adapter.writeList(state, nextList),
    commandMessage: adapter.loadedMessage(items.length),
  };

  if (jumpToFirst && items.length > 0) {
    return jumpToErrorListItem(nextState, 0, adapter);
  }

  return nextState;
}

export function jumpToErrorListItem(
  state: VimEditorState,
  index: number,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return { ...state, commandMessage: adapter.emptyError };
  }
  if (index < 0 || index >= list.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  const item = list.items[index];
  let targetState = state;

  // 1. 해당 항목이 다른 버퍼에 속해 있는 경우 해당 버퍼로 전환
  if (targetState.buffers && targetState.buffers.length > 0) {
    const targetBuf =
      (item.bufferId !== undefined
        ? targetState.buffers.find((b) => b.id === item.bufferId)
        : null) || targetState.buffers.find((b) => b.name === item.filename);

    if (targetBuf && targetBuf.id !== targetState.currentBufferId) {
      targetState = switchBuffer(targetState, targetBuf.id);
    } else if (!targetBuf && item.filename) {
      targetState = editBuffer(targetState, item.filename);
    }
  }

  // 2. 라인 및 컬럼 위치로 커서 이동 (1-based -> 0-based)
  const lineIdx = Math.max(0, Math.min(item.line - 1, targetState.lines.length - 1));
  const lineText = targetState.lines[lineIdx] ?? '';
  const colIdx = Math.max(
    0,
    Math.min(item.col - 1, lineText.length > 0 ? lineText.length - 1 : 0)
  );

  const updatedList: QuickfixState = {
    ...list,
    currentIndex: index,
  };

  return {
    ...adapter.writeList(targetState, updatedList),
    cursor: { line: lineIdx, col: colIdx },
    commandMessage: `(${index + 1} of ${list.items.length}): ${item.filename}:${item.line}:${item.col} ${item.text}`,
  };
}

export function nextErrorListItem(
  state: VimEditorState,
  count: number,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return { ...state, commandMessage: adapter.emptyError };
  }

  const step = Math.max(1, count);
  const nextIdx = list.currentIndex + step;
  if (nextIdx >= list.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToErrorListItem(state, nextIdx, adapter);
}

export function prevErrorListItem(
  state: VimEditorState,
  count: number,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return { ...state, commandMessage: adapter.emptyError };
  }

  const step = Math.max(1, count);
  const prevIdx = list.currentIndex - step;
  if (prevIdx < 0) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToErrorListItem(state, prevIdx, adapter);
}

export function firstErrorListItem(
  state: VimEditorState,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return { ...state, commandMessage: adapter.emptyError };
  }
  return jumpToErrorListItem(state, 0, adapter);
}

export function lastErrorListItem(
  state: VimEditorState,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return { ...state, commandMessage: adapter.emptyError };
  }
  return jumpToErrorListItem(state, list.items.length - 1, adapter);
}

export function openErrorListWindow(
  state: VimEditorState,
  height: number | undefined,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state) ?? { items: [], currentIndex: 0, isOpen: false };
  const updatedList: QuickfixState = {
    ...list,
    isOpen: true,
    height: height ?? list.height ?? 6,
  };
  return {
    ...adapter.writeList(state, updatedList),
    commandMessage: adapter.openedMessage(list.items.length),
  };
}

export function closeErrorListWindow(
  state: VimEditorState,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (!list || !list.isOpen) return state;
  const updatedList: QuickfixState = {
    ...list,
    isOpen: false,
  };
  return {
    ...adapter.writeList(state, updatedList),
    commandMessage: adapter.closedMessage(),
  };
}

export function toggleErrorListWindow(
  state: VimEditorState,
  height: number | undefined,
  adapter: ErrorListAdapter
): VimEditorState {
  const list = adapter.getList(state);
  if (list && list.items.length > 0) {
    return openErrorListWindow(state, height, adapter);
  }
  return closeErrorListWindow(state, adapter);
}

export function formatErrorList(state: VimEditorState, adapter: ErrorListAdapter): string {
  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return adapter.emptyError;
  }

  return list.items
    .map((item, idx) => {
      const activeMark = idx === list.currentIndex ? '>' : ' ';
      return `${activeMark} ${idx + 1} | ${item.filename}:${item.line}:${item.col} | ${item.text}`;
    })
    .join('\n');
}

function collectSearchTargets(synced: VimEditorState, fileTarget: string): BufferToSearch[] {
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
  } else if (
    fileTarget === '*' ||
    fileTarget === '*.*' ||
    fileTarget === '**' ||
    fileTarget === '**/*' ||
    fileTarget === 'all'
  ) {
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

  return targets;
}

export function runVimgrepToList(
  state: VimEditorState,
  args: string,
  isAppend: boolean,
  adapter: ErrorListAdapter
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

  const regexOpts = {
    ignorecase: state.options?.ignorecase,
    smartcase: state.options?.smartcase,
  };
  try {
    compileVimRegex(pattern, regexOpts);
  } catch {
    return { ...state, commandMessage: `E486: Pattern not found: ${pattern}`, bell: true };
  }

  const synced = syncCurrentBuffer(state);
  const targets = collectSearchTargets(synced, fileTarget);
  const alwaysGlobal = adapter.vimgrepOptions?.alwaysGlobalLineMatch === true;
  const globalMatch = alwaysGlobal || flags.includes('g');
  const ignorecase = regexOpts.ignorecase || (alwaysGlobal && flags.includes('i'));

  const items: QuickfixItem[] = [];
  for (const target of targets) {
    for (let lineIdx = 0; lineIdx < target.lines.length; lineIdx++) {
      const lineText = target.lines[lineIdx] ?? '';
      if (globalMatch) {
        const lineRegex = compileVimRegex(pattern, { ...regexOpts, ignorecase, flags: 'g' });
        let m: RegExpExecArray | null;
        while ((m = lineRegex.exec(lineText)) !== null) {
          items.push({
            filename: target.name,
            bufferId: target.id,
            line: lineIdx + 1,
            col: m.index + 1,
            text: lineText.trim(),
          });
          if (m.index === lineRegex.lastIndex) {
            lineRegex.lastIndex++;
          }
        }
      } else {
        const m = lineText.match(compileVimRegex(pattern, regexOpts));
        if (m && m.index !== undefined) {
          items.push({
            filename: target.name,
            bufferId: target.id,
            line: lineIdx + 1,
            col: m.index + 1,
            text: lineText.trim(),
          });
        }
      }
    }
  }

  if (items.length === 0) {
    return { ...state, commandMessage: `E480: No match: ${pattern}` };
  }

  const existingList = adapter.getList(state);
  const existingItems = isAppend && existingList ? existingList.items : [];
  const mergedItems = [...existingItems, ...items];
  const shouldJump = !flags.includes('j');
  const jumpIndex =
    isAppend && adapter.vimgrepOptions?.jumpIndexOnAppend === 'newFirst'
      ? existingItems.length
      : 0;

  const nextState = setErrorList(state, mergedItems, false, adapter);
  if (shouldJump) {
    return jumpToErrorListItem(nextState, jumpIndex, adapter);
  }
  const noJumpMsg = adapter.vimgrepOptions?.noJumpMessage?.(mergedItems.length);
  return noJumpMsg ? { ...nextState, commandMessage: noJumpMsg } : nextState;
}

export function loadErrorListFromFile(
  state: VimEditorState,
  filename: string,
  jumpToFirst: boolean,
  adapter: ErrorListAdapter
): VimEditorState {
  const cleanName = filename.trim();
  if (cleanName.length === 0) {
    return { ...state, commandMessage: 'E471: Argument required' };
  }

  const synced = syncCurrentBuffer(state);
  let targetLines: string[] | undefined;

  const buf = synced.buffers?.find((b) => b.name === cleanName);
  if (buf) {
    targetLines = buf.lines;
  } else if (synced.netrw?.files?.[cleanName]) {
    targetLines = synced.netrw.files[cleanName];
  } else if (
    cleanName === synced.primaryFilename ||
    cleanName === '%' ||
    cleanName === '[No Name]'
  ) {
    targetLines = synced.lines;
  } else if (cleanName === synced.secondaryFilename && synced.secondaryLines) {
    targetLines = synced.secondaryLines;
  } else {
    const vfs = buildVfsMap(synced);
    if (vfs[cleanName]) {
      targetLines = vfs[cleanName];
    }
  }

  if (!targetLines) {
    return {
      ...state,
      commandMessage: adapter.fileOpenFailedMessage(cleanName),
    };
  }

  const items = parseLinesWithErrorformat(targetLines, getOptions(synced).errorformat);
  if (items.length === 0) {
    return {
      ...state,
      commandMessage: adapter.fileEmptyErrorsMessage(cleanName),
    };
  }

  return setErrorList(state, items, jumpToFirst, adapter);
}

export function evalExprToErrorList(
  state: VimEditorState,
  rawExpr: string,
  mode: 'replace' | 'get' | 'add',
  callUserFn: ErrorExprUserFn,
  adapter: ErrorListAdapter
): VimEditorState {
  const expr = rawExpr.trim();
  if (!expr) {
    return { ...state, commandMessage: 'E471: Argument required', bell: true };
  }

  const evaluated = evaluateErrorExprLines(state, expr, callUserFn);
  if (!evaluated.ok) {
    return { ...state, commandMessage: evaluated.error, bell: true };
  }

  const nextState = evaluated.state;
  const parsedItems = parseLinesWithErrorformat(
    evaluated.lines,
    getOptions(nextState).errorformat
  );

  if (mode === 'add') {
    const existing = adapter.getList(nextState)?.items ?? [];
    return setErrorList(nextState, [...existing, ...parsedItems], false, adapter);
  }

  return setErrorList(nextState, parsedItems, mode === 'replace', adapter);
}

export function grepToErrorList(
  state: VimEditorState,
  rawArgs: string,
  isAppend: boolean,
  jumpToFirst: boolean,
  adapter: ErrorListAdapter
): VimEditorState {
  const res = runVfsGrep(state, rawArgs);
  if (!res.ok) {
    return { ...state, commandMessage: res.error, bell: true };
  }

  if (res.items.length === 0) {
    return { ...state, commandMessage: `E480: No match: ${res.pattern}`, bell: true };
  }

  const existingList = adapter.getList(state);
  const existing = isAppend && existingList ? existingList.items : [];
  const merged = [...existing, ...res.items];
  const jumpIdx = isAppend ? existing.length : 0;
  const nextState = setErrorList(state, merged, false, adapter);
  return jumpToFirst ? jumpToErrorListItem(nextState, jumpIdx, adapter) : nextState;
}

export function runBatchOverErrorList(
  state: VimEditorState,
  commandStr: string,
  executeCmd: (s: VimEditorState, c: string) => VimEditorState,
  isFile: boolean,
  isBang: boolean,
  adapter: ErrorListAdapter
): VimEditorState {
  const cleanCmd = commandStr.trim();
  if (!cleanCmd) {
    return {
      ...state,
      commandMessage: 'E471: Argument required',
      bell: true,
    };
  }

  const list = adapter.getList(state);
  if (!list || list.items.length === 0) {
    return {
      ...state,
      commandMessage: adapter.emptyError,
      bell: true,
    };
  }

  let targetIndices: number[] = [];
  if (isFile) {
    const seenFiles = new Set<string>();
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i];
      const fileKey = item.filename || String(item.bufferId ?? '');
      if (!seenFiles.has(fileKey)) {
        seenFiles.add(fileKey);
        targetIndices.push(i);
      }
    }
  } else {
    targetIndices = list.items.map((_, idx) => idx);
  }

  let currState = state;
  let executedCount = 0;

  for (const idx of targetIndices) {
    currState = jumpToErrorListItem(currState, idx, adapter);
    currState = executeCmd(currState, cleanCmd);
    currState = syncCurrentBuffer(currState);
    executedCount++;

    if (currState.bell) {
      if (!isBang) {
        break;
      }
      currState = { ...currState, bell: false };
    }
  }

  return {
    ...currState,
    commandMessage: adapter.batchDoneMessage(executedCount, cleanCmd, isFile),
  };
}
