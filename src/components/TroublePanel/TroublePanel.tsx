import React, { useMemo } from 'react';
import { TroubleItem, TroubleMode, TroubleSessionState } from '../../vim-engine';
import { t } from '../../i18n';
import './TroublePanel.css';

export interface TroublePanelProps {
  state: TroubleSessionState;
  onJump: (index: number) => void;
  onChangeMode: (mode: TroubleMode) => void;
  onClose: () => void;
}

const MODE_TABS: ReadonlyArray<{ id: TroubleMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'todo', label: 'TODO' },
  { id: 'quickfix', label: 'Quickfix' },
];

/**
 * trouble.nvim 스타일 프로젝트 진단·TODO·퀵픽스 파일별 트리 통합 허브 (:Trouble)
 */
export const TroublePanel: React.FC<TroublePanelProps> = ({
  state,
  onJump,
  onChangeMode,
  onClose,
}) => {
  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ item: TroubleItem; globalIndex: number }>>();
    state.items.forEach((item, globalIndex) => {
      const list = map.get(item.filename) ?? [];
      list.push({ item, globalIndex });
      map.set(item.filename, list);
    });
    return Array.from(map.entries());
  }, [state.items]);

  const errorCount = state.items.filter((i) => i.severity === 'error').length;
  const warnCount = state.items.filter((i) => i.severity === 'warning').length;
  const todoCount = state.items.filter((i) => i.severity === 'todo').length;

  return (
    <div
      className="trouble-panel-container"
      data-testid="trouble-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="trouble-panel-header">
        <div className="trouble-title-group">
          <span className="trouble-badge">TROUBLE</span>
          <span className="trouble-title">{t('Trouble 통합 진단 · TODO')}</span>
          <span className="trouble-counts" data-testid="trouble-counts">
            {errorCount > 0 && <span className="trouble-cnt-err">E:{errorCount}</span>}
            {warnCount > 0 && <span className="trouble-cnt-warn">W:{warnCount}</span>}
            {todoCount > 0 && <span className="trouble-cnt-todo">T:{todoCount}</span>}
            <span className="trouble-cnt-total">({state.items.length})</span>
          </span>
        </div>

        <div className="trouble-mode-tabs" role="tablist">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={state.mode === tab.id}
              className={`trouble-mode-tab ${state.mode === tab.id ? 'active' : ''}`}
              data-testid={`trouble-mode-${tab.id}`}
              onClick={() => onChangeMode(tab.id)}
              tabIndex={-1}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="trouble-close-btn"
          data-testid="trouble-close-btn"
          onClick={onClose}
          title={t('Trouble 패널 닫기')}
          tabIndex={-1}
        >
          ✕
        </button>
      </div>

      <div className="trouble-panel-body">
        {grouped.length === 0 ? (
          <div className="trouble-empty" data-testid="trouble-empty">
            {t('표시할 진단이나 TODO 항목이 없습니다.')}
          </div>
        ) : (
          grouped.map(([filename, entries]) => (
            <div key={filename} className="trouble-file-group" data-testid={`trouble-group-${filename}`}>
              <div className="trouble-file-header">
                <span className="trouble-file-icon">▾ 📄</span>
                <span className="trouble-file-name">{filename}</span>
                <span className="trouble-file-count">{entries.length}</span>
              </div>
              {entries.map(({ item, globalIndex }) => {
                const isActive = globalIndex === state.selectedIndex;
                return (
                  <div
                    key={item.id}
                    className={`trouble-item-row ${isActive ? 'active' : ''} sev-${item.severity}`}
                    data-testid={`trouble-item-${globalIndex}`}
                    onClick={() => onJump(globalIndex)}
                  >
                    <span className={`trouble-sev-tag sev-${item.severity}`}>
                      {item.tag || item.severity.toUpperCase()}
                    </span>
                    <span className="trouble-item-msg">{item.message}</span>
                    <span className="trouble-item-loc">
                      [{item.line + 1}, {item.col + 1}]
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
