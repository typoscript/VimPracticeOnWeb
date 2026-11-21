import React from 'react';
import { VimEditorState } from '../../vim-engine';
import { t } from '../../i18n';
import './YankyMenu.css';

export interface YankyMenuProps {
  editorState: VimEditorState;
  onPressKey: (key: string) => void;
}

/**
 * yanky.nvim 스타일 복사 이력(Yank Ring) 플로팅 팝업 (:YankyRingHistory / :Yanks)
 */
export const YankyMenu: React.FC<YankyMenuProps> = ({ editorState, onPressKey }) => {
  const menu = editorState.yankyMenu;
  if (!menu?.isOpen) return null;

  const history = editorState.yankHistory ?? [];

  const handleRowClick = (idx: number) => {
    const delta = idx - menu.selectedIndex;
    const move = delta >= 0 ? 'j' : 'k';
    for (let i = 0; i < Math.abs(delta); i++) onPressKey(move);
    onPressKey('Enter');
  };

  return (
    <div
      className="yanky-menu-panel"
      data-testid="yanky-menu-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="yanky-menu-header">
        <span className="yanky-menu-title">📋 {t('Yanky 복사 링 히스토리')}</span>
        <span className="yanky-menu-count" data-testid="yanky-menu-count">
          {history.length}
        </span>
        <button
          type="button"
          className="yanky-menu-close"
          data-testid="yanky-menu-close"
          onClick={() => onPressKey('Escape')}
          title={t('Yanky 닫기')}
          tabIndex={-1}
        >
          ✕
        </button>
      </div>

      {history.length === 0 ? (
        <div className="yanky-menu-empty" data-testid="yanky-menu-empty">
          {t('복사 기록이 없습니다. y/d/c 로 텍스트를 복사해 보세요.')}
        </div>
      ) : (
        <div className="yanky-menu-list">
          {history.map((entry, idx) => {
            const lines = entry.content.split('\n');
            const first = lines[0] || ' ';
            const isSelected = idx === menu.selectedIndex;
            return (
              <div
                key={`${idx}-${entry.type}-${entry.content}`}
                className={`yanky-menu-item ${isSelected ? 'selected' : ''}`}
                data-testid={`yanky-item-${idx + 1}`}
                onClick={() => handleRowClick(idx)}
              >
                <span className="yanky-slot-badge">{idx < 9 ? idx + 1 : '·'}</span>
                <span className={`yanky-type-badge type-${entry.type}`}>
                  {entry.type === 'line' ? 'LINE' : entry.type === 'block' ? 'BLOCK' : 'CHAR'}
                </span>
                <span className="yanky-entry-text">{first}</span>
                {lines.length > 1 && (
                  <span className="yanky-entry-more">
                    {t('외 {n}줄', { n: lines.length - 1 })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="yanky-menu-footer">
        {t('1-9 즉시 붙여넣기 · j/k 이동 · Enter/p 뒤에 · P 앞에 · d 삭제 · Esc 닫기')}
      </div>
    </div>
  );
};
