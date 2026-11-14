import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsModal } from './AnalyticsModal';
import { recordKeyInputStats, recordAntiPatternDetection } from '../../utils/analyticsStorage';

describe('AnalyticsModal 컴포넌트', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isOpen이 false일 때는 렌더링되지 않는다', () => {
    render(
      <AnalyticsModal
        isOpen={false}
        onClose={vi.fn()}
        progress={{}}
      />
    );
    expect(screen.queryByTestId('analytics-modal')).toBeNull();
  });

  it('isOpen이 true일 때 5각형 SVG 레이더 차트와 요약 통계를 렌더링한다', () => {
    recordKeyInputStats('j');
    recordKeyInputStats('k');
    recordKeyInputStats('x');
    recordAntiPatternDetection('Normal 모드에서 x, dw, 또는 ciw로 지우면 훨씬 빠릅니다!');

    render(
      <AnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        progress={{
          1: { completed: true, bestStars: 3, minKeystrokes: 4 },
        }}
      />
    );

    expect(screen.getByTestId('analytics-modal')).toBeDefined();
    expect(screen.getByTestId('radar-chart-svg')).toBeDefined();
    expect(screen.getByTestId('radar-data-polygon')).toBeDefined();
    expect(screen.getByText(/기본 이동/i)).toBeDefined();
    expect(screen.getByText(/hjkl \/ wb/i)).toBeDefined();
    expect(screen.getByTestId('top-commands-list')).toBeDefined();
    expect(screen.getByTestId('antipattern-grid')).toBeDefined();
  });

  it('닫기 버튼 클릭 시 onClose 콜백이 호출된다', () => {
    const onClose = vi.fn();
    render(
      <AnalyticsModal
        isOpen={true}
        onClose={onClose}
        progress={{}}
      />
    );

    const closeBtn = screen.getByTestId('close-analytics-modal-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('타건 키보드 히트맵 탭 전환 시 키보드 격자와 상세 분석 카드가 렌더링된다', () => {
    recordKeyInputStats('j');
    recordKeyInputStats('j');
    recordKeyInputStats('k');
    recordKeyInputStats('w');

    render(
      <AnalyticsModal
        isOpen={true}
        onClose={vi.fn()}
        progress={{}}
      />
    );

    const heatmapTabBtn = screen.getByTestId('analytics-tab-heatmap');
    fireEvent.click(heatmapTabBtn);

    expect(screen.getByTestId('keystroke-heatmap')).toBeDefined();
    expect(screen.getByTestId('heatmap-keyboard')).toBeDefined();
    expect(screen.getByTestId('heatmap-detail-card')).toBeDefined();

    // j 키 클릭 시 상세 카드 정보 확인
    const keyJ = screen.getByTestId('heatmap-key-j');
    fireEvent.click(keyJ);
    expect(screen.getByText(/2회 타건/i)).toBeDefined();
  });

  it('약점 맞춤 드릴 추천 카드와 바로 시작 버튼이 정상 동작한다', () => {
    recordAntiPatternDetection('A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!');
    recordAntiPatternDetection('A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!');
    const onClose = vi.fn();
    const onStartWeaknessDrill = vi.fn();

    render(
      <AnalyticsModal
        isOpen={true}
        onClose={onClose}
        progress={{}}
        onStartWeaknessDrill={onStartWeaknessDrill}
      />
    );

    expect(screen.getByTestId('analytics-weakness-recommendation')).toBeDefined();
    const startBtn = screen.getByTestId('analytics-start-weakness-drill-btn');
    fireEvent.click(startBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStartWeaknessDrill).toHaveBeenCalledTimes(1);
  });
});
