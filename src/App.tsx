import { useEffect, useState, useCallback, useRef, lazy, Suspense, Dispatch, SetStateAction } from 'react';
import { MissionPanel, calculateStars } from './components/MissionPanel/MissionPanel';
import { Keycaster } from './components/Keycaster/Keycaster';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { DiffViewer } from './components/DiffViewer/DiffViewer';
import { VirtualKeyboard } from './components/VirtualKeyboard/VirtualKeyboard';
import { SpeedrunPanel } from './components/SpeedrunPanel/SpeedrunPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { RegisterInspector } from './components/RegisterInspector/RegisterInspector';
import { MarksJumpVisualizer } from './components/MarksJumpVisualizer/MarksJumpVisualizer';
import { MacroDebugger } from './components/MacroDebugger/MacroDebugger';
import { VimGrammarASTViewer } from './components/VimGrammarASTViewer/VimGrammarASTViewer';
import { ActionTimelinePanel } from './components/ActionTimelinePanel/ActionTimelinePanel';
import { AppHeader, AppTab } from './components/AppHeader/AppHeader';
import { EditorViewport } from './components/EditorViewport/EditorViewport';
import { AppModals } from './components/AppModals/AppModals';
import {
  VimEditorState,
  SplitPaneState,
  handleKey,
  diagnosticsToQuickfixItems,
  computeDiffHunks,
} from './vim-engine';
import { Mission } from './types/mission';
import { recordLessonSrsReview } from './utils/srsScheduler';
import { MISSIONS } from './data/missions';
import { sandboxInitialLines } from './data/sandbox';
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
  loadMarksVisualizerSetting,
  saveMarksVisualizerSetting,
  loadGrammarASTSetting,
  saveGrammarASTSetting,
  loadActionTimelineSetting,
  loadSpeedrunRecord,
  LessonProgress,
} from './utils/storage';
import { AntiPatternDetector } from './utils/antiPatternDetector';
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
import { compileUserKeymaps } from './utils/keymapStorage';
import { useEditorWorkspaceHandlers } from './hooks/useEditorWorkspaceHandlers';
import { useHardcoreAndKeymaps } from './hooks/useHardcoreAndKeymaps';
import { useVimKeyboardInput } from './hooks/useVimKeyboardInput';
import { useGhostReplay } from './hooks/useGhostReplay';
import { useActionTimeline } from './hooks/useActionTimeline';
import {
  useSpeedrunSession,
  SPEEDRUN_CANDIDATE_IDS,
  generateSpeedrunStages,
} from './hooks/useSpeedrunSession';
import './App.css';
import { t, useLocale } from './i18n';

export { SPEEDRUN_CANDIDATE_IDS, generateSpeedrunStages };

// 첫 화면에 필요 없는 게임 탭 화면은 처음 열 때 별도 청크로 불러옵니다 (초기 번들 크기 절감)
const ArcadeSurvival = lazy(() => import('./components/ArcadeSurvival/ArcadeSurvival').then((m) => ({ default: m.ArcadeSurvival })));
const DungeonRPG = lazy(() => import('./components/DungeonRPG/DungeonRPG').then((m) => ({ default: m.DungeonRPG })));
const HardcoreDojo = lazy(() => import('./components/HardcoreDojo/HardcoreDojo').then((m) => ({ default: m.HardcoreDojo })));

/** 지연 로딩되는 탭 화면을 불러오는 동안 보여줄 자리 표시 */
const TAB_LOADING_FALLBACK = (
  <div className="lazy-tab-loading" data-testid="lazy-tab-loading">
    {t('불러오는 중…')}
  </div>
);

export function App() {
  const initialChallenge = useRef(getChallengeFromUrl()).current;
  const initialCustomMission = initialChallenge ? createCustomMissionObject(initialChallenge) : null;

  const [currentTab, setCurrentTab] = useState<AppTab>(initialCustomMission ? 'custom' : 'course');
  const [customMission, setCustomMission] = useState<Mission | null>(initialCustomMission);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isDailyModalOpen, setIsDailyModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isBYOCModalOpen, setIsBYOCModalOpen] = useState(false);
  const [dojoInitialDrill, setDojoInitialDrill] = useState<{
    drill: 'weakness-custom';
    nonce: number;
  } | null>(null);
  const [showGrammarAST, setShowGrammarAST] = useState<boolean>(() => loadGrammarASTSetting());

  const setEditorStateRef = useRef<Dispatch<SetStateAction<VimEditorState>> | null>(null);
  const {
    hardcoreMode,
    hardcoreGuardRef,
    isEditorShaking,
    hardcoreWarning,
    dismissHardcoreWarning,
    handleToggleHardcoreMode,
    triggerHardcoreViolation,
    handleEditorAreaClick,
    activePresets,
    leaderKey,
    customKeymaps,
    handleTogglePreset,
    handleChangeLeaderKey,
    handleAddCustomKeymap,
    handleDeleteCustomKeymap,
    currentTheme,
    handleThemeChange,
    reloadHardcoreAndKeymaps,
  } = useHardcoreAndKeymaps(setEditorStateRef);

  const locale = useLocale();
  const { isMuted, toggleMute, playKeySound, playSuccessSound } = useSoundEffects();

  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [relativeLineNumbers, setRelativeLineNumbers] = useState<boolean>(() => loadRelativeLineSetting());
  const [showVirtualKeyboard, setShowVirtualKeyboard] = useState<boolean>(() => loadVirtualKeyboardSetting());
  const [showDiffView, setShowDiffView] = useState<boolean>(() => loadDiffViewSetting());
  const [showRegisterInspector, setShowRegisterInspector] = useState<boolean>(() => loadRegisterInspectorSetting());
  const [showMarksVisualizer, setShowMarksVisualizer] = useState<boolean>(() => loadMarksVisualizerSetting());
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(true);

  const handleToggleRegisterInspector = useCallback(() => {
    setShowRegisterInspector((prev) => {
      const next = !prev;
      saveRegisterInspectorSetting(next);
      return next;
    });
  }, []);

  const handleToggleMarksVisualizer = useCallback(() => {
    setShowMarksVisualizer((prev) => {
      const next = !prev;
      saveMarksVisualizerSetting(next);
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

  const currentMission = MISSIONS[currentMissionIndex];

  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [lastPressedKey, setLastPressedKey] = useState<string | undefined>(undefined);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const antiPatternDetectorRef = useRef(new AntiPatternDetector());

  const getMissionInitialState = useCallback((m: Mission): VimEditorState => {
    const isSplit = m.initialSplit && m.initialSplit !== 'none';
    let splitPanes: [SplitPaneState, SplitPaneState] | undefined = undefined;
    if (isSplit) {
      const p0: SplitPaneState = {
        filename: m.primaryFilename || 'source.ts',
        lines: [...m.initialLines],
        cursor: { ...m.initialCursor },
        mode: 'NORMAL',
        diff: m.initialDiffMode ?? false,
      };
      const p1: SplitPaneState = {
        filename: m.secondaryFilename || 'target.ts',
        lines: m.secondaryLines ? [...m.secondaryLines] : [...m.initialLines],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        diff: m.initialDiffMode ?? false,
      };
      splitPanes = [p0, p1];
    }
    return {
      lines: [...m.initialLines],
      cursor: { ...m.initialCursor },
      mode: 'NORMAL',
      undoStack: m.initialUndoStack ? [...m.initialUndoStack] : [],
      redoStack: [],
      undoTreeNodes: m.initialUndoTreeNodes,
      currentUndoSeq: m.initialCurrentUndoSeq,
      maxUndoSeq: m.initialMaxUndoSeq,
      undoTimeHistory: m.initialUndoTimeHistory,
      undoTimeIndex: m.initialUndoTimeIndex,
      clipboard: m.initialClipboard,
      registers: m.initialRegisters ? { ...m.initialRegisters } : undefined,
      primaryFilename: m.primaryFilename,
      secondaryFilename: m.secondaryFilename,
      secondaryLines: m.secondaryLines,
      splitDirection: m.initialSplit ?? 'none',
      splitPanes,
      diffMode: m.initialDiffMode ?? false,
      diffHunks: m.initialDiffMode && splitPanes ? computeDiffHunks(splitPanes[0].lines, splitPanes[1].lines) : undefined,
      activePaneIndex: 0,
      commandHistory: m.initialCommandHistory ? [...m.initialCommandHistory] : undefined,
      searchHistory: m.initialSearchHistory ? [...m.initialSearchHistory] : undefined,
      quickfix: m.initialQuickfixItems
        ? { items: [...m.initialQuickfixItems], currentIndex: 0, isOpen: false }
        : undefined,
      locationList: m.initialLocationListItems
        ? { items: [...m.initialLocationListItems], currentIndex: 0, isOpen: false }
        : m.initialLspDiagnostics
        ? {
            items: diagnosticsToQuickfixItems(
              m.primaryFilename || `lesson_${m.id}.ts`,
              m.initialLspDiagnostics
            ),
            currentIndex: 0,
            isOpen: false,
          }
        : undefined,
      lspDiagnostics: m.initialLspDiagnostics
        ? m.initialLspDiagnostics.map((d) => ({ ...d }))
        : undefined,
      lspSymbols: m.initialLspSymbols ? { ...m.initialLspSymbols } : undefined,
      lspHover: null,
      changeList: m.initialChangeList ? [...m.initialChangeList] : undefined,
      changeIndex: m.initialChangeList ? m.initialChangeList.length : undefined,
      argList: m.initialArgs
        ? { files: [...m.initialArgs], currentIndex: 0 }
        : undefined,
      folds: m.initialFolds ? [...m.initialFolds] : undefined,
      virtualFiles: m.initialVirtualFiles ? { ...m.initialVirtualFiles } : undefined,
      userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
      leaderKey,
    };
  }, [activePresets, leaderKey, customKeymaps]);

  const createCustomInitialState = useCallback(
    (mission: Mission): VimEditorState => ({
      lines: [...mission.initialLines],
      cursor: { ...mission.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
      userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
      leaderKey,
    }),
    [activePresets, leaderKey, customKeymaps]
  );

  const [editorState, setEditorState] = useState<VimEditorState>(() =>
    initialCustomMission
      ? createCustomInitialState(initialCustomMission)
      : getMissionInitialState(currentMission)
  );
  setEditorStateRef.current = setEditorState;

  const {
    handleSwitchPane,
    handleSelectCompletionCandidate,
    handleSwitchBuffer,
    handleSwitchTabPage,
    handleCloseTabPage,
    handleNewTabPage,
    handleCloseCommandLineWindow,
    handleSelectCommandLineWindowLine,
    handleSwitchCommandLineWindowType,
    handleClearCommandLineHistory,
    handleExecuteCommandLineWindowLine,
    handleJumpQuickfixItem,
    handleCloseQuickfixWindow,
    handleJumpLocationListItem,
    handleCloseLocationListWindow,
    handleCloseLspHover,
    handleSelectFuzzyFinderAction,
    handleCloseFuzzyFinder,
    handleSelectFuzzyItemIndex,
    handleJumpHelpTag,
    handlePopHelpTag,
    handleCloseHelp,
    handleJumpToMark,
    handleDeleteMark,
    handleDeleteAllLocalMarks,
    handleJumpToIndex,
    handleJumpOlder,
    handleJumpNewer,
    handleClearJumps,
    handleSetMark,
    handleJumpToLine,
    handleUpdateRegister,
    handleDeleteRegister,
  } = useEditorWorkspaceHandlers({ setEditorState, setIsEditorFocused });

  const {
    isGhostReplaying,
    ghostReplayProgress,
    handleStopGhostReplay,
    handleStartGhostReplay,
  } = useGhostReplay({
    currentMission,
    getMissionInitialState,
    setEditorState,
    setKeystrokeCount,
    setRecentKeys,
    setLastPressedKey,
    playKeySound,
  });

  const [showMacroDebugger, setShowMacroDebugger] = useState<boolean>(false);
  const [macroPreviewState, setMacroPreviewState] = useState<VimEditorState | null>(null);
  const [bellCount, setBellCount] = useState(0);

  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const keystrokeCountRef = useRef(keystrokeCount);
  keystrokeCountRef.current = keystrokeCount;

  const {
    showActionTimeline,
    setShowActionTimeline,
    timelineSteps,
    allKeysSoFar,
    previewStepIndex,
    timelineBaseState,
    handleToggleActionTimeline,
    handleSelectTimelineStep,
    handleCancelPreview,
    handleBranchFromStep,
    resetActionTimeline,
    beginTimelineKeyInput,
    commitTimelineKeyStep,
  } = useActionTimeline({
    createInitialState: () =>
      initialCustomMission
        ? createCustomInitialState(initialCustomMission)
        : getMissionInitialState(currentMission),
    editorState,
    editorStateRef,
    setEditorState,
    keystrokeCountRef,
    setKeystrokeCount,
    setCoachingMessage,
  });

  const displayEditorState = macroPreviewState ?? timelineBaseState;

  const {
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
  } = useSpeedrunSession({
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
  });

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

  // 미션 클리어 시 레트로 8비트 아르페지오 성공 효과음 재생 및 SRS 간격 반복 스케줄 갱신
  const wasCompletedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !wasCompletedRef.current) {
      playSuccessSound();
      if (currentTab === 'course') {
        const rating = calculateStars(keystrokeCount, currentMission.par);
        recordLessonSrsReview(currentMission.id, rating.starCount);
      }
    }
    wasCompletedRef.current = isCompleted;
  }, [isCompleted, playSuccessSound, currentTab, currentMission.id, currentMission.par, keystrokeCount]);

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
  }, [initialCustomMission]);

  useEffect(() => {
    if (editorState.showRegisterInspector !== undefined) {
      setShowRegisterInspector(editorState.showRegisterInspector);
    }
  }, [editorState.showRegisterInspector]);

  useEffect(() => {
    if (editorState.showMarksVisualizer !== undefined) {
      setShowMarksVisualizer(editorState.showMarksVisualizer);
    }
  }, [editorState.showMarksVisualizer]);

  useEffect(() => {
    if (editorState.options?.relativenumber !== undefined) {
      setRelativeLineNumbers(editorState.options.relativenumber);
      saveRelativeLineSetting(editorState.options.relativenumber);
    }
  }, [editorState.options?.relativenumber]);

  useEffect(() => {
    if (editorState.showConfigModal !== undefined) {
      setIsConfigModalOpen(editorState.showConfigModal);
    }
  }, [editorState.showConfigModal]);

  const resetSessionWithState = useCallback(
    (initState: VimEditorState, message: string | null = null) => {
      setEditorState(initState);
      resetActionTimeline(initState);
      setKeystrokeCount(0);
      setRecentKeys([]);
      setLastPressedKey(undefined);
      setCoachingMessage(message);
      antiPatternDetectorRef.current.reset();
    },
    [resetActionTimeline]
  );

  const handleSelectMission = useCallback(
    (index: number) => {
      if (index >= 0 && index < MISSIONS.length) {
        handleStopGhostReplay();
        setCurrentMissionIndex(index);
        resetSessionWithState(getMissionInitialState(MISSIONS[index]));
      }
    },
    [handleStopGhostReplay, getMissionInitialState, resetSessionWithState]
  );

  const handleResetMission = useCallback(() => {
    handleStopGhostReplay();
    resetSessionWithState(getMissionInitialState(currentMission));
  }, [currentMission, handleStopGhostReplay, getMissionInitialState, resetSessionWithState]);

  const handleResetSandbox = useCallback(() => {
    handleStopGhostReplay();
    resetSessionWithState({
      lines: sandboxInitialLines(),
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
      userKeymaps: compileUserKeymaps(activePresets, leaderKey, customKeymaps),
      leaderKey,
    });
  }, [handleStopGhostReplay, resetSessionWithState, activePresets, leaderKey, customKeymaps]);

  const handleResetCustomMission = useCallback(() => {
    if (!customMission) return;
    handleStopGhostReplay();
    resetSessionWithState({
      lines: [...customMission.initialLines],
      cursor: { ...customMission.initialCursor },
      mode: 'NORMAL',
      undoStack: [],
      redoStack: [],
    });
  }, [customMission, handleStopGhostReplay, resetSessionWithState]);

  const handlePlayCustomMission = useCallback(
    (data: CustomMissionData) => {
      handleStopGhostReplay();
      const newMission = createCustomMissionObject(data);
      setCustomMission(newMission);
      setCurrentTab('custom');
      resetSessionWithState(
        {
          lines: [...newMission.initialLines],
          cursor: { ...newMission.initialCursor },
          mode: 'NORMAL',
          undoStack: [],
          redoStack: [],
        },
        t('⛳ 커스텀 미션 [{title}] 시작! 최소 타수로 완성을 노려보세요.', {
          title: newMission.title,
        })
      );
    },
    [handleStopGhostReplay, resetSessionWithState]
  );

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
      setCoachingMessage(
        t('⛳ [BYOC] 리팩토링 미션 시작! 힌트: {hint}', { hint: missionData.hint })
      );
    },
    [handlePlayCustomMission]
  );

  const handleSwitchTab = useCallback(
    (tab: AppTab) => {
      handleStopGhostReplay();
      setCurrentTab(tab);
      setLastPressedKey(undefined);
      setCoachingMessage(null);
      antiPatternDetectorRef.current.reset();

      if (tab === 'sandbox') {
        handleResetSandbox();
      } else if (tab === 'speedrun') {
        resetSpeedrunReady();
      } else if (tab === 'arcade' || tab === 'dungeon' || tab === 'dojo') {
        // 게임 탭은 자체 상태를 갖습니다
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
        setEditorState(getMissionInitialState(MISSIONS[currentMissionIndex]));
        setKeystrokeCount(0);
        setRecentKeys([]);
      }
    },
    [
      currentMissionIndex,
      handleResetSandbox,
      resetSpeedrunReady,
      customMission,
      handleStopGhostReplay,
      getMissionInitialState,
    ]
  );

  const handleToggleRelativeLine = useCallback(() => {
    setRelativeLineNumbers((prev) => {
      const next = !prev;
      saveRelativeLineSetting(next);
      setEditorState((st) => ({
        ...st,
        options: {
          number: st.options?.number ?? true,
          relativenumber: next,
          ignorecase: st.options?.ignorecase ?? false,
          smartcase: st.options?.smartcase ?? false,
          hlsearch: st.options?.hlsearch ?? true,
          wrap: st.options?.wrap ?? true,
          cursorline: st.options?.cursorline ?? true,
          tabstop: st.options?.tabstop ?? 2,
          shiftwidth: st.options?.shiftwidth ?? 2,
          expandtab: st.options?.expandtab ?? true,
          list: st.options?.list ?? false,
          wildmenu: st.options?.wildmenu ?? true,
          spell: st.options?.spell ?? false,
        },
      }));
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

  const handleToggleMacroDebugger = useCallback(() => {
    setShowMacroDebugger((prev) => !prev);
  }, []);

  const handleOpenMacroDebugger = useCallback((_register: string) => {
    setShowMacroDebugger(true);
  }, []);

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

      const { baseState, baseKeystrokes, baseSteps, nextActionKeys } =
        beginTimelineKeyInput(key);
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

      const nextState = handleKey(baseState, key);
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
      beginTimelineKeyInput,
      commitTimelineKeyStep,
      setSpeedrunKeystrokes,
    ]
  );

  const handleRunMacroFromDebugger = useCallback(
    (register: string, count: number = 1) => {
      const keys = [...(count > 1 ? String(count).split('') : []), '@', register];
      keys.forEach((k) => processKeyInput(k));
    },
    [processKeyInput]
  );

  const isModalOrGameBlocked =
    isModalOpen ||
    isCustomModalOpen ||
    isAnalyticsModalOpen ||
    isDailyModalOpen ||
    isConfigModalOpen ||
    isBYOCModalOpen ||
    currentTab === 'arcade' ||
    currentTab === 'dungeon' ||
    currentTab === 'dojo';

  useVimKeyboardInput({
    isModalOrGameBlocked,
    isGhostReplaying,
    handleStopGhostReplay,
    isEditorFocused,
    setIsEditorFocused,
    editorMode: editorState.mode,
    activePresets,
    hardcoreMode,
    hardcoreGuardRef,
    triggerHardcoreViolation,
    setCoachingMessage,
    processKeyInput,
  });

  const activeMissionForDiff =
    currentTab === 'course'
      ? currentMission
      : currentTab === 'custom' && customMission
      ? customMission
      : currentTab === 'speedrun' && speedrunStatus === 'running'
      ? activeSpeedrunMission
      : undefined;

  const handleSelectLessonById = useCallback(
    (missionId: number) => {
      const idx = MISSIONS.findIndex((m) => m.id === missionId);
      if (idx !== -1) {
        handleSelectMission(idx);
        setCurrentTab('course');
      }
    },
    [handleSelectMission]
  );

  const handleRestoreBackup = useCallback(() => {
    setProgress(loadProgress());
    reloadHardcoreAndKeymaps();
    setRelativeLineNumbers(loadRelativeLineSetting());
    setShowVirtualKeyboard(loadVirtualKeyboardSetting());
    setShowDiffView(loadDiffViewSetting());
    setShowRegisterInspector(loadRegisterInspectorSetting());
    setShowMarksVisualizer(loadMarksVisualizerSetting());
    setShowGrammarAST(loadGrammarASTSetting());
    setShowActionTimeline(loadActionTimelineSetting());
    setSpeedrunBestRecord(loadSpeedrunRecord());
  }, [reloadHardcoreAndKeymaps, setShowActionTimeline, setSpeedrunBestRecord]);

  const statusFilename = displayEditorState.splitPanes
    ? displayEditorState.activePaneIndex === 1
      ? displayEditorState.secondaryFilename ||
        displayEditorState.splitPanes[1].filename ||
        'target.ts'
      : displayEditorState.primaryFilename ||
        displayEditorState.splitPanes[0].filename ||
        'source.ts'
    : currentTab === 'course'
    ? currentMission.primaryFilename || `lesson_${currentMission.id}.txt`
    : currentTab === 'custom'
    ? 'custom_golf.txt'
    : currentTab === 'speedrun'
    ? `speedrun_stage_${speedrunCurrentStage + 1}.txt`
    : 'sandbox.ts';

  return (
    <div className="app-layout">
      {/* 🚀 상단 고정 플로팅 알림 토스트 */}
      <div className="top-toast-container" data-testid="top-toast-container" aria-live="polite">
        {hardcoreWarning && (
          <div
            className="hardcore-warning-banner hardcore-warning-toast"
            role="alert"
            data-testid="hardcore-warning-banner"
          >
            <div className="hardcore-warning-content">
              <span className="hardcore-warning-icon">🚫</span>
              <span className="hardcore-warning-text">{hardcoreWarning}</span>
            </div>
            <button
              type="button"
              className="hardcore-warning-close-btn"
              onClick={dismissHardcoreWarning}
              aria-label={t('닫기')}
            >
              ✕
            </button>
          </div>
        )}

        <CoachingToast
          message={coachingMessage}
          onDismiss={() => setCoachingMessage(null)}
        />
      </div>

      <AppHeader
        currentTab={currentTab}
        customMission={customMission}
        onSwitchTab={handleSwitchTab}
        hardcoreMode={hardcoreMode}
        onToggleHardcoreMode={handleToggleHardcoreMode}
        onOpenDailyModal={() => setIsDailyModalOpen(true)}
        onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
        onOpenCustomModal={() => setIsCustomModalOpen(true)}
        onOpenConfigModal={() => setIsConfigModalOpen(true)}
        onOpenLessonModal={() => setIsModalOpen(true)}
        showDiffView={showDiffView}
        onToggleDiffView={handleToggleDiffView}
        showRegisterInspector={showRegisterInspector}
        onToggleRegisterInspector={handleToggleRegisterInspector}
        showMarksVisualizer={showMarksVisualizer}
        onToggleMarksVisualizer={handleToggleMarksVisualizer}
        showGrammarAST={showGrammarAST}
        onToggleGrammarAST={handleToggleGrammarAST}
        showActionTimeline={showActionTimeline}
        onToggleActionTimeline={handleToggleActionTimeline}
        showVirtualKeyboard={showVirtualKeyboard}
        onToggleVirtualKeyboard={handleToggleVirtualKeyboard}
        relativeLineNumbers={relativeLineNumbers}
        onToggleRelativeLineNumbers={handleToggleRelativeLine}
        showMacroDebugger={showMacroDebugger}
        onToggleMacroDebugger={handleToggleMacroDebugger}
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        locale={locale}
      />

      <main className="editor-wrapper">
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
          <Suspense fallback={TAB_LOADING_FALLBACK}>
            <ArcadeSurvival
              onPlayKeySound={playKeySound}
              onPlaySuccessSound={playSuccessSound}
              isMuted={isMuted}
            />
          </Suspense>
        ) : currentTab === 'dungeon' ? (
          <Suspense fallback={TAB_LOADING_FALLBACK}>
            <DungeonRPG
              onPlayKeySound={playKeySound}
              onPlaySuccessSound={playSuccessSound}
              isMuted={isMuted}
            />
          </Suspense>
        ) : currentTab === 'dojo' ? (
          <Suspense fallback={TAB_LOADING_FALLBACK}>
            <HardcoreDojo
              onBackToCourse={() => handleSwitchTab('course')}
              playKeySound={playKeySound}
              playSuccessSound={playSuccessSound}
              initialDrill={dojoInitialDrill}
              analyticsProgress={progress}
            />
          </Suspense>
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
                    {t('미션 제약 없이 모든 Vim 키보드 명령어를 자유롭게 실험해 볼 수 있습니다.')}
                  </span>
                </div>
                <div className="sandbox-actions">
                  <button
                    className="sandbox-byoc-btn"
                    onClick={() => setIsBYOCModalOpen(true)}
                    data-testid="open-byoc-modal-btn"
                    title={t('내 실제 업무 코드를 붙여넣어 자동 리팩토링 미션 생성')}
                  >
                    {t('✨ 내 코드로 리팩토링 미션 생성 (BYOC)')}
                  </button>
                  <button
                    className="sandbox-reset-btn"
                    onClick={handleResetSandbox}
                    data-testid="sandbox-reset-btn"
                  >
                    {t('🔄 코드 초기화')}
                  </button>
                </div>
              </div>
            )}

            {currentTab === 'speedrun' && (
              <SpeedrunPanel
                status={speedrunStatus}
                currentStageIndex={speedrunCurrentStage}
                totalStages={speedrunStages.length}
                currentMissionTitle={activeSpeedrunMission ? t(activeSpeedrunMission.title) : undefined}
                elapsedSeconds={speedrunElapsedSeconds}
                totalKeystrokes={speedrunKeystrokes}
                bestRecord={speedrunBestRecord}
                isNewRecord={speedrunIsNewRecord}
                onStart={handleStartSpeedrun}
                onRestart={handleStartSpeedrun}
              />
            )}

            <EditorViewport
              editorState={editorState}
              displayEditorState={displayEditorState}
              targetPosition={
                currentTab === 'course'
                  ? currentMission.targetCursor
                  : activeSpeedrunMission?.targetCursor
              }
              fallbackPrimaryFilename={
                currentTab === 'course' ? currentMission.primaryFilename : undefined
              }
              isEditorShaking={isEditorShaking}
              isEditorFocused={isEditorFocused}
              relativeLineNumbers={relativeLineNumbers}
              bellCount={bellCount}
              onFocusEditor={() => setIsEditorFocused(true)}
              onEditorAreaClick={handleEditorAreaClick}
              onSwitchPane={handleSwitchPane}
              onSelectCompletionCandidate={handleSelectCompletionCandidate}
              onSwitchBuffer={handleSwitchBuffer}
              onSwitchTabPage={handleSwitchTabPage}
              onCloseTabPage={handleCloseTabPage}
              onNewTabPage={handleNewTabPage}
              onJumpToMark={handleJumpToMark}
              onCloseLspHover={handleCloseLspHover}
              onJumpQuickfixItem={handleJumpQuickfixItem}
              onCloseQuickfixWindow={handleCloseQuickfixWindow}
              onJumpLocationListItem={handleJumpLocationListItem}
              onCloseLocationListWindow={handleCloseLocationListWindow}
              onSwitchCommandLineWindowType={handleSwitchCommandLineWindowType}
              onClearCommandLineHistory={handleClearCommandLineHistory}
              onCloseCommandLineWindow={handleCloseCommandLineWindow}
              onSelectCommandLineWindowLine={handleSelectCommandLineWindowLine}
              onExecuteCommandLineWindowLine={handleExecuteCommandLineWindowLine}
            />

            <Keycaster recentKeys={recentKeys} />
            <StatusBar
              mode={displayEditorState.mode}
              cursor={displayEditorState.cursor}
              insertNormalSession={displayEditorState.insertNormalSession}
              insertRegisterPending={displayEditorState.insertRegisterPending}
              insertCtrlXMode={displayEditorState.insertCtrlXMode}
              confirmSubstitute={displayEditorState.confirmSubstitute}
              filename={statusFilename}
              pendingKeys={displayEditorState.pendingKeys}
              recordingMacro={displayEditorState.recordingMacro}
              commandType={displayEditorState.commandType}
              commandBuffer={displayEditorState.commandBuffer}
              commandCursorCol={displayEditorState.commandCursorCol}
              digraphPending={displayEditorState.digraphPending}
              commandMessage={displayEditorState.commandMessage}
              wildmenu={displayEditorState.wildmenu}
              showWildmenuBar={displayEditorState.options?.wildmenu ?? true}
              spellActive={displayEditorState.options?.spell}
              functionDraft={
                displayEditorState.functionDraft
                  ? {
                      name: displayEditorState.functionDraft.name,
                      lines: displayEditorState.functionDraft.body.length,
                    }
                  : null
              }
            />

            <RegisterInspector
              isOpen={showRegisterInspector}
              onToggle={handleToggleRegisterInspector}
              registers={editorState.registers}
              activeRegister={editorState.activeRegister}
              clipboard={editorState.clipboard}
              recordingMacro={editorState.recordingMacro}
              onRunMacro={handleRunMacroFromDebugger}
              onOpenMacroDebugger={handleOpenMacroDebugger}
              onUpdateRegister={handleUpdateRegister}
              onDeleteRegister={handleDeleteRegister}
            />

            <MarksJumpVisualizer
              isOpen={showMarksVisualizer}
              onClose={handleToggleMarksVisualizer}
              marks={displayEditorState.marks}
              jumpList={displayEditorState.jumpList}
              jumpIndex={displayEditorState.jumpIndex}
              lines={displayEditorState.lines}
              currentCursor={displayEditorState.cursor}
              primaryFilename={displayEditorState.primaryFilename}
              onJumpToMark={handleJumpToMark}
              onDeleteMark={handleDeleteMark}
              onDeleteAllLocalMarks={handleDeleteAllLocalMarks}
              onJumpToIndex={handleJumpToIndex}
              onJumpOlder={handleJumpOlder}
              onJumpNewer={handleJumpNewer}
              onClearJumps={handleClearJumps}
              onSetMark={handleSetMark}
              onJumpToLine={handleJumpToLine}
            />

            <MacroDebugger
              isOpen={showMacroDebugger}
              onToggle={handleToggleMacroDebugger}
              baseState={timelineBaseState}
              onPreviewFrame={setMacroPreviewState}
              onRunMacro={handleRunMacroFromDebugger}
            />

            {showDiffView && activeMissionForDiff && (
              <DiffViewer
                currentLines={displayEditorState.lines}
                targetLines={activeMissionForDiff.targetLines}
                isCompleted={currentTab === 'course' || currentTab === 'custom' ? isCompleted : false}
              />
            )}

            {showVirtualKeyboard && (
              <VirtualKeyboard
                mode={editorState.mode}
                lastPressedKey={lastPressedKey}
                onKeyPress={processKeyInput}
              />
            )}

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
                    : sandboxInitialLines().join('\n')
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
        <span>{t('VimPracticeOnWeb • 키보드로 미션을 완료하며 자연스럽게 Vim을 마스터하세요')}</span>
      </footer>

      <AppModals
        editorState={editorState}
        currentMissionId={currentMission.id}
        progress={progress}
        isModalOpen={isModalOpen}
        onCloseLessonModal={() => setIsModalOpen(false)}
        onSelectLessonById={handleSelectLessonById}
        isCustomModalOpen={isCustomModalOpen}
        onCloseCustomModal={() => setIsCustomModalOpen(false)}
        onPlayCustomMission={handlePlayCustomMission}
        isAnalyticsModalOpen={isAnalyticsModalOpen}
        onCloseAnalyticsModal={() => setIsAnalyticsModalOpen(false)}
        onOpenDailyFromAnalytics={() => setIsDailyModalOpen(true)}
        onStartWeaknessDrill={() => {
          setDojoInitialDrill({ drill: 'weakness-custom', nonce: Date.now() });
          handleSwitchTab('dojo');
        }}
        isDailyModalOpen={isDailyModalOpen}
        onCloseDailyModal={() => setIsDailyModalOpen(false)}
        playKeySound={playKeySound}
        playSuccessSound={playSuccessSound}
        isConfigModalOpen={isConfigModalOpen}
        onCloseConfigModal={() => {
          setIsConfigModalOpen(false);
          setEditorState((prev) => ({ ...prev, showConfigModal: false }));
        }}
        relativeLineNumbers={relativeLineNumbers}
        currentTheme={currentTheme}
        leaderKey={leaderKey}
        activePresets={activePresets}
        onTogglePreset={handleTogglePreset}
        onChangeLeaderKey={handleChangeLeaderKey}
        customKeymaps={customKeymaps}
        onAddCustomKeymap={handleAddCustomKeymap}
        onDeleteCustomKeymap={handleDeleteCustomKeymap}
        onRestoreBackup={handleRestoreBackup}
        isBYOCModalOpen={isBYOCModalOpen}
        onCloseBYOCModal={() => setIsBYOCModalOpen(false)}
        onPlayBYOCMission={handlePlayBYOCMission}
        onSelectFuzzyFinderAction={handleSelectFuzzyFinderAction}
        onSelectFuzzyItemIndex={handleSelectFuzzyItemIndex}
        onCloseFuzzyFinder={handleCloseFuzzyFinder}
        onJumpHelpTag={handleJumpHelpTag}
        onPopHelpTag={handlePopHelpTag}
        onCloseHelp={handleCloseHelp}
      />
    </div>
  );
}

export default App;
