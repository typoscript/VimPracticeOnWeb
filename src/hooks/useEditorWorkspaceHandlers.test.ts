import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useEditorWorkspaceHandlers } from './useEditorWorkspaceHandlers';
import { VimEditorState, handleKey } from '../vim-engine';

function makeWorkspaceState(): VimEditorState {
  return {
    lines: ['first line', 'second line', 'third line'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
    commandHistory: ['set number', 'echo "hi"'],
    fuzzyFinder: {
      isOpen: true,
      mode: 'files',
      query: '',
      selectedIndex: 0,
    },
  };
}

describe('useEditorWorkspaceHandlers', () => {
  it('마크·라인 점프·레지스터·퍼지 파인더·탭페이지 핸들러가 상태를 업데이트하고 포커스를 부여한다', () => {
    const setIsEditorFocused = vi.fn();

    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(makeWorkspaceState);
      const handlers = useEditorWorkspaceHandlers({ setEditorState, setIsEditorFocused });
      return { editorState, setEditorState, handlers };
    });

    // 라인 점프 및 마크 설정/삭제
    act(() => {
      result.current.handlers.handleJumpToLine(2);
    });
    expect(result.current.editorState.cursor).toEqual({ line: 2, col: 0 });

    act(() => {
      result.current.handlers.handleSetMark('a');
    });
    expect(result.current.editorState.marks?.a).toEqual({ row: 2, col: 0 });

    act(() => {
      result.current.handlers.handleDeleteMark('a');
    });
    expect(result.current.editorState.marks?.a).toBeUndefined();

    // 레지스터 수정 및 삭제
    act(() => {
      result.current.handlers.handleUpdateRegister('b', 'macro-keys', 'macro');
    });
    expect(result.current.editorState.registers?.b).toEqual({
      type: 'macro',
      content: 'macro-keys',
    });

    act(() => {
      result.current.handlers.handleDeleteRegister('b');
    });
    expect(result.current.editorState.registers?.b).toBeUndefined();

    // 퍼지 파인더 선택 인덱스 변경 및 닫기
    act(() => {
      result.current.handlers.handleSelectFuzzyItemIndex(1);
    });
    expect(result.current.editorState.fuzzyFinder?.selectedIndex).toBe(1);

    act(() => {
      result.current.handlers.handleCloseFuzzyFinder();
    });
    expect(result.current.editorState.fuzzyFinder).toBeNull();
    expect(setIsEditorFocused).toHaveBeenCalledWith(true);

    // 새 탭 생성 및 닫기
    act(() => {
      result.current.handlers.handleNewTabPage();
    });
    expect((result.current.editorState.tabPages ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('커맨드라인 윈도우(q:) 라인 선택 및 Enter 실행 핸들러를 처리한다', () => {
    const setIsEditorFocused = vi.fn();
    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(() => {
        let st: VimEditorState = { ...makeWorkspaceState(), fuzzyFinder: null };
        st = handleKey(st, 'q');
        st = handleKey(st, ':');
        return st;
      });
      const handlers = useEditorWorkspaceHandlers({ setEditorState, setIsEditorFocused });
      return { editorState, handlers };
    });

    expect(result.current.editorState.cmdlineWindow).toBeDefined();
    expect(result.current.editorState.cmdlineWindow?.type).toBe(':');

    act(() => {
      result.current.handlers.handleSwitchCommandLineWindowType('/');
    });
    expect(result.current.editorState.cmdlineWindow?.type).toBe('/');

    act(() => {
      result.current.handlers.handleSwitchCommandLineWindowType(':');
      result.current.handlers.handleSelectCommandLineWindowLine(0);
    });
    expect(result.current.editorState.cmdlineWindow?.type).toBe(':');
    expect(result.current.editorState.cmdlineWindow?.cursor.line).toBe(0);

    act(() => {
      result.current.handlers.handleCloseCommandLineWindow();
    });
    expect(result.current.editorState.cmdlineWindow).toBeNull();
  });
});
