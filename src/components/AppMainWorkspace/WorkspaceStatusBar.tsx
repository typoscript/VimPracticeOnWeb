import React from 'react';
import { StatusBar } from '../StatusBar/StatusBar';
import { computeSearchCount, parseGitConflicts } from '../../vim-engine';
import type { WorkspaceEditorProps } from './workspaceTypes';

interface WorkspaceStatusBarProps {
  editor: WorkspaceEditorProps;
}

// 화면 표시용 에디터 상태(displayEditorState)에서 상태바 배지 값을 계산해 StatusBar 에 넘깁니다.
export const WorkspaceStatusBar: React.FC<WorkspaceStatusBarProps> = ({ editor }) => {
  const state = editor.displayEditorState;
  return (
    <StatusBar
      mode={state.mode}
      cursor={state.cursor}
      virtualReplace={state.virtualReplace}
      insertNormalSession={state.insertNormalSession}
      insertRegisterPending={state.insertRegisterPending}
      insertCtrlXMode={state.insertCtrlXMode}
      confirmSubstitute={state.confirmSubstitute}
      filename={editor.statusFilename}
      pendingKeys={state.pendingKeys}
      recordingMacro={state.recordingMacro}
      commandType={state.commandType}
      commandBuffer={state.commandBuffer}
      commandCursorCol={state.commandCursorCol}
      digraphPending={state.digraphPending}
      commandMessage={state.commandMessage}
      wildmenu={state.wildmenu}
      showWildmenuBar={state.options?.wildmenu ?? true}
      onSelectWildmenuCandidate={editor.onSelectWildmenuCandidate}
      spellActive={state.options?.spell}
      flashActive={Boolean(state.flashJump?.isOpen)}
      oilActive={Boolean(state.oilSession?.isOpen)}
      terminalActive={Boolean(state.terminalSession?.isOpen)}
      harpoonSlot={(() => {
        const cur = state.primaryFilename;
        if (!cur || !state.harpoonList?.length) return null;
        const idx = state.harpoonList.indexOf(cur);
        return idx >= 0 ? idx + 1 : null;
      })()}
      multiCursorInfo={
        state.multiCursor?.isOpen
          ? {
              count:
                state.multiCursor.submode === 'insert'
                  ? state.multiCursor.cursors.length
                  : state.multiCursor.selections.length,
              submode: state.multiCursor.submode,
            }
          : null
      }
      searchCount={(() => {
        const shm = state.options?.shortmess ?? '';
        if (shm.includes('S')) return null;
        const activePattern =
          state.mode === 'SEARCH'
            ? (state.commandBuffer ?? '').split(
                state.commandType === '?' ? '?' : '/'
              )[0]
            : state.hlsearchSuppressed
              ? ''
              : (state.lastSearchQuery ?? '');
        if (!activePattern) return null;
        const sc = computeSearchCount(
          state.lines,
          activePattern,
          state.cursor,
          {
            ignorecase: state.options?.ignorecase,
            smartcase: state.options?.smartcase,
          }
        );
        return sc.total > 0 ? { current: sc.current, total: sc.total } : null;
      })()}
      gitConflictCount={parseGitConflicts(state.lines).length}
      dapBadge={
        state.dapSession?.isActive
          ? {
              line: state.dapSession.currentLine,
              paused: state.dapSession.isPaused,
            }
          : null
      }
      functionDraft={
        state.functionDraft
          ? {
              name: state.functionDraft.name,
              lines: state.functionDraft.body.length,
            }
          : null
      }
    />
  );
};
