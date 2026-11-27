import React, { useState } from 'react';
import { Mission } from '../../types/mission';
import type { VirtualTestRunResult } from '../../vim-engine';
import './MissionPanel.css';
import { t } from '../../i18n';

export interface MissionPanelProps {
  mission: Mission;
  missionIndex: number;
  totalMissions: number;
  isCompleted: boolean;
  keystrokeCount: number;
  onSelectMission: (index: number) => void;
  onResetMission: () => void;
  onStartGhostReplay?: () => void;
  onStopGhostReplay?: () => void;
  isGhostReplaying?: boolean;
  ghostReplayProgress?: { current: number; total: number };
  onOpenGolfCompare?: () => void;
  lastTestRun?: VirtualTestRunResult | null;
  activeFilename?: string;
  onRunVirtualTests?: () => void;
  onOpenCapstoneFile?: (filename: string) => void;
}

/**
 * 목표 타수(Par) 대비 현재 타수를 기반으로 별점과 평가 문구를 계산합니다.
 */
export function calculateStars(
  keystrokeCount: number,
  par: number
): { stars: string; ratingText: string; starCount: number } {
  if (keystrokeCount <= par) {
    return { stars: '★★★', ratingText: t('완벽한 최적 타수 (Vim Master)!'), starCount: 3 };
  }
  if (keystrokeCount <= Math.ceil(par * 1.5)) {
    return { stars: '★★☆', ratingText: t('우수한 타수 (Good)!'), starCount: 2 };
  }
  return { stars: '★☆☆', ratingText: t('클리어 완료 (Pass)!'), starCount: 1 };
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  mission,
  missionIndex,
  totalMissions,
  isCompleted,
  keystrokeCount,
  onSelectMission,
  onResetMission,
  onStartGhostReplay,
  onStopGhostReplay,
  isGhostReplaying,
  ghostReplayProgress,
  onOpenGolfCompare,
  lastTestRun,
  activeFilename,
  onRunVirtualTests,
  onOpenCapstoneFile,
}) => {
  const [showHint, setShowHint] = useState(false);

  const hasPrev = missionIndex > 0;
  const hasNext = missionIndex < totalMissions - 1;
  const rating = calculateStars(keystrokeCount, mission.par);

  return (
    <aside className="mission-panel" data-testid="mission-panel">
      <div className="mission-header">
        <div className="mission-badge-group">
          <span className="mission-step-badge">
            MISSION {missionIndex + 1} / {totalMissions}
          </span>
          <span className="mission-par-badge" data-testid="mission-par-badge">
            {t('타수:')} <strong className="stat-num">{keystrokeCount}</strong> {t('/ 목표(Par):')} <strong className="stat-num">{mission.par}</strong>
          </span>
          {isCompleted ? (
            <span className="mission-status-badge completed" data-testid="mission-completed-badge">
              {t('✓ 성공!')}
            </span>
          ) : (
            <span className="mission-status-badge in-progress">
              {t('진행 중')}
            </span>
          )}
        </div>

        <div className="mission-nav-controls">
          <button
            type="button"
            className="mission-nav-btn"
            disabled={!hasPrev}
            onClick={() => {
              setShowHint(false);
              onSelectMission(missionIndex - 1);
            }}
            aria-label="Previous mission"
          >
            {t('◀ 이전')}
          </button>
          <button
            type="button"
            className={`mission-nav-btn ${isCompleted && hasNext ? 'highlight' : ''}`}
            disabled={!hasNext}
            onClick={() => {
              setShowHint(false);
              onSelectMission(missionIndex + 1);
            }}
            aria-label="Next mission"
          >
            {t('다음 ▶')}
          </button>
        </div>
      </div>

      <h2 className="mission-title" data-testid="mission-title">
        {t(mission.title)}
      </h2>

      <p className="mission-desc" data-testid="mission-desc">
        {t(mission.description)}
      </p>

      {mission.initialVirtualTests && mission.initialVirtualTests.length > 0 && (
        <div className="capstone-test-suite" data-testid="capstone-test-suite">
          <div className="capstone-test-header">
            <span className="capstone-test-title">
              {t('🧪 실무 캡스톤 가상 테스트 ({passed}/{total})', {
                passed: lastTestRun?.passedCount ?? 0,
                total: lastTestRun?.totalCount ?? mission.initialVirtualTests.length,
              })}
            </span>
            {onRunVirtualTests && (
              <button
                type="button"
                className="capstone-test-run-btn"
                data-testid="capstone-test-run-btn"
                onClick={onRunVirtualTests}
              >
                {t('▶ :TestRun 테스트 실행')}
              </button>
            )}
          </div>

          {mission.initialVirtualFiles && onOpenCapstoneFile && (
            <div className="capstone-files-bar">
              <span className="capstone-meta-label">{t('프로젝트 파일:')}</span>
              {Object.keys(mission.initialVirtualFiles).map((fname) => (
                <button
                  key={fname}
                  type="button"
                  className={`capstone-file-chip ${activeFilename === fname ? 'active' : ''}`}
                  data-testid={`capstone-file-${fname}`}
                  onClick={() => onOpenCapstoneFile(fname)}
                >
                  {fname}
                </button>
              ))}
            </div>
          )}

          {mission.recommendedTools && mission.recommendedTools.length > 0 && (
            <div className="capstone-files-bar">
              <span className="capstone-meta-label">{t('추천 도구:')}</span>
              {mission.recommendedTools.map((tool) => (
                <span key={tool} className="capstone-rec-chip">
                  {tool}
                </span>
              ))}
            </div>
          )}

          <ul className="capstone-test-list">
            {(lastTestRun?.results ??
              mission.initialVirtualTests.map((s) => ({
                id: s.id,
                name: s.name,
                file: s.file,
                passed: false,
                reason: undefined as string | undefined,
              }))).map((item) => {
              const notRunYet = !lastTestRun || lastTestRun.runCount === 0;
              return (
                <li
                  key={item.id}
                  className={`capstone-test-item ${
                    notRunYet ? 'pending' : item.passed ? 'passed' : 'failed'
                  }`}
                  data-testid={`capstone-test-${item.id}`}
                >
                  <span className="test-status-icon">
                    {notRunYet ? '○' : item.passed ? '✓' : '✗'}
                  </span>
                  <span className="test-name">{item.name}</span>
                  <span className="test-file">({item.file})</span>
                  {!notRunYet && !item.passed && item.reason && (
                    <span className="test-reason">— {item.reason}</span>
                  )}
                  {notRunYet && <span className="test-pending-tag">{t('미실행')}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isGhostReplaying && ghostReplayProgress && onStopGhostReplay && (
        <div className="ghost-replay-banner" data-testid="ghost-replay-banner">
          <span className="ghost-replay-label">
            {t('🎬 최적 모범 답안 자동 재생 중... ({current}/{total}타)', { current: ghostReplayProgress.current, total: ghostReplayProgress.total })}
          </span>
          <button
            type="button"
            className="stop-replay-btn"
            onClick={onStopGhostReplay}
            data-testid="stop-optimal-replay-btn"
          >
            {t('⏹️ 재생 중지')}
          </button>
        </div>
      )}

      {isCompleted && !isGhostReplaying && (
        <div className="mission-success-banner" data-testid="mission-success-banner">
          <div className="mission-success-info">
            <span className="mission-success-title">{t('🎉 미션 클리어!')}</span>
            <div className="mission-rating-box" data-testid="mission-rating">
              <span className="rating-stars" data-testid="rating-stars">{rating.stars}</span>
              <span className="rating-text">{rating.ratingText}</span>
              <span className="rating-detail">
                {t('(기록: {n}타 / 기준 Par: {par}타)', { n: keystrokeCount, par: mission.par })}
              </span>
            </div>
            {mission.optimalKeys && mission.optimalKeys.length > 0 && (onStartGhostReplay || onOpenGolfCompare) && (
              <div className="optimal-replay-action">
                {onStartGhostReplay && (
                  <button
                    type="button"
                    className="optimal-replay-btn"
                    onClick={onStartGhostReplay}
                    data-testid="play-optimal-replay-btn"
                    title={t('3성(Par) 기준 최적 모범 타수 자동 재생 보기')}
                  >
                    {t('✨ 최적 타수(Par) 모범 답안 보기 ({n}타)', { n: mission.optimalKeys.length })}
                  </button>
                )}
                {onOpenGolfCompare && (
                  <button
                    type="button"
                    className="golf-compare-btn"
                    onClick={onOpenGolfCompare}
                    data-testid="open-golf-compare-btn"
                    title={t('내 풀이 키스트로크와 최적 해법을 프레임 단위로 1:1 비교')}
                  >
                    {t('⚔️ 내 풀이 vs 최적 해법 비교')}
                  </button>
                )}
              </div>
            )}
          </div>
          {hasNext && (
            <button
              type="button"
              className="next-lesson-btn"
              onClick={() => {
                setShowHint(false);
                onSelectMission(missionIndex + 1);
              }}
            >
              {t('다음 레슨 도전하기 ➔')}
            </button>
          )}
        </div>
      )}

      <div className="mission-footer">
        <button
          type="button"
          className="mission-hint-toggle"
          onClick={() => setShowHint((prev) => !prev)}
        >
          {showHint ? t('💡 힌트 접기') : t('💡 힌트 보기')}
        </button>

        <button
          type="button"
          className="mission-reset-btn"
          onClick={onResetMission}
          title={t('현재 미션을 처음 상태로 리셋합니다')}
        >
          {t('↺ 처음부터')}
        </button>
      </div>

      {showHint && (
        <div className="mission-hint-box" data-testid="mission-hint">
          {t(mission.hint)}
        </div>
      )}

      {mission.optimalKeys?.includes('Ctrl-w') && (
        <div className="mission-browser-key-note" data-testid="mission-ctrl-w-note">
          {t('⚠️ 브라우저에서 Ctrl+W 는 탭을 닫습니다. 이 레슨의 Ctrl-w 는 Alt+W 로 누르세요.')}
        </div>
      )}
    </aside>
  );
};

export default MissionPanel;
