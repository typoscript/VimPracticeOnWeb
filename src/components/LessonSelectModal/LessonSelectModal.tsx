import React, { useEffect, useState, useMemo } from 'react';
import { Mission } from '../../types/mission';
import { LessonProgress } from '../../utils/storage';
import {
  filterMissions,
  getMissionTags,
  getTagLabel,
  MISSION_CATEGORY_TAGS,
  MissionCategoryTag,
} from '../../utils/missionFilters';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MissionCategoryTag>('all');
  const [showUncompletedOnly, setShowUncompletedOnly] = useState(false);

  // 모달이 열릴 때마다 검색 필터 초기화
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('all');
      setShowUncompletedOnly(false);
    }
  }, [isOpen]);

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

  // 필터링된 미션 목록
  const filteredMissions = useMemo(() => {
    return filterMissions(
      missions,
      {
        searchQuery,
        category: selectedCategory,
        statusFilter: showUncompletedOnly ? 'uncompleted' : 'all',
      },
      progress
    );
  }, [missions, searchQuery, selectedCategory, showUncompletedOnly, progress]);

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

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setShowUncompletedOnly(false);
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

        {/* 실시간 검색 및 카테고리 태그 바 */}
        <div className="lesson-controls-bar">
          <div className="lesson-search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="lesson-search-input"
              data-testid="lesson-search-input"
              placeholder={t('레슨 검색 (제목, 설명, 단축키, #번호)...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                data-testid="search-clear-btn"
                onClick={() => setSearchQuery('')}
                aria-label={t('검색어 초기화')}
              >
                ✕
              </button>
            )}
          </div>

          <div className="lesson-tags-row">
            <div className="lesson-tags-bar" data-testid="lesson-tags-bar">
              {MISSION_CATEGORY_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag-btn ${selectedCategory === tag.id ? 'active' : ''}`}
                  data-testid={`tag-btn-${tag.id}`}
                  onClick={() => setSelectedCategory(tag.id)}
                >
                  {t(tag.label)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={`status-toggle-btn ${showUncompletedOnly ? 'active' : ''}`}
              data-testid="status-toggle-btn"
              onClick={() => setShowUncompletedOnly((prev) => !prev)}
            >
              {showUncompletedOnly ? t('전체 보기') : t('미완료만 보기')}
            </button>
          </div>

          {(searchQuery || selectedCategory !== 'all' || showUncompletedOnly) && (
            <div className="filter-status-info">
              <span className="results-count">
                {t('{count}개 레슨 검색됨', { count: filteredMissions.length })}
              </span>
              <button
                type="button"
                className="reset-filter-link"
                data-testid="reset-filter-link"
                onClick={handleResetFilters}
              >
                {t('필터 초기화')}
              </button>
            </div>
          )}
        </div>

        <div className="lesson-list" data-testid="lesson-list">
          {filteredMissions.length === 0 ? (
            <div className="empty-search-state" data-testid="empty-search-state">
              <div className="empty-icon">🔍</div>
              <p className="empty-title">{t('일치하는 레슨이 없습니다.')}</p>
              <p className="empty-desc">{t('다른 검색어를 입력하거나 카테고리 필터를 변경해 보세요.')}</p>
              <button
                type="button"
                className="reset-filter-btn"
                data-testid="reset-filter-btn"
                onClick={handleResetFilters}
              >
                {t('필터 초기화')}
              </button>
            </div>
          ) : (
            filteredMissions.map((mission) => {
              const isCurrent = mission.id === currentMissionId;
              const record = progress[mission.id];
              const isCompleted = record?.completed ?? false;
              const tags = getMissionTags(mission);

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
                      <span className="lesson-name">{t(mission.title)}</span>
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
                    <p className="lesson-description">{t(mission.description)}</p>
                    <div className="card-tags-list">
                      {tags.map((tagId) => (
                        <span
                          key={tagId}
                          className={`card-tag-badge tag-${tagId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategory(tagId);
                          }}
                          title={t('{tag} 카테고리로 필터링', { tag: t(getTagLabel(tagId)) })}
                        >
                          #{t(getTagLabel(tagId))}
                        </span>
                      ))}
                    </div>
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
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonSelectModal;
