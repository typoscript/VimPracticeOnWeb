import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, executeCommandLine } from '../vim-engine';
import { getReturnToNormalKeys } from './returnToNormalKeys';

const run = (state: ReturnType<typeof createVimState>, keys: string[]) =>
  keys.reduce((s, k) => handleKey(s, k), state);

describe('getReturnToNormalKeys (UI 버튼 키 주입 전 NORMAL 복귀)', () => {
  it('NORMAL 모드에서는 아무 키도 보내지 않는다', () => {
    expect(getReturnToNormalKeys(createVimState(['a'], { line: 0, col: 0 }))).toEqual([]);
  });

  it('TERMINAL 모드에서는 Ctrl-\\ Ctrl-n 으로 빠져나온 뒤 Ex 명령이 실행된다', () => {
    let s = executeCommandLine(createVimState(['a'], { line: 0, col: 0 }), 'ToggleTerm', handleKey);
    expect(s.mode).toBe('TERMINAL');
    const keys = getReturnToNormalKeys(s);
    expect(keys).toEqual(['Ctrl-\\', 'Ctrl-n']);
    s = run(s, [...keys, ':', 's', 'e', 't', ' ', 'n', 'u', 'Enter']);
    expect(s.mode).toBe('NORMAL');
    expect(s.options?.number).toBe(true);
  });

  it('INSERT 모드·대기 키는 Escape 로 정리한다', () => {
    const ins = run(createVimState(['a'], { line: 0, col: 0 }), ['i']);
    expect(getReturnToNormalKeys(ins)).toEqual(['Escape']);
    const pending = run(createVimState(['a'], { line: 0, col: 0 }), ['d']);
    expect(getReturnToNormalKeys(pending)).toEqual(['Escape']);
  });
});
