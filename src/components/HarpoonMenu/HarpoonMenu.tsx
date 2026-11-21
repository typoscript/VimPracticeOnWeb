import React from 'react';
import { VimEditorState } from '../../vim-engine';
import { t } from '../../i18n';
import './HarpoonMenu.css';

export interface HarpoonMenuProps {
  editorState: VimEditorState;
  onPressKey: (key: string) => void;
}

/**
 * harpoon.nvim 스타일 빠른 파일 핀/전환 플로팅 팝업 (:HarpoonMenu)
 */
export const HarpoonMenu: React.FC<HarpoonMenuProps> = ({ editorState, onPressKey }) => {
  const menu = editorState.harpoonMenu;
  if (!menu?.isOpen) return null;

  const list = editorState.harpoonList ?? [];

  return (
    <div
      className="harpoon-menu-panel"
      data-testid="harpoon-menu-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="harpoon-menu-header">
        <span className="harpoon-menu-title">⚓ {t('Harpoon 빠른 파일 전환')}</span>
        <span className="harpoon-menu-count" data-testid="harpoon-menu-count">
          {list.length}
        </span>
        <button
          type="button"
          className="harpoon-menu-close"
          data-testid="harpoon-menu-close"
          onClick={() => onPressKey('Escape')}
          title={t('Harpoon 닫기')}
          tabIndex={-1}
        >
          ✕
        </button>
      </div>

      {list.length === 0 ? (
        <div className="harpoon-menu-empty" data-testid="harpoon-menu-empty">
          {t('고정된 파일이 없습니다. a 키로 현재 파일을 핀 등록하세요.')}
        </div>
      ) : (
        <div className="harpoon-menu-list">
          {list.map((filePath, idx) => {
            const isSelected = idx === menu.selectedIndex;
            const isCurrent = editorState.primaryFilename === filePath;
            return (
              <div
                key={filePath}
                className={`harpoon-menu-item ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
                data-testid={`harpoon-item-${idx + 1}`}
                onClick={() => onPressKey(String(idx + 1))}
              >
                <span className="harpoon-slot-badge">[{idx + 1}]</span>
                <span className="harpoon-file-path">{filePath}</span>
                {isCurrent && (
                  <span className="harpoon-current-badge">{t('현재 파일')}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="harpoon-menu-footer">
        {t('1-9 점프 · j/k 이동 · J/K 순서 · d 삭제 · a 현재 파일 추가 · Esc 닫기')}
      </div>
    </div>
  );
};
