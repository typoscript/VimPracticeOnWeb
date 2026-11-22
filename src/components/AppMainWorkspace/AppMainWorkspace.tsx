import React, { lazy, Suspense, useRef, useState } from 'react';
import { LOCAL_FILE_ACCEPT } from '../../utils/sandboxLocalFiles';
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
    id: 'spectre',
    label: '🔁 :Spectre v1 v2',
    titleKey: i18nKey('프로젝트 대화형 검색 · 치환 (:Spectre)'),
    keys: ['Escape', ...':Spectre v1 v2'.split(''), 'Enter'],
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
    id: 'gitpanel',
    label: '🐙 :Git',
    titleKey: i18nKey('인터랙티브 Git 스테이징 · 커밋 패널 (:Git)'),
    keys: ['Escape', ...':Git'.split(''), 'Enter'],
  },
  {
    id: 'gblame',
    label: '🕵️ :Gblame',
    titleKey: i18nKey('인라인 Git Blame 토글 (:Gblame)'),
    keys: ['Escape', ...':Gblame'.split(''), 'Enter'],
  },
  {
    id: 'snippets',
    label: '✂️ :Snippets',
    titleKey: i18nKey('내장 스니펫 트리거 목록 (:Snippets)'),
    keys: ['Escape', ...':Snippets'.split(''), 'Enter'],
  },
  {
    id: 'multicursor',
    label: '✨ :MultiCursor user',
    titleKey: i18nKey('다중 커서 편집 (g Ctrl-n)'),
    keys: ['Escape', ...':MultiCursor user'.split(''), 'Enter'],
  },
  {
    id: 'minimove',
    label: '↕️ Alt-j/k',
    titleKey: i18nKey('줄 · 블록 즉시 이동 (Alt-j/k/h/l)'),
    keys: ['Escape', 'Alt-j'],
  },
  {
    id: 'terminal',
    label: '💻 :ToggleTerm',
    titleKey: i18nKey('내장 분할 터미널 토글 (:ToggleTerm)'),
    keys: ['Escape', ...':ToggleTerm'.split(''), 'Enter'],
  },
  {
    id: 'treesj',
    label: '🌳 gS',
    titleKey: i18nKey('구조적 Split/Join 토글 (gS / :TSJToggle)'),
    keys: ['Escape', 'g', 'S'],
  },
  {
    id: 'zenmode',
    label: '🧘 :ZenMode',
    titleKey: i18nKey('몰입형 집중 모드 토글 (:ZenMode)'),
    keys: ['Escape', ...':ZenMode'.split(''), 'Enter'],
  },
  {
    id: 'noice',
    label: '✨ :set noice',
    titleKey: i18nKey('noice.nvim 플로팅 커맨드라인 토글 (:set cmdlinepopup)'),
    keys: ['Escape', ...':set cmdlinepopup!'.split(''), 'Enter', ':'],
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
  localSandboxFiles?: string[];
  onImportLocalFiles?: (files: FileList | File[]) => void;
  onExportCurrentFile?: () => void;
  onExportWorkspaceZip?: () => void;
  onOpenSandboxFile?: (filename: string) => void;
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
    | 'onCloseBuffer'
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
    | 'onUpdateSpectreQuery'
    | 'onToggleSpectreItem'
    | 'onToggleAllSpectreItems'
    | 'onJumpSpectreItem'
    | 'onApplySpectreReplaceAll'
    | 'onCloseSpectrePanel'
    | 'onSelectGitPanelIndex'
    | 'onChangeGitPanelTab'
    | 'onToggleGitPanelHunkDiff'
    | 'onJumpGitPanelHunk'
    | 'onStageGitPanelHunk'
    | 'onStageAllGitPanel'
    | 'onUnstageGitPanel'
    | 'onResetGitPanelHunk'
    | 'onCommitGitPanel'
    | 'onToggleGitBlame'
    | 'onCloseGitPanel'
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
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
                  {mission.onImportLocalFiles && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={LOCAL_FILE_ACCEPT}
                        className="sandbox-file-input-hidden"
                        data-testid="sandbox-local-file-input"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            mission.onImportLocalFiles?.(e.target.files);
                            editor.onFocus();
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="sandbox-file-btn"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="sandbox-import-file-btn"
                        title={t('로컬 코드 파일 불러오기 (또는 화면에 드래그&드롭)')}
                      >
                        {t('📂 로컬 파일 열기')}
                      </button>
                      <input
                        ref={(el) => {
                          folderInputRef.current = el;
                          if (el) {
                            el.setAttribute('webkitdirectory', '');
                            el.setAttribute('directory', '');
                          }
                        }}
                        type="file"
                        multiple
                        className="sandbox-file-input-hidden"
                        data-testid="sandbox-local-folder-input"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            mission.onImportLocalFiles?.(e.target.files);
                            editor.onFocus();
                          }
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="sandbox-file-btn"
                        onClick={() => folderInputRef.current?.click()}
                        data-testid="sandbox-import-folder-btn"
                        title={t('프로젝트 폴더 전체를 VFS 트리로 불러오기')}
                      >
                        {t('📁 폴더 열기')}
                      </button>
                    </>
                  )}
                  {mission.onExportCurrentFile && (
                    <button
                      type="button"
                      className="sandbox-export-btn"
                      onClick={mission.onExportCurrentFile}
                      data-testid="sandbox-export-file-btn"
                      title={t('현재 버퍼의 수정된 코드를 로컬 파일로 다운로드')}
                    >
                      {t('💾 파일 내보내기')}
                    </button>
                  )}
                  {mission.onExportWorkspaceZip && (
                    <button
                      type="button"
                      className="sandbox-export-btn zip"
                      onClick={mission.onExportWorkspaceZip}
                      data-testid="sandbox-export-zip-btn"
                      title={t('작업공간의 모든 파일을 .zip 아카이브로 한 번에 다운로드')}
                    >
                      {t('📦 ZIP 내보내기')}
                    </button>
                  )}
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
              {mission.localSandboxFiles && mission.localSandboxFiles.length > 0 && (
                <div className="sandbox-local-files-bar" data-testid="sandbox-local-files-bar">
                  <span className="sandbox-local-files-label">{t('📂 로컬 파일:')}</span>
                  <div className="sandbox-local-files-chips">
                    {mission.localSandboxFiles.map((file) => {
                      const isActive = displayEditorState.primaryFilename === file;
                      return (
                        <button
                          key={file}
                          type="button"
                          className={`sandbox-local-file-chip ${isActive ? 'active' : ''}`}
                          data-testid={`sandbox-local-file-${file}`}
                          onClick={() => {
                            mission.onOpenSandboxFile?.(file);
                            editor.onFocus();
                          }}
                        >
                          📄 {file}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
            terminalActive={Boolean(displayEditorState.terminalSession?.isOpen)}
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
