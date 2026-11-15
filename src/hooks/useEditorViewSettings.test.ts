import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useEditorViewSettings } from './useEditorViewSettings';
import { VimEditorState } from '../vim-engine';
import {
  loadRelativeLineSetting,
  loadVirtualKeyboardSetting,
  loadDiffViewSetting,
  loadRegisterInspectorSetting,
  loadMarksVisualizerSetting,
  loadGrammarASTSetting,
} from '../utils/storage';

function makeState(overrides: Partial<VimEditorState> = {}): VimEditorState {
  return {
    lines: ['line 1'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

describe('useEditorViewSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('패널 토글 시 상태와 localStorage 및 editorState.options.relativenumber 를 갱신한다', () => {
    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(() => makeState());
      const settings = useEditorViewSettings({ editorState, setEditorState });
      return { editorState, setEditorState, settings };
    });

    const initRel = result.current.settings.relativeLineNumbers;
    act(() => {
      result.current.settings.handleToggleRelativeLine();
      result.current.settings.handleToggleVirtualKeyboard();
      result.current.settings.handleToggleDiffView();
      result.current.settings.handleToggleRegisterInspector();
      result.current.settings.handleToggleMarksVisualizer();
      result.current.settings.handleToggleGrammarAST();
      result.current.settings.handleToggleMacroDebugger();
    });

    expect(result.current.settings.relativeLineNumbers).toBe(!initRel);
    expect(loadRelativeLineSetting()).toBe(!initRel);
    expect(result.current.editorState.options?.relativenumber).toBe(!initRel);
    expect(loadVirtualKeyboardSetting()).toBe(result.current.settings.showVirtualKeyboard);
    expect(loadDiffViewSetting()).toBe(result.current.settings.showDiffView);
    expect(loadRegisterInspectorSetting()).toBe(result.current.settings.showRegisterInspector);
    expect(loadMarksVisualizerSetting()).toBe(result.current.settings.showMarksVisualizer);
    expect(loadGrammarASTSetting()).toBe(result.current.settings.showGrammarAST);
    expect(result.current.settings.showMacroDebugger).toBe(true);
  });

  it('모달 상태와 Vim 엔진 플래그 동기화 및 restoreViewSettings 를 처리한다', () => {
    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(() => makeState());
      const settings = useEditorViewSettings({ editorState, setEditorState });
      return { editorState, setEditorState, settings };
    });

    expect(result.current.settings.isAnyModalOpen).toBe(false);

    act(() => {
      result.current.settings.setIsDailyModalOpen(true);
    });
    expect(result.current.settings.isAnyModalOpen).toBe(true);

    act(() => {
      result.current.setEditorState((prev) => ({
        ...prev,
        showRegisterInspector: true,
        showMarksVisualizer: true,
        showConfigModal: true,
      }));
    });
    expect(result.current.settings.showRegisterInspector).toBe(true);
    expect(result.current.settings.showMarksVisualizer).toBe(true);
    expect(result.current.settings.isConfigModalOpen).toBe(true);

    act(() => {
      result.current.settings.enableDiffView();
    });
    expect(result.current.settings.showDiffView).toBe(true);
    expect(loadDiffViewSetting()).toBe(true);
  });
});
