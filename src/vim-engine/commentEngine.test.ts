import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys, runExCommand } from './api';
import { resolveCommentString, parseCommentString } from './commentEngine';
import { getOptions } from './setEngine';

describe('commentEngine (gc / gcc & commentstring)', () => {
  it('gcc 로 현재 줄을 주석 처리하고 다시 gcc 로 주석을 해제한다', () => {
    let state = createVimState(
      ['const a = 1;', '  const b = 2;'],
      { line: 0, col: 3 },
      { primaryFilename: 'app.ts' }
    );

    state = sendKeys(state, 'gcc');
    expect(state.lines).toEqual(['// const a = 1;', '  const b = 2;']);
    expect(state.cursor).toEqual({ line: 0, col: 0 });

    state = sendKeys(state, 'gcc');
    expect(state.lines).toEqual(['const a = 1;', '  const b = 2;']);

    // 들여쓰기가 있는 줄에서도 들여쓰기를 유지하며 주석 토글
    state = sendKeys(state, 'jgcc');
    expect(state.lines).toEqual(['const a = 1;', '  // const b = 2;']);
    state = sendKeys(state, 'gcc');
    expect(state.lines).toEqual(['const a = 1;', '  const b = 2;']);
  });

  it('[count]gcc (2gcc) 와 빈 줄 단독 gcc 동작을 Neovim 과 동일하게 처리한다', () => {
    let state = createVimState(
      ['const x = 1;', 'const y = 2;', 'const z = 3;'],
      { line: 0, col: 0 },
      { primaryFilename: 'main.ts' }
    );

    state = sendKeys(state, '2gcc');
    expect(state.lines).toEqual(['// const x = 1;', '// const y = 2;', 'const z = 3;']);

    // 단일 빈 줄에 gcc 는 변경하지 않음
    let blankState = createVimState([''], { line: 0, col: 0 }, { primaryFilename: 'main.ts' });
    blankState = sendKeys(blankState, 'gcc');
    expect(blankState.lines).toEqual(['']);
  });

  it('gc{motion} (gc2j, gcip, gc}) 및 들여쓰기 혼합·빈 줄·부분 주석 규칙을 정확히 따른다', () => {
    // 들여쓰기가 다른 줄과 빈 줄이 섞인 범위 (gc2j -> 0..2)
    let state = createVimState(
      ['  a', '    b', '', '  c'],
      { line: 0, col: 0 },
      { primaryFilename: 'index.js' }
    );
    state = sendKeys(state, 'gc2j');
    expect(state.lines).toEqual(['  // a', '  //   b', '  //', '  c']);

    // 모두 주석이면 일괄 해제 (빈 줄의 '  //' 도 빈 줄로 복원)
    state = sendKeys(state, 'gc2j');
    expect(state.lines).toEqual(['  a', '    b', '', '  c']);

    // 일부만 주석이면 전체를 한 번 더 주석 처리
    let partial = createVimState(
      ['  // a', '  b'],
      { line: 0, col: 0 },
      { primaryFilename: 'index.js' }
    );
    partial = sendKeys(partial, 'gcj');
    expect(partial.lines).toEqual(['  // // a', '  // b']);

    // gcip 문단 주석 토글
    let para = createVimState(
      ['const p = 1;', 'const q = 2;', '', 'const r = 3;'],
      { line: 0, col: 0 },
      { primaryFilename: 'index.ts' }
    );
    para = sendKeys(para, 'gcip');
    expect(para.lines).toEqual(['// const p = 1;', '// const q = 2;', '', 'const r = 3;']);

    // gc} 는 exclusive 모션이므로 다음 빈 줄을 포함하지 않음
    para = sendKeys(para, 'gc}');
    expect(para.lines).toEqual(['const p = 1;', 'const q = 2;', '', 'const r = 3;']);
  });

  it('파일타입별 commentstring 자동 감지 및 :set cms / :set ft 연동을 지원한다', () => {
    // Python (.py -> # %s)
    let py = createVimState(['def run():', '    return 1'], { line: 0, col: 0 }, { primaryFilename: 'app.py' });
    expect(resolveCommentString(py)).toBe('# %s');
    py = sendKeys(py, 'gcj');
    expect(py.lines).toEqual(['# def run():', '#     return 1']);

    // HTML / Markdown (<!-- %s -->)
    let html = createVimState(['<div>hello</div>'], { line: 0, col: 0 }, { primaryFilename: 'index.html' });
    expect(resolveCommentString(html)).toBe('<!-- %s -->');
    html = sendKeys(html, 'gcc');
    expect(html.lines).toEqual(['<!-- <div>hello</div> -->']);
    html = sendKeys(html, 'gcc');
    expect(html.lines).toEqual(['<div>hello</div>']);

    // CSS (/* %s */) 및 빈 줄 포함 블록 주석
    let css = createVimState(['  color: red;', '', '  margin: 0;'], { line: 0, col: 0 }, { primaryFilename: 'style.css' });
    css = sendKeys(css, 'gc2j');
    expect(css.lines).toEqual(['  /* color: red; */', '  /**/', '  /* margin: 0; */']);
    css = sendKeys(css, 'gc2j');
    expect(css.lines).toEqual(['  color: red;', '', '  margin: 0;']);

    // :set ft=lua 로 파일타입 변경 시 commentstring 자동 갱신
    let lua = createVimState(['local x = 10'], { line: 0, col: 0 });
    lua = runExCommand(lua, 'set ft=lua');
    expect(getOptions(lua).commentstring).toBe('-- %s');
    lua = sendKeys(lua, 'gcc');
    expect(lua.lines).toEqual(['-- local x = 10']);

    // :set cms=//\ %s (이스케이프 공백) 및 :set cms? 조회
    let custom = createVimState(['hello world'], { line: 0, col: 0 });
    custom = runExCommand(custom, 'set cms=;;\\ %s');
    expect(getOptions(custom).commentstring).toBe(';; %s');
    custom = sendKeys(custom, 'gcc');
    expect(custom.lines).toEqual([';; hello world']);
    const query = runExCommand(custom, 'set cms?');
    expect(query.commandMessage).toBe('commentstring=;; %s');

    // %s 가 없는 잘못된 commentstring 은 E537 에러
    const invalid = runExCommand(custom, 'set cms=foo');
    expect(invalid.bell).toBe(true);
    expect(invalid.commandMessage).toContain('E537');
  });

  it('Visual 모드 gc, .(Dot Repeat), u(Undo), dgc/ygc 텍스트 객체를 지원한다', () => {
    let state = createVimState(
      ['line 1', 'line 2', 'line 3', 'line 4'],
      { line: 0, col: 0 },
      { primaryFilename: 'test.ts' }
    );

    // Visual Line (Vjgc)
    state = sendKeys(state, 'Vjgc');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines).toEqual(['// line 1', '// line 2', 'line 3', 'line 4']);

    // Undo (u)
    state = sendKeys(state, 'u');
    expect(state.lines).toEqual(['line 1', 'line 2', 'line 3', 'line 4']);

    // gcc 후 . (Dot Repeat) 으로 다음 줄에도 동일 적용
    state = sendKeys(state, 'gccj.');
    expect(state.lines).toEqual(['// line 1', '// line 2', 'line 3', 'line 4']);

    // dgc: 연속된 주석 줄 전체 삭제
    state = sendKeys(state, 'ggdgc');
    expect(state.lines).toEqual(['line 3', 'line 4']);

    // 주석이 없는 줄에서 dgc 는 bell 울림
    const bellState = sendKeys(state, 'dgc');
    expect(bellState.bell).toBe(true);
  });

  it('공백 없는 commentstring (//%s) 및 공백 없는 기존 주석(//foo) 해제도 처리한다', () => {
    expect(parseCommentString('')).toBeNull();
    expect(parseCommentString('invalid')).toBeNull();

    let state = createVimState(['  //foo', '  // bar'], { line: 0, col: 0 }, { primaryFilename: 'a.ts' });
    state = sendKeys(state, 'gcj');
    expect(state.lines).toEqual(['  foo', '  bar']);
  });
});
