import { QuickfixItem, QuickfixState, VimEditorState } from '../types/vim';
import { switchBuffer, syncCurrentBuffer } from './bufferEngine';

/**
 * 퀵픽스(Quickfix) 목록을 설정합니다.
 */
export function setQuickfixList(
  state: VimEditorState,
  items: QuickfixItem[],
  jumpToFirst = true
): VimEditorState {
  const currentQf = state.quickfix;
  const nextQf: QuickfixState = {
    items,
    currentIndex: 0,
    isOpen: currentQf?.isOpen ?? false,
    height: currentQf?.height,
  };

  const nextState: VimEditorState = {
    ...state,
    quickfix: nextQf,
    commandMessage: `(${items.length} of ${items.length}) 퀵픽스 목록 로드됨`,
  };

  if (jumpToFirst && items.length > 0) {
    return jumpToQuickfixItem(nextState, 0);
  }

  return nextState;
}

/**
 * 지정된 인덱스(0-based)의 퀵픽스 항목 위치(파일, 라인, 컬럼)로 에디터 커서를 점프합니다.
 */
export function jumpToQuickfixItem(state: VimEditorState, index: number): VimEditorState {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return { ...state, commandMessage: 'E42: No Errors' };
  }
  if (index < 0 || index >= qf.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  const item = qf.items[index];
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

  return {
    ...targetState,
    cursor: { line: lineIdx, col: colIdx },
    quickfix: {
      ...qf,
      currentIndex: index,
    },
    commandMessage: `(${index + 1} of ${qf.items.length}): ${item.filename}:${item.line}:${item.col} ${item.text}`,
  };
}

/**
 * 다음 퀵픽스 에러 항목으로 이동합니다 (:cnext, :cn, [count]cn).
 */
export function nextQuickfix(state: VimEditorState, count = 1): VimEditorState {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return { ...state, commandMessage: 'E42: No Errors' };
  }

  const step = Math.max(1, count);
  const nextIdx = qf.currentIndex + step;
  if (nextIdx >= qf.items.length) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToQuickfixItem(state, nextIdx);
}

/**
 * 이전 퀵픽스 에러 항목으로 이동합니다 (:cprev, :cp, :cprevious, [count]cp).
 */
export function prevQuickfix(state: VimEditorState, count = 1): VimEditorState {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return { ...state, commandMessage: 'E42: No Errors' };
  }

  const step = Math.max(1, count);
  const prevIdx = qf.currentIndex - step;
  if (prevIdx < 0) {
    return { ...state, commandMessage: 'E553: No more items' };
  }

  return jumpToQuickfixItem(state, prevIdx);
}

/**
 * 첫 번째 퀵픽스 항목으로 이동합니다 (:cfirst, :cr, :crewind).
 */
export function firstQuickfix(state: VimEditorState): VimEditorState {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return { ...state, commandMessage: 'E42: No Errors' };
  }
  return jumpToQuickfixItem(state, 0);
}

/**
 * 마지막 퀵픽스 항목으로 이동합니다 (:clast, :cla).
 */
export function lastQuickfix(state: VimEditorState): VimEditorState {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return { ...state, commandMessage: 'E42: No Errors' };
  }
  return jumpToQuickfixItem(state, qf.items.length - 1);
}

/**
 * 퀵픽스 윈도우를 엽니다 (:copen [height], :cope).
 */
export function openQuickfixWindow(state: VimEditorState, height?: number): VimEditorState {
  const qf = state.quickfix ?? { items: [], currentIndex: 0, isOpen: false };
  return {
    ...state,
    quickfix: {
      ...qf,
      isOpen: true,
      height: height ?? qf.height ?? 6,
    },
    commandMessage: `퀵픽스 윈도우 열림 (${qf.items.length}개 항목)`,
  };
}

/**
 * 퀵픽스 윈도우를 닫습니다 (:cclose, :ccl).
 */
export function closeQuickfixWindow(state: VimEditorState): VimEditorState {
  if (!state.quickfix || !state.quickfix.isOpen) return state;
  return {
    ...state,
    quickfix: {
      ...state.quickfix,
      isOpen: false,
    },
    commandMessage: '퀵픽스 윈도우 닫힘',
  };
}

/**
 * 퀵픽스 목록에 에러가 있으면 창을 열고, 없으면 닫습니다 (:cwindow [height], :cw).
 */
export function toggleQuickfixWindow(state: VimEditorState, height?: number): VimEditorState {
  const qf = state.quickfix;
  if (qf && qf.items.length > 0) {
    return openQuickfixWindow(state, height);
  } else {
    return closeQuickfixWindow(state);
  }
}

/**
 * 퀵픽스 목록을 문자열로 포맷팅합니다 (:clist, :cl).
 */
export function formatQuickfixList(state: VimEditorState): string {
  const qf = state.quickfix;
  if (!qf || qf.items.length === 0) {
    return 'E42: No Errors';
  }

  return qf.items
    .map((item, idx) => {
      const activeMark = idx === qf.currentIndex ? '>' : ' ';
      return `${activeMark} ${idx + 1} | ${item.filename}:${item.line}:${item.col} | ${item.text}`;
    })
    .join('\n');
}

/**
 * 프로젝트 및 버퍼 내에서 정규식 패턴을 검색하여 퀵픽스 목록을 구성합니다 (:vimgrep, :vimgrepadd).
 * 구문: :vimgrep /pattern/[flags] {file}
 */
export function vimgrep(
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
    // /pattern/[flags] [files] 형태
    const match = trimmed.match(/^\/((?:\\\/|[^\/])+)\/([a-z]*)(?:\s+(.*))?$/i);
    if (!match) {
      return { ...state, commandMessage: 'E486: Pattern not found' };
    }
    pattern = match[1];
    flags = match[2];
    fileTarget = match[3]?.trim() || '%';
  } else {
    // 슬래시가 없는 단순 단어 검색: pattern [files]
    const parts = trimmed.split(/\s+/);
    pattern = parts[0];
    fileTarget = parts.slice(1).join(' ') || '%';
  }

  try {
    new RegExp(pattern, flags.includes('g') ? 'g' : '');
  } catch {
    return { ...state, commandMessage: `E486: Pattern not found: ${pattern}` };
  }

  // 검색 대상 버퍼 리스트 추출
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
  } else if (
    fileTarget === '*' ||
    fileTarget === '*.*' ||
    fileTarget === '**' ||
    fileTarget === 'all'
  ) {
    if (synced.buffers && synced.buffers.length > 0) {
      for (const b of synced.buffers) {
        targets.push({ id: b.id, name: b.name, lines: b.lines });
      }
    } else {
      targets.push({
        id: synced.currentBufferId,
        name: currentBufName,
        lines: synced.lines,
      });
    }
  } else {
    // 특정 파일명
    const matchedBuf = synced.buffers?.find((b) => b.name === fileTarget);
    if (matchedBuf) {
      targets.push({ id: matchedBuf.id, name: matchedBuf.name, lines: matchedBuf.lines });
    } else {
      targets.push({
        id: synced.currentBufferId,
        name: currentBufName,
        lines: synced.lines,
      });
    }
  }

  // 매칭 검색 수행
  const items: QuickfixItem[] = [];
  for (const t of targets) {
    for (let lineIdx = 0; lineIdx < t.lines.length; lineIdx++) {
      const lineText = t.lines[lineIdx];
      if (flags.includes('g')) {
        const lineRegex = new RegExp(pattern, 'g');
        let m: RegExpExecArray | null;
        while ((m = lineRegex.exec(lineText)) !== null) {
          items.push({
            filename: t.name,
            bufferId: t.id,
            line: lineIdx + 1,
            col: m.index + 1,
            text: lineText.trim(),
          });
          if (m.index === lineRegex.lastIndex) {
            lineRegex.lastIndex++;
          }
        }
      } else {
        const m = lineText.match(new RegExp(pattern));
        if (m && m.index !== undefined) {
          items.push({
            filename: t.name,
            bufferId: t.id,
            line: lineIdx + 1,
            col: m.index + 1,
            text: lineText.trim(),
          });
        }
      }
    }
  }

  if (items.length === 0) {
    return {
      ...state,
      commandMessage: `E480: No match: ${pattern}`,
    };
  }

  const existingItems = isAppend && state.quickfix ? state.quickfix.items : [];
  const mergedItems = [...existingItems, ...items];
  const shouldJump = !flags.includes('j');
  const jumpIndex = isAppend ? existingItems.length : 0;

  const nextState = setQuickfixList(state, mergedItems, false);

  if (shouldJump) {
    return jumpToQuickfixItem(nextState, jumpIndex);
  } else {
    return {
      ...nextState,
      commandMessage: `(${mergedItems.length} matches found)`,
    };
  }
}
