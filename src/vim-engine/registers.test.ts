import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';
import { formatRegisters } from './registers';

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

  describe('formatRegisters & :reg, :registers Ex command viewer', () => {
    it('formatRegisters: 순정 Vim 스타일로 레지스터 내용 및 ^J 개행 치환을 포맷팅한다', () => {
      const state: VimEditorState = {
        lines: ['first line'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'app.ts',
        lastSearchQuery: 'findMe',
        commandHistory: ['w', 'reg'],
        registers: {
          '"': { type: 'char', content: 'unnamed content' },
          '0': { type: 'line', content: 'line 1\nline 2' },
          a: { type: 'char', content: 'alpha token' },
          m: { type: 'macro', content: ['c', 'i', 'w', 'hello', 'Escape'] },
        },
      };

      const out = formatRegisters(state);
      expect(out).toContain('--- Registers ---');
      expect(out).toContain('""   c   unnamed content');
      expect(out).toContain('"0   l   line 1^Jline 2');
      expect(out).toContain('"a   c   alpha token');
      expect(out).toContain('"m   m   ciwhello<Esc>');
      expect(out).toContain('"%   c   app.ts');
      expect(out).toContain('"/   c   findMe');
      expect(out).toContain('":   c   reg');
    });

    it('formatRegisters: 필터 인자가 주어지면 지정된 레지스터만 표시한다', () => {
      const state: VimEditorState = {
        lines: ['test'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        registers: {
          '"': { type: 'char', content: 'unnamed content' },
          '0': { type: 'line', content: 'yanked' },
          a: { type: 'char', content: 'apple' },
          b: { type: 'char', content: 'banana' },
        },
      };

      const outA = formatRegisters(state, 'a');
      expect(outA).toContain('"a   c   apple');
      expect(outA).not.toContain('"b   c   banana');
      expect(outA).not.toContain('"0');

      const outAB = formatRegisters(state, 'a b');
      expect(outAB).toContain('"a   c   apple');
      expect(outAB).toContain('"b   c   banana');
      expect(outAB).not.toContain('"0');

      const outZero = formatRegisters(state, '0');
      expect(outZero).toContain('"0   l   yanked');
      expect(outZero).not.toContain('"a');
    });

    it(':reg 또는 :registers 실행 시 레지스터 뷰어 패널이 열리고 commandMessage에 목록이 출력된다', () => {
      let state: VimEditorState = {
        lines: ['hello world'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        registers: {
          a: { type: 'char', content: 'hello' },
        },
      };

      // :reg Enter
      state = handleKey(state, ':');
      state = handleKey(state, 'r');
      state = handleKey(state, 'e');
      state = handleKey(state, 'g');
      state = handleKey(state, 'Enter');

      expect(state.showRegisterInspector).toBe(true);
      expect(state.commandMessage).toContain('--- Registers ---');
      expect(state.commandMessage).toContain('"a   c   hello');
    });

    it(':display 및 :di 명령어도 동일하게 레지스터 뷰어를 실행한다', () => {
      let state: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        registers: {
          x: { type: 'char', content: 'target' },
        },
      };

      // :di Enter
      state = handleKey(state, ':');
      state = handleKey(state, 'd');
      state = handleKey(state, 'i');
      state = handleKey(state, 'Enter');

      expect(state.showRegisterInspector).toBe(true);
      expect(state.commandMessage).toContain('"x   c   target');
    });

    it(':reg close 또는 :regclose 실행 시 레지스터 뷰어가 닫힌다', () => {
      let state: VimEditorState = {
        lines: ['hello'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        showRegisterInspector: true,
      };

      // :reg close Enter
      state = handleKey(state, ':');
      for (const ch of 'reg close') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.showRegisterInspector).toBe(false);
      expect(state.commandMessage).toBe('레지스터 뷰어 닫힘');
    });
  });

  describe('Macro register put & yank workflow ("ap & "ay)', () => {
    it('녹화된 매크로를 "ap 로 붙여넣으면 특수키가 <Esc>, <CR> 등의 Vim 표기로 붙여넣어진다', () => {
      let state: VimEditorState = {
        lines: ['', 'line 1', 'line 2'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        registers: {
          a: {
            type: 'macro',
            content: ['A', ';', 'Escape', 'j'],
          },
        },
      };

      // " a p 로 빈 줄에 레지스터 a의 매크로 내용을 붙여넣음
      state = handleKey(state, '"');
      state = handleKey(state, 'a');
      state = handleKey(state, 'p');

      expect(state.lines[0]).toBe('A;<Esc>j');
    });

    it('버퍼에서 수정한 매크로 문자열을 "ay$ 로 레지스터에 복사한 후 @a 로 실행할 수 있다', () => {
      let state: VimEditorState = {
        lines: [
          '0i// <Esc>j',
          'item 1',
          'item 2',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 줄 0 전체를 레지스터 a에 복사 ("ay$)
      state = handleKey(state, '"');
      state = handleKey(state, 'a');
      state = handleKey(state, 'y');
      state = handleKey(state, '$');

      expect(state.registers?.a?.content).toBe('0i// <Esc>j');

      // 줄 1(item 1)로 이동하여 @a 실행
      state = handleKey(state, 'j');
      state = handleKey(state, '@');
      state = handleKey(state, 'a');

      expect(state.lines[1]).toBe('// item 1');
      // j 모션 덕분에 커서가 줄 2(item 2)로 이동함
      expect(state.cursor.line).toBe(2);

      // @@ 로 다음 줄(item 2)도 동일 매크로 실행
      state = handleKey(state, '@');
      state = handleKey(state, '@');

      expect(state.lines[2]).toBe('// item 2');
    });
  });
});
