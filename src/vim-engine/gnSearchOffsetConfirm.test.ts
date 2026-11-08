import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from './types';

function createState(lines: string[], cursor = { line: 0, col: 0 }): VimEditorState {
  return {
    lines,
    cursor,
    mode: 'NORMAL',
  };
}

describe('gn / gN Search Match Text Object & Dot Repeat', () => {
  it('단독 gn 입력 시 다음 검색 매치 위치로 점프하고 VISUAL 모드로 영역을 선택한다', () => {
    let state = createState([
      'const foo = 1;',
      'const bar = foo + 2;',
      'return foo;',
    ]);

    // /foo<Enter>
    for (const k of ['/', 'f', 'o', 'o', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 0, col: 6 });

    // Escape 후 커서를 줄 시작으로 이동
    state = handleKey(state, '0');
    expect(state.cursor).toEqual({ line: 0, col: 0 });

    // gn 입력
    state = handleKey(state, 'g');
    state = handleKey(state, 'n');

    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual({ line: 0, col: 6 });
    expect(state.cursor).toEqual({ line: 0, col: 8 }); // 'foo' length 3 -> col 6 to 8
  });

  it('VISUAL 모드에서 추가 gn 입력 시 다음 매치로 선택 영역을 확장한다', () => {
    let state = createState([
      'item item item',
    ]);

    for (const k of ['/', 'i', 't', 'e', 'm', 'Enter']) {
      state = handleKey(state, k);
    }
    // 첫 번째 매치 선택
    state = handleKey(state, 'g');
    state = handleKey(state, 'n');
    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
    expect(state.cursor).toEqual({ line: 0, col: 3 });

    // VISUAL 모드에서 다시 gn 입력 -> 다음 매치 끝(col 8)까지 확장
    state = handleKey(state, 'g');
    state = handleKey(state, 'n');
    expect(state.mode).toBe('VISUAL');
    expect(state.visualAnchor).toEqual({ line: 0, col: 0 });
    expect(state.cursor).toEqual({ line: 0, col: 8 });
  });

  it('cgn + . (Dot Repeat) 연속 치환으로 n 키 없이 . 만으로 다음 매치를 순차 교체한다', () => {
    let state = createState([
      'const oldVal = 10;',
      'const temp = oldVal + 5;',
      'const final = oldVal * 2;',
    ]);

    // /oldVal<Enter>
    for (const k of ['/', 'o', 'l', 'd', 'V', 'a', 'l', 'Enter']) {
      state = handleKey(state, k);
    }

    // cgn newVal <Esc>
    for (const k of ['c', 'g', 'n', 'n', 'e', 'w', 'V', 'a', 'l', 'Escape']) {
      state = handleKey(state, k);
    }
    expect(state.lines[0]).toBe('const newVal = 10;');
    expect(state.mode).toBe('NORMAL');

    // 첫 번째 . (Dot Repeat)
    state = handleKey(state, '.');
    expect(state.lines[1]).toBe('const temp = newVal + 5;');

    // 두 번째 . (Dot Repeat)
    state = handleKey(state, '.');
    expect(state.lines[2]).toBe('const final = newVal * 2;');
  });

  it('dgn 및 . 점 반복으로 매치 단어를 순차 삭제한다', () => {
    let state = createState([
      'apple banana apple cherry apple',
    ]);

    for (const k of ['/', 'a', 'p', 'p', 'l', 'e', 'Enter']) {
      state = handleKey(state, k);
    }

    // dgn 입력으로 첫 번째 apple 삭제
    state = handleKey(state, 'd');
    state = handleKey(state, 'g');
    state = handleKey(state, 'n');
    expect(state.lines[0]).toBe(' banana apple cherry apple');

    // . 반복으로 두 번째 apple 삭제
    state = handleKey(state, '.');
    expect(state.lines[0]).toBe(' banana  cherry apple');

    // . 반복으로 세 번째 apple 삭제
    state = handleKey(state, '.');
    expect(state.lines[0]).toBe(' banana  cherry ');
  });

  it('ygn 으로 매칭된 텍스트를 클립보드에 복사(yank)한다', () => {
    let state = createState(['hello targetWorld test']);

    for (const k of ['/', 't', 'a', 'r', 'g', 'e', 't', 'Enter']) {
      state = handleKey(state, k);
    }

    state = handleKey(state, 'y');
    state = handleKey(state, 'g');
    state = handleKey(state, 'n');

    expect(state.clipboard).toEqual({ type: 'text', content: 'target' });
  });
});

describe('Search Cursor Offsets (/pattern/e, /pattern/s+N, /pattern/+N)', () => {
  it('/pattern/e 오프셋은 매치 단어의 마지막 글자로 커서를 이동시킨다', () => {
    let state = createState(['function computeTotal() {}']);

    // /compute/e<Enter> -> compute 끝 글자인 'e' (col 15)로 이동
    for (const k of ['/', 'c', 'o', 'm', 'p', 'u', 't', 'e', '/', 'e', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 0, col: 15 });
  });

  it('/pattern/e+1 및 /pattern/e-1 오프셋 계산이 정확하다', () => {
    let state = createState(['abcdefghij']);

    // /cde/e+1 -> cde 끝(col 4) + 1 = col 5 ('f')
    for (const k of ['/', 'c', 'd', 'e', '/', 'e', '+', '1', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 0, col: 5 });

    // /cde/e-1 -> cde 끝(col 4) - 1 = col 3 ('d')
    for (const k of ['/', 'c', 'd', 'e', '/', 'e', '-', '1', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 0, col: 3 });
  });

  it('/pattern/s+2 오프셋은 매치 시작점 + 2 위치로 이동한다', () => {
    let state = createState(['const greeting = "hello";']);

    // /greeting/s+2 -> 'greeting' 시작(col 6) + 2 = col 8 ('e')
    for (const k of ['/', 'g', 'r', 'e', 'e', 't', 'i', 'n', 'g', '/', 's', '+', '2', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 0, col: 8 });
  });

  it('/pattern/+1 라인 오프셋은 매칭된 줄 바로 아랫줄의 첫 비공백 문자로 이동한다', () => {
    let state = createState([
      '// section 1',
      'const x = 1;',
      '// section 2',
      '  const y = 2;',
    ]);

    // /section 2/+1 -> line 2의 다음 줄인 line 3의 첫 비공백 문자(col 2)
    for (const k of ['/', 's', 'e', 'c', 't', 'i', 'o', 'n', ' ', '2', '/', '+', '1', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.cursor).toEqual({ line: 3, col: 2 });
  });

  it('d/pattern/e 연산자 결합 시 매치 끝 글자까지 포함하여 문자 단위 삭제한다', () => {
    let state = createState(['start deleteThisEnd finish']);

    // d /deleteThis/e Enter -> start부터 deleteThis 끝까지 삭제
    state = handleKey(state, 'd');
    for (const k of ['/', 'd', 'e', 'l', 'e', 't', 'e', 'T', 'h', 'i', 's', '/', 'e', 'Enter']) {
      state = handleKey(state, k);
    }
    expect(state.lines[0]).toBe('End finish');
  });

  it('d/TODO/+1 연산자 결합 시 TODO 줄과 그 다음 줄까지 행 단위로 일괄 삭제한다', () => {
    let state = createState([
      'line 1',
      '// TODO: fix this',
      'tempBuggyCode();',
      'line 4',
    ]);

    // d /TODO/+1 Enter
    state = handleKey(state, 'd');
    for (const k of ['/', 'T', 'O', 'D', 'O', '/', '+', '1', 'Enter']) {
      state = handleKey(state, k);
    }
    // line 0부터 TODO 다음 줄(line 2)까지 삭제되어 line 4만 남음
    expect(state.lines).toEqual(['line 4']);
  });
});

describe('Interactive Confirm Substitution (:%s/old/new/gc)', () => {
  it('c 플래그 지정 시 confirmSubstitute 세션이 열리고 커서가 첫 매치로 이동한다', () => {
    let state = createState([
      'const a = foo;',
      'const b = foo;',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    expect(state.confirmSubstitute).toBeDefined();
    expect(state.confirmSubstitute?.oldText).toBe('foo');
    expect(state.confirmSubstitute?.newText).toBe('bar');
    expect(state.cursor).toEqual({ line: 0, col: 10 });
  });

  it('y를 누르면 현재 매치 치환 후 다음 매치로 이동하고, 마지막 매치 후 완료된다', () => {
    let state = createState([
      'foo 1',
      'foo 2',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    // 첫 번째 foo 치환
    state = handleKey(state, 'y');
    expect(state.lines[0]).toBe('bar 1');
    expect(state.lines[1]).toBe('foo 2');
    expect(state.confirmSubstitute).toBeDefined();
    expect(state.cursor).toEqual({ line: 1, col: 0 });

    // 두 번째 foo 치환 -> 모두 완료되어 세션 종료
    state = handleKey(state, 'y');
    expect(state.lines[1]).toBe('bar 2');
    expect(state.confirmSubstitute).toBeNull();
    expect(state.commandMessage).toContain('2개 항목을 치환했습니다');
  });

  it('n을 누르면 현재 매치를 건너뛰고 다음 매치로 이동한다', () => {
    let state = createState([
      'foo 1',
      'foo 2',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    // 첫 번째 매치 건너뛰기
    state = handleKey(state, 'n');
    expect(state.lines[0]).toBe('foo 1');
    expect(state.cursor).toEqual({ line: 1, col: 0 });

    // 두 번째 매치 치환
    state = handleKey(state, 'y');
    expect(state.lines[1]).toBe('bar 2');
    expect(state.confirmSubstitute).toBeNull();
  });

  it('a를 누르면 현재 및 남은 모든 매치를 한 번에 일괄 치환한다', () => {
    let state = createState([
      'foo 1',
      'foo 2',
      'foo 3',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    // 첫 매치에서 'a' 입력
    state = handleKey(state, 'a');
    expect(state.lines).toEqual([
      'bar 1',
      'bar 2',
      'bar 3',
    ]);
    expect(state.confirmSubstitute).toBeNull();
    expect(state.commandMessage).toContain('3개 항목을 치환했습니다');
  });

  it('q 또는 Escape를 누르면 치환을 중단하고 즉시 종료한다', () => {
    let state = createState([
      'foo 1',
      'foo 2',
      'foo 3',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    // 첫 번째 치환
    state = handleKey(state, 'y');
    expect(state.lines[0]).toBe('bar 1');

    // 두 번째에서 중단 (q)
    state = handleKey(state, 'q');
    expect(state.confirmSubstitute).toBeNull();
    expect(state.lines[1]).toBe('foo 2');
    expect(state.lines[2]).toBe('foo 3');
  });

  it('l을 누르면 현재 매치를 치환하고 즉시 종료한다 (last)', () => {
    let state = createState([
      'foo 1',
      'foo 2',
      'foo 3',
    ]);

    for (const k of [':', '%', 's', '/', 'f', 'o', 'o', '/', 'b', 'a', 'r', '/', 'g', 'c', 'Enter']) {
      state = handleKey(state, k);
    }

    // 'l' 입력 -> 첫 매치 치환 후 즉시 종료
    state = handleKey(state, 'l');
    expect(state.lines[0]).toBe('bar 1');
    expect(state.lines[1]).toBe('foo 2');
    expect(state.lines[2]).toBe('foo 3');
    expect(state.confirmSubstitute).toBeNull();
  });
});
