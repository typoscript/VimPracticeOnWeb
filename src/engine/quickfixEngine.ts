import { QuickfixItem, QuickfixState, VimEditorState } from '../types/vim';
import { switchBuffer, syncCurrentBuffer } from './bufferEngine';
import { compileVimRegex } from './vimRegex';

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

  // :vimgrep 패턴은 순정 Vim 정규식 ('ignorecase' / 'smartcase' 적용)
  const regexOpts = { ignorecase: state.options?.ignorecase, smartcase: state.options?.smartcase };
  try {
    compileVimRegex(pattern, regexOpts);
  } catch {
    return { ...state, commandMessage: `E486: Pattern not found: ${pattern}`, bell: true };
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
        const lineRegex = compileVimRegex(pattern, { ...regexOpts, flags: 'g' });
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
        const m = lineText.match(compileVimRegex(pattern, regexOpts));
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

/**
 * 에러 로그 텍스트 줄을 파싱하여 Quickfix 항목 목록을 생성합니다.
 * 지원 형식:
 * 1) filename:line:col: message
 * 2) filename:line: message
 * 3) filename(line,col): message
 */
export function parseQuickfixErrorLines(lines: string[]): QuickfixItem[] {
  const items: QuickfixItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // 1. filename:line:col: message
    const match1 = trimmed.match(/^([^:\s]+):(\d+):(\d+):\s*(.*)$/);
    if (match1) {
      const filename = match1[1];
      const lineNum = parseInt(match1[2], 10);
      const colNum = parseInt(match1[3], 10);
      const text = match1[4] || '';
      const type = /error/i.test(text) ? 'E' : /warn/i.test(text) ? 'W' : 'I';
      items.push({ filename, line: lineNum, col: colNum, text, type });
      continue;
    }

    // 2. filename:line: message
    const match2 = trimmed.match(/^([^:\s]+):(\d+):\s*(.*)$/);
    if (match2) {
      const filename = match2[1];
      const lineNum = parseInt(match2[2], 10);
      const text = match2[3] || '';
      const type = /error/i.test(text) ? 'E' : /warn/i.test(text) ? 'W' : 'I';
      items.push({ filename, line: lineNum, col: 1, text, type });
      continue;
    }

    // 3. filename(line,col): message
    const match3 = trimmed.match(/^([^:\s\(]+)\((\d+),(\d+)\):\s*(.*)$/);
    if (match3) {
      const filename = match3[1];
      const lineNum = parseInt(match3[2], 10);
      const colNum = parseInt(match3[3], 10);
      const text = match3[4] || '';
      const type = /error/i.test(text) ? 'E' : /warn/i.test(text) ? 'W' : 'I';
      items.push({ filename, line: lineNum, col: colNum, text, type });
      continue;
    }
  }

  return items;
}

/**
 * 파일(또는 가상 파일 시스템)의 에러 로그를 읽어 퀵픽스 목록을 로드합니다. (:cfile, :cgetfile)
 */
export function loadQuickfixFromFile(
  state: VimEditorState,
  filename: string,
  jumpToFirst = true
): VimEditorState {
  const cleanName = filename.trim();
  if (cleanName.length === 0) {
    return { ...state, commandMessage: 'E471: Argument required' };
  }

  // 파일 줄 내용 찾기 (버퍼 목록, Netrw VFS, 현재 버퍼 등)
  let targetLines: string[] | undefined = undefined;

  const buf = state.buffers?.find((b) => b.name === cleanName);
  if (buf) {
    targetLines = buf.lines;
  } else if (state.netrw?.files?.[cleanName]) {
    targetLines = state.netrw.files[cleanName];
  } else if (cleanName === state.primaryFilename || cleanName === '%' || cleanName === '[No Name]') {
    targetLines = state.lines;
  } else if (cleanName === state.secondaryFilename && state.secondaryLines) {
    targetLines = state.secondaryLines;
  }

  if (!targetLines) {
    return {
      ...state,
      commandMessage: `E484: 파일을 열 수 없습니다: ${cleanName}`,
    };
  }

  const items = parseQuickfixErrorLines(targetLines);
  if (items.length === 0) {
    return {
      ...state,
      commandMessage: `E42: 에러 목록이 비어 있습니다: ${cleanName}`,
    };
  }

  return setQuickfixList(state, items, jumpToFirst);
}
