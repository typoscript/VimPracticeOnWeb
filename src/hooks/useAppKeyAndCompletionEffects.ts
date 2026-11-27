import { useEffect, useCallback, useRef, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { calculateStars } from '../components/MissionPanel/MissionPanel';
import { AppTab } from '../components/AppHeader/AppHeader';
import { VimEditorState, VimMode } from '../vim-engine';
import { safeHandleKey } from '../utils/safeHandleKey';
import { Mission } from '../types/mission';
import { saveLessonRecord, LessonProgress } from '../utils/storage';
import { saveCapstoneCompletion } from '../data/capstoneProjects';
import { AntiPatternDetector } from '../utils/antiPatternDetector';
import { HardcoreGuard } from '../utils/hardcoreGuard';
import { recordKeyInputStats, recordAntiPatternDetection } from '../utils/analyticsStorage';
import { ActionTimelineStep } from '../utils/actionTimeline';
import { t } from '../i18n';

interface UseAppKeyAndCompletionEffectsParams {
  currentTab: AppTab;
  currentMission: Mission;
  customMission: Mission | null;
  initialCustomMission: Mission | null;
  editorState: VimEditorState;
  editorStateRef: MutableRefObject<VimEditorState>;
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  keystrokeCount: number;
  keystrokeCountRef: MutableRefObject<number>;
  setKeystrokeCount: Dispatch<SetStateAction<number>>;
  setRecentKeys: Dispatch<SetStateAction<string[]>>;
  setLastPressedKey: Dispatch<SetStateAction<string | undefined>>;
  setCoachingMessage: Dispatch<SetStateAction<string | null>>;
  setProgress: Dispatch<SetStateAction<LessonProgress>>;
  setMacroPreviewState: Dispatch<SetStateAction<VimEditorState | null>>;
  setBellCount: Dispatch<SetStateAction<number>>;
  speedrunStatus: 'ready' | 'running' | 'completed';
  setSpeedrunKeystrokes: Dispatch<SetStateAction<number>>;
  hardcoreMode: boolean;
  hardcoreGuardRef: MutableRefObject<HardcoreGuard>;
  triggerHardcoreViolation: (message: string, suggestion?: string) => void;
  antiPatternDetectorRef: MutableRefObject<AntiPatternDetector>;
  playKeySound: (key: string, mode: VimMode) => void;
  playSuccessSound: () => void;
  beginTimelineKeyInput: (key: string) => {
    baseState: VimEditorState;
    baseKeystrokes: number;
    baseSteps: ActionTimelineStep[];
    nextActionKeys: string[];
  };
  commitTimelineKeyStep: (
    baseSteps: ActionTimelineStep[],
    nextActionKeys: string[],
    nextKeystrokes: number,
    nextState: VimEditorState
  ) => void;
}

/**
 * App 최상위의 미션 완료 판정·기록 저장·SRS 갱신·클립보드 동기화·키 입력 처리 파이프라인 훅입니다.
 */
export function useAppKeyAndCompletionEffects({
  currentTab,
  currentMission,
  customMission,
  initialCustomMission,
  editorState,
  editorStateRef,
  setEditorState,
  keystrokeCount,
  keystrokeCountRef,
  setKeystrokeCount,
  setRecentKeys,
  setLastPressedKey,
  setCoachingMessage,
  setProgress,
  setMacroPreviewState,
  setBellCount,
  speedrunStatus,
  setSpeedrunKeystrokes,
  hardcoreMode,
  hardcoreGuardRef,
  triggerHardcoreViolation,
  antiPatternDetectorRef,
  playKeySound,
  playSuccessSound,
  beginTimelineKeyInput,
  commitTimelineKeyStep,
}: UseAppKeyAndCompletionEffectsParams) {
  const isCompleted =
    currentTab === 'course'
      ? currentMission.checkComplete(editorState)
      : currentTab === 'custom' && customMission
        ? customMission.checkComplete(editorState)
        : false;

  // 튜토리얼 코스 미션 클리어 시 최고 기록 및 별점 영구 저장
  useEffect(() => {
    if (currentTab === 'course' && isCompleted) {
      const rating = calculateStars(keystrokeCount, currentMission.par);
      const updated = saveLessonRecord(currentMission.id, rating.starCount, keystrokeCount);
      setProgress(updated);
    }
  }, [currentTab, isCompleted, currentMission.id, currentMission.par, keystrokeCount, setProgress]);

  // 미션 클리어 시 성공 효과음 재생 및 SRS 간격 반복 스케줄 갱신
  const wasCompletedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !wasCompletedRef.current) {
      playSuccessSound();
      if (currentTab === 'course') {
        const rating = calculateStars(keystrokeCount, currentMission.par);
        // 복습 일정(SRS) 계산·약점 분석 모듈은 레슨 완료 시에만 불러옵니다 (첫 화면 번들 경량화)
        const missionId = currentMission.id;
        void import('../utils/srsScheduler').then(({ recordLessonSrsReview }) =>
          recordLessonSrsReview(missionId, rating.starCount)
        );
      } else if (currentTab === 'custom' && customMission?.capstoneId) {
        saveCapstoneCompletion(customMission.capstoneId, keystrokeCount);
      }
    }
    wasCompletedRef.current = isCompleted;
  }, [
    isCompleted,
    playSuccessSound,
    currentTab,
    currentMission.id,
    currentMission.par,
    customMission,
    keystrokeCount,
  ]);

  // 시스템 클립보드 ("+, "*) 변경 시 실제 웹 브라우저 클립보드에 동기화
  const prevSystemClipboardRef = useRef<string | undefined>(editorState.systemClipboard);
  useEffect(() => {
    if (
      editorState.systemClipboard &&
      editorState.systemClipboard !== prevSystemClipboardRef.current
    ) {
      prevSystemClipboardRef.current = editorState.systemClipboard;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(editorState.systemClipboard).catch(() => {});
      }
    }
  }, [editorState.systemClipboard]);

  useEffect(() => {
    if (initialCustomMission) {
      setCoachingMessage(
        t('⛳ URL 커스텀 Vim Golf 미션 [{title}]이(가) 로드되었습니다!', {
          title: initialCustomMission.title,
        })
      );
    }
  }, [initialCustomMission, setCoachingMessage]);

  const processKeyInput = useCallback(
    (key: string) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) {
        return;
      }

      if (hardcoreMode) {
        const check = hardcoreGuardRef.current.checkKey(key, Date.now());
        if (check.blocked) {
          triggerHardcoreViolation(check.message!, check.suggestion);
          return;
        }
      }

      const { baseState, baseKeystrokes, baseSteps, nextActionKeys } = beginTimelineKeyInput(key);
      setMacroPreviewState(null);

      setLastPressedKey(key);
      const nextKeystrokes = baseKeystrokes + 1;
      keystrokeCountRef.current = nextKeystrokes;
      setKeystrokeCount(nextKeystrokes);
      setRecentKeys((prev) => [...prev.slice(-7), key]);

      playKeySound(key, baseState.mode);
      recordKeyInputStats(key);

      if (currentTab === 'speedrun' && speedrunStatus === 'running') {
        setSpeedrunKeystrokes((prev) => prev + 1);
      }

      const coachingAdvice = antiPatternDetectorRef.current.processKey(
        key,
        baseState.mode,
        baseState.pendingKeys
      );
      if (coachingAdvice) {
        setCoachingMessage(coachingAdvice);
        recordAntiPatternDetection(coachingAdvice);
      }

      const nextState = safeHandleKey(baseState, key);
      editorStateRef.current = nextState;
      setEditorState(nextState);
      if (nextState.bell) {
        setBellCount((c) => c + 1);
      }

      commitTimelineKeyStep(baseSteps, nextActionKeys, nextKeystrokes, nextState);
    },
    [
      currentTab,
      speedrunStatus,
      playKeySound,
      hardcoreMode,
      hardcoreGuardRef,
      triggerHardcoreViolation,
      antiPatternDetectorRef,
      beginTimelineKeyInput,
      commitTimelineKeyStep,
      editorStateRef,
      keystrokeCountRef,
      setEditorState,
      setKeystrokeCount,
      setRecentKeys,
      setLastPressedKey,
      setCoachingMessage,
      setMacroPreviewState,
      setBellCount,
      setSpeedrunKeystrokes,
    ]
  );

  return { isCompleted, processKeyInput };
}
