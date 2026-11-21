import React from 'react';
import {
  VimEditorState,
  searchFilesFuzzy,
  searchBuffersFuzzy,
  searchGrepMatches,
  getOptions,
  tokenizeLine,
  detectFiletype,
  FuzzyFileItem,
  FuzzyBufferItem,
  GrepMatchItem,
} from '../../vim-engine';
import { t, useLocale } from '../../i18n';
import './FuzzyFinder.css';

const PREVIEW_CONTEXT_LINES = 8;

function renderHighlightedLine(
  text: string,
  language: ReturnType<typeof detectFiletype>,
  matchCol?: number,
  matchLen?: number
): React.ReactNode {
  const tokens = tokenizeLine(text, language);
  const boundaries = new Set<number>([0, text.length]);
  tokens.forEach((tk) => {
    boundaries.add(tk.startCol);
    boundaries.add(tk.endCol);
  });
  if (matchCol !== undefined && matchLen) {
    boundaries.add(matchCol);
    boundaries.add(Math.min(text.length, matchCol + matchLen));
  }
  const cuts = [...boundaries].filter((b) => b >= 0 && b <= text.length).sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i];
    const e = cuts[i + 1];
    const tok = tokens.find((tk) => tk.startCol <= s && s < tk.endCol);
    const isMatch = matchCol !== undefined && matchLen && s >= matchCol && s < matchCol + matchLen;
    const cls = [tok ? `syn-${tok.type}` : '', isMatch ? 'grep-match-hl' : ''].filter(Boolean).join(' ');
    parts.push(
      <span key={s} className={cls || undefined}>
        {text.slice(s, e)}
      </span>
    );
  }
  return <>{parts}</>;
}

interface FuzzyFinderProps {
  state: VimEditorState;
  onSelectAction: (action: 'open' | 'vsplit' | 'split' | 'tab') => void;
  onSelectItemIndex?: (index: number) => void;
  onClose: () => void;
}

export const FuzzyFinder: React.FC<FuzzyFinderProps> = ({
  state,
  onSelectAction,
  onSelectItemIndex,
  onClose,
}) => {
  useLocale();
  const finder = state.fuzzyFinder;
  if (!finder || !finder.isOpen) return null;

  const mode = finder.mode;
  const query = finder.query;
  const selectedIndex = finder.selectedIndex;

  const vfs = state.virtualFiles ?? {};
  const fileItems: FuzzyFileItem[] =
    mode === 'files' ? searchFilesFuzzy(vfs, query) : [];
  const bufferItems: FuzzyBufferItem[] =
    mode === 'buffers' ? searchBuffersFuzzy(state.buffers ?? [], query) : [];
  const grepItems: GrepMatchItem[] =
    mode === 'grep'
      ? searchGrepMatches(vfs, query, {
          ignorecase: getOptions(state).ignorecase,
          smartcase: getOptions(state).smartcase,
        })
      : [];

  const itemsCount =
    mode === 'files' ? fileItems.length : mode === 'grep' ? grepItems.length : bufferItems.length;

  const selectedGrep = mode === 'grep' ? grepItems[selectedIndex] : undefined;
  let previewNode: React.ReactNode = null;
  if (mode === 'grep') {
    if (!selectedGrep) {
      previewNode = <div className="grep-preview-empty">{t('미리볼 파일이 없습니다.')}</div>;
    } else {
      const fileLines = vfs[selectedGrep.path] ?? [];
      const language = detectFiletype(selectedGrep.path);
      const from = Math.max(0, selectedGrep.line - PREVIEW_CONTEXT_LINES);
      const to = Math.min(fileLines.length - 1, selectedGrep.line + PREVIEW_CONTEXT_LINES);
      const rows: React.ReactNode[] = [];
      for (let i = from; i <= to; i++) {
        const isHit = i === selectedGrep.line;
        rows.push(
          <div
            key={i}
            className={`grep-preview-line ${isHit ? 'hit' : ''}`}
            data-testid={isHit ? 'grep-preview-hit' : undefined}
          >
            <span className="grep-preview-lnum">{i + 1}</span>
            <span className="grep-preview-text">
              {renderHighlightedLine(
                fileLines[i] ?? '',
                language,
                isHit ? selectedGrep.col : undefined,
                isHit ? selectedGrep.length : undefined
              )}
            </span>
          </div>
        );
      }
      previewNode = (
        <>
          <div className="grep-preview-title">
            {selectedGrep.path}:{selectedGrep.line + 1}
          </div>
          {rows}
        </>
      );
    }
  }

  const badgeLabel = mode === 'files' ? 'FILES' : mode === 'grep' ? 'LIVEGREP' : 'BUFFERS';
  const placeholder = mode === 'grep' ? t('정규식 패턴을 입력하세요...') : t('검색어를 입력하세요...');

  return (
    <div className="fuzzy-finder-backdrop" onClick={onClose} data-testid="fuzzy-finder-backdrop">
      <div
        className={`fuzzy-finder-modal ${mode === 'grep' ? 'grep-mode' : ''}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="fuzzy-finder-modal"
      >
        {/* 헤더: 모드 배지 및 검색 입력창 */}
        <div className="fuzzy-finder-header">
          <span className={`fuzzy-finder-badge ${mode}`}>{badgeLabel}</span>
          <div className="fuzzy-finder-input-wrapper">
            <span className="fuzzy-finder-prompt">&gt;</span>
            <span className="fuzzy-finder-query">
              {query || <span className="fuzzy-finder-placeholder">{placeholder}</span>}
            </span>
            <span className="fuzzy-finder-caret" />
          </div>
          <span className="fuzzy-finder-count">
            {itemsCount} {t('개')}
          </span>
        </div>

        <div className={mode === 'grep' ? 'fuzzy-finder-body-split' : undefined}>
        {/* 결과 리스트 */}
        <div className="fuzzy-finder-list" data-testid="fuzzy-finder-list">
          {itemsCount === 0 ? (
            <div className="fuzzy-finder-empty">{t('일치하는 항목이 없습니다.')}</div>
          ) : mode === 'grep' ? (
            grepItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.path}:${item.line}`}
                  className={`fuzzy-finder-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectItemIndex?.(idx);
                    onSelectAction('open');
                  }}
                  data-testid={`fuzzy-item-${idx}`}
                >
                  <span className="fuzzy-finder-item-prefix">{isSelected ? '▶' : ' '}</span>
                  <span className="grep-item-loc">
                    {item.path}:{item.line + 1}
                  </span>
                  <span className="fuzzy-finder-item-path grep-item-text">{item.text.trim()}</span>
                </div>
              );
            })
          ) : mode === 'files' ? (
            fileItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.path}
                  className={`fuzzy-finder-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectItemIndex?.(idx);
                    onSelectAction('open');
                  }}
                  data-testid={`fuzzy-item-${idx}`}
                >
                  <span className="fuzzy-finder-item-prefix">{isSelected ? '▶' : ' '}</span>
                  <span className="fuzzy-finder-item-path">{item.path}</span>
                  <div className="fuzzy-finder-item-actions">
                    <button
                      type="button"
                      className="fuzzy-action-btn"
                      title={t('세로 분할')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItemIndex?.(idx);
                        onSelectAction('vsplit');
                      }}
                    >
                      vsp
                    </button>
                    <button
                      type="button"
                      className="fuzzy-action-btn"
                      title={t('가로 분할')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItemIndex?.(idx);
                        onSelectAction('split');
                      }}
                    >
                      sp
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            bufferItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.buffer.id}
                  className={`fuzzy-finder-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectItemIndex?.(idx);
                    onSelectAction('open');
                  }}
                  data-testid={`fuzzy-item-${idx}`}
                >
                  <span className="fuzzy-finder-item-prefix">{isSelected ? '▶' : ' '}</span>
                  <span className="fuzzy-finder-buffer-num">#{item.buffer.id}</span>
                  <span className="fuzzy-finder-item-path">{item.buffer.name}</span>
                  {item.buffer.isModified && <span className="fuzzy-modified-badge">[+]</span>}
                  <div className="fuzzy-finder-item-actions">
                    <button
                      type="button"
                      className="fuzzy-action-btn"
                      title={t('세로 분할')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectItemIndex?.(idx);
                        onSelectAction('vsplit');
                      }}
                    >
                      vsp
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {mode === 'grep' && (
          <div className="grep-preview" data-testid="grep-preview">
            {previewNode}
          </div>
        )}
        </div>

        {/* 풋터: 키보드 단축키 안내 */}
        <div className="fuzzy-finder-footer">
          <span>
            <kbd>Enter</kbd> {t('열기')}
          </span>
          {mode === 'grep' && (
            <span>
              <kbd>Ctrl+q</kbd> {t('퀵픽스 전송')}
            </span>
          )}
          <span>
            <kbd>Ctrl+v</kbd> {t('세로분할')}
          </span>
          <span>
            <kbd>Ctrl+s</kbd> {t('가로분할')}
          </span>
          <span>
            <kbd>Ctrl+t</kbd> {t('새탭')}
          </span>
          <span>
            <kbd>Ctrl+j/k</kbd> {t('선택이동')}
          </span>
          <span>
            <kbd>Esc</kbd> {t('닫기')}
          </span>
        </div>
      </div>
    </div>
  );
};
