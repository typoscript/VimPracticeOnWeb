import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  sendKeys,
  runExCommand,
  getOptions,
  parseColorcolumn,
} from './index';

describe('colorcolumn / cursorcolumn & Insert Ctrl-g u / j / k & :undojoin', () => {
  it(':set colorcolumn(cc) 및 :set cursorcolumn(cuc) 파싱·상대값(+1/-2)·윈도우 로컬 격리·E474 검증을 지원한다', () => {
    let state = createVimState(['hello world']);

    state = runExCommand(state, 'set tw=80 cc=80,+1,100 cuc');
    expect(getOptions(state).colorcolumn).toBe('80,+1,100');
    expect(getOptions(state).cursorcolumn).toBe(true);
    expect(parseColorcolumn(getOptions(state).colorcolumn, getOptions(state).textwidth)).toEqual([
      79, 80, 99,
    ]);

    // 잘못된 colorcolumn 값은 E474 에러
    const bad = runExCommand(state, 'set cc=abc');
    expect(bad.bell).toBe(true);
    expect(bad.commandMessage).toContain('E474');

    // 분할 창에서 :setlocal nocuc cc=40 은 현재 창에만 적용
    state = runExCommand(state, 'vsp');
    state = runExCommand(state, 'setlocal nocuc cc=40');
    expect(getOptions(state).cursorcolumn).toBe(false);
    expect(getOptions(state).colorcolumn).toBe('40');

    state = sendKeys(state, '<C-w>w');
    expect(getOptions(state).cursorcolumn).toBe(true);
    expect(getOptions(state).colorcolumn).toBe('80,+1,100');
  });

  it('Insert 모드 Ctrl-g u 로 Undo 중단점을 삽입해 부분 실행 취소(u)가 가능하다', () => {
    let state = createVimState(['']);

    // i -> "hello " -> Ctrl-g u -> "world" -> Esc
    state = handleKey(state, 'i');
    for (const ch of 'hello ') state = handleKey(state, ch);
    state = handleKey(state, 'Ctrl-g');
    state = handleKey(state, 'u');
    for (const ch of 'world') state = handleKey(state, ch);
    state = handleKey(state, 'Escape');
    expect(state.lines).toEqual(['hello world']);

    // 첫 번째 u: "world" 만 취소되고 "hello " 는 남음!
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['hello ']);

    // 두 번째 u: "hello " 도 취소되어 초기 빈 줄 복원
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['']);
  });

  it('Insert 모드 Ctrl-g j / Ctrl-g k 가 Insert 시작 열을 유지하며 수직 이동한다', () => {
    let state = createVimState(['0123456789', 'abcdefghij', 'klmnopqrst'], { line: 0, col: 4 });

    state = handleKey(state, 'i');
    for (const ch of 'XX') state = handleKey(state, ch);
    // 현재 col은 6이지만, Insert 시작 열(insertStartCol)은 4
    expect(state.cursor).toEqual({ line: 0, col: 6 });

    // Ctrl-g j -> 다음 줄의 col 4 로 이동
    state = handleKey(state, 'Ctrl-g');
    state = handleKey(state, 'j');
    expect(state.cursor).toEqual({ line: 1, col: 4 });

    // Ctrl-g k -> 이전 줄의 col 4 로 이동
    state = handleKey(state, 'Ctrl-g');
    state = handleKey(state, 'k');
    expect(state.cursor).toEqual({ line: 0, col: 4 });
  });

  it(':undojoin 은 다음 변경을 직전 Undo 블록과 하나로 병합하고, undo 직후에는 E790 을 반환한다', () => {
    let state = createVimState(['one two three']);

    // 첫 변경: dw -> 'two three'
    state = sendKeys(state, 'dw');
    expect(state.lines).toEqual(['two three']);

    // :undojoin 후 두 번째 변경: dw -> 'three'
    state = runExCommand(state, 'undojoin');
    expect(state.bell).toBeFalsy();
    state = sendKeys(state, 'dw');
    expect(state.lines).toEqual(['three']);

    // 한 번의 u 로 두 변경이 모두 함께 취소됨!
    state = handleKey(state, 'u');
    expect(state.lines).toEqual(['one two three']);

    // undo 직후 :undojoin 호출 시 E790 에러
    const errState = runExCommand(state, 'undojoin');
    expect(errState.bell).toBe(true);
    expect(errState.commandMessage).toContain('E790');
  });
});
