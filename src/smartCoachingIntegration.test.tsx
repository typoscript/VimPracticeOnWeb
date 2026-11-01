import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from './App';

describe('Smart Coaching & Ghost Replayer Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('detects $ followed by a in NORMAL mode and triggers coaching toast', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '$' });
    fireEvent.keyDown(window, { key: 'a' });

    expect(
      screen.getByText('A 키 하나로 줄 끝 이동과 입력 모드 진입을 한 번에 할 수 있습니다!')
    ).toBeInTheDocument();
  });

  it('detects 0 followed by i in NORMAL mode and triggers coaching toast', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '0' });
    fireEvent.keyDown(window, { key: 'i' });

    expect(
      screen.getByText('I 키 하나로 줄 첫 글자 앞에서 바로 입력 모드로 들어갈 수 있습니다!')
    ).toBeInTheDocument();
  });

  it('detects d$ in NORMAL mode and triggers coaching toast', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: '$' });

    expect(
      screen.getByText('대문자 D 또는 C를 누르면 한 타수로 줄 끝까지 삭제/변경됩니다!')
    ).toBeInTheDocument();
  });

  it('detects 4 consecutive Backspaces in INSERT mode and triggers coaching toast', () => {
    render(<App />);

    // Enter insert mode
    fireEvent.keyDown(window, { key: 'i' });

    // Press Backspace 4 times
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(
      screen.getByText('Normal 모드에서 x, dw, 또는 ciw로 지우면 훨씬 빠릅니다!')
    ).toBeInTheDocument();
  });

  it('detects x 3 times in NORMAL mode and triggers coaching toast', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'x' });

    expect(
      screen.getByText('숫자 카운트(3dd, 5x)나 비주얼 라인(V + 이동 + d)을 활용해 보세요!')
    ).toBeInTheDocument();
  });

  it('plays ghost replay of optimalKeys when button is clicked on completed mission', async () => {
    vi.useFakeTimers();

    render(<App />);

    // Complete lesson 1: target is line 2, col 13 ('[' in 'Reach the -> [TARGET]')
    // Initial cursor: line 0, col 0
    act(() => {
      fireEvent.keyDown(window, { key: 'j' });
      fireEvent.keyDown(window, { key: 'j' });
      fireEvent.keyDown(window, { key: 'w' });
      fireEvent.keyDown(window, { key: 'w' });
      fireEvent.keyDown(window, { key: 'w' });
    });

    // Check completion
    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');

    // Replay button should be visible
    const replayBtn = screen.getByTestId('play-optimal-replay-btn');
    expect(replayBtn).toBeInTheDocument();

    // Start ghost replay
    act(() => {
      fireEvent.click(replayBtn);
    });

    // Ghost replay banner should be visible
    expect(screen.getByTestId('ghost-replay-banner')).toHaveTextContent(/자동 재생 중/);

    // Fast-forward through all optimal keys (5 keys * 350ms)
    act(() => {
      vi.advanceTimersByTime(350 * 5);
    });

    // Banner should close after replay finishes and mission stays completed
    expect(screen.queryByTestId('ghost-replay-banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');
  });
});
