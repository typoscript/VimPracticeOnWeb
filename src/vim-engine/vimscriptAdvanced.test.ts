import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { evaluateVimScript, EvalContext, VimScriptError } from './vimscriptEval';
import type { VimEditorState } from './types';

function createState(lines: string[] = ['x'], cursor = { line: 0, col: 0 }): VimEditorState {
  return { lines, cursor, mode: 'NORMAL' };
}

function ctxFor(partial: Partial<VimEditorState> = {}): EvalContext {
  return {
    state: { ...createState(), ...partial },
    callUserFunction: () => {
      throw new VimScriptError('E117');
    },
  };
}

const ev = (src: string, ctx = ctxFor()) => evaluateVimScript(src, ctx);
const run = (state: VimEditorState, cmd: string) => executeCommandLine(state, cmd, handleKey);
const echo = (state: VimEditorState, expr: string) => run(state, `echo ${expr}`).commandMessage;

/** 커맨드라인으로 여러 줄 명령 실행 */
function execLines(state: VimEditorState, lines: string[]): VimEditorState {
  return lines.reduce((s, l) => {
    const start = s.mode === 'COMMAND' ? s : handleKey(s, ':');
    return [...l.split(''), 'Enter'].reduce((a, k) => handleKey(a, k), start);
  }, state);
}

describe('Vim script 람다 표현식 { args -> expr }', () => {
  it('단일 인자 및 다중 인자 람다 즉시 호출', () => {
    expect(ev('{x -> x * 2}(10)')).toBe(20);
    expect(ev('{a, b -> a + b}(3, 4)')).toBe(7);
    expect(ev('{a, b, c -> a . b . c}("foo", "-", "bar")')).toBe('foo-bar');
  });

  it('인자 없는 람다 {-> expr}()', () => {
    expect(ev('{-> 42}()')).toBe(42);
    expect(ev('{ -> "hello" }()')).toBe('hello');
  });

  it('변수에 저장 후 호출', () => {
    let s = createState();
    s = run(s, 'let Double = {x -> x * 2}');
    expect(echo(s, 'Double(21)')).toBe('42');
  });

  it('클로저: 외부 함수 스코프 변수 캡처', () => {
    let s = createState();
    s = execLines(s, [
      'function! MakeAdder(base)',
      '  return {n -> a:base + n}',
      'endfunction',
      'let Add10 = MakeAdder(10)',
      'let Add100 = MakeAdder(100)',
    ]);
    expect(echo(s, 'Add10(5)')).toBe('15');
    expect(echo(s, 'Add100(5)')).toBe('105');
  });

  it('딕셔너리 메서드 호출 및 self 바인딩', () => {
    let s = createState();
    s = execLines(s, [
      'let calc = {"factor": 3, "multiply": {x -> self.factor * x}}',
    ]);
    expect(echo(s, 'calc.multiply(10)')).toBe('30');
  });
});

describe('Funcref 와 고차 함수 (function, funcref, call, map, filter, sort)', () => {
  it('내장 함수 funcref 및 call()', () => {
    let s = createState();
    s = run(s, 'let StrLen = function("strlen")');
    expect(echo(s, 'StrLen("hello")')).toBe('5');
    expect(echo(s, 'call(StrLen, ["abcdef"])')).toBe('6');
    expect(echo(s, 'type(StrLen)')).toBe('2'); // v:t_func == 2
  });

  it('사용자 정의 함수 funcref', () => {
    let s = createState();
    s = execLines(s, [
      'function! Cube(n)',
      '  return a:n * a:n * a:n',
      'endfunction',
      'let Fn = function("Cube")',
    ]);
    expect(echo(s, 'Fn(3)')).toBe('27');
  });

  it('부분 적용 (Partial Application)', () => {
    let s = createState();
    s = run(s, 'let Add5 = function({a, b -> a + b}, [5])');
    expect(echo(s, 'Add5(10)')).toBe('15');
  });

  it('고차 함수: map() 및 filter() 에 람다 사용', () => {
    let s = createState();
    s = run(s, 'let doubled = map([1, 2, 3], {idx, v -> v * 2})');
    expect(echo(s, 'doubled')).toBe('[2, 4, 6]');

    s = run(s, 'let evens = filter([1, 2, 3, 4, 5, 6], {idx, v -> v % 2 == 0})');
    expect(echo(s, 'evens')).toBe('[2, 4, 6]');
  });

  it('고차 함수: sort() 에 커스텀 비교 람다 사용', () => {
    let s = createState();
    // 역순 정렬
    s = run(s, 'let nums = sort([3, 1, 4, 1, 5, 9], {a, b -> b - a})');
    expect(echo(s, 'nums')).toBe('[9, 5, 4, 3, 1, 1]');
  });
});

describe('예외 처리 (:try, :catch, :finally, :endtry, :throw)', () => {
  it('기본 :try / :catch 로 :throw 포착 및 v:exception 확인', () => {
    let s = createState();
    s = execLines(s, [
      'let g:caught = ""',
      'function! TestCatch()',
      '  try',
      '    throw "CustomError: something went wrong"',
      '  catch',
      '    let g:caught = v:exception',
      '  endtry',
      'endfunction',
      'call TestCatch()',
    ]);
    expect(echo(s, 'g:caught')).toBe('CustomError: something went wrong');
  });

  it(':catch 정규식 패턴 선별 매칭', () => {
    let s = createState();
    s = execLines(s, [
      'let g:step = 0',
      'function! TestPattern()',
      '  try',
      '    throw "SpecialErrorCode_123"',
      '  catch /UnmatchedPattern/',
      '    let g:step = 1',
      '  catch /SpecialErrorCode_\\d\\+/',
      '    let g:step = 2',
      '  catch',
      '    let g:step = 3',
      '  endtry',
      'endfunction',
      'call TestPattern()',
    ]);
    expect(echo(s, 'g:step')).toBe('2');
  });

  it('런타임 에러(E-number)도 :catch 로 포착 가능', () => {
    let s = createState();
    s = execLines(s, [
      'let g:caught_err = ""',
      'function! TestRuntimeCatch()',
      '  try',
      '    let x = non_existent_variable',
      '  catch /E121/',
      '    let g:caught_err = "caught_e121"',
      '  endtry',
      'endfunction',
      'call TestRuntimeCatch()',
    ]);
    expect(echo(s, 'g:caught_err')).toBe('caught_e121');
  });

  it(':finally 는 정상 종료 시에도 항상 실행됨', () => {
    let s = createState();
    s = execLines(s, [
      'let g:fin = 0',
      'function! TestFinallyNormal()',
      '  try',
      '    let g:val = 100',
      '  finally',
      '    let g:fin = 1',
      '  endtry',
      'endfunction',
      'call TestFinallyNormal()',
    ]);
    expect(echo(s, 'g:val')).toBe('100');
    expect(echo(s, 'g:fin')).toBe('1');
  });

  it(':finally 는 예외 포착 후에도 항상 실행됨', () => {
    let s = createState();
    s = execLines(s, [
      'let g:fin = 0',
      'function! TestFinallyException()',
      '  try',
      '    throw "err"',
      '  catch',
      '    let g:caught = 1',
      '  finally',
      '    let g:fin = 1',
      '  endtry',
      'endfunction',
      'call TestFinallyException()',
    ]);
    expect(echo(s, 'g:caught')).toBe('1');
    expect(echo(s, 'g:fin')).toBe('1');
  });

  it('함수 내 :try 블록에서 조기 :return 시에도 :finally 실행 후 반환', () => {
    let s = createState();
    s = execLines(s, [
      'let g:fin_ran = 0',
      'function! TestEarlyReturn()',
      '  try',
      '    return 777',
      '  finally',
      '    let g:fin_ran = 1',
      '  endtry',
      'endfunction',
      'let g:result = TestEarlyReturn()',
    ]);
    expect(echo(s, 'g:result')).toBe('777');
    expect(echo(s, 'g:fin_ran')).toBe('1');
  });

  it('구문 오류 감지: E601, E606, E607, E602, E605, E171', () => {
    let s = createState();
    // :catch without :try
    const s1 = run(s, 'catch');
    expect(s1.commandMessage).toMatch(/E601/);

    // :finally without :try
    const s2 = run(s, 'finally');
    expect(s2.commandMessage).toMatch(/E606/);

    // :endtry without :try
    const s3 = run(s, 'endtry');
    expect(s3.commandMessage).toMatch(/E607/);

    // top-level uncaught :throw -> E605
    const s4 = run(s, 'throw "uncaught"');
    expect(s4.commandMessage).toMatch(/E605/);

    // top-level :try without :endtry -> E171
    const s5 = run(s, 'try');
    expect(s5.commandMessage).toMatch(/E171/);

    // :catch after :finally inside function -> E602
    const s6 = execLines(s, [
      'function! BadOrder()',
      '  try',
      '    let x = 1',
      '  finally',
      '    let y = 2',
      '  catch',
      '    let z = 3',
      '  endtry',
      'endfunction',
      'call BadOrder()',
    ]);
    expect(s6.commandMessage).toMatch(/E602/);
  });
});
