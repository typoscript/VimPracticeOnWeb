import React, { useState } from 'react';
import { Mission } from '../../types/mission';
import './MissionPanel.css';

export interface MissionPanelProps {
  mission: Mission;
  missionIndex: number;
  totalMissions: number;
  isCompleted: boolean;
  keystrokeCount: number;
  onSelectMission: (index: number) => void;
  onResetMission: () => void;
}

/**
 * 목표 타수(Par) 대비 현재 타수를 기반으로 별점과 평가 문구를 계산합니다.
 */
export function calculateStars(
  keystrokeCount: number,
  par: number
): { stars: string; ratingText: string; starCount: number } {
  if (keystrokeCount <= par) {
    return { stars: '★★★', ratingText: '완벽한 최적 타수 (Vim Master)!', starCount: 3 };
  }
  if (keystrokeCount <= Math.ceil(par * 1.5)) {
    return { stars: '★★☆', ratingText: '우수한 타수 (Good)!', starCount: 2 };
  }
  return { stars: '★☆☆', ratingText: '클리어 완료 (Pass)!', starCount: 1 };
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  mission,
  missionIndex,
  totalMissions,
  isCompleted,
  keystrokeCount,
  onSelectMission,
  onResetMission,
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
            타수: <strong className="stat-num">{keystrokeCount}</strong> / 목표(Par): <strong className="stat-num">{mission.par}</strong>
          </span>
          {isCompleted ? (
            <span className="mission-status-badge completed" data-testid="mission-completed-badge">
              ✓ 성공!
            </span>
          ) : (
            <span className="mission-status-badge in-progress">
              진행 중
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
            ◀ 이전
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
            다음 ▶
          </button>
        </div>
      </div>

      <h2 className="mission-title" data-testid="mission-title">
        {mission.title}
      </h2>

      <p className="mission-desc" data-testid="mission-desc">
        {mission.description}
      </p>

      {isCompleted && (
        <div className="mission-success-banner" data-testid="mission-success-banner">
          <div className="mission-success-info">
            <span className="mission-success-title">🎉 미션 클리어!</span>
            <div className="mission-rating-box" data-testid="mission-rating">
              <span className="rating-stars" data-testid="rating-stars">{rating.stars}</span>
              <span className="rating-text">{rating.ratingText}</span>
              <span className="rating-detail">
                (기록: {keystrokeCount}타 / 기준 Par: {mission.par}타)
              </span>
            </div>
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
              다음 레슨 도전하기 ➔
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
          {showHint ? '💡 힌트 접기' : '💡 힌트 보기'}
        </button>

        <button
          type="button"
          className="mission-reset-btn"
          onClick={onResetMission}
          title="현재 미션을 처음 상태로 리셋합니다"
        >
          ↺ 처음부터
        </button>
      </div>

      {showHint && (
        <div className="mission-hint-box" data-testid="mission-hint">
          {mission.hint}
        </div>
      )}
    </aside>
  );
};

export default MissionPanel;
