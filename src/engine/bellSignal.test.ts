import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from '../types/vim';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return {
    lines,
    cursor,
    mode: 'NORMAL',
  };
}

function press(state: VimEditorState, keys: string[]): VimEditorState {
  return keys.reduce((s, k) => handleKey(s, k), state);
}

describe('Bell Signal: 키 실패 시 매크로 중단 (실제 Vim 동작)', () => {
  it('마지막 줄에서 j가 실패하면 남은 반복 횟수를 버린다 (10@a)', () => {
    let state = press(createState(['abcdef', 'abcdef', 'abcdef']), ['q', 'a', 'x', 'j', 'q']);
    state = press(state, ['1', '0', '@', 'a']);
    expect(state.lines).toEqual(['bcdef', 'bcdef', 'bcdef']);
    expect(state.cursor.line).toBe(2);
  });

  it('재귀 매크로(qb x j @b q)는 파일 끝에서 멈춘다', () => {
    // qbq 로 레지스터 b를 비운 뒤 재귀 매크로 녹화
    let state = press(createState(['abcdef', 'abcdef', 'abcdef']), ['q', 'b', 'q', 'q', 'b', 'x', 'j', '@', 'b', 'q']);
    expect(state.lines).toEqual(['bcdef', 'abcdef', 'abcdef']);

    state = press(state, ['@', 'b']);
    expect(state.lines).toEqual(['bcdef', 'bcdef', 'bcdef']);
    // 실패로 중단된 매크로는 bell을 남기고, bell은 다음 키 입력에서 사라진다
    expect(state.bell).toBe(true);
    expect(handleKey(state, '0').bell).toBeUndefined();
  });

  it('f{char} 대상 문자를 찾지 못하면 이후 키를 실행하지 않는다', () => {
    let state = press(createState(['a,b,c,d']), ['q', 'c', 'f', ',', 'r', ';', 'q']);
    expect(state.lines[0]).toBe('a;b,c,d');

    // 쉼표가 2개 남았으므로 5번 반복해도 2번만 치환되고, 실패 후 r; 은 실행되지 않는다
    state = press(state, ['5', '@', 'c']);
    expect(state.lines[0]).toBe('a;b;c;d');
  });

  it('검색 실패(E486) 시 매크로를 중단한다', () => {
    const withMacro = (content: string[]): VimEditorState => ({
      ...createState(['abc', 'def']),
      registers: { e: { type: 'macro', content } },
    });

    // 대조군: 검색 성공 시 이후 x 가 실행된다
    const found = press(withMacro(['/', 'd', 'Enter', 'x']), ['@', 'e']);
    expect(found.lines).toEqual(['abc', 'ef']);

    // 검색 실패 시 x 는 실행되지 않는다
    const missing = press(withMacro(['/', 'z', 'z', 'Enter', 'x']), ['@', 'e']);
    expect(missing.lines).toEqual(['abc', 'def']);
  });

  it('실패한 키만 bell을 울리고, bell은 다음 키 입력에서 사라진다', () => {
    const base = createState(['abc', 'def']);
    expect(handleKey(base, 'j').bell).toBeUndefined();
    expect(handleKey(base, 'x').bell).toBeUndefined();
    expect(handleKey(base, '0').bell).toBeUndefined();
    // 첫 줄의 k, 줄 시작의 h, 없는 문자 f 는 실패
    expect(handleKey(base, 'k').bell).toBe(true);
    expect(handleKey(base, 'h').bell).toBe(true);
    expect(press(base, ['f', 'z']).bell).toBe(true);
    expect(press(base, ['/', 'z', 'Enter']).bell).toBe(true);

    const afterBell = press(base, ['k', 'l']);
    expect(afterBell.bell).toBeUndefined();
    expect(afterBell.cursor.col).toBe(1);
  });

  it('매크로 밖에서 실패한 모션은 다음 매크로 실행에 영향을 주지 않는다', () => {
    let state = press(createState(['abc', 'abc']), ['q', 'a', 'x', 'q']);
    state = press(state, ['k', 'k']); // 매크로 밖의 실패 모션
    state = press(state, ['@', 'a']);
    expect(state.lines[0]).toBe('c');
  });

  it('. 반복은 실패한 키에서 중단된다', () => {
    let state = press(createState(['a', 'b', 'c']), ['d', 'j']);
    expect(state.lines).toEqual(['c']);
    state = press(state, ['.']);
    expect(state.lines).toEqual(['c']);
    expect(state.bell).toBe(true);
  });

  it(':normal 은 줄마다 실패한 키 이후를 버린다 (:%norm jx)', () => {
    const state = press(createState(['a1', 'b2', 'c3']), [':', '%', 'n', 'o', 'r', 'm', ' ', 'j', 'x', 'Enter']);
    // 마지막 줄에서는 j가 실패하므로 x가 실행되지 않는다
    expect(state.lines).toEqual(['a1', '2', '3']);
  });

  it('키매핑 확장도 실패한 키에서 중단된다', () => {
    let state = press(createState(['abc', 'def']), [':', 'n', 'n', 'o', 'r', 'e', 'm', 'a', 'p', ' ', 'Q', ' ', 'k', 'x', 'Enter']);
    // 대조군: 두 번째 줄에서는 k 성공 후 x 실행
    const control = press({ ...state, cursor: { line: 1, col: 0 } }, ['Q']);
    expect(control.lines).toEqual(['bc', 'def']);

    state = press(state, ['Q']);
    // 첫 줄에서 k가 실패하므로 x는 실행되지 않는다
    expect(state.lines).toEqual(['abc', 'def']);
  });

  it('매크로 안의 dj 실패(마지막 줄)도 매크로를 중단시킨다', () => {
    let state = press(createState(['1', '2', '3', '4', '5']), ['q', 'a', 'd', 'j', 'q']);
    expect(state.lines).toEqual(['3', '4', '5']);
    state = press(state, ['9', '@', 'a']);
    // 3,4 삭제 → 5 한 줄 남은 상태에서 dj 실패로 중단
    expect(state.lines).toEqual(['5']);
  });

  it('Vim 이 실패(beep/에러)로 처리하는 명령은 버퍼를 바꾸지 않고 bell 을 울린다', () => {
    const L = ['ab cd', 'ef gh'];
    const cases: [string, string[], { line: number; col: number }][] = [
      ['VISUAL 의 실패한 j', ['v', 'j'], { line: 1, col: 0 }],
      ['VISUAL_LINE 의 실패한 k', ['V', 'k'], { line: 0, col: 0 }],
      ['괄호 없는 %', ['%'], { line: 0, col: 0 }],
      ['괄호 없는 d%', ['d', '%'], { line: 0, col: 0 }],
      ['설정되지 않은 마크', ["'", 'a'], { line: 0, col: 0 }],
      ['마지막 줄의 J', ['J'], { line: 1, col: 0 }],
      ['숫자가 없는 줄의 Ctrl-a', ['Ctrl-a'], { line: 0, col: 0 }],
      ['줄 길이보다 큰 [count]r', ['9', 'r', 'x'], { line: 0, col: 0 }],
      ['빈 레지스터 붙여넣기', ['"', 'z', 'p'], { line: 0, col: 0 }],
      ['알 수 없는 Ex 명령', [':', 'b', 'o', 'g', 'u', 's', 'x', 'Enter'], { line: 0, col: 0 }],
    ];
    for (const [label, keys, cursor] of cases) {
      const state = press(createState([...L], cursor), keys);
      expect(state.lines, label).toEqual(L);
      expect(state.bell, label).toBe(true);
    }
    expect(press(createState(['  ', 'x']), ['*']).commandMessage).toMatch(/^E348/);
    expect(press(createState([...L]), ['p']).commandMessage).toMatch(/^E353/);
  });

  it('VISUAL 모드의 실패한 모션도 매크로를 중단시킨다', () => {
    // 두 줄씩 V j d 로 지우다가, 한 줄만 남으면 j 가 실패하여 d 는 실행되지 않는다
    let state = press(createState(['1', '2', '3', '4', '5']), ['q', 'a', 'V', 'j', 'd', 'q']);
    expect(state.lines).toEqual(['3', '4', '5']);
    state = press(state, ['5', '@', 'a']);
    expect(state.lines).toEqual(['5']);
    expect(state.mode).toBe('VISUAL_LINE');
    expect(state.bell).toBe(true);
  });

  it('연산자와 함께 쓴 e 는 버퍼 끝에서도 실패하지 않고 마지막 문자에 적용된다 (Vim nv_wordcmd)', () => {
    const state = press(createState(['ab cd', 'ef gh'], { line: 1, col: 4 }), ['d', 'e']);
    expect(state.lines).toEqual(['ab cd', 'ef g']);
    expect(state.bell).toBeUndefined();
    // 연산자 없는 e 는 실패
    expect(press(createState(['ab cd', 'ef gh'], { line: 1, col: 4 }), ['e']).bell).toBe(true);
  });

  it('빈 줄의 dl 은 아무것도 하지 않지만 실패로 보지 않는다 (Vim nv_right)', () => {
    const state = press(createState(['', 'a']), ['d', 'l']);
    expect(state.lines).toEqual(['', 'a']);
    expect(state.bell).toBeUndefined();
  });
});

describe('문단 모션 } 의 마지막 줄 처리 (:help })', () => {
  const L = ['ab cd', 'ef gh'];

  it('} 가 마지막 줄에 도달하면 그 줄의 마지막 문자로 이동한다', () => {
    expect(press(createState([...L], { line: 1, col: 2 }), ['}']).cursor).toEqual({ line: 1, col: 4 });
    expect(press(createState(['a', 'b', '', 'c']), ['}']).cursor).toEqual({ line: 2, col: 0 });
  });

  it('마지막 줄 중간에서 d} / y} / c} 는 줄 끝까지(inclusive) 다루고 텍스트를 복제하지 않는다', () => {
    const d = press(createState([...L], { line: 1, col: 2 }), ['d', '}']);
    expect(d.lines).toEqual(['ab cd', 'ef']);
    expect(d.registers?.['"']?.content).toBe(' gh');

    const y = press(createState([...L], { line: 1, col: 2 }), ['y', '}']);
    expect(y.lines).toEqual(L);
    expect(y.registers?.['0']?.content).toBe(' gh');

    const c = press(createState([...L], { line: 1, col: 2 }), ['c', '}']);
    expect(c.lines).toEqual(['ab cd', 'ef']);
    expect(c.mode).toBe('INSERT');
    expect(c.cursor).toEqual({ line: 1, col: 2 });
  });
});
