import React, { lazy, Suspense, useRef, useState } from 'react';
import { MissionPanel } from '../MissionPanel/MissionPanel';
import { Keycaster } from '../Keycaster/Keycaster';
import { EditorViewport } from '../EditorViewport/EditorViewport';
import { t } from '../../i18n';
import { SandboxPanel } from './SandboxPanel';
import { WorkspaceStatusBar } from './WorkspaceStatusBar';
import { WorkspaceSidePanels } from './WorkspaceSidePanels';
import { useOpenedOnce } from './useOpenedOnce';
import type { AppMainWorkspaceProps } from './workspaceTypes';

export type {
  WorkspaceAudioProps,
  WorkspaceMissionProps,
  WorkspaceSpeedrunProps,
  WorkspaceEditorProps,
  WorkspacePanelsProps,
  AppMainWorkspaceProps,
} from './workspaceTypes';

// 첫 화면에 닫혀 있는 탭·보조 패널은 처음 열 때 별도 청크로 불러옵니다 (index.js 초기 번들 경량화)
const ArcadeSurvival = lazy(() =>
  import('../ArcadeSurvival/ArcadeSurvival').then((m) => ({ default: m.ArcadeSurvival }))
);
const DungeonRPG = lazy(() =>
  import('../DungeonRPG/DungeonRPG').then((m) => ({ default: m.DungeonRPG }))
);
const HardcoreDojo = lazy(() =>
  import('../HardcoreDojo/HardcoreDojo').then((m) => ({ default: m.HardcoreDojo }))
);
const SpeedrunPanel = lazy(() =>
  import('../SpeedrunPanel/SpeedrunPanel').then((m) => ({ default: m.SpeedrunPanel }))
);
const VimGrammarASTViewer = lazy(() =>
  import('../VimGrammarASTViewer/VimGrammarASTViewer').then((m) => ({
    default: m.VimGrammarASTViewer,
  }))
);
const WhichKeyPopup = lazy(() =>
  import('../WhichKey/WhichKeyPopup').then((m) => ({ default: m.WhichKeyPopup }))
);
const HarpoonMenu = lazy(() =>
  import('../HarpoonMenu/HarpoonMenu').then((m) => ({ default: m.HarpoonMenu }))
);
const YankyMenu = lazy(() =>
  import('../YankyMenu/YankyMenu').then((m) => ({ default: m.YankyMenu }))
);
const GolfComparatorModal = lazy(() =>
  import('../GolfComparator/GolfComparatorModal').then((m) => ({
    default: m.GolfComparatorModal,
  }))
);
const NoiceCmdline = lazy(() =>
  import('../NoiceCmdline/NoiceCmdline').then((m) => ({
    default: m.NoiceCmdline,
  }))
);

export const AppMainWorkspace: React.FC<AppMainWorkspaceProps> = ({
  currentTab,
  onSwitchTab,
  audio,
  mission,
  speedrun,
  editor,
  panels,
}) => {
  const { editorState, displayEditorState } = editor;
  const dragDepthRef = useRef(0);
  const [isDraggingLocalFile, setIsDraggingLocalFile] = useState(false);
  const [golfCompareMissionId, setGolfCompareMissionId] = useState<number | null>(null);
  const showGolfComparator =
    currentTab === 'course' &&
    mission.isCompleted &&
    golfCompareMissionId === mission.currentMission.id &&
    Boolean(mission.currentMission.optimalKeys?.length);
  const marksLoaded = useOpenedOnce(panels.showMarksVisualizer);
  const macroDebuggerLoaded = useOpenedOnce(panels.showMacroDebugger);
  const whichKeyLoaded = useOpenedOnce(
    Boolean(
      (panels.showWhichKey ?? true) &&
        (displayEditorState.pendingKeys ||
          displayEditorState.pendingKeymapPrefix ||
          displayEditorState.insertCtrlXMode ||
          displayEditorState.insertRegisterPending)
    )
  );
  const tabLoadingFallback = (
    <div className="lazy-tab-loading" data-testid="lazy-tab-loading">
      {t('불러오는 중…')}
    </div>
  );

  const handleSandboxDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (currentTab !== 'sandbox' || !mission.onImportLocalFiles) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingLocalFile(true);
  };

  const handleSandboxDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (currentTab !== 'sandbox' || !mission.onImportLocalFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSandboxDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (currentTab !== 'sandbox' || !mission.onImportLocalFiles) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingLocalFile(false);
    }
  };

  const handleSandboxDrop = (e: React.DragEvent<HTMLElement>) => {
    if (currentTab !== 'sandbox' || !mission.onImportLocalFiles) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingLocalFile(false);
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      mission.onImportLocalFiles(droppedFiles);
      editor.onFocus();
    }
  };

  return (
    <main
      className={`editor-wrapper ${currentTab === 'sandbox' && isDraggingLocalFile ? 'sandbox-drag-over' : ''}`}
      onDragEnter={handleSandboxDragEnter}
      onDragOver={handleSandboxDragOver}
      onDragLeave={handleSandboxDragLeave}
      onDrop={handleSandboxDrop}
      data-testid="main-workspace"
    >
      {currentTab === 'sandbox' && isDraggingLocalFile && (
        <div className="sandbox-drop-overlay" data-testid="sandbox-drop-overlay">
          <div className="sandbox-drop-overlay-card">
            <span className="sandbox-drop-overlay-icon">📂</span>
            <strong>{t('여기에 로컬 코드 파일을 놓아 불러오기')}</strong>
            <span>{t('단일/멀티 텍스트 파일을 VFS·버퍼·Git 기준선에 즉시 마운트합니다')}</span>
          </div>
        </div>
      )}
      {panels.showGrammarAST &&
        currentTab !== 'arcade' &&
        currentTab !== 'dungeon' &&
        currentTab !== 'dojo' && (
          <Suspense fallback={null}>
            <VimGrammarASTViewer
              currentKeySequence={editorState.pendingKeys || ''}
              activeRegister={editorState.activeRegister}
              onSelectCandidate={(token) => {
                for (const ch of token) {
                  editor.processKeyInput(ch);
                }
              }}
              onClose={panels.onCloseGrammarAST}
            />
          </Suspense>
        )}

      {currentTab === 'arcade' ? (
        <Suspense fallback={tabLoadingFallback}>
          <ArcadeSurvival
            onPlayKeySound={audio.playKeySound}
            onPlaySuccessSound={audio.playSuccessSound}
            isMuted={audio.isMuted}
          />
        </Suspense>
      ) : currentTab === 'dungeon' ? (
        <Suspense fallback={tabLoadingFallback}>
          <DungeonRPG
            onPlayKeySound={audio.playKeySound}
            onPlaySuccessSound={audio.playSuccessSound}
            isMuted={audio.isMuted}
          />
        </Suspense>
      ) : currentTab === 'dojo' ? (
        <Suspense fallback={tabLoadingFallback}>
          <HardcoreDojo
            onBackToCourse={() => onSwitchTab('course')}
            playKeySound={audio.playKeySound}
            playSuccessSound={audio.playSuccessSound}
            initialDrill={mission.dojoInitialDrill}
            analyticsProgress={mission.progress}
          />
        </Suspense>
      ) : (
        <>
          {currentTab === 'course' && (
            <MissionPanel
              mission={mission.currentMission}
              missionIndex={mission.currentMissionIndex}
              totalMissions={mission.totalMissions}
              isCompleted={mission.isCompleted}
              keystrokeCount={mission.keystrokeCount}
              onSelectMission={mission.onSelectMission}
              onResetMission={mission.onResetMission}
              onStartGhostReplay={mission.onStartGhostReplay}
              onStopGhostReplay={mission.onStopGhostReplay}
              isGhostReplaying={mission.isGhostReplaying}
              ghostReplayProgress={mission.ghostReplayProgress}
              onOpenGolfCompare={
                mission.currentMission.optimalKeys && mission.currentMission.optimalKeys.length > 0
                  ? () => setGolfCompareMissionId(mission.currentMission.id)
                  : undefined
              }
            />
          )}

          {currentTab === 'custom' && mission.customMission && (
            <MissionPanel
              mission={mission.customMission}
              missionIndex={0}
              totalMissions={1}
              isCompleted={mission.isCompleted}
              keystrokeCount={mission.keystrokeCount}
              onSelectMission={() => {}}
              onResetMission={mission.onResetCustomMission}
              lastTestRun={displayEditorState.lastTestRun}
              activeFilename={displayEditorState.primaryFilename}
              onRunVirtualTests={() => {
                editor.onFocus();
                for (const k of ['Escape', ...':TestRun'.split(''), 'Enter']) {
                  editor.processKeyInput(k);
                }
              }}
              onOpenCapstoneFile={(filename) => {
                editor.onFocus();
                for (const k of ['Escape', ...`:e ${filename}`.split(''), 'Enter']) {
                  editor.processKeyInput(k);
                }
              }}
            />
          )}

          {currentTab === 'sandbox' && <SandboxPanel mission={mission} editor={editor} />}

          {currentTab === 'speedrun' && (
            <Suspense fallback={null}>
              <SpeedrunPanel
                status={speedrun.status}
                currentStageIndex={speedrun.currentStage}
                totalStages={speedrun.totalStages}
                currentMissionTitle={speedrun.activeMission ? t(speedrun.activeMission.title) : undefined}
                elapsedSeconds={speedrun.elapsedSeconds}
                totalKeystrokes={speedrun.keystrokes}
                bestRecord={speedrun.bestRecord}
                isNewRecord={speedrun.isNewRecord}
                onStart={speedrun.onStart}
                onRestart={speedrun.onStart}
              />
            </Suspense>
          )}

          <EditorViewport
            editorState={editorState}
            displayEditorState={displayEditorState}
            targetPosition={
              currentTab === 'course'
                ? mission.currentMission.targetCursor
                : speedrun.activeMission?.targetCursor
            }
            fallbackPrimaryFilename={
              currentTab === 'course' ? mission.currentMission.primaryFilename : undefined
            }
            isEditorShaking={editor.isShaking}
            isEditorFocused={editor.isFocused}
            relativeLineNumbers={editor.relativeLineNumbers}
            bellCount={editor.bellCount}
            onFocusEditor={editor.onFocus}
            onEditorAreaClick={editor.onAreaClick}
            {...editor.viewportHandlers}
          />

          <Suspense fallback={null}>
            {whichKeyLoaded && (
              <WhichKeyPopup
                editorState={displayEditorState}
                enabled={panels.showWhichKey ?? true}
                onPressKey={editor.processKeyInput}
                onDisable={panels.onToggleWhichKey}
              />
            )}

            {displayEditorState.harpoonMenu?.isOpen && (
              <HarpoonMenu
                editorState={displayEditorState}
                onPressKey={editor.processKeyInput}
              />
            )}

            {displayEditorState.yankyMenu?.isOpen && (
              <YankyMenu
                editorState={displayEditorState}
                onPressKey={editor.processKeyInput}
              />
            )}

            {displayEditorState.options?.cmdlinepopup &&
              (displayEditorState.mode === 'COMMAND' ||
                displayEditorState.mode === 'SEARCH') && (
                <NoiceCmdline
                  mode={displayEditorState.mode}
                  commandType={displayEditorState.commandType}
                  commandBuffer={displayEditorState.commandBuffer}
                  commandCursorCol={displayEditorState.commandCursorCol}
                  wildmenu={displayEditorState.wildmenu}
                  onSelectWildmenuCandidate={editor.onSelectWildmenuCandidate}
                />
              )}

            {showGolfComparator && mission.currentMission.optimalKeys && (
              <GolfComparatorModal
                missionTitle={mission.currentMission.title}
                par={mission.currentMission.par}
                initialState={panels.timelineSteps[0]?.snapshot ?? editorState}
                userKeys={panels.allKeysSoFar}
                optimalKeys={mission.currentMission.optimalKeys}
                onClose={() => setGolfCompareMissionId(null)}
              />
            )}
          </Suspense>

          <Keycaster recentKeys={editor.recentKeys} />
          <WorkspaceStatusBar editor={editor} />

          <WorkspaceSidePanels
            currentTab={currentTab}
            mission={mission}
            editor={editor}
            panels={panels}
            marksLoaded={marksLoaded}
            macroDebuggerLoaded={macroDebuggerLoaded}
          />
        </>
      )}
    </main>
  );
};
