import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CoachingToast } from './CoachingToast';

describe('CoachingToast Component', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(
      <CoachingToast message={null} onDismiss={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders toast message and handles dismiss button click', () => {
    const handleDismiss = vi.fn();
    render(
      <CoachingToast
        message="이동 키를 연타하는 대신 w, b를 사용해 보세요!"
        onDismiss={handleDismiss}
      />
    );

    expect(screen.getByTestId('coaching-toast')).toBeInTheDocument();
    expect(
      screen.getByText('이동 키를 연타하는 대신 w, b를 사용해 보세요!')
    ).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /닫기/i });
    fireEvent.click(closeBtn);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
