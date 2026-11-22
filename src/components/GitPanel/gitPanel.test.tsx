import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import {
  createVimState,
  sendKeys,
  getGitHunks,
  openGitPanel,
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
} from '../../vim-engine';
import { GitPanel } from './GitPanel';

function GitPanelHarness() {
  const [state, setState] = useState(() => {
    let s = createVimState(['const a = 1;', 'const b = 2;', 'const c = 3;']);
    s = {
      ...s,
      primaryFilename: 'service.ts',
      gitBaseLines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
    };
    s = sendKeys(s, 'ccconst a = 10;<Esc>');
    return openGitPanel(s, 'changes');
  });

  return (
    <div>
      <div data-testid="harness-line0">{state.lines[0]}</div>
      <div data-testid="harness-blame">{String(Boolean(state.gitBlameVisible))}</div>
      <GitPanel
        editorState={state}
        onSelectIndex={(idx) => setState((prev) => selectGitPanelHunk(prev, idx))}
        onChangeTab={(tab) => setState((prev) => setGitPanelTab(prev, tab))}
        onToggleHunkDiff={(id) => setState((prev) => toggleGitPanelHunkDiff(prev, id))}
        onJumpHunk={(idx) => setState((prev) => jumpToGitPanelHunk(prev, idx))}
        onStageHunk={(idx) => setState((prev) => stageGitPanelHunkByIndex(prev, idx))}
        onStageAll={() => setState((prev) => executeGitCommand(prev, 'add'))}
        onUnstage={() => setState((prev) => unstageGitPanelChanges(prev))}
        onResetHunk={(idx) => setState((prev) => resetGitPanelHunkByIndex(prev, idx))}
        onCommit={(msg) => setState((prev) => commitFromGitPanel(prev, msg))}
        onToggleBlame={() => setState((prev) => executeGitCommand(prev, 'blame'))}
        onClose={() => setState((prev) => closeGitPanel(prev))}
      />
    </div>
  );
}

describe('vim-fugitive 인터랙티브 Git 패널 엔진 & UI', () => {
  it(':Git / :LazyGit / :GitClose 로 패널을 열고 토글·닫기하며 Hunk 스테이징·언스테이징·커밋이 동작한다', () => {
    let state = createVimState(['line 1', 'line 2']);
    state = { ...state, primaryFilename: 'demo.ts', gitBaseLines: ['line 1', 'line 2'] };

    // 수정 후 :Git 단독 실행 시 인터랙티브 패널이 열린다
    state = sendKeys(state, 'ccline 1 updated<Esc>:Git<CR>');
    expect(state.gitPanel?.isOpen).toBe(true);
    expect(getGitHunks(state)).toHaveLength(1);

    // Hunk 스테이징 후 언스테이징으로 원복
    state = stageGitPanelHunkByIndex(state, 0);
    expect(state.gitStaged).toBe(true);
    expect(getGitHunks(state)).toHaveLength(0);

    state = unstageGitPanelChanges(state);
    expect(state.gitStaged).toBe(false);
    expect(getGitHunks(state)).toHaveLength(1);

    // 패널 커밋 실행 시 커밋 로그로 전환되고 기록이 남는다
    state = commitFromGitPanel(state, 'feat: update line 1');
    expect(state.gitCommitLog?.[0]?.message).toBe('feat: update line 1');
    expect(state.gitPanel?.activeTab).toBe('log');

    // :GitClose / :LazyGit 토글
    state = sendKeys(state, ':GitClose<CR>');
    expect(state.gitPanel).toBeNull();
    state = sendKeys(state, ':LazyGit<CR>');
    expect(state.gitPanel?.isOpen).toBe(true);
  });

  it('GitPanel UI 에서 인라인 Diff 토글, 스테이징, 언스테이징, 커밋 및 로그 탭 확인이 동작한다', () => {
    render(<GitPanelHarness />);

    expect(screen.getByTestId('git-split-panel')).toBeInTheDocument();
    expect(screen.getByTestId('git-panel-hunk-1')).toBeInTheDocument();
    // 첫 Hunk 는 기본적으로 인라인 Diff 가 펼쳐져 있음
    expect(screen.getByTestId('git-hunk-diff-body-1')).toHaveTextContent('- const a = 1;');
    expect(screen.getByTestId('git-hunk-diff-body-1')).toHaveTextContent('+ const a = 10;');

    // = 키로 Diff 접기/펼치기
    fireEvent.click(screen.getByTestId('git-hunk-diff-1'));
    expect(screen.queryByTestId('git-hunk-diff-body-1')).not.toBeInTheDocument();

    // s 버튼으로 스테이징
    fireEvent.click(screen.getByTestId('git-hunk-stage-1'));
    expect(screen.getByTestId('git-panel-staged-pill')).toBeInTheDocument();

    // 커밋 메시지 입력 후 커밋
    fireEvent.change(screen.getByTestId('git-panel-commit-input'), {
      target: { value: 'fix: adjust value a' },
    });
    fireEvent.click(screen.getByTestId('git-panel-commit-btn'));

    // 커밋 로그 탭에 새 커밋이 표시됨
    expect(screen.getByTestId('git-commit-log-list')).toHaveTextContent('fix: adjust value a');

    // Blame 토글 확인
    fireEvent.click(screen.getByTestId('git-panel-blame-toggle'));
    expect(screen.getByTestId('harness-blame')).toHaveTextContent('true');

    // q 키로 패널 닫기
    fireEvent.keyDown(screen.getByTestId('git-split-panel'), { key: 'q' });
    expect(screen.queryByTestId('git-split-panel')).not.toBeInTheDocument();
  });
});
