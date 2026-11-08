import React, { useEffect, useRef } from 'react';
import { QuickfixState } from '../../vim-engine';
import { t } from '../../i18n';
import './QuickfixPanel.css';

export interface QuickfixPanelProps {
  type: 'quickfix' | 'locationList';
  state: QuickfixState;
  onJump: (index: number) => void;
  onClose: () => void;
}

/**
 * Vim 순정 분할 창(Split Window) 스타일의 퀵픽스/로케이션 리스트 패널
 * (:copen, :cclose, :lopen, :lclose, :cn, :cp, :lne, :lp)
 */
export const QuickfixPanel: React.FC<QuickfixPanelProps> = ({
  type,
  state,
  onJump,
  onClose,
}) => {
  const isQuickfix = type === 'quickfix';
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  // 현재 인덱스가 변경되거나 창이 열릴 때 활성 항목으로 자동 스크롤
  useEffect(() => {
    if (activeItemRef.current && typeof activeItemRef.current.scrollIntoView === 'function') {
      activeItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [state.currentIndex, state.isOpen]);

  const rowHeight = 24;
  const lineCount = state.height ?? 6;
  const bodyHeight = `${Math.max(2, lineCount) * rowHeight}px`;
  const maxHeight = `${Math.max(lineCount, 12) * rowHeight}px`;

  const totalCount = state.items.length;
  const currentItem = state.items[state.currentIndex];
  const currentFilename = currentItem?.filename ? `${currentItem.filename} ` : '';
  const currentDisplayIdx = totalCount > 0 ? state.currentIndex + 1 : 0;

  return (
    <div
      className={`quickfix-window-container ${!isQuickfix ? 'location-list-container' : ''}`}
      data-testid={isQuickfix ? 'quickfix-window' : 'locationlist-window'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Vim 분할 창 상태라인 헤더 */}
      <div className="quickfix-window-header">
        <div className="quickfix-window-title-group">
          <span className="quickfix-window-badge">
            {isQuickfix ? 'QUICKFIX' : 'LOCLIST'}
          </span>
          <span className="quickfix-window-title">
            {isQuickfix ? '[Quickfix List]' : '[Location List]'} {currentFilename}({currentDisplayIdx} of {totalCount})
          </span>
        </div>
        <span className="quickfix-window-hint">
          {isQuickfix
            ? t(':cn / :cp 이동 | 항목 클릭 시 점프 | :cclose 닫기')
            : t(':lne / :lp 이동 | 항목 클릭 시 점프 | :lclose 닫기')}
        </span>
        <div className="quickfix-window-actions">
          <button
            type="button"
            className="quickfix-window-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title={isQuickfix ? t('퀵픽스 닫기 (:cclose)') : t('로케이션 리스트 닫기 (:lclose)')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 퀵픽스/로케이션 리스트 항목 본문 */}
      <div
        className="quickfix-window-body"
        style={{ height: bodyHeight, maxHeight }}
      >
        {totalCount === 0 ? (
          <div className="quickfix-empty-hint">
            {isQuickfix
              ? t('에러 목록이 비어 있습니다. (:cfile 또는 :vimgrep으로 추가)')
              : t('로케이션 목록이 비어 있습니다. (:lvimgrep으로 추가)')}
          </div>
        ) : (
          state.items.map((item, idx) => {
            const isActive = idx === state.currentIndex;
            return (
              <div
                key={idx}
                ref={isActive ? activeItemRef : undefined}
                className={`quickfix-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onJump(idx);
                }}
                data-testid={`${type}-item-${idx + 1}`}
              >
                <span className="quickfix-item-indicator">{isActive ? '▶' : ' '}</span>
                <span className="quickfix-item-num">{idx + 1}</span>
                <span className="quickfix-item-sep">|</span>
                <span className="quickfix-item-loc">
                  {item.filename}:{item.line}:{item.col}
                </span>
                {item.type && (
                  <span
                    className={`quickfix-type-badge badge-${
                      item.type === 'E' ? 'error' : item.type === 'W' ? 'warning' : 'info'
                    }`}
                  >
                    [{item.type}]
                  </span>
                )}
                <span className="quickfix-item-sep">|</span>
                <span className="quickfix-item-text">{item.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
