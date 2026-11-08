import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine, splitPipedCommands } from './commandLine';
import type { VimEditorState } from './types';

function createState(lines: string[] = ['foo bar', 'baz qux'], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

const run = (state: VimEditorState, cmd: string) => executeCommandLine(state, cmd, handleKey);

describe('splitPipedCommands (Vim :bar 분할 파서)', () => {
  it('단일 명령어나 빈 줄은 그대로 또는 빈 배열로 반환', () => {
    expect(splitPipedCommands('')).toEqual([]);
    expect(splitPipedCommands('   ')).toEqual([]);
    expect(splitPipedCommands(':')).toEqual([]);
    expect(splitPipedCommands('set number')).toEqual(['set number']);
    expect(splitPipedCommands(':set number')).toEqual(['set number']);
  });

  it('기본 파이프(|)로 구분된 다중 명령 분할', () => {
    expect(splitPipedCommands('set number | set relativenumber')).toEqual([
      'set number',
      'set relativenumber',
    ]);
    expect(splitPipedCommands(':set nu | :set rnu | :set list')).toEqual([
      'set nu',
      ':set rnu',
      ':set list',
    ]);
  });

  it('따옴표 내부의 | 문자는 분할하지 않고 보존', () => {
    expect(splitPipedCommands('echo "a | b" | echo \'c | d\'')).toEqual([
      'echo "a | b"',
      "echo 'c | d'",
    ]);
  });

  it('역슬래시 이스케이프(\\|) 보존', () => {
    expect(splitPipedCommands('echo "pipe: \\|" | echo "second"')).toEqual([
      'echo "pipe: \\|"',
      'echo "second"',
    ]);
  });

  it('논리 연산자 || (logical OR) 보존', () => {
    expect(splitPipedCommands('if a || b | echo 1 | endif')).toEqual([
      'if a || b',
      'echo 1',
      'endif',
    ]);
  });

  it(':s 치환식 내부의 | 보존', () => {
    expect(splitPipedCommands('%s/foo|bar/baz/g | echo "done"')).toEqual([
      '%s/foo|bar/baz/g',
      'echo "done"',
    ]);
  });

  it(':g 글로벌 명령은 줄 단위 명령 전체를 하나로 유지', () => {
    expect(splitPipedCommands('g/pattern/s/foo/bar/ | echo "each"')).toEqual([
      'g/pattern/s/foo/bar/ | echo "each"',
    ]);
  });

  it('람다 및 중괄호 블록 내부의 | 보존', () => {
    expect(splitPipedCommands('echo {x -> x || 0}(1) | echo "ok"')).toEqual([
      'echo {x -> x || 0}(1)',
      'echo "ok"',
    ]);
  });
});

describe('파이프(|) 다중 Ex 명령 순차 실행', () => {
  it('에디터 옵션 다중 설정 (:set number | set relativenumber)', () => {
    let s = createState();
    s = run(s, 'set number | set relativenumber');
    expect(s.options?.number).toBe(true);
    expect(s.options?.relativenumber).toBe(true);
  });

  it('Vim script 변수 선언 및 연산 체이닝 (:let a = 10 | let b = 20 | echo a + b)', () => {
    let s = createState();
    s = run(s, 'let a = 10 | let b = 20 | echo a + b');
    expect(s.globalVars?.['a']).toBe(10);
    expect(s.globalVars?.['b']).toBe(20);
    expect(s.commandMessage).toBe('30');
  });

  it('다중 치환 연속 실행 (:%s/foo/FOO/g | %s/bar/BAR/g)', () => {
    let s = createState(['foo bar', 'foo bar']);
    s = run(s, '%s/foo/FOO/g | %s/bar/BAR/g');
    expect(s.lines).toEqual(['FOO BAR', 'FOO BAR']);
  });

  it('중간 명령 실패 시 이후 파이프 명령 실행 중단', () => {
    let s = createState();
    s = run(s, 'set number | invalid_command_xyz | set relativenumber');
    expect(s.options?.number).toBe(true);
    expect(s.options?.relativenumber).toBe(false);
    expect(s.commandMessage).toMatch(/E492/);
    expect(s.bell).toBe(true);
  });
});

describe('파이프(|) 스크립트 제어 블록 실행 (if/for/while/try)', () => {
  it('한 줄 :if/:else/:endif 조건 제어문', () => {
    let s = createState();
    s = run(s, 'let g:res = 0 | if 1 | let g:res = 42 | else | let g:res = -1 | endif');
    expect(s.globalVars?.['res']).toBe(42);

    s = run(s, 'if 0 | let g:res = 1 | elseif 1 | let g:res = 99 | endif');
    expect(s.globalVars?.['res']).toBe(99);
  });

  it('한 줄 :for 반복문', () => {
    let s = createState();
    s = run(s, 'let g:sum = 0 | for v in [1, 2, 3, 4] | let g:sum += v | endfor | echo g:sum');
    expect(s.globalVars?.['sum']).toBe(10);
    expect(s.commandMessage).toBe('10');
  });

  it('한 줄 :while 반복문', () => {
    let s = createState();
    s = run(s, 'let g:cnt = 0 | while g:cnt < 5 | let g:cnt += 1 | endwhile');
    expect(s.globalVars?.['cnt']).toBe(5);
  });

  it('한 줄 :try/:catch/:finally 예외 처리문', () => {
    let s = createState();
    s = run(s, 'let g:caught = "" | try | throw "PipedError" | catch /Piped/ | let g:caught = v:exception | endtry');
    expect(s.globalVars?.['caught']).toBe('PipedError');

    s = run(s, 'let g:fin = 0 | try | let g:x = 1 | finally | let g:fin = 1 | endtry');
    expect(s.globalVars?.['x']).toBe(1);
    expect(s.globalVars?.['fin']).toBe(1);
  });

  it('불완전한 제어 블록은 E170 / E171 에러를 발생시킴', () => {
    let s = createState();
    const s1 = run(s, 'if 1 | echo "missing"');
    expect(s1.commandMessage).toMatch(/E171/);

    const s2 = run(s, 'for x in [1] | echo x');
    expect(s2.commandMessage).toMatch(/E170/);

    const s3 = run(s, 'while 1 | echo 1');
    expect(s3.commandMessage).toMatch(/E170/);

    const s4 = run(s, 'try | echo 1');
    expect(s4.commandMessage).toMatch(/E171/);
  });
});

describe('최상위 독립 제어문 키워드 에러 처리', () => {
  it('짝 없는 단독 제어문 실행 시 표준 Vim 오류 발생', () => {
    let s = createState();
    expect(run(s, 'if 1').commandMessage).toMatch(/E171/);
    expect(run(s, 'else').commandMessage).toMatch(/E581/);
    expect(run(s, 'elseif 1').commandMessage).toMatch(/E582/);
    expect(run(s, 'endif').commandMessage).toMatch(/E580/);
    expect(run(s, 'while 1').commandMessage).toMatch(/E170/);
    expect(run(s, 'endwhile').commandMessage).toMatch(/E588/);
    expect(run(s, 'for x in [1]').commandMessage).toMatch(/E170/);
    expect(run(s, 'endfor').commandMessage).toMatch(/E588/);
    expect(run(s, 'break').commandMessage).toMatch(/E587/);
    expect(run(s, 'continue').commandMessage).toMatch(/E587/);
  });
});
