import { VimEditorState } from '../types/vim';

/**
 * 기본 가상 파일 시스템(VFS) 맵 (프로젝트 워크스페이스 전용)
 */
export const DEFAULT_VFS_FILES: Record<string, string[]> = {
  'src/main.ts': [
    'console.log("Hello from main.ts");',
    'export const APP_NAME = "VimPractice";',
  ],
  'src/utils.ts': [
    'export function add(a: number, b: number) {',
    '  return a + b;',
    '}',
  ],
  'package.json': [
    '{',
    '  "name": "vim-practice-on-web",',
    '  "version": "1.0.0"',
    '}',
  ],
  'README.md': [
    '# Vim Practice on Web',
    'Pure Vim experience right in your browser.',
  ],
};

/**
 * 기본 ~/.vimrc 설정 파일 내용
 */
export const DEFAULT_VIMRC_CONTENT: string[] = [
  '" =============================================================================',
  '" VimPracticeOnWeb .vimrc 설정 파일',
  '" =============================================================================',
  'set number',
  'set relativenumber',
  'set ignorecase',
  'set smartcase',
  'set hlsearch',
  'set tabstop=2',
  'set shiftwidth=2',
  'set expandtab',
  'inoremap jk <Esc>',
  'nnoremap <leader>w :w<CR>',
];

/**
 * 가상 파일 시스템 또는 시스템 기본 파일에서 파일 내용을 가져옵니다.
 */
export function getVfsFile(
  customFiles: Record<string, string[]> | undefined,
  filename: string
): string[] | undefined {
  if (customFiles && customFiles[filename]) {
    return customFiles[filename];
  }
  if (DEFAULT_VFS_FILES[filename]) {
    return DEFAULT_VFS_FILES[filename];
  }
  if (filename === '~/.vimrc' || filename === '.vimrc' || filename === 'vimrc') {
    return DEFAULT_VIMRC_CONTENT;
  }
  return undefined;
}

/**
 * 현재 버퍼 및 기본 파일들로부터 VFS 파일 맵을 구성합니다.
 */
export function buildVfsMap(state: VimEditorState): Record<string, string[]> {
  const map: Record<string, string[]> = { ...DEFAULT_VFS_FILES };

  if (state.buffers && state.buffers.length > 0) {
    for (const b of state.buffers) {
      if (b.name && !b.name.startsWith('Netrw') && !b.name.startsWith('~')) {
        map[b.name] = [...b.lines];
      }
    }
  }

  const curName = state.primaryFilename;
  if (curName && !curName.startsWith('Netrw') && !curName.startsWith('~')) {
    map[curName] = [...state.lines];
  }

  return map;
}

/**
 * 지정된 가상 경로(currentPath)의 파일 및 디렉터리 목록을 생성합니다.
 */
export function getDirectoryListing(
  files: Record<string, string[]>,
  currentPath: string
): { dirs: string[]; files: string[] } {
  const prefix = currentPath ? (currentPath.endsWith('/') ? currentPath : `${currentPath}/`) : '';
  const dirSet = new Set<string>();
  const fileSet = new Set<string>();

  for (const filePath of Object.keys(files)) {
    if (prefix === '' || filePath.startsWith(prefix)) {
      const rest = filePath.slice(prefix.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx >= 0) {
        dirSet.add(rest.slice(0, slashIdx));
      } else if (rest.length > 0) {
        fileSet.add(rest);
      }
    }
  }

  return {
    dirs: Array.from(dirSet).sort(),
    files: Array.from(fileSet).sort(),
  };
}
