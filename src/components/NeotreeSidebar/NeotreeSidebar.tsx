import React from 'react';
import {
  VimEditorState,
  buildNeotreeNodes,
} from '../../vim-engine';
import { getBufferFiletypeBadge } from '../Editor/editorDecorations';
import { t } from '../../i18n';
import './NeotreeSidebar.css';

export interface NeotreeSidebarProps {
  editorState: VimEditorState;
  onSelectIndex: (index: number) => void;
  onOpenNode: (index: number, mode?: 'edit' | 'vsplit' | 'split' | 'tab') => void;
  onToggleDir: (dirPath: string) => void;
  onStartAdd: (index?: number) => void;
  onStartRename: (index?: number) => void;
  onUpdatePrompt: (value: string) => void;
  onConfirmPrompt: (value?: string) => void;
  onCancelPrompt: () => void;
  onDeleteNode: (index: number) => void;
  onFocusNeotree: (focused: boolean) => void;
  onClose: () => void;
}

/**
 * neo-tree.nvim / nvim-tree 스타일 영구 파일 트리 사이드바 (:Neotree / :NvimTreeToggle)
 */
export const NeotreeSidebar: React.FC<NeotreeSidebarProps> = ({
  editorState,
  onSelectIndex,
  onOpenNode,
  onToggleDir,
  onStartAdd,
  onStartRename,
  onUpdatePrompt,
  onConfirmPrompt,
  onCancelPrompt,
  onDeleteNode,
  onFocusNeotree,
  onClose,
}) => {
  const neotree = editorState.neotree;
  if (!neotree?.isOpen) return null;

  const nodes = buildNeotreeNodes(editorState);
  const selectedIdx = neotree.selectedIndex;
  const prompt = neotree.prompt;

  return (
    <aside
      className={`neotree-sidebar ${neotree.isFocused ? 'focused' : ''}`}
      data-testid="neotree-sidebar"
      onClick={(e) => {
        e.stopPropagation();
        if (!neotree.isFocused) {
          onFocusNeotree(true);
        }
      }}
    >
      <div className="neotree-header">
        <div className="neotree-title-group">
          <span className="neotree-icon">🌲</span>
          <span className="neotree-title">NEO-TREE</span>
          {neotree.isFocused && (
            <span className="neotree-focus-badge" data-testid="neotree-focus-badge">
              FOCUS
            </span>
          )}
        </div>
        <div className="neotree-header-actions">
          <button
            type="button"
            className="neotree-hdr-btn"
            data-testid="neotree-add-btn"
            onClick={(e) => {
              e.stopPropagation();
              onStartAdd(selectedIdx);
            }}
            title={t('새 파일/폴더 생성 (a)')}
          >
            +
          </button>
          <button
            type="button"
            className="neotree-hdr-btn"
            data-testid="neotree-close-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title={t('파일 트리 닫기 (:Neotree close / q)')}
          >
            ✕
          </button>
        </div>
      </div>

      {prompt && (
        <form
          className="neotree-prompt-bar"
          data-testid="neotree-prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirmPrompt(prompt.value);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="neotree-prompt-label">
            {prompt.type === 'add'
              ? t('생성 ({dir}/):', { dir: prompt.targetDir || '.' })
              : t('이름 변경:')}
          </div>
          <div className="neotree-prompt-row">
            <input
              type="text"
              className="neotree-prompt-input"
              data-testid="neotree-prompt-input"
              value={prompt.value}
              placeholder={
                prompt.type === 'add'
                  ? t('파일명 또는 폴더명/')
                  : prompt.targetPath?.split('/').pop() ?? ''
              }
              onChange={(e) => onUpdatePrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelPrompt();
                }
              }}
              autoFocus
            />
            <button
              type="submit"
              className="neotree-prompt-ok"
              data-testid="neotree-prompt-confirm"
            >
              ✓
            </button>
            <button
              type="button"
              className="neotree-prompt-cancel"
              data-testid="neotree-prompt-cancel"
              onClick={() => onCancelPrompt()}
            >
              ✕
            </button>
          </div>
        </form>
      )}

      <div className="neotree-tree-list" data-testid="neotree-tree-list">
        {nodes.map((node, idx) => {
          const isSelected = idx === selectedIdx;
          const ftBadge = !node.isDir ? getBufferFiletypeBadge(node.name) : null;

          return (
            <div
              key={node.path}
              className={`neotree-node-row ${isSelected ? 'selected' : ''} ${
                node.isActiveBuffer ? 'active-buffer' : ''
              }`}
              data-testid={`neotree-node-${node.path}`}
              style={{ paddingLeft: `${8 + node.depth * 14}px` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectIndex(idx);
                if (node.isDir) {
                  onToggleDir(node.path);
                } else {
                  onOpenNode(idx, 'edit');
                }
              }}
            >
              <span className="neotree-node-chevron">
                {node.isDir ? (node.isExpanded ? '▾' : '▸') : ' '}
              </span>
              {node.isDir ? (
                <span className="neotree-folder-icon">
                  {node.isExpanded ? '📂' : '📁'}
                </span>
              ) : (
                ftBadge && (
                  <span className={`neotree-ft-badge ${ftBadge.cls}`}>
                    {ftBadge.label}
                  </span>
                )
              )}
              <span className={`neotree-node-name ${node.isDir ? 'dir' : 'file'}`}>
                {node.name}
                {node.isDir ? '/' : ''}
              </span>

              <span className="neotree-node-badges">
                {node.errorCount && node.errorCount > 0 && (
                  <span
                    className="neotree-diag-badge error"
                    data-testid={`neotree-diag-err-${node.path}`}
                  >
                    E:{node.errorCount}
                  </span>
                )}
                {node.warningCount && node.warningCount > 0 && (
                  <span
                    className="neotree-diag-badge warning"
                    data-testid={`neotree-diag-warn-${node.path}`}
                  >
                    W:{node.warningCount}
                  </span>
                )}
                {node.gitStatus && (
                  <span
                    className={`neotree-git-badge git-${node.gitStatus.toLowerCase()}`}
                    data-testid={`neotree-git-${node.path}`}
                  >
                    {node.gitStatus}
                  </span>
                )}
              </span>

              <span className="neotree-row-actions" onClick={(e) => e.stopPropagation()}>
                {!node.isDir && (
                  <button
                    type="button"
                    className="neotree-row-btn"
                    data-testid={`neotree-vsplit-${node.path}`}
                    onClick={() => onOpenNode(idx, 'vsplit')}
                    title={t('세로 분할 창으로 열기 (s)')}
                  >
                    ◫
                  </button>
                )}
                <button
                  type="button"
                  className="neotree-row-btn"
                  data-testid={`neotree-rename-${node.path}`}
                  onClick={() => onStartRename(idx)}
                  title={t('이름 변경 (r)')}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="neotree-row-btn danger"
                  data-testid={`neotree-delete-${node.path}`}
                  onClick={() => onDeleteNode(idx)}
                  title={t('삭제 (d)')}
                >
                  🗑
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="neotree-footer-hint">
        <span>{t('Enter:열기 · s:분할 · a:생성 · r:변경 · d:삭제 · q:닫기')}</span>
      </div>
    </aside>
  );
};

export default NeotreeSidebar;
