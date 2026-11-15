import { useEffect, useState, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { calculateStars } from './components/MissionPanel/MissionPanel';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { AppHeader, AppTab } from './components/AppHeader/AppHeader';
import { AppModals } from './components/AppModals/AppModals';
import { AppMainWorkspace } from './components/AppMainWorkspace/AppMainWorkspace';
import { VimEditorState, handleKey } from './vim-engine';
import { Mission } from './types/mission';
import { recordLessonSrsReview } from './utils/srsScheduler';
import { MISSIONS } from './data/missions';
import { sandboxInitialLines } from './data/sandbox';
import {
  loadProgress,
  saveLessonRecord,
  LessonProgress,
} from './utils/storage';
import { AntiPatternDetector } from './utils/antiPatternDetector';
import { useSoundEffects } from './utils/soundEffects';
import {
  getChallengeFromUrl,
  createCustomMissionObject,
} from './utils/customMission';
import {
  recordKeyInputStats,
  recordAntiPatternDetection,
} from './utils/analyticsStorage';
import {
  buildMissionInitialState,
  buildCustomInitialState,
  resolveStatusFilename,
} from './utils/missionInitialState';
import { useEditorWorkspaceHandlers } from './hooks/useEditorWorkspaceHandlers';
import { useHardcoreAndKeymaps } from './hooks/useHardcoreAndKeymaps';
import { useVimKeyboardInput } from './hooks/useVimKeyboardInput';
import { useGhostReplay } from './hooks/useGhostReplay';
import { useActionTimeline } from './hooks/useActionTimeline';
import { useEditorViewSettings } from './hooks/useEditorViewSettings';
import { useAppMissionHandlers } from './hooks/useAppMissionHandlers';
import {
  useSpeedrunSession,
  SPEEDRUN_CANDIDATE_IDS,
  generateSpeedrunStages,
} from './hooks/useSpeedrunSession';
import './App.css';
import { t, useLocale } from './i18n';

export { SPEEDRUN_CANDIDATE_IDS, generateSpeedrunStages };

export function App() {
  const initialChallenge = useRef(getChallengeFromUrl()).current;
  const initialCustomMission = initialChallenge ? createCustomMissionObject(initialChallenge) : null;

  const [currentTab, setCurrentTab] = useState<AppTab>(initialCustomMission ? 'custom' : 'course');
  const [customMission, setCustomMission] = useState<Mission | null>(initialCustomMission);
  const [dojoInitialDrill, setDojoInitialDrill] = useState<{
    drill: 'weakness-custom';
    nonce: number;
  } | null>(null);

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
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(true);

  const currentMission = MISSIONS[currentMissionIndex];

  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [lastPressedKey, setLastPressedKey] = useState<string | undefined>(undefined);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const antiPatternDetectorRef = useRef(new AntiPatternDetector());

  const getMissionInitialState = useCallback(
    (m: Mission): VimEditorState =>
      buildMissionInitialState(m, { activePresets, leaderKey, customKeymaps }),
    [activePresets, leaderKey, customKeymaps]
  );

  const createCustomInitialState = useCallback(
    (mission: Mission): VimEditorState =>
      buildCustomInitialState(mission, { activePresets, leaderKey, customKeymaps }),
    [activePresets, leaderKey, customKeymaps]
  );

  const [editorState, setEditorState] = useState<VimEditorState>(() =>
    initialCustomMission
      ? createCustomInitialState(initialCustomMission)
      : getMissionInitialState(currentMission)
  );
  setEditorStateRef.current = setEditorState;

  const {
    isModalOpen,
    setIsModalOpen,
    isCustomModalOpen,
    setIsCustomModalOpen,
    isAnalyticsModalOpen,
    setIsAnalyticsModalOpen,
    isDailyModalOpen,
    setIsDailyModalOpen,
    isConfigModalOpen,
    setIsConfigModalOpen,
    isBYOCModalOpen,
    setIsBYOCModalOpen,
    isAnyModalOpen,
    relativeLineNumbers,
    showVirtualKeyboard,
    showDiffView,
    showRegisterInspector,
    showMarksVisualizer,
    showGrammarAST,
    setShowGrammarAST,
    showMacroDebugger,
    handleToggleRegisterInspector,
    handleToggleMarksVisualizer,
    handleToggleGrammarAST,
    handleToggleVirtualKeyboard,
    handleToggleDiffView,
    enableDiffView,
    handleToggleRelativeLine,
    handleToggleMacroDebugger,
    handleOpenMacroDebugger,
    restoreViewSettings,
  } = useEditorViewSettings({ editorState, setEditorState });

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

  const {
    handleSelectMission,
    handleResetMission,
    handleResetSandbox,
    handleResetCustomMission,
    handlePlayCustomMission,
    handlePlayBYOCMission,
    handleSwitchTab,
    handleRunMacroFromDebugger,
    handleSelectLessonById,
    handleRestoreBackup,
  } = useAppMissionHandlers({
    currentMission,
    currentMissionIndex,
    customMission,
    activePresets,
    leaderKey,
    customKeymaps,
    antiPatternDetectorRef,
    getMissionInitialState,
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

  const isModalOrGameBlocked =
    isAnyModalOpen ||
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

  const statusFilename = resolveStatusFilename(
    displayEditorState,
    currentTab,
    currentMission,
    speedrunCurrentStage
  );

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

      <AppMainWorkspace
        currentTab={currentTab}
        onSwitchTab={handleSwitchTab}
        showGrammarAST={showGrammarAST}
        onCloseGrammarAST={() => setShowGrammarAST(false)}
        editorState={editorState}
        displayEditorState={displayEditorState}
        processKeyInput={processKeyInput}
        playKeySound={playKeySound}
        playSuccessSound={playSuccessSound}
        isMuted={isMuted}
        dojoInitialDrill={dojoInitialDrill}
        progress={progress}
        currentMission={currentMission}
        currentMissionIndex={currentMissionIndex}
        totalMissions={MISSIONS.length}
        customMission={customMission}
        isCompleted={isCompleted}
        keystrokeCount={keystrokeCount}
        onSelectMission={handleSelectMission}
        onResetMission={handleResetMission}
        onResetCustomMission={handleResetCustomMission}
        onStartGhostReplay={handleStartGhostReplay}
        onStopGhostReplay={handleStopGhostReplay}
        isGhostReplaying={isGhostReplaying}
        ghostReplayProgress={ghostReplayProgress}
        onOpenBYOCModal={() => setIsBYOCModalOpen(true)}
        onResetSandbox={handleResetSandbox}
        speedrunStatus={speedrunStatus}
        speedrunCurrentStage={speedrunCurrentStage}
        speedrunTotalStages={speedrunStages.length}
        activeSpeedrunMission={activeSpeedrunMission}
        speedrunElapsedSeconds={speedrunElapsedSeconds}
        speedrunKeystrokes={speedrunKeystrokes}
        speedrunBestRecord={speedrunBestRecord}
        speedrunIsNewRecord={speedrunIsNewRecord}
        onStartSpeedrun={handleStartSpeedrun}
        isEditorShaking={isEditorShaking}
        isEditorFocused={isEditorFocused}
        relativeLineNumbers={relativeLineNumbers}
        bellCount={bellCount}
        onFocusEditor={() => setIsEditorFocused(true)}
        onEditorAreaClick={handleEditorAreaClick}
        viewportHandlers={{
          onSwitchPane: handleSwitchPane,
          onSelectCompletionCandidate: handleSelectCompletionCandidate,
          onSwitchBuffer: handleSwitchBuffer,
          onSwitchTabPage: handleSwitchTabPage,
          onCloseTabPage: handleCloseTabPage,
          onNewTabPage: handleNewTabPage,
          onJumpToMark: handleJumpToMark,
          onCloseLspHover: handleCloseLspHover,
          onJumpQuickfixItem: handleJumpQuickfixItem,
          onCloseQuickfixWindow: handleCloseQuickfixWindow,
          onJumpLocationListItem: handleJumpLocationListItem,
          onCloseLocationListWindow: handleCloseLocationListWindow,
          onSwitchCommandLineWindowType: handleSwitchCommandLineWindowType,
          onClearCommandLineHistory: handleClearCommandLineHistory,
          onCloseCommandLineWindow: handleCloseCommandLineWindow,
          onSelectCommandLineWindowLine: handleSelectCommandLineWindowLine,
          onExecuteCommandLineWindowLine: handleExecuteCommandLineWindowLine,
        }}
        recentKeys={recentKeys}
        statusFilename={statusFilename}
        showRegisterInspector={showRegisterInspector}
        onToggleRegisterInspector={handleToggleRegisterInspector}
        onRunMacroFromDebugger={handleRunMacroFromDebugger}
        onOpenMacroDebugger={handleOpenMacroDebugger}
        onUpdateRegister={handleUpdateRegister}
        onDeleteRegister={handleDeleteRegister}
        showMarksVisualizer={showMarksVisualizer}
        onToggleMarksVisualizer={handleToggleMarksVisualizer}
        marksHandlers={{
          onJumpToMark: handleJumpToMark,
          onDeleteMark: handleDeleteMark,
          onDeleteAllLocalMarks: handleDeleteAllLocalMarks,
          onJumpToIndex: handleJumpToIndex,
          onJumpOlder: handleJumpOlder,
          onJumpNewer: handleJumpNewer,
          onClearJumps: handleClearJumps,
          onSetMark: handleSetMark,
          onJumpToLine: handleJumpToLine,
        }}
        showMacroDebugger={showMacroDebugger}
        onToggleMacroDebugger={handleToggleMacroDebugger}
        timelineBaseState={timelineBaseState}
        onPreviewMacroFrame={setMacroPreviewState}
        showDiffView={showDiffView}
        activeMissionForDiff={activeMissionForDiff}
        showVirtualKeyboard={showVirtualKeyboard}
        lastPressedKey={lastPressedKey}
        showActionTimeline={showActionTimeline}
        timelineSteps={timelineSteps}
        previewStepIndex={previewStepIndex}
        sandboxInitialText={sandboxInitialLines().join('\n')}
        allKeysSoFar={allKeysSoFar}
        onSelectTimelineStep={handleSelectTimelineStep}
        onBranchFromStep={handleBranchFromStep}
        onCancelTimelinePreview={handleCancelPreview}
        onToggleActionTimeline={handleToggleActionTimeline}
      />

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
