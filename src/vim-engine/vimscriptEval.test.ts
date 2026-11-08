import { describe, it, expect } from 'vitest';
import { evaluateVimScript, evaluateVimScriptList, toNumber, EvalContext, VimScriptError } from './vimscriptEval';
import type { VimEditorState } from './types';

function ctxFor(partial: Partial<VimEditorState> = {}, extra: Partial<EvalContext> = {}): EvalContext {
  return {
    state: { lines: ['hello', 'world'], cursor: { line: 1, col: 2 }, mode: 'NORMAL', ...partial },
    callUserFunction: () => {
      throw new VimScriptError('E117: 알 수 없는 함수입니다');
    },
    ...extra,
  };
}

const ev = (src: string, ctx = ctxFor()) => evaluateVimScript(src, ctx);

describe('Vim script 표현식: 값과 연산자', () => {
  it('정수 산술은 정수 나눗셈과 우선순위를 따른다', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('7 / 2')).toBe(3);
    expect(ev('-7 / 2')).toBe(-3);
    expect(ev('7 % 3')).toBe(1);
    expect(ev('0x10 + 1')).toBe(17);
    expect(ev('-(2 + 3)')).toBe(-5);
  });

  it('문자열 리터럴과 이스케이프, 연결(. ..)', () => {
    expect(ev('"a\\tb"')).toBe('a\tb');
    expect(ev("'it''s'")).toBe("it's");
    expect(ev("'a' . 'b' .. 'c'")).toBe('abc');
    expect(ev('1 . 2')).toBe('12');
  });

  it('숫자·문자열 자동 변환을 Vim과 같이 처리한다', () => {
    expect(ev('"12abc" + 1')).toBe(13);
    expect(ev('"abc" + 1')).toBe(1);
    expect(toNumber('0x1f')).toBe(31);
    // 문자열은 숫자로 바꿔 참/거짓을 판단하므로 "abc" 는 거짓
    expect(ev('"abc" ? 1 : 0')).toBe(0);
  });

  it('비교 연산자와 대소문자 구분 접미사 (# ?)', () => {
    expect(ev('3 > 2')).toBe(1);
    expect(ev('"abc" == "ABC"')).toBe(0);
    expect(ev('"abc" ==? "ABC"')).toBe(1);
    expect(ev('"abc" == "ABC"', ctxFor({ options: { ignorecase: true } as VimEditorState['options'] }))).toBe(1);
    expect(ev('"abc" ==# "ABC"', ctxFor({ options: { ignorecase: true } as VimEditorState['options'] }))).toBe(0);
    expect(ev('"10" == 10')).toBe(1);
  });

  it('논리 연산자와 삼항 연산자', () => {
    expect(ev('1 && 0 || 1')).toBe(1);
    expect(ev('!0')).toBe(1);
    expect(ev('0 ? "y" : "n"')).toBe('n');
  });
});

describe('Vim script 표현식: 변수, 레지스터, 내장 함수', () => {
  it('g: 변수와 a: 인자, l: 지역 변수를 읽는다', () => {
    const ctx = ctxFor({ globalVars: { count: 3 } }, { locals: { x: 'loc' }, args: { name: 'bob', '0': 0 } });
    expect(ev('g:count + 1', ctx)).toBe(4);
    expect(ev('x', ctx)).toBe('loc');
    expect(ev('a:name', ctx)).toBe('bob');
    expect(ev('a:0', ctx)).toBe(0);
    // 함수 밖에서는 접두어 없는 이름이 g:
    expect(ev('count', ctxFor({ globalVars: { count: 5 } }))).toBe(5);
    expect(() => ev('nope')).toThrow(/E121/);
  });

  it('@r 레지스터와 v:true / v:false', () => {
    const ctx = ctxFor({ registers: { a: { type: 'char', content: 'yanked' } } });
    expect(ev('@a', ctx)).toBe('yanked');
    expect(ev('v:true + v:true')).toBe(2);
  });

  it('줄·커서 내장 함수 (line, col, getline, setline)', () => {
    const ctx = ctxFor();
    expect(ev("line('.')", ctx)).toBe(2);
    expect(ev("line('$')", ctx)).toBe(2);
    expect(ev("col('.')", ctx)).toBe(3);
    expect(ev("getline(1)", ctx)).toBe('hello');
    expect(ev("setline('.', toupper(getline('.')))", ctx)).toBe(0);
    expect(ctx.state.lines).toEqual(['hello', 'WORLD']);
  });

  it('문자열 내장 함수와 exists()', () => {
    expect(ev("strlen('abc') + len('de')")).toBe(5);
    expect(ev("repeat('-', 3)")).toBe('---');
    expect(ev("string('x')")).toBe("'x'");
    expect(ev("trim('  a  ')")).toBe('a');
    expect(ev("exists('g:missing')")).toBe(0);
    expect(ev("exists('g:here')", ctxFor({ globalVars: { here: 1 } }))).toBe(1);
  });

  it('잘못된 표현식과 알 수 없는 함수, 인자 개수 오류', () => {
    expect(() => ev('1 +')).toThrow(/E15/);
    expect(() => ev('"open')).toThrow(/E114/);
    expect(() => ev('nosuch(1)')).toThrow(/E117/);
    expect(() => ev('strlen()')).toThrow(/E119/);
    expect(() => ev('strlen(1, 2)')).toThrow(/E118/);
  });

  it(':echo 용 나열 표현식은 각각 한 번씩 평가한다', () => {
    let calls = 0;
    const ctx = ctxFor({}, {
      callUserFunction: () => {
        calls++;
        return 'r';
      },
    });
    expect(evaluateVimScriptList("'a' 1+2 Foo()", ctx)).toEqual(['a', 3, 'r']);
    expect(calls).toBe(1);
  });
});
