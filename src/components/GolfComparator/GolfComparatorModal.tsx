import React, { useEffect, useMemo, useState } from 'react';
import { VimEditorState } from '../../vim-engine';
import {
  GolfReplayFrame,
  buildGolfReplayTrace,
  compareGolfRuns,
} from '../../utils/golfComparator';
import { t } from '../../i18n';
import './GolfComparatorModal.css';

export interface GolfComparatorModalProps {
  missionTitle: string;
  par: number;
  initialState: VimEditorState;
  userKeys: readonly string[];
  optimalKeys: readonly string[];
  onClose: () => void;
}

const SPEED_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '1x', ms: 420 },
  { label: '0.5x', ms: 800 },
  { label: '0.25x', ms: 1350 },
];

function renderMiniEditor(
  frame: GolfReplayFrame,
  testIdPrefix: string
): React.ReactNode {
  return (
    <div className="golf-mini-editor" data-testid={`${testIdPrefix}-editor`}>
      {frame.lines.map((lineText, lineIdx) => {
        const isCursorLine = frame.cursor.line === lineIdx;
        const isChanged = frame.changedLines.includes(lineIdx);
        const col = Math.min(frame.cursor.col, Math.max(0, lineText.length));
        const before = lineText.slice(0, col);
        const at = lineText[col] ?? ' ';
        const after = col < lineText.length ? lineText.slice(col + 1) : '';
        return (
          <div
            key={lineIdx}
            className={`golf-code-line ${isCursorLine ? 'active-line' : ''} ${
              isChanged ? 'changed-line' : ''
            }`}
          >
            <span className="golf-line-num">{lineIdx + 1}</span>
            <span className="golf-line-text">
              {isCursorLine ? (
                <>
                  {before}
                  <span
                    className={`golf-cursor ${
                      frame.mode === 'INSERT' ? 'insert' : 'normal'
                    }`}
                  >
                    {at}
                  </span>
                  {after}
                </>
              ) : (
                lineText || ' '
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 레슨 완료 후 내 풀이(userKeys)와 최적 모범 답안(optimalKeys)을 1:1 프레임 단위로 비교 재생하는 모달입니다.
 */
export const GolfComparatorModal: React.FC<GolfComparatorModalProps> = ({
  missionTitle,
  par,
  initialState,
  userKeys,
  optimalKeys,
  onClose,
}) => {
  const userTrace = useMemo(
    () => buildGolfReplayTrace(initialState, userKeys),
    [initialState, userKeys]
  );
  const optimalTrace = useMemo(
    () => buildGolfReplayTrace(initialState, optimalKeys),
    [initialState, optimalKeys]
  );
  const summary = useMemo(
    () => compareGolfRuns(userKeys, optimalKeys),
    [userKeys, optimalKeys]
  );

  const maxStep = Math.max(userTrace.length - 1, optimalTrace.length - 1);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    if (step >= maxStep) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStep((prev) => Math.min(maxStep, prev + 1));
    }, SPEED_OPTIONS[speedIdx].ms);
    return () => clearTimeout(timer);
  }, [isPlaying, step, maxStep, speedIdx]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        setIsPlaying(false);
        setStep((prev) => Math.min(maxStep, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        setIsPlaying(false);
        setStep((prev) => Math.max(0, prev - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => {
          if (!prev && step >= maxStep) {
            setStep(0);
          }
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maxStep, onClose, step]);

  const userFrame = userTrace[Math.min(step, userTrace.length - 1)];
  const optimalFrame = optimalTrace[Math.min(step, optimalTrace.length - 1)];
  const userFinished = step >= userTrace.length - 1;
  const optimalFinished = step >= optimalTrace.length - 1;

  return (
    <div
      className="golf-comparator-backdrop"
      data-testid="golf-comparator-modal"
      onClick={onClose}
    >
      <div
        className="golf-comparator-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('내 풀이 vs 최적 해법 1:1 비교')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="golf-comparator-header">
          <div>
            <h3>{t('⚔️ 내 풀이 vs 최적 해법 1:1 비교')}</h3>
            <p className="golf-comparator-subtitle">{t(missionTitle)}</p>
          </div>
          <button
            type="button"
            className="golf-close-btn"
            onClick={onClose}
            data-testid="golf-comparator-close-btn"
            aria-label={t('닫기')}
          >
            ✕
          </button>
        </div>

        {/* 요약 메트릭 배지 */}
        <div className="golf-summary-bar" data-testid="golf-summary-bar">
          <div className="golf-metric">
            <span className="golf-metric-label">{t('내 타수')}</span>
            <strong className="golf-metric-val">{summary.userKeystrokes}</strong>
          </div>
          <div className="golf-metric">
            <span className="golf-metric-label">{t('최적 해법 (Par {par})', { par })}</span>
            <strong className="golf-metric-val optimal">{summary.optimalKeystrokes}</strong>
          </div>
          <div className="golf-metric">
            <span className="golf-metric-label">{t('타수 차이')}</span>
            <strong
              className={`golf-metric-val ${summary.delta <= 0 ? 'perfect' : 'delta'}`}
            >
              {summary.delta <= 0
                ? t('🏆 최적 달성!')
                : t('+{n}타', { n: summary.delta })}
            </strong>
          </div>
          <div className="golf-metric">
            <span className="golf-metric-label">{t('효율도')}</span>
            <strong className="golf-metric-val">{summary.efficiencyPct}%</strong>
          </div>
          {summary.firstDivergenceStep !== null && (
            <button
              type="button"
              className="golf-divergence-btn"
              data-testid="golf-jump-divergence-btn"
              onClick={() => {
                setIsPlaying(false);
                setStep(summary.firstDivergenceStep!);
              }}
            >
              {t('🎯 첫 분기점 이동 (Step #{step})', {
                step: summary.firstDivergenceStep,
              })}
            </button>
          )}
        </div>

        {summary.userRedundantMotionStreaks > 0 && (
          <div className="golf-tip-banner" data-testid="golf-tip-banner">
            {t(
              '💡 팁: h/j/k/l 3연속 이동이 {n}회 감지되었습니다. 숫자 카운트([N]j/w/f)나 텍스트 객체를 쓰면 타수를 크게 줄일 수 있습니다.',
              { n: summary.userRedundantMotionStreaks }
            )}
          </div>
        )}

        {/* 재생 컨트롤 바 */}
        <div className="golf-controls-bar">
          <div className="golf-transport-btns">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setStep(0);
              }}
              data-testid="golf-step-start"
              title={t('처음으로')}
            >
              ⏮
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setStep((prev) => Math.max(0, prev - 1));
              }}
              disabled={step <= 0}
              data-testid="golf-step-prev"
              title={t('이전 스텝 (←)')}
            >
              ◀
            </button>
            <button
              type="button"
              className="golf-play-btn"
              onClick={() => {
                if (!isPlaying && step >= maxStep) {
                  setStep(0);
                }
                setIsPlaying((prev) => !prev);
              }}
              data-testid="golf-play-toggle"
            >
              {isPlaying ? t('⏸ 일시정지') : t('▶ 1:1 재생')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setStep((prev) => Math.min(maxStep, prev + 1));
              }}
              disabled={step >= maxStep}
              data-testid="golf-step-next"
              title={t('다음 스텝 (→)')}
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setStep(maxStep);
              }}
              data-testid="golf-step-end"
              title={t('마지막으로')}
            >
              ⏭
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={maxStep}
            value={step}
            onChange={(e) => {
              setIsPlaying(false);
              setStep(Number(e.target.value));
            }}
            className="golf-step-slider"
            data-testid="golf-step-slider"
            aria-label={t('리플레이 스텝 탐색')}
          />

          <span className="golf-step-counter" data-testid="golf-step-counter">
            Step {step} / {maxStep}
          </span>

          <div className="golf-speed-group">
            {SPEED_OPTIONS.map((opt, idx) => (
              <button
                key={opt.label}
                type="button"
                className={`golf-speed-btn ${speedIdx === idx ? 'active' : ''}`}
                onClick={() => setSpeedIdx(idx)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1:1 좌우 비교 에디터 */}
        <div className="golf-dual-grid">
          <div className="golf-pane user-pane">
            <div className="golf-pane-header">
              <span className="golf-pane-title">{t('👤 내 풀이')}</span>
              <span className="golf-pane-meta">
                {Math.min(step, userTrace.length - 1)} / {userTrace.length - 1} ·{' '}
                {userFrame.mode}
                {userFinished && <span className="golf-done-badge">{t('✓ 완료')}</span>}
              </span>
            </div>
            {renderMiniEditor(userFrame, 'golf-user')}
            <div className="golf-key-strip" data-testid="golf-user-keys">
              {userTrace.slice(1).map((f) => {
                const isCur = step === f.step;
                const isDiv = summary.firstDivergenceStep === f.step;
                return (
                  <button
                    key={f.step}
                    type="button"
                    className={`golf-key-chip ${isCur ? 'active' : ''} ${
                      f.step < step ? 'passed' : ''
                    } ${isDiv ? 'divergence' : ''}`}
                    onClick={() => {
                      setIsPlaying(false);
                      setStep(f.step);
                    }}
                  >
                    {f.displayKey}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="golf-pane optimal-pane">
            <div className="golf-pane-header">
              <span className="golf-pane-title">{t('✨ 최적 해법 (Par)')}</span>
              <span className="golf-pane-meta">
                {Math.min(step, optimalTrace.length - 1)} / {optimalTrace.length - 1} ·{' '}
                {optimalFrame.mode}
                {optimalFinished && <span className="golf-done-badge optimal">{t('✓ 완료')}</span>}
              </span>
            </div>
            {renderMiniEditor(optimalFrame, 'golf-optimal')}
            <div className="golf-key-strip" data-testid="golf-optimal-keys">
              {optimalTrace.slice(1).map((f) => {
                const isCur = step === f.step;
                const isDiv = summary.firstDivergenceStep === f.step;
                return (
                  <button
                    key={f.step}
                    type="button"
                    className={`golf-key-chip optimal ${isCur ? 'active' : ''} ${
                      f.step < step ? 'passed' : ''
                    } ${isDiv ? 'divergence' : ''}`}
                    onClick={() => {
                      setIsPlaying(false);
                      setStep(f.step);
                    }}
                  >
                    {f.displayKey}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GolfComparatorModal;
