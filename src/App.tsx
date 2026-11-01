import { useEffect, useState, useCallback, useRef } from 'react';
import { Editor } from './components/Editor/Editor';
import { StatusBar } from './components/StatusBar/StatusBar';
import { MissionPanel, calculateStars } from './components/MissionPanel/MissionPanel';
import { Keycaster } from './components/Keycaster/Keycaster';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { LessonSelectModal } from './components/LessonSelectModal/LessonSelectModal';
import { DiffViewer } from './components/DiffViewer/DiffViewer';
import { VirtualKeyboard } from './components/VirtualKeyboard/VirtualKeyboard';
import { SpeedrunPanel } from './components/SpeedrunPanel/SpeedrunPanel';
import { ThemeSwitcher } from './components/ThemeSwitcher/ThemeSwitcher';
import { CustomMissionModal } from './components/CustomMissionModal/CustomMissionModal';
import { RegisterInspector } from './components/RegisterInspector/RegisterInspector';
import { ArcadeSurvival } from './components/ArcadeSurvival/ArcadeSurvival';
import { AnalyticsModal } from './components/AnalyticsModal/AnalyticsModal';
import { DailyChallengeModal } from './components/DailyChallengeModal/DailyChallengeModal';
import { ConfigExporterModal } from './components/ConfigExporterModal/ConfigExporterModal';
import { DungeonRPG } from './components/DungeonRPG/DungeonRPG';
import { HardcoreDojo } from './components/HardcoreDojo/HardcoreDojo';
import { VimGrammarASTViewer } from './components/VimGrammarASTViewer/VimGrammarASTViewer';
import { BYOCModal } from './components/BYOCModal/BYOCModal';
import { ActionTimelinePanel } from './components/ActionTimelinePanel/ActionTimelinePanel';
import {
  ActionTimelineStep,
  createInitialTimelineStep,
  formatCommandLabel,
  getActionDescription,
} from './utils/actionTimeline';
import { VimEditorState, SplitPaneState } from './types/vim';
import { Mission } from './types/mission';
import { handleKey } from './engine/vimEngine';
import { switchPaneFocus } from './engine/splitWindow';
import { MISSIONS } from './data/missions';
import { SANDBOX_INITIAL_LINES } from './data/sandbox';
import {
  loadProgress,
  saveLessonRecord,
  loadRelativeLineSetting,
  saveRelativeLineSetting,
  loadVirtualKeyboardSetting,
  saveVirtualKeyboardSetting,
  loadDiffViewSetting,
  saveDiffViewSetting,
  loadRegisterInspectorSetting,
  saveRegisterInspectorSetting,
  loadGrammarASTSetting,
  saveGrammarASTSetting,
  loadActionTimelineSetting,
  saveActionTimelineSetting,
  loadSpeedrunRecord,
  saveSpeedrunRecord,
  loadHardcoreMode,
  saveHardcoreMode,
  SpeedrunRecord,
  LessonProgress,
} from './utils/storage';
import { normalizeImeKey } from './utils/imeHelper';
import { AntiPatternDetector } from './utils/antiPatternDetector';
import { HardcoreGuard } from './utils/hardcoreGuard';
import {
  loadThemeSetting,
  saveThemeSetting,
  applyTheme,
  VimTheme,
} from './utils/theme';
import { useSoundEffects } from './utils/soundEffects';
import {
  getChallengeFromUrl,
  createCustomMissionObject,
  CustomMissionData,
} from './utils/customMission';
import {
  recordKeyInputStats,
  recordAntiPatternDetection,
} from './utils/analyticsStorage';
import {
  loadActivePresets,
  saveActivePresets,
  loadLeaderKey,
  saveLeaderKey,
  compileUserKeymaps,
} from './utils/keymapStorage';
import './App.css';

/** 스피드런 챌린지 후보 미션 ID 목록 (리팩토링/편집 미션) */
export const SPEEDRUN_CANDIDATE_IDS = [4, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19];

export function generateSpeedrunStages(): Mission[] {
  const candidates = MISSIONS.filter((m) => SPEEDRUN_CANDIDATE_IDS.includes(m.id));
  const shuffled = [...candidates].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5);
}

export function App() {
  const initialChallenge = useRef(getChallengeFromUrl()).current;
  const initialCustomMission = initialChallenge ? createCustomMissionObject(initialChallenge) : null;

  const [currentTab, setCurrentTab] = useState<
    'course' | 'sandbox' | 'speedrun' | 'custom' | 'arcade' | 'dungeon' | 'dojo'
  >(initialCustomMission ? 'custom' : 'course');
  const [customMission, setCustomMission] = useState<Mission | null>(initialCustomMission);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isBYOCModalOpen, setIsBYOCModalOpen] = useState(false);
  const [showGrammarAST, setShowGrammarAST] = useState<boolean>(() => loadGrammarASTSetting());

  // 🔥 하드코어 수련 모드 및 가드 상태
  const [hardcoreMode, setHardcoreMode] = useState<boolean>(() => loadHardcoreMode());
  const hardcoreGuardRef = useRef(new HardcoreGuard());
  const [isEditorShaking, setIsEditorShaking] = useState(false);
  const [hardcoreWarning, setHardcoreWarning] = useState<string | null>(null);
  const shakeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleToggleHardcoreMode = useCallback(() => {
    setHardcoreMode((prev) => {
      const next = !prev;
      saveHardcoreMode(next);
      return next;
    });
  }, []);

  const triggerHardcoreViolation = useCallback((msg: string, suggestion?: string) => {
    setIsEditorShaking(true);
    setHardcoreWarning(`${msg}${suggestion ? ` 👉 ${suggestion}` : ''}`);

    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsEditorShaking(false);
    }, 400);

    setTimeout(() => {
      setHardcoreWarning(null);
    }, 2500);
  }, []);

  const handleEditorAreaClick = useCallback(() => {
    if (hardcoreMode) {
      const check = hardcoreGuardRef.current.checkMouseClick();
      if (check.blocked) {
        triggerHardcoreViolation(check.message!, check.suggestion);
      }
    }
  }, [hardcoreMode, triggerHardcoreViolation]);

  // 커스텀 키매핑 프리셋 및 리더 키 상태
  const [activePresets, setActivePresets] = useState<Record<string, boolean>>(() => loadActivePresets());
  const [leaderKey, setLeaderKey] = useState<string>(() => loadLeaderKey());

  const handleTogglePreset = useCallback((presetId: string) => {
    setActivePresets((prev) => {
      const updated = { ...prev, [presetId]: !prev[presetId] };
      saveActivePresets(updated);
      setEditorState((st) => ({
        ...st,
        userKeymaps: compileUserKeymaps(updated, leaderKey, st.userKeymaps),
      }));
      return updated;
    });
  }, [leaderKey]);

  const handleChangeLeaderKey = useCallback((newLeader: string) => {
    setLeaderKey(newLeader);
    saveLeaderKey(newLeader);
    setEditorState((st) => ({
      ...st,
      leaderKey: newLeader,
      userKeymaps: compileUserKeymaps(activePresets, newLeader, st.userKeymaps),
    }));
  }, [activePresets]);

  // 테마 관리
  const [currentTheme, setCurrentTheme] = useState<VimTheme>(() => loadThemeSetting());
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = useCallback((newTheme: VimTheme) => {
    setCurrentTheme(newTheme);
    saveThemeSetting(newTheme);
    applyTheme(newTheme);
  }, []);

  // Web Audio 기계식 키보드 음향 효과음 훅
  const { isMuted, toggleMute, playKeySound, playSuccessSound } = useSoundEffects();

  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [relativeLineNumbers, setRelativeLineNumbers] = useState<boolean>(() => loadRelativeLineSetting());
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(() => loadVirtualKeyboardSetting());
  const [showDiffView, setShowDiffView] = useState<boolean>(() => loadDiffViewSetting());
  const [showRegisterInspector, setShowRegisterInspector] = useState<boolean>(() => loadRegisterInspectorSetting());
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(true);

  const handleToggleRegisterInspector = useCallback(() => {
    setShowRegisterInspector((prev) => {
      const next = !prev;
      saveRegisterInspectorSetting(next);
      return next;
    });
  }, []);

  const handleToggleGrammarAST = useCallback(() => {
    setShowGrammarAST((prev) => {
      const next = !prev;
      saveGrammarASTSetting(next);
      return next;
    });
  }, []);

  const handleSwitchPane = useCallback((targetIndex: number) => {
    setEditorState((prevState) => switchPaneFocus(prevState, targetIndex));
    setIsEditorFocused(true);
  }, []);

  const currentMission = MISSIONS[currentMissionIndex];

  // 총 입력 타수 및 최근 키 입력 히스토리, 가상 키보드 프레스 상태
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [lastPressedKey, setLastPressedKey] = useState<string | undefined>(undefined);

  // 스마트 코칭: 비효율적 입력 습관(안티패턴) 실시간 분석기
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const antiPatternDetectorRef = useRef(new AntiPatternDetector());

  // 최적 타수(Par) 모범 답안 고스트 리플레이 상태
  const [isGhostReplaying, setIsGhostReplaying] = useState(false);
  const [ghostReplayProgress, setGhostReplayProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const ghostTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 스피드런 상태 관리
  const [speedrunStatus, setSpeedrunStatus] = useState<'ready' | 'running' | 'completed'>('ready');
  const [speedrunStages, setSpeedrunStages] = useState<Mission[]>(() => generateSpeedrunStages());
  const [speedrunCurrentStage, setSpeedrunCurrentStage] = useState(0);
  const [speedrunElapsedSeconds, setSpeedrunElapsedSeconds] = useState(0);
  const [speedrunKeystrokes, setSpeedrunKeystrokes] = useState(0);
  const [speedrunBestRecord, setSpeedrunBestRecord] = useState<SpeedrunRecord | null>(() => loadSpeedrunRecord());
  const [speedrunIsNewRecord, setSpeedrunIsNewRecord] = useState(false);

  const activeSpeedrunMission = speedrunStages[speedrunCurrentStage];

  const getMissionInitialState = useCallback((m: Mission): VimEditorState => {
    const isSplit = m.initialSplit && m.initialSplit !== 'none';
    let splitPanes: [SplitPaneState, SplitPaneState] | undefined = undefined;
    if (isSplit) {
      const p0: SplitPaneState = {
        filename: m.primaryFilename || 'source.ts',
        lines: [...m.initialLines],
        cursor: { ...m.initialCursor },
        mode: 'NORMAL',
      };
      const p1: SplitPaneState = {
        filename: m.secondaryFilename || 'target.ts',
        lines: m.secondaryLines ? [...m.secondaryLines] : [...m.initialLines],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };
      splitPanes = [p0, p1];
    }
    return {
      lines: [...m.initialLines],
      cursor: { ...m.initialCursor },
      mode: 'NORMAL',
      undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
      redoStack: [],
      clipboard: m.initialClipboard,
      primaryFilename: m.primaryFilename,
      secondaryFilename: m.secondaryFilename,
      secondaryLines: m.secondaryLines,
      splitDirection: m.initialSplit ?? 'none',
      splitPanes,
      activePaneIndex: 0,
      userKeymaps: compileUserKeymaps(activePresets, leaderKey),
      leaderKey,
    };
  }, [activePresets, leaderKey]);

  const [editorState, setEditorState] = useState<VimEditorState>(() => {
    if (initialCustomMission) {
      return {
        lines: [...initialCustomMission.initialLines],
        cursor: { ...initialCustomMission.initialCursor },
        mode: 'NORMAL',
        undoStack: [],
        redoStack: [],
        userKeymaps: compileUserKeymaps(activePresets, leaderKey),
        leaderKey,
      };
    }
    return getMissionInitialState(currentMission);
  });

  // 실시간 명령 복기 타임라인 & Vim X-Ray 투시기 상태
  const [showActionTimeline, setShowActionTimeline] = useState<boolean>(() => loadActionTimelineSetting());
  const [timelineSteps, setTimelineSteps] = useState<ActionTimelineStep[]>(() => [
    createInitialTimelineStep(
      initialCustomMission
        ? {
            lines: [...initialCustomMission.initialLines],
            cursor: { ...initialCustomMission.initialCursor },
            mode: 'NORMAL',
            undoStack: [],
            redoStack: [],
            userKeymaps: compileUserKeymaps(activePresets, leaderKey),
            leaderKey,
          }
        : getMissionInitialState(currentMission)
    ),
  ]);
  const [pendingActionKeys, setPendingActionKeys] = useState<string[]>([]);
  const [allKeysSoFar, setAllKeysSoFar] = useState<string[]>([]);
  const [previewStepIndex, setPreviewStepIndex] = useState<number | null>(null);

  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const timelineStepsRef = useRef(timelineSteps);
  timelineStepsRef.current = timelineSteps;
  const pendingActionKeysRef = useRef(pendingActionKeys);
  pendingActionKeysRef.current = pendingActionKeys;
  const allKeysSoFarRef = useRef(allKeysSoFar);
  allKeysSoFarRef.current = allKeysSoFar;
  const keystrokeCountRef = useRef(keystrokeCount);
  keystrokeCountRef.current = keystrokeCount;
  const previewStepIndexRef = useRef(previewStepIndex);
  previewStepIndexRef.current = previewStepIndex;

  const handleToggleActionTimeline = useCallback(() => {
    setShowActionTimeline((prev) => {
      const next = !prev;
      saveActionTimelineSetting(next);
      return next;
    });
  }, []);

  const handleSelectTimelineStep = useCallback((stepIndex: number) => {
    setPreviewStepIndex((prev) => (prev === stepIndex ? null : stepIndex));
    previewStepIndexRef.current = previewStepIndexRef.current === stepIndex ? null : stepIndex;
  }, []);

  const handleCancelPreview = useCallback(() => {
    setPreviewStepIndex(null);
    previewStepIndexRef.current = null;
  }, []);

  const handleBranchFromStep = useCallback((stepIndex: number) => {
    const targetStep = timelineStepsRef.current[stepIndex];
    if (!targetStep) return;

    editorStateRef.current = targetStep.snapshot;
    setEditorState(targetStep.snapshot);

    keystrokeCountRef.current = targetStep.keystrokesSoFar;
    setKeystrokeCount(targetStep.keystrokesSoFar);

    previewStepIndexRef.current = null;
    setPreviewStepIndex(null);

    pendingActionKeysRef.current = [];
    setPendingActionKeys([]);

    // stepIndex 이후 스텝들 잘라내기 (해당 시점부터 분기)
    const slicedSteps = timelineStepsRef.current.slice(0, stepIndex + 1);
    timelineStepsRef.current = slicedSteps;
    setTimelineSteps(slicedSteps);

    // allKeysSoFar도 targetStep 시점까지의 키들만 보존
    const prunedKeys: string[] = [];
    for (let i = 1; i <= stepIndex; i++) {
      if (timelineStepsRef.current[i]) {
        prunedKeys.push(...timelineStepsRef.current[i].keys);
      }
    }
    allKeysSoFarRef.current = prunedKeys;
    setAllKeysSoFar(prunedKeys);
    setCoachingMessage(`⏪ 스텝 #${stepIndex} (${targetStep.command}) 시점부터 이어서 플레이합니다!`);
  }, []);

  const resetActionTimeline = useCallback((initialState: VimEditorState) => {
    const step0 = [createInitialTimelineStep(initialState)];
    setTimelineSteps(step0);
    timelineStepsRef.current = step0;
    setPendingActionKeys([]);
    pendingActionKeysRef.current = [];
    setAllKeysSoFar([]);
    allKeysSoFarRef.current = [];
    setPreviewStepIndex(null);
    previewStepIndexRef.current = null;
    editorStateRef.current = initialState;
    keystrokeCountRef.current = 0;
  }, []);

  const displayEditorState =
    previewStepIndex !== null && timelineSteps[previewStepIndex]
      ? timelineSteps[previewStepIndex].snapshot
      : editorState;

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
  }, [currentTab, isCompleted, currentMission.id, currentMission.par, keystrokeCount]);

  // 미션 클리어 시 레트로 8비트 아르페지오 성공 효과음 재생
  const wasCompletedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !wasCompletedRef.current) {
      playSuccessSound();
    }
    wasCompletedRef.current = isCompleted;
  }, [isCompleted, playSuccessSound]);

  // URL에서 커스텀 미션을 감지한 경우 안내 코칭 메시지 표시
  useEffect(() => {
    if (initialCustomMission) {
      setCoachingMessage(`⛳ URL 커스텀 Vim Golf 미션 [${initialCustomMission.title}]이(가) 로드되었습니다!`);
    }
  }, [initialCustomMission]);

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
        // 다음 스테이지로 즉시 이동
        const nextStageIdx = speedrunCurrentStage + 1;
        setSpeedrunCurrentStage(nextStageIdx);
        const nextMission = speedrunStages[nextStageIdx];
        setEditorState({
          lines: [...nextMission.initialLines],
          cursor: { ...nextMission.initialCursor },
          mode: 'NORMAL',
          undoStack: nextMission.initialUndoStack ? [...nextMission.initialUndoStack] : [],
          redoStack: [],
          clipboard: nextMission.initialClipboard,
        });
        setCoachingMessage(`🎉 스테이지 ${speedrunCurrentStage + 1} 돌파! 다음 목표로 이동합니다.`);
      } else {
        // 5개 스테이지 최종 완료!
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
  ]);

  const handleStopGhostReplay = useCallback(() => {
    if (ghostTimerRef.current) {
      clearInterval(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }
    setIsGhostReplaying(false);
    setLastPressedKey(undefined);
  }, []);

  const handleStartGhostReplay = useCallback(() => {
    const keys = currentMission.optimalKeys;
    if (!keys || keys.length === 0) return;

    if (ghostTimerRef.current) {
      clearInterval(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }

    let currentState = getMissionInitialState(currentMission);
    setEditorState(currentState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setIsGhostReplaying(true);
    setGhostReplayProgress({ current: 0, total: keys.length });

    let step = 0;
    ghostTimerRef.current = setInterval(() => {
      if (step >= keys.length) {
        if (ghostTimerRef.current) {
          clearInterval(ghostTimerRef.current);
          ghostTimerRef.current = null;
        }
        setIsGhostReplaying(false);
        setLastPressedKey(undefined);
        return;
      }

      const key = keys[step];
      const prevMode = currentState.mode;
      currentState = handleKey(currentState, key);
      setEditorState(currentState);

      setLastPressedKey(key);
      playKeySound(key, prevMode);
      setKeystrokeCount((prev) => prev + 1);
      setRecentKeys((prev) => [...prev.slice(-7), key]);
      step += 1;
      setGhostReplayProgress({ current: step, total: keys.length });

      if (step >= keys.length) {
        if (ghostTimerRef.current) {
          clearInterval(ghostTimerRef.current);
          ghostTimerRef.current = null;
        }
        setIsGhostReplaying(false);
        setLastPressedKey(undefined);
      }
    }, 350);
  }, [currentMission, playKeySound]);

  useEffect(() => {
    return () => {
      if (ghostTimerRef.current) {
        clearInterval(ghostTimerRef.current);
      }
    };
  }, []);

  const handleSelectMission = useCallback((index: number) => {
    if (index >= 0 && index < MISSIONS.length) {
      handleStopGhostReplay();
      setCurrentMissionIndex(index);
      const nextMission = MISSIONS[index];
      const initState = getMissionInitialState(nextMission);
      setEditorState(initState);
      resetActionTimeline(initState);
      setKeystrokeCount(0);
      setRecentKeys([]);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      antiPatternDetectorRef.current.reset();
    }
  }, [handleStopGhostReplay, getMissionInitialState, resetActionTimeline]);

  const handleResetMission = useCallback(() => {
    handleStopGhostReplay();
    const initState = getMissionInitialState(currentMission);
    setEditorState(initState);
    resetActionTimeline(initState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    antiPatternDetectorRef.current.reset();
  }, [currentMission, handleStopGhostReplay, getMissionInitialState, resetActionTimeline]);

  const handleResetSandbox = useCallback(() => {
    handleStopGhostReplay();
    const initState = {
      lines: [...SANDBOX_INITIAL_LINES],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL' as const,
      undoStack: [],
      redoStack: [],
      userKeymaps: compileUserKeymaps(activePresets, leaderKey),
      leaderKey,
    };
    setEditorState(initState);
    resetActionTimeline(initState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    antiPatternDetectorRef.current.reset();
  }, [handleStopGhostReplay, resetActionTimeline, activePresets, leaderKey]);

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
    const initState: VimEditorState = {
      lines: [...first.initialLines],
      cursor: { ...first.initialCursor },
      mode: 'NORMAL',
      undoStack: first.initialUndoStack ? [...first.initialUndoStack] : [],
      redoStack: [],
      clipboard: first.initialClipboard,
    };
    setEditorState(initState);
    resetActionTimeline(initState);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    antiPatternDetectorRef.current.reset();
  }, [handleStopGhostReplay, resetActionTimeline]);

  const handleResetCustomMission = useCallback(() => {
    if (!customMission) return;
    handleStopGhostReplay();
    const initState: VimEditorState = {
      lines: [...customMission.initialLines],
      cursor: { ...customMission.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    setEditorState(initState);
    resetActionTimeline(initState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(null);
    antiPatternDetectorRef.current.reset();
  }, [customMission, handleStopGhostReplay, resetActionTimeline]);

  const handlePlayCustomMission = useCallback((data: CustomMissionData) => {
    handleStopGhostReplay();
    const newMission = createCustomMissionObject(data);
    setCustomMission(newMission);
    setCurrentTab('custom');
    const initState: VimEditorState = {
      lines: [...newMission.initialLines],
      cursor: { ...newMission.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    };
    setEditorState(initState);
    resetActionTimeline(initState);
    setKeystrokeCount(0);
    setRecentKeys([]);
    setLastPressedKey(undefined);
    setCoachingMessage(`⛳ 커스텀 미션 [${newMission.title}] 시작! 최소 타수로 완성을 노려보세요.`);
    antiPatternDetectorRef.current.reset();
  }, [handleStopGhostReplay, resetActionTimeline]);

  const handlePlayBYOCMission = useCallback(
    (missionData: {
      title: string;
      description: string;
      initialText: string;
      targetText: string;
      par: number;
      hint: string;
    }) => {
      handlePlayCustomMission({
        title: missionData.title,
        description: missionData.description,
        initialText: missionData.initialText,
        targetText: missionData.targetText,
        par: missionData.par,
      });
      setShowDiffView(true);
      saveDiffViewSetting(true);
      setCoachingMessage(`⛳ [BYOC] 리팩토링 미션 시작! 힌트: ${missionData.hint}`);
    },
    [handlePlayCustomMission]
  );

  const handleSwitchTab = useCallback(
    (tab: 'course' | 'sandbox' | 'speedrun' | 'custom' | 'arcade' | 'dungeon' | 'dojo') => {
      handleStopGhostReplay();
      setCurrentTab(tab);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      antiPatternDetectorRef.current.reset();

      if (tab === 'sandbox') {
        handleResetSandbox();
      } else if (tab === 'speedrun') {
        setSpeedrunStatus('ready');
        setSpeedrunElapsedSeconds(0);
        setSpeedrunKeystrokes(0);
        setSpeedrunIsNewRecord(false);
      } else if (tab === 'arcade') {
        // 아케이드 서바이벌 모드는 자체 상태를 갖습니다
      } else if (tab === 'dungeon') {
        // 던전 RPG 모드는 자체 상태를 갖습니다
      } else if (tab === 'dojo') {
        // 하드코어 도장 모드는 자체 상태를 갖습니다
      } else if (tab === 'custom' && customMission) {
        setEditorState({
          lines: [...customMission.initialLines],
          cursor: { ...customMission.initialCursor },
          mode: 'NORMAL',
          undoStack: [],
          redoStack: [],
        });
        setKeystrokeCount(0);
        setRecentKeys([]);
      } else {
        const mission = MISSIONS[currentMissionIndex];
        setEditorState(getMissionInitialState(mission));
        setKeystrokeCount(0);
        setRecentKeys([]);
      }
    },
    [currentMissionIndex, handleResetSandbox, customMission, handleStopGhostReplay, getMissionInitialState]
  );

  const handleToggleRelativeLine = useCallback(() => {
    setRelativeLineNumbers((prev) => {
      const next = !prev;
      saveRelativeLineSetting(next);
      return next;
    });
  }, []);

  const handleToggleVirtualKeyboard = useCallback(() => {
    setShowVirtualKeyboard((prev) => {
      const next = !prev;
      saveVirtualKeyboardSetting(next);
      return next;
    });
  }, []);

  const handleToggleDiffView = useCallback(() => {
    setShowDiffView((prev) => {
      const next = !prev;
      saveDiffViewSetting(next);
      return next;
    });
  }, []);

  // 실제 키 입력 또는 가상 키보드 클릭 시 공통 실행 함수
  const processKeyInput = useCallback(
    (key: string) => {
      // 단독 보조 키 필터링
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(key)) {
        return;
      }

      // 🔥 하드코어 모드 가드 검사
      if (hardcoreMode) {
        const check = hardcoreGuardRef.current.checkKey(key, Date.now());
        if (check.blocked) {
          triggerHardcoreViolation(check.message!, check.suggestion);
          return;
        }
      }

      // 과거 스텝을 미리보는 중 키를 입력하면 해당 시점에서 자동 분기(Branch)
      let baseState = editorStateRef.current;
      let baseKeystrokes = keystrokeCountRef.current;
      let baseSteps = timelineStepsRef.current;
      let currentPending = pendingActionKeysRef.current;
      let baseAllKeys = allKeysSoFarRef.current;

      if (previewStepIndexRef.current !== null) {
        const targetStep = timelineStepsRef.current[previewStepIndexRef.current];
        if (targetStep) {
          baseState = targetStep.snapshot;
          baseKeystrokes = targetStep.keystrokesSoFar;
          baseSteps = timelineStepsRef.current.slice(0, previewStepIndexRef.current + 1);
          currentPending = [];
          const pruned: string[] = [];
          for (let i = 1; i <= previewStepIndexRef.current; i++) {
            if (timelineStepsRef.current[i]) pruned.push(...timelineStepsRef.current[i].keys);
          }
          baseAllKeys = pruned;
        }
        previewStepIndexRef.current = null;
        setPreviewStepIndex(null);
      }

      setLastPressedKey(key);
      const nextKeystrokes = baseKeystrokes + 1;
      keystrokeCountRef.current = nextKeystrokes;
      setKeystrokeCount(nextKeystrokes);
      setRecentKeys((prev) => [...prev.slice(-7), key]);

      const nextAllKeys = [...baseAllKeys, key];
      allKeysSoFarRef.current = nextAllKeys;
      setAllKeysSoFar(nextAllKeys);

      const nextActionKeys = [...currentPending, key];

      // Web Audio 기계식 키보드 타건 효과음 재생
      playKeySound(key, baseState.mode);

      // 전체 누적 키 입력 통계 기록
      recordKeyInputStats(key);

      if (currentTab === 'speedrun' && speedrunStatus === 'running') {
        setSpeedrunKeystrokes((prev) => prev + 1);
      }

      // 스마트 코칭 시스템: 비효율적 입력 습관(안티패턴) 실시간 감지
      const coachingAdvice = antiPatternDetectorRef.current.processKey(
        key,
        baseState.mode,
        baseState.pendingKeys
      );
      if (coachingAdvice) {
        setCoachingMessage(coachingAdvice);
        recordAntiPatternDetection(coachingAdvice);
      }

      const nextState = handleKey(baseState, key);
      editorStateRef.current = nextState;
      setEditorState(nextState);

      // 액션 완료 판정 (NORMAL 모드 복귀 및 대기 키 없음)
      if (nextState.mode === 'NORMAL' && !nextState.pendingKeys) {
        const newStep: ActionTimelineStep = {
          stepIndex: baseSteps.length,
          command: formatCommandLabel(nextActionKeys),
          description: getActionDescription(nextActionKeys, nextState),
          keys: nextActionKeys,
          keystrokesSoFar: nextKeystrokes,
          snapshot: nextState,
          timestamp: Date.now(),
        };
        const updatedSteps = [...baseSteps, newStep];
        timelineStepsRef.current = updatedSteps;
        setTimelineSteps(updatedSteps);
        pendingActionKeysRef.current = [];
        setPendingActionKeys([]);
      } else {
        timelineStepsRef.current = baseSteps;
        setTimelineSteps(baseSteps);
        pendingActionKeysRef.current = nextActionKeys;
        setPendingActionKeys(nextActionKeys);
      }
    },
    [currentTab, speedrunStatus, playKeySound, hardcoreMode, triggerHardcoreViolation]
  );

  // 브라우저 윈도우 포커스/블러 감지
  useEffect(() => {
    const handleWindowFocus = () => setIsEditorFocused(true);
    const handleWindowBlur = () => setIsEditorFocused(false);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 고스트 리플레이 재생 중 사용자가 키를 누르면 리플레이 중지
      if (isGhostReplaying) {
        handleStopGhostReplay();
        return;
      }

      // 모달이 열려 있거나 아케이드/던전/도장 모드일 때는 기본 에디터 키 입력을 차단
      if (
        isModalOpen ||
        isCustomModalOpen ||
        isAnalyticsModalOpen ||
        isDailyModalOpen ||
        isConfigModalOpen ||
        isBYOCModalOpen ||
        currentTab === 'arcade' ||
        currentTab === 'dungeon' ||
        currentTab === 'dojo'
      ) {
        return;
      }

      // 키 입력 시 에디터 포커스 자동 활성화
      if (!isEditorFocused) {
        setIsEditorFocused(true);
      }

      // 단독 메타/보조 키는 타수 및 엔진 전달 제외
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      // Ctrl+r 또는 Cmd+r: Redo 실행 취소 취소 (브라우저 페이지 새로고침 완벽 차단)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        processKeyInput('Ctrl-r');
        return;
      }

      // Ctrl+w 또는 Cmd+w 또는 Alt+w: 윈도우 분할(NORMAL/VISUAL) 및 단어 삭제(INSERT)
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'w' || e.key === 'W')) {
        if (editorState.mode === 'NORMAL' || editorState.mode.startsWith('VISUAL') || editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-w');
          return;
        }
      }

      // Ctrl+h 또는 Cmd+h 또는 Alt+h: INSERT 모드 백스페이스
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'h' || e.key === 'H')) {
        if (editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-h');
          return;
        }
      }

      // Ctrl+n 또는 Cmd+n 또는 Alt+n: INSERT 모드 인버퍼 자동완성 (다음 후보)
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'n' || e.key === 'N')) {
        if (editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-n');
          return;
        }
      }

      // Ctrl+p 또는 Cmd+p 또는 Alt+p: INSERT 모드 인버퍼 자동완성 (이전 후보)
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'p' || e.key === 'P')) {
        if (editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-p');
          return;
        }
      }

      // Ctrl+h/j/k/l: 분할 창 빠른 이동 (브라우저 히스토리/다운로드 기본 동작 차단)
      if ((e.ctrlKey || e.metaKey) && ['h', 'j', 'k', 'l'].includes(e.key.toLowerCase())) {
        if (editorState.mode === 'NORMAL' && activePresets['ctrlWindowNav']) {
          e.preventDefault();
          processKeyInput(`Ctrl-${e.key.toLowerCase()}`);
          return;
        }
      }

      // Ctrl+f 또는 Cmd+f: 브라우저 찾기 대신 Vim 검색 모드(/) 진입 유도
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        processKeyInput('/');
        return;
      }

      // Ctrl+v 또는 Cmd+v: 비주얼 블록(VISUAL_BLOCK) 모드 토글
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (editorState.mode !== 'INSERT' && editorState.mode !== 'COMMAND' && editorState.mode !== 'SEARCH') {
          e.preventDefault();
          processKeyInput('Ctrl-v');
          return;
        }
      }

      // Ctrl+o 또는 Cmd+o 또는 Alt+o: 점프 리스트 이전 위치(NORMAL) 및 일회성 Normal 명령(INSERT)
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'o' || e.key === 'O')) {
        if (editorState.mode === 'NORMAL' || editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-o');
          return;
        }
      }

      // Ctrl+i 또는 Cmd+i: 점프 리스트 다음 위치
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
        if (editorState.mode === 'NORMAL') {
          e.preventDefault();
          processKeyInput('Ctrl-i');
          return;
        }
      }

      // Ctrl+a 또는 Cmd+a: 숫자 증가 (NORMAL 모드에서 브라우저 전체 선택 차단)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        if (editorState.mode === 'NORMAL') {
          e.preventDefault();
          processKeyInput('Ctrl-a');
          return;
        }
      }

      // Ctrl+x 또는 Cmd+x: 숫자 감소 (NORMAL 모드에서 브라우저 잘라내기 차단)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
        if (editorState.mode === 'NORMAL') {
          e.preventDefault();
          processKeyInput('Ctrl-x');
          return;
        }
      }

      // Ctrl+d 또는 Cmd+d: 반 페이지 아래 스크롤 (브라우저 북마크 차단)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (editorState.mode === 'NORMAL' || editorState.mode.startsWith('VISUAL')) {
          e.preventDefault();
          processKeyInput('Ctrl-d');
          return;
        }
      }

      // Ctrl+u 또는 Cmd+u 또는 Alt+u: 반 페이지 위 스크롤 (NORMAL/VISUAL) 및 줄 시작까지 삭제 (INSERT)
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'u' || e.key === 'U')) {
        if (editorState.mode === 'NORMAL' || editorState.mode.startsWith('VISUAL') || editorState.mode === 'INSERT') {
          e.preventDefault();
          processKeyInput('Ctrl-u');
          return;
        }
      }

      // 그 외 메타 키 조합은 브라우저 기본 단축키 허용
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      // 브라우저 기본 스크롤, 포커스 이동, 검색창, 엔터(버튼 재클릭 방지), 뒤로가기 방지
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          ' ',
          'Backspace',
          'Tab',
          '/',
          'Enter',
          'PageUp',
          'PageDown',
        ].includes(e.key)
      ) {
        e.preventDefault();
      }

      // 이전 UI 버튼에 남아 있는 HTML 포커스 해제
      if (
        document.activeElement &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.tagName !== 'BODY'
      ) {
        document.activeElement.blur();
      }

      // 한/영 입력기(IME) 정규화: NORMAL/VISUAL 모드에서 물리 키코드(e.code)를 매핑해 한글 상태에서도 이동/명령 유지
      const { key: normalizedKey, isNormalized } = normalizeImeKey(e, editorState.mode);

      if (isNormalized) {
        setCoachingMessage(`💡 한글 입력이 감지되어 영문('${normalizedKey}')으로 자동 매핑되었습니다. 원활한 입력을 위해 [한/영] 전환을 권장합니다.`);
      } else if (e.key === 'Process' || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(e.key)) {
        setCoachingMessage('⚠️ 현재 한글 입력 상태입니다. 원활한 Vim 명령어 입력을 위해 [한/영] 키를 눌러 영문 모드로 전환해 주세요!');
      }

      // 🔥 하드코어 모드 가드: 방향키/연타 조기 차단
      if (hardcoreMode) {
        const check = hardcoreGuardRef.current.checkKey(normalizedKey, Date.now());
        if (check.blocked) {
          triggerHardcoreViolation(check.message!, check.suggestion);
          e.preventDefault();
          return;
        }
      }

      processKeyInput(normalizedKey);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isModalOpen,
    isCustomModalOpen,
    isAnalyticsModalOpen,
    isDailyModalOpen,
    isConfigModalOpen,
    activePresets,
    currentTab,
    isGhostReplaying,
    handleStopGhostReplay,
    isEditorFocused,
    editorState.mode,
    hardcoreMode,
    triggerHardcoreViolation,
    processKeyInput,
  ]);

  const activeMissionForDiff =
    currentTab === 'course'
      ? currentMission
      : currentTab === 'custom' && customMission
      ? customMission
      : currentTab === 'speedrun' && speedrunStatus === 'running'
      ? activeSpeedrunMission
      : undefined;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⌨</span>
          <h1 className="brand-title">VimPracticeOnWeb</h1>
        </div>
        <p className="header-desc">인터랙티브 Vim 튜토리얼 &amp; 연습 코스</p>
      </header>

      {/* 탭 전환 및 상단 툴바 */}
      <div className="app-nav-bar" data-testid="app-nav-bar">
        <div className="nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={currentTab === 'course'}
            className={`nav-tab-btn ${currentTab === 'course' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('course')}
            data-testid="tab-course-btn"
          >
            🎯 튜토리얼 코스
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'sandbox'}
            className={`nav-tab-btn ${currentTab === 'sandbox' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('sandbox')}
            data-testid="tab-sandbox-btn"
          >
            🧪 자유 연습장
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'speedrun'}
            className={`nav-tab-btn ${currentTab === 'speedrun' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('speedrun')}
            data-testid="tab-speedrun-btn"
          >
            ⚡ 스피드런
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'arcade'}
            className={`nav-tab-btn ${currentTab === 'arcade' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('arcade')}
            data-testid="tab-arcade-btn"
          >
            👾 아케이드
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'dungeon'}
            className={`nav-tab-btn ${currentTab === 'dungeon' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('dungeon')}
            data-testid="tab-dungeon-btn"
          >
            🗡️ 던전 RPG
          </button>
          <button
            role="tab"
            aria-selected={currentTab === 'dojo'}
            className={`nav-tab-btn ${currentTab === 'dojo' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('dojo')}
            data-testid="tab-dojo-btn"
          >
            🥋 도장
          </button>
          {customMission && (
            <button
              role="tab"
              aria-selected={currentTab === 'custom'}
              className={`nav-tab-btn ${currentTab === 'custom' ? 'active' : ''}`}
              onClick={() => handleSwitchTab('custom')}
              data-testid="tab-custom-btn"
            >
              ⛳ 커스텀 골프
            </button>
          )}
        </div>

        <div className="nav-actions">
          {/* 🔥 하드코어 수련 모드 토글 스위치 */}
          <button
            className={`toolbar-btn hardcore-mode-btn ${hardcoreMode ? 'active' : ''}`}
            onClick={handleToggleHardcoreMode}
            data-testid="toggle-hardcore-mode-btn"
            title="🔥 하드코어 수련 모드: 방향키 및 마우스 완전 차단, 1.5초 3회 초과 연타 무시"
          >
            {hardcoreMode ? '🔥 하드코어: ON' : '🔥 하드코어: OFF'}
          </button>

          {/* 커스텀 키매핑 및 설정 파일 내보내기 모달 */}
          <button
            className="toolbar-btn config-export-btn"
            onClick={() => setIsConfigModalOpen(true)}
            data-testid="open-config-modal-btn"
            title="키매핑 프리셋 설정 및 .vimrc/init.lua/VS Code/IdeaVim 설정 내보내기"
          >
            ⚙️ 설정/내보내기
          </button>

          {/* 숙련도 분석 대시보드 모달 */}
          <button
            className="toolbar-btn analytics-btn"
            onClick={() => setIsAnalyticsModalOpen(true)}
            data-testid="open-analytics-modal-btn"
            title="Vim 숙련도 5각 레이더 및 명령어 사용 통계 대시보드"
          >
            📊 숙련도 분석
          </button>

          {/* 데일리 챌린지 모달 */}
          <button
            className="toolbar-btn daily-challenge-btn"
            onClick={() => setIsDailyModalOpen(true)}
            data-testid="open-daily-modal-btn"
            title="오늘의 데일리 Vim Golf 챌린지"
          >
            📅 데일리
          </button>

          {/* 커스텀 Vim Golf 미션 생성 모달 */}
          <button
            className="toolbar-btn custom-mission-btn"
            onClick={() => setIsCustomModalOpen(true)}
            data-testid="open-custom-modal-btn"
            title="URL 공유 가능한 커스텀 Vim Golf 미션 생성기"
          >
            ⛳ 미션 만들기
          </button>

          {/* 에디터 컬러 테마 스위처 */}
          <ThemeSwitcher
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
          />

          {/* 기계식 키보드 음향 효과음 토글 */}
          <button
            className={`toolbar-btn sound-toggle-btn ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
            data-testid="toggle-sound-btn"
            title="기계식 키보드 타건 효과음 토글"
          >
            {isMuted ? '🔇 소리: OFF' : '🔊 소리: ON'}
          </button>

          {currentTab === 'course' && (
            <button
              className="toolbar-btn lesson-list-btn"
              onClick={() => setIsModalOpen(true)}
              data-testid="open-lesson-modal-btn"
            >
              📚 레슨 목록
            </button>
          )}

          {/* 목표 Diff 뷰 토글 버튼 */}
          {currentTab !== 'sandbox' && (
            <button
              className={`toolbar-btn diff-toggle-btn ${showDiffView ? 'active' : ''}`}
              onClick={handleToggleDiffView}
              data-testid="toggle-diff-view-btn"
              title="목표 텍스트 Diff 비교 뷰어 토글"
            >
              🎯 목표 Diff: {showDiffView ? 'ON' : 'OFF'}
            </button>
          )}

          {/* 실시간 레지스터 인스펙터 토글 버튼 */}
          <button
            className={`toolbar-btn register-toggle-btn ${showRegisterInspector ? 'active' : ''}`}
            onClick={handleToggleRegisterInspector}
            data-testid="toggle-register-inspector-btn"
            title="실시간 레지스터 인스펙터 패널 토글"
          >
            📋 레지스터: {showRegisterInspector ? 'ON' : 'OFF'}
          </button>

          {/* 실시간 Vim 문법 AST 인스펙터 토글 버튼 */}
          <button
            className={`toolbar-btn ast-toggle-btn ${showGrammarAST ? 'active' : ''}`}
            onClick={handleToggleGrammarAST}
            data-testid="toggle-grammar-ast-btn"
            title="실시간 Vim 문법 AST 인스펙터 패널 토글"
          >
            🧩 문법 AST: {showGrammarAST ? 'ON' : 'OFF'}
          </button>

          {/* 실시간 명령 복기 타임라인 & Vim X-Ray 토글 버튼 */}
          <button
            className={`toolbar-btn timeline-toggle-btn ${showActionTimeline ? 'active' : ''}`}
            onClick={handleToggleActionTimeline}
            data-testid="toggle-action-timeline-btn"
            title="실시간 명령 복기 타임라인 & Vim X-Ray 투시기 패널 토글"
          >
            ⏱️ 타임라인 & X-Ray: {showActionTimeline ? 'ON' : 'OFF'}
          </button>

          {/* 가상 키보드 오버레이 토글 버튼 */}
          <button
            className={`toolbar-btn keyboard-toggle-btn ${showVirtualKeyboard ? 'active' : ''}`}
            onClick={handleToggleVirtualKeyboard}
            data-testid="toggle-virtual-keyboard-btn"
            title="반응형 인터랙티브 가상 키보드 패널 토글"
          >
            ⌨ 가상 키보드: {showVirtualKeyboard ? 'ON' : 'OFF'}
          </button>

          <button
            className={`toolbar-btn relativenumber-btn ${relativeLineNumbers ? 'active' : ''}`}
            onClick={handleToggleRelativeLine}
            data-testid="toggle-relativenumber-btn"
            title="상대 라인 번호 (relativenumber) 토글"
          >
            relativenumber: {relativeLineNumbers ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <section className="key-cheatsheet" aria-label="Keyboard Shortcuts">
        <span className="cheat-item"><code>h j k l</code> 이동</span>
        <span className="cheat-item"><code>w b e</code> 단어 점프</span>
        <span className="cheat-item"><code>f F t T</code> 문자 탐색</span>
        <span className="cheat-item"><code>/ n N *</code> 키워드 검색</span>
        <span className="cheat-item"><code>: [숫자] / :s</code> 커맨드라인</span>
        <span className="cheat-item"><code>0 $ ^</code> 줄 이동</span>
        <span className="cheat-item"><code>i a I A o O</code> 입력 진입</span>
        <span className="cheat-item"><code>Esc</code> 일반 모드</span>
        <span className="cheat-item"><code>x</code> 글자 삭제</span>
        <span className="cheat-item"><code>cw cc C r</code> 수정/교체</span>
        <span className="cheat-item"><code>iw i" i(</code> 텍스트 객체</span>
        <span className="cheat-item"><code>v / V</code> 영역 선택</span>
        <span className="cheat-item"><code>dd dw</code> 줄/단어 삭제</span>
        <span className="cheat-item"><code>.</code> 직전 변경 반복</span>
        <span className="cheat-item"><code>m ' Ctrl-o</code> 마크/점프</span>
        <span className="cheat-item"><code>J ~ &gt;&gt; Ctrl-a</code> 라인/편집</span>
        <span className="cheat-item"><code>:g :norm</code> 일괄/글로벌</span>
        <span className="cheat-item"><code>zz H M L</code> 뷰포트/스크롤</span>
        <span className="cheat-item"><code>"a "0 "_</code> 레지스터</span>
        <span className="cheat-item"><code>:sp :vsp Ctrl-w</code> 창 분할</span>
        <span className="cheat-item"><code>p</code> 붙여넣기</span>
        <span className="cheat-item"><code>u / Ctrl-r</code> 실행취소/다시실행</span>
      </section>

      <main className="editor-wrapper">
        <CoachingToast
          message={coachingMessage}
          onDismiss={() => setCoachingMessage(null)}
        />

        {/* 실시간 Vim 명령어 문법 AST 인스펙터 */}
        {showGrammarAST && currentTab !== 'arcade' && currentTab !== 'dungeon' && currentTab !== 'dojo' && (
          <VimGrammarASTViewer
            currentKeySequence={editorState.pendingKeys || ''}
            activeRegister={editorState.activeRegister}
            onSelectCandidate={(token) => {
              for (const ch of token) {
                processKeyInput(ch);
              }
            }}
            onClose={() => setShowGrammarAST(false)}
          />
        )}

        {currentTab === 'arcade' ? (
          <ArcadeSurvival
            onPlayKeySound={playKeySound}
            onPlaySuccessSound={playSuccessSound}
            isMuted={isMuted}
          />
        ) : currentTab === 'dungeon' ? (
          <DungeonRPG
            onPlayKeySound={playKeySound}
            onPlaySuccessSound={playSuccessSound}
            isMuted={isMuted}
          />
        ) : currentTab === 'dojo' ? (
          <HardcoreDojo
            onBackToCourse={() => handleSwitchTab('course')}
            playKeySound={playKeySound}
            playSuccessSound={playSuccessSound}
          />
        ) : (
          <>
            {currentTab === 'course' && (
              <MissionPanel
                mission={currentMission}
                missionIndex={currentMissionIndex}
                totalMissions={MISSIONS.length}
                isCompleted={isCompleted}
                keystrokeCount={keystrokeCount}
                onSelectMission={handleSelectMission}
                onResetMission={handleResetMission}
                onStartGhostReplay={handleStartGhostReplay}
                onStopGhostReplay={handleStopGhostReplay}
                isGhostReplaying={isGhostReplaying}
                ghostReplayProgress={ghostReplayProgress}
              />
            )}

            {currentTab === 'custom' && customMission && (
              <MissionPanel
                mission={customMission}
                missionIndex={0}
                totalMissions={1}
                isCompleted={isCompleted}
                keystrokeCount={keystrokeCount}
                onSelectMission={() => {}}
                onResetMission={handleResetCustomMission}
              />
            )}

            {currentTab === 'sandbox' && (
              <div className="sandbox-panel" data-testid="sandbox-panel">
                <div className="sandbox-info">
                  <span className="sandbox-badge">🧪 SANDBOX</span>
                  <span className="sandbox-desc">
                    미션 제약 없이 모든 Vim 키보드 명령어를 자유롭게 실험해 볼 수 있습니다.
                  </span>
                </div>
                <div className="sandbox-actions">
                  <button
                    className="sandbox-byoc-btn"
                    onClick={() => setIsBYOCModalOpen(true)}
                    data-testid="open-byoc-modal-btn"
                    title="내 실제 업무 코드를 붙여넣어 자동 리팩토링 미션 생성"
                  >
                    ✨ 내 코드로 리팩토링 미션 생성 (BYOC)
                  </button>
                  <button
                    className="sandbox-reset-btn"
                    onClick={handleResetSandbox}
                    data-testid="sandbox-reset-btn"
                  >
                    🔄 코드 초기화
                  </button>
                </div>
              </div>
            )}

            {currentTab === 'speedrun' && (
              <SpeedrunPanel
                status={speedrunStatus}
                currentStageIndex={speedrunCurrentStage}
                totalStages={speedrunStages.length}
                currentMissionTitle={activeSpeedrunMission?.title}
                elapsedSeconds={speedrunElapsedSeconds}
                totalKeystrokes={speedrunKeystrokes}
                bestRecord={speedrunBestRecord}
                isNewRecord={speedrunIsNewRecord}
                onStart={handleStartSpeedrun}
                onRestart={handleStartSpeedrun}
              />
            )}

            {/* 에디터 렌더링 영역 및 하드코어 셰이크/마우스 감시 */}
            <div
              className={`editor-main-viewport ${isEditorShaking ? 'shake-hardcore' : ''}`}
              onClick={handleEditorAreaClick}
              data-testid="editor-main-viewport"
            >
              {hardcoreWarning && (
                <div
                  className="hardcore-warning-banner"
                  role="alert"
                  data-testid="hardcore-warning-banner"
                >
                  <span>{hardcoreWarning}</span>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      color: 'inherit',
                      marginLeft: '0.5rem',
                    }}
                    onClick={() => setHardcoreWarning(null)}
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 에디터 렌더링: 분할 창 모드 vs 단일 창 모드 */}
              {editorState.splitDirection && editorState.splitDirection !== 'none' && editorState.splitPanes ? (
                <div
                  className={`editor-split-container split-${editorState.splitDirection}`}
                  data-testid="editor-split-container"
                >
                  {/* 왼쪽/상단 주 창 (Pane 0) */}
                  <div
                    className={`editor-split-pane ${editorState.activePaneIndex === 0 ? 'active' : ''}`}
                    onClick={() => handleSwitchPane(0)}
                    data-testid="split-pane-0"
                  >
                    <div className="pane-header">
                      <span className="pane-filename">
                        📄 {editorState.primaryFilename || editorState.splitPanes[0].filename || 'source.ts'}
                      </span>
                      {editorState.activePaneIndex === 0 && <span className="pane-active-indicator">FOCUS</span>}
                    </div>
                    <Editor
                      lines={editorState.activePaneIndex === 0 ? editorState.lines : editorState.splitPanes[0].lines}
                      cursor={editorState.activePaneIndex === 0 ? editorState.cursor : editorState.splitPanes[0].cursor}
                      mode={editorState.activePaneIndex === 0 ? editorState.mode : editorState.splitPanes[0].mode}
                      targetPosition={currentTab === 'course' ? currentMission.targetCursor : activeSpeedrunMission?.targetCursor}
                      visualAnchor={editorState.activePaneIndex === 0 ? editorState.visualAnchor : editorState.splitPanes[0].visualAnchor}
                      relativeLineNumbers={relativeLineNumbers}
                      searchQuery={
                        editorState.activePaneIndex === 0 && editorState.mode === 'SEARCH'
                          ? editorState.commandBuffer
                          : editorState.lastSearchQuery
                      }
                      isFocused={isEditorFocused && editorState.activePaneIndex === 0}
                      onFocus={() => handleSwitchPane(0)}
                      marks={editorState.marks}
                      viewport={editorState.activePaneIndex === 0 ? editorState.viewport : editorState.splitPanes[0].viewport}
                      folds={editorState.folds}
                      completionSession={editorState.activePaneIndex === 0 ? editorState.completionSession : undefined}
                      insertNormalSession={editorState.activePaneIndex === 0 ? editorState.insertNormalSession : undefined}
                    />
                  </div>

                  {/* 오른쪽/하단 보조 창 (Pane 1) */}
                  <div
                    className={`editor-split-pane ${editorState.activePaneIndex === 1 ? 'active' : ''}`}
                    onClick={() => handleSwitchPane(1)}
                    data-testid="split-pane-1"
                  >
                    <div className="pane-header">
                      <span className="pane-filename">
                        📄 {editorState.secondaryFilename || editorState.splitPanes[1].filename || 'target.ts'}
                      </span>
                      {editorState.activePaneIndex === 1 && <span className="pane-active-indicator">FOCUS</span>}
                    </div>
                    <Editor
                      lines={editorState.activePaneIndex === 1 ? editorState.lines : editorState.splitPanes[1].lines}
                      cursor={editorState.activePaneIndex === 1 ? editorState.cursor : editorState.splitPanes[1].cursor}
                      mode={editorState.activePaneIndex === 1 ? editorState.mode : editorState.splitPanes[1].mode}
                      targetPosition={currentTab === 'course' ? currentMission.targetCursor : activeSpeedrunMission?.targetCursor}
                      visualAnchor={editorState.activePaneIndex === 1 ? editorState.visualAnchor : editorState.splitPanes[1].visualAnchor}
                      relativeLineNumbers={relativeLineNumbers}
                      searchQuery={
                        editorState.activePaneIndex === 1 && editorState.mode === 'SEARCH'
                          ? editorState.commandBuffer
                          : editorState.lastSearchQuery
                      }
                      isFocused={isEditorFocused && editorState.activePaneIndex === 1}
                      onFocus={() => handleSwitchPane(1)}
                      marks={editorState.marks}
                      viewport={editorState.activePaneIndex === 1 ? editorState.viewport : editorState.splitPanes[1].viewport}
                      folds={editorState.folds}
                      completionSession={editorState.activePaneIndex === 1 ? editorState.completionSession : undefined}
                      insertNormalSession={editorState.activePaneIndex === 1 ? editorState.insertNormalSession : undefined}
                    />
                  </div>
                </div>
              ) : (
                <Editor
                  lines={displayEditorState.lines}
                  cursor={displayEditorState.cursor}
                  mode={displayEditorState.mode}
                  targetPosition={currentTab === 'course' ? currentMission.targetCursor : activeSpeedrunMission?.targetCursor}
                  visualAnchor={displayEditorState.visualAnchor}
                  relativeLineNumbers={relativeLineNumbers}
                  searchQuery={
                    displayEditorState.mode === 'SEARCH'
                      ? displayEditorState.commandBuffer
                      : displayEditorState.lastSearchQuery
                  }
                  isFocused={isEditorFocused}
                  onFocus={() => setIsEditorFocused(true)}
                  marks={displayEditorState.marks}
                  viewport={displayEditorState.viewport}
                  folds={displayEditorState.folds}
                  completionSession={displayEditorState.completionSession}
                  insertNormalSession={displayEditorState.insertNormalSession}
                />
              )}
            </div>
            <Keycaster recentKeys={recentKeys} />
            <StatusBar
              mode={displayEditorState.mode}
              cursor={displayEditorState.cursor}
              insertNormalSession={displayEditorState.insertNormalSession}
              filename={
                displayEditorState.splitPanes
                  ? (displayEditorState.activePaneIndex === 1
                      ? (displayEditorState.secondaryFilename || displayEditorState.splitPanes[1].filename || 'target.ts')
                      : (displayEditorState.primaryFilename || displayEditorState.splitPanes[0].filename || 'source.ts'))
                  : (currentTab === 'course'
                      ? (currentMission.primaryFilename || `lesson_${currentMission.id}.txt`)
                      : currentTab === 'custom'
                      ? 'custom_golf.txt'
                      : currentTab === 'speedrun'
                      ? `speedrun_stage_${speedrunCurrentStage + 1}.txt`
                      : 'sandbox.ts')
              }
              pendingKeys={displayEditorState.pendingKeys}
              recordingMacro={displayEditorState.recordingMacro}
              commandType={displayEditorState.commandType}
              commandBuffer={displayEditorState.commandBuffer}
              commandMessage={displayEditorState.commandMessage}
            />

            {/* 실시간 레지스터 인스펙터 패널 */}
            <RegisterInspector
              isOpen={showRegisterInspector}
              onToggle={handleToggleRegisterInspector}
              registers={editorState.registers}
              activeRegister={editorState.activeRegister}
              clipboard={editorState.clipboard}
            />

            {/* 목표 상태 Diff 비교 하이라이트 뷰 */}
            {showDiffView && activeMissionForDiff && (
              <DiffViewer
                currentLines={displayEditorState.lines}
                targetLines={activeMissionForDiff.targetLines}
                isCompleted={currentTab === 'course' || currentTab === 'custom' ? isCompleted : false}
              />
            )}

            {/* 반응형 인터랙티브 가상 키보드 패널 */}
            {showVirtualKeyboard && (
              <VirtualKeyboard
                mode={editorState.mode}
                lastPressedKey={lastPressedKey}
                onKeyPress={processKeyInput}
              />
            )}

            {/* 실시간 명령 복기 타임라인 & 초보자용 Vim X-Ray 투시기 패널 */}
            {showActionTimeline && (
              <ActionTimelinePanel
                steps={timelineSteps}
                previewStepIndex={previewStepIndex}
                editorState={displayEditorState}
                missionTitle={
                  currentTab === 'course'
                    ? currentMission.title
                    : currentTab === 'custom' && customMission
                    ? customMission.title
                    : undefined
                }
                initialText={
                  currentTab === 'course'
                    ? currentMission.initialLines.join('\n')
                    : currentTab === 'custom' && customMission
                    ? customMission.initialLines.join('\n')
                    : SANDBOX_INITIAL_LINES.join('\n')
                }
                initialCursor={
                  currentTab === 'course'
                    ? currentMission.initialCursor
                    : currentTab === 'custom' && customMission
                    ? customMission.initialCursor
                    : { line: 0, col: 0 }
                }
                allKeysSoFar={allKeysSoFar}
                onSelectStep={handleSelectTimelineStep}
                onBranchFromStep={handleBranchFromStep}
                onCancelPreview={handleCancelPreview}
                onClose={handleToggleActionTimeline}
              />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>VimPracticeOnWeb • 키보드로 미션을 완료하며 자연스럽게 Vim을 마스터하세요</span>
      </footer>

      <LessonSelectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        missions={MISSIONS}
        currentMissionId={currentMission.id}
        progress={progress}
        onSelectLesson={(missionId) => {
          const idx = MISSIONS.findIndex((m) => m.id === missionId);
          if (idx !== -1) {
            handleSelectMission(idx);
            setCurrentTab('course');
          }
        }}
      />

      <CustomMissionModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onPlayMission={handlePlayCustomMission}
      />

      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        progress={progress}
        onOpenDailyChallenge={() => setIsDailyModalOpen(true)}
      />

      <DailyChallengeModal
        isOpen={isDailyModalOpen}
        onClose={() => setIsDailyModalOpen(false)}
        onPlayKeySound={playKeySound}
        onPlaySuccessSound={playSuccessSound}
      />

      <ConfigExporterModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        relativenumber={relativeLineNumbers}
        theme={currentTheme}
        leaderKey={leaderKey}
        activePresets={activePresets}
        onTogglePreset={handleTogglePreset}
        onChangeLeaderKey={handleChangeLeaderKey}
      />

      <BYOCModal
        isOpen={isBYOCModalOpen}
        onClose={() => setIsBYOCModalOpen(false)}
        initialCode={editorState.lines.join('\n')}
        onStartMission={handlePlayBYOCMission}
      />
    </div>
  );
}

export default App;
