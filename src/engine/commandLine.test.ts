import { describe, it, expect } from 'vitest';
import { executeCommandLine } from './commandLine';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('commandLine module', () => {
  const initialLines = [
    'Line 1: apple and apple',
    'Line 2: apple is good',
    'Line 3: third line',
  ];

  it(':[숫자] 명령으로 지정한 라인 번호로 즉시 점프한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '3');
    expect(next.cursor.line).toBe(2);
    expect(next.mode).toBe('NORMAL');

    const nextWithColon = executeCommandLine(state, ':2');
    expect(nextWithColon.cursor.line).toBe(1);
  });

  it(':%s/old/new/g 명령으로 전체 버퍼에서 문자열을 일괄 치환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '%s/apple/orange/g');
    expect(next.lines).toEqual([
      'Line 1: orange and orange',
      'Line 2: orange is good',
      'Line 3: third line',
    ]);
    expect(next.mode).toBe('NORMAL');
    expect(next.undoStack).toBeDefined();
    expect(next.undoStack).toHaveLength(1);
  });

  it(':s/old/new/g 명령으로 현재 커서가 위치한 줄에서만 치환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, 's/apple/orange/g');
    expect(next.lines[0]).toBe('Line 1: orange and orange');
    expect(next.lines[1]).toBe('Line 2: apple is good'); // 2번째 줄은 그대로 유지
  });

  it('치환 대상이 없는 경우 안전하게 원본을 유지하고 E486 에러 메시지를 반환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, '%s/nonExistent/new/g');
    expect(next.lines).toEqual(initialLines);
    expect(next.commandMessage).toContain('E486: 패턴을 찾을 수 없습니다: nonExistent');
  });

  it('알 수 없는 명령어 입력 시 E492 에러 메시지와 함께 NORMAL 모드로 복귀한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const next = executeCommandLine(state, 'unknownCommand');
    expect(next.mode).toBe('NORMAL');
    expect(next.lines).toEqual(initialLines);
    expect(next.commandMessage).toContain('E492: 지원하지 않는 에디터 명령어입니다: unknownCommand');
  });

  it(':w 및 :help 등 유용한 기본 명령어를 처리하고 안내 메시지를 반환한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const saveResult = executeCommandLine(state, ':w');
    expect(saveResult.commandMessage).toContain('[가상 저장 완료]');

    const helpResult = executeCommandLine(state, ':help');
    expect(helpResult.commandMessage).toContain('지원 명령어:');
  });

  it('공백이 포함된 커맨드라인(: 2, :%s /apple/orange/g)도 유연하게 파싱한다', () => {
    const state: VimEditorState = {
      lines: initialLines,
      cursor: { line: 0, col: 0 },
      mode: 'COMMAND',
    };

    const lineJump = executeCommandLine(state, ': 2');
    expect(lineJump.cursor.line).toBe(1);
    expect(lineJump.commandMessage).toBe('2번째 줄로 이동했습니다.');

    const subWithSpace = executeCommandLine(state, ':%s /apple/banana/g');
    expect(subWithSpace.lines[0]).toBe('Line 1: banana and banana');
    expect(subWithSpace.commandMessage).toContain('3개 항목을 치환했습니다');
  });

  describe('고급 Ex 커맨드 (:g, :v, :norm, :[range]d/y)', () => {
    it(':g/TODO/d 명령으로 특정 패턴이 포함된 줄을 일괄 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'const a = 1;',
          '// TODO: remove this',
          'const b = 2;',
          '// TODO: remove that',
          'const c = 3;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, 'g/TODO/d');
      expect(result.lines).toEqual(['const a = 1;', 'const b = 2;', 'const c = 3;']);
      expect(result.commandMessage).toContain('2개 줄이 일괄 삭제되었습니다.');
      expect(result.undoStack).toHaveLength(1);
    });

    it(':v/keep/d 및 :g!/keep/d 명령으로 특정 패턴이 없는 줄을 일괄 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'keep me 1',
          'drop me 1',
          'keep me 2',
          'drop me 2',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const resultV = executeCommandLine(state, 'v/keep/d');
      expect(resultV.lines).toEqual(['keep me 1', 'keep me 2']);

      const resultGExcl = executeCommandLine(state, 'g!/keep/d');
      expect(resultGExcl.lines).toEqual(['keep me 1', 'keep me 2']);
    });

    it(':3,4d 명령으로 지정된 범위의 줄을 삭제한다', () => {
      const state: VimEditorState = {
        lines: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '3,4d');
      expect(result.lines).toEqual(['line 1', 'line 2', 'line 5']);
      expect(result.clipboard?.content).toBe('line 3\nline 4');
    });

    it(':%y 명령으로 버퍼 전체를 복사한다', () => {
      const state: VimEditorState = {
        lines: ['alpha', 'beta', 'gamma'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '%y');
      expect(result.clipboard?.content).toBe('alpha\nbeta\ngamma');
      expect(result.commandMessage).toContain('3개 줄이 복사되었습니다.');
    });

    it(':\'<,\'>norm A; 명령으로 비주얼 선택 범위의 모든 줄 끝에 세미콜론을 추가한다', () => {
      const state: VimEditorState = {
        lines: ['let x = 1', 'let y = 2', 'let z = 3', 'console.log(x)'],
        cursor: { line: 2, col: 0 },
        visualAnchor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, "'<,'>norm A;", handleKey);
      expect(result.lines).toEqual([
        'let x = 1;',
        'let y = 2;',
        'let z = 3;',
        'console.log(x)',
      ]);
      expect(result.commandMessage).toContain('3개 줄에 normal 명령을 실행했습니다.');
    });

    it(':%norm I// 명령으로 버퍼 전체 줄 앞에 주석을 일괄 삽입한다', () => {
      const state: VimEditorState = {
        lines: ['const a = 1;', 'const b = 2;'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, '%norm I// ', handleKey);
      expect(result.lines).toEqual(['// const a = 1;', '// const b = 2;']);
    });
  });

  describe('순정 Vim 정규식 캡처 그룹(\\(...\\)) 및 역참조(\\1~\\9, &) 치환', () => {
    it(':%s/\\(\\w\\+\\): \\(\\w\\+\\)/\\2 = \\1/g 명령으로 key: value를 value = key로 일괄 역전한다', () => {
      const state: VimEditorState = {
        lines: ['first: one', 'second: two', 'third: three'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/\\(\\w\\+\\): \\(\\w\\+\\)/\\2 = \\1/g');
      expect(result.lines).toEqual(['one = first', 'two = second', 'three = third']);
      expect(result.commandMessage).toContain('3개 항목을 치환했습니다.');
    });

    it('표준 괄호 (\\w+): (\\w+) 구문도 캡처 그룹으로 호환되어 동일하게 동작한다', () => {
      const state: VimEditorState = {
        lines: ['name: alice', 'age: 30'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/(\\w+): (\\w+)/\\2 = \\1/g');
      expect(result.lines).toEqual(['alice = name', '30 = age']);
    });

    it(':%s/[0-9]\\+/[&]/g 명령으로 모든 숫자를 대괄호 [&]로 감싼다', () => {
      const state: VimEditorState = {
        lines: ['val1 = 123', 'val2 = 456;'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/[0-9]\\+/[&]/g');
      expect(result.lines).toEqual(['val[1] = [123]', 'val[2] = [456];']);
    });

    it('\\0 또한 &와 동일하게 전체 매칭 텍스트로 치환된다', () => {
      const state: VimEditorState = {
        lines: ['code 99'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/[0-9]\\+/<\\0>/g');
      expect(result.lines).toEqual(['code <99>']);
    });

    it('\\u 플래그로 캡처 그룹의 첫 글자를 대문자로 변환한다 (snake_case -> camelCase)', () => {
      const state: VimEditorState = {
        lines: [
          'const user = get_user();',
          'const account = get_account_info();',
          'const profile = get_profile();',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/get_\\(\\w\\+\\)/get\\u\\1/g');
      expect(result.lines).toEqual([
        'const user = getUser();',
        'const account = getAccount_info();',
        'const profile = getProfile();',
      ]);
    });

    it('\\U 플래그로 캡처 그룹 전체를 대문자화하고 \\E로 종료한다', () => {
      const state: VimEditorState = {
        lines: ['const foo_bar = 1;', 'const hello_world = 2;'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/const \\(\\w\\+\\)/const \\U\\1\\E_ENV/g');
      expect(result.lines).toEqual(['const FOO_BAR_ENV = 1;', 'const HELLO_WORLD_ENV = 2;']);
    });

    it('\\L 플래그로 캡처 그룹 전체를 소문자화한다', () => {
      const state: VimEditorState = {
        lines: ['HELLO_WORLD', 'VIM_ROCKS'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/\\(\\w\\+\\)/\\L\\1/g');
      expect(result.lines).toEqual(['hello_world', 'vim_rocks']);
    });

    it('\\l 플래그로 캡처 그룹 첫 글자만 소문자화한다', () => {
      const state: VimEditorState = {
        lines: ['PascalCase', 'CamelCase'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/\\(\\w\\+\\)/\\l\\1/g');
      expect(result.lines).toEqual(['pascalCase', 'camelCase']);
    });

    it('이스케이프된 \\& 및 \\\\를 리터럴 문자로 정확하게 치환한다', () => {
      const state: VimEditorState = {
        lines: ['foo and bar'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':%s/and/\\&/g');
      expect(result.lines).toEqual(['foo & bar']);
    });
  });

  describe('순정 Ex 커맨드 고급 범위(Range) 지정 파서', () => {
    const multiLines = [
      'line 1: AAA',
      'line 2: BBB',
      'line 3: CCC',
      'line 4: DDD',
      'line 5: EEE',
      'line 6: FFF',
      'line 7: GGG',
    ];

    it('상대 오프셋: .,.+3d 로 현재 줄부터 아래로 3줄(총 4줄)을 삭제한다', () => {
      const state: VimEditorState = {
        lines: [...multiLines],
        cursor: { line: 1, col: 0 }, // line 2 (인덱스 1)
        mode: 'COMMAND',
      };

      // 1번 인덱스(line 2)부터 1+3=4번 인덱스(line 5)까지 총 4줄 삭제
      const result = executeCommandLine(state, ':.,.+3d');
      expect(result.lines).toEqual(['line 1: AAA', 'line 6: FFF', 'line 7: GGG']);
      expect(result.clipboard?.content).toBe('line 2: BBB\nline 3: CCC\nline 4: DDD\nline 5: EEE');
      expect(result.commandMessage).toContain('4개 줄이 삭제되었습니다.');
    });

    it('상대 오프셋: .-2,.+2s/foo/bar/g 로 커서 전후 2줄 범위에서만 치환한다', () => {
      const state: VimEditorState = {
        lines: [
          'target 0',
          'target 1',
          'target 2',
          'target 3',
          'target 4',
          'target 5',
          'target 6',
        ],
        cursor: { line: 3, col: 0 }, // line 3 (인덱스 3)
        mode: 'COMMAND',
      };

      // 3-2=1 ~ 3+2=5 행만 치환
      const result = executeCommandLine(state, '.-2,.+2s/target/MODIFIED/g');
      expect(result.lines).toEqual([
        'target 0',
        'MODIFIED 1',
        'MODIFIED 2',
        'MODIFIED 3',
        'MODIFIED 4',
        'MODIFIED 5',
        'target 6',
      ]);
    });

    it('마크 범위: \'a,\'bd 로 마크 a부터 마크 b까지의 줄을 일괄 삭제한다', () => {
      const state: VimEditorState = {
        lines: [...multiLines],
        cursor: { line: 0, col: 0 },
        marks: {
          a: { row: 2, col: 0 }, // line 3
          b: { row: 4, col: 0 }, // line 5
        },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ":'a,'bd");
      expect(result.lines).toEqual([
        'line 1: AAA',
        'line 2: BBB',
        'line 6: FFF',
        'line 7: GGG',
      ]);
      expect(result.clipboard?.content).toBe('line 3: CCC\nline 4: DDD\nline 5: EEE');
    });

    it('설정되지 않은 마크 참조 시 E20 에러를 반환한다', () => {
      const state: VimEditorState = {
        lines: [...multiLines],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ":'x,'yd");
      expect(result.lines).toEqual(multiLines);
      expect(result.commandMessage).toContain("E20: 마크가 설정되지 않았습니다: 'x");
    });

    it('검색 패턴 범위: :/START/,/END/d 로 START부터 END가 있는 줄까지 블록을 통째로 삭제한다', () => {
      const state: VimEditorState = {
        lines: [
          'const before = true;',
          '// START',
          'const inside1 = 1;',
          'const inside2 = 2;',
          '// END',
          'const after = true;',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':/START/,/END/d');
      expect(result.lines).toEqual(['const before = true;', 'const after = true;']);
      expect(result.clipboard?.content).toBe('// START\nconst inside1 = 1;\nconst inside2 = 2;\n// END');
      expect(result.commandMessage).toContain('4개 줄이 삭제되었습니다.');
    });

    it('패턴을 찾지 못할 경우 버퍼를 변경하지 않고 E486 에러를 반환한다', () => {
      const state: VimEditorState = {
        lines: ['line 1', 'line 2'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':/NON_EXISTENT/,/END/d');
      expect(result.lines).toEqual(['line 1', 'line 2']);
      expect(result.commandMessage).toContain('E486: 패턴을 찾을 수 없습니다: NON_EXISTENT');
    });

    it('상대 오프셋 점프: :+3 및 :-2 로 커서 행을 즉시 이동한다', () => {
      const state: VimEditorState = {
        lines: [...multiLines],
        cursor: { line: 2, col: 0 },
        mode: 'COMMAND',
      };

      const jumpDown = executeCommandLine(state, ':+3');
      expect(jumpDown.cursor.line).toBe(5);

      const jumpUp = executeCommandLine(state, ':-2');
      expect(jumpUp.cursor.line).toBe(0);
    });

    it('마크 및 패턴 주소 점프: :\'a 및 :/FFF/ 로 해당 위치로 이동한다', () => {
      const state: VimEditorState = {
        lines: [...multiLines],
        cursor: { line: 0, col: 0 },
        marks: {
          a: { row: 4, col: 2 },
        },
        mode: 'COMMAND',
      };

      const jumpMark = executeCommandLine(state, ":'a");
      expect(jumpMark.cursor.line).toBe(4);

      const jumpPattern = executeCommandLine(state, ':/FFF/');
      expect(jumpPattern.cursor.line).toBe(5);
    });

    it('상대 범위 norm 실행: :.,.+2norm A; 로 현재 줄 및 아래 2줄 끝에 세미콜론을 추가한다', () => {
      const state: VimEditorState = {
        lines: ['let a = 1', 'let b = 2', 'let c = 3', 'let d = 4'],
        cursor: { line: 1, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':.,.+2norm A;', handleKey);
      expect(result.lines).toEqual(['let a = 1', 'let b = 2;', 'let c = 3;', 'let d = 4;']);
    });

    it('상대 범위 move 실행: :.,.+1m $ 로 현재 줄과 다음 줄을 파일 끝으로 이동한다', () => {
      const state: VimEditorState = {
        lines: ['first', 'second', 'third', 'fourth'],
        cursor: { line: 0, col: 0 },
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':.,.+1m $');
      expect(result.lines).toEqual(['third', 'fourth', 'first', 'second']);
    });

    it(':changes 명령어로 체인지 리스트를 출력한다', () => {
      const state: VimEditorState = {
        lines: ['hello world', 'second line'],
        cursor: { line: 0, col: 0 },
        changeList: [
          { row: 0, col: 5, line: 0 },
          { row: 1, col: 2, line: 1 },
        ],
        changeIndex: 1,
        mode: 'COMMAND',
      };

      const result = executeCommandLine(state, ':changes');
      expect(result.commandMessage).toContain('change line  col text');
      expect(result.commandMessage).toContain('hello world');
      expect(result.commandMessage).toContain('second line');
      expect(result.commandMessage).toContain('>');
    });
  });
});
