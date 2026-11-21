import { useState, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { CoachingToast } from './components/CoachingToast/CoachingToast';
import { AppHeader, AppTab } from './components/AppHeader/AppHeader';
import { AppModals } from './components/AppModals/AppModals';
import { AppMainWorkspace } from './components/AppMainWorkspace/AppMainWorkspace';
import { VimEditorState } from './vim-engine';
import { Mission } from './types/mission';
import { MISSIONS } from './data/missions';
import { sandboxInitialLines } from './data/sandbox';
import { loadProgress, LessonProgress } from './utils/storage';
import { AntiPatternDetector } from './utils/antiPatternDetector';
import { useSoundEffects } from './utils/soundEffects';
import { getChallengeFromUrl, createCustomMissionObject } from './utils/customMission';
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
import { useAppKeyAndCompletionEffects } from './hooks/useAppKeyAndCompletionEffects';
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
  const hardcore = useHardcoreAndKeymaps(setEditorStateRef);
  const locale = useLocale();
  const audio = useSoundEffects();

  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [progress, setProgress] = useState<LessonProgress>(() => loadProgress());
  const [isEditorFocused, setIsEditorFocused] = useState<boolean>(true);
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [lastPressedKey, setLastPressedKey] = useState<string | undefined>(undefined);
  const [coachingMessage, setCoachingMessage] = useState<string | null>(null);
  const [macroPreviewState, setMacroPreviewState] = useState<VimEditorState | null>(null);
  const [bellCount, setBellCount] = useState(0);

  const antiPatternDetectorRef = useRef(new AntiPatternDetector());
  const currentMission = MISSIONS[currentMissionIndex];

  const getMissionInitialState = useCallback(
    (m: Mission): VimEditorState =>
      buildMissionInitialState(m, {
        activePresets: hardcore.activePresets,
        leaderKey: hardcore.leaderKey,
        customKeymaps: hardcore.customKeymaps,
      }),
    [hardcore.activePresets, hardcore.leaderKey, hardcore.customKeymaps]
  );

  const createCustomInitialState = useCallback(
    (mission: Mission): VimEditorState =>
      buildCustomInitialState(mission, {
        activePresets: hardcore.activePresets,
        leaderKey: hardcore.leaderKey,
        customKeymaps: hardcore.customKeymaps,
      }),
    [hardcore.activePresets, hardcore.leaderKey, hardcore.customKeymaps]
  );

  const [editorState, setEditorState] = useState<VimEditorState>(() =>
    initialCustomMission
      ? createCustomInitialState(initialCustomMission)
      : getMissionInitialState(currentMission)
  );
  setEditorStateRef.current = setEditorState;

  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;
  const keystrokeCountRef = useRef(keystrokeCount);
  keystrokeCountRef.current = keystrokeCount;

  const viewSettings = useEditorViewSettings({ editorState, setEditorState });
  const workspaceHandlers = useEditorWorkspaceHandlers({ setEditorState, setIsEditorFocused });

  const ghost = useGhostReplay({
    currentMission,
    getMissionInitialState,
    setEditorState,
    setKeystrokeCount,
    setRecentKeys,
    setLastPressedKey,
    playKeySound: audio.playKeySound,
  });

  const timeline = useActionTimeline({
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

  const displayEditorState = macroPreviewState ?? timeline.timelineBaseState;

  const speedrun = useSpeedrunSession({
    currentTab,
    editorState,
    getMissionInitialState,
    setEditorState,
    setCoachingMessage,
    playSuccessSound: audio.playSuccessSound,
    handleStopGhostReplay: ghost.handleStopGhostReplay,
    resetActionTimeline: timeline.resetActionTimeline,
    setRecentKeys,
    setLastPressedKey,
    antiPatternDetectorRef,
  });

  const { isCompleted, processKeyInput } = useAppKeyAndCompletionEffects({
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
    speedrunStatus: speedrun.speedrunStatus,
    setSpeedrunKeystrokes: speedrun.setSpeedrunKeystrokes,
    hardcoreMode: hardcore.hardcoreMode,
    hardcoreGuardRef: hardcore.hardcoreGuardRef,
    triggerHardcoreViolation: hardcore.triggerHardcoreViolation,
    antiPatternDetectorRef,
    playKeySound: audio.playKeySound,
    playSuccessSound: audio.playSuccessSound,
    beginTimelineKeyInput: timeline.beginTimelineKeyInput,
    commitTimelineKeyStep: timeline.commitTimelineKeyStep,
  });

  const missionHandlers = useAppMissionHandlers({
    currentMission,
    currentMissionIndex,
    customMission,
    activePresets: hardcore.activePresets,
    leaderKey: hardcore.leaderKey,
    customKeymaps: hardcore.customKeymaps,
    userInitConfig: hardcore.userInitConfig,
    antiPatternDetectorRef,
    getMissionInitialState,
    resetActionTimeline: timeline.resetActionTimeline,
    resetSpeedrunReady: speedrun.resetSpeedrunReady,
    handleStopGhostReplay: ghost.handleStopGhostReplay,
    enableDiffView: viewSettings.enableDiffView,
    reloadHardcoreAndKeymaps: hardcore.reloadHardcoreAndKeymaps,
    restoreViewSettings: viewSettings.restoreViewSettings,
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
    setShowActionTimeline: timeline.setShowActionTimeline,
    setSpeedrunBestRecord: speedrun.setSpeedrunBestRecord,
  });

  const isModalOrGameBlocked =
    viewSettings.isAnyModalOpen ||
    currentTab === 'arcade' ||
    currentTab === 'dungeon' ||
    currentTab === 'dojo';

  useVimKeyboardInput({
    isModalOrGameBlocked,
    isGhostReplaying: ghost.isGhostReplaying,
    handleStopGhostReplay: ghost.handleStopGhostReplay,
    isEditorFocused,
    setIsEditorFocused,
    editorMode: editorState.mode,
    activePresets: hardcore.activePresets,
    hardcoreMode: hardcore.hardcoreMode,
    hardcoreGuardRef: hardcore.hardcoreGuardRef,
    triggerHardcoreViolation: hardcore.triggerHardcoreViolation,
    setCoachingMessage,
    processKeyInput,
  });

  const activeMissionForDiff =
    currentTab === 'course'
      ? currentMission
      : currentTab === 'custom' && customMission
        ? customMission
        : currentTab === 'speedrun' && speedrun.speedrunStatus === 'running'
          ? speedrun.activeSpeedrunMission
          : undefined;

  const statusFilename = resolveStatusFilename(
    displayEditorState,
    currentTab,
    currentMission,
    speedrun.speedrunCurrentStage
  );

  return (
    <div className={`app-layout ${displayEditorState.zenMode ? 'zen-mode-active' : ''}`}>
      {displayEditorState.zenMode && (
        <button
          type="button"
          className="zen-mode-exit-btn"
          data-testid="zen-mode-exit-btn"
          onClick={() => {
            setEditorState((prev) => ({ ...prev, zenMode: false }));
            setIsEditorFocused(true);
          }}
        >
          {t('🧘 Zen 모드 종료 (:ZenMode)')}
        </button>
      )}
      {/* 🚀 상단 고정 플로팅 알림 토스트 */}
      <div className="top-toast-container" data-testid="top-toast-container" aria-live="polite">
        {hardcore.hardcoreWarning && (
          <div
            className="hardcore-warning-banner hardcore-warning-toast"
            role="alert"
            data-testid="hardcore-warning-banner"
          >
            <div className="hardcore-warning-content">
              <span className="hardcore-warning-icon">🚫</span>
              <span className="hardcore-warning-text">{hardcore.hardcoreWarning}</span>
            </div>
            <button
              type="button"
              className="hardcore-warning-close-btn"
              onClick={hardcore.dismissHardcoreWarning}
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
        onSwitchTab={missionHandlers.handleSwitchTab}
        hardcoreMode={hardcore.hardcoreMode}
        onToggleHardcoreMode={hardcore.handleToggleHardcoreMode}
        onOpenDailyModal={() => viewSettings.setIsDailyModalOpen(true)}
        onOpenAnalyticsModal={() => viewSettings.setIsAnalyticsModalOpen(true)}
        onOpenCustomModal={() => viewSettings.setIsCustomModalOpen(true)}
        onOpenConfigModal={() => viewSettings.setIsConfigModalOpen(true)}
        onOpenLessonModal={() => viewSettings.setIsModalOpen(true)}
        showDiffView={viewSettings.showDiffView}
        onToggleDiffView={viewSettings.handleToggleDiffView}
        showRegisterInspector={viewSettings.showRegisterInspector}
        onToggleRegisterInspector={viewSettings.handleToggleRegisterInspector}
        showMarksVisualizer={viewSettings.showMarksVisualizer}
        onToggleMarksVisualizer={viewSettings.handleToggleMarksVisualizer}
        showGrammarAST={viewSettings.showGrammarAST}
        onToggleGrammarAST={viewSettings.handleToggleGrammarAST}
        showActionTimeline={timeline.showActionTimeline}
        onToggleActionTimeline={timeline.handleToggleActionTimeline}
        showVirtualKeyboard={viewSettings.showVirtualKeyboard}
        onToggleVirtualKeyboard={viewSettings.handleToggleVirtualKeyboard}
        relativeLineNumbers={viewSettings.relativeLineNumbers}
        onToggleRelativeLineNumbers={viewSettings.handleToggleRelativeLine}
        showMacroDebugger={viewSettings.showMacroDebugger}
        onToggleMacroDebugger={viewSettings.handleToggleMacroDebugger}
        showWhichKey={viewSettings.showWhichKey}
        onToggleWhichKey={viewSettings.handleToggleWhichKey}
        currentTheme={hardcore.currentTheme}
        onThemeChange={hardcore.handleThemeChange}
        isMuted={audio.isMuted}
        onToggleMute={audio.toggleMute}
        locale={locale}
      />

      <AppMainWorkspace
        currentTab={currentTab}
        onSwitchTab={missionHandlers.handleSwitchTab}
        audio={{
          playKeySound: audio.playKeySound,
          playSuccessSound: audio.playSuccessSound,
          isMuted: audio.isMuted,
        }}
        mission={{
          progress,
          currentMission,
          currentMissionIndex,
          totalMissions: MISSIONS.length,
          customMission,
          isCompleted,
          keystrokeCount,
          onSelectMission: missionHandlers.handleSelectMission,
          onResetMission: missionHandlers.handleResetMission,
          onResetCustomMission: missionHandlers.handleResetCustomMission,
          onStartGhostReplay: ghost.handleStartGhostReplay,
          onStopGhostReplay: ghost.handleStopGhostReplay,
          isGhostReplaying: ghost.isGhostReplaying,
          ghostReplayProgress: ghost.ghostReplayProgress,
          onOpenBYOCModal: () => viewSettings.setIsBYOCModalOpen(true),
          onResetSandbox: missionHandlers.handleResetSandbox,
          dojoInitialDrill,
        }}
        speedrun={{
          status: speedrun.speedrunStatus,
          currentStage: speedrun.speedrunCurrentStage,
          totalStages: speedrun.speedrunStages.length,
          activeMission: speedrun.activeSpeedrunMission,
          elapsedSeconds: speedrun.speedrunElapsedSeconds,
          keystrokes: speedrun.speedrunKeystrokes,
          bestRecord: speedrun.speedrunBestRecord,
          isNewRecord: speedrun.speedrunIsNewRecord,
          onStart: speedrun.handleStartSpeedrun,
        }}
        editor={{
          editorState,
          displayEditorState,
          processKeyInput,
          isShaking: hardcore.isEditorShaking,
          isFocused: isEditorFocused,
          relativeLineNumbers: viewSettings.relativeLineNumbers,
          bellCount,
          onFocus: () => setIsEditorFocused(true),
          onAreaClick: hardcore.handleEditorAreaClick,
          recentKeys,
          statusFilename,
          onSelectWildmenuCandidate: workspaceHandlers.handleSelectWildmenuCandidate,
          viewportHandlers: workspaceHandlers.viewportHandlers,
        }}
        panels={{
          showGrammarAST: viewSettings.showGrammarAST,
          onCloseGrammarAST: () => viewSettings.setShowGrammarAST(false),
          showRegisterInspector: viewSettings.showRegisterInspector,
          onToggleRegisterInspector: viewSettings.handleToggleRegisterInspector,
          onRunMacroFromDebugger: missionHandlers.handleRunMacroFromDebugger,
          onOpenMacroDebugger: viewSettings.handleOpenMacroDebugger,
          onUpdateRegister: workspaceHandlers.handleUpdateRegister,
          onDeleteRegister: workspaceHandlers.handleDeleteRegister,
          showMarksVisualizer: viewSettings.showMarksVisualizer,
          onToggleMarksVisualizer: viewSettings.handleToggleMarksVisualizer,
          marksHandlers: workspaceHandlers.marksHandlers,
          showMacroDebugger: viewSettings.showMacroDebugger,
          onToggleMacroDebugger: viewSettings.handleToggleMacroDebugger,
          showWhichKey: viewSettings.showWhichKey,
          onToggleWhichKey: viewSettings.handleToggleWhichKey,
          timelineBaseState: timeline.timelineBaseState,
          onPreviewMacroFrame: setMacroPreviewState,
          showDiffView: viewSettings.showDiffView,
          activeMissionForDiff,
          showVirtualKeyboard: viewSettings.showVirtualKeyboard,
          lastPressedKey,
          showActionTimeline: timeline.showActionTimeline,
          timelineSteps: timeline.timelineSteps,
          previewStepIndex: timeline.previewStepIndex,
          sandboxInitialText: sandboxInitialLines().join('\n'),
          allKeysSoFar: timeline.allKeysSoFar,
          onSelectTimelineStep: timeline.handleSelectTimelineStep,
          onBranchFromStep: timeline.handleBranchFromStep,
          onCancelTimelinePreview: timeline.handleCancelPreview,
          onToggleActionTimeline: timeline.handleToggleActionTimeline,
        }}
      />

      <footer className="app-footer">
        <span>{t('VimPracticeOnWeb • 키보드로 미션을 완료하며 자연스럽게 Vim을 마스터하세요')}</span>
      </footer>

      <AppModals
        editorState={editorState}
        lesson={{
          isOpen: viewSettings.isModalOpen,
          onClose: () => viewSettings.setIsModalOpen(false),
          currentMissionId: currentMission.id,
          progress,
          onSelectById: missionHandlers.handleSelectLessonById,
        }}
        customMission={{
          isOpen: viewSettings.isCustomModalOpen,
          onClose: () => viewSettings.setIsCustomModalOpen(false),
          onPlay: missionHandlers.handlePlayCustomMission,
        }}
        analytics={{
          isOpen: viewSettings.isAnalyticsModalOpen,
          onClose: () => viewSettings.setIsAnalyticsModalOpen(false),
          onOpenDaily: () => viewSettings.setIsDailyModalOpen(true),
          onStartWeaknessDrill: () => {
            setDojoInitialDrill({ drill: 'weakness-custom', nonce: Date.now() });
            missionHandlers.handleSwitchTab('dojo');
          },
        }}
        daily={{
          isOpen: viewSettings.isDailyModalOpen,
          onClose: () => viewSettings.setIsDailyModalOpen(false),
          playKeySound: audio.playKeySound,
          playSuccessSound: audio.playSuccessSound,
        }}
        config={{
          isOpen: viewSettings.isConfigModalOpen,
          onClose: () => {
            viewSettings.setIsConfigModalOpen(false);
            setEditorState((prev) => ({ ...prev, showConfigModal: false }));
          },
          relativeLineNumbers: viewSettings.relativeLineNumbers,
          currentTheme: hardcore.currentTheme,
          leaderKey: hardcore.leaderKey,
          activePresets: hardcore.activePresets,
          onTogglePreset: hardcore.handleTogglePreset,
          onChangeLeaderKey: hardcore.handleChangeLeaderKey,
          customKeymaps: hardcore.customKeymaps,
          onAddCustomKeymap: hardcore.handleAddCustomKeymap,
          onDeleteCustomKeymap: hardcore.handleDeleteCustomKeymap,
          onRestoreBackup: missionHandlers.handleRestoreBackup,
          userInitConfig: hardcore.userInitConfig,
          onApplyUserInitConfig: hardcore.handleApplyUserInitConfig,
        }}
        byoc={{
          isOpen: viewSettings.isBYOCModalOpen,
          onClose: () => viewSettings.setIsBYOCModalOpen(false),
          onPlay: missionHandlers.handlePlayBYOCMission,
        }}
        fuzzyFinderHandlers={workspaceHandlers.fuzzyFinderHandlers}
        helpHandlers={workspaceHandlers.helpHandlers}
      />
    </div>
  );
}

export default App;
