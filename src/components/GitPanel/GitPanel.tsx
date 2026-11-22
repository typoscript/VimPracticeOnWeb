import React, { useRef, useState } from 'react';
import {
  VimEditorState,
  getEffectiveCommitLog,
  getGitHunks,
} from '../../vim-engine';
import { t } from '../../i18n';
import './GitPanel.css';

export interface GitPanelProps {
  editorState: VimEditorState;
  onSelectIndex: (index: number) => void;
  onChangeTab: (tab: 'changes' | 'log') => void;
  onToggleHunkDiff: (hunkId: number) => void;
  onJumpHunk: (index: number) => void;
  onStageHunk: (index: number) => void;
  onStageAll: () => void;
  onUnstage: () => void;
  onResetHunk: (index: number) => void;
  onCommit: (message: string) => void;
  onToggleBlame: () => void;
  onClose: () => void;
}

/**
 * vim-fugitive / LazyGit 스타일 인터랙티브 Git 분할 패널 (:Git / :LazyGit)
 */
export const GitPanel: React.FC<GitPanelProps> = ({
  editorState,
  onSelectIndex,
  onChangeTab,
  onToggleHunkDiff,
  onJumpHunk,
  onStageHunk,
  onStageAll,
  onUnstage,
  onResetHunk,
  onCommit,
  onToggleBlame,
  onClose,
}) => {
  const panel = editorState.gitPanel;
  const [commitMsg, setCommitMsg] = useState('');
  const commitInputRef = useRef<HTMLInputElement | null>(null);

  if (!panel?.isOpen) return null;

  const hunks = getGitHunks(editorState);
  const commits = getEffectiveCommitLog(editorState);
  const filename = editorState.primaryFilename || 'sandbox.ts';
  const totalAdded = hunks.reduce((acc, h) => acc + h.addedLines.length, 0);
  const totalRemoved = hunks.reduce((acc, h) => acc + h.removedLines.length, 0);
  const selectedIdx = panel.selectedIndex;

  const handleSubmitCommit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = commitMsg.trim();
    if (!trimmed) return;
    onCommit(trimmed);
    setCommitMsg('');
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // 커밋 입력란 포커스 중에는 일반 타이핑 허용
    if (document.activeElement === commitInputRef.current) {
      if (e.key === 'Escape') {
        e.preventDefault();
        commitInputRef.current?.blur();
      }
      return;
    }

    const listLen = panel.activeTab === 'log' ? commits.length : hunks.length;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (listLen > 0) onSelectIndex(Math.min(listLen - 1, selectedIdx + 1));
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (listLen > 0) onSelectIndex(Math.max(0, selectedIdx - 1));
    } else if (e.key === 'q' || e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === '1') {
      e.preventDefault();
      onChangeTab('changes');
    } else if (e.key === '2') {
      e.preventDefault();
      onChangeTab('log');
    } else if (e.key === 'c') {
      e.preventDefault();
      commitInputRef.current?.focus();
    } else if (e.key === 'u') {
      e.preventDefault();
      onUnstage();
    } else if (panel.activeTab === 'changes' && hunks[selectedIdx]) {
      const activeHunk = hunks[selectedIdx];
      if (e.key === '=' || e.key === 'Enter') {
        e.preventDefault();
        onToggleHunkDiff(activeHunk.id);
      } else if (e.key === 's') {
        e.preventDefault();
        onStageHunk(selectedIdx);
      } else if (e.key === 'X') {
        e.preventDefault();
        onResetHunk(selectedIdx);
      }
    }
  };

  return (
    <div
      className="git-split-panel"
      data-testid="git-split-panel"
      tabIndex={0}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="git-panel-header">
        <div className="git-panel-title-group">
          <span className="git-panel-badge">🐙 [Fugitive :Git]</span>
          <span className="git-panel-filename">{filename}</span>
          <span className="git-panel-stats">
            {hunks.length > 0 ? (
              <>
                <span className="git-stat-add">+{totalAdded}</span>
                <span className="git-stat-del">-{totalRemoved}</span>
              </>
            ) : (
              <span className="git-stat-clean">clean</span>
            )}
          </span>
          {editorState.gitStaged && (
            <span className="git-staged-pill" data-testid="git-panel-staged-pill">
              STAGED
            </span>
          )}
        </div>

        <div className="git-panel-tabs">
          <button
            type="button"
            className={`git-panel-tab ${panel.activeTab === 'changes' ? 'active' : ''}`}
            data-testid="git-tab-changes"
            onClick={() => onChangeTab('changes')}
          >
            {t('변경 Hunk ({n})', { n: hunks.length })}
          </button>
          <button
            type="button"
            className={`git-panel-tab ${panel.activeTab === 'log' ? 'active' : ''}`}
            data-testid="git-tab-log"
            onClick={() => onChangeTab('log')}
          >
            {t('커밋 로그 ({n})', { n: commits.length })}
          </button>
        </div>

        <div className="git-panel-actions">
          <button
            type="button"
            className="git-action-btn stage"
            data-testid="git-panel-stage-all"
            onClick={onStageAll}
            disabled={hunks.length === 0}
          >
            {t('+ 전체 스테이징')}
          </button>
          <button
            type="button"
            className="git-action-btn"
            data-testid="git-panel-unstage"
            onClick={onUnstage}
            disabled={!editorState.gitStaged && (editorState.gitBaseHistory?.length ?? 0) === 0}
          >
            {t('↺ 언스테이징 (u)')}
          </button>
          <button
            type="button"
            className={`git-action-btn ${editorState.gitBlameVisible ? 'active' : ''}`}
            data-testid="git-panel-blame-toggle"
            onClick={onToggleBlame}
          >
            {t('🕵️ Blame')}
          </button>
          <button
            type="button"
            className="git-action-close"
            data-testid="git-panel-close-btn"
            onClick={onClose}
            aria-label={t('Git 패널 닫기')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 커밋 메시지 입력 폼 */}
      <form className="git-commit-bar" onSubmit={handleSubmitCommit}>
        <input
          ref={commitInputRef}
          type="text"
          className="git-commit-input"
          data-testid="git-panel-commit-input"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder={t('커밋 메시지 입력 (단축키 c · 예: feat: refactor handler)')}
        />
        <button
          type="submit"
          className="git-commit-submit-btn"
          data-testid="git-panel-commit-btn"
          disabled={!commitMsg.trim() || (hunks.length === 0 && !editorState.gitStaged)}
        >
          {t('✓ 커밋')}
        </button>
      </form>

      {/* 본문: 변경 Hunks 또는 커밋 로그 */}
      <div className="git-panel-body">
        {panel.activeTab === 'changes' ? (
          hunks.length === 0 ? (
            <div className="git-panel-empty" data-testid="git-panel-empty">
              {editorState.gitStaged
                ? t('✅ 스테이징된 변경사항이 커밋을 기다리고 있습니다. 위에서 커밋 메시지를 입력하세요.')
                : t('✨ 작업 트리가 깨끗합니다 (working tree clean). 코드를 수정하면 여기에 Hunk 가 표시됩니다.')}
            </div>
          ) : (
            <div className="git-hunk-list">
              {hunks.map((hunk, idx) => {
                const isSelected = idx === selectedIdx;
                const isExpanded = panel.expandedHunkIds.includes(hunk.id);
                return (
                  <div
                    key={hunk.id}
                    className={`git-hunk-card ${isSelected ? 'selected' : ''}`}
                    data-testid={`git-panel-hunk-${hunk.id}`}
                    onClick={() => onSelectIndex(idx)}
                  >
                    <div className="git-hunk-card-row">
                      <span className="git-hunk-cursor">{isSelected ? '▶' : ' '}</span>
                      <span className={`git-hunk-type-tag type-${hunk.type}`}>
                        {hunk.type.toUpperCase()}
                      </span>
                      <span className="git-hunk-range">
                        @@ L{hunk.startLine + 1}..L{hunk.endLine + 1} @@
                      </span>
                      <span className="git-hunk-delta">
                        +{hunk.addedLines.length} -{hunk.removedLines.length}
                      </span>
                      <div className="git-hunk-row-actions">
                        <button
                          type="button"
                          className="git-mini-btn"
                          data-testid={`git-hunk-diff-${hunk.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleHunkDiff(hunk.id);
                          }}
                        >
                          {isExpanded ? t('▾ Diff 접기') : t('▸ Diff (=)')}
                        </button>
                        <button
                          type="button"
                          className="git-mini-btn stage"
                          data-testid={`git-hunk-stage-${hunk.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStageHunk(idx);
                          }}
                        >
                          {t('s 스테이징')}
                        </button>
                        <button
                          type="button"
                          className="git-mini-btn reset"
                          data-testid={`git-hunk-reset-${hunk.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onResetHunk(idx);
                          }}
                        >
                          {t('X 되돌리기')}
                        </button>
                        <button
                          type="button"
                          className="git-mini-btn"
                          data-testid={`git-hunk-jump-${hunk.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onJumpHunk(idx);
                          }}
                        >
                          {t('↗ 이동')}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="git-hunk-inline-diff" data-testid={`git-hunk-diff-body-${hunk.id}`}>
                        {hunk.removedLines.map((line, i) => (
                          <div key={`r-${i}`} className="git-diff-line removed">
                            - {line}
                          </div>
                        ))}
                        {hunk.addedLines.map((line, i) => (
                          <div key={`a-${i}`} className="git-diff-line added">
                            + {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="git-commit-log-list" data-testid="git-commit-log-list">
            {commits.map((c, idx) => (
              <div
                key={`${c.hash}-${idx}`}
                className={`git-commit-row ${idx === selectedIdx ? 'selected' : ''}`}
                onClick={() => onSelectIndex(idx)}
              >
                <span className="git-commit-hash">{c.hash}</span>
                {idx === 0 && <span className="git-head-badge">HEAD</span>}
                <span className="git-commit-msg">{c.message}</span>
                <span className="git-commit-meta">
                  {c.author} · {c.filename} (+{c.added} -{c.removed})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="git-panel-footer">
        {t('키보드: j/k 이동 · = Diff 토글 · s 스테이징 · u 언스테이징 · X 되돌리기 · c 커밋 · 1/2 탭 · q 닫기')}
      </div>
    </div>
  );
};

export default GitPanel;
