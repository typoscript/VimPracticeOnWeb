import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('Marks (m{a-z}, \'{a-z}, `{a-z}) & Jump List (Ctrl-o, Ctrl-i)', () => {
  it('ma로 현재 커서 위치를 마크 a에 저장한다', () => {
    let state: VimEditorState = {
      lines: ['First line', 'Second line', 'Third line'],
      cursor: { line: 1, col: 5 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'm');
    expect(state.pendingKeys).toBe('m');

    state = handleKey(state, 'a');
    expect(state.pendingKeys).toBeUndefined();
    expect(state.marks?.a).toEqual({ row: 1, col: 5 });
  });

  it('\'{a-z}는 해당 마크 줄의 첫 번째 비공백 문자로 점프한다', () => {
    let state: VimEditorState = {
      lines: ['First line', '    indented second line', 'Third line'],
      cursor: { line: 1, col: 10 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'm');
    state = handleKey(state, 'b');
    expect(state.marks?.b).toEqual({ row: 1, col: 10 });

    // 다른 곳으로 이동
    state = handleKey(state, 'g');
    state = handleKey(state, 'g');
    expect(state.cursor.line).toBe(0);

    // 'b 실행
    state = handleKey(state, "'");
    expect(state.pendingKeys).toBe("'");
    state = handleKey(state, 'b');
    // 첫 비공백 문자 인덱스는 4 ('i')
    expect(state.cursor).toEqual({ line: 1, col: 4 });
  });

  it('`{a-z}는 해당 마크의 정확한 (row, col) 좌표로 점프한다', () => {
    let state: VimEditorState = {
      lines: ['First line', '    indented second line', 'Third line'],
      cursor: { line: 1, col: 12 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'm');
    state = handleKey(state, 'c');
    expect(state.marks?.c).toEqual({ row: 1, col: 12 });

    // 맨 끝 줄로 이동
    state = handleKey(state, 'G');
    expect(state.cursor.line).toBe(2);

    // `c 실행
    state = handleKey(state, '`');
    state = handleKey(state, 'c');
    expect(state.cursor).toEqual({ line: 1, col: 12 });
  });

  it('d\'a: 현재 줄부터 마크 a가 위치한 줄까지 행 단위(linewise)로 삭제한다', () => {
    let state: VimEditorState = {
      lines: ['Line 0', 'Line 1', 'Line 2', 'Line 3', 'Line 4'],
      cursor: { line: 3, col: 2 },
      mode: 'NORMAL',
    };

    // Line 3에 마크 a 설정
    state = handleKey(state, 'm');
    state = handleKey(state, 'a');

    // Line 1로 이동
    state = handleKey(state, '1');
    state = handleKey(state, 'G');
    expect(state.cursor.line).toBe(0);

    // d'a 입력: Line 0부터 Line 3까지 4줄 일괄 삭제
    state = handleKey(state, 'd');
    state = handleKey(state, "'");
    state = handleKey(state, 'a');

    expect(state.lines).toEqual(['Line 4']);
    expect(state.cursor.line).toBe(0);
    expect(state.clipboard?.type).toBe('line');
  });

  it('d`a: 현재 커서부터 마크 a 좌표까지 문자 단위(character-wise)로 삭제한다', () => {
    let state: VimEditorState = {
      lines: ['hello world foo bar'],
      cursor: { line: 0, col: 6 }, // 'w'
      mode: 'NORMAL',
    };

    // 'w' 위치에 마크 a 설정
    state = handleKey(state, 'm');
    state = handleKey(state, 'a');

    // 'd' (col 10)로 이동
    state = handleKey(state, 'e');
    expect(state.cursor.col).toBe(10);

    // d`a 실행: col 6부터 10까지 "world" 삭제
    state = handleKey(state, 'd');
    state = handleKey(state, '`');
    state = handleKey(state, 'a');

    expect(state.lines).toEqual(['hello  foo bar']);
  });

  it('c\'a 및 y\'a 연산자 결합이 정상 동작한다', () => {
    let state: VimEditorState = {
      lines: ['Line 0', 'Line 1', 'Line 2'],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'm');
    state = handleKey(state, 'a');

    state = handleKey(state, 'k'); // line 0
    // y'a: line 0부터 line 1까지 복사
    state = handleKey(state, 'y');
    state = handleKey(state, "'");
    state = handleKey(state, 'a');

    expect(state.clipboard?.content).toBe('Line 0\nLine 1');

    // c'a: line 0부터 line 1까지 수정 후 INSERT 모드 진입
    state = handleKey(state, 'c');
    state = handleKey(state, "'");
    state = handleKey(state, 'a');

    expect(state.mode).toBe('INSERT');
    expect(state.lines).toEqual(['', 'Line 2']);
  });

  it('점프 리스트(recordJump, Ctrl-o, Ctrl-i) 탐색이 정확히 동작한다', () => {
    let state: VimEditorState = {
      lines: [
        'Line 0',
        'Line 1',
        'Line 2',
        'Line 3',
        'Line 4',
        'Line 5',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // G: 마지막 줄로 점프 (Line 0 기록)
    state = handleKey(state, 'G');
    expect(state.cursor.line).toBe(5);
    expect(state.jumpList).toEqual([{ row: 0, col: 0 }]);

    // gg: 맨 앞 줄로 점프 (Line 5 기록)
    state = handleKey(state, 'g');
    state = handleKey(state, 'g');
    expect(state.cursor.line).toBe(0);
    expect(state.jumpList).toEqual([{ row: 0, col: 0 }, { row: 5, col: 0 }]);

    // Ctrl-o: 이전 위치(Line 5)로 복귀
    state = handleKey(state, 'Ctrl-o');
    expect(state.cursor.line).toBe(5);

    // Ctrl-o: 또 이전 위치(Line 0)로 복귀
    state = handleKey(state, 'Ctrl-o');
    expect(state.cursor.line).toBe(0);

    // Ctrl-i: 다음 위치(Line 5)로 전진
    state = handleKey(state, 'Ctrl-i');
    expect(state.cursor.line).toBe(5);
  });
});

describe('Line and Character Operators (J, ~, >>, <<, ==, Ctrl-a, Ctrl-x)', () => {
  it('J는 현재 줄과 아랫줄을 공백 하나로 이어붙인다', () => {
    let state: VimEditorState = {
      lines: ['Hello', 'world!'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'J');
    expect(state.lines).toEqual(['Hello world!']);
    expect(state.cursor).toEqual({ line: 0, col: 5 }); // 첫 결합 공백 위치
  });

  it('[count]J는 count개 줄을 일괄 이어붙인다 (3J)', () => {
    let state: VimEditorState = {
      lines: ['Alpha', '  Beta', '  Gamma', 'Delta'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, '2');
    state = handleKey(state, 'J'); // 현재 줄 + 2개 줄 = 3줄 연결
    expect(state.lines).toEqual(['Alpha Beta Gamma', 'Delta']);
  });

  it('VISUAL 모드에서 J는 선택된 모든 행을 하나로 연결한다', () => {
    let state: VimEditorState = {
      lines: ['one', 'two', 'three', 'four'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'V');
    state = handleKey(state, 'j');
    state = handleKey(state, 'j');
    state = handleKey(state, 'J');

    expect(state.lines).toEqual(['one two three', 'four']);
    expect(state.mode).toBe('NORMAL');
  });

  it('~는 커서 문자의 대소문자를 반전하고 오른쪽으로 한 칸 이동한다', () => {
    let state: VimEditorState = {
      lines: ['vIM'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, '~');
    expect(state.lines[0]).toBe('VIM');
    expect(state.cursor.col).toBe(1);

    state = handleKey(state, '~');
    expect(state.lines[0]).toBe('ViM');
    expect(state.cursor.col).toBe(2);
  });

  it('VISUAL 모드에서 ~는 선택 영역 전체의 대소문자를 반전하고 u는 소문자, U는 대문자로 변환한다', () => {
    let state: VimEditorState = {
      lines: ['Hello World'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // V로 전체 줄 선택 후 ~
    state = handleKey(state, 'V');
    state = handleKey(state, '~');
    expect(state.lines[0]).toBe('hELLO wORLD');

    // u: 전체 소문자화
    state = handleKey(state, 'V');
    state = handleKey(state, 'u');
    expect(state.lines[0]).toBe('hello world');

    // U: 전체 대문자화
    state = handleKey(state, 'V');
    state = handleKey(state, 'U');
    expect(state.lines[0]).toBe('HELLO WORLD');
  });

  it('>> 및 <<는 2칸 공백 들여쓰기/내어쓰기를 수행한다 ([count]>> 포함)', () => {
    let state: VimEditorState = {
      lines: ['line 1', 'line 2', 'line 3'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, '>');
    expect(state.pendingKeys).toBe('>');
    state = handleKey(state, '>');
    expect(state.lines[0]).toBe('  line 1');

    // 2>>: 2개 줄 들여쓰기
    state = handleKey(state, '2');
    state = handleKey(state, '>');
    state = handleKey(state, '>');
    expect(state.lines[0]).toBe('    line 1');
    expect(state.lines[1]).toBe('  line 2');

    // <<: 내어쓰기
    state = handleKey(state, '<');
    state = handleKey(state, '<');
    expect(state.lines[0]).toBe('  line 1');
  });

  it('VISUAL 모드 > 및 <는 선택 영역의 모든 행을 들여쓰기/내어쓰기한다', () => {
    let state: VimEditorState = {
      lines: ['one', 'two'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'V');
    state = handleKey(state, 'j');
    state = handleKey(state, '>');
    expect(state.lines).toEqual(['  one', '  two']);
    expect(state.mode).toBe('NORMAL');

    state = handleKey(state, 'V');
    state = handleKey(state, 'j');
    state = handleKey(state, '<');
    expect(state.lines).toEqual(['one', 'two']);
  });

  it('Ctrl-a 및 Ctrl-x는 커서 위치 또는 오른쪽 가장 가까운 숫자를 증감한다 (음수, [count] 지원)', () => {
    let state: VimEditorState = {
      lines: ['const count = 41;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // 커서가 0에 있어도 오른쪽 숫자 41을 찾아 42로 증가
    state = handleKey(state, 'Ctrl-a');
    expect(state.lines[0]).toBe('const count = 42;');
    expect(state.cursor.col).toBe(15); // 변경된 숫자 끝자리 '2'

    // 10Ctrl-a: 42 + 10 = 52
    state = handleKey(state, '1');
    state = handleKey(state, '0');
    state = handleKey(state, 'Ctrl-a');
    expect(state.lines[0]).toBe('const count = 52;');

    // Ctrl-x: 52 - 1 = 51
    state = handleKey(state, 'Ctrl-x');
    expect(state.lines[0]).toBe('const count = 51;');

    // 음수 감소 테스트
    state = {
      lines: ['let temp = -5;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'Ctrl-x'); // -5 - 1 = -6
    expect(state.lines[0]).toBe('let temp = -6;');

    state = handleKey(state, '1');
    state = handleKey(state, '0');
    state = handleKey(state, 'Ctrl-a'); // -6 + 10 = 4
    expect(state.lines[0]).toBe('let temp = 4;');
  });

  it('Dot Repeat (.)으로 J, ~, >>, Ctrl-a 명령어가 반복 실행된다', () => {
    let state: VimEditorState = {
      lines: ['Line 1', 'Line 2', 'Line 3', 'Line 4'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // 1. J 후 .
    state = handleKey(state, 'J');
    expect(state.lines).toEqual(['Line 1 Line 2', 'Line 3', 'Line 4']);
    state = handleKey(state, '.');
    expect(state.lines).toEqual(['Line 1 Line 2 Line 3', 'Line 4']);

    // 2. >> 후 .
    state = {
      lines: ['a', 'b', 'c'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = handleKey(state, '>');
    state = handleKey(state, '>');
    expect(state.lines[0]).toBe('  a');
    state = handleKey(state, 'j');
    state = handleKey(state, '.');
    expect(state.lines[1]).toBe('  b');

    // 3. Ctrl-a 후 .
    state = {
      lines: ['val = 10;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = handleKey(state, 'Ctrl-a'); // 11
    expect(state.lines[0]).toBe('val = 11;');
    state = handleKey(state, '.'); // 12
    expect(state.lines[0]).toBe('val = 12;');
  });
});
