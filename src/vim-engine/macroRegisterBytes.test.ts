import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';
import {
  controlCharDisplay,
  formatRegisters,
  macroKeysToRegisterText,
  registerTextToKeys,
  toPrintableRegisterText,
} from './registers';
import { buildMacroTrace } from './macroDebugger';

/**
 * 녹화한 매크로 레지스터는 Vim 처럼 실제 키 바이트(ESC = \x1b, Enter = \r, <BS> = \x80kb)를 담습니다.
 * 기대값은 `nvim --headless -u NONE -i NONE` 으로 확인했습니다.
 */
function run(state: VimEditorState, keys: string[]): VimEditorState {
  let s = state;
  for (const k of keys) s = handleKey(s, k);
  return s;
}
const typed = (text: string): string[] => [...text];

function base(lines: string[], line = 0, col = 0): VimEditorState {
  return { lines, cursor: { line, col }, mode: 'NORMAL' };
}

describe('매크로 레지스터의 실제 키 바이트 (Vim 과 같음)', () => {
  it('qaA!<Esc>jq 뒤 "ap 는 ESC 글자를 붙여 넣는다 (Vim: barA!^[j, 커서는 붙인 끝)', () => {
    let s = run(base(['foo', 'bar', 'baz']), ['q', 'a', 'A', '!', 'Escape', 'j', 'q']);
    s = run(s, ['"', 'a', 'p']);
    expect(s.lines).toEqual(['foo!', 'barA!\x1bj', 'baz']);
    expect(s.cursor).toEqual({ line: 1, col: 6 });
  });

  it(':reg a 는 ESC 를 ^[ 로, Ctrl-w 를 ^W, Enter 를 ^M, <BS> 를 <80>kb 로 보여 준다', () => {
    let s = run(base(['foo']), ['q', 'a', 'A', '!', 'Escape', 'j', 'q']);
    s = run(s, ['q', 'b', 'i', 'x', 'y', 'Backspace', 'Ctrl-w', 'z', 'Enter', 'Escape', 'q']);
    const out = formatRegisters(s, 'a b');
    expect(out).toContain('A!^[j');
    expect(out).toContain('ixy<80>kb^Wz^M^[');
  });

  it('"Ayiw 는 녹화한 매크로 텍스트 뒤에 단어를 붙인다 (Vim: A!\\x1b + 단어)', () => {
    let s = run(base(['word one']), ['q', 'a', 'A', '!', 'Escape', 'q']);
    s = run(s, ['0', '"', 'A', 'y', 'i', 'w']);
    expect(s.registers?.a).toEqual({ type: 'char', content: 'A!\x1bword' });
    expect(s.registers?.['"']).toEqual({ type: 'char', content: 'A!\x1bword' });
  });

  it('손으로 친 <Esc> 다섯 글자는 @a 에서 글자 그대로 입력된다 (Vim: x1;<Esc>j, 입력 모드에 남음)', () => {
    let s = run(base(['A;<Esc>j', 'x1', 'x2']), ['0', '"', 'a', 'y', '$', 'j', '@', 'a']);
    expect(s.lines).toEqual(['A;<Esc>j', 'x1;<Esc>j', 'x2']);
    expect(s.mode).toBe('INSERT');
  });

  it(':let @a = "A;\\<Esc>j" 는 실제 ESC 를 넣고 @a 가 Esc 로 실행한다', () => {
    let s = run(base(['x1', 'x2']), [':', ...typed('let @a = "A;\\<Esc>j"'), 'Enter']);
    expect(s.registers?.a?.content).toBe('A;\x1bj');
    s = run(s, ['@', 'a']);
    expect(s.lines).toEqual(['x1;', 'x2']);
    expect(s.mode).toBe('NORMAL');
    expect(s.cursor.line).toBe(1);
  });

  it('getreg("a") 는 녹화한 매크로를 실제 바이트로 돌려준다', () => {
    let s = run(base(['x']), ['q', 'a', 'A', '!', 'Escape', 'q']);
    s = run(s, [':', ...typed('let g:r = getreg("a") == "A!\\<Esc>"'), 'Enter']);
    s = run(s, [':', ...typed('echo g:r'), 'Enter']);
    expect(s.commandMessage).toBe('1');
  });

  it('입력 모드 Ctrl-v Esc 는 ESC 글자를 넣는다 (Vim i_CTRL-V)', () => {
    const s = run(base(['']), ['i', 'A', 'Ctrl-v', 'Escape', 'j', 'Escape']);
    expect(s.lines).toEqual(['A\x1bj']);
    expect(s.mode).toBe('NORMAL');
  });

  it('붙여 넣은 매크로를 "ay$ 로 다시 담아 디버거로 추적하면 ESC 가 Esc 키 프레임이 된다', () => {
    let s = run(base(['A;\x1bj', 'x1']), ['0', '"', 'a', 'y', '$', 'j']);
    const trace = buildMacroTrace(s, 'a');
    expect(trace.frames.slice(1).map((f) => f.key)).toEqual(['A', ';', 'Escape', 'j']);
    s = run(s, ['@', 'a']);
    expect(s.lines[1]).toBe('x1;');
  });

  it('키 ↔ 레지스터 텍스트 변환은 서로 되돌릴 수 있다', () => {
    const keys = ['A', 'Escape', 'Enter', 'Tab', 'Backspace', 'Ctrl-w', 'ArrowLeft', 'Ctrl-Space', 'x'];
    const text = macroKeysToRegisterText(keys);
    expect(text).toBe('A\x1b\r\t\x80kb\x17\x80kl\x80<Ctrl-Space>x');
    expect(registerTextToKeys(text)).toEqual(keys);
    expect(toPrintableRegisterText(text)).toBe('A^[^M\t<80>kb^W<80>kl<80><Ctrl-Space>x');
    expect(controlCharDisplay('\x7f')).toBe('^?');
  });
});
