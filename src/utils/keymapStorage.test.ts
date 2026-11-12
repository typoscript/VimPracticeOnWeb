import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadActivePresets,
  saveActivePresets,
  loadLeaderKey,
  saveLeaderKey,
  loadCustomKeymaps,
  saveCustomKeymaps,
  compileUserKeymaps,
  CustomKeymapItem,
  CUSTOM_KEYMAPS_STORAGE_KEY,
} from './keymapStorage';

describe('keymapStorage & compileUserKeymaps', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Leader Key & Active Presets', () => {
    it('리더 키 기본값은 공백이며, 저장 및 불러오기가 정상 동작한다', () => {
      expect(loadLeaderKey()).toBe(' ');
      saveLeaderKey('\\');
      expect(loadLeaderKey()).toBe('\\');
    });

    it('프리셋 활성화 설정 저장 및 불러오기', () => {
      const presets = loadActivePresets();
      expect(presets.jkEsc).toBe(true);
      expect(presets.jjEsc).toBe(false);

      saveActivePresets({ ...presets, jjEsc: true });
      expect(loadActivePresets().jjEsc).toBe(true);
    });
  });

  describe('Custom Keymaps Storage', () => {
    it('저장된 커스텀 키매핑이 없을 때 빈 배열을 반환한다', () => {
      expect(loadCustomKeymaps()).toEqual([]);
    });

    it('커스텀 키매핑 저장 및 정상 복원', () => {
      const items: CustomKeymapItem[] = [
        { id: '1', mode: 'normal', from: 'Y', to: 'y$', description: '줄 끝 복사' },
        { id: '2', mode: 'insert', from: 'fd', to: '<Esc>' },
      ];
      saveCustomKeymaps(items);
      const loaded = loadCustomKeymaps();
      expect(loaded.length).toBe(2);
      expect(loaded[0].from).toBe('Y');
      expect(loaded[1].to).toBe('<Esc>');
    });

    it('손상된 JSON 데이터가 있을 때 안전하게 빈 배열을 반환한다', () => {
      localStorage.setItem(CUSTOM_KEYMAPS_STORAGE_KEY, 'invalid json');
      expect(loadCustomKeymaps()).toEqual([]);
    });
  });

  describe('compileUserKeymaps', () => {
    it('활성 프리셋과 리더 키를 올바른 키매핑 맵으로 변환한다', () => {
      const keymaps = compileUserKeymaps({ jkEsc: true, leaderW: true }, ' ');
      expect(keymaps['i:jk']).toBe('<Esc>');
      expect(keymaps['n:<leader>w']).toBe(':w');
      expect(keymaps['n: w']).toBe(':w');
    });

    it('커스텀 키매핑 배열을 모드 및 리더 키 확장과 함께 정확하게 컴파일한다', () => {
      const custom: CustomKeymapItem[] = [
        { id: '1', mode: 'normal', from: 'Y', to: 'y$' },
        { id: '2', mode: 'normal', from: '<leader>p', to: '"+p' },
        { id: '3', mode: 'insert', from: 'fd', to: '<Esc>' },
        { id: '4', mode: 'visual', from: '<leader>y', to: '"+y' },
      ];

      const keymaps = compileUserKeymaps({}, ' ', custom);

      // Normal 모드 Y -> y$
      expect(keymaps['n:Y']).toBe('y$');
      expect(keymaps['Y']).toBe('y$');

      // Normal 모드 <leader>p -> "+p (스페이스바 및 <leader> 확장)
      expect(keymaps['n:<leader>p']).toBe('"+p');
      expect(keymaps['n: p']).toBe('"+p');
      expect(keymaps[' p']).toBe('"+p');

      // Insert 모드 fd -> <Esc>
      expect(keymaps['i:fd']).toBe('<Esc>');
      expect(keymaps['fd']).toBe('<Esc>');

      // Visual 모드 <leader>y -> "+y
      expect(keymaps['v:<leader>y']).toBe('"+y');
      expect(keymaps['v: y']).toBe('"+y');
    });

    it('기존 Record 형태의 customMappings도 완벽하게 하위 호환한다', () => {
      const keymaps = compileUserKeymaps({}, ' ', { 'n:H': '^' });
      expect(keymaps['n:H']).toBe('^');
    });
  });
});
