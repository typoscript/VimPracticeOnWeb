import { describe, it, expect } from 'vitest';
import {
  calculateCompletions,
  handleTabCompletion,
  cancelWildmenu,
  acceptWildmenu,
} from './wildmenu';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

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
  });
});
