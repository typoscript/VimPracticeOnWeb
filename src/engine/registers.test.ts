import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('Named Registers & Black Hole Register ("a~"z, "0, "_)', () => {
  it('"ayiw: 단어를 명명된 레지스터 a에 복사하고 "0과 기본 레지스터에도 저장한다', () => {
    let state: VimEditorState = {
      lines: ['const secretToken = "abc";'],
      cursor: { line: 0, col: 7 }, // 's' of secretToken
      mode: 'NORMAL',
    };

    // " a y i w
    state = handleKey(state, '"');
    expect(state.pendingKeys).toBe('"');
    state = handleKey(state, 'a');
    expect(state.activeRegister).toBe('a');
    expect(state.pendingKeys).toBeUndefined();

    state = handleKey(state, 'y');
    state = handleKey(state, 'i');
    state = handleKey(state, 'w');

    expect(state.registers?.a).toEqual({
      type: 'char',
      content: 'secretToken',
    });
    expect(state.registers?.['0']).toEqual({
      type: 'char',
      content: 'secretToken',
    });
    expect(state.registers?.['"']).toEqual({
      type: 'char',
      content: 'secretToken',
    });
    expect(state.clipboard?.content).toBe('secretToken');
  });

  it('"bdd: 현재 줄을 잘라내어 레지스터 b에 저장하며, "0(복사 레지스터)은 덮어쓰지 않는다', () => {
    let state: VimEditorState = {
      lines: ['keepThisLine', 'deleteThisLine', 'thirdLine'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    // 먼저 첫째 줄을 yy로 복사
    state = handleKey(state, 'y');
    state = handleKey(state, 'y');
    expect(state.registers?.['0']?.content).toBe('keepThisLine');

    // 둘째 줄로 이동 후 "bdd 실행
    state = handleKey(state, 'j');
    state = handleKey(state, '"');
    state = handleKey(state, 'b');
    state = handleKey(state, 'd');
    state = handleKey(state, 'd');

    // 레지스터 b에는 삭제된 둘째 줄이 저장됨
    expect(state.registers?.b).toEqual({
      type: 'line',
      content: 'deleteThisLine',
    });
    // 기본 클립보드("")도 삭제된 내용으로 갱신됨
    expect(state.registers?.['"']?.content).toBe('deleteThisLine');
    // 하지만 "0(복사 전용 레지스터)은 삭제 연산에 의해 덮어쓰이지 않고 유지됨!
    expect(state.registers?.['0']?.content).toBe('keepThisLine');
  });

  it('"ap 및 "bp: 서로 다른 레지스터의 내용을 목적에 맞게 골라서 붙여넣을 수 있다', () => {
    let state: VimEditorState = {
      lines: [''],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      registers: {
        a: { type: 'char', content: 'Alpha' },
        b: { type: 'char', content: 'Beta' },
        '0': { type: 'line', content: 'ZeroYankedLine' },
      },
    };

    // "ap
    state = handleKey(state, '"');
    state = handleKey(state, 'a');
    state = handleKey(state, 'p');
    expect(state.lines[0]).toBe('Alpha');

    // "bp
    state = handleKey(state, '"');
    state = handleKey(state, 'b');
    state = handleKey(state, 'p');
    expect(state.lines[0]).toBe('AlphaBeta');

    // "0p (줄 단위 복사본 붙여넣기)
    state = handleKey(state, '"');
    state = handleKey(state, '0');
    state = handleKey(state, 'p');
    expect(state.lines.length).toBe(2);
    expect(state.lines[1]).toBe('ZeroYankedLine');
  });

  it('"_dd 및 "_diw (블랙홀 레지스터): 기존 클립보드와 레지스터를 전혀 오염시키지 않고 삭제한다', () => {
    const originalClipboard = { type: 'text' as const, content: 'preciousValue' };
    let state: VimEditorState = {
      lines: ['garbageLine', 'val = trashToken;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      clipboard: originalClipboard,
      registers: {
        '"': { type: 'char', content: 'preciousValue' },
        '0': { type: 'char', content: 'preciousValue' },
      },
    };

    // "_dd 실행
    state = handleKey(state, '"');
    state = handleKey(state, '_');
    expect(state.activeRegister).toBe('_');
    state = handleKey(state, 'd');
    state = handleKey(state, 'd');

    // 첫 줄은 삭제되었으나 클립보드와 레지스터는 원형 그대로 보존됨!
    expect(state.lines[0]).toBe('val = trashToken;');
    expect(state.clipboard?.content).toBe('preciousValue');
    expect(state.registers?.['"']?.content).toBe('preciousValue');
    expect(state.registers?.['0']?.content).toBe('preciousValue');
    expect(state.registers?.['_']).toBeUndefined();

    // "_diw 실행
    state = handleKey(state, 'f');
    state = handleKey(state, 't'); // 't' of trashToken
    state = handleKey(state, '"');
    state = handleKey(state, '_');
    state = handleKey(state, 'd');
    state = handleKey(state, 'i');
    state = handleKey(state, 'w');

    expect(state.lines[0]).toBe('val = ;');
    expect(state.clipboard?.content).toBe('preciousValue');
  });

  it('VISUAL 모드에서 "ay와 "ad가 대상 레지스터를 정확히 갱신한다', () => {
    let state: VimEditorState = {
      lines: ['const greeting = "Hello World";'],
      cursor: { line: 0, col: 18 }, // 'H' of Hello
      mode: 'NORMAL',
    };

    // v 4 l -> "Hello" 선택
    state = handleKey(state, 'v');
    for (let i = 0; i < 4; i++) state = handleKey(state, 'l');
    expect(state.mode).toBe('VISUAL');

    // " a y
    state = handleKey(state, '"');
    state = handleKey(state, 'a');
    state = handleKey(state, 'y');

    expect(state.mode).toBe('NORMAL');
    expect(state.registers?.a?.content).toBe('Hello');

    // v 4 l -> "World" 선택 후 " b d
    state = handleKey(state, 'w');
    state = handleKey(state, 'v');
    for (let i = 0; i < 4; i++) state = handleKey(state, 'l');
    state = handleKey(state, '"');
    state = handleKey(state, 'b');
    state = handleKey(state, 'd');

    expect(state.registers?.b?.content).toBe('World');
    expect(state.lines[0]).toBe('const greeting = "Hello ";');
  });
});
