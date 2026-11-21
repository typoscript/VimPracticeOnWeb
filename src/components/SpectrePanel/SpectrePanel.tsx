import React, { useMemo } from 'react';
import { SpectreMatchItem, SpectreSessionState } from '../../vim-engine';
import { t } from '../../i18n';
import './SpectrePanel.css';

export interface SpectrePanelProps {
  state: SpectreSessionState;
  onUpdateQuery: (searchQuery: string, replaceQuery: string, ignoreCase?: boolean) => void;
  onToggleItem: (itemId: string) => void;
  onToggleAll: (enabled: boolean) => void;
  onJumpItem: (index: number) => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

/**
 * nvim-spectre 스타일 프로젝트 대화형 검색·치환 분할 패널 (:Spectre)
 */
export const SpectrePanel: React.FC<SpectrePanelProps> = ({
  state,
  onUpdateQuery,
  onToggleItem,
  onToggleAll,
  onJumpItem,
  onReplaceAll,
  onClose,
}) => {
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ item: SpectreMatchItem; globalIndex: number }>>();
    state.items.forEach((item, globalIndex) => {
      const list = map.get(item.filename) ?? [];
      list.push({ item, globalIndex });
      map.set(item.filename, list);
    });
    return Array.from(map.entries());
  }, [state.items]);

  const enabledCount = useMemo(
    () => state.items.filter((i) => i.enabled).length,
    [state.items]
  );
  const allEnabled = state.items.length > 0 && enabledCount === state.items.length;

  return (
    <div
      className="spectre-panel-container"
      data-testid="spectre-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="spectre-panel-header">
        <div className="spectre-title-group">
          <span className="spectre-badge">SPECTRE</span>
          <span className="spectre-title">{t('Spectre 프로젝트 검색 · 치환')}</span>
          <span className="spectre-counts" data-testid="spectre-counts">
            {enabledCount} / {state.items.length}
          </span>
        </div>

        <div className="spectre-header-actions">
          <button
            type="button"
            className={`spectre-case-btn ${state.ignoreCase ? 'active' : ''}`}
            data-testid="spectre-ignorecase-btn"
            onClick={() =>
              onUpdateQuery(state.searchQuery, state.replaceQuery, !state.ignoreCase)
            }
            title={t('대소문자 무시 토글')}
            tabIndex={-1}
          >
            Aa
          </button>
          <button
            type="button"
            className="spectre-toggle-all-btn"
            data-testid="spectre-toggle-all-btn"
            onClick={() => onToggleAll(!allEnabled)}
            tabIndex={-1}
          >
            {allEnabled ? t('전체 해제') : t('전체 선택')}
          </button>
          <button
            type="button"
            className="spectre-replace-all-btn"
            data-testid="spectre-replace-all-btn"
            disabled={enabledCount === 0}
            onClick={onReplaceAll}
            tabIndex={-1}
          >
            {t('⚡ 일괄 치환 ({n})', { n: enabledCount })}
          </button>
          <button
            type="button"
            className="spectre-close-btn"
            data-testid="spectre-close-btn"
            onClick={onClose}
            title={t('Spectre 패널 닫기')}
            tabIndex={-1}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="spectre-inputs-bar">
        <label className="spectre-input-field">
          <span className="spectre-input-icon">🔍</span>
          <input
            type="text"
            className="spectre-input"
            data-testid="spectre-search-input"
            placeholder={t('검색어 (Vim 정규식)...')}
            value={state.searchQuery}
            onChange={(e) =>
              onUpdateQuery(e.target.value, state.replaceQuery, state.ignoreCase)
            }
          />
        </label>
        <label className="spectre-input-field">
          <span className="spectre-input-icon">✏️</span>
          <input
            type="text"
            className="spectre-input"
            data-testid="spectre-replace-input"
            placeholder={t('치환할 텍스트...')}
            value={state.replaceQuery}
            onChange={(e) =>
              onUpdateQuery(state.searchQuery, e.target.value, state.ignoreCase)
            }
          />
        </label>
      </div>

      <div className="spectre-panel-body">
        {!state.searchQuery ? (
          <div className="spectre-empty" data-testid="spectre-empty">
            {t('검색어를 입력하면 프로젝트 전체 매치와 치환 미리보기가 표시됩니다.')}
          </div>
        ) : grouped.length === 0 ? (
          <div className="spectre-empty" data-testid="spectre-empty">
            {t('일치하는 항목이 없습니다.')}
          </div>
        ) : (
          grouped.map(([filename, entries]) => (
            <div
              key={filename}
              className="spectre-file-group"
              data-testid={`spectre-group-${filename}`}
            >
              <div className="spectre-file-header">
                <span className="spectre-file-icon">▾ 📄</span>
                <span className="spectre-file-name">{filename}</span>
                <span className="spectre-file-count">{entries.length}</span>
              </div>
              {entries.map(({ item, globalIndex }) => (
                <div
                  key={item.id}
                  className={`spectre-item-row ${item.enabled ? 'enabled' : 'disabled'}`}
                  data-testid={`spectre-item-${globalIndex}`}
                  onClick={() => onJumpItem(globalIndex)}
                >
                  <input
                    type="checkbox"
                    className="spectre-item-checkbox"
                    data-testid={`spectre-check-${globalIndex}`}
                    checked={item.enabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleItem(item.id)}
                  />
                  <span className="spectre-item-loc">
                    [{item.line + 1}:{item.col + 1}]
                  </span>
                  <div className="spectre-diff-col">
                    <div className="spectre-line-del">- {item.lineText}</div>
                    {item.previewText !== item.lineText && (
                      <div className="spectre-line-add">+ {item.previewText}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
