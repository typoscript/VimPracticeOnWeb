import { describe, it, expect } from 'vitest';
import { compileVimRegex, translateVimPattern } from './vimRegex';

/** 패턴이 문자열에서 찾은 부분 (없으면 null) */
const find = (pattern: string, text: string, opts = {}) => compileVimRegex(pattern, opts).exec(text)?.[0] ?? null;

describe('Vim 정규식: magic (기본) 모드의 리터럴과 특수 문자', () => {
  it('+ ? = | ( ) { } 는 \\ 없이 쓰면 리터럴이다', () => {
    expect(find('a+b', 'aaab a+b')).toBe('a+b');
    expect(find('(foo)', 'foo (foo)')).toBe('(foo)');
    expect(find('x|y', 'y x|y')).toBe('x|y');
    expect(find('a?', 'a a?')).toBe('a?');
    expect(find('{1}', 'a{1}')).toBe('{1}');
  });

  it('\\ 를 붙이면 반복·선택·그룹이 된다', () => {
    expect(find('a\\+b', 'xaaab')).toBe('aaab');
    expect(find('colou\\=r', 'color colour')).toBe('color');
    expect(find('colou\\?r', 'colour')).toBe('colour');
    expect(find('cat\\|dog', 'hotdog')).toBe('dog');
    expect(find('\\(ab\\)\\+', 'xababx')).toBe('abab');
    expect(find('a\\{2,3}', 'aaaa')).toBe('aaa');
    expect(find('a\\{2}', 'aaaa')).toBe('aa');
    expect(find('a\\{-1,}', 'aaaa')).toBe('a');
    expect(find('<.\\{-}>', '<a><b>')).toBe('<a>');
  });

  it('. * [ ] ~ 는 기본적으로 특수, \\ 를 붙이면 리터럴', () => {
    expect(find('a.c', 'abc')).toBe('abc');
    expect(find('a\\.c', 'abc a.c')).toBe('a.c');
    expect(find('ab*', 'abbb')).toBe('abbb');
    expect(find('a\\*', 'a*')).toBe('a*');
    expect(find('[0-9]\\+', 'id42')).toBe('42');
    expect(find('\\[x\\]', '[x]')).toBe('[x]');
  });

  it('^ $ 는 패턴 시작·끝에서만 특수, 맨 앞의 * 는 리터럴', () => {
    expect(find('^foo', 'foo bar')).toBe('foo');
    expect(find('^foo', 'a foo')).toBeNull();
    expect(find('a^b', 'a^b')).toBe('a^b');
    expect(find('bar$', 'foo bar')).toBe('bar');
    expect(find('a$b', 'a$b')).toBe('a$b');
    expect(find('*x', 'a*x')).toBe('*x');
    expect(find('^\\(a\\|b\\)$', 'b')).toBe('b');
  });

  it('단어 경계 \\< \\>, 역참조 \\1', () => {
    expect(find('\\<is\\>', 'this is')).toBe('is');
    expect(compileVimRegex('\\<is\\>').exec('this is')?.index).toBe(5);
    expect(find('\\(\\w\\)\\1', 'abccd')).toBe('cc');
  });
});

describe('Vim 정규식: 문자 클래스', () => {
  it('\\a \\l \\u \\x \\h \\k \\s \\d 와 대문자 반대 클래스', () => {
    expect(find('\\u\\l\\+', 'abc Hello')).toBe('Hello');
    expect(find('\\x\\+', 'zz 0fA9 zz')).toBe('0fA9');
    expect(find('\\h\\k*', '9 _var1 ')).toBe('_var1');
    expect(find('\\S\\+', '   word  ')).toBe('word');
    expect(find('\\a\\+', '12abc34')).toBe('abc');
    expect(find('\\D\\+', '12ab34')).toBe('ab');
  });

  it('[...] 안의 POSIX 클래스와 이스케이프, 닫히지 않은 [ 는 리터럴', () => {
    expect(find('[[:upper:]][[:digit:]]', 'aB7')).toBe('B7');
    expect(find('[^a-z]\\+', 'abcXYZ')).toBe('XYZ');
    expect(find('[\\]x]\\+', 'a]x]b')).toBe(']x]');
    expect(find('a[b', 'a[b')).toBe('a[b');
  });
});

describe('Vim 정규식: 매직 단계 전환', () => {
  it('\\v (very magic): 기호가 \\ 없이 특수', () => {
    expect(find('\\v(foo|bar)+', 'xfoobarx')).toBe('foobar');
    expect(find('\\vcolou?r', 'color')).toBe('color');
    expect(find('\\v<\\w+>', '  hi ')).toBe('hi');
    expect(find('\\va{2}', 'aaa')).toBe('aa');
    expect(find('\\v\\(x\\)', '(x)')).toBe('(x)');
  });

  it('\\V (very nomagic): \\ 만 특수, 패턴 시작 ^ 와 끝 $ 는 특수', () => {
    expect(find('\\Va.c', 'abc a.c')).toBe('a.c');
    expect(find('\\Va*', 'aaa a*')).toBe('a*');
    expect(find('\\Va\\.\\*', 'aaa')).toBe('aaa');
    expect(find('\\V^a.', 'a.b')).toBe('a.');
  });

  it('\\M (nomagic): . * 는 리터럴, \\. \\* 는 특수', () => {
    expect(find('\\Ma.c', 'abc a.c')).toBe('a.c');
    expect(find('\\Ma\\.c', 'abc')).toBe('abc');
  });
});

describe('Vim 정규식: \\zs \\ze, 앞뒤 조건, 캡처 없는 그룹', () => {
  it('\\zs 와 \\ze 로 일치 시작·끝을 지정한다', () => {
    expect(find('foo\\zsbar', 'foobar')).toBe('bar');
    expect(find('foo\\zebar', 'foobar foobaz')).toBe('foo');
    expect(compileVimRegex('foo\\zebar').exec('foobaz foobar')?.index).toBe(7);
    expect(find('id=\\zs\\d\\+\\ze;', 'x id=42; y')).toBe('42');
  });

  it('\\@= \\@! \\@<= \\@<! 와 \\%( \\)', () => {
    expect(find('foo\\(bar\\)\\@=', 'foobaz foobar')).toBe('foo');
    expect(compileVimRegex('foo\\(bar\\)\\@!').exec('foobar foobaz')?.index).toBe(7);
    expect(find('\\(\\$\\)\\@<=\\d\\+', 'a1 $25')).toBe('25');
    expect(find('\\%(ab\\)\\+', 'ababx')).toBe('abab');
    expect(compileVimRegex('\\%(a\\)\\(b\\)').exec('ab')?.[1]).toBe('b');
  });
});

describe('Vim 정규식: 대소문자', () => {
  it('\\c / \\C 는 ignorecase 설정보다 우선한다', () => {
    expect(find('foo\\c', 'FOO')).toBe('FOO');
    expect(find('\\Cfoo', 'FOO', { ignorecase: true })).toBeNull();
  });

  it('smartcase: 대문자가 있으면 구분, \\S \\W 같은 이스케이프는 대문자로 보지 않는다', () => {
    const opts = { ignorecase: true, smartcase: true };
    expect(find('foo', 'FOO', opts)).toBe('FOO');
    expect(find('Foo', 'FOO', opts)).toBeNull();
    expect(find('\\Sfoo', 'xFOO', opts)).toBe('xFOO');
    expect(translateVimPattern('\\W\\S').hasUppercase).toBe(false);
  });

  it('~ 는 직전 치환 문자열과 일치하고, 없으면 리터럴 ~', () => {
    expect(compileVimRegex('x~', { lastSubstitute: 'a.b' }).exec('xa.b xab')?.[0]).toBe('xa.b');
    expect(find('~/', 'path ~/x')).toBe('~/');
  });
});
