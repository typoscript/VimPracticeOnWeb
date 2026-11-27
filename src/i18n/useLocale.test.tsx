import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

describe('useLocale', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('setLocale("en") 뒤에 영어 사전이 늦게 도착해도 화면을 다시 그린다', async () => {
    // setup.ts 가 사전을 미리 등록한 인스턴스와 별개로, 사전이 아직 없는 새 i18n 모듈을 불러옵니다.
    vi.resetModules();
    const i18n = await import('./index');
    const { result } = renderHook(() => {
      i18n.useLocale();
      return i18n.t('닫기');
    });
    expect(result.current).toBe('닫기');

    act(() => {
      i18n.setLocale('en', { persist: false });
    });
    await waitFor(() => expect(result.current).toBe('Close'));

    act(() => {
      i18n.setLocale('ko', { persist: false });
    });
    expect(result.current).toBe('닫기');
  });
});
