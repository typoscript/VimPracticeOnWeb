import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { loadUserAnalytics } from './utils/analyticsStorage';

describe('Arcade & Analytics Integration in App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('아케이드 탭 클릭 시 서바이벌 모드로 전환된다', () => {
    render(<App />);

    const arcadeTabBtn = screen.getByTestId('tab-arcade-btn');
    fireEvent.click(arcadeTabBtn);

    expect(screen.getByTestId('arcade-survival')).toBeDefined();
    expect(screen.getByTestId('arcade-ready-modal')).toBeDefined();
  });

  it('숙련도 분석 버튼 클릭 시 AnalyticsModal이 열린다', () => {
    render(<App />);

    const openAnalyticsBtn = screen.getByTestId('open-analytics-modal-btn');
    fireEvent.click(openAnalyticsBtn);

    expect(screen.getByTestId('analytics-modal')).toBeDefined();
    expect(screen.getByTestId('radar-chart-svg')).toBeDefined();

    const closeBtn = screen.getByTestId('close-analytics-modal-btn');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('analytics-modal')).toBeNull();
  });

  it('데일리 챌린지 버튼 클릭 시 DailyChallengeModal이 열린다', () => {
    render(<App />);

    const openDailyBtn = screen.getByTestId('open-daily-modal-btn');
    fireEvent.click(openDailyBtn);

    expect(screen.getByTestId('daily-modal')).toBeDefined();

    const closeBtn = screen.getByTestId('close-daily-modal-btn');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('daily-modal')).toBeNull();
  });

  it('에디터에서 키 입력 시 전체 누적 통계에 실시간 반영된다', () => {
    render(<App />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });

    const analytics = loadUserAnalytics();
    expect(analytics.totalKeystrokes).toBeGreaterThanOrEqual(3);
    expect(analytics.keyFrequencies['j']).toBeGreaterThanOrEqual(2);
    expect(analytics.keyFrequencies['k']).toBeGreaterThanOrEqual(1);
  });
});
