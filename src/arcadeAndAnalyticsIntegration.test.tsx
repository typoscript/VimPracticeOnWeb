import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { loadUserAnalytics } from './utils/analyticsStorage';

describe('Arcade & Analytics Integration in App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('아케이드 탭 클릭 시 서바이벌 모드로 전환된다', async () => {
    render(<App />);

    const arcadeTabBtn = screen.getByTestId('tab-arcade-btn');
    fireEvent.click(arcadeTabBtn);

    // 탭 화면·모달은 지연 로딩되므로 처음 나타날 때까지 비동기로 대기
    expect(await screen.findByTestId('arcade-survival')).toBeDefined();
    expect(screen.getByTestId('arcade-ready-modal')).toBeDefined();
  });

  it('숙련도 분석 버튼 클릭 시 AnalyticsModal이 열린다', async () => {
    render(<App />);

    const openAnalyticsBtn = screen.getByTestId('open-analytics-modal-btn');
    fireEvent.click(openAnalyticsBtn);

    expect(await screen.findByTestId('analytics-modal')).toBeDefined();
    expect(screen.getByTestId('radar-chart-svg')).toBeDefined();

    const closeBtn = screen.getByTestId('close-analytics-modal-btn');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('analytics-modal')).toBeNull();
  });

  it('데일리 챌린지 버튼 클릭 시 DailyChallengeModal이 열린다', async () => {
    render(<App />);

    const openDailyBtn = screen.getByTestId('open-daily-modal-btn');
    fireEvent.click(openDailyBtn);

    expect(await screen.findByTestId('daily-modal')).toBeDefined();

    const closeBtn = screen.getByTestId('close-daily-modal-btn');
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId('daily-modal')).toBeNull();
  });

  it('지연 로딩된 모달은 처음 연 뒤 계속 마운트되어 다시 열 때는 즉시 나타난다', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('open-daily-modal-btn'));
    expect(await screen.findByTestId('daily-modal')).toBeDefined();
    fireEvent.click(screen.getByTestId('close-daily-modal-btn'));
    expect(screen.queryByTestId('daily-modal')).toBeNull();

    // 두 번째부터는 이미 불러온 컴포넌트가 마운트되어 있으므로 동기적으로 열린다
    fireEvent.click(screen.getByTestId('open-daily-modal-btn'));
    expect(screen.getByTestId('daily-modal')).toBeDefined();
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
