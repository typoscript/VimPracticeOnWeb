import { describe, it, expect } from 'vitest';
import {
  generateVimrc,
  generateInitLua,
  generateVSCodeSettings,
  generateIdeaVimrc,
  downloadConfigFile,
} from './configGenerator';

describe('configGenerator', () => {
  const sampleOptions = {
    relativenumber: true,
    theme: 'tokyonight',
    leaderKey: ' ',
    activePresets: {
      jkEsc: true,
      leaderW: true,
      hlLineMove: true,
      ctrlWindowNav: true,
    },
    customKeymaps: [{ mode: 'normal', from: '<leader>d', to: '"_d' }],
  };

  it('.vimrc 생성이 올바른 Vim 스크립트 구문을 포함한다', () => {
    const vimrc = generateVimrc(sampleOptions);
    expect(vimrc).toContain('set relativenumber');
    expect(vimrc).toContain('colorscheme tokyonight');
    expect(vimrc).toContain('inoremap jk <Esc>');
    expect(vimrc).toContain('nnoremap <leader>w :w<CR>');
    expect(vimrc).toContain('nnoremap H ^');
    expect(vimrc).toContain('nnoremap <C-h> <C-w>h');
    expect(vimrc).toContain('nnoremap <leader>d "_d');
  });

  it('init.lua 생성이 Neovim vim.keymap.set 구문을 포함한다', () => {
    const lua = generateInitLua(sampleOptions);
    expect(lua).toContain('opt.relativenumber = true');
    expect(lua).toContain('vim.g.mapleader = " "');
    expect(lua).toContain("map('i', 'jk', '<Esc>'");
    expect(lua).toContain("map('n', '<leader>w', '<cmd>write<cr>'");
    expect(lua).toContain("map('n', 'H', '^'");
  });

  it('settings.json 생성이 유효한 VS Code Vim JSON을 생성한다', () => {
    const jsonStr = generateVSCodeSettings(sampleOptions);
    const parsed = JSON.parse(jsonStr);

    expect(parsed['editor.lineNumbers']).toBe('relative');
    expect(parsed['vim.leader']).toBe('<space>');
    expect(parsed['vim.insertModeKeyBindings']).toContainEqual({
      before: ['j', 'k'],
      after: ['<Esc>'],
    });
    expect(parsed['vim.normalModeKeyBindingsNonRecursive']).toContainEqual({
      before: ['H'],
      after: ['^'],
    });
  });

  it('.ideavimrc 생성이 IntelliJ IdeaVim 옵션 및 플러그인을 포함한다', () => {
    const ideavim = generateIdeaVimrc(sampleOptions);
    expect(ideavim).toContain('set surround');
    expect(ideavim).toContain('set multiple-cursors');
    expect(ideavim).toContain('set relativenumber');
    expect(ideavim).toContain('inoremap jk <Esc>');
    expect(ideavim).toContain('nnoremap <leader>w :w<CR>');
  });

  it('downloadConfigFile 함수가 오류 없이 boolean을 반환한다', () => {
    const res = downloadConfigFile('test.vim', 'set number');
    expect(typeof res).toBe('boolean');
  });
});
