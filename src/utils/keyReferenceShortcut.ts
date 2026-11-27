/** Vim 키 사전 창을 여닫는 단축키: Ctrl+/ (macOS 는 Cmd+/) */
export function isKeyReferenceShortcut(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>
): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'Slash' || e.key === '/');
}
