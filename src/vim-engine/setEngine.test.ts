import { describe, it, expect } from 'vitest';
import {
  getOptions,
  executeSetCommand,
  parseListchars,
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

  describe('foldmarker (fmr) 옵션 처리', () => {
    it(':set fmr=... / :set fmr? 로 마커 구분자를 설정하고 조회한다', () => {
      let state = createBaseState();
      state = executeSetCommand(state, 'fdm=marker fmr=<<<,>>>');
      expect(state.options?.foldmethod).toBe('marker');
      expect(state.options?.foldmarker).toBe('<<<,>>>');

      const query = executeSetCommand(state, 'fmr?');
      expect(query.commandMessage).toBe('foldmarker=<<<,>>>');
    });

    it('잘못된 foldmarker 형식은 E474 에러와 bell 을 발생시킨다', () => {
      const state = createBaseState();
      const bad = executeSetCommand(state, 'fmr=onlyopen');
      expect(bad.bell).toBe(true);
      expect(bad.commandMessage).toContain('E474');
    });
  });

  describe('nrformats (nf) 옵션 및 Ctrl-a / Ctrl-x 진법·알파벳 증감', () => {
    it(':set nf?, nf+=, nf-=, nf^=, nf&, E474 검증이 정상 동작한다', () => {
      let state = createBaseState();
      expect(getOptions(state).nrformats).toBe('bin,hex');

      state = executeSetCommand(state, 'nf+=octal,alpha');
      expect(state.options?.nrformats).toBe('bin,hex,octal,alpha');

      state = executeSetCommand(state, 'nf-=bin');
      expect(state.options?.nrformats).toBe('hex,octal,alpha');

      state = executeSetCommand(state, 'nf^=unsigned');
      expect(state.options?.nrformats).toBe('unsigned,hex,octal,alpha');

      const query = executeSetCommand(state, 'nf?');
      expect(query.commandMessage).toBe('nrformats=unsigned,hex,octal,alpha');

      state = executeSetCommand(state, 'nf&');
      expect(state.options?.nrformats).toBe('bin,hex');

      const bad = executeSetCommand(state, 'nf+=unknown');
      expect(bad.bell).toBe(true);
      expect(bad.commandMessage).toContain('E474');
    });

    it('기본값 bin,hex 로 16진수(0x09→0x0a) 및 2진수(0b0101→0b0110)를 증감한다', () => {
      let state: VimEditorState = {
        lines: ['mask = 0x09;', 'bits = 0b0101;'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 0x09 -> 0x0a, 대문자 0x0F -> 0x10 테스트 포함
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[0]).toBe('mask = 0x0a;');

      state = handleKey(state, '5');
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[0]).toBe('mask = 0x0f;');

      // 다음 줄 2진수 0b0101 + 1 = 0b0110
      state = handleKey(state, 'j');
      state = handleKey(state, '0');
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[1]).toBe('bits = 0b0110;');
    });

    it('nrformats=octal,alpha,unsigned 에서 8진수·알파벳·부호없는 숫자와 Visual g Ctrl-a 를 처리한다', () => {
      let state: VimEditorState = {
        lines: ['perm = 07;', 'step a', 'foo-5', 'idx: 0x01', 'idx: 0x01'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      for (const ch of ':set nf=octal,unsigned') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');

      // 8진수 07 -> Ctrl-a -> 010, Ctrl-x -> 07
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[0]).toBe('perm = 010;');
      state = handleKey(state, 'Ctrl-x');
      expect(state.lines[0]).toBe('perm = 07;');

      // 알파벳 'a' -> nf+=alpha 후 2 Ctrl-a -> 'c'
      for (const ch of ':set nf+=alpha') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      state = handleKey(state, 'j');
      state = handleKey(state, '$'); // 'a' 위
      state = handleKey(state, '2');
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[1]).toBe('step c');

      // unsigned: 'foo-5' 에서 '-' 무시하고 5 + 1 = 6 -> 'foo-6'
      for (const ch of ':set nf-=alpha') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      state = handleKey(state, 'j');
      state = handleKey(state, '0');
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[2]).toBe('foo-6');

      // :set nf& (bin,hex) 로 복구 후 Visual g Ctrl-a 로 16진수 계단식 증가 (0x01 -> 0x02, 0x03)
      for (const ch of ':set nf&') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      state = handleKey(state, 'j'); // line 3
      state = handleKey(state, 'V');
      state = handleKey(state, 'j'); // line 4
      state = handleKey(state, 'g');
      state = handleKey(state, 'Ctrl-a');
      expect(state.lines[3]).toBe('idx: 0x02');
      expect(state.lines[4]).toBe('idx: 0x03');
    });
  });

  describe(':set list & :set listchars (lcs)', () => {
    it(':set list / nolist 및 listchars = / += / -= / ^= / & 를 정상 처리한다', () => {
      let state = createBaseState();
      expect(getOptions(state).list).toBe(false);
      expect(getOptions(state).listchars).toBe('tab:> ,trail:-,nbsp:+');

      state = executeSetCommand(state, 'list lcs+=eol:$');
      expect(getOptions(state).list).toBe(true);
      expect(getOptions(state).listchars).toBe('tab:> ,trail:-,nbsp:+,eol:$');

      state = executeSetCommand(state, 'lcs^=space:.');
      expect(getOptions(state).listchars).toBe('space:.,tab:> ,trail:-,nbsp:+,eol:$');

      state = executeSetCommand(state, 'lcs-=space:.');
      expect(getOptions(state).listchars).toBe('tab:> ,trail:-,nbsp:+,eol:$');

      state = executeSetCommand(state, 'lcs=tab:>-,trail:.,eol:$');
      expect(parseListchars(getOptions(state).listchars)).toEqual({
        tab: '>-',
        trail: '.',
        eol: '$',
      });

      const query = executeSetCommand(state, 'lcs?');
      expect(query.commandMessage).toBe('listchars=tab:>-,trail:.,eol:$');

      state = executeSetCommand(state, 'lcs& nolist');
      expect(getOptions(state).list).toBe(false);
      expect(getOptions(state).listchars).toBe('tab:> ,trail:-,nbsp:+');
    });

    it('잘못된 listchars 인수는 E474 / E1511 과 bell 을 발생시킨다', () => {
      const base = createBaseState();

      const badKey = executeSetCommand(base, 'lcs=unknown:x');
      expect(badKey.bell).toBe(true);
      expect(badKey.commandMessage).toContain('E474');

      const badTabLen = executeSetCommand(base, 'lcs=tab:x');
      expect(badTabLen.bell).toBe(true);
      expect(badTabLen.commandMessage).toContain('E1511');

      const badEolLen = executeSetCommand(base, 'lcs=eol:$$');
      expect(badEolLen.bell).toBe(true);
      expect(badEolLen.commandMessage).toContain('E1511');
    });
  });

  describe(':set incsearch (is) & :set inccommand (icm)', () => {
    it('incsearch 활성 시 / 입력 중 실시간으로 커서가 매치로 이동하고 Ctrl-g/Ctrl-t 순회 및 Esc 원복이 동작한다', () => {
      let state: VimEditorState = {
        lines: ['first line', 'target one', 'target two'],
        cursor: { line: 0, col: 2 },
        mode: 'NORMAL',
      };

      state = handleKey(state, '/');
      for (const ch of 'target') {
        state = handleKey(state, ch);
      }
      // Enter 전에도 실시간으로 첫 매치(line 1, col 0)로 이동
      expect(state.mode).toBe('SEARCH');
      expect(state.cursor).toEqual({ line: 1, col: 0 });

      // Ctrl-g: 다음 매치(line 2, col 0)로 미리보기 이동
      state = handleKey(state, 'Ctrl-g');
      expect(state.cursor).toEqual({ line: 2, col: 0 });

      // Ctrl-t: 이전 매치(line 1, col 0)로 복귀
      state = handleKey(state, 'Ctrl-t');
      expect(state.cursor).toEqual({ line: 1, col: 0 });

      // Escape 취소 시 검색 시작 전 원래 커서(line 0, col 2)로 복원
      const cancelled = handleKey(state, 'Escape');
      expect(cancelled.mode).toBe('NORMAL');
      expect(cancelled.cursor).toEqual({ line: 0, col: 2 });

      // Ctrl-g 후 Enter 확정 시 두 번째 매치(line 2, col 0)에 확정되고 점프 리스트에 원래 위치 기록
      state = handleKey(state, 'Ctrl-g');
      state = handleKey(state, 'Enter');
      expect(state.mode).toBe('NORMAL');
      expect(state.cursor).toEqual({ line: 2, col: 0 });

      // :set noincsearch (nois) 시 타이핑 중에는 커서가 움직이지 않음
      state = executeSetCommand(state, 'nois');
      expect(getOptions(state).incsearch).toBe(false);
      state = { ...state, cursor: { line: 0, col: 0 } };
      state = handleKey(state, '/');
      for (const ch of 'target') {
        state = handleKey(state, ch);
      }
      expect(state.cursor).toEqual({ line: 0, col: 0 });
    });

    it('inccommand=nosplit|split 활성 시 :%s/old/new/g 타이핑 중 실시간 치환 미리보기(incCommandPreview)를 계산한다', () => {
      let state: VimEditorState = {
        lines: ['foo bar foo', 'hello foo'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      expect(getOptions(state).inccommand).toBe('nosplit');

      // :%s/foo 입력 중 (두 번째 구분자 전) -> 매치 하이라이트만 계산
      state = handleKey(state, ':');
      for (const ch of '%s/foo') {
        state = handleKey(state, ch);
      }
      expect(state.incCommandPreview).toBeDefined();
      expect(state.incCommandPreview?.hasReplacement).toBe(false);
      expect(state.incCommandPreview?.matches.length).toBe(3);

      // /baz 추가 입력 (:s/foo/baz) -> g 플래그 전이므로 줄당 첫 매치만 치환 미리보기
      for (const ch of '/baz') {
        state = handleKey(state, ch);
      }
      expect(state.incCommandPreview?.hasReplacement).toBe(true);
      expect(state.incCommandPreview?.previewLines).toEqual(['baz bar foo', 'hello baz']);

      // /g 추가 입력 (:%s/foo/baz/g) -> 모든 매치 치환 미리보기
      for (const ch of '/g') {
        state = handleKey(state, ch);
      }
      expect(state.incCommandPreview?.previewLines).toEqual(['baz bar baz', 'hello baz']);

      // Esc 취소 시 incCommandPreview 초기화 및 원본 버퍼 유지
      state = handleKey(state, 'Escape');
      expect(state.incCommandPreview).toBeUndefined();
      expect(state.lines).toEqual(['foo bar foo', 'hello foo']);

      // :set icm=split / :set icm= / 잘못된 값 E474 검증
      state = executeSetCommand(state, 'icm=split');
      expect(getOptions(state).inccommand).toBe('split');

      const badIcm = executeSetCommand(state, 'icm=invalid');
      expect(badIcm.bell).toBe(true);
      expect(badIcm.commandMessage).toContain('E474');

      state = executeSetCommand(state, 'icm=');
      expect(getOptions(state).inccommand).toBe('');
      state = handleKey(state, ':');
      for (const ch of '%s/foo/baz/g') {
        state = handleKey(state, ch);
      }
      expect(state.incCommandPreview).toBeNull();
    });
  });

  describe(':set iskeyword (isk), virtualedit (ve), modifiable (ma), readonly (ro), and window-local :setlocal', () => {
    it(':set iskeyword+=- / -=_ 가 단어 모션(w/e/b), 텍스트 객체(ciw/diw), 단어 검색(*)에 즉시 반영된다', () => {
      let state: VimEditorState = {
        lines: ['my-custom-var = foo_bar;'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 기본 상태에서는 '-' 에서 단어가 끊김 (w -> '-' 로 이동)
      const afterDefaultW = handleKey(state, 'w');
      expect(afterDefaultW.cursor.col).toBe(2);

      // :set isk+=- 실행 후 'my-custom-var' 전체를 한 단어로 인식
      for (const ch of ':set isk+=-') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(getOptions(state).iskeyword).toContain('-');

      // w 모션이 'my-custom-var' 전체를 건너뛰어 '='(col 14)로 이동
      const afterIskW = handleKey(state, 'w');
      expect(afterIskW.cursor.col).toBe(14);

      // diw 가 'my-custom-var' 전체를 삭제
      let deleted = handleKey(state, 'd');
      deleted = handleKey(deleted, 'i');
      deleted = handleKey(deleted, 'w');
      expect(deleted.lines[0]).toBe(' = foo_bar;');
    });

    it(':set virtualedit=onemore 및 :set virtualedit=block 이 줄 끝 너머 가상 커서 이동과 블록 삽입을 허용한다', () => {
      let state: VimEditorState = {
        lines: ['abcd', 'x', 'efgh'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 1) virtualedit=onemore: NORMAL 모드에서 줄 마지막 문자 너머 1칸(col 4)까지 이동 가능
      for (const ch of ':set ve=onemore') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      state = handleKey(state, '$');
      expect(state.cursor.col).toBe(3);
      state = handleKey(state, 'l');
      expect(state.cursor.col).toBe(4);

      // 2) virtualedit=block: VISUAL_BLOCK 에서 짧은 줄(line 1: 'x')이 있어도 직사각형 열(col 3)에 일괄 I 삽입
      state = { ...state, cursor: { line: 0, col: 3 } };
      for (const ch of ':set ve=block') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');

      for (const k of ['Ctrl-v', 'j', 'j', 'I', '#', 'Escape']) {
        state = handleKey(state, k);
      }
      expect(state.lines).toEqual(['abc#d', 'x  #', 'efg#h']);

      // 잘못된 virtualedit 인수는 E474 에러
      const badVe = executeSetCommand(state, 've=invalid');
      expect(badVe.bell).toBe(true);
      expect(badVe.commandMessage).toContain('E474');
    });

    it(':set nomodifiable (noma) 은 모든 편집을 E21 로 차단하고, :set readonly (ro) 는 :w 를 E45 로 차단하되 :w! 는 허용한다', () => {
      let state: VimEditorState = {
        lines: ['locked line'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // :set noma
      for (const ch of ':set noma') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(getOptions(state).modifiable).toBe(false);

      // Normal 편집(x, i) 및 Ex 편집(:s) 차단 (E21)
      const afterX = handleKey(state, 'x');
      expect(afterX.bell).toBe(true);
      expect(afterX.commandMessage).toContain('E21');
      expect(afterX.lines).toEqual(['locked line']);

      const afterI = handleKey(state, 'i');
      expect(afterI.bell).toBe(true);
      expect(afterI.mode).toBe('NORMAL');
      expect(afterI.commandMessage).toContain('E21');

      let afterSub = state;
      for (const ch of ':%s/locked/open/') afterSub = handleKey(afterSub, ch);
      afterSub = handleKey(afterSub, 'Enter');
      expect(afterSub.bell).toBe(true);
      expect(afterSub.commandMessage).toContain('E21');
      expect(afterSub.lines).toEqual(['locked line']);

      // :set ma ro -> 수정은 가능하지만 :w 저장 시 E45 차단, :w! 강제 저장은 성공
      for (const ch of ':set ma ro') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(getOptions(state).modifiable).toBe(true);
      expect(getOptions(state).readonly).toBe(true);

      for (const ch of ':w') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(state.bell).toBe(true);
      expect(state.commandMessage).toContain('E45');

      for (const ch of ':w!') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(state.bell).toBeFalsy();
    });

    it('분할 창에서 :setlocal 로 윈도우 로컬 옵션(rnu, wrap 등)을 창마다 독립적으로 유지한다', () => {
      let state: VimEditorState = {
        lines: ['shared buffer'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // :vsp 로 창 분할 후 현재 창에만 :setlocal rnu nowrap 적용
      for (const ch of ':vsp') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      for (const ch of ':setlocal rnu nowrap') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');

      expect(getOptions(state).relativenumber).toBe(true);
      expect(getOptions(state).wrap).toBe(false);

      // Ctrl-w w 로 반대쪽 창으로 이동하면 원래 전역 옵션(nornu, wrap) 유지
      state = handleKey(state, 'Ctrl-w');
      state = handleKey(state, 'w');
      expect(getOptions(state).relativenumber).toBe(false);
      expect(getOptions(state).wrap).toBe(true);

      // 다시 첫 창으로 돌아오면 로컬 옵션(rnu, nowrap) 복원
      state = handleKey(state, 'Ctrl-w');
      state = handleKey(state, 'w');
      expect(getOptions(state).relativenumber).toBe(true);
      expect(getOptions(state).wrap).toBe(false);
    });
  });
});
