import React, { useState, useMemo } from 'react';
import { LessonProgress } from '../../utils/storage';
import {
  loadUserAnalytics,
  calculateProficiency,
  getTopCommands,
} from '../../utils/analyticsStorage';
import { KeystrokeHeatmap } from './KeystrokeHeatmap';
import './AnalyticsModal.css';
import { t } from '../../i18n';

export interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: LessonProgress;
  onOpenDailyChallenge?: () => void;
}

function getAntiPatternTip(name: string): string {
  if (name === 'Backspace 연타 (x/ciw 권장)' || name.includes('Backspace')) {
    return t('💡 해결책: Normal 모드에서 x, dw, ciw 로 수정하세요.');
  }
  if (name === '방향키/hjkl 연타 (w/b/숫자 이동 권장)' || name.includes('방향키') || name.includes('hjkl')) {
    return t('💡 해결책: w/b 단어 점프나 숫자를 붙인 5j/3k를 활용하세요.');
  }
  if (name === '$ 후 a (대문자 A 권장)' || (name.includes('$') && name.includes('a'))) {
    return t('💡 해결책: 대문자 A로 줄 끝 입력 모드에 한 번에 진입하세요.');
  }
  if (name === '0 후 i (대문자 I 권장)' || (name.includes('0') && name.includes('i'))) {
    return t('💡 해결책: 대문자 I로 줄 맨 앞 입력 모드로 바로 들어가세요.');
  }
  if (name === 'c$ 입력 (대문자 C 권장)' || name.includes('c$')) {
    return t('💡 해결책: 대문자 C를 누르면 한 타수로 해결됩니다.');
  }
  if (name === 'd$ 입력 (대문자 D 권장)' || name.includes('d$')) {
    return t('💡 해결책: 대문자 D를 누르면 한 타수로 줄 끝까지 삭제됩니다.');
  }
  return t('💡 해결책: 카운트나 모션 단축키를 결합해 보세요.');
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  progress,
  onOpenDailyChallenge,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'heatmap'>('overview');

  const analytics = useMemo(() => {
    if (!isOpen) return null;
    return loadUserAnalytics();
  }, [isOpen]);

  const proficiency = useMemo(() => {
    if (!analytics) {
      return { navigation: 20, targeting: 15, textObjects: 10, batchEditing: 10, efficiency: 20 };
    }
    return calculateProficiency(analytics, progress);
  }, [analytics, progress]);

  const topCommands = useMemo(() => {
    if (!analytics) return [];
    return getTopCommands(analytics, 10);
  }, [analytics]);

  // 완료된 레슨 수 및 3스타 달성 수 계산
  const { completedLessons, threeStarLessons, totalLessons } = useMemo(() => {
    const keys = Object.keys(progress).map(Number);
    const completed = keys.filter((id) => progress[id]?.completed).length;
    const threeStars = keys.filter((id) => progress[id]?.bestStars === 3).length;
    return {
      completedLessons: completed,
      threeStarLessons: threeStars,
      totalLessons: Math.max(keys.length, 24),
    };
  }, [progress]);

  if (!isOpen || !analytics) return null;

  // 5축 레이더 차트 SVG 좌표 계산
  const axesMeta = [
    { key: 'navigation', label: t('기본 이동'), sub: 'hjkl / wb', value: proficiency.navigation },
    { key: 'targeting', label: t('정밀 타겟팅'), sub: t('f / t / % / 점프'), value: proficiency.targeting },
    { key: 'textObjects', label: t('텍스트 객체'), sub: 'ciw / da"', value: proficiency.textObjects },
    { key: 'batchEditing', label: t('대량 편집'), sub: ':s / :g / :norm', value: proficiency.batchEditing },
    { key: 'efficiency', label: t('타수 효율성'), sub: t('Golf Par 달성률'), value: proficiency.efficiency },
  ];

  const cx = 160;
  const cy = 150;
  const radius = 100;
  const numAxes = axesMeta.length;

  // 각 축의 각도 계산 (상단부터 시계 방향 회전)
  const getAngle = (index: number) => -Math.PI / 2 + (index * 2 * Math.PI) / numAxes;

  // 레이더 그리드 다각형 꼭짓점
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const gridPolygons = gridLevels.map((lvl) => {
    const pts = axesMeta.map((_, i) => {
      const angle = getAngle(i);
      const x = cx + radius * lvl * Math.cos(angle);
      const y = cy + radius * lvl * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return pts.join(' ');
  });

  // 유저 데이터 다각형 꼭짓점
  const dataPoints = axesMeta.map((axis, i) => {
    const angle = getAngle(i);
    const r = (Math.max(5, Math.min(100, axis.value)) / 100) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, value: axis.value };
  });
  const dataPolygonPoints = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // 안티패턴 교정 내역
  const antiPatterns = Object.entries(analytics.antiPatternCounts)
    .sort((a, b) => b[1] - a[1]);

  const maxCommandCount = topCommands[0]?.count || 1;

  return (
    <div className="analytics-modal-backdrop" onClick={onClose} data-testid="analytics-modal-backdrop">
      <div
        className="analytics-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('Vim 숙련도 분석 대시보드')}
        data-testid="analytics-modal"
      >
        <header className="analytics-header">
          <div className="analytics-title-group">
            <span className="analytics-icon">📊</span>
            <div>
              <h2 className="analytics-title">{t('Vim 숙련도 & 학습 대시보드')}</h2>
              <p className="analytics-subtitle">{t('실시간 입력 패턴 분석 및 개인화된 능력치 레이더')}</p>
            </div>
          </div>
          <button
            className="analytics-close-btn"
            onClick={onClose}
            aria-label={t('닫기')}
            data-testid="close-analytics-modal-btn"
          >
            ✕
          </button>
        </header>

        {/* 탭 네비게이션: 종합 분석 vs 타건 히트맵 */}
        <nav className="analytics-tabs-nav" aria-label={t('분석 탭')}>
          <button
            className={`analytics-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            data-testid="analytics-tab-overview"
          >
            📊 {t('종합 숙련도 분석')}
          </button>
          <button
            className={`analytics-tab-btn ${activeTab === 'heatmap' ? 'active' : ''}`}
            onClick={() => setActiveTab('heatmap')}
            data-testid="analytics-tab-heatmap"
          >
            ⌨️ {t('타건 키보드 히트맵')}
          </button>
        </nav>

        {activeTab === 'heatmap' ? (
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <KeystrokeHeatmap analytics={analytics} />
          </div>
        ) : (
          <>
            {/* 상단 핵심 요약 통계 카드 */}
            <section className="analytics-summary-cards">
          <div className="summary-card">
            <span className="summary-label">{t('총 키스트로크')}</span>
            <span className="summary-value highlight-cyan">
              {analytics.totalKeystrokes.toLocaleString()}
            </span>
            <span className="summary-sub">{t('누적 입력 타수')}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">{t('튜토리얼 완료')}</span>
            <span className="summary-value highlight-green">
              {completedLessons} <small>/ {totalLessons}</small>
            </span>
            <span className="summary-sub">{t('⭐ 3스타: {n}개', { n: threeStarLessons })}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">{t('데일리 챌린지')}</span>
            <span className="summary-value highlight-yellow">
              {t('{n}일 연속', { n: analytics.dailyStreak })}
            </span>
            <span className="summary-sub">
              {onOpenDailyChallenge && (
                <button
                  className="quick-daily-btn"
                  onClick={() => {
                    onClose();
                    onOpenDailyChallenge();
                  }}
                  data-testid="analytics-quick-daily-btn"
                >
                  {t('오늘 풀기 >')}
                </button>
              )}
            </span>
          </div>
          <div className="summary-card">
            <span className="summary-label">{t('아케이드 서바이벌')}</span>
            <span className="summary-value highlight-purple">
              {t('{n}점', { n: analytics.arcadeBestScore.toLocaleString() })}
            </span>
            <span className="summary-sub">{t('최고 {wave}W • {combo}콤보', { wave: analytics.arcadeHighestWave, combo: analytics.arcadeMaxCombo })}</span>
          </div>
        </section>

        <div className="analytics-main-grid">
          {/* 5각형 숙련도 레이더 차트 (순수 SVG) */}
          <section className="radar-section">
            <h3 className="section-title">
              <span>🎯</span> {t('5각형 Vim 숙련도 레이더')}
            </h3>
            <div className="radar-chart-container">
              <svg
                viewBox="0 0 320 300"
                className="radar-svg"
                data-testid="radar-chart-svg"
              >
                {/* 배경 그리드 다각형 */}
                {gridPolygons.map((pts, idx) => (
                  <polygon
                    key={idx}
                    points={pts}
                    className="radar-grid-polygon"
                  />
                ))}

                {/* 축 방사선 (Spokes) */}
                {axesMeta.map((_, i) => {
                  const angle = getAngle(i);
                  const x2 = cx + radius * Math.cos(angle);
                  const y2 = cy + radius * Math.sin(angle);
                  return (
                    <line
                      key={i}
                      x1={cx}
                      y1={cy}
                      x2={x2}
                      y2={y2}
                      className="radar-spoke"
                    />
                  );
                })}

                {/* 사용자 데이터 영역 다각형 */}
                <polygon
                  points={dataPolygonPoints}
                  className="radar-data-polygon"
                  data-testid="radar-data-polygon"
                />

                {/* 각 꼭짓점 포인트 원 */}
                {dataPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    className="radar-data-dot"
                  />
                ))}

                {/* 축 레이블 텍스트 */}
                {axesMeta.map((axis, i) => {
                  const angle = getAngle(i);
                  const labelRadius = radius + 28;
                  const lx = cx + labelRadius * Math.cos(angle);
                  const ly = cy + labelRadius * Math.sin(angle);

                  let textAnchor: 'start' | 'end' | 'middle' = 'middle';
                  if (Math.abs(Math.cos(angle)) > 0.3) {
                    textAnchor = Math.cos(angle) > 0 ? 'start' : 'end';
                  }

                  return (
                    <g key={i} className="radar-label-group">
                      <text
                        x={lx}
                        y={ly - 4}
                        textAnchor={textAnchor}
                        className="radar-axis-title"
                      >
                        {t('{label} ({value}점)', { label: axis.label, value: axis.value })}
                      </text>
                      <text
                        x={lx}
                        y={ly + 10}
                        textAnchor={textAnchor}
                        className="radar-axis-sub"
                      >
                        {axis.sub}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          {/* 내가 가장 많이 쓴 명령어 Top 10 */}
          <section className="top-commands-section">
            <h3 className="section-title">
              <span>⌨️</span> {t('최다 사용 명령어 Top 10')}
            </h3>
            {topCommands.length === 0 ? (
              <div className="empty-commands">
                {t('아직 키 입력 데이터가 없습니다. 에디터에서 연습을 시작해 보세요!')}
              </div>
            ) : (
              <ul className="top-commands-list" data-testid="top-commands-list">
                {topCommands.map((item, idx) => {
                  const percent = Math.round((item.count / maxCommandCount) * 100);
                  return (
                    <li key={item.key} className="command-item">
                      <span className="command-rank">{idx + 1}</span>
                      <kbd className="command-badge">{item.key}</kbd>
                      <span className="command-desc">{item.label}</span>
                      <div className="command-bar-track">
                        <div
                          className="command-bar-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="command-count">{t('{n}회', { n: item.count.toLocaleString() })}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* 교정된 안티패턴 피드백 섹션 */}
        <section className="antipattern-section">
          <h3 className="section-title">
            <span>🛡️</span> {t('비효율 입력 습관(안티패턴) 교정 현황')}
          </h3>
          <p className="antipattern-desc">
            {t('스마트 코칭이 감지한 비효율적인 조작 습관과 추천 명령어 피드백 내역입니다.')}
          </p>
          {antiPatterns.length === 0 ? (
            <div className="antipattern-clean-card">
              <span className="clean-icon">✨</span>
              <span>{t('감지된 안티패턴이 없습니다! 아주 훌륭한 Vim 습관을 유지하고 계십니다.')}</span>
            </div>
          ) : (
            <div className="antipattern-grid" data-testid="antipattern-grid">
              {antiPatterns.map(([name, count]) => (
                <div key={name} className="antipattern-card">
                  <div className="antipattern-header">
                    <span className="antipattern-name">{t(name)}</span>
                    <span className="antipattern-badge">{t('{n}회 감지', { n: count })}</span>
                  </div>
                  <span className="antipattern-tip">{getAntiPatternTip(name)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}

        <footer className="analytics-modal-footer">
          <button
            className="analytics-confirm-btn"
            onClick={onClose}
            data-testid="analytics-confirm-btn"
          >
            {t('확인')}
          </button>
        </footer>
      </div>
    </div>
  );
};
