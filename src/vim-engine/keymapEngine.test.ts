import { describe, it, expect } from 'vitest';
import {
  parseKeySequence,
  formatKeymapsList,
  registerKeymap,
  unregisterKeymap,
  resolveKeymap,
  isKeymapPrefix,
} from './keymapEngine';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { VimEditorState } from './types';

describe('keymapEngine: Pure Vim Keymap Interpreter', () => {
  describe('parseKeySequence', () => {
    it('특수 키 표기법(<CR>, <Esc>, <Space>, <leader>, <Tab>, <BS>)을 정확히 파싱한다', () => {
      expect(parseKeySequence(':w<CR>')).toEqual([':', 'w', 'Enter']);
      expect(parseKeySequence('<Esc>')).toEqual(['Escape']);
      expect(parseKeySequence('<Space>w')).toEqual([' ', 'w']);
      expect(parseKeySequence('<leader>q', '\\')).toEqual(['\\', 'q']);
      expect(parseKeySequence('<Tab>')).toEqual(['Tab']);
      expect(parseKeySequence('<S-Tab>')).toEqual(['Shift-Tab']);
      expect(parseKeySequence('<BS>')).toEqual(['Backspace']);
    });

    it('컨트롤 키 조합(<C-w>, <C-r>, Ctrl-w h)을 정확히 파싱한다', () => {
      expect(parseKeySequence('<C-w>h')).toEqual(['Ctrl-w', 'h']);
      expect(parseKeySequence('<C-r>="test"<CR>')).toEqual([
        'Ctrl-r',
        '=',
        '"',
        't',
        'e',
        's',
        't',
        '"',
        'Enter',
      ]);
      expect(parseKeySequence('Ctrl-w h')).toEqual(['Ctrl-w', 'h']);
      expect(parseKeySequence('Ctrl-w l')).toEqual(['Ctrl-w', 'l']);
    });

    it('멀티 키 및 오퍼레이터 시퀀스(y$, "_dd, "+y, ggVG)를 파싱한다', () => {
      expect(parseKeySequence('y$')).toEqual(['y', '$']);
      expect(parseKeySequence('"_dd')).toEqual(['"', '_', 'd', 'd']);
      expect(parseKeySequence('"+y')).toEqual(['"', '+', 'y']);
      expect(parseKeySequence('ggVG')).toEqual(['g', 'g', 'V', 'G']);
    });

    it('<nop> 표기법은 빈 토큰으로 무시된다', () => {
      expect(parseKeySequence('<nop>')).toEqual([]);
      expect(parseKeySequence('<Nop>')).toEqual([]);
    });
  });

  describe('registerKeymap and unregisterKeymap', () => {
    const baseState: VimEditorState = {
      lines: ['first line', 'second line'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      leaderKey: ' ',
    };

    it(':nnoremap 으로 노멀 모드 키매핑을 등록할 수 있다', () => {
      const s = registerKeymap(baseState, 'nnoremap', 'Y', 'y$');
      expect(s.userKeymaps?.['n:Y']).toBe('y$');
      expect(s.commandMessage).toContain('[키매핑 등록] nnoremap: Y -> y$');
    });

    it(':inoremap 으로 입력 모드 키매핑을 등록할 수 있다', () => {
      const s = registerKeymap(baseState, 'inoremap', 'jk', '<Esc>');
      expect(s.userKeymaps?.['i:jk']).toBe('<Esc>');
      expect(s.commandMessage).toContain('[키매핑 등록] inoremap: jk -> <Esc>');
    });

    it(':vnoremap 으로 비주얼 모드 키매핑을 등록할 수 있다', () => {
      const s = registerKeymap(baseState, 'vnoremap', '<leader>y', '"+y');
      expect(s.userKeymaps?.['v:<leader>y']).toBe('"+y');
      expect(s.userKeymaps?.['v: y']).toBe('"+y');
    });

    it(':nunmap 으로 노멀 모드 키매핑만 선별 해제한다', () => {
      let s = registerKeymap(baseState, 'nnoremap', 'Y', 'y$');
      s = registerKeymap(s, 'inoremap', 'Y', 'hello');

      s = unregisterKeymap(s, 'nunmap', 'Y');
      expect(s.userKeymaps?.['n:Y']).toBeUndefined();
      expect(s.userKeymaps?.['i:Y']).toBe('hello');
      expect(s.commandMessage).toContain('[키매핑 해제] nunmap: Y');
    });

    it('존재하지 않는 키매핑 해제 시 E31 오류를 반환한다', () => {
      const s = unregisterKeymap(baseState, 'nunmap', 'nonexistent');
      expect(s.commandMessage).toContain('E31: 매핑을 찾을 수 없습니다: nonexistent');
    });
  });

  describe('formatKeymapsList', () => {
    it('등록된 키매핑 목록을 모드별로 정돈하여 반환한다', () => {
      const state: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        userKeymaps: {
          'n:<leader>w': ':w<CR>',
          'i:jk': '<Esc>',
          'v:Y': 'y',
        },
      };

      const allList = formatKeymapsList(state, 'all');
      expect(allList).toContain('n');
      expect(allList).toContain('<leader>w');
      expect(allList).toContain('i');
      expect(allList).toContain('jk');

      const normalList = formatKeymapsList(state, 'n');
      expect(normalList).toContain('Normal');
      expect(normalList).toContain('<leader>w');
      expect(normalList).not.toContain('jk');
    });

    it('키매핑이 없을 때 안내 메시지를 반환한다', () => {
      const state: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      expect(formatKeymapsList(state, 'n')).toContain('정의된 일반 (Normal) 키 매핑이 없습니다');
    });
  });

  describe('resolveKeymap & isKeymapPrefix', () => {
    const state: VimEditorState = {
      lines: [''],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      leaderKey: ' ',
      userKeymaps: {
        'n:<leader>sv': ':vsplit<CR>',
        'i:jk': '<Esc>',
      },
    };

    it('resolveKeymap 이 <leader> 또는 공백으로 등록된 키를 정확히 찾는다', () => {
      expect(resolveKeymap(state, 'n', '<leader>sv')).toBe(':vsplit<CR>');
      expect(resolveKeymap(state, 'n', ' sv')).toBe(':vsplit<CR>');
      expect(resolveKeymap(state, 'i', 'jk')).toBe('<Esc>');
      expect(resolveKeymap(state, 'v', 'jk')).toBeNull();
    });

    it('isKeymapPrefix 가 접두사 여부를 정확히 판별한다', () => {
      expect(isKeymapPrefix(state, 'n', '<leader>')).toBe(true);
      expect(isKeymapPrefix(state, 'n', ' ')).toBe(true);
      expect(isKeymapPrefix(state, 'n', '<leader>s')).toBe(true);
      expect(isKeymapPrefix(state, 'n', '<leader>sv')).toBe(false);
      expect(isKeymapPrefix(state, 'i', 'j')).toBe(true);
      expect(isKeymapPrefix(state, 'i', 'k')).toBe(false);
    });
  });

  describe('Integration with Vim Engine Key Execution', () => {
    it(':nnoremap Y y$ 등록 후 Y 입력 시 커서부터 줄 끝까지 yank 된다', () => {
      let state: VimEditorState = {
        lines: ['const token = "MY_SECRET";', 'const target = "";'],
        cursor: { line: 0, col: 14 }, // "MY_SECRET"의 따옴표 위치
        mode: 'NORMAL',
      };

      state = executeCommandLine(state, 'nnoremap Y y$');
      expect(state.userKeymaps?.['n:Y']).toBe('y$');

      // 'Y' 키 누름 -> y$ 실행
      state = handleKey(state, 'Y');
      expect(state.clipboard?.content).toBe('"MY_SECRET";');

      // 'j' 로 다음 줄로 이동 후 'p' 로 붙여넣기
      state = handleKey(state, 'j');
      state = handleKey(state, '$');
      state = handleKey(state, 'P');
      expect(state.lines[1]).toBe('const target = """MY_SECRET";;');
    });

    it('Insert 모드에서 일반 텍스트로 확장되는 커스텀 키매핑을 실행할 수 있다', () => {
      let state: VimEditorState = {
        lines: ['hello '],
        cursor: { line: 0, col: 6 },
        mode: 'INSERT',
        userKeymaps: {
          'i:jj': 'world',
        },
      };

      state = handleKey(state, 'j');
      expect(state.lines[0]).toBe('hello j');
      expect(state.pendingKeys).toBe('j');

      state = handleKey(state, 'j');
      expect(state.lines[0]).toBe('hello world');
      expect(state.cursor.col).toBe(11);
    });

    it('커맨드라인에서 :nmap 만 입력하면 키매핑 목록 메시지가 표시된다', () => {
      let state: VimEditorState = {
        lines: ['test'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        userKeymaps: {
          'n:H': '^',
          'n:L': '$',
        },
      };

      state = executeCommandLine(state, 'nmap');
      expect(state.commandMessage).toContain('--- 키 매핑 목록 (Normal) ---');
      expect(state.commandMessage).toContain('H');
      expect(state.commandMessage).toContain('L');
    });
  });
});
