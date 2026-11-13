import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  getRegisterContent,
  setSystemClipboard,
} from './index';

function runKeys(state: any, keys: string[]) {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

describe('Vim Expression Register ("=) and System Clipboard ("+, "*)', () => {
  describe('Expression Register ("=) in Normal Mode', () => {
    it('"= 수식<CR> 후 p 로 계산 결과를 붙여넣을 수 있다', () => {
      let state = createVimState(['total: ']);
      state = { ...state, cursor: { line: 0, col: 6 } };

      // "=25 * 4<CR> 입력
      state = runKeys(state, ['"', '=', '2', '5', ' ', '*', ' ', '4', 'Enter']);

      expect(state.mode).toBe('NORMAL');
      expect(state.activeRegister).toBe('=');
      expect(state.registers?.['=']?.content).toBe('100');

      // 'p' 로 붙여넣기
      state = handleKey(state, 'p');
      expect(state.lines[0]).toBe('total: 100');
    });

    it('"=len("hello")<CR> 로 내장 함수 결과를 P 로 커서 앞에 붙여넣는다', () => {
      let state = createVimState(['items']);
      state = { ...state, cursor: { line: 0, col: 0 } };

      // "=len('Vim')<CR>
      state = runKeys(state, ['"', '=', 'l', 'e', 'n', '(', "'", 'V', 'i', 'm', "'", ')', 'Enter']);

      expect(state.mode).toBe('NORMAL');
      expect(state.activeRegister).toBe('=');
      expect(state.registers?.['=']?.content).toBe('3');

      // 'P' 로 커서 앞에 붙여넣기
      state = handleKey(state, 'P');
      expect(state.lines[0]).toBe('3items');
    });

    it('"= 입력 중 Escape 로 취소하면 아무런 변경 없이 NORMAL 모드로 복귀한다', () => {
      let state = createVimState(['const a = 1;']);
      state = runKeys(state, ['"', '=', '1', '2', '3', 'Escape']);

      expect(state.mode).toBe('NORMAL');
      expect(state.commandType).toBeUndefined();
      expect(state.lines[0]).toBe('const a = 1;');
    });
  });

  describe('System Clipboard Registers ("+ and "*)', () => {
    it('"+yy 로 현재 줄을 복사하면 registers["+"], registers["*"], systemClipboard 에 동기화된다', () => {
      let state = createVimState(['export const SECRET = "xyz";', 'const second = 2;']);
      state = runKeys(state, ['"', '+', 'y', 'y']);

      expect(state.registers?.['+']?.content).toBe('export const SECRET = "xyz";');
      expect(state.registers?.['*']?.content).toBe('export const SECRET = "xyz";');
      expect(state.systemClipboard).toBe('export const SECRET = "xyz";');
    });

    it('"*yw 로 단어를 복사하면 registers["*"] 와 systemClipboard 에 저장된다', () => {
      let state = createVimState(['authenticate_user(token);']);
      state = runKeys(state, ['"', '*', 'y', 'w']);

      expect(state.registers?.['*']?.content).toBe('authenticate_user');
      expect(state.registers?.['+']?.content).toBe('authenticate_user');
      expect(state.systemClipboard).toBe('authenticate_user');
    });

    it('setSystemClipboard 로 외부 클립보드가 주입된 경우 "+p 및 "*p 로 붙여넣을 수 있다', () => {
      let state = createVimState(['const result = ']);
      state = { ...state, cursor: { line: 0, col: 14 } };

      // 외부 시스템 클립보드 텍스트 주입
      state = setSystemClipboard(state, 'fetchApi()');
      expect(state.systemClipboard).toBe('fetchApi()');

      // "+p 로 붙여넣기
      state = runKeys(state, ['"', '+', 'p']);
      expect(state.lines[0]).toBe('const result = fetchApi()');
    });

    it('Visual 모드에서 "+y 로 선택 영역을 시스템 클립보드에 복사할 수 있다', () => {
      let state = createVimState(['hello wonderful world']);
      // 'wonderful' 선택 후 "+y
      state = runKeys(state, ['w', 'v', 'e', '"', '+', 'y']);

      expect(state.mode).toBe('NORMAL');
      expect(state.registers?.['+']?.content).toBe('wonderful');
      expect(state.registers?.['*']?.content).toBe('wonderful');
      expect(state.systemClipboard).toBe('wonderful');
    });

    it('getRegisterContent 가 "+, "*, "= 레지스터를 올바르게 조회한다', () => {
      let state = createVimState(['sample']);
      state = setSystemClipboard(state, 'clip-data');
      state = {
        ...state,
        registers: {
          ...state.registers,
          '=': { type: 'char', content: '42' },
        },
      };

      const plusClip = getRegisterContent(state, '+');
      expect(plusClip?.content).toBe('clip-data');

      const starClip = getRegisterContent(state, '*');
      expect(starClip?.content).toBe('clip-data');

      const exprClip = getRegisterContent(state, '=');
      expect(exprClip?.content).toBe('42');
    });
  });
});
