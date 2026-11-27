import { useEffect, useMemo, useState } from 'react';
import { t, useLocale } from '../../i18n';
import { normalizeImeKey } from '../../utils/imeHelper';
import { isKeyReferenceShortcut } from '../../utils/keyReferenceShortcut';
import type { Mission } from '../../types/mission';
import {
  KEY_REFERENCE_CATEGORIES,
  KEY_REFERENCE_MODES,
  KeyReferenceEntry,
  KeyReferenceMode,
  findKeyReferenceEntry,
  keyNameFromEvent,
  keyReferenceModeFor,
} from './keyReferenceCatalog';
import { lessonsForKey } from './keyReferenceLessons';
import './KeyReferenceModal.css';

interface KeyReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 에디터의 현재 모드 — 창을 열 때 이 모드의 탭을 먼저 보여 줍니다 */
  editorMode?: string;
  /** "이 키 연습하기" 레슨 목록을 만들 레슨 데이터 */
  missions?: readonly Mission[];
  /** 레슨을 고르면 그 레슨으로 이동 */
  onSelectLesson?: (missionId: number) => void;
}

/** 이 모드에서 누른 키의 사전 항목 (노멀 모드의 Tab 은 Ctrl-i 와 같음) */
function lookup(name: string, mode: KeyReferenceMode): KeyReferenceEntry | undefined {
  return findKeyReferenceEntry(name, mode) ?? (mode === 'normal' && name === 'Tab' ? findKeyReferenceEntry('Ctrl-i') : undefined);
}

/**
 * Vim 키 사전: 창이 열린 상태에서 키를 누르면 고른 모드(노멀·비주얼·입력)에서 그 키가 하는 일을 보여 줍니다.
 * 접두 키(g, z, [, ], Ctrl-w, ", 연산자, Ctrl-x, Ctrl-r)는 이어지는 키 목록도, 그 키를 쓰는 레슨도 보여 줍니다.
 */
export function KeyReferenceModal({ isOpen, onClose, editorMode, missions, onSelectLesson }: KeyReferenceModalProps) {
  const locale = useLocale();
  const initialMode = keyReferenceModeFor(editorMode);
  const [mode, setMode] = useState<KeyReferenceMode>(initialMode);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [unknownKey, setUnknownKey] = useState<string | null>(null);

  // 창을 열 때마다 에디터의 현재 모드 탭에서 시작합니다.
  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setSelectedKey(null);
    setUnknownKey(null);
  }, [isOpen, initialMode]);

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
      const entry = lookup(name, mode);
      if (entry) {
        setSelectedKey(entry.key);
        setUnknownKey(null);
      } else {
        setUnknownKey(name);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, mode]);

  const modeInfo = KEY_REFERENCE_MODES.find((m) => m.id === mode) ?? KEY_REFERENCE_MODES[0];
  const grouped = useMemo(
    () =>
      KEY_REFERENCE_CATEGORIES.map((category) => ({
        category,
        entries: modeInfo.entries.filter((entry) => entry.category === category.id),
      })).filter((group) => group.entries.length > 0),
    [modeInfo]
  );

  const selected = selectedKey ? findKeyReferenceEntry(selectedKey, mode) : undefined;
  const lessons = useMemo(
    () => (selected && missions ? lessonsForKey(selected.key, missions, mode) : []),
    [selected, missions, mode]
  );

  if (!isOpen) return null;

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
              {t('키를 누르면 고른 모드에서 그 키가 하는 일을 보여 줍니다. 닫기: Esc 또는 Ctrl+/')}
            </p>
          </div>
          <button type="button" className="keyref-close-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </header>

        <div className="keyref-mode-tabs" role="tablist" aria-label={t('모드')}>
          {KEY_REFERENCE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === mode}
              className={`keyref-mode-tab${m.id === mode ? ' is-active' : ''}`}
              onClick={() => {
                setMode(m.id);
                setSelectedKey(null);
                setUnknownKey(null);
              }}
              data-testid={`key-reference-mode-${m.id}`}
            >
              {t('{mode} 모드', { mode: label(m) })}
            </button>
          ))}
        </div>

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
              {lessons.length > 0 && onSelectLesson && (
                <div className="keyref-lessons" data-testid="key-reference-lessons">
                  <span className="keyref-lessons-title">{t('이 키 연습하기')}</span>
                  {lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      className="keyref-lesson-btn"
                      onClick={() => {
                        onSelectLesson(lesson.id);
                        onClose();
                      }}
                      title={t(lesson.title)}
                      data-testid={`key-reference-lesson-${lesson.id}`}
                    >
                      {t(lesson.title)}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="keyref-detail-empty">
              {unknownKey
                ? t('{key} 키는 {mode} 모드에서 쓰지 않거나 사전에 없는 키입니다.', { key: unknownKey, mode: label(modeInfo) })
                : t('아무 키나 눌러 보세요 (예: w, d, g, Ctrl-w). 아래 목록에서 클릭해도 됩니다.')}
            </div>
          )}
          {selected && unknownKey && (
            <div className="keyref-detail-note">
              {t('{key} 키는 {mode} 모드에서 쓰지 않거나 사전에 없는 키입니다.', { key: unknownKey, mode: label(modeInfo) })}
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
