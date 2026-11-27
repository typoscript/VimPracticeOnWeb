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
import { MISSIONS } from '../data/missions';
import { buildMissionInitialState } from '../utils/missionInitialState';

/** 테스트마다 같은 스테이지가 뽑히도록 하는 시드 고정 난수 (mulberry32) */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

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
    vi.restoreAllMocks();
  });

  it('generateSpeedrunStages 는 중복 없는 5개의 후보 미션을 생성한다', () => {
    const stages = generateSpeedrunStages();
    expect(stages).toHaveLength(5);
    const ids = new Set(stages.map((s) => s.id));
    expect(ids.size).toBe(5);
    stages.forEach((s) => expect(SPEEDRUN_CANDIDATE_IDS).toContain(s.id));
  });

  it('generateSpeedrunStages 는 같은 난수열이면 같은 스테이지를, 경계값에서도 유효한 후보를 고른다', () => {
    const a = generateSpeedrunStages(seededRandom(42)).map((m) => m.id);
    const b = generateSpeedrunStages(seededRandom(42)).map((m) => m.id);
    expect(a).toEqual(b);
    const low = generateSpeedrunStages(() => 0).map((m) => m.id);
    const high = generateSpeedrunStages(() => 0.999999).map((m) => m.id);
    expect(low).toEqual(SPEEDRUN_CANDIDATE_IDS.slice(0, 5));
    expect(new Set(high).size).toBe(5);
    high.forEach((id) => expect(SPEEDRUN_CANDIDATE_IDS).toContain(id));
  });

  it('generateSpeedrunStages 는 모든 후보를 첫 스테이지로 고를 수 있다', () => {
    const rand = seededRandom(7);
    const firsts = new Set<number>();
    for (let i = 0; i < 3000; i++) firsts.add(generateSpeedrunStages(rand)[0].id);
    expect(firsts.size).toBe(SPEEDRUN_CANDIDATE_IDS.length);
  });

  it.each([' ', '\\', ','])(
    '모든 스피드런 후보는 리더 키 %j 에서도 optimalKeys 로 완료된다',
    (leaderKey) => {
      const candidates = MISSIONS.filter((m) => SPEEDRUN_CANDIDATE_IDS.includes(m.id));
      expect(candidates).toHaveLength(SPEEDRUN_CANDIDATE_IDS.length);
      const failed = candidates
        .filter((m) => {
          const initial = buildMissionInitialState(m, { activePresets: {}, leaderKey, customKeymaps: [] });
          const done = (m.optimalKeys ?? []).reduce((st, k) => handleKey(st, k), initial);
          return !m.checkComplete(done);
        })
        .map((m) => m.id);
      expect(failed).toEqual([]);
    }
  );

  it('시작 후 타이머가 경과하고 모든 스테이지 완료 시 기록을 저장한다', () => {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(2026));
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
