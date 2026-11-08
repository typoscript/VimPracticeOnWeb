import React, { useState, useEffect } from 'react';
import {
  analyzeAndGenerateBYOC,
  RefactoringRuleInfo,
} from '../../utils/byocGenerator';
import './BYOCModal.css';
import { t, localized } from '../../i18n';

export interface BYOCModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  onStartMission: (missionData: {
    title: string;
    description: string;
    initialText: string;
    targetText: string;
    par: number;
    hint: string;
  }) => void;
}

const DEMO_PRESETS: Array<{ label: string; code: string }> = localized([
  {
    label: 'TypeScript 레거시 함수',
    code: `function fetchUserData(user_id) {\n  var cache_token = 'auth_token';\n  console.log("Fetching user: " + user_id);\n  return { id: user_id, token: cache_token }\n}`,
  },
  {
    label: 'React 이벤트 핸들러',
    code: `var handleClick = function(event) {\n  var count = 0;\n  console.log('Button clicked:', event);\n  return count + 1\n}`,
  },
  {
    label: 'SQL 쿼리 빌더',
    code: `var query_str = 'SELECT user_id, user_email FROM users';\nconsole.log('Running query:', query_str);`,
  },
]);

export const BYOCModal: React.FC<BYOCModalProps> = ({
  isOpen,
  onClose,
  initialCode = '',
  onStartMission,
}) => {
  const [sourceCode, setSourceCode] = useState<string>(
    initialCode || DEMO_PRESETS[0].code
  );
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialCode && initialCode.trim()) {
        setSourceCode(initialCode.trim());
      } else {
        setSourceCode(DEMO_PRESETS[0].code);
      }
      setSelectedRuleId(null);
    }
  }, [isOpen, initialCode]);

  if (!isOpen) return null;

  const analysis = analyzeAndGenerateBYOC(sourceCode);
  const currentRule: RefactoringRuleInfo =
    analysis.detectedRules.find((r) => r.id === selectedRuleId) ||
    analysis.primaryRule;

  const handleStart = () => {
    onStartMission({
      title: currentRule.title,
      description: currentRule.description,
      initialText: sourceCode,
      targetText: currentRule.targetText,
      par: currentRule.estimatedPar,
      hint: currentRule.hint,
    });
    onClose();
  };

  return (
    <div className="byoc-modal-overlay" data-testid="byoc-modal-overlay">
      <div className="byoc-dialog" role="dialog" aria-modal="true">
        {/* 헤더 */}
        <header className="byoc-header">
          <div className="byoc-header-titles">
            <span className="byoc-badge">BYOC REFACTORING</span>
            <h2 className="byoc-title">{t('Bring Your Own Code 미션 생성기')}</h2>
          </div>
          <button
            className="byoc-close-btn"
            onClick={onClose}
            data-testid="byoc-close-btn"
            aria-label={t('닫기')}
          >
            ✕
          </button>
        </header>

        <div className="byoc-content">
          {/* 프리셋 버튼 바 */}
          <div className="byoc-presets-row">
            <span className="byoc-preset-label">{t('코드 프리셋:')}</span>
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="byoc-preset-btn"
                onClick={() => {
                  setSourceCode(preset.code);
                  setSelectedRuleId(null);
                }}
                data-testid={`byoc-preset-${preset.label}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* 소스 코드 입력 텍스트에어리어 */}
          <div className="byoc-input-section">
            <div className="byoc-input-header">
              <label htmlFor="byoc-code-textarea" className="byoc-label">
                {t('내 업무 코드 붙여넣기 (TypeScript, React, Java, SQL 등):')}
              </label>
              <span className="byoc-char-count">
                {t('{lines}줄 / {chars}자', { lines: sourceCode.split('\n').length, chars: sourceCode.length })}
              </span>
            </div>
            <textarea
              id="byoc-code-textarea"
              className="byoc-textarea"
              value={sourceCode}
              onChange={(e) => {
                setSourceCode(e.target.value);
                setSelectedRuleId(null);
              }}
              placeholder={t('여기에 리팩토링을 연습하고 싶은 실제 업무 코드를 붙여넣으세요...')}
              data-testid="byoc-code-textarea"
            />
          </div>

          {/* 감지된 리팩토링 규칙 탭 */}
          <div className="byoc-analysis-section">
            <div className="byoc-rules-label">
              {t('🔍 자동 감지된 리팩토링 규칙 ({n}개):', { n: analysis.detectedRules.length })}
            </div>
            <div className="byoc-rules-tabs" data-testid="byoc-rules-tabs">
              {analysis.detectedRules.map((rule) => {
                const isSelected = rule.id === currentRule.id;
                return (
                  <button
                    key={rule.id}
                    className={`byoc-rule-tab ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedRuleId(rule.id)}
                    data-testid={`byoc-rule-tab-${rule.id}`}
                  >
                    <span>{rule.title.split(':')[0]}</span>
                    <span className="rule-match-pill">{t('{n}건', { n: rule.matchCount })}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택된 규칙 카드 */}
            <div className="byoc-selected-rule-card" data-testid="byoc-selected-rule-card">
              <div className="rule-card-header">
                <span className="rule-card-title">{currentRule.title}</span>
                <span className="rule-card-par" data-testid="byoc-estimated-par">
                  {t('⭐ 추천 Par: {n}타', { n: currentRule.estimatedPar })}
                </span>
              </div>
              <p className="rule-card-desc">{currentRule.description}</p>
              <p className="rule-card-tip">
                💡 <strong>{t('추천 Vim 스킬:')}</strong> {currentRule.recommendedVimCommand}
                <br />
                {currentRule.hint}
              </p>
            </div>
          </div>

          {/* 원본 vs 목표 텍스트 미리보기 */}
          <div className="byoc-preview-comparison">
            <div className="preview-col">
              <span className="preview-title">{t('현재 원본 코드')}</span>
              <pre className="preview-box" data-testid="byoc-preview-initial">
                {sourceCode}
              </pre>
            </div>
            <div className="preview-col">
              <span className="preview-title">{t('목표 리팩토링 코드 (Target)')}</span>
              <pre className="preview-box target" data-testid="byoc-preview-target">
                {currentRule.targetText}
              </pre>
            </div>
          </div>
        </div>

        {/* 푸터 버튼 */}
        <footer className="byoc-footer">
          <button
            className="byoc-btn-cancel"
            onClick={onClose}
            data-testid="byoc-cancel-btn"
          >
            {t('취소')}
          </button>
          <button
            className="byoc-btn-play"
            onClick={handleStart}
            data-testid="byoc-start-btn"
          >
            {t('🚀 이 코드로 리팩토링 챌린지 시작')}
          </button>
        </footer>
      </div>
    </div>
  );
};
