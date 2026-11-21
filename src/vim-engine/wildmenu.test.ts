import { describe, it, expect } from 'vitest';
import {
  calculateCompletions,
  handleTabCompletion,
  selectWildmenuCandidate,
  cancelWildmenu,
  acceptWildmenu,
} from './wildmenu';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { VimEditorState } from './types';

describe('wildmenu engine (:set wildmenu, Tab completion)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: ['console.log("hello");'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'app.ts',
    buffers: [
      {
        id: 1,
        name: 'app.ts',
        lines: ['console.log("hello");'],
        cursor: { line: 0, col: 0 },
      },
      {
        id: 2,
        name: 'service.ts',
        lines: ['export const s = 1;'],
        cursor: { line: 0, col: 0 },
      },
    ],
  });

  describe('candidate calculation (calculateCompletions)', () => {
    it(':set 옵션 완성 (단일 매칭: set rnu -> set relativenumber)', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 'set rnu');
      expect(res).toBeDefined();
      expect(res?.prefix).toBe('set ');
      expect(res?.candidates).toEqual(['relativenumber']);
    });

    it(':set 옵션 완성 (다중 매칭: set no -> nonumber, norelativenumber 등)', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 'set no');
      expect(res).toBeDefined();
      expect(res?.prefix).toBe('set ');
      expect(res?.candidates).toContain('nonumber');
      expect(res?.candidates).toContain('norelativenumber');
      expect(res?.candidates).toContain('noignorecase');
    });

    it(':e 파일명 완성 (접두사 매칭: e s -> src/main.ts, src/utils.ts)', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 'e s');
      expect(res).toBeDefined();
      expect(res?.prefix).toBe('e ');
      expect(res?.candidates).toEqual(['service.ts', 'src/main.ts', 'src/utils.ts']);
    });

    it(':b 버퍼명 완성 (열려 있는 버퍼: b se -> service.ts)', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 'b se');
      expect(res).toBeDefined();
      expect(res?.prefix).toBe('b ');
      expect(res?.candidates).toEqual(['service.ts']);
    });

    it('Ex 커맨드 자체 완성 (re -> reg, registers)', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 're');
      expect(res).toBeDefined();
      expect(res?.prefix).toBe('');
      expect(res?.candidates).toContain('reg');
      expect(res?.candidates).toContain('registers');
    });

    it('일치하는 후보가 없는 경우 null을 반환한다', () => {
      const state = createBaseState();
      const res = calculateCompletions(state, 'set non_existing_option');
      expect(res).toBeNull();
    });
  });

  describe('tab cycling (handleTabCompletion)', () => {
    it('첫 Tab 입력 시 첫 번째 후보가 자동 완성되고 와일드메뉴가 활성화된다', () => {
      const state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'set rnu',
      };

      const next = handleTabCompletion(state);
      expect(next.commandBuffer).toBe('set relativenumber');
      expect(next.wildmenu?.active).toBe(true);
      expect(next.wildmenu?.selectedIndex).toBe(0);
      expect(next.wildmenu?.candidates).toEqual(['relativenumber']);
    });

    it('후보가 여러 개일 때 Tab을 반복 입력하면 순환(cycle)한다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'e s',
      };

      // 1st Tab: service.ts
      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('e service.ts');
      expect(state.wildmenu?.selectedIndex).toBe(0);

      // 2nd Tab: src/main.ts
      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('e src/main.ts');
      expect(state.wildmenu?.selectedIndex).toBe(1);

      // 3rd Tab: src/utils.ts
      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('e src/utils.ts');
      expect(state.wildmenu?.selectedIndex).toBe(2);

      // 4th Tab: 다시 처음(service.ts)으로 랩어라운드
      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('e service.ts');
      expect(state.wildmenu?.selectedIndex).toBe(0);
    });

    it('Shift-Tab (reverse) 입력 시 역방향으로 순환한다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'e s',
      };

      // Tab -> service.ts (idx 0)
      state = handleTabCompletion(state);
      expect(state.wildmenu?.selectedIndex).toBe(0);

      // Shift-Tab -> 맨 마지막 후보(src/utils.ts, idx 2)로 역순환
      state = handleTabCompletion(state, true);
      expect(state.commandBuffer).toBe('e src/utils.ts');
      expect(state.wildmenu?.selectedIndex).toBe(2);
    });
  });

  describe('cancel & accept wildmenu', () => {
    it('cancelWildmenu(state, true) 시 Tab 이전의 원본 입력 내용으로 복원된다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'set rnu',
      };

      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('set relativenumber');

      state = cancelWildmenu(state, true);
      expect(state.commandBuffer).toBe('set rnu');
      expect(state.wildmenu).toBeNull();
    });

    it('acceptWildmenu(state) 시 현재 완성된 내용을 유지한 채 와일드메뉴만 종료된다', () => {
      let state: VimEditorState = {
        ...createBaseState(),
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'set rnu',
      };

      state = handleTabCompletion(state);
      expect(state.commandBuffer).toBe('set relativenumber');

      state = acceptWildmenu(state);
      expect(state.commandBuffer).toBe('set relativenumber');
      expect(state.wildmenu).toBeNull();
    });
  });

  describe('handleKey 통합 동작 검증', () => {
    it(':set rnu<Tab><CR> 로 relativenumber 옵션이 실제 활성화된다', () => {
      let state = createBaseState();

      // :
      state = handleKey(state, ':');
      expect(state.mode).toBe('COMMAND');

      // s e t   r n u
      for (const ch of 'set rnu') {
        state = handleKey(state, ch);
      }
      expect(state.commandBuffer).toBe('set rnu');

      // Tab -> 와일드메뉴 자동완성
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('set relativenumber');
      expect(state.wildmenu?.active).toBe(true);

      // Enter -> 실행
      state = handleKey(state, 'Enter');
      expect(state.mode).toBe('NORMAL');
      expect(state.options?.relativenumber).toBe(true);
      expect(state.wildmenu).toBeNull();
    });

    it(':e <Tab> 후 Escape를 누르면 원래 텍스트로 복귀하고 와일드메뉴가 취소된다', () => {
      let state = createBaseState();

      state = handleKey(state, ':');
      for (const ch of 'e s') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('e service.ts');

      // 1st Escape -> Tab 이전 원본 텍스트 'e s'로 복귀
      state = handleKey(state, 'Escape');
      expect(state.commandBuffer).toBe('e s');
      expect(state.mode).toBe('COMMAND');
      expect(state.wildmenu).toBeNull();

      // 2nd Escape -> COMMAND 모드 종료
      state = handleKey(state, 'Escape');
      expect(state.mode).toBe('NORMAL');
    });

    it('ArrowRight / ArrowLeft 로도 와일드메뉴 후보를 좌우 순환할 수 있다', () => {
      let state = createBaseState();

      state = handleKey(state, ':');
      for (const ch of 'e s') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('e service.ts');

      // ArrowRight -> 다음 후보 (src/main.ts)
      state = handleKey(state, 'ArrowRight');
      expect(state.commandBuffer).toBe('e src/main.ts');

      // ArrowLeft -> 이전 후보 (service.ts)
      state = handleKey(state, 'ArrowLeft');
      expect(state.commandBuffer).toBe('e service.ts');
    });

    it(':setlocal / :setglobal 옵션 및 opt=val 열거형 값 자동완성을 지원한다', () => {
      const state = createBaseState();

      const localRes = calculateCompletions(state, 'setlocal rnu');
      expect(localRes?.prefix).toBe('setlocal ');
      expect(localRes?.candidates).toEqual(['relativenumber']);

      const fdmRes = calculateCompletions(state, 'set foldmethod=in');
      expect(fdmRes?.prefix).toBe('set foldmethod=');
      expect(fdmRes?.candidates).toEqual(['indent']);

      const veRes = calculateCompletions(state, 'set ve+=o');
      expect(veRes?.prefix).toBe('set ve+=');
      expect(veRes?.candidates).toEqual(['onemore']);

      const icmRes = calculateCompletions(state, 'set inccommand=');
      expect(icmRes?.prefix).toBe('set inccommand=');
      expect(icmRes?.candidates).toEqual(['nosplit', 'split']);
    });

    it('사용자 정의 명령(:command), 사용자/내장 함수(:call/:delfunction), 도움말(:help), 자동명령(:autocmd), 파이프(|) 뒤 자동완성을 지원한다', () => {
      let state = createBaseState();
      state = executeCommandLine(state, 'command! MyBuild echo "build"');
      state = executeCommandLine(state, 'let g:my_flag = 1');
      state = executeCommandLine(state, 'nnoremap <leader>x dd');
      state = executeCommandLine(state, 'iabbrev teh the');
      state = {
        ...state,
        userFunctions: {
          MyHelper: {
            name: 'MyHelper',
            params: [],
            varargs: false,
            range: false,
            abort: false,
            body: ['return 1'],
          },
        },
      };

      // 1) 커맨드 시작부에서 사용자 정의 명령 포함
      const cmdRes = calculateCompletions(state, 'MyB');
      expect(cmdRes?.candidates).toEqual(['MyBuild']);

      // 2) :delcommand 뒤 사용자 정의 명령 완성
      const delcRes = calculateCompletions(state, 'delcommand My');
      expect(delcRes?.prefix).toBe('delcommand ');
      expect(delcRes?.candidates).toEqual(['MyBuild']);

      // 3) :call 뒤 사용자 정의 함수 및 내장 함수 완성
      const callUserRes = calculateCompletions(state, 'call MyH');
      expect(callUserRes?.candidates).toEqual(['MyHelper']);
      const callBuiltinRes = calculateCompletions(state, 'call getcmd');
      expect(callBuiltinRes?.candidates).toEqual(['getcmdline', 'getcmdpos', 'getcmdtype']);

      // 4) :help 뒤 토픽/태그 완성
      const helpRes = calculateCompletions(state, 'help quick');
      expect(helpRes?.prefix).toBe('help ');
      expect(helpRes?.candidates).toContain('quickref');

      // 5) :autocmd 이벤트 이름 완성
      const auRes = calculateCompletions(state, 'autocmd BufWri');
      expect(auRes?.candidates).toEqual(['BufWrite', 'BufWritePost', 'BufWritePre']);

      // 6) :unlet 변수, :nunmap 매핑, :iunabbrev 약어 완성
      expect(calculateCompletions(state, 'unlet g:my')?.candidates).toEqual(['g:my_flag']);
      expect(calculateCompletions(state, 'nunmap <lea')?.candidates).toEqual(['<leader>x']);
      expect(calculateCompletions(state, 'iunabbrev te')?.candidates).toEqual(['teh']);

      // 7) 파이프(|) 뒤 커맨드/옵션 완성 및 selectWildmenuCandidate 직접 선택
      const pipedRes = calculateCompletions(state, 'set nu | setl rnu');
      expect(pipedRes?.prefix).toBe('set nu | setl ');
      expect(pipedRes?.candidates).toEqual(['relativenumber']);

      let cmdState: VimEditorState = {
        ...state,
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'call getcmd',
      };
      cmdState = handleTabCompletion(cmdState);
      expect(cmdState.commandBuffer).toBe('call getcmdline');
      cmdState = selectWildmenuCandidate(cmdState, 2);
      expect(cmdState.commandBuffer).toBe('call getcmdtype');
      expect(cmdState.wildmenu?.selectedIndex).toBe(2);
    });

    it(':set wildmode=longest:full,full 에서 첫 Tab은 최장 공통 접두사만 채우고 두 번째 Tab부터 순환한다', () => {
      let state = createBaseState();
      state = executeCommandLine(state, 'set wim=longest:full,full');
      expect(state.options?.wildmode).toBe('longest:full,full');

      // :call getcm<Tab> -> 후보 ['getcmdline', 'getcmdpos', 'getcmdtype'] 의 LCP 'getcmd' 로 먼저 확장
      state = {
        ...state,
        mode: 'COMMAND',
        commandType: ':',
        commandBuffer: 'call getcm',
      };
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('call getcmd');
      expect(state.wildmenu?.active).toBe(true);
      expect(state.wildmenu?.phase).toBe('longest');
      expect(state.wildmenu?.selectedIndex).toBe(-1);

      // 두 번째 Tab -> full 단계 진입하여 첫 번째 후보 'getcmdline' 선택
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('call getcmdline');
      expect(state.wildmenu?.phase).toBe('full');
      expect(state.wildmenu?.selectedIndex).toBe(0);

      // 세 번째 Tab -> 다음 후보 'getcmdpos'
      state = handleKey(state, 'Tab');
      expect(state.commandBuffer).toBe('call getcmdpos');
      expect(state.wildmenu?.selectedIndex).toBe(1);

      // 잘못된 wildmode 값은 E474 에러
      const badWim = executeCommandLine(state, 'set wim=bogus');
      expect(badWim.bell).toBe(true);
      expect(badWim.commandMessage).toContain('E474');
    });
  });
});
