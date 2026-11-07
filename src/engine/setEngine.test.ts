import { describe, it, expect } from 'vitest';
import {
  getOptions,
  executeSetCommand,
} from './setEngine';
import { VimEditorState } from '../types/vim';
import { findMatches } from './search';
import { handleKey } from './vimEngine';

describe('setEngine (:set Option System)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: ['const Hello = "world";', 'const hello = "VIM";'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
  });

  describe('getOptions & default values', () => {
    it('state.options가 없을 때 기본 VimOptions를 반환한다', () => {
      const state = createBaseState();
      const opts = getOptions(state);
      expect(opts.number).toBe(true);
      expect(opts.relativenumber).toBe(false);
      expect(opts.ignorecase).toBe(false);
      expect(opts.smartcase).toBe(false);
      expect(opts.hlsearch).toBe(true);
      expect(opts.wrap).toBe(true);
      expect(opts.cursorline).toBe(true);
      expect(opts.wildmenu).toBe(true);
      expect(opts.tabstop).toBe(2);
      expect(opts.shiftwidth).toBe(2);
    });
  });

  describe('executeSetCommand boolean toggles & assignments', () => {
    it(':set wildmenu / :set nowildmenu 및 :set wmenu', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'nowildmenu');
      expect(state.options?.wildmenu).toBe(false);

      state = executeSetCommand(state, 'wmenu');
      expect(state.options?.wildmenu).toBe(true);
    });
    it(':set nu / :set nonu 및 :set rnu / :set nornu', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'rnu');
      expect(state.options?.relativenumber).toBe(true);

      state = executeSetCommand(state, 'nornu');
      expect(state.options?.relativenumber).toBe(false);

      state = executeSetCommand(state, 'nonu');
      expect(state.options?.number).toBe(false);

      state = executeSetCommand(state, 'nu');
      expect(state.options?.number).toBe(true);
    });

    it(':set opt! (느낌표 토글)', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'rnu!');
      expect(state.options?.relativenumber).toBe(true);

      state = executeSetCommand(state, 'rnu!');
      expect(state.options?.relativenumber).toBe(false);
    });

    it(':set ic / :set noic 및 :set scs / :set noscs', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ic');
      expect(state.options?.ignorecase).toBe(true);

      state = executeSetCommand(state, 'scs');
      expect(state.options?.smartcase).toBe(true);

      state = executeSetCommand(state, 'noic noscs');
      expect(state.options?.ignorecase).toBe(false);
      expect(state.options?.smartcase).toBe(false);
    });

    it(':set ts=4 sw=4 (숫자 설정)', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ts=4 sw=4');
      expect(state.options?.tabstop).toBe(4);
      expect(state.options?.shiftwidth).toBe(4);
    });

    it('한 번에 여러 옵션 동시 적용 (:set nu rnu ic ts=4)', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'nu rnu ic ts=4');
      expect(state.options?.number).toBe(true);
      expect(state.options?.relativenumber).toBe(true);
      expect(state.options?.ignorecase).toBe(true);
      expect(state.options?.tabstop).toBe(4);
    });

    it('알 수 없는 옵션 처리 시 E518 오류 반환', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'invalidOpt');
      expect(state.commandMessage).toContain('E518: 알 수 없는 옵션: invalidOpt');
    });

    it('잘못된 숫자 값 전달 시 E521 오류 반환', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ts=abc');
      expect(state.commandMessage).toContain('E521: 잘못된 숫자 인수');
    });
  });

  describe('option query & listing (:set opt?, :set, :set all)', () => {
    it(':set opt? 로 현재 옵션 상태를 조회한다', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'nu?');
      expect(state.commandMessage).toBe('number');

      state = executeSetCommand(state, 'rnu?');
      expect(state.commandMessage).toBe('norelativenumber');

      state = executeSetCommand(state, 'ts?');
      expect(state.commandMessage).toBe('tabstop=2');
    });

    it(':set all 로 모든 옵션 목록을 출력한다', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'all');
      expect(state.commandMessage).toContain('--- All Options ---');
      expect(state.commandMessage).toContain('number');
      expect(state.commandMessage).toContain('norelativenumber');
      expect(state.commandMessage).toContain('tabstop=2');
    });

    it(':set 으로 기본값과 다른 변경된 옵션 목록만 출력한다', () => {
      let state = createBaseState();
      state = executeSetCommand(state, '');
      expect(state.commandMessage).toContain('(기본값과 다른 설정이 없습니다)');

      state = executeSetCommand(state, 'rnu ic');
      state = executeSetCommand(state, '');
      expect(state.commandMessage).toContain('relativenumber');
      expect(state.commandMessage).toContain('ignorecase');
    });
  });

  describe('ignorecase & smartcase search integration', () => {
    const lines = ['const Hello = "world";', 'const hello = "VIM";'];

    it('기본(ignorecase: false) 상태에서는 대소문자를 엄격히 구분한다', () => {
      const matches = findMatches(lines, 'hello');
      expect(matches.length).toBe(1);
      expect(matches[0].line).toBe(1);
    });

    it('ignorecase: true 상태에서는 대소문자를 구분하지 않고 모두 찾는다', () => {
      const matches = findMatches(lines, 'hello', { ignorecase: true });
      expect(matches.length).toBe(2);
      expect(matches[0].line).toBe(0);
      expect(matches[1].line).toBe(1);
    });

    it('smartcase: true && ignorecase: true 일 때 소문자 쿼리는 ignorecase 적용', () => {
      const matches = findMatches(lines, 'hello', { ignorecase: true, smartcase: true });
      expect(matches.length).toBe(2);
    });

    it('smartcase: true && ignorecase: true 일 때 대문자가 포함된 쿼리는 대소문자를 구분한다', () => {
      const matches = findMatches(lines, 'Hello', { ignorecase: true, smartcase: true });
      expect(matches.length).toBe(1);
      expect(matches[0].line).toBe(0);
    });
  });

  describe('handleKey Ex command (:set) integration', () => {
    it(':set rnu Enter 를 실행하면 옵션이 활성화된다', () => {
      let state = createBaseState();
      // :set rnu Enter
      state = handleKey(state, ':');
      for (const ch of 'set rnu') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.options?.relativenumber).toBe(true);
      expect(state.commandMessage).toContain('relativenumber');
    });

    it(':set ic Enter 후 검색 시 대소문자를 무시하고 매칭한다', () => {
      let state = createBaseState();
      // :set ic Enter
      state = handleKey(state, ':');
      for (const ch of 'set ic') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');
      expect(state.options?.ignorecase).toBe(true);

      // /hello Enter
      state = handleKey(state, '/');
      for (const ch of 'hello') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      // 0번째 줄의 'Hello'에 매칭되어 커서가 이동함
      expect(state.cursor.line).toBe(0);
    });
  });
});
