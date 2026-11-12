import { describe, it, expect } from 'vitest';
import {
  getOptions,
  executeSetCommand,
} from './setEngine';
import { VimEditorState } from './types';
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

  describe(':setlocal, :setglobal and buffer options isolation', () => {
    it(':setlocal 은 현재 버퍼의 로컬 옵션만 변경한다', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ts=4 sw=4 nonu', 'local');

      expect(state.bufferLocalOptions?.[1]?.tabstop).toBe(4);
      expect(state.bufferLocalOptions?.[1]?.shiftwidth).toBe(4);
      expect(state.bufferLocalOptions?.[1]?.number).toBe(false);

      // 전역 옵션은 변경되지 않고 기본값 유지
      expect(state.globalOptions?.tabstop).toBe(2);
      expect(state.globalOptions?.number).toBe(true);

      // 현재 유효 옵션(getOptions)에는 반영됨
      const eff = getOptions(state);
      expect(eff.tabstop).toBe(4);
      expect(eff.shiftwidth).toBe(4);
      expect(eff.number).toBe(false);
    });

    it(':setglobal 은 전역 옵션만 변경하고 로컬 오버라이드에는 영향을 주지 않는다', () => {
      let state = createBaseState();
      // 먼저 버퍼 1에 로컬 오버라이드 설정
      state = executeSetCommand(state, 'ts=4', 'local');
      expect(getOptions(state).tabstop).toBe(4);

      // 전역 옵션을 8로 변경
      state = executeSetCommand(state, 'ts=8 sw=8', 'global');
      expect(state.globalOptions?.tabstop).toBe(8);
      expect(state.globalOptions?.shiftwidth).toBe(8);

      // 버퍼 1은 ts=4 로컬 오버라이드가 있으므로 여전히 ts=4, sw는 오버라이드가 없으므로 전역 8 적용
      const eff = getOptions(state);
      expect(eff.tabstop).toBe(4);
      expect(eff.shiftwidth).toBe(8);
    });

    it(':setlocal 과 :setglobal 조회 (:setlocal, :setglobal 인자 없음)', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ts=4', 'local');

      const localList = executeSetCommand(state, '', 'local');
      expect(localList.commandMessage).toContain('--- Local Options ---');
      expect(localList.commandMessage).toContain('tabstop=4');

      const globalList = executeSetCommand(state, '', 'global');
      expect(globalList.commandMessage).toContain('--- Global Options ---');
    });

    it(':setlocal opt? 및 :setglobal opt? 로 개별 조회', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'ts=4', 'local');
      state = executeSetCommand(state, 'ts=8', 'global');

      const localQuery = executeSetCommand(state, 'ts?', 'local');
      expect(localQuery.commandMessage).toBe('tabstop=4');

      const globalQuery = executeSetCommand(state, 'ts?', 'global');
      expect(globalQuery.commandMessage).toBe('tabstop=8');
    });

    it('버퍼 전환 시 버퍼별 로컬 옵션이 격리 및 보존된다', () => {
      let state: VimEditorState = {
        lines: ['Buffer 1 line'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        currentBufferId: 1,
        buffers: [
          { id: 1, name: 'buf1.txt', lines: ['Buffer 1 line'], cursor: { line: 0, col: 0 } },
          { id: 2, name: 'buf2.txt', lines: ['Buffer 2 line'], cursor: { line: 0, col: 0 } },
        ],
      };

      // 버퍼 1에서 :setlocal ts=4
      state = executeSetCommand(state, 'ts=4', 'local');
      expect(getOptions(state).tabstop).toBe(4);

      // :b 2 로 전환
      state = handleKey(state, ':');
      for (const ch of 'b 2') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      // 버퍼 2는 기본값인 ts=2
      expect(state.currentBufferId).toBe(2);
      expect(getOptions(state).tabstop).toBe(2);

      // 버퍼 2에서 :setlocal sw=8
      state = executeSetCommand(state, 'sw=8', 'local');
      expect(getOptions(state).shiftwidth).toBe(8);

      // :b 1 로 복귀
      state = handleKey(state, ':');
      for (const ch of 'b 1') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      // 버퍼 1은 이전 설정인 ts=4, sw는 기본 2
      expect(state.currentBufferId).toBe(1);
      expect(getOptions(state).tabstop).toBe(4);
      expect(getOptions(state).shiftwidth).toBe(2);
    });
  });
});
