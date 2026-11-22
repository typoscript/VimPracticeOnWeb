import React from 'react';
import { VimMode, WildmenuState } from '../../vim-engine';
import { t } from '../../i18n';
import './NoiceCmdline.css';

export interface NoiceCmdlineProps {
  mode: VimMode;
  commandType?: ':' | '/' | '?' | '=';
  commandBuffer?: string;
  commandCursorCol?: number;
  wildmenu?: WildmenuState | null;
  onSelectWildmenuCandidate?: (index: number) => void;
}

/**
 * noice.nvim 스타일 에디터 상단 중앙 플로팅 커맨드라인 팝업 (:set cmdlinepopup / :set noice)
 */
export const NoiceCmdline: React.FC<NoiceCmdlineProps> = ({
  mode,
  commandType,
  commandBuffer = '',
  commandCursorCol,
  wildmenu,
  onSelectWildmenuCandidate,
}) => {
  if (mode !== 'COMMAND' && mode !== 'SEARCH') return null;

  const prefix = commandType ?? (mode === 'COMMAND' ? ':' : '/');
  const col =
    commandCursorCol !== undefined
      ? Math.max(0, Math.min(commandBuffer.length, commandCursorCol))
      : commandBuffer.length;

  const kindMeta =
    prefix === '/'
      ? { icon: '🔍', label: t('Search Down'), cls: 'search' }
      : prefix === '?'
        ? { icon: '🔎', label: t('Search Up'), cls: 'search' }
        : prefix === '='
          ? { icon: '🧮', label: t('Expression'), cls: 'expr' }
          : { icon: '⚡', label: t('Cmdline'), cls: 'cmd' };

  return (
    <div className="noice-cmdline-overlay" data-testid="noice-cmdline-popup">
      <div className={`noice-cmdline-box kind-${kindMeta.cls}`}>
        <div className="noice-cmdline-header">
          <span className="noice-cmdline-badge">
            {kindMeta.icon} {kindMeta.label}
          </span>
          <span className="noice-cmdline-hint">noice.nvim · Enter / Tab / Esc</span>
        </div>

        <div className="noice-cmdline-input-row">
          <span className="noice-cmdline-prefix">{prefix}</span>
          <span className="noice-cmdline-text" data-testid="noice-cmdline-text">
            {col < commandBuffer.length ? (
              <>
                {commandBuffer.slice(0, col)}
                <span className="noice-cmdline-cursor">{commandBuffer[col]}</span>
                {commandBuffer.slice(col + 1)}
              </>
            ) : (
              <>
                {commandBuffer}
                <span className="noice-cmdline-cursor">_</span>
              </>
            )}
          </span>
        </div>

        {wildmenu?.active && wildmenu.candidates.length > 0 && (
          <div className="noice-wildmenu-list" data-testid="noice-wildmenu-list">
            {wildmenu.candidates.slice(0, 8).map((cand, idx) => {
              const isSelected = idx === wildmenu.selectedIndex;
              return (
                <button
                  key={`${cand}-${idx}`}
                  type="button"
                  className={`noice-wildmenu-item ${isSelected ? 'selected' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelectWildmenuCandidate?.(idx)}
                >
                  {cand}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NoiceCmdline;
