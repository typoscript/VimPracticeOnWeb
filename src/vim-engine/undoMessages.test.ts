import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { configureVimEngine, handleKey } from './index';
import type { VimEditorState } from './index';

/**
 * u / Ctrl-r 뒤 상태 메시지 (Vim u_undo_end). 기대값은 nvim --headless 에서
 * feedkeys(…, 'tx') 로 실제 키 입력처럼 넣어 확인했습니다.
 */
function run(keys: string[]): string | undefined {
  let s: VimEditorState = {
    lines: ['abc', 'bcd', 'cde', 'def', 'efg'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
  };
  for (const k of keys) s = handleKey(s, k);
  return s.commandMessage;
}
const ex = (cmd: string) => [':', ...cmd.split(''), 'Enter'];

describe('실행 취소 / 다시 실행 메시지', () => {
  beforeAll(() => configureVimEngine({ locale: 'en' }));
  afterAll(() => configureVimEngine({ locale: 'ko' }));

  it.each([
    ['여러 줄 삭제를 되돌림', [...ex('1,3d'), 'u'], '3 more lines; before #1  0 seconds ago'],
    ['한 줄 삭제를 되돌림', ['d', 'd', 'u'], '1 more line; before #1  0 seconds ago'],
    ['붙여넣은 줄을 되돌림', ['y', 'y', 'p', 'u'], '1 line less; before #1  0 seconds ago'],
    ['줄 수가 같으면 바뀐 줄 수', ['x', 'u'], '1 change; before #1  0 seconds ago'],
    ['여러 줄 치환', [...ex('%s/./X/'), 'u'], '5 changes; before #1  0 seconds ago'],
    ['두 번째 변경을 되돌리면 #2', ['x', 'x', 'u'], '1 change; before #2  0 seconds ago'],
    ['세 번 변경 후 두 번 되돌림', ['x', 'x', 'x', 'u', 'u'], '1 change; before #2  0 seconds ago'],
    ['다시 실행은 after', ['x', 'x', 'u', 'u', 'Ctrl-r'], '1 change; after #1  0 seconds ago'],
    ['줄 삭제 다시 실행', ['d', 'd', 'u', 'Ctrl-r'], '1 line less; after #1  0 seconds ago'],
    ['되돌릴 것이 없음', ['u'], 'Already at oldest change'],
    ['다시 실행할 것이 없음', ['Ctrl-r'], 'Already at newest change'],
  ])('%s', (_name, keys, expected) => {
    expect(run(keys)).toBe(expected);
  });
});
