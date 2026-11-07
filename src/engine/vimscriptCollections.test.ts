import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { evaluateVimScript, EvalContext, VimScriptError, makeDict } from './vimscriptEval';
import type { VimEditorState } from '../types/vim';

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

/** 커맨드라인으로 함수 정의 (본문 입력 모드 포함) */
function define(state: VimEditorState, lines: string[]): VimEditorState {
  return lines.reduce((s, l) => {
    const start = s.mode === 'COMMAND' ? s : handleKey(s, ':');
    return [...l.split(''), 'Enter'].reduce((a, k) => handleKey(a, k), start);
  }, state);
}

describe('리스트·딕셔너리 리터럴과 인덱스', () => {
  it('리스트 리터럴, 음수 인덱스, 슬라이스(끝 포함)', () => {
    expect(ev('[1, "a", [2]]')).toEqual([1, 'a', [2]]);
    expect(ev('[1, 2, 3,]')).toEqual([1, 2, 3]);
    expect(ev('[10, 20, 30][-1]')).toBe(30);
    expect(ev('[10, 20, 30][1:]')).toEqual([20, 30]);
    expect(ev('[10, 20, 30][:1]')).toEqual([10, 20]);
    expect(ev('[10, 20, 30][2:1]')).toEqual([]);
    expect(() => ev('[1][5]')).toThrow(/E684/);
  });

  it('문자열 인덱스·슬라이스 (범위 밖은 빈 문자열)', () => {
    expect(ev("'hello'[1]")).toBe('e');
    expect(ev("'hello'[9]")).toBe('');
    expect(ev("'hello'[1:3]")).toBe('ell');
    expect(ev("'hello'[-3:]")).toBe('llo');
  });

  it('딕셔너리 리터럴, d.key / d["key"] 접근, #{} 리터럴 키', () => {
    expect(ev("{'a': 1, 'b': [2]}")).toEqual(makeDict({ a: 1, b: [2] }));
    expect(ev('#{name: "vim", ver: 9}')).toEqual(makeDict({ name: 'vim', ver: 9 }));
    const ctx = ctxFor({ globalVars: { d: makeDict({ k: 'v', n: makeDict({ deep: 1 }) }) } });
    expect(ev('d.k', ctx)).toBe('v');
    expect(ev("d['k']", ctx)).toBe('v');
    expect(ev('d.n.deep', ctx)).toBe(1);
    // 공백이 있으면 . 은 문자열 연결
    expect(ev("d.k . 'x'", ctx)).toBe('vx');
    expect(() => ev('d.missing', ctx)).toThrow(/E716/);
  });

  it('리스트 +, == 내용 비교, 잘못된 연산은 Vim 에러', () => {
    expect(ev('[1] + [2, 3]')).toEqual([1, 2, 3]);
    expect(ev('[1, [2]] == [1, [2]]')).toBe(1);
    expect(ev("{'a': 1} != {'a': 2}")).toBe(1);
    expect(() => ev('[1] + 1')).toThrow(/E745/);
    expect(() => ev("[1] . 'x'")).toThrow(/E730/);
    expect(() => ev('[1] == 1')).toThrow(/E691/);
    expect(() => ev('[1] < [2]')).toThrow(/E692/);
  });
});

describe('정규식 비교 (=~ !~)', () => {
  it('Vim 패턴으로 매치하고 #/? 와 \\c 로 대소문자를 제어한다', () => {
    expect(ev("'foo123' =~ '\\d\\+$'")).toBe(1);
    expect(ev("'foo' !~ '^f'")).toBe(0);
    expect(ev("'FOO' =~ 'foo'")).toBe(0);
    expect(ev("'FOO' =~? 'foo'")).toBe(1);
    expect(ev("'FOO' =~ '\\cfoo'")).toBe(1);
    expect(ev("'FOO' =~# 'foo'", ctxFor({ options: { ignorecase: true } as VimEditorState['options'] }))).toBe(0);
  });
});

describe('내장 함수: 문자열', () => {
  it('substitute(): 그룹·& ·대소문자 변환·g 플래그', () => {
    expect(ev("substitute('a-b-c', '-', '_', '')")).toBe('a_b-c');
    expect(ev("substitute('a-b-c', '-', '_', 'g')")).toBe('a_b_c');
    expect(ev("substitute('snake_case', '_\\(\\w\\)', '\\u\\1', 'g')")).toBe('snakeCase');
    expect(ev("substitute('hi', '.*', '[&]', '')")).toBe('[hi]');
    expect(ev("substitute('abc', 'b', '\\U&x\\E!', '')")).toBe('aBX!c');
  });

  it('printf(): %d %s %x %c %% 와 폭·0 채움·왼쪽 정렬·정밀도', () => {
    expect(ev("printf('%d-%s', 7, 'x')")).toBe('7-x');
    expect(ev("printf('%03d|%-4s|%4s|', 5, 'ab', 'cd')")).toBe('005|ab  |  cd|');
    expect(ev("printf('%x %X %o %c %%', 255, 255, 8, 65)")).toBe('ff FF 10 A %');
    expect(ev("printf('%.2s', 'abcdef')")).toBe('ab');
    expect(ev("printf('%s', [1, 'a'])")).toBe("[1, 'a']");
    expect(() => ev("printf('%d %d', 1)")).toThrow(/E766/);
  });

  it('split / join / matchstr / match / stridx / escape', () => {
    expect(ev("split('  a b  c ')")).toEqual(['a', 'b', 'c']);
    expect(ev("split('a,b,,c', ',')")).toEqual(['a', 'b', '', 'c']);
    expect(ev("join(['a', 1, [2]], '-')")).toBe('a-1-[2]');
    expect(ev("matchstr('id=42;', '\\d\\+')")).toBe('42');
    expect(ev("match('hello', 'l')")).toBe(2);
    expect(ev("stridx('hello', 'll')")).toBe(2);
    expect(ev("escape('a.b', '.')")).toBe('a\\.b');
  });
});

describe('내장 함수: 리스트·딕셔너리', () => {
  it('range / len / empty / get / index / count / max / min / type', () => {
    expect(ev('range(3)')).toEqual([0, 1, 2]);
    expect(ev('range(2, 8, 3)')).toEqual([2, 5, 8]);
    expect(ev('range(3, 1, -1)')).toEqual([3, 2, 1]);
    expect(ev('len([1, 2]) + len(#{a: 1}) + len("abc")')).toBe(6);
    expect(ev('empty([]) + empty({}) + empty("") + empty(0) + empty([0])')).toBe(4);
    expect(ev('get([1, 2], 5, "def")')).toBe('def');
    expect(ev("get(#{a: 1}, 'a')")).toBe(1);
    expect(ev("index(['a', 'b'], 'b')")).toBe(1);
    expect(ev('count([1, 2, 1], 1)')).toBe(2);
    expect(ev('max([3, 9, 2]) - min([3, 9, 2])')).toBe(7);
    expect(ev('type(1) . type("") . type([]) . type({})')).toBe('0134');
  });

  it('keys / values / items / has_key / extend', () => {
    const ctx = ctxFor({ globalVars: { d: makeDict({ a: 1, b: 2 }) } });
    expect(ev('sort(keys(d))', ctx)).toEqual(['a', 'b']);
    expect(ev('values(d)', ctx)).toEqual([1, 2]);
    expect(ev('items(d)', ctx)).toEqual([['a', 1], ['b', 2]]);
    expect(ev("has_key(d, 'b') . has_key(d, 'z')", ctx)).toBe('10');
    expect(ev('extend([1], [2, 3])')).toEqual([1, 2, 3]);
  });

  it('map() / filter() 는 v:val, v:key 문자열 표현식을 평가한다', () => {
    expect(ev("map([1, 2, 3], 'v:val * 10')")).toEqual([10, 20, 30]);
    expect(ev("map(['a', 'b'], 'v:key . v:val')")).toEqual(['0a', '1b']);
    expect(ev("filter([1, 2, 3, 4], 'v:val % 2 == 0')")).toEqual([2, 4]);
    expect(ev("filter(#{a: 1, b: 2}, 'v:val > 1')")).toEqual(makeDict({ b: 2 }));
  });

  it('제자리 변경 함수(add, sort, remove ...)는 첫 인자 변수에 결과를 다시 저장한다', () => {
    let state = run(createState(), 'let g:l = [3, 1, 2]');
    state = run(state, 'call add(g:l, 0)');
    expect(state.globalVars?.l).toEqual([3, 1, 2, 0]);
    state = run(state, 'call sort(g:l)');
    expect(state.globalVars?.l).toEqual([0, 1, 2, 3]);
    state = run(state, "call sort(g:l, 'n')");
    state = run(state, 'call reverse(g:l)');
    expect(state.globalVars?.l).toEqual([3, 2, 1, 0]);
    state = run(state, 'let g:r = remove(g:l, 0)');
    expect(state.globalVars?.r).toBe(3);
    expect(state.globalVars?.l).toEqual([2, 1, 0]);
    state = run(state, 'call insert(g:l, 9, 1)');
    expect(state.globalVars?.l).toEqual([2, 9, 1, 0]);
    state = run(state, "call map(g:l, 'v:val + 1')");
    expect(state.globalVars?.l).toEqual([3, 10, 2, 1]);
    // 숫자 정렬 vs 문자열 정렬
    state = run(state, "let g:n = [10, 9, 100]");
    expect(echo(state, 'sort(copy(g:n))')).toBe('[10, 100, 9]');
    expect(echo(state, "sort(copy(g:n), 'n')")).toBe('[9, 10, 100]');
  });

  it('uniq() 는 연속 중복만 제거한다', () => {
    expect(ev('uniq([1, 1, 2, 1])')).toEqual([1, 2, 1]);
  });
});

describe(':let 대상·:unlet·:echo 확장', () => {
  it('l[i] / d.key / d["key"] 대입과 += 리스트 연결', () => {
    let state = run(createState(), 'let g:l = [1, 2, 3]');
    state = run(state, 'let g:l[0] = 9');
    state = run(state, 'let g:l += [4]');
    expect(state.globalVars?.l).toEqual([9, 2, 3, 4]);

    state = run(state, "let g:d = {'a': 1}");
    state = run(state, "let g:d.b = 'x'");
    state = run(state, "let g:d['c'] = [1]");
    state = run(state, 'let g:d.a += 10');
    expect(state.globalVars?.d).toEqual(makeDict({ a: 11, b: 'x', c: [1] }));
    expect(run(state, 'let g:l[10] = 1').commandMessage).toMatch(/^E684/);
  });

  it('리스트 풀기 [a, b] = ... 와 [a; rest] = ...', () => {
    let state = run(createState(), 'let [g:a, g:b] = [1, 2]');
    expect(state.globalVars).toEqual({ a: 1, b: 2 });
    state = run(state, 'let [g:h; g:t] = [1, 2, 3]');
    expect(state.globalVars?.h).toBe(1);
    expect(state.globalVars?.t).toEqual([2, 3]);
    expect(run(state, 'let [g:a, g:b] = [1]').commandMessage).toMatch(/^E688/);
    expect(run(state, 'let [g:a] = [1, 2]').commandMessage).toMatch(/^E687/);
  });

  it(':unlet 으로 리스트 항목과 딕셔너리 키를 지운다', () => {
    let state = run(run(createState(), 'let g:l = [1, 2, 3]'), "let g:d = #{a: 1, b: 2}");
    state = run(state, 'unlet g:l[0] g:d.a');
    expect(state.globalVars?.l).toEqual([2, 3]);
    expect(state.globalVars?.d).toEqual(makeDict({ b: 2 }));
  });

  it(':echo 는 리스트·딕셔너리를 string() 형식으로 보여준다', () => {
    const state = run(createState(), "let g:v = [1, 'a', #{k: 0}]");
    expect(echo(state, 'g:v "top"')).toBe("[1, 'a', {'k': 0}] top");
  });

  it('getline(a, b) 는 리스트를, setline(n, list) / append() 는 여러 줄을 다룬다', () => {
    let state = run(createState(['a', 'b', 'c']), 'echo getline(1, 2)');
    expect(state.commandMessage).toBe("['a', 'b']");
    state = run(state, "call setline(2, ['B', 'C'])");
    expect(state.lines).toEqual(['a', 'B', 'C']);
    state = run(state, "call append(1, ['x', 'y'])");
    expect(state.lines).toEqual(['a', 'x', 'y', 'B', 'C']);
  });
});

describe(':for 반복과 a:000', () => {
  it('for x in list / break / continue / endfor', () => {
    const state = define(createState(), [
      'function! Evens(list)',
      'let out = []',
      'for x in a:list',
      'if x > 6',
      'break',
      'endif',
      'if x % 2',
      'continue',
      'endif',
      'call add(out, x)',
      'endfor',
      'return out',
      'endfunction',
    ]);
    expect(echo(state, 'Evens(range(10))')).toBe('[0, 2, 4, 6]');
    expect(echo(state, 'Evens([])')).toBe('[]');
  });

  it('for [k, v] in items(d) 풀기와 중첩 for', () => {
    const state = define(createState(), [
      'function! Pairs(d)',
      'let out = []',
      'for [k, v] in sort(items(a:d))',
      'for i in range(v)',
      'call add(out, k)',
      'endfor',
      'endfor',
      'return join(out, "")',
      'endfunction',
    ]);
    expect(echo(state, 'Pairs(#{a: 2, b: 1})')).toBe('aab');
  });

  it('a:000 은 가변 인자 리스트다', () => {
    const state = define(createState(), ['function! All(first, ...)', 'return [a:first, a:000]', 'endfunction']);
    expect(echo(state, 'All(1, 2, 3)')).toBe('[1, [2, 3]]');
    expect(echo(state, 'All(1)')).toBe('[1, []]');
  });

  it('리스트가 아닌 값으로 for 하면 E714', () => {
    const state = define(createState(), ['function! Bad() abort', 'for x in 3', 'endfor', 'endfunction']);
    expect(run(state, 'call Bad()').commandMessage).toMatch(/E714/);
  });
});
