import { useEffect } from 'react';

/**
 * 모달이 열려 있는 동안 Esc 로 닫습니다 (커리큘럼 모달과 같은 동작).
 * 모달 안에 Vim 에디터가 있어 Esc 를 Vim 에 넘겨야 하는 화면(데일리 챌린지 등)에는 쓰지 마세요.
 */
export function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}
