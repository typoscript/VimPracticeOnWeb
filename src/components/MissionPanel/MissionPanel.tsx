import React, { useState } from 'react';
import { Mission } from '../../types/mission';
import './MissionPanel.css';

export interface MissionPanelProps {
  mission: Mission;
  missionIndex: number;
  totalMissions: number;
  isCompleted: boolean;
  onSelectMission: (index: number) => void;
  onResetMission: () => void;
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  mission,
  missionIndex,
  totalMissions,
  isCompleted,
  onSelectMission,
  onResetMission,
}) => {
  const [showHint, setShowHint] = useState(false);

  const hasPrev = missionIndex > 0;
  const hasNext = missionIndex < totalMissions - 1;

  return (
    <aside className="mission-panel" data-testid="mission-panel">
      <div className="mission-header">
        <div className="mission-badge-group">
          <span className="mission-step-badge">
            MISSION {missionIndex + 1} / {totalMissions}
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
          <span>🎉 미션을 성공했습니다! 다음 레슨으로 넘어가보세요.</span>
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
