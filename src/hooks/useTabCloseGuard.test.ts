import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTabCloseGuard } from './useTabCloseGuard';

const fireBeforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('useTabCloseGuard', () => {
  it('작업 중일 때만 탭 닫기 확인을 요청한다', () => {
    const { rerender, unmount } = renderHook(({ active }) => useTabCloseGuard(active), {
      initialProps: { active: false },
    });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    rerender({ active: true });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    rerender({ active: false });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);

    rerender({ active: true });
    unmount();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
