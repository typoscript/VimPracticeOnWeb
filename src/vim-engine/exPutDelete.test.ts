import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from './types';

function run(lines: string[], keys: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  let state: VimEditorState = { lines, cursor, mode: 'NORMAL' };
  for (const k of keys) state = handleKey(state, k);
  return state;
}
const ex = (cmd: string) => [':', ...cmd.split(''), 'Enter'];
const L = () => ['one', 'two', 'three', 'four'];

describe(':d {reg} / :y {reg} / :put', () => {
  it(':2d a 는 a 레지스터에 저장하고 무명 레지스터도 갱신한다', () => {
    const s = run(L(), ex('2d a'));
    expect(s.lines).toEqual(['one', 'three', 'four']);
    expect(s.registers?.a).toEqual({ type: 'line', content: 'two' });
  });

  it(':1d _ 는 블랙홀이라 레지스터를 건드리지 않는다', () => {
    const s = run(L(), [...'yy'.split(''), 'j', ...ex('d _')]);
    expect(s.lines).toEqual(['one', 'three', 'four']);
    expect(s.clipboard?.content).toBe('one');
  });

  it(':d 2 는 현재 줄부터 2줄, :2d 2 는 2번 줄부터 2줄', () => {
    expect(run(L(), ex('d 2')).lines).toEqual(['three', 'four']);
    expect(run(L(), ex('2d 2')).lines).toEqual(['one', 'four']);
  });

  it(':d A 는 대문자 레지스터에 누적', () => {
    const s = run(L(), [...ex('1d a'), ...ex('1d A')]);
    expect(s.registers?.a?.content).toBe('one\ntwo');
  });

  it(':2,3y b 후 :$put b 로 맨 끝에 붙인다', () => {
    const s = run(L(), [...ex('2,3y b'), ...ex('$put b')]);
    expect(s.lines).toEqual([...L(), 'two', 'three']);
    expect(s.cursor.line).toBe(5);
  });

  it(':put! 은 현재 줄 위에, :0put 은 맨 위에 넣는다', () => {
    const s = run(L(), [...'yy'.split(''), 'G', ...ex('put!')]);
    expect(s.lines).toEqual(['one', 'two', 'three', 'one', 'four']);
    expect(run(L(), [...'yy'.split(''), ...ex('0put')]).lines[0]).toBe('one');
    expect(run(L(), [...'yy'.split(''), ...ex('0put')]).lines.length).toBe(5);
  });

  it('문자 단위 레지스터도 :put 은 줄 단위로 넣는다', () => {
    const s = run(['foo bar'], ['y', 'w', ...ex('put')]);
    expect(s.lines).toEqual(['foo bar', 'foo ']);
  });

  it('빈 레지스터 :put z 는 E353 + bell', () => {
    const s = run(L(), ex('put z'));
    expect(s.commandMessage).toContain('E353');
    expect(s.bell).toBe(true);
  });

  it(':put 한 번은 한 번의 undo 로 되돌아간다', () => {
    const s = run(L(), [...'yy'.split(''), ...ex('put'), 'u']);
    expect(s.lines).toEqual(L());
  });
});
