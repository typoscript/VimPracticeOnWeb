import React, { lazy, Suspense, useState } from 'react';
import { MissionPanel } from '../MissionPanel/MissionPanel';
import { Keycaster } from '../Keycaster/Keycaster';
import { DiffViewer } from '../DiffViewer/DiffViewer';
import { VirtualKeyboard } from '../VirtualKeyboard/VirtualKeyboard';
import type { SpeedrunPanel as SpeedrunPanelType } from '../SpeedrunPanel/SpeedrunPanel';
import { StatusBar } from '../StatusBar/StatusBar';
import { RegisterInspector } from '../RegisterInspector/RegisterInspector';
import type { MarksJumpVisualizer as MarksJumpVisualizerType } from '../MarksJumpVisualizer/MarksJumpVisualizer';
import { ActionTimelinePanel } from '../ActionTimelinePanel/ActionTimelinePanel';
import { AppTab } from '../AppHeader/AppHeader';
import { EditorViewport } from '../EditorViewport/EditorViewport';
import { VimEditorState, VimMode, computeSearchCount } from '../../vim-engine';
import { Mission } from '../../types/mission';
import { LessonProgress } from '../../utils/storage';
import { t, i18nKey } from '../../i18n';

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
const MarksJumpVisualizer = lazy(() =>
  import('../MarksJumpVisualizer/MarksJumpVisualizer').then((m) => ({
    default: m.MarksJumpVisualizer,
  }))
);
const MacroDebugger = lazy(() =>
  import('../MacroDebugger/MacroDebugger').then((m) => ({ default: m.MacroDebugger }))
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

const SANDBOX_QUICK_TRY_CHIPS: ReadonlyArray<{
  id: string;
  label: string;
  titleKey: string;
  keys: readonly string[];
}> = [
  {
    id: 'oil',
    label: '📁 :Oil',
    titleKey: i18nKey('파일시스템 버퍼 편집 (:Oil)'),
    keys: ['Escape', ...':Oil'.split(''), 'Enter'],
  },
  {
    id: 'trouble',
    label: '🩺 :Trouble',
    titleKey: i18nKey('프로젝트 TODO · 진단 트리 (:Trouble)'),
    keys: ['Escape', ...':Trouble'.split(''), 'Enter'],
  },
  {
    id: 'harpoon',
    label: '⚓ :HarpoonMenu',
    titleKey: i18nKey('핀 파일 빠른 전환 (:HarpoonMenu)'),
    keys: ['Escape', ...':HarpoonMenu'.split(''), 'Enter'],
  },
  {
    id: 'yanky',
    label: '📋 :Yanks',
    titleKey: i18nKey('복사 링 히스토리 (:YankyRingHistory)'),
    keys: ['Escape', ...':Yanks'.split(''), 'Enter'],
  },
  {
    id: 'livegrep',
    label: '🔎 :LiveGrep',
    titleKey: i18nKey('프로젝트 전체 검색 (:LiveGrep)'),
    keys: ['Escape', ...':LiveGrep'.split(''), 'Enter'],
  },
  {
    id: 'undotree',
    label: '🌿 :UndotreeToggle',
    titleKey: i18nKey('시각적 Undo 트리 (:UndotreeToggle)'),
    keys: ['Escape', ...':UndotreeToggle'.split(''), 'Enter'],
  },
  {
    id: 'flash',
    label: '⚡ gs',
    titleKey: i18nKey('화면 라벨 점프 (gs)'),
    keys: ['Escape', 'g', 's'],
  },
  {
    id: 'gitsigns',
    label: '🔀 ]h',
    titleKey: i18nKey('Git Hunk 이동 (]h)'),
    keys: ['Escape', ']', 'h'],
  },
  {
    id: 'multicursor',
    label: '✨ :MultiCursor user',
    titleKey: i18nKey('다중 커서 편집 (g Ctrl-n)'),
    keys: ['Escape', ...':MultiCursor user'.split(''), 'Enter'],
  },
  {
    id: 'lua',
    label: '🌙 :source init.lua',
    titleKey: i18nKey('Lua 설정 즉시 적용 (:source init.lua)'),
    keys: ['Escape', ...':source init.lua'.split(''), 'Enter'],
  },
];

function useOpenedOnce(isOpen: boolean): boolean {
  const [opened, setOpened] = useState(isOpen);
  if (isOpen && !opened) setOpened(true);
  return opened || isOpen;
}

type MissionPanelProps = React.ComponentProps<typeof MissionPanel>;
type SpeedrunPanelProps = React.ComponentProps<typeof SpeedrunPanelType>;
type EditorViewportProps = React.ComponentProps<typeof EditorViewport>;
type RegisterInspectorProps = React.ComponentProps<typeof RegisterInspector>;
type MarksVisualizerProps = React.ComponentProps<typeof MarksJumpVisualizerType>;
type ActionTimelineProps = React.ComponentProps<typeof ActionTimelinePanel>;

export interface WorkspaceAudioProps {
  playKeySound: (key: string, mode: VimMode) => void;
  playSuccessSound: () => void;
  isMuted: boolean;
}

export interface WorkspaceMissionProps {
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
  dojoInitialDrill: { drill: 'weakness-custom'; nonce: number } | null;
}

export interface WorkspaceSpeedrunProps {
  status: SpeedrunPanelProps['status'];
  currentStage: number;
  totalStages: number;
  activeMission?: Mission;
  elapsedSeconds: number;
  keystrokes: number;
  bestRecord: SpeedrunPanelProps['bestRecord'];
  isNewRecord: boolean;
  onStart: () => void;
}

export interface WorkspaceEditorProps {
  editorState: VimEditorState;
  displayEditorState: VimEditorState;
  processKeyInput: (key: string) => void;
  isShaking: boolean;
  isFocused: boolean;
  relativeLineNumbers: boolean;
  bellCount: number;
  onFocus: () => void;
  onAreaClick: () => void;
  recentKeys: React.ComponentProps<typeof Keycaster>['recentKeys'];
  statusFilename: string;
  onSelectWildmenuCandidate?: (index: number) => void;
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
    | 'onCancelLspRename'
    | 'onApplyLspCodeAction'
    | 'onCloseLspCodeAction'
    | 'onCloseGitHunkPreview'
    | 'onResetGitHunk'
    | 'onStageGitHunk'
    | 'onJumpQuickfixItem'
    | 'onCloseQuickfixWindow'
    | 'onJumpLocationListItem'
    | 'onCloseLocationListWindow'
    | 'onJumpTroubleItem'
    | 'onChangeTroubleMode'
    | 'onCloseTroublePanel'
    | 'onJumpUndoSeq'
    | 'onTravelUndoOlder'
    | 'onTravelUndoNewer'
    | 'onCloseUndotreePanel'
    | 'onSwitchCommandLineWindowType'
    | 'onClearCommandLineHistory'
    | 'onCloseCommandLineWindow'
    | 'onSelectCommandLineWindowLine'
    | 'onExecuteCommandLineWindowLine'
  >;
}

export interface WorkspacePanelsProps {
  showGrammarAST: boolean;
  onCloseGrammarAST: () => void;
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
  showWhichKey?: boolean;
  onToggleWhichKey?: () => void;
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

export interface AppMainWorkspaceProps {
  currentTab: AppTab;
  onSwitchTab: (tab: AppTab) => void;
  audio: WorkspaceAudioProps;
  mission: WorkspaceMissionProps;
  speedrun: WorkspaceSpeedrunProps;
  editor: WorkspaceEditorProps;
  panels: WorkspacePanelsProps;
}

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

  return (
    <main className="editor-wrapper">
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
            />
          )}

          {currentTab === 'sandbox' && (
            <div className="sandbox-panel" data-testid="sandbox-panel">
              <div className="sandbox-top-row">
                <div className="sandbox-info">
                  <span className="sandbox-badge">🧪 SANDBOX</span>
                  <span className="sandbox-desc">
                    {t('미션 제약 없이 모든 Vim 키보드 명령어를 자유롭게 실험해 볼 수 있습니다.')}
                  </span>
                </div>
                <div className="sandbox-actions">
                  <button
                    className="sandbox-byoc-btn"
                    onClick={mission.onOpenBYOCModal}
                    data-testid="open-byoc-modal-btn"
                    title={t('내 실제 업무 코드를 붙여넣어 자동 리팩토링 미션 생성')}
                  >
                    {t('✨ 내 코드로 리팩토링 미션 생성 (BYOC)')}
                  </button>
                  <button
                    className="sandbox-reset-btn"
                    onClick={mission.onResetSandbox}
                    data-testid="sandbox-reset-btn"
                  >
                    {t('🔄 코드 초기화')}
                  </button>
                </div>
              </div>
              <div className="sandbox-quick-try" data-testid="sandbox-quick-try">
                <span className="sandbox-quick-try-label">{t('바로 체험:')}</span>
                <div className="sandbox-quick-try-chips">
                  {SANDBOX_QUICK_TRY_CHIPS.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="sandbox-quick-chip"
                      data-testid={`sandbox-chip-${chip.id}`}
                      title={t(chip.titleKey)}
                      tabIndex={-1}
                      onClick={() => {
                        editor.onFocus();
                        for (const k of chip.keys) {
                          editor.processKeyInput(k);
                        }
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

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
          </Suspense>

          <Keycaster recentKeys={editor.recentKeys} />
          <StatusBar
            mode={displayEditorState.mode}
            cursor={displayEditorState.cursor}
            virtualReplace={displayEditorState.virtualReplace}
            insertNormalSession={displayEditorState.insertNormalSession}
            insertRegisterPending={displayEditorState.insertRegisterPending}
            insertCtrlXMode={displayEditorState.insertCtrlXMode}
            confirmSubstitute={displayEditorState.confirmSubstitute}
            filename={editor.statusFilename}
            pendingKeys={displayEditorState.pendingKeys}
            recordingMacro={displayEditorState.recordingMacro}
            commandType={displayEditorState.commandType}
            commandBuffer={displayEditorState.commandBuffer}
            commandCursorCol={displayEditorState.commandCursorCol}
            digraphPending={displayEditorState.digraphPending}
            commandMessage={displayEditorState.commandMessage}
            wildmenu={displayEditorState.wildmenu}
            showWildmenuBar={displayEditorState.options?.wildmenu ?? true}
            onSelectWildmenuCandidate={editor.onSelectWildmenuCandidate}
            spellActive={displayEditorState.options?.spell}
            flashActive={Boolean(displayEditorState.flashJump?.isOpen)}
            oilActive={Boolean(displayEditorState.oilSession?.isOpen)}
            harpoonSlot={(() => {
              const cur = displayEditorState.primaryFilename;
              if (!cur || !displayEditorState.harpoonList?.length) return null;
              const idx = displayEditorState.harpoonList.indexOf(cur);
              return idx >= 0 ? idx + 1 : null;
            })()}
            multiCursorInfo={
              displayEditorState.multiCursor?.isOpen
                ? {
                    count:
                      displayEditorState.multiCursor.submode === 'insert'
                        ? displayEditorState.multiCursor.cursors.length
                        : displayEditorState.multiCursor.selections.length,
                    submode: displayEditorState.multiCursor.submode,
                  }
                : null
            }
            searchCount={(() => {
              const shm = displayEditorState.options?.shortmess ?? '';
              if (shm.includes('S')) return null;
              const activePattern =
                displayEditorState.mode === 'SEARCH'
                  ? (displayEditorState.commandBuffer ?? '').split(
                      displayEditorState.commandType === '?' ? '?' : '/'
                    )[0]
                  : displayEditorState.hlsearchSuppressed
                    ? ''
                    : (displayEditorState.lastSearchQuery ?? '');
              if (!activePattern) return null;
              const sc = computeSearchCount(
                displayEditorState.lines,
                activePattern,
                displayEditorState.cursor,
                {
                  ignorecase: displayEditorState.options?.ignorecase,
                  smartcase: displayEditorState.options?.smartcase,
                }
              );
              return sc.total > 0 ? { current: sc.current, total: sc.total } : null;
            })()}
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
            isOpen={panels.showRegisterInspector}
            onToggle={panels.onToggleRegisterInspector}
            registers={editorState.registers}
            activeRegister={editorState.activeRegister}
            clipboard={editorState.clipboard}
            recordingMacro={editorState.recordingMacro}
            onRunMacro={panels.onRunMacroFromDebugger}
            onOpenMacroDebugger={panels.onOpenMacroDebugger}
            onUpdateRegister={panels.onUpdateRegister}
            onDeleteRegister={panels.onDeleteRegister}
          />

          <Suspense fallback={null}>
            {marksLoaded && (
              <MarksJumpVisualizer
                isOpen={panels.showMarksVisualizer}
                onClose={panels.onToggleMarksVisualizer}
                marks={displayEditorState.marks}
                jumpList={displayEditorState.jumpList}
                jumpIndex={displayEditorState.jumpIndex}
                lines={displayEditorState.lines}
                currentCursor={displayEditorState.cursor}
                primaryFilename={displayEditorState.primaryFilename}
                {...panels.marksHandlers}
              />
            )}

            {macroDebuggerLoaded && (
              <MacroDebugger
                isOpen={panels.showMacroDebugger}
                onToggle={panels.onToggleMacroDebugger}
                baseState={panels.timelineBaseState}
                onPreviewFrame={panels.onPreviewMacroFrame}
                onRunMacro={panels.onRunMacroFromDebugger}
              />
            )}
          </Suspense>

          {panels.showDiffView && panels.activeMissionForDiff && (
            <DiffViewer
              currentLines={displayEditorState.lines}
              targetLines={panels.activeMissionForDiff.targetLines}
              isCompleted={
                currentTab === 'course' || currentTab === 'custom' ? mission.isCompleted : false
              }
            />
          )}

          {panels.showVirtualKeyboard && (
            <VirtualKeyboard
              mode={editorState.mode}
              lastPressedKey={panels.lastPressedKey}
              onKeyPress={editor.processKeyInput}
            />
          )}

          {panels.showActionTimeline && (
            <ActionTimelinePanel
              steps={panels.timelineSteps}
              previewStepIndex={panels.previewStepIndex}
              editorState={displayEditorState}
              missionTitle={
                currentTab === 'course'
                  ? mission.currentMission.title
                  : currentTab === 'custom' && mission.customMission
                    ? mission.customMission.title
                    : undefined
              }
              initialText={
                currentTab === 'course'
                  ? mission.currentMission.initialLines.join('\n')
                  : currentTab === 'custom' && mission.customMission
                    ? mission.customMission.initialLines.join('\n')
                    : panels.sandboxInitialText
              }
              initialCursor={
                currentTab === 'course'
                  ? mission.currentMission.initialCursor
                  : currentTab === 'custom' && mission.customMission
                    ? mission.customMission.initialCursor
                    : { line: 0, col: 0 }
              }
              allKeysSoFar={panels.allKeysSoFar}
              onSelectStep={panels.onSelectTimelineStep}
              onBranchFromStep={panels.onBranchFromStep}
              onCancelPreview={panels.onCancelTimelinePreview}
              onClose={panels.onToggleActionTimeline}
            />
          )}
        </>
      )}
    </main>
  );
};
