import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef } from 'react';
import { useAppMissionHandlers } from './useAppMissionHandlers';
import { VimEditorState } from '../vim-engine';
import { MISSIONS } from '../data/missions';
import { AntiPatternDetector } from '../utils/antiPatternDetector';
import { buildMissionInitialState } from '../utils/missionInitialState';
import { LessonProgress } from '../utils/storage';
import { AppTab } from '../components/AppHeader/AppHeader';
import { Mission } from '../types/mission';

const EMPTY_KEYMAPS = { activePresets: {}, leaderKey: ' ', customKeymaps: [] };

describe('useAppMissionHandlers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('미션 선택, 커스텀/BYOC 미션 시작, 탭 전환 및 매크로 실행을 처리한다', () => {
    const resetActionTimeline = vi.fn();
    const resetSpeedrunReady = vi.fn();
    const handleStopGhostReplay = vi.fn();
    const enableDiffView = vi.fn();
    const reloadHardcoreAndKeymaps = vi.fn();
    const restoreViewSettings = vi.fn();
    const processKeyInput = vi.fn();
    const setShowActionTimeline = vi.fn();
    const setSpeedrunBestRecord = vi.fn();

    const { result } = renderHook(() => {
      const [currentTab, setCurrentTab] = useState<AppTab>('course');
      const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
      const [customMission, setCustomMission] = useState<Mission | null>(null);
      const [editorState, setEditorState] = useState<VimEditorState>(() =>
        buildMissionInitialState(MISSIONS[0], EMPTY_KEYMAPS)
      );
      const [keystrokeCount, setKeystrokeCount] = useState(5);
      const [recentKeys, setRecentKeys] = useState<string[]>(['l']);
      const [lastPressedKey, setLastPressedKey] = useState<string | undefined>('l');
      const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
      const [progress, setProgress] = useState<LessonProgress>({});
      const antiPatternDetectorRef = useRef(new AntiPatternDetector());
      const editorStateRef = useRef(editorState);
      editorStateRef.current = editorState;

      const handlers = useAppMissionHandlers({
        currentMission: MISSIONS[currentMissionIndex],
        currentMissionIndex,
        customMission,
        activePresets: {},
        leaderKey: ' ',
        customKeymaps: [],
        antiPatternDetectorRef,
        editorStateRef,
        getMissionInitialState: (m) => buildMissionInitialState(m, EMPTY_KEYMAPS),
        resetActionTimeline,
        resetSpeedrunReady,
        handleStopGhostReplay,
        enableDiffView,
        reloadHardcoreAndKeymaps,
        restoreViewSettings,
        processKeyInput,
        setCurrentTab,
        setCurrentMissionIndex,
        setCustomMission,
        setEditorState,
        setKeystrokeCount,
        setRecentKeys,
        setLastPressedKey,
        setCoachingMessage,
        setProgress,
        setShowActionTimeline,
        setSpeedrunBestRecord,
      });

      return {
        currentTab,
        currentMissionIndex,
        customMission,
        editorState,
        keystrokeCount,
        recentKeys,
        lastPressedKey,
        coachingMessage,
        progress,
        handlers,
      };
    });

    act(() => {
      result.current.handlers.handleSelectMission(1);
    });
    expect(result.current.currentMissionIndex).toBe(1);
    expect(result.current.keystrokeCount).toBe(0);
    expect(result.current.recentKeys).toEqual([]);
    expect(result.current.editorState.lines).toEqual(MISSIONS[1].initialLines);
    expect(handleStopGhostReplay).toHaveBeenCalled();
    expect(resetActionTimeline).toHaveBeenCalled();

    act(() => {
      result.current.handlers.handlePlayBYOCMission({
        title: 'BYOC Test',
        description: 'Refactor sample',
        initialText: 'const a = 1;',
        targetText: 'const b = 1;',
        par: 4,
        hint: 'ra',
      });
    });
    expect(result.current.currentTab).toBe('custom');
    expect(result.current.customMission?.title).toBe('BYOC Test');
    expect(enableDiffView).toHaveBeenCalledTimes(1);
    expect(result.current.coachingMessage).toContain('BYOC');

    act(() => {
      result.current.handlers.handleRunMacroFromDebugger('a', 12);
    });
    expect(processKeyInput.mock.calls.map((c) => c[0])).toEqual(['1', '2', '@', 'a']);

    act(() => {
      result.current.handlers.handleSelectLessonById(MISSIONS[2].id);
    });
    expect(result.current.currentTab).toBe('course');
    expect(result.current.currentMissionIndex).toBe(2);

    act(() => {
      result.current.handlers.handleSwitchTab('sandbox');
    });
    expect(result.current.currentTab).toBe('sandbox');

    act(() => {
      result.current.handlers.handleRestoreBackup();
    });
    expect(reloadHardcoreAndKeymaps).toHaveBeenCalledTimes(1);
    expect(restoreViewSettings).toHaveBeenCalledTimes(1);
    expect(setShowActionTimeline).toHaveBeenCalledTimes(1);
    expect(setSpeedrunBestRecord).toHaveBeenCalledTimes(1);
  });
});
