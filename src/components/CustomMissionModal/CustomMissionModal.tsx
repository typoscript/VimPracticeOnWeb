import React, { useState, useEffect } from 'react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  CustomMissionData,
  CUSTOM_MISSION_PRESETS,
  SavedCustomMission,
  buildChallengeUrl,
  deleteSavedCustomMission,
  exportCustomMissionJson,
  loadSavedCustomMissions,
  parseCustomMissionInput,
  saveCustomMission,
} from '../../utils/customMission';
import './CustomMissionModal.css';
import { t } from '../../i18n';

export interface CustomMissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayMission: (data: CustomMissionData) => void;
}

const DEFAULT_INITIAL_TEXT = `function greet(name) {
  console.log("Hello, " + name);
}`;

const DEFAULT_TARGET_TEXT = `const greet = (name: string): string => {
  return \`Hello, \${name}!\`;
};`;

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  isOpen,
  onClose,
  onPlayMission,
}) => {
  useEscapeToClose(isOpen, onClose);
  const [title, setTitle] = useState(t('함수 화살표 문법 리팩토링'));
  const [description, setDescription] = useState(t('일반 함수를 화살표 함수 및 템플릿 리터럴로 변환하세요.'));
  const [initialText, setInitialText] = useState(DEFAULT_INITIAL_TEXT);
  const [targetText, setTargetText] = useState(DEFAULT_TARGET_TEXT);
  const [par, setPar] = useState(30);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [savedMissions, setSavedMissions] = useState<SavedCustomMission[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSavedMissions(loadSavedCustomMissions());
    } else {
      setCopied(false);
      setCopiedJson(false);
      setSaveNotice(false);
      setImportFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMissionData: CustomMissionData = {
    title: title.trim() || t('커스텀 Vim Golf 미션'),
    description: description.trim() || t('목표 코드를 완성하세요.'),
    initialText,
    targetText,
    par: par > 0 ? par : 10,
  };

  const shareUrl = buildChallengeUrl(currentMissionData);

  const applyMissionData = (data: CustomMissionData, savedId: string | null = null) => {
    setTitle(data.title);
    setDescription(data.description);
    setInitialText(data.initialText);
    setTargetText(data.targetText);
    setPar(data.par > 0 ? data.par : 10);
    setEditingId(savedId);
  };

  const handleCopyLink = async () => {
    try {
      await copyTextToClipboard(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy challenge URL:', e);
    }
  };

  const handleCopyJson = async () => {
    try {
      await copyTextToClipboard(exportCustomMissionJson(currentMissionData));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);
    } catch (e) {
      console.error('Failed to copy custom mission JSON:', e);
    }
  };

  const handleImportMission = () => {
    const parsed = parseCustomMissionInput(importInput);
    if (!parsed) {
      setImportFeedback({
        type: 'error',
        text: t('올바른 공유 URL, 토큰 또는 JSON 형식이 아닙니다.'),
      });
      return;
    }
    applyMissionData(parsed);
    setImportInput('');
    setImportFeedback({
      type: 'ok',
      text: t('미션을 성공적으로 불러왔습니다!'),
    });
  };

  const handleSaveToLibrary = () => {
    const next = saveCustomMission(currentMissionData, editingId ?? undefined);
    setSavedMissions(next);
    if (next.length > 0) setEditingId(next[0].id);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2000);
  };

  const handleDeleteSaved = (id: string) => {
    const next = deleteSavedCustomMission(id);
    setSavedMissions(next);
    if (editingId === id) setEditingId(null);
  };

  const handlePlayNow = () => {
    if (!initialText && !targetText) return;
    onPlayMission(currentMissionData);
    onClose();
  };

  return (
    <div
      className="custom-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="custom-mission-modal"
    >
      <div className="custom-modal-content">
        <header className="custom-modal-header">
          <div className="custom-modal-title-area">
            <span className="custom-modal-icon">⛳</span>
            <h2>{t('커스텀 Vim Golf 미션 생성기')}</h2>
          </div>
          <button
            className="custom-modal-close-btn"
            onClick={onClose}
            aria-label={t('모달 닫기')}
            data-testid="close-custom-modal-btn"
          >
            ✕
          </button>
        </header>

        <p className="custom-modal-desc">
          {t('자신만의 Vim Golf 문제를 만들고 URL 링크 하나로 친구나 동료에게 공유해 보세요. 서버 저장 없이 링크 파라미터(`?challenge=...`)에 모든 데이터가 안전하게 인코딩됩니다.')}
        </p>

        <div className="custom-modal-body">
          <div className="custom-presets-section">
            <span className="custom-section-label">{t('✨ 빠른 시작 프리셋')}</span>
            <div className="custom-presets-list">
              {CUSTOM_MISSION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-chip-btn"
                  onClick={() => applyMissionData(preset.data)}
                  data-testid={`preset-btn-${preset.id}`}
                >
                  <span className="preset-badge">{preset.badge}</span>
                  <span>{preset.data.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="custom-import-section">
            <label htmlFor="mission-import-input" className="custom-section-label">
              {t('📥 공유 URL · 토큰 · JSON 불러오기')}
            </label>
            <div className="custom-import-row">
              <input
                id="mission-import-input"
                type="text"
                value={importInput}
                onChange={(e) => {
                  setImportInput(e.target.value);
                  if (importFeedback) setImportFeedback(null);
                }}
                placeholder={t('?challenge=... 링크, 인코딩 토큰 또는 JSON을 붙여넣으세요')}
                data-testid="custom-import-input"
              />
              <button
                type="button"
                className="import-apply-btn"
                onClick={handleImportMission}
                data-testid="custom-import-btn"
              >
                {t('불러오기')}
              </button>
            </div>
            {importFeedback && (
              <p
                className={`custom-import-feedback ${importFeedback.type}`}
                data-testid="custom-import-feedback"
              >
                {importFeedback.text}
              </p>
            )}
          </div>

          <div className="custom-form-row">
            <div className="custom-form-group flex-2">
              <label htmlFor="mission-title">{t('미션 제목')}</label>
              <input
                id="mission-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('예: 괄호 정리하기')}
                data-testid="custom-input-title"
              />
            </div>
            <div className="custom-form-group flex-1">
              <label htmlFor="mission-par">{t('목표 타수 (Par)')}</label>
              <input
                id="mission-par"
                type="number"
                min="1"
                max="999"
                value={par}
                onChange={(e) => setPar(Math.max(1, parseInt(e.target.value, 10) || 1))}
                data-testid="custom-input-par"
              />
            </div>
          </div>

          <div className="custom-form-group">
            <label htmlFor="mission-description">{t('미션 설명')}</label>
            <input
              id="mission-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('예: ci( 명령어를 활용해 내부 파라미터를 교체하세요.')}
              data-testid="custom-input-description"
            />
          </div>

          <div className="custom-form-row code-areas">
            <div className="custom-form-group flex-1">
              <label htmlFor="initial-text">{t('초기 코드 (시작 상태)')}</label>
              <textarea
                id="initial-text"
                rows={7}
                value={initialText}
                onChange={(e) => setInitialText(e.target.value)}
                placeholder={t('도전자에게 처음 주어질 코드를 입력하세요.')}
                spellCheck={false}
                data-testid="custom-input-initial-text"
              />
            </div>
            <div className="custom-form-group flex-1">
              <label htmlFor="target-text">{t('목표 코드 (최종 상태)')}</label>
              <textarea
                id="target-text"
                rows={7}
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                placeholder={t('완성해야 할 목표 코드를 입력하세요.')}
                spellCheck={false}
                data-testid="custom-input-target-text"
              />
            </div>
          </div>

          <div className="share-link-box">
            <div className="share-link-header">
              <span className="share-link-label">{t('🔗 생성된 공유 링크:')}</span>
              <span className="share-link-meta">{shareUrl.length} bytes</span>
            </div>
            <div className="share-link-input-wrapper">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="share-link-input"
                data-testid="share-url-input"
              />
              <button
                className={`copy-link-btn ${copied ? 'copied' : ''}`}
                onClick={handleCopyLink}
                data-testid="copy-link-btn"
              >
                {copied ? t('✅ 복사 완료!') : t('📋 도전 링크 복사')}
              </button>
              <button
                type="button"
                className={`copy-json-btn ${copiedJson ? 'copied' : ''}`}
                onClick={handleCopyJson}
                data-testid="copy-json-btn"
              >
                {copiedJson ? t('✅ JSON 복사됨!') : t('📄 JSON 복사')}
              </button>
            </div>
          </div>

          <div className="custom-library-section" data-testid="custom-library-section">
            <div className="custom-library-header">
              <span className="custom-section-label">
                {t('📚 저장된 내 미션 ({n})', { n: savedMissions.length })}
              </span>
            </div>
            {savedMissions.length === 0 ? (
              <p className="custom-library-empty">
                {t('저장된 커스텀 미션이 아직 없습니다. 아래 [라이브러리 저장]으로 보관해 보세요.')}
              </p>
            ) : (
              <ul className="custom-library-list">
                {savedMissions.map((item) => (
                  <li
                    key={item.id}
                    className={`custom-library-item ${editingId === item.id ? 'active' : ''}`}
                    data-testid={`saved-mission-${item.id}`}
                  >
                    <div className="custom-library-info">
                      <span className="custom-library-title">{item.data.title}</span>
                      <span className="custom-library-par">Par {item.data.par}</span>
                    </div>
                    <div className="custom-library-actions">
                      <button
                        type="button"
                        className="lib-btn"
                        onClick={() => applyMissionData(item.data, item.id)}
                        data-testid={`load-saved-${item.id}`}
                      >
                        {t('편집')}
                      </button>
                      <button
                        type="button"
                        className="lib-btn play"
                        onClick={() => {
                          onPlayMission(item.data);
                          onClose();
                        }}
                        data-testid={`play-saved-${item.id}`}
                      >
                        {t('플레이')}
                      </button>
                      <button
                        type="button"
                        className="lib-btn danger"
                        onClick={() => handleDeleteSaved(item.id)}
                        data-testid={`delete-saved-${item.id}`}
                      >
                        {t('삭제')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="custom-modal-footer">
          <button
            type="button"
            className={`save-library-btn ${saveNotice ? 'saved' : ''}`}
            onClick={handleSaveToLibrary}
            data-testid="save-custom-mission-btn"
          >
            {saveNotice ? t('✅ 저장됨!') : t('💾 라이브러리 저장')}
          </button>
          <div className="custom-footer-right">
            <button className="cancel-btn" onClick={onClose}>
              {t('취소')}
            </button>
            <button
              className="play-now-btn"
              onClick={handlePlayNow}
              data-testid="play-custom-mission-btn"
            >
              {t('🚀 지금 바로 플레이')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
