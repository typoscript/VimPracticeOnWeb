import React from 'react';
import { VimEditorState } from '../../vim-engine';
import { t, useLocale } from '../../i18n';
import { resolveWhichKeyData } from './whichKeyCatalog';
import './WhichKeyPopup.css';

export interface WhichKeyPopupProps {
  editorState: VimEditorState;
  enabled: boolean;
  onPressKey?: (key: string) => void;
  onDisable?: () => void;
}

const CLICKABLE_KEY_RE = /^(?:.|Space|Ctrl-[a-z\]])$/;

export const WhichKeyPopup: React.FC<WhichKeyPopupProps> = ({
  editorState,
  enabled,
  onPressKey,
  onDisable,
}) => {
  const locale = useLocale();
  if (!enabled) return null;

  const data = resolveWhichKeyData(editorState);
  if (!data || data.items.length === 0) return null;

  const isEn = locale === 'en';
  const title = isEn ? data.titleEn : data.titleKo;

  return (
    <div
      className="which-key-popup"
      data-testid="which-key-popup"
      role="region"
      aria-label={t('Which-Key 단축키 가이드')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="which-key-header">
        <div className="which-key-title-group">
          <span className="which-key-prefix-badge" data-testid="which-key-prefix">
            {data.prefix}
          </span>
          <span className="which-key-title">{title}</span>
        </div>
        <div className="which-key-actions">
          <span className="which-key-esc-hint">{t('Esc 취소')}</span>
          {onDisable && (
            <button
              type="button"
              className="which-key-close-btn"
              data-testid="which-key-disable-btn"
              onClick={onDisable}
              title={t('Which-Key 팝업 끄기')}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="which-key-grid">
        {data.items.map((item) => {
          const clickable = Boolean(onPressKey && CLICKABLE_KEY_RE.test(item.key));
          const label = isEn ? item.labelEn : item.labelKo;
          return (
            <button
              key={`${data.prefix}-${item.key}`}
              type="button"
              className={`which-key-item ${item.group ? 'is-group' : ''} ${item.custom ? 'is-custom' : ''}`}
              data-testid={`which-key-item-${item.key}`}
              disabled={!clickable}
              onClick={() => {
                if (!clickable || !onPressKey) return;
                onPressKey(item.key === 'Space' ? ' ' : item.key);
              }}
            >
              <kbd className="which-key-keycap">{item.key}</kbd>
              <span className="which-key-arrow">➜</span>
              <span className="which-key-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
