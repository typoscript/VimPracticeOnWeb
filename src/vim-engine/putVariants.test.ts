import { describe, it, expect } from 'vitest';
import { createVimState, runExCommand, sendKeys } from './api';

describe('정밀 붙여넣기 (]p, [p, ]P, [P, gp, gP)', () => {
  it(']p / [p / ]P: 줄 단위 붙여넣기 시 현재 줄 들여쓰기에 맞춰 상대 인덴트를 유지한다', () => {
    let base = createVimState(['a', '  b', 'c'], { line: 0, col: 0 }, {
      registers: { a: { type: 'line', content: '    foo\n      bar' } },
    });

    const afterBelow = sendKeys(base, 'j"a]p');
    expect(afterBelow.lines).toEqual(['a', '  b', '  foo', '    bar', 'c']);
    expect(afterBelow.cursor).toEqual({ line: 2, col: 2 });

    const afterAbove = sendKeys(base, 'j"a[p');
    expect(afterAbove.lines).toEqual(['a', '  foo', '    bar', '  b', 'c']);
    expect(afterAbove.cursor).toEqual({ line: 1, col: 2 });

    const afterBracketCapP = sendKeys(base, 'j"a]P');
    expect(afterBracketCapP.lines).toEqual(['a', '  foo', '    bar', '  b', 'c']);
    expect(afterBracketCapP.cursor).toEqual({ line: 1, col: 2 });
  });

  it(']p 는 [count] 반복, expandtab=false(탭) 및 . 반복을 지원한다', () => {
    let s = createVimState(['        a', 'c'], { line: 0, col: 0 }, {
      registers: { a: { type: 'line', content: '    foo\n      bar' } },
    });
    s = sendKeys(s, '"a2]p');
    expect(s.lines).toEqual([
      '        a',
      '        foo',
      '          bar',
      '        foo',
      '          bar',
      'c',
    ]);
    expect(s.cursor).toEqual({ line: 1, col: 8 });

    // noet ts=4 에서 탭으로 들여쓰기 맞추기
    let tabState = createVimState(['\t\tx', '    y'], { line: 0, col: 0 });
    tabState = runExCommand(tabState, 'set noet ts=4');
    tabState = sendKeys(tabState, 'jyyk]p');
    expect(tabState.lines).toEqual(['\t\tx', '\t\ty', '    y']);

    // . 반복
    let dotState = createVimState(['a', '  b', '    c'], { line: 0, col: 0 }, {
      registers: { '"': { type: 'line', content: '      item' } },
    });
    dotState = sendKeys(dotState, 'j]pj.');
    expect(dotState.lines).toEqual(['a', '  b', '  item', '    c', '    item']);
  });

  it('문자 단위 ]p / [p 는 각각 p / P 처럼 동작한다', () => {
    const s = createVimState(['abc'], { line: 0, col: 0 }, {
      registers: { a: { type: 'char', content: 'XY' } },
    });
    expect(sendKeys(s, '"a]p').lines).toEqual(['aXYbc']);
    expect(sendKeys(s, '"a[p').lines).toEqual(['XYabc']);
  });

  it('gp / gP (문자 단위): 커서를 삽입된 텍스트 바로 뒤 문자에 놓고 . 반복과 count 를 지원한다', () => {
    const base = createVimState(['abc'], { line: 0, col: 0 }, {
      registers: { a: { type: 'char', content: 'XY' } },
    });

    const afterGp = sendKeys(base, '"agp');
    expect(afterGp.lines).toEqual(['aXYbc']);
    expect(afterGp.cursor).toEqual({ line: 0, col: 3 }); // 'b' 위

    const afterCapGp = sendKeys(base, '"agP');
    expect(afterCapGp.lines).toEqual(['XYabc']);
    expect(afterCapGp.cursor).toEqual({ line: 0, col: 2 }); // 'a' 위

    const counted = sendKeys(base, 'l"a2gp');
    expect(counted.lines).toEqual(['abXYXYc']);
    expect(counted.cursor).toEqual({ line: 0, col: 6 }); // 'c' 위

    // 멀티라인 문자 단위 gp
    const multi = createVimState(['abcd', 'xy'], { line: 0, col: 1 }, {
      registers: { a: { type: 'char', content: '12\n34' } },
    });
    const mAfter = sendKeys(multi, '"agp');
    expect(mAfter.lines).toEqual(['ab12', '34cd', 'xy']);
    expect(mAfter.cursor).toEqual({ line: 1, col: 2 }); // 'c' 위
  });

  it('gp / gP (줄 단위): 커서를 붙여넣은 블록 바로 다음 줄 col 0 에 둔다', () => {
    const base = createVimState(['a', 'b', 'c'], { line: 0, col: 0 }, {
      registers: { a: { type: 'line', content: '    foo\n      bar' } },
    });

    const afterGp = sendKeys(base, '"agp');
    expect(afterGp.lines).toEqual(['a', '    foo', '      bar', 'b', 'c']);
    expect(afterGp.cursor).toEqual({ line: 3, col: 0 });

    const afterCapGp = sendKeys(base, 'j"agP');
    expect(afterCapGp.lines).toEqual(['a', '    foo', '      bar', 'b', 'c']);
    expect(afterCapGp.cursor).toEqual({ line: 3, col: 0 });

    // 마지막 줄 아래에 gp 시 마지막 줄(col 0)에 머무름
    const atEof = sendKeys(base, 'G"a2gp');
    expect(atEof.lines).toEqual(['a', 'b', 'c', '    foo', '      bar', '    foo', '      bar']);
    expect(atEof.cursor).toEqual({ line: 6, col: 0 });
  });

  it('빈 레지스터에서 ]p / gp 실행 시 bell 과 E353 에러를 반환한다', () => {
    const s = createVimState(['hello'], { line: 0, col: 0 });
    const r1 = sendKeys(s, ']p');
    expect(r1.bell).toBe(true);
    expect(r1.commandMessage).toContain('E353');

    const r2 = sendKeys(s, 'gp');
    expect(r2.bell).toBe(true);
    expect(r2.commandMessage).toContain('E353');
  });
});
