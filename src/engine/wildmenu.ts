import { VimEditorState } from '../types/vim';
import { DEFAULT_VFS_FILES } from './vfs';
import { OPTION_ALIASES } from './setEngine';

/**
 * 자동완성 가능한 순정 Vim Ex 커맨드 목록
 */
export const AVAILABLE_COMMANDS: string[] = [
  'args',
  'argdo',
  'b',
  'buffer',
  'buffers',
  'bdelete',
  'bd',
  'bnext',
  'bn',
  'bprev',
  'bp',
  'changes',
  'close',
  'cclose',
  'cnext',
  'cn',
  'copen',
  'cprev',
  'cp',
  'cc',
  'config',
  'display',
  'di',
  'edit',
  'e',
  'export',
  'Explore',
  'E',
  'global',
  'g',
  'jumps',
  'ls',
  'marks',
  'next',
  'n',
  'norm',
  'normal',
  'only',
  'prev',
  'quit',
  'q',
  'registers',
  'reg',
  'set',
  'sort',
  'source',
  'so',
  'split',
  'sp',
  'substitute',
  's',
  'tabclose',
  'tabnew',
  'tabnext',
  'tabn',
  'tabprev',
  'tabp',
  'vimrc',
  'vsplit',
  'vsp',
  'write',
  'wq',
  'w',
  'x',
];

/**
 * 자동완성 가능한 순정 :set 옵션 목록 (긍정 및 부정형 no- 포함)
 */
export const AVAILABLE_OPTIONS: string[] = [
  'all',
  'cursorline',
  'expandtab',
  'hlsearch',
  'ignorecase',
  'list',
  'nocursorline',
  'noexpandtab',
  'nohlsearch',
  'noignorecase',
  'nolist',
  'nonumber',
  'norelativenumber',
  'nosmartcase',
  'nowildmenu',
  'nowrap',
  'number',
  'relativenumber',
  'shiftwidth',
  'smartcase',
  'tabstop',
  'wildmenu',
  'wrap',
];

/**
 * 현재 에디터 상태에서 파일 목록을 조회합니다.
 */
export function getAvailableFiles(state: VimEditorState): string[] {
  const fileSet = new Set<string>();

  // 1. 기본 VFS 파일
  for (const f of Object.keys(DEFAULT_VFS_FILES)) {
    fileSet.add(f);
  }

  // 2. Netrw 가상 파일
  if (state.netrw?.files) {
    for (const f of Object.keys(state.netrw.files)) {
      fileSet.add(f);
    }
  }

  // 3. 열려 있는 버퍼 파일명
  if (state.buffers) {
    for (const b of state.buffers) {
      if (b.name && !b.name.startsWith('Netrw')) {
        fileSet.add(b.name);
      }
    }
  }

  // 4. 시스템 설정 파일
  fileSet.add('~/.vimrc');
  fileSet.add('.vimrc');

  return Array.from(fileSet).sort();
}

/**
 * 현재 에디터 상태에서 열려 있는 버퍼 목록을 조회합니다.
 */
export function getAvailableBuffers(state: VimEditorState): string[] {
  const bufSet = new Set<string>();

  if (state.buffers && state.buffers.length > 0) {
    for (const b of state.buffers) {
      if (b.name) bufSet.add(b.name);
    }
  } else if (state.primaryFilename) {
    bufSet.add(state.primaryFilename);
  }

  return Array.from(bufSet).sort();
}

/**
 * 현재 입력된 커맨드라인 문자열에 대한 자동완성 접두사(prefix) 및 후보 목록(candidates)을 계산합니다.
 */
export function calculateCompletions(
  state: VimEditorState,
  input: string
): { prefix: string; candidates: string[] } | null {
  // 공백이 없는 경우: 커맨드 이름 자체 자동완성
  if (!input.includes(' ')) {
    if (!input) {
      return { prefix: '', candidates: [...AVAILABLE_COMMANDS] };
    }
    const lower = input.toLowerCase();
    const matched = AVAILABLE_COMMANDS.filter((cmd) => cmd.toLowerCase().startsWith(lower));
    if (matched.length === 0) return null;
    return { prefix: '', candidates: matched };
  }

  // 첫 공백을 기준으로 커맨드와 인수 분리
  const spaceIdx = input.indexOf(' ');
  const cmd = input.slice(0, spaceIdx).trim().toLowerCase();
  const rest = input.slice(spaceIdx + 1);

  // 1. :set 옵션 자동완성
  if (cmd === 'set' || cmd === 'se') {
    // 다중 옵션 지정 시 마지막 단어 기준
    const lastSpace = rest.lastIndexOf(' ');
    const prefix = lastSpace >= 0 ? `set ${rest.slice(0, lastSpace + 1)}` : 'set ';
    const arg = (lastSpace >= 0 ? rest.slice(lastSpace + 1) : rest).toLowerCase();

    const matchedSet = new Set<string>();

    for (const opt of AVAILABLE_OPTIONS) {
      if (opt.toLowerCase().startsWith(arg)) {
        matchedSet.add(opt);
      }
    }

    // 별칭(Alias) 검사: e.g. 'rnu' -> 'relativenumber', 'nu' -> 'number'
    for (const [alias, canonical] of Object.entries(OPTION_ALIASES)) {
      if (alias.toLowerCase().startsWith(arg) || alias.toLowerCase() === arg) {
        matchedSet.add(canonical);
      }
      const noAlias = `no${alias}`;
      if (noAlias.toLowerCase().startsWith(arg) || noAlias.toLowerCase() === arg) {
        matchedSet.add(`no${canonical}`);
      }
    }

    const matched = Array.from(matchedSet).sort();
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 2. 버퍼 관련 커맨드 (:b, :buffer, :bd, :bdelete, :bn, :bp 등)
  if (cmd === 'b' || cmd === 'buffer' || cmd === 'bd' || cmd === 'bdelete') {
    const prefix = `${cmd} `;
    const arg = rest.toLowerCase();
    const allBuffers = getAvailableBuffers(state);

    let matched = allBuffers.filter((b) => b.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allBuffers.filter((b) => b.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  // 3. 파일 관련 커맨드 (:e, :edit, :sp, :split, :vsp, :vsplit, :so, :source)
  if (
    cmd === 'e' ||
    cmd === 'edit' ||
    cmd === 'sp' ||
    cmd === 'split' ||
    cmd === 'vsp' ||
    cmd === 'vsplit' ||
    cmd === 'so' ||
    cmd === 'source'
  ) {
    const prefix = `${cmd} `;
    const arg = rest.toLowerCase();
    const allFiles = getAvailableFiles(state);

    let matched = allFiles.filter((f) => f.toLowerCase().startsWith(arg));
    if (matched.length === 0 && arg) {
      matched = allFiles.filter((f) => f.toLowerCase().includes(arg));
    }
    if (matched.length === 0) return null;
    return { prefix, candidates: matched };
  }

  return null;
}

/**
 * Tab 또는 Shift-Tab 키 입력 시 와일드메뉴 자동완성을 처리합니다.
 */
export function handleTabCompletion(
  state: VimEditorState,
  reverse = false
): VimEditorState {
  // 이미 와일드메뉴가 활성화되어 있는 경우 -> 후보 순환 (Cycle)
  if (state.wildmenu?.active && state.wildmenu.candidates.length > 0) {
    const { candidates, prefix, selectedIndex } = state.wildmenu;
    const len = candidates.length;
    const nextIndex = reverse ? (selectedIndex - 1 + len) % len : (selectedIndex + 1) % len;
    const nextCandidate = candidates[nextIndex];

    return {
      ...state,
      commandBuffer: `${prefix}${nextCandidate}`,
      wildmenu: {
        ...state.wildmenu,
        selectedIndex: nextIndex,
      },
    };
  }

  // 새로운 자동완성 세션 시작
  const rawInput = state.commandBuffer ?? '';
  const result = calculateCompletions(state, rawInput);

  if (!result || result.candidates.length === 0) {
    return state;
  }

  const { prefix, candidates } = result;
  const initialIndex = reverse ? candidates.length - 1 : 0;
  const initialCandidate = candidates[initialIndex];

  return {
    ...state,
    commandBuffer: `${prefix}${initialCandidate}`,
    wildmenu: {
      active: true,
      candidates,
      selectedIndex: initialIndex,
      originalBuffer: rawInput,
      prefix,
    },
  };
}

/**
 * 와일드메뉴 세션을 취소하고 원래 입력 내용으로 복원합니다.
 */
export function cancelWildmenu(
  state: VimEditorState,
  restoreOriginal = true
): VimEditorState {
  if (!state.wildmenu?.active) return state;

  const original = restoreOriginal ? state.wildmenu.originalBuffer : state.commandBuffer;
  return {
    ...state,
    commandBuffer: original,
    wildmenu: null,
  };
}

/**
 * 와일드메뉴 세션을 종료하고 현재 완성된 커맨드라인을 확정합니다.
 */
export function acceptWildmenu(state: VimEditorState): VimEditorState {
  if (!state.wildmenu) return state;
  return {
    ...state,
    wildmenu: null,
  };
}
