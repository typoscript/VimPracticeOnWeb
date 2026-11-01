import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ArcadeSurvival } from './ArcadeSurvival';

describe('ArcadeSurvival 컴포넌트', () => {
  const onPlayKeySound = vi.fn();
  const onPlaySuccessSound = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('초기 Ready 화면을 표시하고 시작 버튼 클릭 시 게임이 시작된다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    expect(screen.getByTestId('arcade-ready-modal')).toBeDefined();
    expect(screen.getByText(/Vim Defense/i)).toBeDefined();

    const startBtn = screen.getByTestId('start-arcade-btn');
    fireEvent.click(startBtn);

    // Ready 오버레이 제거되고 HUD가 활성화됨
    expect(screen.queryByTestId('arcade-ready-modal')).toBeNull();
    expect(screen.getByTestId('arcade-wave').textContent).toBe('1');
    expect(screen.getByTestId('arcade-score').textContent).toBe('0');
  });

  it('방향키 입력 시 페널티 배너가 나타나고 콤보가 리셋된다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    // 방향키 누름
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });

    expect(screen.getByTestId('penalty-banner')).toBeDefined();
    expect(screen.getByTestId('penalty-banner').textContent).toContain('방향키 사용으로 콤보가 리셋');
  });

  it('제한 시간이 0이 되면 게임 오버 화면이 표시된다', () => {
    vi.useFakeTimers();
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    // 16초 이상 시간 경과
    act(() => {
      vi.advanceTimersByTime(16000);
    });

    expect(screen.getByTestId('arcade-gameover-modal')).toBeDefined();
    expect(screen.getByText('TIME OVER!')).toBeDefined();

    vi.useRealTimers();
  });
});
