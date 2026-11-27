import React from 'react';
import { t } from '../../i18n';
import type { EditorProps } from './Editor';

/** 커서 줄에 뜨는 플로팅 팝업: LSP 호버·이름 변경·코드 액션, Git Hunk 미리보기, 자동완성 메뉴 (Editor.tsx 에서 분리) */
export type EditorCursorPopupsProps = Pick<
  EditorProps,
  | 'completionSession'
  | 'onSelectCompletionItem'
  | 'lspHover'
  | 'onCloseLspHover'
  | 'lspRename'
  | 'onCancelLspRename'
  | 'lspCodeActionMenu'
  | 'onApplyLspCodeAction'
  | 'onCloseLspCodeAction'
  | 'gitHunkPreview'
  | 'onCloseGitHunkPreview'
  | 'onResetGitHunk'
  | 'onStageGitHunk'
> & {
  lineIdx: number;
  lineCount: number;
  cursorCol: number;
  isCursorLine: boolean;
  selectedItemRef: React.RefObject<HTMLDivElement | null>;
};

export const EditorCursorPopups: React.FC<EditorCursorPopupsProps> = ({
  lineIdx,
  lineCount,
  cursorCol,
  isCursorLine,
  selectedItemRef,
  completionSession,
  onSelectCompletionItem,
  lspHover,
  onCloseLspHover,
  lspRename,
  onCancelLspRename,
  lspCodeActionMenu,
  onApplyLspCodeAction,
  onCloseLspCodeAction,
  gitHunkPreview,
  onCloseGitHunkPreview,
  onResetGitHunk,
  onStageGitHunk,
}) => (
  <>
      {lspHover?.isOpen && lspHover.line === lineIdx && (
        <div
          className={`lsp-hover-popup ${lineCount - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
          data-testid="lsp-hover-popup"
          style={{ left: `calc(${Math.min(cursorCol, 36)} * 1ch)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lsp-hover-header">
            <span className="lsp-hover-kind">{lspHover.kind}</span>
            <span className="lsp-hover-symbol">{lspHover.symbol}</span>
            {lspHover.source && (
              <span className="lsp-hover-source">{lspHover.source}</span>
            )}
            <button
              type="button"
              className="lsp-hover-close"
              onClick={() => onCloseLspHover?.()}
              aria-label={t('호버 닫기')}
            >
              Esc
            </button>
          </div>
          <pre className="lsp-hover-signature">{lspHover.signature}</pre>
          <p className="lsp-hover-doc">{lspHover.documentation}</p>
        </div>
      )}
      {lspRename?.isOpen && lspRename.line === lineIdx && (
        <div
          className={`lsp-hover-popup lsp-rename-popup ${lineCount - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
          data-testid="lsp-rename-popup"
          style={{ left: `calc(${Math.min(cursorCol, 36)} * 1ch)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lsp-hover-header">
            <span className="lsp-hover-kind lsp-rename-badge">RENAME</span>
            <span className="lsp-hover-symbol">{lspRename.oldName}</span>
            <span className="lsp-hover-source">
              {t('{count}개 위치 · {files}개 파일', {
                count: lspRename.occurrenceCount,
                files: lspRename.fileCount,
              })}
            </span>
            <button
              type="button"
              className="lsp-hover-close"
              onClick={() => onCancelLspRename?.()}
              aria-label={t('이름 변경 닫기')}
            >
              Esc
            </button>
          </div>
          <div className="lsp-rename-input" data-testid="lsp-rename-input">
            <span className="lsp-rename-arrow">→</span>
            <span className="lsp-rename-value">{lspRename.newName}</span>
            <span className="lsp-rename-caret" />
          </div>
          <div className="lsp-popup-hint">{t('Enter 적용 · Esc 취소')}</div>
        </div>
      )}
      {lspCodeActionMenu?.isOpen && lspCodeActionMenu.line === lineIdx && (
        <div
          className={`lsp-hover-popup lsp-code-action-popup ${lineCount - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
          data-testid="lsp-code-action-popup"
          style={{ left: `calc(${Math.min(cursorCol, 36)} * 1ch)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lsp-hover-header">
            <span className="lsp-hover-kind lsp-action-badge">CODE ACTION</span>
            <button
              type="button"
              className="lsp-hover-close"
              onClick={() => onCloseLspCodeAction?.()}
              aria-label={t('코드 액션 닫기')}
            >
              Esc
            </button>
          </div>
          <div className="lsp-code-action-list">
            {lspCodeActionMenu.actions.map((act, idx) => (
              <button
                key={act.id}
                type="button"
                className={`lsp-code-action-item ${idx === lspCodeActionMenu.selectedIndex ? 'selected' : ''}`}
                data-testid={`lsp-code-action-${idx}`}
                onClick={() => onApplyLspCodeAction?.(idx)}
              >
                <span className="lsp-action-num">{idx + 1}.</span>
                {act.kind && (
                  <span className={`lsp-action-kind kind-${act.kind}`}>
                    {act.kind}
                  </span>
                )}
                <span className="lsp-action-title">{act.title}</span>
              </button>
            ))}
          </div>
          <div className="lsp-popup-hint">{t('숫자/Enter 선택 · Esc 취소')}</div>
        </div>
      )}
      {gitHunkPreview?.isOpen && gitHunkPreview.line === lineIdx && (
        <div
          className={`lsp-hover-popup git-hunk-preview-popup ${lineCount - 1 - lineIdx < 6 && lineIdx >= 4 ? 'open-upward' : ''}`}
          data-testid="git-hunk-preview-popup"
          style={{ left: `calc(${Math.min(cursorCol, 24)} * 1ch)` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lsp-hover-header">
            <span className={`lsp-hover-kind git-hunk-badge type-${gitHunkPreview.hunk.type}`}>
              GIT {gitHunkPreview.hunk.type.toUpperCase()}
            </span>
            <span className="lsp-hover-symbol">
              Hunk #{gitHunkPreview.hunk.id}
            </span>
            <div className="git-hunk-popup-actions">
              {onStageGitHunk && (
                <button
                  type="button"
                  className="git-hunk-action-btn stage"
                  data-testid="git-hunk-stage-btn"
                  onClick={() => onStageGitHunk()}
                >
                  Stage
                </button>
              )}
              {onResetGitHunk && (
                <button
                  type="button"
                  className="git-hunk-action-btn reset"
                  data-testid="git-hunk-reset-btn"
                  onClick={() => onResetGitHunk()}
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                className="lsp-hover-close"
                onClick={() => onCloseGitHunkPreview?.()}
                aria-label={t('Git 미리보기 닫기')}
              >
                Esc
              </button>
            </div>
          </div>
          <div className="git-hunk-diff-body">
            {gitHunkPreview.hunk.removedLines.map((rl, idx) => (
              <div key={`rem-${idx}`} className="git-hunk-line removed">
                - {rl}
              </div>
            ))}
            {gitHunkPreview.hunk.addedLines.map((al, idx) => (
              <div key={`add-${idx}`} className="git-hunk-line added">
                + {al}
              </div>
            ))}
          </div>
        </div>
      )}
      {isCursorLine &&
        completionSession &&
        completionSession.candidates.length > 0 && (
          <div
            className={`vim-completion-menu ${lineCount - 1 - lineIdx < 6 && lineIdx >= 5 ? 'open-upward' : ''}`}
            data-testid="vim-completion-menu"
            style={{ left: `calc(${cursorCol} * 1ch)` }}
          >
            <div className="completion-header">
              <span className="completion-prefix-tag">
                {completionSession.type === 'cmp'
                  ? `⚡ [nvim-cmp] ${completionSession.prefix || '*'}`
                  : completionSession.type === 'file'
                  ? `📁 [FILE] ${completionSession.prefix || '/'}`
                  : completionSession.type === 'line'
                  ? `📄 [LINE] ${completionSession.prefix.trim().slice(0, 16)}`
                  : `🔤 [ID] ${completionSession.prefix}`}
              </span>
              <span className="completion-count-tag">
                {completionSession.selectedIndex + 1}/
                {completionSession.candidates.length}
              </span>
            </div>
            <div className="completion-list">
              {completionSession.candidates.map((cand, idx) => {
                const isLineType = completionSession.type === 'line';
                const cmpMeta =
                  completionSession.type === 'cmp'
                    ? completionSession.items?.[idx]
                    : undefined;
                return (
                  <div
                    key={`${cand}-${idx}`}
                    ref={idx === completionSession.selectedIndex ? selectedItemRef : undefined}
                    className={`completion-item ${
                      idx === completionSession.selectedIndex ? 'selected' : ''
                    }`}
                    data-testid={`completion-item-${idx}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCompletionItem?.(idx);
                    }}
                  >
                    {cmpMeta && (
                      <span
                        className={`cmp-kind-badge kind-${cmpMeta.kind.toLowerCase()}`}
                        data-testid={`cmp-kind-${idx}`}
                      >
                        {cmpMeta.kind === 'Snippet'
                          ? '✂ Snip'
                          : cmpMeta.kind === 'Function'
                            ? 'ƒ Func'
                            : cmpMeta.kind === 'Class'
                              ? '◈ Class'
                              : cmpMeta.kind === 'Property'
                                ? '◆ Prop'
                                : cmpMeta.kind === 'Variable'
                                  ? '𝑥 Var'
                                  : '𝐓 Text'}
                      </span>
                    )}
                    {isLineType ? (
                      <span className="cand-remainder">
                        {cand.length > 50 ? `${cand.slice(0, 50)}...` : cand}
                      </span>
                    ) : (
                      <>
                        <span className="cand-match-prefix">
                          {cand.slice(0, completionSession.prefix.length)}
                        </span>
                        <span className="cand-remainder">
                          {cand.slice(completionSession.prefix.length)}
                        </span>
                      </>
                    )}
                    {cmpMeta?.detail && (
                      <span className="cmp-item-detail">{cmpMeta.detail}</span>
                    )}
                    {idx === completionSession.selectedIndex && (
                      <span className="cand-selected-indicator">⏎</span>
                    )}
                  </div>
                );
              })}
            </div>
            {completionSession.type === 'cmp' &&
              completionSession.items?.[completionSession.selectedIndex]?.preview && (
                <div className="cmp-preview-box" data-testid="cmp-preview-box">
                  {completionSession.items[
                    completionSession.selectedIndex
                  ].preview!.slice(0, 5).map((pLine, pIdx) => (
                    <div key={pIdx} className="cmp-preview-line">
                      {pLine}
                    </div>
                  ))}
                </div>
              )}
            <div className="completion-footer">
              <span>
                {completionSession.type === 'cmp'
                  ? t('Ctrl-n/p: 이동 | Enter/Tab: 확정·스니펫 확장 | Ctrl-e: 취소')
                  : t('Ctrl+n: 다음 | Ctrl+p: 이전 | Enter/Ctrl+y: 선택')}
              </span>
            </div>
          </div>
        )}
  </>
);
