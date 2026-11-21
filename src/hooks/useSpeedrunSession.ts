import { useState, useEffect, useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { VimEditorState } from '../vim-engine';
import { Mission } from '../types/mission';
import { MISSIONS } from '../data/missions';
import { loadSpeedrunRecord, saveSpeedrunRecord, SpeedrunRecord } from '../utils/storage';
import { AntiPatternDetector } from '../utils/antiPatternDetector';
import { t } from '../i18n';

/** 스피드런 챌린지 후보 미션 ID 목록 (리팩토링/편집 미션) */
export const SPEEDRUN_CANDIDATE_IDS = [
  4, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 21, 23, 25, 26, 28, 29, 30, 31, 32, 43, 44,
  47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
];

export function generateSpeedrunStages(): Mission[] {
  const candidates = MISSIONS.filter((m) => SPEEDRUN_CANDIDATE_IDS.includes(m.id));
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5);
}

interface UseSpeedrunSessionParams {
  currentTab: string;
  editorState: VimEditorState;
  getMissionInitialState: (m: Mission) => VimEditorState;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  setCoachingMessage: Dispatch<SetStateAction<string | null>>;
  playSuccessSound: () => void;
  handleStopGhostReplay: () => void;
  resetActionTimeline: (initialState: VimEditorState) => void;
  setRecentKeys: Dispatch<SetStateAction<string[]>>;
  setLastPressedKey: Dispatch<SetStateAction<string | undefined>>;
  antiPatternDetectorRef: MutableRefObject<AntiPatternDetector>;
}

/**
 * 5스테이지 스피드런 챌린지 타이머, 스테이지 전이 및 최고 기록 관리를 담당하는 훅입니다.
 */
export function useSpeedrunSession({
  currentTab,
  editorState,
  getMissionInitialState,
  setEditorState,
  setCoachingMessage,
  playSuccessSound,
  handleStopGhostReplay,
  resetActionTimeline,
  setRecentKeys,
  setLastPressedKey,
  antiPatternDetectorRef,
}: UseSpeedrunSessionParams) {
  const [speedrunStatus, setSpeedrunStatus] = useState<'ready' | 'running' | 'completed'>('ready');
  const [speedrunStages, setSpeedrunStages] = useState<Mission[]>(() => generateSpeedrunStages());
  const [speedrunCurrentStage, setSpeedrunCurrentStage] = useState(0);
  const [speedrunElapsedSeconds, setSpeedrunElapsedSeconds] = useState(0);
  const [speedrunKeystrokes, setSpeedrunKeystrokes] = useState(0);
  const [speedrunBestRecord, setSpeedrunBestRecord] = useState<SpeedrunRecord | null>(() =>
    loadSpeedrunRecord()
  );
  const [speedrunIsNewRecord, setSpeedrunIsNewRecord] = useState(false);

  const activeSpeedrunMission = speedrunStages[speedrunCurrentStage];

  // 스피드런 타이머 연동 (100ms마다 0.1초 증가)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (currentTab === 'speedrun' && speedrunStatus === 'running') {
      interval = setInterval(() => {
        setSpeedrunElapsedSeconds((prev) => Number((prev + 0.1).toFixed(1)));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentTab, speedrunStatus]);

  // 스피드런 스테이지 완료 및 다음 스테이지 자동 전이
  useEffect(() => {
    if (
      currentTab === 'speedrun' &&
      speedrunStatus === 'running' &&
      activeSpeedrunMission &&
      activeSpeedrunMission.checkComplete(editorState)
    ) {
      if (speedrunCurrentStage < speedrunStages.length - 1) {
        const nextStageIdx = speedrunCurrentStage + 1;
        setSpeedrunCurrentStage(nextStageIdx);
        const nextMission = speedrunStages[nextStageIdx];
        setEditorState(getMissionInitialState(nextMission));
        setCoachingMessage(
          t('🎉 스테이지 {v} 돌파! 다음 목표로 이동합니다.', { v: speedrunCurrentStage + 1 })
        );
      } else {
        setSpeedrunStatus('completed');
        playSuccessSound();
        const saveRes = saveSpeedrunRecord(speedrunElapsedSeconds, speedrunKeystrokes);
        setSpeedrunBestRecord(saveRes.record);
        setSpeedrunIsNewRecord(saveRes.isNewRecord);
      }
    }
  }, [
    currentTab,
    speedrunStatus,
    activeSpeedrunMission,
    speedrunCurrentStage,
    speedrunStages,
    editorState,
    speedrunElapsedSeconds,
    speedrunKeystrokes,
    playSuccessSound,
    getMissionInitialState,
    setEditorState,
    setCoachingMessage,
  ]);

  const handleStartSpeedrun = useCallback(() => {
    handleStopGhostReplay();
    const newStages = generateSpeedrunStages();
    setSpeedrunStages(newStages);
    setSpeedrunCurrentStage(0);
    setSpeedrunElapsedSeconds(0);
    setSpeedrunKeystrokes(0);
    setSpeedrunIsNewRecord(false);
    setSpeedrunStatus('running');

    const first = newStages[0];
    const initState = getMissionInitialState(first);
    setEditorState(initState);
    resetActionTimeline(initState);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    antiPatternDetectorRef.current.reset();
  }, [
    handleStopGhostReplay,
    resetActionTimeline,
    getMissionInitialState,
    setEditorState,
    setRecentKeys,
    setLastPressedKey,
    setCoachingMessage,
    antiPatternDetectorRef,
  ]);

  const resetSpeedrunReady = useCallback(() => {
    setSpeedrunStatus('ready');
    setSpeedrunElapsedSeconds(0);
    setSpeedrunKeystrokes(0);
    setSpeedrunIsNewRecord(false);
  }, []);

  return {
    speedrunStatus,
    speedrunStages,
    speedrunCurrentStage,
    speedrunElapsedSeconds,
    speedrunKeystrokes,
    setSpeedrunKeystrokes,
    speedrunBestRecord,
    setSpeedrunBestRecord,
    speedrunIsNewRecord,
    activeSpeedrunMission,
    handleStartSpeedrun,
    resetSpeedrunReady,
  };
}
