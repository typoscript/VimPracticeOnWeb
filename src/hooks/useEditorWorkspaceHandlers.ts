import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import {
  VimEditorState,
  syncPerFileState,
  switchPaneFocus,
  switchBuffer,
  deleteBuffer,
  switchTab,
  openNewTab,
  closeTab,
  closeCommandLineWindow,
  selectCommandLineWindowLine,
  switchCommandLineWindowType,
  clearCommandLineHistory,
  closeQuickfixWindow,
  jumpToQuickfixItem,
  selectFuzzyFinderItem,
  closeFuzzyFinder,
  jumpHelpTag,
  popHelpTag,
  closeHelp,
  closeLocationListWindow,
  jumpToLocationListItem,
  selectCompletionCandidate,
  selectCmpCompletionCandidate,
  selectWildmenuCandidate,
  setMark,
  jumpToMark,
  clearJumps,
  deleteMarks,
  deleteSingleMark,
  jumpToIndex,
  jumpOlder,
  jumpNewer,
} from '../vim-engine';
import { useNeovimPanelHandlers } from './useNeovimPanelHandlers';
import { safeHandleKey } from '../utils/safeHandleKey';

interface UseEditorWorkspaceHandlersParams {
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  setIsEditorFocused: Dispatch<SetStateAction<boolean>>;
}

/**
 * 에디터 내부 워크스페이스(분할 창·버퍼·탭·커맨드라인 윈도우·퀵픽스·로케이션·퍼지 파인더·도움말·마크·레지스터)
 * 인터랙션 핸들러 모음 훅입니다.
 */
export function useEditorWorkspaceHandlers({
  setEditorState: setRawEditorState,
  setIsEditorFocused,
}: UseEditorWorkspaceHandlersParams) {
  // UI 클릭은 handleKey 를 거치지 않으므로, 파일이 바뀌면 파일별 상태(마크·폴드·Git 기준선)와 모드·커서를 여기서 맞춥니다
  const setEditorState = useCallback<Dispatch<SetStateAction<VimEditorState>>>(
    (update) =>
      setRawEditorState((prev) =>
        syncPerFileState(prev, typeof update === 'function' ? update(prev) : update)
      ),
    [setRawEditorState]
  );

  const applyAndFocus = useCallback(
    (updater: (prevState: VimEditorState) => VimEditorState) => {
      setEditorState(updater);
      setIsEditorFocused(true);
    },
    [setEditorState, setIsEditorFocused]
  );

  const handleSwitchPane = useCallback(
    (targetIndex: number) => applyAndFocus((prev) => switchPaneFocus(prev, targetIndex)),
    [applyAndFocus]
  );

  const handleSelectCompletionCandidate = useCallback(
    (index: number) =>
      applyAndFocus((prev) =>
        prev.completionSession?.type === 'cmp'
          ? selectCmpCompletionCandidate(prev, index)
          : selectCompletionCandidate(prev, index)
      ),
    [applyAndFocus]
  );

  const handleSelectWildmenuCandidate = useCallback(
    (index: number) => applyAndFocus((prev) => selectWildmenuCandidate(prev, index)),
    [applyAndFocus]
  );

  const handleSwitchBuffer = useCallback(
    (targetId: number) => applyAndFocus((prev) => switchBuffer(prev, targetId)),
    [applyAndFocus]
  );

  const handleCloseBuffer = useCallback(
    (targetId: number) => applyAndFocus((prev) => deleteBuffer(prev, String(targetId), true)),
    [applyAndFocus]
  );

  const handleSwitchTabPage = useCallback(
    (targetId: number) => applyAndFocus((prev) => switchTab(prev, targetId)),
    [applyAndFocus]
  );

  const handleCloseTabPage = useCallback(
    (targetId: number) => applyAndFocus((prev) => closeTab(prev, targetId)),
    [applyAndFocus]
  );

  const handleNewTabPage = useCallback(
    () => applyAndFocus((prev) => openNewTab(prev)),
    [applyAndFocus]
  );

  const handleCloseCommandLineWindow = useCallback(
    () => applyAndFocus((prev) => closeCommandLineWindow(prev)),
    [applyAndFocus]
  );

  const handleSelectCommandLineWindowLine = useCallback(
    (lineIdx: number) => applyAndFocus((prev) => selectCommandLineWindowLine(prev, lineIdx)),
    [applyAndFocus]
  );

  const handleSwitchCommandLineWindowType = useCallback(
    (type: ':' | '/' | '?') => applyAndFocus((prev) => switchCommandLineWindowType(prev, type)),
    [applyAndFocus]
  );

  const handleClearCommandLineHistory = useCallback(
    (type: ':' | '/' | '?') => applyAndFocus((prev) => clearCommandLineHistory(prev, type)),
    [applyAndFocus]
  );

  const handleExecuteCommandLineWindowLine = useCallback(
    (lineIdx: number) =>
      applyAndFocus((prev) => safeHandleKey(selectCommandLineWindowLine(prev, lineIdx), 'Enter')),
    [applyAndFocus]
  );

  const handleJumpQuickfixItem = useCallback(
    (index: number) => applyAndFocus((prev) => jumpToQuickfixItem(prev, index)),
    [applyAndFocus]
  );

  const handleCloseQuickfixWindow = useCallback(
    () => applyAndFocus((prev) => closeQuickfixWindow(prev)),
    [applyAndFocus]
  );

  const handleJumpLocationListItem = useCallback(
    (index: number) => applyAndFocus((prev) => jumpToLocationListItem(prev, index)),
    [applyAndFocus]
  );

  const handleCloseLocationListWindow = useCallback(
    () => applyAndFocus((prev) => closeLocationListWindow(prev)),
    [applyAndFocus]
  );

  // Neovim 플러그인 흉내 패널(Trouble·Undotree·Spectre·Git·Neo-tree·git-conflict·DAP·LSP·Gitsigns) 클릭 핸들러
  const {
    handleJumpTroubleItem,
    handleChangeTroubleMode,
    handleCloseTroublePanel,
    handleJumpUndoSeq,
    handleTravelUndoOlder,
    handleTravelUndoNewer,
    handleCloseUndotreePanel,
    handleUpdateSpectreQuery,
    handleToggleSpectreItem,
    handleToggleAllSpectreItems,
    handleJumpSpectreItem,
    handleApplySpectreReplaceAll,
    handleCloseSpectrePanel,
    handleSelectGitPanelIndex,
    handleChangeGitPanelTab,
    handleToggleGitPanelHunkDiff,
    handleJumpGitPanelHunk,
    handleStageGitPanelHunk,
    handleStageAllGitPanel,
    handleUnstageGitPanel,
    handleResetGitPanelHunk,
    handleCommitGitPanel,
    handleToggleGitBlame,
    handleCloseGitPanel,
    handleSelectNeotreeIndex,
    handleOpenNeotreeNode,
    handleToggleNeotreeDir,
    handleStartNeotreeAdd,
    handleStartNeotreeRename,
    handleUpdateNeotreePrompt,
    handleConfirmNeotreePrompt,
    handleCancelNeotreePrompt,
    handleDeleteNeotreeNode,
    handleFocusNeotree,
    handleCloseNeotree,
    handleChooseGitConflict,
    handleToggleDapBreakpointLine,
    handleDapContinue,
    handleDapStepOver,
    handleDapStepInto,
    handleDapStepOut,
    handleDapTerminate,
    handleSelectDapFrame,
    handleAddDapWatch,
    handleRemoveDapWatch,
    handleJumpDapBreakpoint,
    handleCloseDapUi,
    handleCloseLspHover,
    handleCancelLspRename,
    handleApplyLspCodeAction,
    handleCloseLspCodeAction,
    handleCloseGitHunkPreview,
    handleResetGitHunk,
    handleStageGitHunk,
  } = useNeovimPanelHandlers({ setEditorState, applyAndFocus });

  const handleSelectFuzzyFinderAction = useCallback(
    (action: 'open' | 'vsplit' | 'split' | 'tab') =>
      applyAndFocus((prev) => selectFuzzyFinderItem(prev, action)),
    [applyAndFocus]
  );

  const handleCloseFuzzyFinder = useCallback(
    () => applyAndFocus((prev) => closeFuzzyFinder(prev)),
    [applyAndFocus]
  );

  const handleSelectFuzzyItemIndex = useCallback(
    (index: number) => {
      setEditorState((prevState) => {
        if (!prevState.fuzzyFinder) return prevState;
        return {
          ...prevState,
          fuzzyFinder: {
            ...prevState.fuzzyFinder,
            selectedIndex: index,
          },
        };
      });
    },
    [setEditorState]
  );

  const handleJumpHelpTag = useCallback(
    (tag: string) => applyAndFocus((prev) => jumpHelpTag(prev, tag)),
    [applyAndFocus]
  );

  const handlePopHelpTag = useCallback(
    () => applyAndFocus((prev) => popHelpTag(prev)),
    [applyAndFocus]
  );

  const handleCloseHelp = useCallback(
    () => applyAndFocus((prev) => closeHelp(prev)),
    [applyAndFocus]
  );

  const handleJumpToMark = useCallback(
    (markChar: string) => setEditorState((prev) => jumpToMark(prev, markChar, false)),
    [setEditorState]
  );

  const handleDeleteMark = useCallback(
    (markChar: string) => setEditorState((prev) => deleteSingleMark(prev, markChar)),
    [setEditorState]
  );

  const handleDeleteAllLocalMarks = useCallback(
    () => setEditorState((prev) => deleteMarks(prev, '', true)),
    [setEditorState]
  );

  const handleJumpToIndex = useCallback(
    (index: number) => setEditorState((prev) => jumpToIndex(prev, index)),
    [setEditorState]
  );

  const handleJumpOlder = useCallback(
    () => setEditorState((prev) => jumpOlder(prev)),
    [setEditorState]
  );

  const handleJumpNewer = useCallback(
    () => setEditorState((prev) => jumpNewer(prev)),
    [setEditorState]
  );

  const handleClearJumps = useCallback(
    () => setEditorState((prev) => clearJumps(prev)),
    [setEditorState]
  );

  const handleSetMark = useCallback(
    (markChar: string) => setEditorState((prev) => setMark(prev, markChar)),
    [setEditorState]
  );

  const handleJumpToLine = useCallback(
    (line: number) => {
      setEditorState((prev) => ({
        ...prev,
        cursor: {
          line: Math.max(0, Math.min(line, prev.lines.length - 1)),
          col: 0,
        },
      }));
    },
    [setEditorState]
  );

  const handleUpdateRegister = useCallback(
    (register: string, content: string | string[], type: 'char' | 'line' | 'block' | 'macro') => {
      setEditorState((prev) => {
        const nextRegisters = { ...(prev.registers ?? {}) };
        nextRegisters[register] = { type, content };
        return { ...prev, registers: nextRegisters };
      });
    },
    [setEditorState]
  );

  const handleDeleteRegister = useCallback(
    (register: string) => {
      setEditorState((prev) => {
        const nextRegisters = { ...(prev.registers ?? {}) };
        delete nextRegisters[register];
        return { ...prev, registers: nextRegisters };
      });
    },
    [setEditorState]
  );

  const viewportHandlers = useMemo(
    () => ({
      onSwitchPane: handleSwitchPane,
      onSelectCompletionCandidate: handleSelectCompletionCandidate,
      onSwitchBuffer: handleSwitchBuffer,
      onCloseBuffer: handleCloseBuffer,
      onSwitchTabPage: handleSwitchTabPage,
      onCloseTabPage: handleCloseTabPage,
      onNewTabPage: handleNewTabPage,
      onJumpToMark: handleJumpToMark,
      onCloseLspHover: handleCloseLspHover,
      onCancelLspRename: handleCancelLspRename,
      onApplyLspCodeAction: handleApplyLspCodeAction,
      onCloseLspCodeAction: handleCloseLspCodeAction,
      onCloseGitHunkPreview: handleCloseGitHunkPreview,
      onResetGitHunk: handleResetGitHunk,
      onStageGitHunk: handleStageGitHunk,
      onJumpQuickfixItem: handleJumpQuickfixItem,
      onCloseQuickfixWindow: handleCloseQuickfixWindow,
      onJumpLocationListItem: handleJumpLocationListItem,
      onCloseLocationListWindow: handleCloseLocationListWindow,
      onJumpTroubleItem: handleJumpTroubleItem,
      onChangeTroubleMode: handleChangeTroubleMode,
      onCloseTroublePanel: handleCloseTroublePanel,
      onJumpUndoSeq: handleJumpUndoSeq,
      onTravelUndoOlder: handleTravelUndoOlder,
      onTravelUndoNewer: handleTravelUndoNewer,
      onCloseUndotreePanel: handleCloseUndotreePanel,
      onUpdateSpectreQuery: handleUpdateSpectreQuery,
      onToggleSpectreItem: handleToggleSpectreItem,
      onToggleAllSpectreItems: handleToggleAllSpectreItems,
      onJumpSpectreItem: handleJumpSpectreItem,
      onApplySpectreReplaceAll: handleApplySpectreReplaceAll,
      onCloseSpectrePanel: handleCloseSpectrePanel,
      onSelectGitPanelIndex: handleSelectGitPanelIndex,
      onChangeGitPanelTab: handleChangeGitPanelTab,
      onToggleGitPanelHunkDiff: handleToggleGitPanelHunkDiff,
      onJumpGitPanelHunk: handleJumpGitPanelHunk,
      onStageGitPanelHunk: handleStageGitPanelHunk,
      onStageAllGitPanel: handleStageAllGitPanel,
      onUnstageGitPanel: handleUnstageGitPanel,
      onResetGitPanelHunk: handleResetGitPanelHunk,
      onCommitGitPanel: handleCommitGitPanel,
      onToggleGitBlame: handleToggleGitBlame,
      onCloseGitPanel: handleCloseGitPanel,
      onSelectNeotreeIndex: handleSelectNeotreeIndex,
      onOpenNeotreeNode: handleOpenNeotreeNode,
      onToggleNeotreeDir: handleToggleNeotreeDir,
      onStartNeotreeAdd: handleStartNeotreeAdd,
      onStartNeotreeRename: handleStartNeotreeRename,
      onUpdateNeotreePrompt: handleUpdateNeotreePrompt,
      onConfirmNeotreePrompt: handleConfirmNeotreePrompt,
      onCancelNeotreePrompt: handleCancelNeotreePrompt,
      onDeleteNeotreeNode: handleDeleteNeotreeNode,
      onFocusNeotree: handleFocusNeotree,
      onCloseNeotree: handleCloseNeotree,
      onChooseGitConflict: handleChooseGitConflict,
      onToggleDapBreakpointLine: handleToggleDapBreakpointLine,
      onDapContinue: handleDapContinue,
      onDapStepOver: handleDapStepOver,
      onDapStepInto: handleDapStepInto,
      onDapStepOut: handleDapStepOut,
      onDapTerminate: handleDapTerminate,
      onSelectDapFrame: handleSelectDapFrame,
      onAddDapWatch: handleAddDapWatch,
      onRemoveDapWatch: handleRemoveDapWatch,
      onJumpDapBreakpoint: handleJumpDapBreakpoint,
      onCloseDapUi: handleCloseDapUi,
      onSwitchCommandLineWindowType: handleSwitchCommandLineWindowType,
      onClearCommandLineHistory: handleClearCommandLineHistory,
      onCloseCommandLineWindow: handleCloseCommandLineWindow,
      onSelectCommandLineWindowLine: handleSelectCommandLineWindowLine,
      onExecuteCommandLineWindowLine: handleExecuteCommandLineWindowLine,
    }),
    [
      handleSwitchPane,
      handleSelectCompletionCandidate,
      handleSwitchBuffer,
      handleSwitchTabPage,
      handleCloseTabPage,
      handleNewTabPage,
      handleJumpToMark,
      handleCloseLspHover,
      handleCancelLspRename,
      handleApplyLspCodeAction,
      handleCloseLspCodeAction,
      handleCloseGitHunkPreview,
      handleResetGitHunk,
      handleStageGitHunk,
      handleJumpQuickfixItem,
      handleCloseQuickfixWindow,
      handleJumpLocationListItem,
      handleCloseLocationListWindow,
      handleJumpTroubleItem,
      handleChangeTroubleMode,
      handleCloseTroublePanel,
      handleJumpUndoSeq,
      handleTravelUndoOlder,
      handleTravelUndoNewer,
      handleCloseUndotreePanel,
      handleUpdateSpectreQuery,
      handleToggleSpectreItem,
      handleToggleAllSpectreItems,
      handleJumpSpectreItem,
      handleApplySpectreReplaceAll,
      handleCloseSpectrePanel,
      handleSelectGitPanelIndex,
      handleChangeGitPanelTab,
      handleToggleGitPanelHunkDiff,
      handleJumpGitPanelHunk,
      handleStageGitPanelHunk,
      handleStageAllGitPanel,
      handleUnstageGitPanel,
      handleResetGitPanelHunk,
      handleCommitGitPanel,
      handleToggleGitBlame,
      handleCloseGitPanel,
      handleSelectNeotreeIndex,
      handleOpenNeotreeNode,
      handleToggleNeotreeDir,
      handleStartNeotreeAdd,
      handleStartNeotreeRename,
      handleUpdateNeotreePrompt,
      handleConfirmNeotreePrompt,
      handleCancelNeotreePrompt,
      handleDeleteNeotreeNode,
      handleFocusNeotree,
      handleCloseNeotree,
      handleChooseGitConflict,
      handleToggleDapBreakpointLine,
      handleDapContinue,
      handleDapStepOver,
      handleDapStepInto,
      handleDapStepOut,
      handleDapTerminate,
      handleSelectDapFrame,
      handleAddDapWatch,
      handleRemoveDapWatch,
      handleJumpDapBreakpoint,
      handleCloseDapUi,
      handleSwitchCommandLineWindowType,
      handleClearCommandLineHistory,
      handleCloseCommandLineWindow,
      handleSelectCommandLineWindowLine,
      handleExecuteCommandLineWindowLine,
    ]
  );

  const marksHandlers = useMemo(
    () => ({
      onJumpToMark: handleJumpToMark,
      onDeleteMark: handleDeleteMark,
      onDeleteAllLocalMarks: handleDeleteAllLocalMarks,
      onJumpToIndex: handleJumpToIndex,
      onJumpOlder: handleJumpOlder,
      onJumpNewer: handleJumpNewer,
      onClearJumps: handleClearJumps,
      onSetMark: handleSetMark,
      onJumpToLine: handleJumpToLine,
    }),
    [
      handleJumpToMark,
      handleDeleteMark,
      handleDeleteAllLocalMarks,
      handleJumpToIndex,
      handleJumpOlder,
      handleJumpNewer,
      handleClearJumps,
      handleSetMark,
      handleJumpToLine,
    ]
  );

  const fuzzyFinderHandlers = useMemo(
    () => ({
      onSelectAction: handleSelectFuzzyFinderAction,
      onSelectItemIndex: handleSelectFuzzyItemIndex,
      onClose: handleCloseFuzzyFinder,
    }),
    [handleSelectFuzzyFinderAction, handleSelectFuzzyItemIndex, handleCloseFuzzyFinder]
  );

  const helpHandlers = useMemo(
    () => ({
      onJumpTag: handleJumpHelpTag,
      onPopTag: handlePopHelpTag,
      onClose: handleCloseHelp,
    }),
    [handleJumpHelpTag, handlePopHelpTag, handleCloseHelp]
  );

  return {
    handleSwitchPane,
    handleSelectCompletionCandidate,
    handleSelectWildmenuCandidate,
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
    viewportHandlers,
    marksHandlers,
    fuzzyFinderHandlers,
    helpHandlers,
  };
}
