import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
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

/** 커맨드라인에 한 줄을 입력하고 Enter. 함수 본문 입력 중이면 ':' 없이 이어서 입력합니다. */
function typeLine(state: VimEditorState, line: string): VimEditorState {
  const start = state.mode === 'COMMAND' ? state : handleKey(state, ':');
  return press(start, [...line.split(''), 'Enter']);
}

function typeLines(state: VimEditorState, lines: string[]): VimEditorState {
  return lines.reduce(typeLine, state);
}

const run = (state: VimEditorState, cmd: string) => executeCommandLine(state, cmd, handleKey);

describe(':function 정의 (커맨드라인 본문 입력)', () => {
  it(':function! 후 본문을 입력하다 endfunction 에서 확정된다', () => {
    let state = typeLine(createState(['x']), 'function! Hello(name)');
    expect(state.mode).toBe('COMMAND');
    expect(state.functionDraft?.name).toBe('Hello');

    state = typeLine(state, "echo 'hi ' . a:name");
    expect(state.mode).toBe('COMMAND');
    expect(state.functionDraft?.body).toEqual(["echo 'hi ' . a:name"]);

    state = typeLine(state, 'endfunction');
    expect(state.mode).toBe('NORMAL');
    expect(state.functionDraft).toBeUndefined();
    expect(state.userFunctions?.Hello).toMatchObject({ params: ['name'], body: ["echo 'hi ' . a:name"] });

    state = typeLine(state, "call Hello('vim')");
    expect(state.commandMessage).toBe('hi vim');
  });

  it('본문 입력 중 Esc 는 정의를 취소하고, 빈 줄의 Backspace 는 커맨드라인을 떠나지 않는다', () => {
    let state = typeLine(createState(['x']), 'fu! Tmp()');
    state = handleKey(state, 'Backspace');
    expect(state.mode).toBe('COMMAND');
    state = handleKey(state, 'Escape');
    expect(state.mode).toBe('NORMAL');
    expect(state.functionDraft).toBeUndefined();
    expect(state.userFunctions?.Tmp).toBeUndefined();
  });

  it('이름 규칙(E128), 중복 정의(E122), 잘못된 인자(E125)를 검사한다', () => {
    expect(run(createState(['x']), 'function! lower()').commandMessage).toMatch(/^E128/);
    expect(run(createState(['x']), 'function! F(1a)').commandMessage).toMatch(/^E125/);

    let state = typeLines(createState(['x']), ['function F()', 'endfunction']);
    state = run(state, 'function F()');
    expect(state.commandMessage).toMatch(/^E122/);
    expect(state.functionDraft).toBeUndefined();
  });

  it(':function 목록, :function Name 본문 보기, :delfunction', () => {
    let state = typeLines(createState(['x']), ['function! Add(a, b) abort', 'return a:a + a:b', 'endfunction']);
    expect(run(state, 'function').commandMessage).toBe('function Add(a, b) abort');
    expect(run(state, 'function Add').commandMessage).toContain('1  return a:a + a:b');

    state = run(state, 'delfunction Add');
    expect(state.userFunctions?.Add).toBeUndefined();
    expect(run(state, 'delfunction Add').commandMessage).toMatch(/^E130/);
    expect(run(state, 'endfunction').commandMessage).toMatch(/^E193/);
  });
});

describe(':call 과 함수 본문 실행', () => {
  const define = (state: VimEditorState, lines: string[]) => typeLines(state, lines);

  it('return 값을 표현식에서 사용하고, 함수끼리 호출할 수 있다', () => {
    let state = define(createState(['x']), [
      'function! Add(a, b)', 'return a:a + a:b', 'endfunction',
      'function! Twice(n)', 'return Add(a:n, a:n)', 'endfunction',
    ]);
    state = run(state, 'echo Twice(21)');
    expect(state.commandMessage).toBe('42');
  });

  it('가변 인자(...)는 a:0 과 a:1 로 받는다', () => {
    let state = define(createState(['x']), ['function! Count(...)', 'return a:0 . ":" . a:1', 'endfunction']);
    expect(run(state, "echo Count('p', 'q')").commandMessage).toBe('2:p');
    expect(run(state, 'echo Count()').commandMessage).toMatch(/E121/);
  });

  it('인자 개수 오류 (E119, E118) 와 알 수 없는 함수 (E117)', () => {
    let state = define(createState(['x']), ['function! One(a)', 'endfunction']);
    expect(run(state, 'call One()').commandMessage).toMatch(/^E119/);
    expect(run(state, 'call One(1, 2)').commandMessage).toMatch(/^E118/);
    expect(run(state, 'call Nope()').commandMessage).toMatch(/^E117/);
    expect(run(state, 'call Nope()').bell).toBe(true);
  });

  it('if / elseif / else / endif 분기', () => {
    let state = define(createState(['x']), [
      'function! Sign(n)',
      'if a:n > 0',
      "return 'pos'",
      'elseif a:n < 0',
      "return 'neg'",
      'else',
      "return 'zero'",
      'endif',
      'endfunction',
    ]);
    expect(run(state, 'echo Sign(5) Sign(-1) Sign(0)').commandMessage).toBe('pos neg zero');
  });

  it('while / break / continue 반복', () => {
    let state = define(createState(['x']), [
      'function! SumOdd(n)',
      'let i = 0',
      'let s = 0',
      'while 1',
      'let i += 1',
      'if i > a:n',
      'break',
      'endif',
      'if i % 2 == 0',
      'continue',
      'endif',
      'let s += i',
      'endwhile',
      'return s',
      'endfunction',
    ]);
    expect(run(state, 'echo SumOdd(5)').commandMessage).toBe('9');
  });

  it('지역 변수는 함수마다 분리되고, g: 변수는 공유된다', () => {
    let state = define(createState(['x']), [
      'function! Bump()', 'let x = 100', 'let g:hits += 1', 'endfunction',
    ]);
    state = run(state, 'let g:hits = 0');
    state = run(run(state, 'call Bump()'), 'call Bump()');
    expect(state.globalVars?.hits).toBe(2);
    expect(state.globalVars?.x).toBeUndefined();
  });

  it('execute 와 normal 로 버퍼를 편집하고, :call 전체가 한 번의 u 로 되돌려진다', () => {
    const base = press(createState(['abc']), ['x']); // 이전 변경 1개: 'bc'
    let state = define(base, [
      'function! Shout()', "call setline('.', getline('.') . '!')", "execute 'normal! gUU'", 'endfunction',
    ]);
    state = run(state, 'call Shout()');
    expect(state.lines).toEqual(['BC!']);
    state = press(state, ['u']);
    expect(state.lines).toEqual(['bc']);
    state = press(state, ['u']);
    expect(state.lines).toEqual(['abc']);
    state = press(state, ['Ctrl-r']);
    expect(state.lines).toEqual(['bc']);
  });

  it('[range]call: range 속성이 없으면 줄마다, 있으면 한 번 호출한다', () => {
    let state = define(createState(['a', 'b', 'c']), [
      'function! Mark()', "call setline('.', '- ' . getline('.'))", 'endfunction',
      'function! Span() range', "echo a:firstline . '-' . a:lastline", 'endfunction',
    ]);
    const marked = run(state, '%call Mark()');
    expect(marked.lines).toEqual(['- a', '- b', '- c']);

    const spanned = run(state, '2,3call Span()');
    expect(spanned.commandMessage).toBe('2-3');
    expect(spanned.lines).toEqual(['a', 'b', 'c']);
  });

  it('abort 가 없으면 에러 뒤에도 계속 실행하고, abort 가 있으면 즉시 멈춘다', () => {
    let state = define(createState(['x']), [
      'function! Soft()', 'let g:a = nope', 'let g:after = 1', 'endfunction',
      'function! Hard() abort', 'let g:b = nope', 'let g:after2 = 1', 'endfunction',
    ]);
    const soft = run(state, 'call Soft()');
    expect(soft.globalVars?.after).toBe(1);
    expect(soft.commandMessage).toMatch(/^E121/);

    const hard = run(state, 'call Hard()');
    expect(hard.globalVars?.after2).toBeUndefined();
    expect(hard.bell).toBe(true);
  });

  it('무한 재귀는 E132 로 멈춘다', () => {
    let state = define(createState(['x']), ['function! Rec()', 'return Rec()', 'endfunction']);
    expect(run(state, 'call Rec()').commandMessage).toMatch(/E132/);
  });
});

describe('커맨드라인 변수 명령 (:let, :unlet, :echo)', () => {
  it(':let 대입 연산자와 레지스터 대입', () => {
    let state = run(createState(['x']), 'let g:n = 10');
    state = run(state, 'let n += 5');
    state = run(state, "let g:s = 'a'");
    state = run(state, "let s .= 'b'");
    state = run(state, "let @a = 'reg'");
    expect(state.globalVars).toEqual({ n: 15, s: 'ab' });
    expect(state.registers?.a?.content).toBe('reg');
    expect(run(state, 'echo n s @a').commandMessage).toBe('15 ab reg');
  });

  it(':unlet 과 E108, 읽기 전용 a: 대입은 E46', () => {
    let state = run(run(createState(['x']), 'let g:t = 1'), 'unlet g:t');
    expect(state.globalVars).toEqual({});
    expect(run(state, 'unlet g:t').commandMessage).toMatch(/^E108/);
    expect(run(state, 'unlet! g:t').bell).toBeUndefined();
    expect(run(state, 'let a:x = 1').commandMessage).toMatch(/^E46/);
  });

  it('let mapleader 는 기존 리더 키 설정으로 처리된다', () => {
    const state = run(createState(['x']), 'let mapleader = ","');
    expect(state.leaderKey).toBe(',');
  });
});

describe('사용자 명령 연동 (<f-args>) 과 .vimrc 소싱', () => {
  it(':command! 와 <f-args> 로 함수에 인자를 나눠 전달한다', () => {
    let state = typeLines(createState(['x']), [
      'function! Join(...)', "return a:1 . '+' . a:2", 'endfunction',
      'command! -nargs=* J echo Join(<f-args>)',
    ]);
    expect(run(state, 'J left right').commandMessage).toBe('left+right');
  });

  it(':source 로 함수 블록, let, call 을 함께 적용한다', () => {
    const vimrc = [
      '" vimrc',
      'let g:greeting = "hey"',
      'function! Greet() abort',
      '  return g:greeting . "!"',
      'endfunction',
      'command! G echo Greet()',
    ];
    let state = run(createState(vimrc), 'source %');
    expect(state.userFunctions?.Greet?.body).toEqual(['  return g:greeting . "!"']);
    expect(state.globalVars?.greeting).toBe('hey');
    expect(run(state, 'G').commandMessage).toBe('hey!');
  });
});
