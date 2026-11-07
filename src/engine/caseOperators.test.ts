import { describe, it, expect } from 'vitest';
import { VimEditorState } from '../types/vim';
import { handleKey } from './vimEngine';

describe('Vim 순정 대소문자 변환 연산자 (gU, gu, g~, Visual u/U/~)', () => {
  it('gUiw로 현재 단어를 일괄 대문자화하고 guiw로 소문자화한다', () => {
    let state: VimEditorState = {
      lines: ['const adminConfig = true;'],
      cursor: { line: 0, col: 8 }, // 'adminConfig' 위
      mode: 'NORMAL',
    };

    // gUiw 실행
    state = handleKey(state, 'g');
    state = handleKey(state, 'U');
    state = handleKey(state, 'i');
    state = handleKey(state, 'w');

    expect(state.lines[0]).toBe('const ADMINCONFIG = true;');

    // guiw 실행
    state = handleKey(state, 'g');
    state = handleKey(state, 'u');
    state = handleKey(state, 'i');
    state = handleKey(state, 'w');

    expect(state.lines[0]).toBe('const adminconfig = true;');
  });

  it('g~iw로 단어 내 각 글자의 대소문자를 반전시킨다', () => {
    let state: VimEditorState = {
      lines: ['helloWorld'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'g');
    state = handleKey(state, '~');
    state = handleKey(state, 'i');
    state = handleKey(state, 'w');

    expect(state.lines[0]).toBe('HELLOwORLD');
  });

  it('gU$로 현재 커서부터 줄 끝까지 대문자로 변환한다', () => {
    let state: VimEditorState = {
      lines: ['export const apiKey = "secret_123";'],
      cursor: { line: 0, col: 13 }, // 'apiKey...' 시작점
      mode: 'NORMAL',
    };

    state = handleKey(state, 'g');
    state = handleKey(state, 'U');
    state = handleKey(state, '$');

    expect(state.lines[0]).toBe('export const APIKEY = "SECRET_123";');
  });

  it('guu 및 gUU로 현재 줄 전체를 소문자/대문자로 변환한다', () => {
    let state: VimEditorState = {
      lines: ['Mixed Case LINE text'],
      cursor: { line: 0, col: 4 },
      mode: 'NORMAL',
    };

    // gUU: 줄 전체 대문자화
    state = handleKey(state, 'g');
    state = handleKey(state, 'U');
    state = handleKey(state, 'U');
    expect(state.lines[0]).toBe('MIXED CASE LINE TEXT');

    // guu: 줄 전체 소문자화
    state = handleKey(state, 'g');
    state = handleKey(state, 'u');
    state = handleKey(state, 'u');
    expect(state.lines[0]).toBe('mixed case line text');
  });

  it('g~~로 현재 줄 전체 대소문자를 반전시킨다', () => {
    let state: VimEditorState = {
      lines: ['Hello World!'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'g');
    state = handleKey(state, '~');
    state = handleKey(state, '~');

    expect(state.lines[0]).toBe('hELLO wORLD!');
  });

  it('VISUAL 모드에서 u, U, ~를 누르면 선택 영역의 대소문자가 즉시 변환된다', () => {
    let state: VimEditorState = {
      lines: ['foo BAR baz'],
      cursor: { line: 0, col: 4 }, // 'B'
      mode: 'NORMAL',
    };

    // v 2l 로 "BAR" 선택
    state = handleKey(state, 'v');
    state = handleKey(state, 'l');
    state = handleKey(state, 'l');
    expect(state.mode).toBe('VISUAL');

    // 'u' 입력: 소문자화
    state = handleKey(state, 'u');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('foo bar baz');

    // 다시 v 2l 후 'U' 입력: 대문자화
    state = handleKey(state, 'v');
    state = handleKey(state, 'l');
    state = handleKey(state, 'l');
    state = handleKey(state, 'U');
    expect(state.mode).toBe('NORMAL');
    expect(state.lines[0]).toBe('foo BAR baz');
  });
});
