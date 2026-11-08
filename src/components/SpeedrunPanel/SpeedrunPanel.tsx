import React from 'react';
import { SpeedrunRecord } from '../../utils/storage';
import './SpeedrunPanel.css';
import { t } from '../../i18n';

export interface SpeedrunPanelProps {
  status: 'ready' | 'running' | 'completed';
  currentStageIndex: number;
  totalStages: number;
  currentMissionTitle?: string;
  elapsedSeconds: number;
  totalKeystrokes: number;
  bestRecord: SpeedrunRecord | null;
  isNewRecord?: boolean;
  onStart: () => void;
  onRestart: () => void;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  const padMins = String(mins).padStart(2, '0');
  const padSecs = Number(secs) < 10 ? `0${secs}` : secs;
  return `${padMins}:${padSecs}`;
}

export const SpeedrunPanel: React.FC<SpeedrunPanelProps> = ({
  status,
  currentStageIndex,
  totalStages,
  currentMissionTitle,
  elapsedSeconds,
  totalKeystrokes,
  bestRecord,
  isNewRecord = false,
  onStart,
  onRestart,
}) => {
  return (
    <div className="speedrun-panel" data-testid="speedrun-panel">
      <div className="speedrun-header">
        <div className="speedrun-header-left">
          <span className="speedrun-badge">⚡ SPEEDRUN MODE</span>
          <span className="speedrun-desc">
            {t('무작위 5개 Vim 편집 미션을 최단 시간 & 최소 타수로 연속 격파하세요!')}
          </span>
        </div>

        {bestRecord && (
          <div className="speedrun-best-badge" data-testid="speedrun-best-badge">
            <span className="best-icon">🏆</span>
            <span className="best-label">{t('역대 최고:')}</span>
            <span className="best-val">{formatTime(bestRecord.bestTimeSeconds)} {t('({n}타)', { n: bestRecord.minKeystrokes })}</span>
          </div>
        )}
      </div>

      {status === 'ready' && (
        <div className="speedrun-start-view" data-testid="speedrun-ready-view">
          <div className="speedrun-rules">
            <div className="rule-item">🏁 <strong>{t('5개 스테이지')}</strong>{t(': 다양한 Vim 리팩토링 미션이 무작위로 출제됩니다.')}</div>
            <div className="rule-item">⏱ <strong>{t('타이머 연동')}</strong>{t(': 시작 버튼을 누르면 시간이 측정되며, 미션 완료 시 즉시 다음 단계로 넘어갑니다.')}</div>
            <div className="rule-item">🎯 <strong>{t('Vim Golf 랭킹')}</strong>{t(': 총 소요 시간과 총 입력 타수가 합산되어 최고 기록이 영구 저장됩니다.')}</div>
          </div>
          <button
            type="button"
            className="speedrun-action-btn start-btn"
            onClick={onStart}
            data-testid="speedrun-start-btn"
          >
            {t('🚀 스피드런 챌린지 시작하기')}
          </button>
        </div>
      )}

      {status === 'running' && (
        <div className="speedrun-live-view" data-testid="speedrun-live-view">
          <div className="live-stats">
            <div className="stat-card stage-card">
              <span className="stat-label">STAGE</span>
              <span className="stat-value" data-testid="speedrun-stage-indicator">
                {currentStageIndex + 1} / {totalStages}
              </span>
            </div>
            <div className="stat-card timer-card">
              <span className="stat-label">TIME</span>
              <span className="stat-value" data-testid="speedrun-timer">
                ⏱ {formatTime(elapsedSeconds)}
              </span>
            </div>
            <div className="stat-card keystroke-card">
              <span className="stat-label">KEYSTROKES</span>
              <span className="stat-value" data-testid="speedrun-keystrokes">
                {t('🎯 {n}타', { n: totalKeystrokes })}
              </span>
            </div>
          </div>

          <div className="live-stage-info">
            <span className="stage-tag">{t('현재 목표')}</span>
            <span className="stage-title">{currentMissionTitle ?? t('미션 로딩 중...')}</span>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="speedrun-completed-view" data-testid="speedrun-completed-view">
          <div className="completed-banner">
            <span className="banner-icon">🎉</span>
            <h2 className="banner-title">{t('스피드런 챌린지 올 클리어!')}</h2>
            {isNewRecord && (
              <span className="new-record-pill" data-testid="speedrun-new-record">
                {t('✨ NEW RECORD! 역대 최고 기록 경신!')}
              </span>
            )}
          </div>

          <div className="completed-results">
            <div className="result-metric">
              <span className="metric-label">{t('총 소요 시간')}</span>
              <span className="metric-val time" data-testid="final-time">
                ⏱ {formatTime(elapsedSeconds)}
              </span>
            </div>
            <div className="result-metric">
              <span className="metric-label">{t('총 입력 타수')}</span>
              <span className="metric-val keys" data-testid="final-keystrokes">
                {t('🎯 {n}타', { n: totalKeystrokes })}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="speedrun-action-btn restart-btn"
            onClick={onRestart}
            data-testid="speedrun-restart-btn"
          >
            {t('🔄 새로운 5개 미션 재도전하기')}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpeedrunPanel;
