/**
 * 앱 전용 데모 데이터: vim-engine 은 이 데이터를 직접 알지 못하며,
 * main.tsx 와 테스트 setup 에서 configureVimEngine() 으로 넘겨줍니다.
 */

/**
 * VimPracticeOnWeb 데모 워크스페이스 파일 (:e, :Explore, ctags, 자동완성에서 사용)
 */
export const DEMO_WORKSPACE_FILES: Record<string, string[]> = {
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
 * 데모 ~/.vimrc 내용
 */
export const DEMO_VIMRC: string[] = [
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
