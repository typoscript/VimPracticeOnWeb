import React from 'react';
import {
  VimEditorState,
  searchFilesFuzzy,
  searchBuffersFuzzy,
  FuzzyFileItem,
  FuzzyBufferItem,
} from '../../vim-engine';
import { t, useLocale } from '../../i18n';
import './FuzzyFinder.css';

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

  const itemsCount = mode === 'files' ? fileItems.length : bufferItems.length;

  return (
    <div className="fuzzy-finder-backdrop" onClick={onClose} data-testid="fuzzy-finder-backdrop">
      <div
        className="fuzzy-finder-modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="fuzzy-finder-modal"
      >
        {/* 헤더: 모드 배지 및 검색 입력창 */}
        <div className="fuzzy-finder-header">
          <span className={`fuzzy-finder-badge ${mode}`}>
            {mode === 'files' ? 'FILES' : 'BUFFERS'}
          </span>
          <div className="fuzzy-finder-input-wrapper">
            <span className="fuzzy-finder-prompt">&gt;</span>
            <span className="fuzzy-finder-query">
              {query || <span className="fuzzy-finder-placeholder">{t('검색어를 입력하세요...')}</span>}
            </span>
            <span className="fuzzy-finder-caret" />
          </div>
          <span className="fuzzy-finder-count">
            {itemsCount} {t('개')}
          </span>
        </div>

        {/* 결과 리스트 */}
        <div className="fuzzy-finder-list" data-testid="fuzzy-finder-list">
          {itemsCount === 0 ? (
            <div className="fuzzy-finder-empty">{t('일치하는 항목이 없습니다.')}</div>
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

        {/* 풋터: 키보드 단축키 안내 */}
        <div className="fuzzy-finder-footer">
          <span>
            <kbd>Enter</kbd> {t('열기')}
          </span>
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
