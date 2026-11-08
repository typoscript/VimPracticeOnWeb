import React, { useState, useEffect } from 'react';
import {
  CustomMissionData,
  buildChallengeUrl,
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

export const CustomMissionModal: React.FC<CustomMissionModalProps> = ({
  isOpen,
  onClose,
  onPlayMission,
}) => {
  const [title, setTitle] = useState(t('함수 화살표 문법 리팩토링'));
  const [description, setDescription] = useState(t('일반 함수를 화살표 함수 및 템플릿 리터럴로 변환하세요.'));
  const [initialText, setInitialText] = useState(DEFAULT_INITIAL_TEXT);
  const [targetText, setTargetText] = useState(DEFAULT_TARGET_TEXT);
  const [par, setPar] = useState(30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
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

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy challenge URL:', e);
    }
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
            </div>
          </div>
        </div>

        <footer className="custom-modal-footer">
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
        </footer>
      </div>
    </div>
  );
};
