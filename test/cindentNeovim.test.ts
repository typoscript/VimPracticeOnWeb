import { describe, it, expect } from 'vitest';
import { handleKey } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';
import cases from './fixtures/neovim-cindent-cases.json';

/**
 * `gg=G` (C 들여쓰기) 결과를 실제 Neovim 과 비교합니다.
 * 기대값은 scripts/neovimCindentFixtures.ts 가 `nvim --headless -u NONE` (ts=2 sw=2 et) 로 만든 값이며,
 * 이 테스트는 nvim 없이 돕니다.
 */
interface CindentCase {
  id: string;
  lines: string[];
  expected: string[];
}

describe('= 연산자 C 들여쓰기 (Neovim 결과)', () => {
  it.each((cases as CindentCase[]).map((c) => [c.id, c] as const))('%s', (_id, c) => {
    let state: VimEditorState = { lines: c.lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
    for (const key of ['g', 'g', '=', 'G']) state = handleKey(state, key);
    expect(state.lines).toEqual(c.expected);
  });
});
