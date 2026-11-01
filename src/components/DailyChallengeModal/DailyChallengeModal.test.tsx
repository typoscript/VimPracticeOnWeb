import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailyChallengeModal } from './DailyChallengeModal';

describe('DailyChallengeModal 컴포넌트', () => {
  const onPlayKeySound = vi.fn();
  const onPlaySuccessSound = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('isOpen이 false일 때는 렌더링되지 않는다', () => {
    render(
      <DailyChallengeModal
        isOpen={false}
        onClose={vi.fn()}
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
      />
    );
    expect(screen.queryByTestId('daily-modal')).toBeNull();
  });

  it('isOpen이 true일 때 데일리 챌린지 정보와 에디터를 렌더링한다', () => {
    render(
      <DailyChallengeModal
        isOpen={true}
        onClose={vi.fn()}
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
      />
    );

    expect(screen.getByTestId('daily-modal')).toBeDefined();
    expect(screen.getByText(/DAILY VIM GOLF/i)).toBeDefined();
    expect(screen.getByTestId('toggle-daily-hint-btn')).toBeDefined();
  });

  it('힌트 버튼 클릭 시 힌트 배너가 토글된다', () => {
    render(
      <DailyChallengeModal
        isOpen={true}
        onClose={vi.fn()}
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
      />
    );

    expect(screen.queryByTestId('daily-hint-banner')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle-daily-hint-btn'));
    expect(screen.getByTestId('daily-hint-banner')).toBeDefined();
  });

  it('닫기 버튼 클릭 시 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(
      <DailyChallengeModal
        isOpen={true}
        onClose={onClose}
        onPlayKeySound={onPlayKeySound}
        onPlaySuccessSound={onPlaySuccessSound}
      />
    );

    fireEvent.click(screen.getByTestId('close-daily-modal-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
