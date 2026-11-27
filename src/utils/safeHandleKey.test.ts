import { describe, it, expect, vi } from 'vitest';
import { VimEditorState } from '../vim-engine';
import { safeHandleKey } from './safeHandleKey';

describe('safeHandleKey', () => {
  it('정상 키는 handleKey 와 같은 결과를 낸다', () => {
    const state: VimEditorState = { lines: ['abc'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
    expect(safeHandleKey(state, 'l').cursor).toEqual({ line: 0, col: 1 });
  });

  it('엔진이 예외를 던지면 직전 내용을 유지하고 bell 과 안내 메시지를 남긴다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      lines: null,
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      pendingKeys: 'd',
    } as unknown as VimEditorState;
    const next = safeHandleKey(broken, 'x');
    expect(next.lines).toBeNull();
    expect(next.bell).toBe(true);
    expect(next.pendingKeys).toBeUndefined();
    expect(next.commandMessage).toContain('x');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
