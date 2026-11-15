import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef, Dispatch, SetStateAction } from 'react';
import { useHardcoreAndKeymaps } from './useHardcoreAndKeymaps';
import { VimEditorState } from '../vim-engine';
import { loadHardcoreMode } from '../utils/storage';
import { loadThemeSetting } from '../utils/theme';
import { loadLeaderKey, loadCustomKeymaps } from '../utils/keymapStorage';

function makeState(): VimEditorState {
  return {
    lines: ['test'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };
}

describe('useHardcoreAndKeymaps', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('하드코어 모드 토글·마우스 클릭 차단 및 경고/흔들림 타이머 만료를 처리한다', () => {
    const { result } = renderHook(() => {
      const ref = useRef<Dispatch<SetStateAction<VimEditorState>> | null>(null);
      return useHardcoreAndKeymaps(ref);
    });

    expect(result.current.hardcoreMode).toBe(false);

    act(() => {
      result.current.handleToggleHardcoreMode();
    });
    expect(result.current.hardcoreMode).toBe(true);
    expect(loadHardcoreMode()).toBe(true);

    act(() => {
      result.current.handleEditorAreaClick();
    });
    expect(result.current.isEditorShaking).toBe(true);
    expect(result.current.hardcoreWarning).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.isEditorShaking).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(result.current.hardcoreWarning).toBeNull();
  });

  it('프리셋·리더키·커스텀 키매핑·테마 변경 시 에디터 상태와 저장소에 반영한다', () => {
    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(makeState);
      const ref = useRef<Dispatch<SetStateAction<VimEditorState>> | null>(null);
      ref.current = setEditorState;
      const hook = useHardcoreAndKeymaps(ref);
      return { editorState, hook };
    });

    act(() => {
      result.current.hook.handleTogglePreset('jkEscape');
      result.current.hook.handleChangeLeaderKey(',');
      result.current.hook.handleThemeChange('gruvbox-dark');
    });

    expect(result.current.hook.leaderKey).toBe(',');
    expect(loadLeaderKey()).toBe(',');
    expect(result.current.editorState.leaderKey).toBe(',');
    expect(result.current.hook.currentTheme).toBe('gruvbox-dark');
    expect(loadThemeSetting()).toBe('gruvbox-dark');

    act(() => {
      result.current.hook.handleAddCustomKeymap({
        mode: 'normal',
        from: '<leader>w',
        to: ':w<CR>',
        noremap: true,
      });
    });

    expect(result.current.hook.customKeymaps).toHaveLength(1);
    expect(loadCustomKeymaps()).toHaveLength(1);
    expect(result.current.editorState.commandMessage).toContain('<leader>w');

    const addedId = result.current.hook.customKeymaps[0].id;
    act(() => {
      result.current.hook.handleDeleteCustomKeymap(addedId);
    });
    expect(result.current.hook.customKeymaps).toHaveLength(0);
    expect(loadCustomKeymaps()).toHaveLength(0);
  });
});
