import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGhostReplay } from './useGhostReplay';
import { VimEditorState } from '../vim-engine';
import { Mission } from '../types/mission';

function createInitialState(): VimEditorState {
  return {
    lines: ['hello world'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };
}

const sampleMission: Mission = {
  id: 901,
  title: 'Ghost Test',
  description: 'desc',
  hint: 'hint',
  par: 2,
  optimalKeys: ['l', 'x'],
  initialLines: ['hello world'],
  initialCursor: { line: 0, col: 0 },
  targetLines: ['hllo world'],
  checkComplete: (s) => s.lines[0] === 'hllo world',
};

describe('useGhostReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('optimalKeys 를 순서대로 재생하고 완료 후 자동으로 중지한다', () => {
    let state = createInitialState();
    const setEditorState = vi.fn((updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
    });
    const setKeystrokeCount = vi.fn();
    const setRecentKeys = vi.fn();
    const setLastPressedKey = vi.fn();
    const playKeySound = vi.fn();

    const { result } = renderHook(() =>
      useGhostReplay({
        currentMission: sampleMission,
        getMissionInitialState: createInitialState,
        setEditorState,
        setKeystrokeCount,
        setRecentKeys,
        setLastPressedKey,
        playKeySound,
      })
    );

    act(() => {
      result.current.handleStartGhostReplay();
    });

    expect(result.current.isGhostReplaying).toBe(true);
    expect(result.current.ghostReplayProgress).toEqual({ current: 0, total: 2 });

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(result.current.ghostReplayProgress).toEqual({ current: 1, total: 2 });
    expect(playKeySound).toHaveBeenCalledWith('l', 'NORMAL');
    expect(state.cursor.col).toBe(1);

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(result.current.ghostReplayProgress).toEqual({ current: 2, total: 2 });
    expect(state.lines[0]).toBe('hllo world');
    expect(result.current.isGhostReplaying).toBe(false);
    expect(setLastPressedKey).toHaveBeenLastCalledWith(undefined);
  });

  it('handleStopGhostReplay 로 재생 도중 즉시 중단할 수 있다', () => {
    const setLastPressedKey = vi.fn();
    const { result } = renderHook(() =>
      useGhostReplay({
        currentMission: sampleMission,
        getMissionInitialState: createInitialState,
        setEditorState: vi.fn(),
        setKeystrokeCount: vi.fn(),
        setRecentKeys: vi.fn(),
        setLastPressedKey,
        playKeySound: vi.fn(),
      })
    );

    act(() => {
      result.current.handleStartGhostReplay();
      vi.advanceTimersByTime(350);
      result.current.handleStopGhostReplay();
    });

    expect(result.current.isGhostReplaying).toBe(false);
    expect(setLastPressedKey).toHaveBeenLastCalledWith(undefined);
  });

  it('optimalKeys 가 비어 있으면 리플레이를 시작하지 않는다', () => {
    const emptyMission: Mission = { ...sampleMission, optimalKeys: [] };
    const { result } = renderHook(() =>
      useGhostReplay({
        currentMission: emptyMission,
        getMissionInitialState: createInitialState,
        setEditorState: vi.fn(),
        setKeystrokeCount: vi.fn(),
        setRecentKeys: vi.fn(),
        setLastPressedKey: vi.fn(),
        playKeySound: vi.fn(),
      })
    );

    act(() => {
      result.current.handleStartGhostReplay();
    });
    expect(result.current.isGhostReplaying).toBe(false);
  });
});
