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

describe('Uppercase Registers ("A~"Z) Text Accumulation', () => {
  it('소문자 "a로 복사한 뒤 대문자 "A로 추가 복사(yy)하면 줄 단위로 누적(append)된다', () => {
    let state = createState([
      'Line 1: first',
      'Line 2: skip',
      'Line 3: second',
      'Line 4: target',
    ]);

    // line 0: "ayy
    for (const k of ['"', 'a', 'y', 'y']) {
      state = handleKey(state, k);
    }
    expect(state.registers?.['a']?.content).toBe('Line 1: first');

    // 2j 로 line 2 이동 후 "Ayy
    state = handleKey(state, '2');
    state = handleKey(state, 'j');
    for (const k of ['"', 'A', 'y', 'y']) {
      state = handleKey(state, k);
    }
    expect(state.registers?.['a']?.content).toBe('Line 1: first\nLine 3: second');

    // line 3 이동 후 "ap 붙여넣기
    state = handleKey(state, 'j');
    for (const k of ['"', 'a', 'p']) {
      state = handleKey(state, k);
    }

    expect(state.lines).toEqual([
      'Line 1: first',
      'Line 2: skip',
      'Line 3: second',
      'Line 4: target',
      'Line 1: first',
      'Line 3: second',
    ]);
  });

  it('대문자 "Ap로도 소문자 "a 레지스터와 동일하게 붙여넣을 수 있다', () => {
    let state = createState(['apple', 'banana', 'target']);
    // "ayy
    for (const k of ['"', 'a', 'y', 'y']) {
      state = handleKey(state, k);
    }
    // "Ayy
    state = handleKey(state, 'j');
    for (const k of ['"', 'A', 'y', 'y']) {
      state = handleKey(state, k);
    }

    state = handleKey(state, 'j');
    for (const k of ['"', 'A', 'p']) {
      state = handleKey(state, k);
    }

    expect(state.lines).toEqual([
      'apple',
      'banana',
      'target',
      'apple',
      'banana',
    ]);
  });

  it('단어 단위 복사(yw) 시 "A를 사용하면 텍스트가 인라인으로 누적된다', () => {
    let state = createState(['hello world vim', '']);
    // "ayw (hello )
    for (const k of ['"', 'a', 'y', 'w']) {
      state = handleKey(state, k);
    }
    // w (cursor on world) -> "Ayw (world )
    state = handleKey(state, 'w');
    for (const k of ['"', 'A', 'y', 'w']) {
      state = handleKey(state, k);
    }

    expect(state.registers?.['a']?.content).toBe('hello world ');
  });

  it('"Ad 로 삭제 시 기존 레지스터 내용 뒤에 삭제된 텍스트가 누적된다', () => {
    let state = createState([
      'keep 1',
      'cut this 1',
      'keep 2',
      'cut this 2',
    ]);

    // line 1: "add
    state = handleKey(state, 'j');
    for (const k of ['"', 'a', 'd', 'd']) {
      state = handleKey(state, k);
    }
    expect(state.lines).toEqual(['keep 1', 'keep 2', 'cut this 2']);

    // line 2: "Add
    state = handleKey(state, 'j');
    for (const k of ['"', 'A', 'd', 'd']) {
      state = handleKey(state, k);
    }
    expect(state.lines).toEqual(['keep 1', 'keep 2']);
    expect(state.registers?.['a']?.content).toBe('cut this 1\ncut this 2');
  });
});

describe('Uppercase Macros (qA~qZ) Macro Appending', () => {
  it('qa로 녹화 후 qA로 매크로에 키 시퀀스를 덧붙여 실행할 수 있다', () => {
    let state = createState([
      'val1',
      'val2',
      'val3',
    ]);

    // qa I // <Esc> q (주석 붙이기)
    for (const k of ['q', 'a', 'I', '/', '/', ' ', 'Escape', 'q']) {
      state = handleKey(state, k);
    }
    expect(state.registers?.['a']?.content).toEqual(['I', '/', '/', ' ', 'Escape']);
    expect(state.lines[0]).toBe('// val1');

    // qA j q (아랫줄로 이동하는 j 키 덧붙이기 -> 실행되면서 커서가 line 1로 이동)
    for (const k of ['q', 'A', 'j', 'q']) {
      state = handleKey(state, k);
    }
    expect(state.registers?.['a']?.content).toEqual(['I', '/', '/', ' ', 'Escape', 'j']);
    expect(state.cursor.line).toBe(1);

    // line 1에서 @a 실행 -> 주석 추가 후 line 2로 자동 이동
    for (const k of ['@', 'a']) {
      state = handleKey(state, k);
    }
    expect(state.lines[1]).toBe('// val2');
    expect(state.cursor.line).toBe(2);

    // @@ 또는 @A 로 line 2도 실행
    for (const k of ['@', 'A']) {
      state = handleKey(state, k);
    }
    expect(state.lines[2]).toBe('// val3');
  });
});

describe('Replace Mode (R - REPLACE)', () => {
  it('NORMAL 모드에서 R을 누르면 REPLACE 모드로 진입한다', () => {
    let state = createState(['abcdef']);
    state = handleKey(state, 'R');
    expect(state.mode).toBe('REPLACE');
  });

  it('REPLACE 모드에서 입력하는 글자는 기존 글자를 1:1로 덮어쓴다', () => {
    let state = createState(['abcdef'], { line: 0, col: 2 });
    state = handleKey(state, 'R');
    state = handleKey(state, 'X');
    state = handleKey(state, 'Y');
    expect(state.lines[0]).toBe('abXYef');
    expect(state.cursor.col).toBe(4);
  });

  it('Backspace를 누르면 덮어쓰기 전 원래 글자가 복구된다', () => {
    let state = createState(['abcdef'], { line: 0, col: 2 });
    state = handleKey(state, 'R');
    state = handleKey(state, 'X');
    state = handleKey(state, 'Y');
    expect(state.lines[0]).toBe('abXYef');

    // 첫 번째 Backspace: 'Y'가 취소되고 'd' 복구
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('abXdef');
    expect(state.cursor.col).toBe(3);

    // 두 번째 Backspace: 'X'가 취소되고 'c' 복구
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('abcdef');
    expect(state.cursor.col).toBe(2);

    // 시작 지점에서는 추가 Backspace 시 변경 없음
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('abcdef');
    expect(state.cursor.col).toBe(2);
  });

  it('줄 끝을 초과하여 덮어쓰는 경우 글자가 추가되고, Backspace 시 삭제된다', () => {
    let state = createState(['abc'], { line: 0, col: 2 });
    state = handleKey(state, 'R');
    // col 2: 'c' -> 'X'
    state = handleKey(state, 'X');
    expect(state.lines[0]).toBe('abX');
    // col 3: 줄 끝 초과 덧붙이기 'Y'
    state = handleKey(state, 'Y');
    expect(state.lines[0]).toBe('abXY');

    // Backspace: 덧붙여진 'Y' 삭제
    state = handleKey(state, 'Backspace');
    expect(state.lines[0]).toBe('abX');
    expect(state.cursor.col).toBe(3);
  });

  it('Escape로 REPLACE 모드를 탈출하면 NORMAL 모드로 복귀하고 커서가 1칸 왼쪽으로 이동한다', () => {
    let state = createState(['abcdef'], { line: 0, col: 1 });
    state = handleKey(state, 'R');
    state = handleKey(state, 'X');
    state = handleKey(state, 'Escape');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('aXcdef');
    expect(state.cursor.col).toBe(1);
  });

  it('. (Dot Repeat)으로 REPLACE 모드 변경을 다른 위치에서 그대로 재현한다', () => {
    let state = createState(['12345', '12345']);
    // line 0 col 1에서 R A B Esc -> 1AB45
    state.cursor = { line: 0, col: 1 };
    state = handleKey(state, 'R');
    state = handleKey(state, 'A');
    state = handleKey(state, 'B');
    state = handleKey(state, 'Escape');
    expect(state.lines[0]).toBe('1AB45');

    // line 1 col 1로 이동 후 . 반복
    state = handleKey(state, 'j');
    state = handleKey(state, '0');
    state = handleKey(state, 'l');
    state = handleKey(state, '.');
    expect(state.lines[1]).toBe('1AB45');
  });
});

describe('Join Without Spaces (gJ)', () => {
  it('gJ는 공백을 추가하지 않고 뒷줄의 들여쓰기를 제거하여 두 줄을 결합한다', () => {
    let state = createState([
      'https://',
      '   example.com/api',
    ]);

    // gJ 입력
    state = handleKey(state, 'g');
    state = handleKey(state, 'J');

    expect(state.lines).toEqual([
      'https://example.com/api',
    ]);
    expect(state.cursor).toEqual({ line: 0, col: 8 });
  });

  it('일반 J는 공백 하나를 삽입하는 기존 동작을 유지한다', () => {
    let state = createState([
      'hello',
      '   world',
    ]);

    state = handleKey(state, 'J');
    expect(state.lines).toEqual([
      'hello world',
    ]);
  });

  it('VISUAL 모드에서 gJ 입력 시 선택된 모든 줄을 공백 없이 결합한다', () => {
    let state = createState([
      'first',
      '  second',
      '    third',
    ]);

    // V j 로 2개 줄 선택 후 g J
    state = handleKey(state, 'V');
    state = handleKey(state, '2');
    state = handleKey(state, 'j');
    state = handleKey(state, 'g');
    state = handleKey(state, 'J');

    expect(state.lines).toEqual([
      'firstsecondthird',
    ]);
  });
});
