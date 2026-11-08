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

  it('파워업 아이템 HUD 및 초기 수량이 정상 표시된다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    expect(screen.getByTestId('hud-powerups-bar')).toBeDefined();
    expect(screen.getByTestId('freeze-count').textContent).toBe('x1');
    expect(screen.getByTestId('bomb-count').textContent).toBe('x1');
    expect(screen.getByTestId('shield-count').textContent).toBe('x0');
  });

  it('시간 정지 (Chrono Freeze) 버튼 클릭 시 5초간 시간이 정지된다', () => {
    vi.useFakeTimers();
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    const freezeBtn = screen.getByTestId('powerup-freeze-btn');
    fireEvent.click(freezeBtn);

    expect(screen.getByTestId('freeze-count').textContent).toBe('x0');
    expect(screen.getByTestId('skill-banner')).toBeDefined();
    expect(screen.getByTestId('skill-banner').textContent).toContain('시간 정지 발동');
    expect(screen.getByTestId('arcade-timer').textContent).toContain('⏳');

    // 2초 경과 후에도 타이머가 동결 카운트다운을 유지함
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('arcade-timer').textContent).toContain('⏳ 3.0s');

    vi.useRealTimers();
  });

  it('버그 폭탄 (Bug Annihilator Bomb) 단축키 Ctrl+B 입력 시 즉시 웨이브가 클리어된다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));
    expect(screen.getByTestId('arcade-wave').textContent).toBe('1');

    // Ctrl+B 단축키 입력
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })
      );
    });

    expect(onPlaySuccessSound).toHaveBeenCalled();
    expect(screen.getByTestId('bomb-count').textContent).toBe('x0');
    expect(screen.getByTestId('skill-banner').textContent).toContain('버그 폭탄 폭발');
    expect(screen.getByTestId('arcade-wave').textContent).toBe('2');
    expect(Number(screen.getByTestId('arcade-score').textContent)).toBeGreaterThan(0);
  });

  it('3콤보 달성 시 쉴드를 획득하고 방향키 페널티로부터 콤보를 방어한다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    // Wave 1 해결: f / D
    ['f', '/', 'D'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    expect(screen.getByTestId('arcade-wave').textContent).toBe('2');
    expect(screen.getByTestId('arcade-combo').textContent).toBe('1x');

    // Wave 2 해결: f # x
    ['f', '#', 'x'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    expect(screen.getByTestId('arcade-wave').textContent).toBe('3');
    expect(screen.getByTestId('arcade-combo').textContent).toBe('2x');

    // Wave 3 해결: j d d
    ['j', 'd', 'd'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    expect(screen.getByTestId('arcade-wave').textContent).toBe('4');
    expect(screen.getByTestId('arcade-combo').textContent).toBe('3x');

    // 3콤보 달성으로 쉴드 1개 획득 확인
    expect(screen.getByTestId('shield-count').textContent).toBe('x1');

    // 방향키 누름 -> 쉴드가 방어하여 콤보 유지 (3x)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    expect(screen.getByTestId('penalty-banner').textContent).toContain('쉴드 방어');
    expect(screen.getByTestId('arcade-combo').textContent).toBe('3x');
    expect(screen.getByTestId('shield-count').textContent).toBe('x0');

    // 쉴드 소진 후 다시 방향키 누름 -> 콤보 리셋
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    expect(screen.getByTestId('penalty-banner').textContent).toContain('방향키 사용으로 콤보가 리셋');
    expect(screen.getByTestId('arcade-combo').textContent).toBe('-');
  });

  it('Wave 5 진입 시 보스전 UI 배지 및 알림 배너가 렌더링된다', () => {
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    // Wave 1: f / D
    ['f', '/', 'D'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    // Wave 2: f # x
    ['f', '#', 'x'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    // Wave 3: j d d
    ['j', 'd', 'd'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    // Wave 4: c i " Escape
    ['c', 'i', '"', 'Escape'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });

    // Wave 5 도달!
    expect(screen.getByTestId('arcade-wave').textContent).toBe('5');
    expect(screen.getByText('👑 보스전')).toBeDefined();
    expect(screen.getByTestId('boss-alert-banner')).toBeDefined();
    expect(screen.getByTestId('boss-alert-banner').textContent).toContain('GIGANTIC_MEMORY_LEAK');
  });

  it('쉴드를 보유한 상태에서 시간 초과 시 쉴드가 비상 발동되어 +5초를 회복하고 게임 오버를 방어한다', () => {
    vi.useFakeTimers();
    render(
      <ArcadeSurvival
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
        isMuted={false}
      />
    );

    fireEvent.click(screen.getByTestId('start-arcade-btn'));

    // 3개 웨이브 클리어로 쉴드 1개 획득
    ['f', '/', 'D'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    ['f', '#', 'x'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });
    ['j', 'd', 'd'].forEach((k) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
    });

    expect(screen.getByTestId('shield-count').textContent).toBe('x1');

    // Wave 4 제한 시간 초과
    act(() => {
      vi.advanceTimersByTime(12000);
    });

    // 쉴드가 비상 발동되어 게임 오버 대신 +5초 연장 및 스킬 배너 표시
    expect(screen.queryByTestId('arcade-gameover-modal')).toBeNull();
    expect(screen.getByTestId('shield-count').textContent).toBe('x0');
    expect(screen.getByTestId('skill-banner').textContent).toContain('쉴드 비상 발동');

    vi.useRealTimers();
  });
});
