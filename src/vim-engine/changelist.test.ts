import { describe, expect, it } from 'vitest';
import { handleKey } from './index';
import type { VimEditorState } from './index';

const run = (lines: string[], keys: string[], cursor = { line: 1, col: 6 }): VimEditorState =>
  keys.reduce<VimEditorState>((s, k) => handleKey(s, k), { lines, cursor, mode: 'NORMAL' });

const TEXT = ['aaaa bbbb cccc', 'dddd eeee ffff', 'gggg hhhh', 'iiii'];

describe('변경 목록 (Vim changed_common / ex_changes)', () => {
  it('같은 줄의 가까운 변경은 한 항목으로 합치고, 다른 줄은 새 항목', () => {
    const s = run(TEXT, ['x', 'x', 'j', 'x']);
    expect(s.changeList?.map((e) => [e.row, e.col])).toEqual([[1, 6], [2, 6]]);
    expect(s.changeIndex).toBe(2);
  });

  it(':changes 는 현재 위치와의 거리·1 기준 줄·0 기준 열·앞 공백을 뺀 내용을 보여 줍니다', () => {
    let s = run(['  abc', 'def'], ['l', 'l', 'x', 'j', 'x'], { line: 0, col: 0 });
    s = handleKey(handleKey(s, 'g'), ';');
    for (const k of [':', 'c', 'h', 'a', 'n', 'g', 'e', 's', 'Enter']) s = handleKey(s, k);
    expect(s.commandMessage).toBe(['change line  col text', '    1     1    2 bc', '>   0     2    2 de'].join('\n'));
  });

  it('비어 있으면 E664, 끝에서는 E662 / E663 을 내고 벨을 울립니다', () => {
    const empty = handleKey(handleKey({ lines: ['ab'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' }, 'g'), ';');
    expect(empty.bell).toBe(true);
    expect(empty.commandMessage).toContain('E664');
    let s = run(TEXT, ['x']);
    s = handleKey(handleKey(s, 'g'), ';');
    const atStart = handleKey(handleKey(s, 'g'), ';');
    expect(atStart.commandMessage).toContain('E662');
    const atEnd = handleKey(handleKey(s, 'g'), ',');
    expect(atEnd.commandMessage).toContain('E663');
  });

  it('100 개까지만 보관합니다', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i}`);
    let s: VimEditorState = { lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
    for (let i = 0; i < 110; i++) {
      s = handleKey(s, 'x');
      s = handleKey(s, 'j');
    }
    expect(s.changeList).toHaveLength(100);
    expect(s.changeList?.[0].row).toBe(10);
  });
});
