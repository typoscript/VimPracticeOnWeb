import { describe, it, expect } from 'vitest';
import { sourceScript } from './sourceEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';
import { generateVimrc } from '../utils/configGenerator';

describe('sourceEngine (:source, :so, :e ~/.vimrc, :vimrc modal)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: ['console.log("hello");'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'app.ts',
  });

  describe('editing .vimrc (:e ~/.vimrc, :e .vimrc)', () => {
    it(':e ~/.vimrc 실행 시 VFS에서 .vimrc 설정 내용이 버퍼로 로드된다', () => {
      let state = createBaseState();
      // :e ~/.vimrc Enter
      state = handleKey(state, ':');
      for (const ch of 'e ~/.vimrc') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.primaryFilename).toBe('~/.vimrc');
      expect(state.lines.some((l) => l.includes('set number'))).toBe(true);
      expect(state.lines.some((l) => l.includes('inoremap jk <Esc>'))).toBe(true);
    });

    it(':e .vimrc 실행 시에도 동일하게 .vimrc 설정 내용이 로드된다', () => {
      let state = createBaseState();
      state = handleKey(state, ':');
      for (const ch of 'e .vimrc') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.primaryFilename).toBe('.vimrc');
      expect(state.lines.some((l) => l.includes('set relativenumber'))).toBe(true);
    });
  });

  describe('sourcing script (:so %, :source ~/.vimrc)', () => {
    it(':so % 는 현재 버퍼의 설정 라인들을 파싱하여 에디터 상태에 즉시 적용한다', () => {
      let state: VimEditorState = {
        lines: [
          '" My custom vimrc',
          'set relativenumber',
          'set ignorecase',
          'set smartcase',
          'set tabstop=4',
          'set shiftwidth=4',
          'inoremap jj <Esc>',
          'let mapleader = " "',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: '.vimrc',
      };

      state = sourceScript(state, '%');

      expect(state.options?.relativenumber).toBe(true);
      expect(state.options?.ignorecase).toBe(true);
      expect(state.options?.smartcase).toBe(true);
      expect(state.options?.tabstop).toBe(4);
      expect(state.options?.shiftwidth).toBe(4);
      expect(state.userKeymaps?.['jj']).toBe('Escape');
      expect(state.leaderKey).toBe(' ');
      expect(state.commandMessage).toContain('적용 완료 (sourced successfully)');
    });

    it(':source ~/.vimrc 는 VFS의 .vimrc 파일을 찾아 환경 옵션을 일괄 적용한다', () => {
      let state = createBaseState();
      state = sourceScript(state, '~/.vimrc');

      expect(state.options?.number).toBe(true);
      expect(state.options?.relativenumber).toBe(true);
      expect(state.options?.ignorecase).toBe(true);
      expect(state.options?.smartcase).toBe(true);
      expect(state.options?.tabstop).toBe(2);
      expect(state.userKeymaps?.['jk']).toBe('Escape');
      expect(state.commandMessage).toContain('"~/.vimrc"');
      expect(state.commandMessage).toContain('적용 완료');
    });

    it('존재하지 않는 파일을 소싱하면 E484 오류를 반환한다', () => {
      const state = createBaseState();
      const res = sourceScript(state, 'nonexistent.vim');
      expect(res.commandMessage).toContain('E484: 파일을 열 수 없습니다: "nonexistent.vim"');
    });
  });

  describe('Ex commands integration (:vimrc, :config, :export, :so)', () => {
    it(':vimrc 또는 :export 입력 시 showConfigModal 이 true 로 설정된다', () => {
      let state = createBaseState();
      // :vimrc Enter
      state = handleKey(state, ':');
      for (const ch of 'vimrc') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.showConfigModal).toBe(true);
      expect(state.commandMessage).toContain('내보내기/다운로드 창 열림');

      // :export Enter
      state = { ...state, showConfigModal: false };
      state = handleKey(state, ':');
      for (const ch of 'export') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.showConfigModal).toBe(true);

      // :keymap Enter
      state = { ...state, showConfigModal: false };
      state = handleKey(state, ':');
      for (const ch of 'keymap') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.showConfigModal).toBe(true);
    });

    it(':so ~/.vimrc Enter 입력 시 명령행에서 바로 소싱이 실행된다', () => {
      let state = createBaseState();
      state = handleKey(state, ':');
      for (const ch of 'so ~/.vimrc') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.options?.relativenumber).toBe(true);
      expect(state.commandMessage).toContain('적용 완료');
    });

    it(':e ~/.vimrc -> :so % -> Ctrl-^ 워크플로우로 설정을 소싱하고 원래 버퍼로 복귀한다', () => {
      let state = createBaseState();

      // 1. :e ~/.vimrc
      state = handleKey(state, ':');
      for (const ch of 'e ~/.vimrc') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');
      expect(state.primaryFilename).toBe('~/.vimrc');

      // 2. :so %
      state = handleKey(state, ':');
      for (const ch of 'so %') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');
      expect(state.options?.relativenumber).toBe(true);
      expect(state.options?.ignorecase).toBe(true);

      // 3. Ctrl-^ 복귀
      state = handleKey(state, 'Ctrl-^');
      expect(state.primaryFilename).toBe('app.ts');
      expect(state.options?.relativenumber).toBe(true);
      expect(state.options?.ignorecase).toBe(true);
    });
  });

  describe('generateVimrc options synchronization', () => {
    it('에디터 옵션(tabstop, ignorecase 등)이 generateVimrc 출력에 반영된다', () => {
      const content = generateVimrc({
        relativenumber: true,
        theme: 'tokyonight',
        leaderKey: ' ',
        activePresets: { jkEsc: true },
        options: {
          tabstop: 4,
          shiftwidth: 4,
          ignorecase: true,
          smartcase: true,
        },
      });

      expect(content).toContain('set tabstop=4');
      expect(content).toContain('set shiftwidth=4');
      expect(content).toContain('set ignorecase');
      expect(content).toContain('set smartcase');
      expect(content).toContain('inoremap jk <Esc>');
    });
  });
});
