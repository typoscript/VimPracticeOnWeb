import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { DojoLeaderboardModal } from './DojoLeaderboardModal';
import { DojoOverlays } from './DojoOverlays';
import { useHardcoreDojo } from './useHardcoreDojo';
import { DojoLeaderboardEntry } from './HardcoreDojo.types';
import { WeaknessDrillPlan } from '../../utils/weaknessDrillAnalyzer';

const sampleWeaknessPlan: WeaknessDrillPlan = {
  hasAnalyticsData: true,
  topWeaknesses: [
    {
      id: 'targeting',
      label: '정밀 타겟팅',
      reason: 'f/t 점프 빈도가 낮습니다',
      recommendedDrillLabel: 'f/t 스나이퍼',
      severityScore: 80,
    },
  ],
  queue: [],
};

const baseOverlayProps = {
  selectedDrill: 'relative-jump' as const,
  metaTitle: '상대 라인 점프 훈련',
  metaDescription: '수직 점프를 연마합니다.',
  weaknessPlan: sampleWeaknessPlan,
  onRefreshWeaknessPlan: vi.fn(),
  onStartGame: vi.fn(),
  onOpenLeaderboard: vi.fn(),
  tierInfo: { title: '👑 MASTER', desc: '신들린 Vim 마스터', className: 'master' },
  isNewRecord: false,
  score: 850,
  targetsHit: 10,
  keystrokes: 22,
  combo: 5,
  timeLeft: 42,
  finalTime: 11.24,
  myRank: 2,
  suddenDeathFailReason: '방향키 사용 금지',
};

describe('DojoLeaderboardModal', () => {
  it('renders nothing when closed and shows empty state when leaderboard is empty', () => {
    render(<DojoLeaderboardModal isOpen={false} leaderboard={[]} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: 'Dojo Leaderboard' })).not.toBeInTheDocument();

    const onClose = vi.fn();
    const { container: modalContainer } = render(
      <DojoLeaderboardModal isOpen={true} leaderboard={[]} onClose={onClose} />
    );
    expect(screen.getByRole('dialog', { name: 'Dojo Leaderboard' })).toBeInTheDocument();
    expect(modalContainer.querySelectorAll('tbody tr')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders podium badges for top 3 and standard rank for 4th+, closes on backdrop and footer button', () => {
    const entries: DojoLeaderboardEntry[] = [
      { id: '1', playerName: 'Ace', clearTime: 8.42, completedAt: '2026-01-01', tier: 'GODSPEED', combo: 10 },
      { id: '2', playerName: 'Beta', clearTime: 10.5, completedAt: '2026-01-02', tier: 'ONE-STRIKE', combo: 10 },
      { id: '3', playerName: 'Gamma', clearTime: 14.1, completedAt: '2026-01-03', tier: 'DOJO-MASTER', combo: 9 },
      { id: '4', playerName: 'Delta', clearTime: 19.8, completedAt: '2026-01-04', tier: 'DISCIPLE', combo: 8 },
    ];
    const onClose = vi.fn();
    const { container } = render(
      <DojoLeaderboardModal isOpen={true} leaderboard={entries} onClose={onClose} />
    );

    expect(screen.getByText('🥇 1')).toBeInTheDocument();
    expect(screen.getByText('🥈 2')).toBeInTheDocument();
    expect(screen.getByText('🥉 3')).toBeInTheDocument();
    expect(screen.getByText('Ace')).toBeInTheDocument();
    expect(screen.getByText('8.42s')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(container.querySelector('.dojo-modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('DojoOverlays', () => {
  it('renders nothing during running phase and renders ready, weakness-custom, and sudden-death screens', () => {
    const { container, rerender } = render(<DojoOverlays {...baseOverlayProps} gameState="running" />);
    expect(container.firstChild).toBeNull();

    const onStart = vi.fn();
    const onRefresh = vi.fn();
    const onLb = vi.fn();

    rerender(
      <DojoOverlays
        {...baseOverlayProps}
        gameState="ready"
        selectedDrill="weakness-custom"
        onStartGame={onStart}
        onRefreshWeaknessPlan={onRefresh}
        onOpenLeaderboard={onLb}
      />
    );
    expect(screen.getByTestId('dojo-weakness-plan-box')).toBeInTheDocument();
    expect(screen.getByText(/정밀 타겟팅/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dojo-weakness-refresh-btn'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('dojo-weakness-start-btn'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders finished, sudden-death-failed, sudden-death-cleared, and weakness-cleared overlays', () => {
    const onLb = vi.fn();
    const { rerender } = render(
      <DojoOverlays {...baseOverlayProps} gameState="finished" isNewRecord={true} onOpenLeaderboard={onLb} />
    );
    expect(screen.getByText('👑 MASTER')).toBeInTheDocument();
    expect(screen.getByText('850')).toBeInTheDocument();

    rerender(<DojoOverlays {...baseOverlayProps} gameState="sudden-death-failed" onOpenLeaderboard={onLb} />);
    expect(screen.getByText(/방향키 사용 금지/)).toBeInTheDocument();

    rerender(
      <DojoOverlays
        {...baseOverlayProps}
        gameState="sudden-death-cleared"
        selectedDrill="sudden-death"
        onOpenLeaderboard={onLb}
      />
    );
    expect(screen.getByText('11.24s')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /랭킹 보드 보기/ }));
    expect(onLb).toHaveBeenCalledTimes(1);

    rerender(<DojoOverlays {...baseOverlayProps} gameState="weakness-cleared" onOpenLeaderboard={onLb} />);
    expect(screen.getByTestId('dojo-weakness-cleared')).toBeInTheDocument();
  });
});

describe('useHardcoreDojo hook', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('manages drill selection, startGame lifecycle, weakness plan refresh, and guard penalties', () => {
    const playKeySound = vi.fn();
    const { result } = renderHook(() => useHardcoreDojo({ playKeySound }));

    expect(result.current.selectedDrill).toBe('relative-jump');
    expect(result.current.gameState).toBe('ready');
    expect(result.current.isTenStageMode).toBe(false);

    act(() => {
      result.current.handleSelectDrill('sudden-death');
    });
    expect(result.current.selectedDrill).toBe('sudden-death');
    expect(result.current.isTenStageMode).toBe(true);

    act(() => {
      result.current.startGame();
    });
    expect(result.current.gameState).toBe('running');

    // Mouse click during sudden-death fails immediately
    act(() => {
      result.current.handleEditorClick();
    });
    expect(result.current.gameState).toBe('sudden-death-failed');
    expect(result.current.suddenDeathFailReason).toBeTruthy();

    // Weakness drill refresh keeps valid state
    act(() => {
      result.current.handleSelectDrill('weakness-custom');
    });
    expect(result.current.isTenStageMode).toBe(true);

    act(() => {
      result.current.handleRefreshWeaknessPlan();
    });
    expect(result.current.gameState).toBe('ready');
    expect(result.current.getTier().className).toBe('bronze');
  });
});
