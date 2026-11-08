import React, { useState, useCallback, useRef, useEffect } from 'react';
import { VimEditorState } from '../../vim-engine';
import {
  ActionTimelineStep,
  formatCommandLabel,
  getActionDescription,
  generateVitestReproductionCode,
} from '../../utils/actionTimeline';
import './ActionTimelinePanel.css';
import { t } from '../../i18n';

export interface ActionTimelinePanelProps {
  steps: ActionTimelineStep[];
  previewStepIndex: number | null;
  editorState: VimEditorState;
  missionTitle?: string;
  initialText: string;
  initialCursor: { line: number; col: number };
  allKeysSoFar: string[];
  onSelectStep: (stepIndex: number) => void;
  onBranchFromStep: (stepIndex: number) => void;
  onCancelPreview: () => void;
  onClose?: () => void;
}

export const ActionTimelinePanel: React.FC<ActionTimelinePanelProps> = ({
  steps,
  previewStepIndex,
  editorState,
  missionTitle,
  initialText,
  initialCursor,
  allKeysSoFar,
  onSelectStep,
  onBranchFromStep,
  onCancelPreview,
  onClose,
}) => {
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // 현재 활성 스텝 인덱스
  const activeStepIdx = previewStepIndex !== null ? previewStepIndex : steps.length - 1;
  const isPreviewing = previewStepIndex !== null && previewStepIndex < steps.length - 1;
  const currentPreviewStep = steps[activeStepIdx] || steps[0];

  // 새 스텝 추가 시 스크롤을 맨 우측으로 자동 이동
  useEffect(() => {
    if (previewStepIndex === null && timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = timelineScrollRef.current.scrollWidth;
    }
  }, [steps.length, previewStepIndex]);

  // Vitest 재현 코드 클립보드 복사
  const handleExportFailingTest = useCallback(() => {
    const testCode = generateVitestReproductionCode({
      missionTitle,
      initialText,
      initialCursor,
      allKeys: allKeysSoFar,
      currentState: editorState,
    });

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(testCode)
        .then(() => {
          setCopyToast(t('✅ Vitest 재현 코드가 클립보드에 복사되었습니다!'));
          setTimeout(() => setCopyToast(null), 3000);
        })
        .catch(() => {
          setCopyToast(t('⚠️ 클립보드 복사 실패 (보안 제한)'));
          setTimeout(() => setCopyToast(null), 3000);
        });
    } else {
      setCopyToast(t('⚠️ 클립보드 API를 지원하지 않는 브라우저입니다.'));
      setTimeout(() => setCopyToast(null), 3000);
    }
  }, [missionTitle, initialText, initialCursor, allKeysSoFar, editorState]);

  // X-Ray: 1. 대기 중인 명령 및 가이드 텍스트
  const getPendingGuide = () => {
    if (editorState.insertNormalSession) {
      return {
        badge: t('INSERT (normal) 모드'),
        guide: t('단 1회의 NORMAL 명령 실행 대기 중 (명령 완결 후 즉시 INSERT 모드로 복귀)'),
        isPending: true,
      };
    }
    if (editorState.completionSession) {
      const { prefix, selectedIndex, candidates } = editorState.completionSession;
      return {
        badge: t('인버퍼 자동완성 [{prefix}]', { prefix }),
        guide: t('후보 ({v}/{candidatesCount}): \'{v2}\' (Ctrl+n: 다음, Ctrl+p: 이전, Esc: 닫기)', { v: selectedIndex + 1, candidatesCount: candidates.length, v2: candidates[selectedIndex] }),
        isPending: true,
      };
    }

    const pk = editorState.pendingKeys;
    if (!pk) {
      if (editorState.mode === 'NORMAL') {
        return {
          badge: t('NORMAL 모드'),
          guide: t('새로운 Vim 명령 입력 대기 중 (h/j/k/l, w, dw, ciw 등)'),
          isPending: false,
        };
      }
      if (editorState.mode === 'INSERT') {
        return {
          badge: t('INSERT 모드'),
          guide: t('텍스트 입력 중 (Ctrl+w: 단어삭제, Ctrl+u: 줄시작삭제, Ctrl+n: 자동완성, <Esc>: 복귀)'),
          isPending: false,
        };
      }
      return {
        badge: t('{mode} 모드', { mode: editorState.mode }),
        guide: t('모드 동작 진행 중'),
        isPending: false,
      };
    }

    // Pending 명령 분석
    if (pk.endsWith('d') || pk.endsWith('c') || pk.endsWith('y')) {
      return {
        badge: t('명령 대기 [{pk}]', { pk }),
        guide: t('연산 대상 선택 대기 중 — 이동 키(w, $, e)나 텍스트 객체(iw, i", i()를 누르세요.'),
        isPending: true,
      };
    }
    if (pk.endsWith('f') || pk.endsWith('F') || pk.endsWith('t') || pk.endsWith('T')) {
      return {
        badge: t('탐색 대기 [{pk}]', { pk }),
        guide: t('찾고자 하는 대상 글자(예: a, ;, ", 괄호 등)를 이어서 누르세요.'),
        isPending: true,
      };
    }
    if (pk.startsWith('"')) {
      return {
        badge: t('레지스터 지정 [{pk}]', { pk }),
        guide: t('레지스터 {pk} 지정됨 — 이어서 y, d, c, p 연산자를 누르세요.', { pk }),
        isPending: true,
      };
    }
    if (/^\d+$/.test(pk)) {
      return {
        badge: t('반복 카운트 [{pk}]', { pk }),
        guide: t('{pk}회 반복 실행할 모션(w, j, l) 또는 연산자(d, c, y)를 누르세요.', { pk }),
        isPending: true,
      };
    }

    return {
      badge: t('대기 중 [{pk}]', { pk }),
      guide: t('이어서 명령 완결 키를 누르세요.'),
      isPending: true,
    };
  };

  const pendingInfo = getPendingGuide();

  // X-Ray: 2. 클립보드(기본 레지스터) 내용 미리보기
  const getClipboardPeek = () => {
    const clip = editorState.clipboard;
    if (!clip || !clip.content) {
      return {
        hasContent: false,
        preview: t('(비어 있음)'),
        typeStr: 'text',
        guide: t('복사(y)나 잘라내기(d)한 텍스트가 없습니다.'),
      };
    }

    const typeStr = clip.type === 'line' ? t('줄(line) 단위') : t('문자(char) 단위');
    const preview =
      clip.content.length > 25 ? `${clip.content.slice(0, 25)}...` : clip.content;

    return {
      hasContent: true,
      preview: `"${preview.replace(/\n/g, '↵')}"`,
      typeStr,
      guide: t('p 키를 누르면 커서 위치에 붙여넣어집니다.'),
    };
  };

  const clipInfo = getClipboardPeek();

  // X-Ray: 3. 점(.) 반복 명령 미리보기
  const getDotRepeatPeek = () => {
    const lastKeys = editorState.lastChangeKeys;
    if (!lastKeys || lastKeys.length === 0) {
      return {
        hasRepeat: false,
        cmdStr: t('(없음)'),
        desc: t('재실행할 이전 변경 작업이 없습니다.'),
      };
    }

    const cmdStr = formatCommandLabel(lastKeys);
    const desc = getActionDescription(lastKeys);

    return {
      hasRepeat: true,
      cmdStr,
      desc,
      guide: t('. 키를 누르면 이 작업이 즉시 재실행됩니다.'),
    };
  };

  const dotInfo = getDotRepeatPeek();

  // 스크러버 이전/다음 이동
  const handlePrevStep = () => {
    if (activeStepIdx > 0) {
      onSelectStep(activeStepIdx - 1);
    }
  };

  const handleNextStep = () => {
    if (activeStepIdx < steps.length - 1) {
      onSelectStep(activeStepIdx + 1);
    }
  };

  return (
    <div className="action-timeline-panel" data-testid="action-timeline-panel">
      {/* 1. 패널 헤더 */}
      <div className="timeline-header">
        <div className="timeline-title-area">
          <span className="timeline-icon">⏱️</span>
          <span className="timeline-title">{t('명령 복기 타임라인 & Vim X-Ray')}</span>
          <span className="step-counter-badge">
            {steps.length <= 1
              ? t('준비됨')
              : t('{activeStepIdx} / {v} 스텝', { activeStepIdx, v: steps.length - 1 })}
          </span>
        </div>

        <div className="timeline-header-actions">
          {/* 스텝 내비게이션 버튼 */}
          <div className="step-nav-buttons">
            <button
              className="step-nav-btn"
              onClick={handlePrevStep}
              disabled={activeStepIdx <= 0}
              title={t('이전 스텝 미리보기')}
              data-testid="timeline-prev-step-btn"
            >
              {t('◀ 이전')}
            </button>
            <button
              className="step-nav-btn"
              onClick={handleNextStep}
              disabled={activeStepIdx >= steps.length - 1}
              title={t('다음 스텝 미리보기')}
              data-testid="timeline-next-step-btn"
            >
              {t('다음 ▶')}
            </button>
          </div>

          {/* 원클릭 Vitest 버그 재현 코드 복사 버튼 */}
          <button
            className="export-test-btn"
            onClick={handleExportFailingTest}
            title={t('현재 상태를 Vitest 단위 테스트 it(...) 코드로 클립보드에 복사')}
            data-testid="export-test-btn"
          >
            {t('🐞 Vitest 재현 코드 복사')}
          </button>

          {onClose && (
            <button
              className="timeline-close-btn"
              onClick={onClose}
              title={t('패널 닫기')}
              data-testid="timeline-close-btn"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 2. 초보자용 Live Vim X-Ray 배지 영역 */}
      <div className="xray-badges-container" data-testid="xray-badges-container">
        {/* 배지 1: 대기 명령 및 가이드 */}
        <div
          className={`xray-badge pending-badge ${
            pendingInfo.isPending ? 'active-pending' : ''
          }`}
          data-testid="xray-pending-badge"
        >
          <div className="xray-badge-header">
            <span className="xray-badge-tag">{pendingInfo.badge}</span>
          </div>
          <div className="xray-badge-desc">{pendingInfo.guide}</div>
        </div>

        {/* 배지 2: 클립보드 미리보기 */}
        <div
          className={`xray-badge clip-badge ${clipInfo.hasContent ? 'has-content' : ''}`}
          data-testid="xray-clipboard-badge"
        >
          <div className="xray-badge-header">
            <span className="xray-badge-tag">{t('📋 클립보드')}</span>
            <span className="xray-badge-sub">{clipInfo.typeStr}</span>
          </div>
          <div className="xray-badge-desc">
            <span className="clip-preview-text">{clipInfo.preview}</span>
            <span className="clip-hint">{clipInfo.guide}</span>
          </div>
        </div>

        {/* 배지 3: 점(.) 반복 미리보기 */}
        <div
          className={`xray-badge dot-badge ${dotInfo.hasRepeat ? 'has-repeat' : ''}`}
          data-testid="xray-dot-badge"
        >
          <div className="xray-badge-header">
            <span className="xray-badge-tag">{t('🔄 점(.) 반복')}</span>
            {dotInfo.hasRepeat && (
              <span className="dot-cmd-chip">{dotInfo.cmdStr}</span>
            )}
          </div>
          <div className="xray-badge-desc">
            <span className="dot-desc-text">{dotInfo.desc}</span>
            {dotInfo.hasRepeat && (
              <span className="dot-hint">{dotInfo.guide}</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. 타임트래블 미리보기 안내 배너 (과거 스텝 선택 시 표시) */}
      {isPreviewing && (
        <div className="timeline-preview-banner" data-testid="timeline-preview-banner">
          <div className="preview-banner-text">
            <span className="preview-indicator">{t('⏪ 미리보기 중:')}</span>
            <strong> {t('스텝 #{n}', { n: activeStepIdx })}</strong> ({currentPreviewStep.command} —{' '}
            {currentPreviewStep.description})
          </div>
          <div className="preview-banner-actions">
            <button
              className="branch-resume-btn"
              onClick={() => onBranchFromStep(activeStepIdx)}
              data-testid="branch-resume-btn"
              title={t('이 시점의 상태로 되돌리고 이후 타수를 다시 입력합니다')}
            >
              {t('⏪ 이 시점부터 이어서 치기')}
            </button>
            <button
              className="cancel-preview-btn"
              onClick={onCancelPreview}
              data-testid="cancel-preview-btn"
              title={t('최신 현재 상태로 복귀')}
            >
              {t('▶ 최신 시점으로 복귀')}
            </button>
          </div>
        </div>
      )}

      {/* 4. 스텝 스크러버 타임라인 */}
      <div
        className="timeline-steps-track"
        ref={timelineScrollRef}
        data-testid="timeline-steps-track"
      >
        {steps.map((step, idx) => {
          const isSelected = activeStepIdx === idx;
          const isLatest = idx === steps.length - 1;

          return (
            <button
              key={`${step.stepIndex}-${step.command}-${idx}`}
              className={`timeline-step-chip ${isSelected ? 'selected' : ''} ${
                isLatest ? 'latest' : ''
              }`}
              onClick={() => onSelectStep(idx)}
              data-testid={`timeline-step-${idx}`}
              title={t('스텝 {idx}: {command} ({description})', { idx, command: step.command, description: step.description })}
            >
              <div className="step-chip-header">
                <span className="step-num-badge">#{idx}</span>
                <span className="step-cmd-label">{step.command}</span>
              </div>
              <div className="step-chip-desc">{step.description}</div>
              <div className="step-chip-footer">
                <span className="step-keystrokes">
                  {t('{n}타', { n: step.keystrokesSoFar })}
                </span>
                {isSelected && (
                  <span className="step-active-tag">
                    {isPreviewing ? t('미리보기') : t('현재')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 5. 토스트 알림 메시지 */}
      {copyToast && (
        <div className="timeline-toast" data-testid="timeline-toast">
          {copyToast}
        </div>
      )}
    </div>
  );
};
