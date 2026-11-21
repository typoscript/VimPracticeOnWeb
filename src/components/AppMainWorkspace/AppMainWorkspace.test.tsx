import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppMainWorkspace, AppMainWorkspaceProps } from './AppMainWorkspace';
import { createVimState } from '../../vim-engine';
import { MISSIONS } from '../../data/missions';

function makeProps(overrides: Partial<AppMainWorkspaceProps> = {}): AppMainWorkspaceProps {
  const baseState = createVimState(['const x = 1;', 'const y = 2;'], { line: 0, col: 0 });
  return {
    currentTab: 'course',
    onSwitchTab: vi.fn(),
    audio: {
      playKeySound: vi.fn(),
      playSuccessSound: vi.fn(),
      isMuted: false,
    },
    mission: {
      progress: {},
      currentMission: MISSIONS[0],
      currentMissionIndex: 0,
      totalMissions: MISSIONS.length,
      customMission: null,
      isCompleted: false,
      keystrokeCount: 0,
      onSelectMission: vi.fn(),
      onResetMission: vi.fn(),
      onResetCustomMission: vi.fn(),
      onStartGhostReplay: vi.fn(),
      onStopGhostReplay: vi.fn(),
      isGhostReplaying: false,
      ghostReplayProgress: undefined,
      onOpenBYOCModal: vi.fn(),
      onResetSandbox: vi.fn(),
      dojoInitialDrill: null,
    },
    speedrun: {
      status: 'ready',
      currentStage: 0,
      totalStages: 5,
      activeMission: MISSIONS[0],
      elapsedSeconds: 0,
      keystrokes: 0,
      bestRecord: null,
      isNewRecord: false,
      onStart: vi.fn(),
    },
    editor: {
      editorState: baseState,
      displayEditorState: baseState,
      processKeyInput: vi.fn(),
      isShaking: false,
      isFocused: true,
      relativeLineNumbers: false,
      bellCount: 0,
      onFocus: vi.fn(),
      onAreaClick: vi.fn(),
      recentKeys: [],
      statusFilename: 'main.ts',
      viewportHandlers: {
        onSwitchPane: vi.fn(),
        onSelectCompletionCandidate: vi.fn(),
        onSwitchBuffer: vi.fn(),
        onSwitchTabPage: vi.fn(),
        onCloseTabPage: vi.fn(),
        onNewTabPage: vi.fn(),
        onJumpToMark: vi.fn(),
        onCloseLspHover: vi.fn(),
        onJumpQuickfixItem: vi.fn(),
        onCloseQuickfixWindow: vi.fn(),
        onJumpLocationListItem: vi.fn(),
        onCloseLocationListWindow: vi.fn(),
        onSwitchCommandLineWindowType: vi.fn(),
        onClearCommandLineHistory: vi.fn(),
        onCloseCommandLineWindow: vi.fn(),
        onSelectCommandLineWindowLine: vi.fn(),
        onExecuteCommandLineWindowLine: vi.fn(),
      },
    },
    panels: {
      showGrammarAST: false,
      onCloseGrammarAST: vi.fn(),
      showRegisterInspector: false,
      onToggleRegisterInspector: vi.fn(),
      onRunMacroFromDebugger: vi.fn(),
      onOpenMacroDebugger: vi.fn(),
      onUpdateRegister: vi.fn(),
      onDeleteRegister: vi.fn(),
      showMarksVisualizer: false,
      onToggleMarksVisualizer: vi.fn(),
      marksHandlers: {
        onJumpToMark: vi.fn(),
        onDeleteMark: vi.fn(),
        onDeleteAllLocalMarks: vi.fn(),
        onJumpToIndex: vi.fn(),
        onJumpOlder: vi.fn(),
        onJumpNewer: vi.fn(),
        onClearJumps: vi.fn(),
        onSetMark: vi.fn(),
        onJumpToLine: vi.fn(),
      },
      showMacroDebugger: false,
      onToggleMacroDebugger: vi.fn(),
      timelineBaseState: baseState,
      onPreviewMacroFrame: vi.fn(),
      showDiffView: false,
      activeMissionForDiff: MISSIONS[0],
      showVirtualKeyboard: false,
      lastPressedKey: undefined,
      showActionTimeline: false,
      timelineSteps: [],
      previewStepIndex: null,
      sandboxInitialText: 'const x = 1;',
      allKeysSoFar: [],
      onSelectTimelineStep: vi.fn(),
      onBranchFromStep: vi.fn(),
      onCancelTimelinePreview: vi.fn(),
      onToggleActionTimeline: vi.fn(),
    },
    ...overrides,
  };
}

describe('AppMainWorkspace', () => {
  it('renders course mission panel, editor viewport, and status bar', () => {
    render(<AppMainWorkspace {...makeProps()} />);

    expect(screen.getByText(MISSIONS[0].title)).toBeInTheDocument();
    expect(screen.getByTestId('editor-main-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('editor-container')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('renders sandbox panel and fires BYOC, reset, and quick-try chip callbacks', () => {
    const onOpenBYOCModal = vi.fn();
    const onResetSandbox = vi.fn();
    const processKeyInput = vi.fn();
    const onFocus = vi.fn();
    const base = makeProps({ currentTab: 'sandbox' });
    render(
      <AppMainWorkspace
        {...base}
        mission={{ ...base.mission, onOpenBYOCModal, onResetSandbox }}
        editor={{ ...base.editor, processKeyInput, onFocus }}
      />
    );

    expect(screen.getByTestId('sandbox-panel')).toBeInTheDocument();
    expect(screen.getByTestId('sandbox-quick-try')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('open-byoc-modal-btn'));
    expect(onOpenBYOCModal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sandbox-reset-btn'));
    expect(onResetSandbox).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sandbox-chip-oil'));
    expect(onFocus).toHaveBeenCalled();
    expect(processKeyInput).toHaveBeenCalledWith(':');
    expect(processKeyInput).toHaveBeenCalledWith('Enter');
  });

  it('renders conditional Grammar AST, DiffViewer, VirtualKeyboard, and ActionTimeline panels', async () => {
    const base = makeProps();
    render(
      <AppMainWorkspace
        {...base}
        panels={{
          ...base.panels,
          showGrammarAST: true,
          showDiffView: true,
          showVirtualKeyboard: true,
          showActionTimeline: true,
        }}
      />
    );

    expect(await screen.findByTestId('vim-grammar-ast-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-keyboard')).toBeInTheDocument();
    expect(screen.getByTestId('action-timeline-panel')).toBeInTheDocument();
  });

  it('lazy-loads ArcadeSurvival when currentTab is arcade', async () => {
    render(<AppMainWorkspace {...makeProps({ currentTab: 'arcade' })} />);
    expect(await screen.findByTestId('arcade-survival')).toBeInTheDocument();
  });
});
