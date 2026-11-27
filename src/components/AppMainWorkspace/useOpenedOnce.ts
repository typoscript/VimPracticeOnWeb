import { useState } from 'react';

// 처음 열릴 때 지연 로딩한 뒤 마운트를 유지하기 위한 플래그 (한 번 열리면 계속 true)
export function useOpenedOnce(isOpen: boolean): boolean {
  const [opened, setOpened] = useState(isOpen);
  if (isOpen && !opened) setOpened(true);
  return opened || isOpen;
}
