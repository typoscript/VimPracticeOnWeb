import { useCallback, Dispatch, SetStateAction } from 'react';
import {
  VimEditorState,
  jumpToTroubleItem,
  setTroubleMode,
  closeTroublePanel,
  TroubleMode,
  jumpUndoSeq,
  travelUndoTime,
  closeUndotreePanel,
  updateSpectreQuery,
  toggleSpectreItem,
  toggleAllSpectreItems,
  jumpToSpectreItem,
  applySpectreReplaceAll,
  closeSpectrePanel,
  closeLspHover,
  cancelLspRename,
  applyLspCodeAction,
  closeLspCodeActionMenu,
  syncLiveLspDiagnostics,
  closeGitHunkPreview,
  resetGitHunk,
  stageGitHunk,
  selectGitPanelHunk,
  setGitPanelTab,
  toggleGitPanelHunkDiff,
  jumpToGitPanelHunk,
  stageGitPanelHunkByIndex,
  unstageGitPanelChanges,
  resetGitPanelHunkByIndex,
  commitFromGitPanel,
  closeGitPanel,
  executeGitCommand,
  selectNeotreeIndex,
  openNeotreeNode,
  toggleNeotreeDir,
  startNeotreeAddPrompt,
  startNeotreeRenamePrompt,
  updateNeotreePromptValue,
  confirmNeotreePrompt,
  cancelNeotreePrompt,
  deleteNeotreeNode,
  setNeotreeFocus,
  closeNeotree,
  chooseGitConflict,
  GitConflictChoice,
  toggleDapBreakpoint,
  dapContinue,
  dapStepOver,
  dapStepInto,
  dapStepOut,
  dapTerminate,
  toggleDapUi,
  selectDapFrame,
  addDapWatch,
  removeDapWatch,
  editBuffer,
  syncCurrentBuffer,
} from '../vim-engine';

interface UseNeovimPanelHandlersParams {
  /** 파일별 상태 동기화(syncPerFileState)로 감싼 상태 갱신 함수 */
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  /** 상태를 갱신하고 에디터에 포커스를 돌려주는 함수 */
  applyAndFocus: (updater: (prevState: VimEditorState) => VimEditorState) => void;
}

/**
 * Neovim 플러그인 흉내 패널(Trouble·Undotree·Spectre·Git·Neo-tree·git-conflict·DAP·LSP·Gitsigns)의
 * UI 클릭 핸들러 모음입니다. `useEditorWorkspaceHandlers` 가 부릅니다.
 */
export function useNeovimPanelHandlers({ setEditorState, applyAndFocus }: UseNeovimPanelHandlersParams) {
  const handleJumpTroubleItem = useCallback(
    (index: number) => applyAndFocus((prev) => jumpToTroubleItem(prev, index)),
    [applyAndFocus]
  );

  const handleChangeTroubleMode = useCallback(
    (mode: TroubleMode) => applyAndFocus((prev) => setTroubleMode(prev, mode)),
    [applyAndFocus]
  );

  const handleCloseTroublePanel = useCallback(
    () => applyAndFocus((prev) => closeTroublePanel(prev)),
    [applyAndFocus]
  );

  const handleJumpUndoSeq = useCallback(
    (seq: number) => applyAndFocus((prev) => jumpUndoSeq(prev, seq)),
    [applyAndFocus]
  );

  const handleTravelUndoOlder = useCallback(
    () => applyAndFocus((prev) => travelUndoTime(prev, 'older', 1)),
    [applyAndFocus]
  );

  const handleTravelUndoNewer = useCallback(
    () => applyAndFocus((prev) => travelUndoTime(prev, 'newer', 1)),
    [applyAndFocus]
  );

  const handleCloseUndotreePanel = useCallback(
    () => applyAndFocus((prev) => closeUndotreePanel(prev)),
    [applyAndFocus]
  );

  const handleUpdateSpectreQuery = useCallback(
    (searchQuery: string, replaceQuery: string, ignoreCase?: boolean) =>
      setEditorState((prev) => updateSpectreQuery(prev, searchQuery, replaceQuery, ignoreCase)),
    [setEditorState]
  );

  const handleToggleSpectreItem = useCallback(
    (itemId: string) => setEditorState((prev) => toggleSpectreItem(prev, itemId)),
    [setEditorState]
  );

  const handleToggleAllSpectreItems = useCallback(
    (enabled: boolean) => setEditorState((prev) => toggleAllSpectreItems(prev, enabled)),
    [setEditorState]
  );

  const handleJumpSpectreItem = useCallback(
    (index: number) => applyAndFocus((prev) => jumpToSpectreItem(prev, index)),
    [applyAndFocus]
  );

  const handleApplySpectreReplaceAll = useCallback(
    () => applyAndFocus((prev) => applySpectreReplaceAll(prev)),
    [applyAndFocus]
  );

  const handleCloseSpectrePanel = useCallback(
    () => applyAndFocus((prev) => closeSpectrePanel(prev)),
    [applyAndFocus]
  );

  const handleSelectGitPanelIndex = useCallback(
    (index: number) => setEditorState((prev) => selectGitPanelHunk(prev, index)),
    [setEditorState]
  );

  const handleChangeGitPanelTab = useCallback(
    (tab: 'changes' | 'log') => setEditorState((prev) => setGitPanelTab(prev, tab)),
    [setEditorState]
  );

  const handleToggleGitPanelHunkDiff = useCallback(
    (hunkId: number) => setEditorState((prev) => toggleGitPanelHunkDiff(prev, hunkId)),
    [setEditorState]
  );

  const handleJumpGitPanelHunk = useCallback(
    (index: number) => applyAndFocus((prev) => jumpToGitPanelHunk(prev, index)),
    [applyAndFocus]
  );

  const handleStageGitPanelHunk = useCallback(
    (index: number) => setEditorState((prev) => stageGitPanelHunkByIndex(prev, index)),
    [setEditorState]
  );

  const handleStageAllGitPanel = useCallback(
    () => setEditorState((prev) => executeGitCommand(prev, 'add')),
    [setEditorState]
  );

  const handleUnstageGitPanel = useCallback(
    () => setEditorState((prev) => unstageGitPanelChanges(prev)),
    [setEditorState]
  );

  const handleResetGitPanelHunk = useCallback(
    (index: number) => setEditorState((prev) => resetGitPanelHunkByIndex(prev, index)),
    [setEditorState]
  );

  const handleCommitGitPanel = useCallback(
    (message: string) => setEditorState((prev) => commitFromGitPanel(prev, message)),
    [setEditorState]
  );

  const handleToggleGitBlame = useCallback(
    () => setEditorState((prev) => executeGitCommand(prev, 'blame')),
    [setEditorState]
  );

  const handleCloseGitPanel = useCallback(
    () => applyAndFocus((prev) => closeGitPanel(prev)),
    [applyAndFocus]
  );

  const handleSelectNeotreeIndex = useCallback(
    (index: number) => setEditorState((prev) => selectNeotreeIndex(prev, index)),
    [setEditorState]
  );

  const handleOpenNeotreeNode = useCallback(
    (index: number, mode: 'edit' | 'vsplit' | 'split' | 'tab' = 'edit') =>
      applyAndFocus((prev) => openNeotreeNode(prev, index, mode)),
    [applyAndFocus]
  );

  const handleToggleNeotreeDir = useCallback(
    (dirPath: string) => setEditorState((prev) => toggleNeotreeDir(prev, dirPath)),
    [setEditorState]
  );

  const handleStartNeotreeAdd = useCallback(
    (index?: number) => setEditorState((prev) => startNeotreeAddPrompt(prev, index)),
    [setEditorState]
  );

  const handleStartNeotreeRename = useCallback(
    (index?: number) => setEditorState((prev) => startNeotreeRenamePrompt(prev, index)),
    [setEditorState]
  );

  const handleUpdateNeotreePrompt = useCallback(
    (value: string) => setEditorState((prev) => updateNeotreePromptValue(prev, value)),
    [setEditorState]
  );

  const handleConfirmNeotreePrompt = useCallback(
    (value?: string) => applyAndFocus((prev) => confirmNeotreePrompt(prev, value)),
    [applyAndFocus]
  );

  const handleCancelNeotreePrompt = useCallback(
    () => applyAndFocus((prev) => cancelNeotreePrompt(prev)),
    [applyAndFocus]
  );

  const handleDeleteNeotreeNode = useCallback(
    (index: number) => applyAndFocus((prev) => deleteNeotreeNode(prev, index)),
    [applyAndFocus]
  );

  const handleFocusNeotree = useCallback(
    (focused: boolean) => setEditorState((prev) => setNeotreeFocus(prev, focused)),
    [setEditorState]
  );

  const handleCloseNeotree = useCallback(
    () => applyAndFocus((prev) => closeNeotree(prev)),
    [applyAndFocus]
  );

  const handleChooseGitConflict = useCallback(
    (lineIdx: number, choice: GitConflictChoice) =>
      applyAndFocus((prev) => chooseGitConflict(prev, choice, false, lineIdx)),
    [applyAndFocus]
  );

  const handleToggleDapBreakpointLine = useCallback(
    (lineIdx?: number) => applyAndFocus((prev) => toggleDapBreakpoint(prev, lineIdx)),
    [applyAndFocus]
  );

  const handleDapContinue = useCallback(
    () => applyAndFocus((prev) => dapContinue(prev)),
    [applyAndFocus]
  );

  const handleDapStepOver = useCallback(
    () => applyAndFocus((prev) => dapStepOver(prev)),
    [applyAndFocus]
  );

  const handleDapStepInto = useCallback(
    () => applyAndFocus((prev) => dapStepInto(prev)),
    [applyAndFocus]
  );

  const handleDapStepOut = useCallback(
    () => applyAndFocus((prev) => dapStepOut(prev)),
    [applyAndFocus]
  );

  const handleDapTerminate = useCallback(
    () => applyAndFocus((prev) => dapTerminate(prev)),
    [applyAndFocus]
  );

  const handleSelectDapFrame = useCallback(
    (index: number) => applyAndFocus((prev) => selectDapFrame(prev, index)),
    [applyAndFocus]
  );

  const handleAddDapWatch = useCallback(
    (expr: string) => setEditorState((prev) => addDapWatch(prev, expr)),
    [setEditorState]
  );

  const handleRemoveDapWatch = useCallback(
    (expr: string) => setEditorState((prev) => removeDapWatch(prev, expr)),
    [setEditorState]
  );

  const handleJumpDapBreakpoint = useCallback(
    (filename: string, line: number) =>
      applyAndFocus((prev) => {
        const next =
          filename && filename !== prev.primaryFilename
            ? editBuffer(syncCurrentBuffer(prev), filename)
            : prev;
        const clampedLine = Math.max(0, Math.min(next.lines.length - 1, line));
        return { ...next, cursor: { line: clampedLine, col: 0 } };
      }),
    [applyAndFocus]
  );

  const handleCloseDapUi = useCallback(
    () => applyAndFocus((prev) => toggleDapUi(prev, false)),
    [applyAndFocus]
  );

  const handleCloseLspHover = useCallback(
    () => applyAndFocus((prev) => closeLspHover(prev)),
    [applyAndFocus]
  );

  const handleCancelLspRename = useCallback(
    () => applyAndFocus((prev) => cancelLspRename(prev)),
    [applyAndFocus]
  );

  const handleApplyLspCodeAction = useCallback(
    (index: number) =>
      applyAndFocus((prev) => syncLiveLspDiagnostics(prev, applyLspCodeAction(prev, index))),
    [applyAndFocus]
  );

  const handleCloseLspCodeAction = useCallback(
    () => applyAndFocus((prev) => closeLspCodeActionMenu(prev)),
    [applyAndFocus]
  );

  const handleCloseGitHunkPreview = useCallback(
    () => applyAndFocus((prev) => closeGitHunkPreview(prev)),
    [applyAndFocus]
  );

  const handleResetGitHunk = useCallback(
    () => applyAndFocus((prev) => resetGitHunk(prev)),
    [applyAndFocus]
  );

  const handleStageGitHunk = useCallback(
    () => applyAndFocus((prev) => stageGitHunk(prev)),
    [applyAndFocus]
  );

  return {
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
  };
}
