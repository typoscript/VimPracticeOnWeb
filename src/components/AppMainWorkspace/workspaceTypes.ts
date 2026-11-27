import type React from 'react';
import type { MissionPanel } from '../MissionPanel/MissionPanel';
import type { Keycaster } from '../Keycaster/Keycaster';
import type { SpeedrunPanel as SpeedrunPanelType } from '../SpeedrunPanel/SpeedrunPanel';
import type { RegisterInspector } from '../RegisterInspector/RegisterInspector';
import type { MarksJumpVisualizer as MarksJumpVisualizerType } from '../MarksJumpVisualizer/MarksJumpVisualizer';
import type { ActionTimelinePanel } from '../ActionTimelinePanel/ActionTimelinePanel';
import type { AppTab } from '../AppHeader/AppHeader';
import type { EditorViewport } from '../EditorViewport/EditorViewport';
import type { VimEditorState, VimMode } from '../../vim-engine';
import type { Mission } from '../../types/mission';
import type { LessonProgress } from '../../utils/storage';

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
