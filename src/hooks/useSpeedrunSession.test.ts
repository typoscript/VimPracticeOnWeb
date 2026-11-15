import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import {
  useSpeedrunSession,
  generateSpeedrunStages,
  SPEEDRUN_CANDIDATE_IDS,
} from './useSpeedrunSession';
import { VimEditorState, handleKey } from '../vim-engine';
import { AntiPatternDetector } from '../utils/antiPatternDetector';
import { Mission } from '../types/mission';
import { buildMissionInitialState } from '../utils/missionInitialState';

function makeMissionState(m: Mission): VimEditorState {
  return buildMissionInitialState(m, {
    activePresets: {},
    leaderKey: '\\',
    customKeymaps: [],
  });
}

describe('useSpeedrunSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generateSpeedrunStages 는 중복 없는 5개의 후보 미션을 생성한다', () => {
    const stages = generateSpeedrunStages();
    expect(stages).toHaveLength(5);
    const ids = new Set(stages.map((s) => s.id));
    expect(ids.size).toBe(5);
    stages.forEach((s) => expect(SPEEDRUN_CANDIDATE_IDS).toContain(s.id));
  });

  it('시작 후 타이머가 경과하고 모든 스테이지 완료 시 기록을 저장한다', () => {
    const playSuccessSound = vi.fn();
    const handleStopGhostReplay = vi.fn();
    const resetActionTimeline = vi.fn();
    const setCoachingMessage = vi.fn();
    const antiPatternDetectorRef = { current: new AntiPatternDetector() };

    const { result } = renderHook(() => {
      const [editorState, setEditorState] = useState<VimEditorState>(() =>
        makeMissionState(generateSpeedrunStages()[0])
      );
      const speedrun = useSpeedrunSession({
        currentTab: 'speedrun',
        editorState,
        getMissionInitialState: makeMissionState,
        setEditorState,
        setCoachingMessage,
        playSuccessSound,
        handleStopGhostReplay,
        resetActionTimeline,
        setRecentKeys: vi.fn(),
        setLastPressedKey: vi.fn(),
        antiPatternDetectorRef,
      });
      return { editorState, setEditorState, speedrun };
    });

    act(() => {
      result.current.speedrun.handleStartSpeedrun();
    });

    expect(result.current.speedrun.speedrunStatus).toBe('running');
    expect(result.current.speedrun.speedrunCurrentStage).toBe(0);
    expect(handleStopGhostReplay).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.speedrun.speedrunElapsedSeconds).toBeCloseTo(0.3, 1);

    // 5개 스테이지 순차 완료 시뮬레이션 (각 미션의 optimalKeys 실행)
    for (let i = 0; i < 5; i++) {
      act(() => {
        const mission = result.current.speedrun.activeSpeedrunMission;
        result.current.setEditorState((prev) =>
          (mission.optimalKeys ?? []).reduce((st, k) => handleKey(st, k), prev)
        );
      });
    }

    expect(result.current.speedrun.speedrunStatus).toBe('completed');
    expect(playSuccessSound).toHaveBeenCalledTimes(1);
    expect(result.current.speedrun.speedrunBestRecord).not.toBeNull();
    expect(result.current.speedrun.speedrunIsNewRecord).toBe(true);

    act(() => {
      result.current.speedrun.resetSpeedrunReady();
    });
    expect(result.current.speedrun.speedrunStatus).toBe('ready');
    expect(result.current.speedrun.speedrunElapsedSeconds).toBe(0);
  });
});
