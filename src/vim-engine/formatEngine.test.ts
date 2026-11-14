import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys, runExCommand } from './api';
import { retabLine, formatLineRange } from './formatEngine';

function run(lines: string[], setup: string, keys: string, cursor = { line: 0, col: 0 }) {
  let state = createVimState(lines, cursor);
  state = runExCommand(state, setup);
  return sendKeys(state, keys);
}

// 아래 기대값은 `nvim --headless -u NONE` 으로 같은 키를 실행한 결과입니다.
describe('formatEngine: gq / gw / :set textwidth (Neovim 대조)', () => {
  it('gqq: 긴 줄을 textwidth 에 맞게 나누고 커서는 마지막 줄로 간다', () => {
    const s = run(['aaa bbb ccc ddd eee fff ggg'], 'set tw=10', 'gqq');
    expect(s.lines).toEqual(['aaa bbb', 'ccc ddd', 'eee fff', 'ggg']);
    expect(s.cursor).toEqual({ line: 3, col: 0 });
  });

  it('gqG: 문단 안의 줄을 합치고, 빈 줄은 문단 경계로 유지하며, 내부 공백은 보존한다', () => {
    const s = run(['aaa  bbb ccc   ddd eee fff ggg  ', 'hh   ii', '', '  jj kk', 'll'], 'set tw=12', 'gqG');
    expect(s.lines).toEqual(['aaa  bbb ccc', 'ddd eee fff', 'ggg  hh   ii', '', '  jj kk ll']);
  });

  it('첫 줄 들여쓰기를 모든 줄에 적용하고 이어지는 줄의 들여쓰기는 버린다', () => {
    const s = run(['  aaa bbb ccc ddd eee fff', '    x y'], 'set tw=12', 'gqG');
    expect(s.lines).toEqual(['  aaa bbb', '  ccc ddd', '  eee fff x', '  y']);
  });

  it('주석 리더(//, #, >)를 유지하며 리플로우하고, 리더가 다른 줄은 다른 문단이다', () => {
    expect(run(['// aaa bbb ccc ddd eee fff', '// x y'], 'set tw=12', 'gqG').lines).toEqual([
      '// aaa bbb',
      '// ccc ddd',
      '// eee fff x',
      '// y',
    ]);
    expect(run(['  // aaa bbb ccc ddd eee fff', '  // x y'], 'set tw=14', 'gqG').lines).toEqual([
      '  // aaa bbb',
      '  // ccc ddd',
      '  // eee fff x',
      '  // y',
    ]);
    expect(run(['# aaa bbb ccc ddd eee fff', '#x y'], 'set tw=12', 'gqG').lines).toEqual([
      '# aaa bbb',
      '# ccc ddd',
      '# eee fff',
      '#x y',
    ]);
    expect(run(['//aaa', '//bbb ccc ddd'], 'set tw=10', 'gqG').lines).toEqual(['//aaa bbb', '//ccc ddd']);
    expect(run(['// aaa', 'bbb'], 'set tw=40', 'gqG').lines).toEqual(['// aaa', 'bbb']);
  });

  it('목록 항목(- )은 항목마다 문단이며 이어지는 줄은 항목 글자 뒤로 정렬된다', () => {
    expect(run(['- aaa bbb ccc ddd eee fff', '- x y'], 'set tw=12', 'gqG').lines).toEqual([
      '- aaa bbb',
      '  ccc ddd',
      '  eee fff',
      '- x y',
    ]);
    expect(run(['- aaa bbb', '  ccc ddd eee', '- x y'], 'set tw=40', 'gqG').lines).toEqual([
      '- aaa bbb ccc ddd eee',
      '- x y',
    ]);
  });

  it('textwidth 보다 긴 단어는 나누지 않고, tw=0 이면 79열 기준이다', () => {
    expect(run(['aaaaaaaaaaaaaaa bb', 'c'], 'set tw=5', 'gqG').lines).toEqual(['aaaaaaaaaaaaaaa', 'bb c']);
    expect(run(['aaa bbb', 'ccc'], 'set tw=0', 'gqG').lines).toEqual(['aaa bbb ccc']);
    expect(run(['abcde fghij'], 'set tw=10', 'gqq').lines).toEqual(['abcde', 'fghij']);
  });

  it('텍스트 객체(gqap)는 뒤의 빈 줄까지 범위이고 커서는 그 마지막 줄에 놓인다', () => {
    const s = run(['aaa bbb ccc ddd eee', 'fff ggg', '', 'hhh'], 'set tw=8', 'gqap');
    expect(s.lines).toEqual(['aaa bbb', 'ccc ddd', 'eee fff', 'ggg', '', 'hhh']);
    expect(s.cursor.line).toBe(4);
  });

  it('gw 는 커서를 같은 글자 위에 유지한다', () => {
    const s = run(['aaa bbb ccc ddd eee', 'fff ggg', '', 'hhh'], 'set tw=8', 'gwap');
    expect(s.lines).toEqual(['aaa bbb', 'ccc ddd', 'eee fff', 'ggg', '', 'hhh']);
    expect(s.cursor).toEqual({ line: 0, col: 0 });

    const mid = run(['aaa bbb ccc ddd eee', 'fff ggg', '', 'hhh'], 'set tw=8', 'gww', { line: 0, col: 4 });
    expect(mid.lines).toEqual(['aaa bbb', 'ccc ddd', 'eee', 'fff ggg', '', 'hhh']);
    expect(mid.cursor).toEqual({ line: 0, col: 4 });
  });

  it('카운트(2gqq), gqj, Visual gq 를 지원한다', () => {
    expect(run(['aaa bbb', 'ccc', 'ddd eee', 'fff'], 'set tw=20', '2gqq').lines).toEqual([
      'aaa bbb ccc',
      'ddd eee',
      'fff',
    ]);
    expect(run(['aaa bbb', 'ccc'], 'set tw=40', 'gqj').lines).toEqual(['aaa bbb ccc']);
    expect(run(['aaa bbb', 'ccc'], 'set tw=40', 'Vjgq').lines).toEqual(['aaa bbb ccc']);
  });

  it('gqgq 로도 현재 줄을 포매팅하고, u 로 되돌리며, . 로 반복한다', () => {
    let s = run(['a b c d e f g', 'h i j k l m n'], 'set tw=3', 'gqgq');
    expect(s.lines.slice(0, 4)).toEqual(['a b', 'c d', 'e f', 'g']);
    s = sendKeys(s, 'u');
    expect(s.lines).toEqual(['a b c d e f g', 'h i j k l m n']);

    let d = run(['a b c d', 'e f g h'], 'set tw=3', 'gqq');
    expect(d.lines).toEqual(['a b', 'c d', 'e f g h']);
    d = sendKeys(d, 'jj.');
    expect(d.lines).toEqual(['a b', 'c d', 'e f', 'g h']);
  });

  it('formatLineRange 는 순수 함수이며 입력 배열을 바꾸지 않는다', () => {
    const input = ['aaa bbb ccc'];
    const res = formatLineRange(input, 0, 0, { textwidth: 7, tabstop: 2, expandtab: true });
    expect(input).toEqual(['aaa bbb ccc']);
    expect(res.lines).toEqual(['aaa bbb', 'ccc']);
    expect(res.changed).toBe(true);
  });

  it(':set tw? 와 :set tw=0 / 음수 오류', () => {
    let s = createVimState(['x'], { line: 0, col: 0 });
    s = runExCommand(s, 'set tw=30');
    s = runExCommand(s, 'set tw?');
    expect(s.commandMessage).toContain('textwidth=30');
    s = runExCommand(s, 'set tw=0');
    expect(s.options?.textwidth).toBe(0);
    s = runExCommand(s, 'set tw=abc');
    expect(s.commandMessage).toContain('E521');
  });
});

describe('formatEngine: :retab', () => {
  it('retabLine: 탭이 포함된 공백 구간만 변환하고 !는 2칸 이상 공백도 변환한다', () => {
    expect(retabLine('\tfoo', 8, 8, true, false)).toBe('        foo');
    expect(retabLine('        foo', 8, 8, false, false)).toBe('        foo');
    expect(retabLine('        foo', 8, 8, false, true)).toBe('\tfoo');
    expect(retabLine('a\tb', 4, 4, true, false)).toBe('a   b');
    expect(retabLine('\tfoo', 4, 2, true, false)).toBe('    foo');
    expect(retabLine('\t\tfoo', 4, 2, false, false)).toBe('\t\t\t\tfoo');
  });

  it(':retab 은 expandtab 에 따라 탭을 공백으로, :retab! 은 공백을 탭으로 바꾼다', () => {
    let s = createVimState(['\tone', '\t\ttwo'], { line: 0, col: 0 });
    s = runExCommand(s, 'set ts=4 et');
    s = runExCommand(s, 'retab');
    expect(s.lines).toEqual(['    one', '        two']);

    s = runExCommand(s, 'set noet');
    s = runExCommand(s, 'retab!');
    expect(s.lines).toEqual(['\tone', '\t\ttwo']);
    s = sendKeys(s, 'u');
    expect(s.lines).toEqual(['    one', '        two']);
  });

  it(':retab N 은 새 tabstop 으로 다시 배치하고 tabstop 을 갱신하며, 범위를 지원한다', () => {
    let s = createVimState(['\tone', '\ttwo'], { line: 0, col: 0 });
    s = runExCommand(s, 'set ts=8 noet');
    s = runExCommand(s, '1retab 4');
    expect(s.lines).toEqual(['\t\tone', '\ttwo']);
    expect(s.options?.tabstop).toBe(4);
  });

  it(':retab 잘못된 인수는 E474', () => {
    const s = runExCommand(createVimState(['x'], { line: 0, col: 0 }), 'retab foo');
    expect(s.bell).toBe(true);
    expect(s.commandMessage).toContain('E474');
  });
});
