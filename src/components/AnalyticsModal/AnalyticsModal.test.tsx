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
});
