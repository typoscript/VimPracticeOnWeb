import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

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

  it(':jumps, :clearjumps, :delmarks 커맨드 및 헬퍼 함수가 정상 동작한다', () => {
    let state: VimEditorState = {
      lines: ['line 0', 'line 1', 'line 2', 'line 3', 'line 4'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      marks: {
        a: { row: 0, col: 0 },
        b: { row: 1, col: 2 },
        c: { row: 2, col: 4 },
        A: { row: 3, col: 0, filename: 'source.ts' },
      },
      jumpList: [
        { row: 0, col: 0 },
        { row: 2, col: 4 },
      ],
      jumpIndex: 1,
    };

    // 1. :jumps 명령 실행 시 점프 목록 포맷팅 및 showMarksVisualizer 플래그 활성화
    state = handleKey(state, ':');
    for (const ch of 'jumps') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.showMarksVisualizer).toBe(true);
    expect(state.commandMessage).toContain('jump line  col file/text');
    expect(state.commandMessage).toContain('line 0');
    expect(state.commandMessage).toContain('line 2');

    // 2. :clearjumps 명령 실행 시 점프 리스트 초기화
    state = handleKey(state, ':');
    for (const ch of 'clearjumps') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.jumpList).toEqual([]);
    expect(state.jumpIndex).toBe(0);
    expect(state.commandMessage).toContain('점프 리스트가 초기화되었습니다');

    // 3. :delmarks a c 실행 시 지정된 마크 삭제
    state = handleKey(state, ':');
    for (const ch of 'delmarks a c') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.marks?.a).toBeUndefined();
    expect(state.marks?.c).toBeUndefined();
    expect(state.marks?.b).toBeDefined();
    expect(state.marks?.A).toBeDefined();

    // 4. :delmarks! 실행 시 모든 소문자 마크 삭제 (전역 마크 A는 유지)
    state = handleKey(state, ':');
    for (const ch of 'delmarks!') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.marks?.b).toBeUndefined();
    expect(state.marks?.A).toBeDefined();

    // 5. :marks close 실행 시 showMarksVisualizer 비활성화
    state = handleKey(state, ':');
    for (const ch of 'marks close') state = handleKey(state, ch);
    state = handleKey(state, 'Enter');

    expect(state.showMarksVisualizer).toBe(false);
  });

  describe("특수 마크 ('', ``, '., `., '^, `^, '[, '], `[, `], '<, '>, `<, `>)", () => {
    it("'' 와 `` 로 큰 점프 이전 위치와 현재 위치를 왕복 토글한다", () => {
      let state: VimEditorState = {
        lines: ['  first target', '  second line', '  third line', '  fourth end'],
        cursor: { line: 1, col: 5 },
        mode: 'NORMAL',
      };

      // G 로 마지막 줄(line 3)로 큰 점프
      state = handleKey(state, 'G');
      expect(state.cursor.line).toBe(3);

      // `` 로 정확히 점프 직전 좌표 (1, 5) 복귀
      state = handleKey(state, '`');
      state = handleKey(state, '`');
      expect(state.cursor).toEqual({ line: 1, col: 5 });

      // '' 로 다시 (3, 첫 비공백) 왕복 토글
      state = handleKey(state, "'");
      state = handleKey(state, "'");
      expect(state.cursor).toEqual({ line: 3, col: 2 });
    });

    it("'. / `. 과 '^ / `^ 는 마지막 변경 위치 및 마지막 Insert 종료 위치로 점프한다", () => {
      let state: VimEditorState = {
        lines: ['alpha beta', 'gamma delta', 'epsilon zeta'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 1번째 줄에서 Insert 입력 (col 6 에 'new ' 삽입 후 Esc -> '^ 와 '. 기록)
      state = handleKey(state, 'w'); // col 6 ('b')
      state = handleKey(state, 'i');
      for (const ch of 'new ') state = handleKey(state, ch);
      state = handleKey(state, 'Escape'); // cursor -> (0, 9), lastInsertPos=(0,9)

      // 2번째 줄 끝으로 이동해 한 글자 삭제 (x -> '. 는 line 2 로 갱신, '^ 는 line 0 유지)
      state = handleKey(state, '2');
      state = handleKey(state, 'j');
      state = handleKey(state, '$');
      state = handleKey(state, 'x');
      expect(state.lines[2]).toBe('epsilon zet');

      // `^ 로 마지막 Insert 종료 위치 (0, 10 - 'b' 앞, gi 기준 좌표) 점프
      state = handleKey(state, '`');
      state = handleKey(state, '^');
      expect(state.cursor).toEqual({ line: 0, col: 10 });

      // `. 로 마지막 변경 위치 (2, 10) 점프
      state = handleKey(state, '`');
      state = handleKey(state, '.');
      expect(state.cursor).toEqual({ line: 2, col: 10 });
    });

    it("'[ / '] / `[ / `] 는 마지막 변경·붙여넣기·복사 텍스트의 시작과 끝 경계로 점프하고 연산자와 결합된다", () => {
      let state: VimEditorState = {
        lines: ['hello world', 'foo bar baz', 'end line'],
        cursor: { line: 1, col: 4 }, // 'b' of bar
        mode: 'NORMAL',
      };

      // yi" 대신 yiw 로 'bar'(col 4..6) 복사 -> `[=(1,4), `]=(1,6)
      state = handleKey(state, 'y');
      state = handleKey(state, 'i');
      state = handleKey(state, 'w');
      expect(state.clipboard?.content).toBe('bar');

      state = handleKey(state, 'j'); // (2, 4)
      state = handleKey(state, '`');
      state = handleKey(state, ']');
      expect(state.cursor).toEqual({ line: 1, col: 6 });

      state = handleKey(state, '`');
      state = handleKey(state, '[');
      expect(state.cursor).toEqual({ line: 1, col: 4 });

      // 0번째 줄 끝에 p 로 붙여넣기 -> 'hello worldbar' -> `[=(0,11), `]=(0,13)
      state = handleKey(state, 'k');
      state = handleKey(state, '$');
      state = handleKey(state, 'p');
      expect(state.lines[0]).toBe('hello worldbar');

      state = handleKey(state, '`');
      state = handleKey(state, '[');
      expect(state.cursor).toEqual({ line: 0, col: 11 });
      state = handleKey(state, '`');
      state = handleKey(state, ']');
      expect(state.cursor).toEqual({ line: 0, col: 13 });

      // 커서를 `[`(11)로 옮기고 d`] 로 방금 붙여넣은 'bar' 삭제
      state = handleKey(state, '`');
      state = handleKey(state, '[');
      state = handleKey(state, 'd');
      state = handleKey(state, '`');
      state = handleKey(state, ']');
      expect(state.lines[0]).toBe('hello world');
    });

    it("'< / '> / `< / `> 는 마지막 Visual 선택의 시작/끝으로 이동하고 Visual/연산자/미설정 E20·:marks 를 지원한다", () => {
      let state: VimEditorState = {
        lines: ['abcdefg', 'hijklmn', 'opqrstu'],
        cursor: { line: 0, col: 2 },
        mode: 'NORMAL',
      };

      // 아직 변경·Visual 이력이 없으므로 `> 와 `. 는 E20 + bell
      state = handleKey(state, '`');
      state = handleKey(state, '>');
      expect(state.bell).toBe(true);
      expect(state.commandMessage).toContain('E20');

      // 역방향 Visual 선택 (col 5 -> col 1) 후 Esc
      state = { ...state, cursor: { line: 0, col: 5 }, commandMessage: undefined };
      state = handleKey(state, 'v');
      state = handleKey(state, '4');
      state = handleKey(state, 'h'); // col 1
      state = handleKey(state, 'Escape');

      // 역방향 선택이어도 `< 는 시작(0,1), `> 는 끝(0,5)
      state = { ...state, cursor: { line: 2, col: 0 } };
      state = handleKey(state, '`');
      state = handleKey(state, '<');
      expect(state.cursor).toEqual({ line: 0, col: 1 });
      state = handleKey(state, '`');
      state = handleKey(state, '>');
      expect(state.cursor).toEqual({ line: 0, col: 5 });

      // :marks 에 특수 마크 목록이 함께 표시됨
      for (const ch of ':marks') state = handleKey(state, ch);
      state = handleKey(state, 'Enter');
      expect(state.commandMessage).toContain('<');
      expect(state.commandMessage).toContain('>');
    });
  });
});
