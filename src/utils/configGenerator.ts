import { VimOptions } from '../vim-engine';

export type ConfigPlatform = 'vimrc' | 'initLua' | 'vscode' | 'ideaVim';

export interface KeymapPreset {
  id: string;
  title: string;
  description: string;
  mode: 'insert' | 'normal';
  from: string;
  to: string;
  defaultActive: boolean;
}

export const DEFAULT_KEYMAP_PRESETS: KeymapPreset[] = [
  {
    id: 'jkEsc',
    title: 'jk -> <Esc>',
    description: 'Insert 모드에서 홈 포지션을 벗어나지 않고 빠르게 Normal 모드로 복귀합니다.',
    mode: 'insert',
    from: 'jk',
    to: '<Esc>',
    defaultActive: true,
  },
  {
    id: 'jjEsc',
    title: 'jj -> <Esc>',
    description: 'Insert 모드에서 j를 두 번 연타하여 즉시 Normal 모드로 복귀합니다.',
    mode: 'insert',
    from: 'jj',
    to: '<Esc>',
    defaultActive: false,
  },
  {
    id: 'leaderW',
    title: '<Space>w -> :w (빠른 저장)',
    description: '스페이스바(리더 키) + w로 버퍼를 즉시 저장합니다.',
    mode: 'normal',
    from: '<leader>w',
    to: ':w',
    defaultActive: true,
  },
  {
    id: 'leaderQ',
    title: '<Space>q -> :q (빠른 종료/창 닫기)',
    description: '스페이스바(리더 키) + q로 현재 파일이나 분할 창을 즉시 닫습니다.',
    mode: 'normal',
    from: '<leader>q',
    to: ':q',
    defaultActive: true,
  },
  {
    id: 'hlLineMove',
    title: 'H -> ^, L -> $ (줄 시작/끝 고속 점프)',
    description: '대문자 H로 첫 글자(^), 대문자 L로 줄 끝($)으로 즉시 점프합니다.',
    mode: 'normal',
    from: 'H',
    to: '^',
    defaultActive: true,
  },
  {
    id: 'ctrlWindowNav',
    title: 'Ctrl+h/j/k/l -> 창 분할 이동',
    description: 'Ctrl+w 조합 없이 Ctrl+h/j/k/l만으로 분할 창 사이를 즉시 이동합니다.',
    mode: 'normal',
    from: 'Ctrl-h',
    to: 'Ctrl-w h',
    defaultActive: true,
  },
  {
    id: 'leaderBlackhole',
    title: '<Space>d -> "_d (블랙홀 레지스터 삭제)',
    description: '기존 복사(Yank) 레지스터를 보존한 채 삭제를 수행합니다.',
    mode: 'normal',
    from: '<leader>d',
    to: '"_d',
    defaultActive: false,
  },
];

export interface ConfigExportOptions {
  relativenumber: boolean;
  theme: string;
  leaderKey: string; // " " or "\\" or ","
  activePresets: Record<string, boolean>;
  customKeymaps?: Array<{ mode: string; from: string; to: string }>;
  options?: Partial<VimOptions>;
}

/**
 * 1. .vimrc (표준 Vim 스크립트) 생성
 */
export function generateVimrc(options: ConfigExportOptions): string {
  const leaderChar = options.leaderKey === ' ' ? '<Space>' : options.leaderKey;
  const lines: string[] = [
    `" =============================================================================`,
    `" VimPracticeOnWeb 자동 생성 설정 (.vimrc)`,
    `" 생성일: ${new Date().toISOString().slice(0, 10)}`,
    `" =============================================================================`,
    ``,
    `" [기본 환경 설정]`,
    `set nocompatible`,
    `set encoding=utf-8`,
    `set autoindent`,
    `set smartindent`,
    `set tabstop=${options.options?.tabstop ?? 2}`,
    `set shiftwidth=${options.options?.shiftwidth ?? 2}`,
    `${options.options?.expandtab ?? true ? 'set expandtab' : 'set noexpandtab'}`,
    `${options.options?.hlsearch ?? true ? 'set hlsearch' : 'set nohlsearch'}`,
    `set incsearch`,
    `${options.options?.ignorecase ? 'set ignorecase' : 'set noignorecase'}`,
    `${options.options?.smartcase ? 'set smartcase' : 'set nosmartcase'}`,
    `${options.options?.wrap ?? true ? 'set wrap' : 'set nowrap'}`,
    `${options.options?.cursorline ?? true ? 'set cursorline' : 'set nocursorline'}`,
    `set clipboard=unnamedplus,unnamed`,
    ``,
    `" [줄 번호 설정]`,
    `${options.options?.number ?? true ? 'set number' : 'set nonumber'}`,
    `${options.options?.relativenumber ?? options.relativenumber ? 'set relativenumber' : 'set norelativenumber'}`,
    ``,
    `" [구문 강조 및 컬러 테마]`,
    `syntax on`,
    `set termguicolors`,
    `" 추천 테마 플러그인 설정 예시 (vim-plug / packer)`,
    `colorscheme ${options.theme || 'tokyonight'}`,
    ``,
    `" [리더 키(Leader Key) 설정]`,
    `let mapleader = "${leaderChar}"`,
    `let g:mapleader = "${leaderChar}"`,
    ``,
    `" [커스텀 키매핑 프리셋]`,
  ];

  if (options.activePresets['jkEsc']) {
    lines.push(`inoremap jk <Esc>`);
  }
  if (options.activePresets['jjEsc']) {
    lines.push(`inoremap jj <Esc>`);
  }
  if (options.activePresets['leaderW']) {
    lines.push(`nnoremap <leader>w :w<CR>`);
  }
  if (options.activePresets['leaderQ']) {
    lines.push(`nnoremap <leader>q :q<CR>`);
  }
  if (options.activePresets['hlLineMove']) {
    lines.push(`nnoremap H ^`);
    lines.push(`nnoremap L $`);
  }
  if (options.activePresets['ctrlWindowNav']) {
    lines.push(`nnoremap <C-h> <C-w>h`);
    lines.push(`nnoremap <C-j> <C-w>j`);
    lines.push(`nnoremap <C-k> <C-w>k`);
    lines.push(`nnoremap <C-l> <C-w>l`);
  }
  if (options.activePresets['leaderBlackhole']) {
    lines.push(`nnoremap <leader>d "_d`);
  }

  if (options.customKeymaps && options.customKeymaps.length > 0) {
    lines.push(``, `" [런타임 추가 커스텀 매핑]`);
    options.customKeymaps.forEach((m) => {
      const cmd = m.mode === 'insert' ? 'inoremap' : 'nnoremap';
      lines.push(`${cmd} ${m.from} ${m.to}`);
    });
  }

  return lines.join('\n');
}

/**
 * 2. init.lua (Neovim Lua 설정) 생성
 */
export function generateInitLua(options: ConfigExportOptions): string {
  const leaderChar = options.leaderKey;
  const lines: string[] = [
    `-- =============================================================================`,
    `-- VimPracticeOnWeb 자동 생성 설정 (init.lua - Neovim)`,
    `-- 생성일: ${new Date().toISOString().slice(0, 10)}`,
    `-- =============================================================================`,
    ``,
    `-- [기본 에디터 옵션]`,
    `local opt = vim.opt`,
    `opt.number = ${options.options?.number ?? true}`,
    `opt.relativenumber = ${options.options?.relativenumber ?? options.relativenumber}`,
    `opt.autoindent = true`,
    `opt.smartindent = true`,
    `opt.tabstop = ${options.options?.tabstop ?? 2}`,
    `opt.shiftwidth = ${options.options?.shiftwidth ?? 2}`,
    `opt.expandtab = ${options.options?.expandtab ?? true}`,
    `opt.hlsearch = ${options.options?.hlsearch ?? true}`,
    `opt.incsearch = true`,
    `opt.ignorecase = ${options.options?.ignorecase ?? true}`,
    `opt.smartcase = ${options.options?.smartcase ?? true}`,
    `opt.clipboard = "unnamedplus"`,
    `opt.termguicolors = true`,
    ``,
    `-- [리더 키(Leader Key) 설정]`,
    `vim.g.mapleader = "${leaderChar === '"' ? '\\"' : leaderChar}"`,
    `vim.g.maplocalleader = "${leaderChar === '"' ? '\\"' : leaderChar}"`,
    ``,
    `-- [키매핑 헬퍼 함수]`,
    `local map = vim.keymap.set`,
    ``,
    `-- [커스텀 키매핑 프리셋]`,
  ];

  if (options.activePresets['jkEsc']) {
    lines.push(`map('i', 'jk', '<Esc>', { desc = 'Insert 모드 빠른 탈출' })`);
  }
  if (options.activePresets['jjEsc']) {
    lines.push(`map('i', 'jj', '<Esc>', { desc = 'Insert 모드 빠른 탈출' })`);
  }
  if (options.activePresets['leaderW']) {
    lines.push(`map('n', '<leader>w', '<cmd>write<cr>', { desc = '빠른 파일 저장' })`);
  }
  if (options.activePresets['leaderQ']) {
    lines.push(`map('n', '<leader>q', '<cmd>quit<cr>', { desc = '빠른 창 닫기' })`);
  }
  if (options.activePresets['hlLineMove']) {
    lines.push(`map('n', 'H', '^', { desc = '줄 첫 글자로 이동' })`);
    lines.push(`map('n', 'L', '$', { desc = '줄 끝으로 이동' })`);
  }
  if (options.activePresets['ctrlWindowNav']) {
    lines.push(`map('n', '<C-h>', '<C-w>h', { desc = '왼쪽 분할 창으로 이동' })`);
    lines.push(`map('n', '<C-j>', '<C-w>j', { desc = '아래쪽 분할 창으로 이동' })`);
    lines.push(`map('n', '<C-k>', '<C-w>k', { desc = '위쪽 분할 창으로 이동' })`);
    lines.push(`map('n', '<C-l>', '<C-w>l', { desc = '오른쪽 분할 창으로 이동' })`);
  }
  if (options.activePresets['leaderBlackhole']) {
    lines.push(`map('n', '<leader>d', '"_d', { desc = '블랙홀 레지스터 삭제' })`);
  }

  if (options.customKeymaps && options.customKeymaps.length > 0) {
    lines.push(``, `-- [런타임 추가 커스텀 매핑]`);
    options.customKeymaps.forEach((m) => {
      const modeKey = m.mode === 'insert' ? 'i' : 'n';
      lines.push(`map('${modeKey}', '${m.from}', '${m.to}')`);
    });
  }

  return lines.join('\n');
}

/**
 * 3. settings.json (VS Code vscodevim.vim 전용) 생성
 */
export function generateVSCodeSettings(options: ConfigExportOptions): string {
  const insertBindings: Array<{ before: string[]; after: string[] }> = [];
  const normalBindings: Array<{ before: string[]; after?: string[]; commands?: string[] }> = [];

  if (options.activePresets['jkEsc']) {
    insertBindings.push({ before: ['j', 'k'], after: ['<Esc>'] });
  }
  if (options.activePresets['jjEsc']) {
    insertBindings.push({ before: ['j', 'j'], after: ['<Esc>'] });
  }

  if (options.activePresets['leaderW']) {
    normalBindings.push({ before: ['<leader>', 'w'], commands: [':w'] });
  }
  if (options.activePresets['leaderQ']) {
    normalBindings.push({ before: ['<leader>', 'q'], commands: [':q'] });
  }
  if (options.activePresets['hlLineMove']) {
    normalBindings.push({ before: ['H'], after: ['^'] });
    normalBindings.push({ before: ['L'], after: ['$'] });
  }
  if (options.activePresets['ctrlWindowNav']) {
    normalBindings.push({ before: ['<C-h>'], after: ['<C-w>', 'h'] });
    normalBindings.push({ before: ['<C-j>'], after: ['<C-w>', 'j'] });
    normalBindings.push({ before: ['<C-k>'], after: ['<C-w>', 'k'] });
    normalBindings.push({ before: ['<C-l>'], after: ['<C-w>', 'l'] });
  }
  if (options.activePresets['leaderBlackhole']) {
    normalBindings.push({ before: ['<leader>', 'd'], after: ['"', '_', 'd'] });
  }

  const leaderSetting =
    options.leaderKey === ' ' ? '<space>' : options.leaderKey;

  const configObj = {
    'vim.useSystemClipboard': true,
    'vim.hlsearch': true,
    'vim.incsearch': true,
    'vim.leader': leaderSetting,
    'editor.lineNumbers': options.relativenumber ? 'relative' : 'on',
    'workbench.colorTheme':
      options.theme === 'tokyonight'
        ? 'Tokyo Night'
        : options.theme === 'dracula'
        ? 'Dracula'
        : options.theme === 'gruvbox'
        ? 'Gruvbox Dark Medium'
        : 'Default Dark Modern',
    'vim.insertModeKeyBindings': insertBindings,
    'vim.normalModeKeyBindingsNonRecursive': normalBindings,
  };

  return JSON.stringify(configObj, null, 2);
}

/**
 * 4. .ideavimrc (IntelliJ / WebStorm IdeaVim 전용) 생성
 */
export function generateIdeaVimrc(options: ConfigExportOptions): string {
  const leaderChar = options.leaderKey === ' ' ? '<Space>' : options.leaderKey;
  const lines: string[] = [
    `" =============================================================================`,
    `" VimPracticeOnWeb 자동 생성 설정 (.ideavimrc - IntelliJ / WebStorm)`,
    `" 생성일: ${new Date().toISOString().slice(0, 10)}`,
    `" =============================================================================`,
    ``,
    `" [IdeaVim 내장 플러그인 에뮬레이션]`,
    `set surround`,
    `set multiple-cursors`,
    `set commentary`,
    `set argtextobj`,
    `set textobj-entire`,
    ``,
    `" [기본 옵션]`,
    `set number`,
    options.relativenumber ? `set relativenumber` : `set norelativenumber`,
    `set hlsearch`,
    `set incsearch`,
    `set ignorecase`,
    `set smartcase`,
    `set clipboard+=unnamed`,
    ``,
    `" [리더 키 설정]`,
    `let mapleader = "${leaderChar}"`,
    ``,
    `" [커스텀 키매핑]`,
  ];

  if (options.activePresets['jkEsc']) {
    lines.push(`inoremap jk <Esc>`);
  }
  if (options.activePresets['jjEsc']) {
    lines.push(`inoremap jj <Esc>`);
  }
  if (options.activePresets['leaderW']) {
    lines.push(`nnoremap <leader>w :w<CR>`);
  }
  if (options.activePresets['leaderQ']) {
    lines.push(`nnoremap <leader>q <C-w>c`);
  }
  if (options.activePresets['hlLineMove']) {
    lines.push(`nnoremap H ^`);
    lines.push(`nnoremap L $`);
  }
  if (options.activePresets['ctrlWindowNav']) {
    lines.push(`nnoremap <C-h> <C-w>h`);
    lines.push(`nnoremap <C-j> <C-w>j`);
    lines.push(`nnoremap <C-k> <C-w>k`);
    lines.push(`nnoremap <C-l> <C-w>l`);
  }
  if (options.activePresets['leaderBlackhole']) {
    lines.push(`nnoremap <leader>d "_d`);
  }

  return lines.join('\n');
}

/**
 * 텍스트 내용을 파일로 브라우저에서 다운로드합니다.
 */
export function downloadConfigFile(filename: string, content: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
