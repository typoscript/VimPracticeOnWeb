import { describe, it, expect } from 'vitest';
import { handleKey } from './index';
import type { VimEditorState } from './index';

/** % 의 C 주석 짝 이동. 기대값은 모두 nvim --headless -u NONE 으로 확인했습니다. */
function run(lines: string[], keys: string): string {
  let s: VimEditorState = { lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
  for (const k of keys) s = handleKey(s, k);
  return `[${s.cursor.line + 1}, ${s.cursor.col + 1}]|${s.lines.join('|')}`;
}

describe('% 와 C 주석 경계', () => {
  const line = ['const s = "r"; /*BUG*/'];

  it.each([
    ['여는 경계에서 닫는 경계의 / 로', line, 'f/%', '[1, 22]|const s = "r"; /*BUG*/'],
    ['d% 는 주석 전체를 지운다', line, 'f/d%', '[1, 15]|const s = "r"; '],
    ['닫는 경계에서 여는 경계의 / 로', line, '$%', '[1, 16]|const s = "r"; /*BUG*/'],
    ['여러 줄 주석', ['a /* one', 'two */ b'], 'f/%', '[2, 6]|a /* one|two */ b'],
    ['커서가 경계 위가 아니면 주석을 찾지 않는다', line, '0%', '[1, 1]|const s = "r"; /*BUG*/'],
    ['주석 안에서는 뒤쪽 괄호를 찾는다', ['a /*x*/ (y)'], 'fx%', '[1, 11]|a /*x*/ (y)'],
    ['주석 안에서 d% 는 뒤쪽 괄호까지 지운다', ['x /*BUG*/ (a)'], 'fBd%', '[1, 4]|x /*'],
    ['괄호가 먼저면 괄호 짝', ['a (x) /* c */'], '0%', '[1, 5]|a (x) /* c */'],
  ])('%s', (_name, lines, keys, expected) => {
    expect(run(lines as string[], keys as string)).toBe(expected);
  });
});
