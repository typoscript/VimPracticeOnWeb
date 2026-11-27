import { useEffect } from 'react';

/**
 * 연습 도중 실수로 탭을 닫지 않게 막습니다.
 * Vim 사용자는 창 명령으로 Ctrl+W 를 누르기 쉬운데, 브라우저는 이 키를 페이지에 넘기지 않고 탭을 닫습니다.
 * 작업 중일 때만 브라우저의 "사이트에서 나가시겠습니까?" 확인 창을 띄웁니다.
 */
export function useTabCloseGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 오래된 브라우저는 returnValue 가 있어야 확인 창을 띄웁니다.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);
}
