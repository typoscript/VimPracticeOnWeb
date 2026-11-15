import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KeystrokeHeatmap } from './KeystrokeHeatmap';
import { UserAnalyticsData } from '../../types/game';

const makeAnalytics = (overrides: Partial<UserAnalyticsData> = {}): UserAnalyticsData => ({
  totalKeystrokes: 500,
  keyFrequencies: {
    j: 200,
    w: 90,
    d: 35,
    i: 12,
    Escape: 4,
    '.': 2,
  },
  antiPatternCounts: {},
  totalAntiPatternsTriggered: 0,
  arcadeBestScore: 0,
  arcadeHighestWave: 0,
  arcadeMaxCombo: 0,
  arcadeGamesPlayed: 0,
  dailyStreak: 0,
  dailyRecords: {},
  ...overrides,
});

describe('KeystrokeHeatmap', () => {
  it('renders heatmap grid, heat levels, and default detail card for j', () => {
    render(<KeystrokeHeatmap analytics={makeAnalytics()} />);

    expect(screen.getByTestId('keystroke-heatmap')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-keyboard')).toBeInTheDocument();

    // Default selected key is 'j' (200 / 500 = 40.0%)
    const detail = screen.getByTestId('heatmap-detail-card');
    expect(detail).toHaveTextContent('j');
    expect(detail).toHaveTextContent('200회 타건');
    expect(detail).toHaveTextContent('40.0%');

    // Verify heat levels mapped by thresholds: 0->0, 2->1, 12->2, 35->3, 90->4, 200->5
    expect(screen.getByTestId('heatmap-key-j').className).toContain('heat-5');
    expect(screen.getByTestId('heatmap-key-w').className).toContain('heat-4');
    expect(screen.getByTestId('heatmap-key-d').className).toContain('heat-3');
    expect(screen.getByTestId('heatmap-key-i').className).toContain('heat-2');
    expect(screen.getByTestId('heatmap-key-Escape').className).toContain('heat-1');
    expect(screen.getByTestId('heatmap-key-h').className).toContain('heat-0');
  });

  it('filters keyboard keys across motion, operator, insert, and all categories', () => {
    render(<KeystrokeHeatmap analytics={makeAnalytics()} />);

    const motionBtn = screen.getByRole('button', { name: '모션/이동 (hjkl/wb)' });
    fireEvent.click(motionBtn);
    expect(motionBtn.className).toContain('active');
    expect(screen.getByTestId('heatmap-key-j').className).not.toContain('dimmed');
    expect(screen.getByTestId('heatmap-key-d').className).toContain('dimmed');

    const opBtn = screen.getByRole('button', { name: '연산자 (d/c/y/x)' });
    fireEvent.click(opBtn);
    expect(screen.getByTestId('heatmap-key-d').className).not.toContain('dimmed');
    expect(screen.getByTestId('heatmap-key-i').className).toContain('dimmed');

    const insBtn = screen.getByRole('button', { name: '입력 (i/a/o)' });
    fireEvent.click(insBtn);
    expect(screen.getByTestId('heatmap-key-i').className).not.toContain('dimmed');
    expect(screen.getByTestId('heatmap-key-j').className).toContain('dimmed');

    const allBtn = screen.getByRole('button', { name: '전체 (All)' });
    fireEvent.click(allBtn);
    expect(screen.getByTestId('heatmap-key-j').className).not.toContain('dimmed');
    expect(screen.getByTestId('heatmap-key-d').className).not.toContain('dimmed');
  });

  it('updates detail card stats when clicking other keys and handles zero keystrokes', () => {
    render(<KeystrokeHeatmap analytics={makeAnalytics()} />);

    fireEvent.click(screen.getByTestId('heatmap-key-w'));
    expect(screen.getByTestId('heatmap-detail-card')).toHaveTextContent('90회 타건');
    expect(screen.getByTestId('heatmap-detail-card')).toHaveTextContent('18.0%');

    fireEvent.click(screen.getByTestId('heatmap-key-Escape'));
    expect(screen.getByTestId('heatmap-detail-card')).toHaveTextContent('4회 타건');

    fireEvent.click(screen.getByTestId('heatmap-key-.'));
    expect(screen.getByTestId('heatmap-detail-card')).toHaveTextContent('2회 타건');

    // Zero total keystrokes edge case
    render(<KeystrokeHeatmap analytics={makeAnalytics({ totalKeystrokes: 0, keyFrequencies: {} })} />);
    const details = screen.getAllByTestId('heatmap-detail-card');
    expect(details[1]).toHaveTextContent('0회 타건');
    expect(details[1]).toHaveTextContent('0%');
  });
});
