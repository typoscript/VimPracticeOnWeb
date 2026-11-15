import React, { lazy, Suspense } from 'react';
import { MissionPanel } from '../MissionPanel/MissionPanel';
import { Keycaster } from '../Keycaster/Keycaster';
import { DiffViewer } from '../DiffViewer/DiffViewer';
import { VirtualKeyboard } from '../VirtualKeyboard/VirtualKeyboard';
import { SpeedrunPanel } from '../SpeedrunPanel/SpeedrunPanel';
import { StatusBar } from '../StatusBar/StatusBar';
import { RegisterInspector } from '../RegisterInspector/RegisterInspector';
import { MarksJumpVisualizer } from '../MarksJumpVisualizer/MarksJumpVisualizer';
import { MacroDebugger } from '../MacroDebugger/MacroDebugger';
import { VimGrammarASTViewer } from '../VimGrammarASTViewer/VimGrammarASTViewer';
import { ActionTimelinePanel } from '../ActionTimelinePanel/ActionTimelinePanel';
import { AppTab } from '../AppHeader/AppHeader';
import { EditorViewport } from '../EditorViewport/EditorViewport';
import { VimEditorState, VimMode } from '../../vim-engine';
import { Mission } from '../../types/mission';
import { LessonProgress } from '../../utils/storage';
import { t } from '../../i18n';

// 첫 화면에 필요 없는 게임 탭 화면은 처음 열 때 별도 청크로 불러옵니다 (초기 번들 크기 절감)
const ArcadeSurvival = lazy(() => import('../ArcadeSurvival/ArcadeSurvival').then((m) => ({ default: m.ArcadeSurvival })));
const DungeonRPG = lazy(() => import('../DungeonRPG/DungeonRPG').then((m) => ({ default: m.DungeonRPG })));
const HardcoreDojo = lazy(() => import('../HardcoreDojo/HardcoreDojo').then((m) => ({ default: m.HardcoreDojo })));

type MissionPanelProps = React.ComponentProps<typeof MissionPanel>;
type SpeedrunPanelProps = React.ComponentProps<typeof SpeedrunPanel>;
type EditorViewportProps = React.ComponentProps<typeof EditorViewport>;
type RegisterInspectorProps = React.ComponentProps<typeof RegisterInspector>;
type MarksVisualizerProps = React.ComponentProps<typeof MarksJumpVisualizer>;
type ActionTimelineProps = React.ComponentProps<typeof ActionTimelinePanel>;

export interface AppMainWorkspaceProps {
  currentTab: AppTab;
  onSwitchTab: (tab: AppTab) => void;
  showGrammarAST: boolean;
  onCloseGrammarAST: () => void;
  editorState: VimEditorState;
  displayEditorState: VimEditorState;
  processKeyInput: (key: string) => void;
  playKeySound: (key: string, mode: VimMode) => void;
  playSuccessSound: () => void;
  isMuted: boolean;
  dojoInitialDrill: { drill: 'weakness-custom'; nonce: number } | null;
  progress: LessonProgress;
  currentMission: Mission;
  currentMissionIndex: number;
  totalMissions: number;
  customMission: Mission | null;
  isCompleted: boolean;
  keystrokeCount: number;
  onSelectMission: (idx: number) => void;
  onResetMission: () => void;
  onResetCustomMission: () => void;
  onStartGhostReplay: () => void;
  onStopGhostReplay: () => void;
  isGhostReplaying: boolean;
  ghostReplayProgress: MissionPanelProps['ghostReplayProgress'];
  onOpenBYOCModal: () => void;
  onResetSandbox: () => void;
  speedrunStatus: SpeedrunPanelProps['status'];
  speedrunCurrentStage: number;
  speedrunTotalStages: number;
  activeSpeedrunMission?: Mission;
  speedrunElapsedSeconds: number;
  speedrunKeystrokes: number;
  speedrunBestRecord: SpeedrunPanelProps['bestRecord'];
  speedrunIsNewRecord: boolean;
  onStartSpeedrun: () => void;
  isEditorShaking: boolean;
  isEditorFocused: boolean;
  relativeLineNumbers: boolean;
  bellCount: number;
  onFocusEditor: () => void;
  onEditorAreaClick: () => void;
  viewportHandlers: Pick<
    EditorViewportProps,
    | 'onSwitchPane'
    | 'onSelectCompletionCandidate'
    | 'onSwitchBuffer'
    | 'onSwitchTabPage'
    | 'onCloseTabPage'
    | 'onNewTabPage'
    | 'onJumpToMark'
    | 'onCloseLspHover'
    | 'onJumpQuickfixItem'
    | 'onCloseQuickfixWindow'
    | 'onJumpLocationListItem'
    | 'onCloseLocationListWindow'
    | 'onSwitchCommandLineWindowType'
    | 'onClearCommandLineHistory'
    | 'onCloseCommandLineWindow'
    | 'onSelectCommandLineWindowLine'
    | 'onExecuteCommandLineWindowLine'
  >;
  recentKeys: React.ComponentProps<typeof Keycaster>['recentKeys'];
  statusFilename: string;
  showRegisterInspector: boolean;
  onToggleRegisterInspector: () => void;
  onRunMacroFromDebugger: (regName: string, count?: number) => void;
  onOpenMacroDebugger: RegisterInspectorProps['onOpenMacroDebugger'];
  onUpdateRegister: RegisterInspectorProps['onUpdateRegister'];
  onDeleteRegister: RegisterInspectorProps['onDeleteRegister'];
  showMarksVisualizer: boolean;
  onToggleMarksVisualizer: () => void;
  marksHandlers: Pick<
    MarksVisualizerProps,
    | 'onJumpToMark'
    | 'onDeleteMark'
    | 'onDeleteAllLocalMarks'
    | 'onJumpToIndex'
    | 'onJumpOlder'
    | 'onJumpNewer'
    | 'onClearJumps'
    | 'onSetMark'
    | 'onJumpToLine'
  >;
  showMacroDebugger: boolean;
  onToggleMacroDebugger: () => void;
  timelineBaseState: VimEditorState;
  onPreviewMacroFrame: (state: VimEditorState | null) => void;
  showDiffView: boolean;
  activeMissionForDiff?: Mission | null;
  showVirtualKeyboard: boolean;
  lastPressedKey?: string;
  showActionTimeline: boolean;
  timelineSteps: ActionTimelineProps['steps'];
  previewStepIndex: number | null;
  sandboxInitialText: string;
  allKeysSoFar: string[];
  onSelectTimelineStep: (idx: number) => void;
  onBranchFromStep: (idx: number) => void;
  onCancelTimelinePreview: () => void;
  onToggleActionTimeline: () => void;
}

export const AppMainWorkspace: React.FC<AppMainWorkspaceProps> = ({
  currentTab,
  onSwitchTab,
  showGrammarAST,
  onCloseGrammarAST,
  editorState,
  displayEditorState,
  processKeyInput,
  playKeySound,
  playSuccessSound,
  isMuted,
  dojoInitialDrill,
  progress,
  currentMission,
  currentMissionIndex,
  totalMissions,
  customMission,
  isCompleted,
  keystrokeCount,
  onSelectMission,
  onResetMission,
  onResetCustomMission,
  onStartGhostReplay,
  onStopGhostReplay,
  isGhostReplaying,
  ghostReplayProgress,
  onOpenBYOCModal,
  onResetSandbox,
  speedrunStatus,
  speedrunCurrentStage,
  speedrunTotalStages,
  activeSpeedrunMission,
  speedrunElapsedSeconds,
  speedrunKeystrokes,
  speedrunBestRecord,
  speedrunIsNewRecord,
  onStartSpeedrun,
  isEditorShaking,
  isEditorFocused,
  relativeLineNumbers,
  bellCount,
  onFocusEditor,
  onEditorAreaClick,
  viewportHandlers,
  recentKeys,
  statusFilename,
  showRegisterInspector,
  onToggleRegisterInspector,
  onRunMacroFromDebugger,
  onOpenMacroDebugger,
  onUpdateRegister,
  onDeleteRegister,
  showMarksVisualizer,
  onToggleMarksVisualizer,
  marksHandlers,
  showMacroDebugger,
  onToggleMacroDebugger,
  timelineBaseState,
  onPreviewMacroFrame,
  showDiffView,
  activeMissionForDiff,
  showVirtualKeyboard,
  lastPressedKey,
  showActionTimeline,
  timelineSteps,
  previewStepIndex,
  sandboxInitialText,
  allKeysSoFar,
  onSelectTimelineStep,
  onBranchFromStep,
  onCancelTimelinePreview,
  onToggleActionTimeline,
}) => {
  const tabLoadingFallback = (
    <div className="lazy-tab-loading" data-testid="lazy-tab-loading">
      {t('불러오는 중…')}
    </div>
  );

  return (
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
          onClose={onCloseGrammarAST}
        />
      )}

      {currentTab === 'arcade' ? (
        <Suspense fallback={tabLoadingFallback}>
          <ArcadeSurvival
            onPlayKeySound={playKeySound}
            onPlaySuccessSound={playSuccessSound}
            isMuted={isMuted}
          />
        </Suspense>
      ) : currentTab === 'dungeon' ? (
        <Suspense fallback={tabLoadingFallback}>
          <DungeonRPG
            onPlayKeySound={playKeySound}
            onPlaySuccessSound={playSuccessSound}
            isMuted={isMuted}
          />
        </Suspense>
      ) : currentTab === 'dojo' ? (
        <Suspense fallback={tabLoadingFallback}>
          <HardcoreDojo
            onBackToCourse={() => onSwitchTab('course')}
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
              totalMissions={totalMissions}
              isCompleted={isCompleted}
              keystrokeCount={keystrokeCount}
              onSelectMission={onSelectMission}
              onResetMission={onResetMission}
              onStartGhostReplay={onStartGhostReplay}
              onStopGhostReplay={onStopGhostReplay}
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
              onResetMission={onResetCustomMission}
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
                  onClick={onOpenBYOCModal}
                  data-testid="open-byoc-modal-btn"
                  title={t('내 실제 업무 코드를 붙여넣어 자동 리팩토링 미션 생성')}
                >
                  {t('✨ 내 코드로 리팩토링 미션 생성 (BYOC)')}
                </button>
                <button
                  className="sandbox-reset-btn"
                  onClick={onResetSandbox}
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
              totalStages={speedrunTotalStages}
              currentMissionTitle={activeSpeedrunMission ? t(activeSpeedrunMission.title) : undefined}
              elapsedSeconds={speedrunElapsedSeconds}
              totalKeystrokes={speedrunKeystrokes}
              bestRecord={speedrunBestRecord}
              isNewRecord={speedrunIsNewRecord}
              onStart={onStartSpeedrun}
              onRestart={onStartSpeedrun}
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
            onFocusEditor={onFocusEditor}
            onEditorAreaClick={onEditorAreaClick}
            {...viewportHandlers}
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
            onToggle={onToggleRegisterInspector}
            registers={editorState.registers}
            activeRegister={editorState.activeRegister}
            clipboard={editorState.clipboard}
            recordingMacro={editorState.recordingMacro}
            onRunMacro={onRunMacroFromDebugger}
            onOpenMacroDebugger={onOpenMacroDebugger}
            onUpdateRegister={onUpdateRegister}
            onDeleteRegister={onDeleteRegister}
          />

          <MarksJumpVisualizer
            isOpen={showMarksVisualizer}
            onClose={onToggleMarksVisualizer}
            marks={displayEditorState.marks}
            jumpList={displayEditorState.jumpList}
            jumpIndex={displayEditorState.jumpIndex}
            lines={displayEditorState.lines}
            currentCursor={displayEditorState.cursor}
            primaryFilename={displayEditorState.primaryFilename}
            {...marksHandlers}
          />

          <MacroDebugger
            isOpen={showMacroDebugger}
            onToggle={onToggleMacroDebugger}
            baseState={timelineBaseState}
            onPreviewFrame={onPreviewMacroFrame}
            onRunMacro={onRunMacroFromDebugger}
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
                  : sandboxInitialText
              }
              initialCursor={
                currentTab === 'course'
                  ? currentMission.initialCursor
                  : currentTab === 'custom' && customMission
                  ? customMission.initialCursor
                  : { line: 0, col: 0 }
              }
              allKeysSoFar={allKeysSoFar}
              onSelectStep={onSelectTimelineStep}
              onBranchFromStep={onBranchFromStep}
              onCancelPreview={onCancelTimelinePreview}
              onClose={onToggleActionTimeline}
            />
          )}
        </>
      )}
    </main>
  );
};
