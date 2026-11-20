import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import {
  VimEditorState,
  handleKey,
  switchPaneFocus,
  switchBuffer,
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
  closeLspHover,
  selectCompletionCandidate,
  setMark,
  jumpToMark,
  clearJumps,
  deleteMarks,
  deleteSingleMark,
  jumpToIndex,
  jumpOlder,
  jumpNewer,
} from '../vim-engine';

interface UseEditorWorkspaceHandlersParams {
  setEditorState: Dispatch<SetStateAction<VimEditorState>>;
  setIsEditorFocused: Dispatch<SetStateAction<boolean>>;
}

/**
 * 에디터 내부 워크스페이스(분할 창·버퍼·탭·커맨드라인 윈도우·퀵픽스·로케이션·퍼지 파인더·도움말·마크·레지스터)
 * 인터랙션 핸들러 모음 훅입니다.
 */
export function useEditorWorkspaceHandlers({
  setEditorState,
  setIsEditorFocused,
}: UseEditorWorkspaceHandlersParams) {
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
    (index: number) => applyAndFocus((prev) => selectCompletionCandidate(prev, index)),
    [applyAndFocus]
  );

  const handleSwitchBuffer = useCallback(
    (targetId: number) => applyAndFocus((prev) => switchBuffer(prev, targetId)),
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
      applyAndFocus((prev) => handleKey(selectCommandLineWindowLine(prev, lineIdx), 'Enter')),
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

  const handleCloseLspHover = useCallback(
    () => applyAndFocus((prev) => closeLspHover(prev)),
    [applyAndFocus]
  );

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
    (register: string, content: string | string[], type: 'char' | 'line' | 'macro') => {
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
      handleJumpQuickfixItem,
      handleCloseQuickfixWindow,
      handleJumpLocationListItem,
      handleCloseLocationListWindow,
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
