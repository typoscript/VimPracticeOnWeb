import React, { useEffect } from 'react';
import { Mission } from '../../types/mission';
import { LessonProgress } from '../../utils/storage';
import './LessonSelectModal.css';
import { t } from '../../i18n';

export interface LessonSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  missions: Mission[];
  currentMissionId: number;
  progress: LessonProgress;
  onSelectLesson: (missionId: number) => void;
}

export const LessonSelectModal: React.FC<LessonSelectModalProps> = ({
  isOpen,
  onClose,
  missions,
  currentMissionId,
  progress,
  onSelectLesson,
}) => {
  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 전체 진행도 통계 계산
  const totalLessons = missions.length;
  const completedCount = missions.filter((m) => progress[m.id]?.completed).length;
  const totalStarsEarned = missions.reduce(
    (sum, m) => sum + (progress[m.id]?.bestStars ?? 0),
    0
  );
  const maxPossibleStars = totalLessons * 3;

  const renderStars = (starCount: number) => {
    return (
      <span className="star-display">
        <span className="star-filled">{'★'.repeat(starCount)}</span>
        <span className="star-empty">{'☆'.repeat(3 - starCount)}</span>
      </span>
    );
  };

  return (
    <div
      className="modal-backdrop"
      data-testid="lesson-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-content"
        data-testid="lesson-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-modal-title"
      >
        <div className="modal-header">
          <h2 id="lesson-modal-title" className="modal-title">
            {t('📚 Vim 커리큘럼 레슨 목록')}
          </h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label={t('닫기')}
            data-testid="modal-close-btn"
          >
            ✕
          </button>
        </div>

        <div className="modal-stats-bar" data-testid="modal-stats-bar">
          <div className="stat-item">
            <span className="stat-label">{t('진행도:')}</span>
            <span className="stat-value">
              {t('{done} / {total} 완료', { done: completedCount, total: totalLessons })}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">{t('획득 별점:')}</span>
            <span className="stat-value stars-value">
              ★ {totalStarsEarned} / {maxPossibleStars}
            </span>
          </div>
        </div>

        <div className="lesson-list" data-testid="lesson-list">
          {missions.map((mission) => {
            const isCurrent = mission.id === currentMissionId;
            const record = progress[mission.id];
            const isCompleted = record?.completed ?? false;

            return (
              <div
                key={mission.id}
                className={`lesson-card ${isCurrent ? 'current-lesson' : ''} ${
                  isCompleted ? 'completed-lesson' : ''
                }`}
                data-testid={`lesson-card-${mission.id}`}
                onClick={() => {
                  onSelectLesson(mission.id);
                  onClose();
                }}
              >
                <div className="lesson-card-header">
                  <div className="lesson-card-title-row">
                    <span className="lesson-number">#{mission.id}</span>
                    <span className="lesson-name">{mission.title}</span>
                  </div>
                  {isCurrent && (
                    <span
                      className="current-badge"
                      data-testid={`current-badge-${mission.id}`}
                    >
                      {t('현재 학습 중')}
                    </span>
                  )}
                </div>

                <div className="lesson-card-body">
                  <p className="lesson-description">{mission.description}</p>
                </div>

                <div className="lesson-card-footer">
                  <div className="lesson-record-info">
                    {isCompleted ? (
                      <>
                        <div className="stars-wrapper">
                          {renderStars(record.bestStars)}
                        </div>
                        <span className="record-keystrokes">
                          {t('최고 {n}타 (Par {par})', { n: record.minKeystrokes, par: mission.par ?? '-' })}
                        </span>
                      </>
                    ) : (
                      <span className="not-completed-badge">
                        {t('도전 전 (목표 {par}타)', { par: mission.par ?? '-' })}
                      </span>
                    )}
                  </div>
                  <button
                    className="lesson-select-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLesson(mission.id);
                      onClose();
                    }}
                  >
                    {isCurrent ? t('진행 중') : t('선택')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LessonSelectModal;
