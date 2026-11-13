import { VimBuffer, FuzzyFinderState, VimEditorState } from './types';
import { editBuffer, syncCurrentBuffer, ensureBuffers } from './bufferEngine';
import { splitWindow } from './splitWindow';
import { openNewTab } from './tabEngine';
import { buildVfsMap } from './vfs';
import { msg } from './messages';

export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
  indices: number[];
}

/**
 * 대소문자 무시 퍼지 매칭 알고리즘
 * 연속 일치, 단어 경계(/, _, -, .) 일치 등에 가중치를 주어 스코어를 계산합니다.
 */
export function fuzzyMatch(pattern: string, target: string): FuzzyMatchResult {
  const p = pattern.trim().toLowerCase();
  const t = target.toLowerCase();

  if (!p) {
    return { matches: true, score: 0, indices: [] };
  }
  if (p.length > t.length) {
    return { matches: false, score: 0, indices: [] };
  }

  const indices: number[] = [];
  let pIdx = 0;
  let score = 0;
  let prevMatchIdx = -2;

  for (let tIdx = 0; tIdx < t.length && pIdx < p.length; tIdx++) {
    if (t[tIdx] === p[pIdx]) {
      indices.push(tIdx);

      let charScore = 1;

      // 1. 연속 일치 보너스
      if (tIdx === prevMatchIdx + 1) {
        charScore += 6;
      }

      // 2. 단어 경계 보너스 (첫 글자 또는 구분자 직후)
      if (tIdx === 0 || '/_-. '.includes(target[tIdx - 1])) {
        charScore += 8;
      }

      // 3. 파일명 부분(마지막 / 이후) 일치 보너스
      const lastSlash = target.lastIndexOf('/');
      if (lastSlash >= 0 && tIdx > lastSlash) {
        charScore += 4;
      }

      score += charScore;
      prevMatchIdx = tIdx;
      pIdx++;
    }
  }

  if (pIdx < p.length) {
    return { matches: false, score: 0, indices: [] };
  }

  // 짧은 경로 우대
  score += Math.max(0, 40 - target.length);

  return { matches: true, score, indices };
}

export interface FuzzyFileItem {
  path: string;
  score: number;
  indices: number[];
}

export function searchFilesFuzzy(
  files: Record<string, string[]>,
  query: string
): FuzzyFileItem[] {
  const allPaths = Object.keys(files).filter(
    (p) => !p.startsWith('Netrw') && !p.startsWith('/')
  );
  const results: FuzzyFileItem[] = [];

  for (const path of allPaths) {
    const res = fuzzyMatch(query, path);
    if (res.matches) {
      results.push({ path, score: res.score, indices: res.indices });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export interface FuzzyBufferItem {
  buffer: VimBuffer;
  score: number;
  indices: number[];
}

export function searchBuffersFuzzy(
  buffers: VimBuffer[],
  query: string
): FuzzyBufferItem[] {
  const cleanBuffers = buffers.filter((b) => !b.name.startsWith('Netrw'));
  const results: FuzzyBufferItem[] = [];

  for (const buf of cleanBuffers) {
    const res = fuzzyMatch(query, buf.name);
    if (res.matches) {
      results.push({ buffer: buf, score: res.score, indices: res.indices });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * 퍼지 파인더 팝업을 엽니다 (:Files, :Buffers, :find).
 */
export function openFuzzyFinder(
  state: VimEditorState,
  mode: 'files' | 'buffers' = 'files'
): VimEditorState {
  const synced = syncCurrentBuffer(ensureBuffers(state));
  const vfs = state.virtualFiles
    ? { ...state.virtualFiles }
    : buildVfsMap(synced);

  const finderState: FuzzyFinderState = {
    isOpen: true,
    mode,
    query: '',
    selectedIndex: 0,
  };

  return {
    ...synced,
    virtualFiles: vfs,
    fuzzyFinder: finderState,
    commandMessage: undefined,
  };
}

/**
 * 퍼지 파인더 팝업을 닫습니다 (Esc).
 */
export function closeFuzzyFinder(state: VimEditorState): VimEditorState {
  if (!state.fuzzyFinder?.isOpen) return state;
  return {
    ...state,
    fuzzyFinder: null,
    commandMessage: msg('퍼지 파인더 닫힘'),
  };
}

/**
 * 퍼지 파인더 검색어를 갱신하고 선택 인덱스를 초기화합니다.
 */
export function updateFuzzyFinderQuery(
  state: VimEditorState,
  query: string
): VimEditorState {
  if (!state.fuzzyFinder) return state;
  return {
    ...state,
    fuzzyFinder: {
      ...state.fuzzyFinder,
      query,
      selectedIndex: 0,
    },
  };
}

/**
 * 퍼지 파인더에서 항목 선택을 위/아래로 이동합니다.
 */
export function moveFuzzyFinderSelection(
  state: VimEditorState,
  delta: number
): VimEditorState {
  if (!state.fuzzyFinder?.isOpen) return state;

  const mode = state.fuzzyFinder.mode;
  const vfs = state.virtualFiles ?? {};
  const total =
    mode === 'files'
      ? searchFilesFuzzy(vfs, state.fuzzyFinder.query).length
      : searchBuffersFuzzy(state.buffers ?? [], state.fuzzyFinder.query).length;

  if (total === 0) return state;

  const cur = state.fuzzyFinder.selectedIndex;
  const next = Math.max(0, Math.min(total - 1, cur + delta));

  return {
    ...state,
    fuzzyFinder: {
      ...state.fuzzyFinder,
      selectedIndex: next,
    },
  };
}

/**
 * 선택된 퍼지 파인더 항목을 열거나 분할 창으로 엽니다.
 */
export function selectFuzzyFinderItem(
  state: VimEditorState,
  action: 'open' | 'vsplit' | 'split' | 'tab' = 'open'
): VimEditorState {
  if (!state.fuzzyFinder?.isOpen) return state;

  const mode = state.fuzzyFinder.mode;
  const query = state.fuzzyFinder.query;
  const selectedIdx = state.fuzzyFinder.selectedIndex;
  const vfs = state.virtualFiles ?? {};

  let targetPath = '';
  if (mode === 'files') {
    const results = searchFilesFuzzy(vfs, query);
    if (results.length === 0) {
      return closeFuzzyFinder(state);
    }
    targetPath = results[selectedIdx]?.path ?? results[0].path;
  } else {
    const results = searchBuffersFuzzy(state.buffers ?? [], query);
    if (results.length === 0) {
      return closeFuzzyFinder(state);
    }
    targetPath = results[selectedIdx]?.buffer.name ?? results[0].buffer.name;
  }

  const closedState = {
    ...state,
    fuzzyFinder: null,
  };

  const fileLines = vfs[targetPath] ?? [''];

  if (action === 'vsplit') {
    const splitted = splitWindow(closedState, 'vertical', fileLines, targetPath);
    return {
      ...splitted,
      commandMessage: msg('[퍼지 파인더] 열기: {path}', { path: targetPath }),
    };
  }
  if (action === 'split') {
    const splitted = splitWindow(closedState, 'horizontal', fileLines, targetPath);
    return {
      ...splitted,
      commandMessage: msg('[퍼지 파인더] 열기: {path}', { path: targetPath }),
    };
  }
  if (action === 'tab') {
    const tabbed = openNewTab(closedState, targetPath);
    return {
      ...tabbed,
      lines: [...fileLines],
      cursor: { line: 0, col: 0 },
      commandMessage: msg('[퍼지 파인더] 열기: {path}', { path: targetPath }),
    };
  }

  // 기본 open (현재 버퍼에서 열기)
  const edited = editBuffer(closedState, targetPath);
  const updated = {
    ...edited,
    lines: vfs[targetPath] ? [...vfs[targetPath]] : edited.lines,
    commandMessage: msg('[퍼지 파인더] 열기: {path}', { path: targetPath }),
  };
  return syncCurrentBuffer(updated);
}

/**
 * 순정 Ex 명령 :find {filename} 실행
 */
export function executeFindFileCommand(
  state: VimEditorState,
  rawPath: string
): VimEditorState {
  const query = rawPath.trim();
  if (!query) {
    // 인자 없는 :find 는 대화형 퍼지 파인더 팝업 열기
    return openFuzzyFinder(state, 'files');
  }

  const synced = syncCurrentBuffer(ensureBuffers(state));
  const vfs = synced.virtualFiles
    ? { ...synced.virtualFiles }
    : buildVfsMap(synced);

  // 1. 정확한 경로 일치 확인
  if (vfs[query]) {
    const edited = editBuffer({ ...synced, virtualFiles: vfs }, query);
    return syncCurrentBuffer({
      ...edited,
      lines: [...vfs[query]],
      commandMessage: msg('"{filePath}" 열림', { filePath: query }),
    });
  }

  // 2. 퍼지/서브스트링 매칭 시도
  const matched = searchFilesFuzzy(vfs, query);
  if (matched.length > 0) {
    const bestPath = matched[0].path;
    const edited = editBuffer({ ...synced, virtualFiles: vfs }, bestPath);
    return syncCurrentBuffer({
      ...edited,
      lines: [...(vfs[bestPath] ?? [''])],
      commandMessage: msg('"{filePath}" 열림', { filePath: bestPath }),
    });
  }

  return {
    ...synced,
    virtualFiles: vfs,
    bell: true,
    commandMessage: msg('E345: 찾을 수 없습니다: {path}', { path: query }),
  };
}

/**
 * 퍼지 파인더 팝업이 열려 있을 때 키 입력을 처리합니다.
 */
export function handleFuzzyFinderKey(
  state: VimEditorState,
  key: string
): VimEditorState {
  if (!state.fuzzyFinder?.isOpen) return state;

  // 닫기
  if (key === '<Esc>' || key === 'Escape' || key === '<C-c>' || key === 'Ctrl-c') {
    return closeFuzzyFinder(state);
  }

  // 선택 열기 (Enter)
  if (key === '<CR>' || key === 'Enter' || key === '\r' || key === '\n') {
    return selectFuzzyFinderItem(state, 'open');
  }

  // 수직 분할 열기 (Ctrl-v)
  if (key === '<C-v>' || key === 'Ctrl-v') {
    return selectFuzzyFinderItem(state, 'vsplit');
  }

  // 수평 분할 열기 (Ctrl-s, Ctrl-x)
  if (key === '<C-s>' || key === 'Ctrl-s' || key === '<C-x>' || key === 'Ctrl-x') {
    return selectFuzzyFinderItem(state, 'split');
  }

  // 새 탭 열기 (Ctrl-t)
  if (key === '<C-t>' || key === 'Ctrl-t') {
    return selectFuzzyFinderItem(state, 'tab');
  }

  // 아래로 이동
  if (
    key === '<Down>' ||
    key === 'ArrowDown' ||
    key === '<C-j>' ||
    key === 'Ctrl-j' ||
    key === '<C-n>' ||
    key === 'Ctrl-n'
  ) {
    return moveFuzzyFinderSelection(state, 1);
  }

  // 위로 이동
  if (
    key === '<Up>' ||
    key === 'ArrowUp' ||
    key === '<C-k>' ||
    key === 'Ctrl-k' ||
    key === '<C-p>' ||
    key === 'Ctrl-p'
  ) {
    return moveFuzzyFinderSelection(state, -1);
  }

  // 백스페이스
  if (key === '<BS>' || key === 'Backspace') {
    const cur = state.fuzzyFinder.query;
    return updateFuzzyFinderQuery(state, cur.slice(0, -1));
  }

  // 일반 문자 타이핑 (1자)
  if (key.length === 1 && !key.startsWith('<')) {
    const cur = state.fuzzyFinder.query;
    return updateFuzzyFinderQuery(state, cur + key);
  }

  return state;
}
