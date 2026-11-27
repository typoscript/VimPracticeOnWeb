import { describe, it, expect } from 'vitest';
import { handleKey } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';
import { toEngineKeys } from '../scripts/neovimFuzzKeys';
import findings from './fixtures/neovim-fuzz-findings.json';

/**
 * scripts/neovimFuzz.ts (실제 Neovim 무작위 비교)로 찾아 고친 차이를 고정합니다.
 * 기대값은 scripts/neovimFuzzFixtures.ts 가 nvim --headless 로 만든 값이며, 이 테스트는 nvim 없이 돕니다.
 */
interface Finding {
  id: string;
  text: string;
  cursor: { row: number; col: number };
  keys: string;
  expected: {
    lines: string[];
    cursor: { row: number; col: number };
    reg: string;
    regType: 'char' | 'line' | 'block';
  };
}

describe('Neovim 비교 퍼저로 찾은 차이', () => {
  it.each((findings as Finding[]).map((f) => [f.id, f] as const))('%s', (_id, f) => {
    let state: VimEditorState = {
      lines: f.text.split('\n'),
      cursor: { line: f.cursor.row, col: f.cursor.col },
      mode: 'NORMAL',
    };
    for (const key of toEngineKeys(f.keys)) state = handleKey(state, key);

    expect(state.lines).toEqual(f.expected.lines);
    expect({ row: state.cursor.line, col: state.cursor.col }).toEqual(f.expected.cursor);
    expect(state.mode).toBe('NORMAL');
    const entry = state.registers?.['"'];
    const reg = entry ? String(entry.content ?? '') + (entry.type === 'line' ? '\n' : '') : '';
    expect(reg).toBe(f.expected.reg);
  });
});
