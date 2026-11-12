import React, { useState, useMemo } from 'react';
import { UserAnalyticsData } from '../../types/game';
import { KEYBOARD_ROWS } from '../VirtualKeyboard/VirtualKeyboard';
import './KeystrokeHeatmap.css';
import { t } from '../../i18n';

export interface KeystrokeHeatmapProps {
  analytics: UserAnalyticsData;
}

export type HeatFilter = 'all' | 'motion' | 'operator' | 'insert' | 'control';

export const KeystrokeHeatmap: React.FC<KeystrokeHeatmapProps> = ({ analytics }) => {
  const [filter, setFilter] = useState<HeatFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>('j');

  const { totalKeystrokes, keyFrequencies } = analytics;

  // 최대 타건 수 계산 (히트맵 상대 정규화 기준)
  const maxFreq = useMemo(() => {
    let max = 1;
    for (const val of Object.values(keyFrequencies)) {
      if (val > max) max = val;
    }
    return max;
  }, [keyFrequencies]);

  // 카테고리별 키스트로크 통계
  const stats = useMemo(() => {
    let hjklCount = 0;
    let wordMotionCount = 0;
    let escCount = 0;
    let operatorCount = 0;
    let insertCount = 0;

    for (const [k, count] of Object.entries(keyFrequencies)) {
      const lower = k.toLowerCase();
      if (['h', 'j', 'k', 'l'].includes(lower)) hjklCount += count;
      if (['w', 'b', 'e', 'w', 'b', 'e'].includes(lower)) wordMotionCount += count;
      if (lower === 'escape' || lower === 'esc') escCount += count;
      if (['d', 'c', 'y', 'x', 'p', 's', 'r'].includes(lower)) operatorCount += count;
      if (['i', 'a', 'o'].includes(lower)) insertCount += count;
    }

    return {
      hjklCount,
      wordMotionCount,
      escCount,
      operatorCount,
      insertCount,
      uniqueKeys: Object.keys(keyFrequencies).length,
    };
  }, [keyFrequencies]);

  // 키별 히트 레벨 (0 ~ 5)
  const getHeatLevel = (keyName: string): number => {
    const count = keyFrequencies[keyName] || keyFrequencies[keyName.toLowerCase()] || 0;
    if (count === 0) return 0;
    if (count <= 5) return 1;
    if (count <= 25) return 2;
    if (count <= 70) return 3;
    if (count <= 180) return 4;
    return 5;
  };

  const getHeatColor = (level: number): string => {
    switch (level) {
      case 1:
        return 'var(--heat-1, rgba(56, 189, 248, 0.25))';
      case 2:
        return 'var(--heat-2, rgba(56, 189, 248, 0.55))';
      case 3:
        return 'var(--heat-3, rgba(234, 179, 8, 0.65))';
      case 4:
        return 'var(--heat-4, rgba(249, 115, 22, 0.85))';
      case 5:
        return 'var(--heat-5, rgba(244, 63, 94, 0.95))';
      default:
        return 'var(--heat-0, rgba(31, 35, 53, 0.8))';
    }
  };

  // 선택된 키의 코칭 피드백 정보
  const selectedInfo = useMemo(() => {
    if (!selectedKey) return null;
    const count = keyFrequencies[selectedKey] || keyFrequencies[selectedKey.toLowerCase()] || 0;
    const share = totalKeystrokes > 0 ? ((count / totalKeystrokes) * 100).toFixed(1) : '0';

    let tip = t('Vim의 표준 키바인딩입니다.');
    const lower = selectedKey.toLowerCase();
    if (['h', 'j', 'k', 'l'].includes(lower)) {
      tip = t('방향 이동 키입니다. hjkl 1칸 이동 대신 w/b 단어 점프나 5j/10k 숫자 점프를 결합하면 타수를 60% 이상 절약할 수 있습니다.');
    } else if (['w', 'b', 'e'].includes(lower)) {
      tip = t('단어 단위 고속 점프 모션입니다! 능숙하게 활용할수록 코드 탐색 속도가 비약적으로 향상됩니다.');
    } else if (lower === 'escape' || lower === 'esc') {
      tip = t('노멀 모드 복귀 키입니다. 키보드 구석의 Esc 대신 :imap jk <Esc> 키매핑을 등록하면 홈 로우에서 손가락을 떼지 않고 고속 탈출할 수 있습니다.');
    } else if (['d', 'c', 'y'].includes(lower)) {
      tip = t('Vim의 3대 핵심 연산자(삭제, 수정, 복사)입니다. 텍스트 객체(diw, ci", yap)와 조합하면 진정한 파워를 발휘합니다.');
    } else if (['i', 'a', 'o'].includes(lower)) {
      tip = t('입력 모드 진입 키입니다. 상황에 맞게 i(커서 앞), a(커서 뒤), o(다음 줄), A(줄 끝), I(줄 맨 앞)를 선별 사용하세요.');
    } else if (lower === '.' || lower === 'repeat') {
      tip = t('Vim의 꽃인 점 반복(Dot Repeat)입니다! 직전 변경을 1타로 무한 반복하여 압도적인 생산성을 제공합니다.');
    }

    return {
      name: selectedKey,
      count,
      share,
      tip,
    };
  }, [selectedKey, keyFrequencies, totalKeystrokes]);

  return (
    <div className="keystroke-heatmap-container" data-testid="keystroke-heatmap">
      {/* 1. 상단 통계 요약 카드 */}
      <div className="heatmap-stats-banner">
        <div className="stat-card">
          <span className="stat-title">{t('총 타건 수')}</span>
          <span className="stat-value">{totalKeystrokes.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">{t('사용된 고유 키')}</span>
          <span className="stat-value">{t('{n}개', { n: stats.uniqueKeys })}</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">{t('hjkl 1칸 이동')}</span>
          <span className="stat-value text-cyan">{stats.hjklCount.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">{t('w/b 단어 점프')}</span>
          <span className="stat-value text-amber">{stats.wordMotionCount.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-title">{t('연산자(d/c/y)')}</span>
          <span className="stat-value text-rose">{stats.operatorCount.toLocaleString()}</span>
        </div>
      </div>

      {/* 2. 필터 버튼 바 */}
      <div className="heatmap-filter-bar">
        <span className="filter-label">{t('키 분류 필터')}:</span>
        <div className="filter-buttons">
          <button
            className={`heatmap-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('전체 (All)')}
          </button>
          <button
            className={`heatmap-filter-btn ${filter === 'motion' ? 'active' : ''}`}
            onClick={() => setFilter('motion')}
          >
            {t('모션/이동 (hjkl/wb)')}
          </button>
          <button
            className={`heatmap-filter-btn ${filter === 'operator' ? 'active' : ''}`}
            onClick={() => setFilter('operator')}
          >
            {t('연산자 (d/c/y/x)')}
          </button>
          <button
            className={`heatmap-filter-btn ${filter === 'insert' ? 'active' : ''}`}
            onClick={() => setFilter('insert')}
          >
            {t('입력 (i/a/o)')}
          </button>
        </div>

        {/* 히트맵 범례 */}
        <div className="heatmap-legend">
          <span className="legend-label">{t('타건 빈도')}:</span>
          <span className="legend-chip heat-0" title={t('0회 (미사용)')}>0</span>
          <span className="legend-chip heat-1" title={t('1~5회')}>1</span>
          <span className="legend-chip heat-2" title={t('6~25회')}>2</span>
          <span className="legend-chip heat-3" title={t('26~70회')}>3</span>
          <span className="legend-chip heat-4" title={t('71~180회')}>4</span>
          <span className="legend-chip heat-5" title={t('181회 이상')}>5</span>
        </div>
      </div>

      {/* 3. 키보드 히트맵 격자 */}
      <div className="heatmap-keyboard-frame" data-testid="heatmap-keyboard">
        {KEYBOARD_ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="heatmap-keyboard-row">
            {row.map((kDef, colIdx) => {
              const isFiltered =
                filter === 'all' ||
                (filter === 'motion' && kDef.role === 'motion') ||
                (filter === 'operator' && kDef.role === 'operator') ||
                (filter === 'insert' && kDef.role === 'insert');

              const count = keyFrequencies[kDef.key] || keyFrequencies[kDef.key.toLowerCase()] || 0;
              const level = getHeatLevel(kDef.key);
              const isSelected = selectedKey?.toLowerCase() === kDef.key.toLowerCase();

              return (
                <button
                  key={`${kDef.key}_${rowIdx}_${colIdx}`}
                  className={`heatmap-key-tile width-${kDef.width || 'normal'} heat-${level} ${
                    isSelected ? 'selected' : ''
                  } ${!isFiltered ? 'dimmed' : ''}`}
                  style={{
                    backgroundColor: isFiltered ? getHeatColor(level) : undefined,
                  }}
                  onClick={() => setSelectedKey(kDef.key)}
                  title={`${kDef.label}: ${count.toLocaleString()}${t('회')} (${
                    totalKeystrokes > 0 ? ((count / totalKeystrokes) * 100).toFixed(1) : 0
                  }%)`}
                  data-testid={`heatmap-key-${kDef.key}`}
                >
                  <span className="key-main-label">{kDef.label}</span>
                  {count > 0 && <span className="key-count-badge">{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 4. 선택된 키 상세 분석 및 코칭 피드백 */}
      {selectedInfo && (
        <div className="heatmap-detail-card" data-testid="heatmap-detail-card">
          <div className="detail-header">
            <div className="detail-key-badge">
              <kbd className="detail-kbd">{selectedInfo.name}</kbd>
              <div className="detail-meta">
                <span className="detail-count">
                  {t('{count}회 타건', { count: selectedInfo.count.toLocaleString() })}
                </span>
                <span className="detail-share">
                  ({t('전체 타수의 {share}%', { share: selectedInfo.share })})
                </span>
              </div>
            </div>
            <div className="detail-bar-container">
              <div
                className="detail-bar-fill"
                style={{ width: `${Math.min(100, Math.max(3, (selectedInfo.count / maxFreq) * 100))}%` }}
              />
            </div>
          </div>
          <div className="detail-tip-box">
            <span className="tip-icon">💡</span>
            <span className="tip-text">{selectedInfo.tip}</span>
          </div>
        </div>
      )}
    </div>
  );
};
