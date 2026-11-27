import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppErrorBoundary } from './AppErrorBoundary';

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <div>정상 화면</div>;
}

describe('AppErrorBoundary', () => {
  it('자식이 렌더링 중 던지면 복구 화면을 보여 주고, 다시 시도하면 새로 마운트한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    render(
      <AppErrorBoundary>
        <Bomb />
      </AppErrorBoundary>
    );
    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByTestId('app-error-retry'));
    expect(screen.getByText('정상 화면')).toBeInTheDocument();
    spy.mockRestore();
  });
});
