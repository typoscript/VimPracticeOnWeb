import { useEffect, useMemo, useState } from 'react';
import { t, useLocale } from '../../i18n';
import { normalizeImeKey } from '../../utils/imeHelper';
import { isKeyReferenceShortcut } from '../../utils/keyReferenceShortcut';
import {
  KEY_REFERENCE_CATEGORIES,
  KEY_REFERENCE_ENTRIES,
  KeyReferenceEntry,
  findKeyReferenceEntry,
  keyNameFromEvent,
} from './keyReferenceCatalog';
import './KeyReferenceModal.css';

interface KeyReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Vim 키 사전: 창이 열린 상태에서 키를 누르면 그 키가 노멀 모드에서 하는 일을 보여 줍니다.
 * 접두 키(g, z, [, ], Ctrl-w, ", 연산자)는 이어지는 키 목록도 함께 보여 줍니다.
 */
export function KeyReferenceModal({ isOpen, onClose }: KeyReferenceModalProps) {
  const locale = useLocale();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [unknownKey, setUnknownKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isKeyReferenceShortcut(e) || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      const ime = normalizeImeKey(e, 'NORMAL');
      const name = keyNameFromEvent({ key: ime.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
      if (!name) return;
      e.preventDefault();
      e.stopPropagation();
      if (findKeyReferenceEntry(name)) {
        setSelectedKey(name);
        setUnknownKey(null);
      } else {
        setUnknownKey(name);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  const grouped = useMemo(
    () =>
      KEY_REFERENCE_CATEGORIES.map((category) => ({
        category,
        entries: KEY_REFERENCE_ENTRIES.filter((entry) => entry.category === category.id),
      })),
    []
  );

  if (!isOpen) return null;

  const selected = selectedKey ? findKeyReferenceEntry(selectedKey) : undefined;
  const label = (entry: { ko: string; en: string }) => (locale === 'en' ? entry.en : entry.ko);
  const categoryLabel = (entry: KeyReferenceEntry) => {
    const category = KEY_REFERENCE_CATEGORIES.find((c) => c.id === entry.category);
    return category ? label(category) : '';
  };

  return (
    <div className="keyref-backdrop" onClick={onClose} data-testid="key-reference-modal">
      <div
        className="keyref-content"
        role="dialog"
        aria-modal="true"
        aria-label={t('Vim 키 사전')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="keyref-header">
          <div>
            <h2 className="keyref-title">⌨️ {t('Vim 키 사전')}</h2>
            <p className="keyref-subtitle">
              {t('키를 누르면 노멀 모드에서 그 키가 하는 일을 보여 줍니다. 닫기: Esc 또는 Ctrl+/')}
            </p>
          </div>
          <button type="button" className="keyref-close-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </header>

        <section className="keyref-detail" aria-live="polite" data-testid="key-reference-detail">
          {selected ? (
            <>
              <div className="keyref-detail-main">
                <kbd className="keyref-detail-key">{selected.key}</kbd>
                <div>
                  <div className="keyref-detail-category">{categoryLabel(selected)}</div>
                  <div className="keyref-detail-desc">{label(selected)}</div>
                </div>
              </div>
              {selected.followUps && (
                <div className="keyref-followups">
                  <div className="keyref-followups-title">{t('이어서 누르는 키')}</div>
                  <ul className="keyref-followups-list">
                    {selected.followUps.map((item) => (
                      <li key={item.key} className={item.group ? 'is-group' : undefined}>
                        <kbd>{item.key}</kbd>
                        <span>{locale === 'en' ? item.labelEn : item.labelKo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="keyref-detail-empty">
              {unknownKey
                ? t('{key} 키는 노멀 모드에서 쓰지 않거나 사전에 없는 키입니다.', { key: unknownKey })
                : t('아무 키나 눌러 보세요 (예: w, d, g, Ctrl-w). 아래 목록에서 클릭해도 됩니다.')}
            </div>
          )}
          {selected && unknownKey && (
            <div className="keyref-detail-note">
              {t('{key} 키는 노멀 모드에서 쓰지 않거나 사전에 없는 키입니다.', { key: unknownKey })}
            </div>
          )}
        </section>

        <div className="keyref-groups">
          {grouped.map(({ category, entries }) => (
            <section key={category.id} className="keyref-group">
              <h3 className="keyref-group-title">{label(category)}</h3>
              <div className="keyref-key-grid">
                {entries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`keyref-key-btn${entry.key === selectedKey ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedKey(entry.key);
                      setUnknownKey(null);
                    }}
                    title={label(entry)}
                    data-testid={`key-reference-key-${entry.key}`}
                  >
                    <kbd>{entry.key}</kbd>
                    <span>{label(entry)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
