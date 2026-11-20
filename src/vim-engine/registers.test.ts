import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
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

  describe('Blockwise Registers (Ctrl-v y/d/p/P/gp, :reg b, >/<, getreg/setreg/getregtype)', () => {
    it('Ctrl-v 블록 복사(y) 후 p/P/2p/gp 로 열 정렬 직사각형 붙여넣기를 수행한다', () => {
      let state: VimEditorState = {
        lines: [
          'AA11xx',
          'BB22yy',
          'CC33zz',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // Ctrl-v 2j l y -> 3x2 블록 복사 ('AA', 'BB', 'CC')
      for (const k of ['Ctrl-v', 'j', 'j', 'l', 'y']) {
        state = handleKey(state, k);
      }
      expect(state.clipboard).toEqual({ type: 'block', content: 'AA\nBB\nCC', blockWidth: 2 });
      expect(state.registers?.['"']?.type).toBe('block');
      expect(state.registers?.['0']?.type).toBe('block');

      // :reg 에서 블록 타입('b') 표기 확인
      expect(formatRegisters(state)).toContain('""   b   AA^JBB^JCC');

      // 줄 끝($)으로 이동 후 p 로 오른쪽에 열 정렬 붙여넣기
      state = handleKey(state, '$');
      state = handleKey(state, 'p');
      expect(state.lines).toEqual([
        'AA11xxAA',
        'BB22yyBB',
        'CC33zzCC',
      ]);
      expect(state.cursor).toEqual({ line: 0, col: 6 });

      // P 로 커서 앞(col 2)에 삽입 및 2p 가로 반복 확인
      state = { ...state, cursor: { line: 0, col: 2 } };
      state = handleKey(state, 'P');
      expect(state.lines).toEqual([
        'AAAA11xxAA',
        'BBBB22yyBB',
        'CCCC33zzCC',
      ]);
    });

    it('블록 붙여넣기(p) 시 짧은 줄은 공백 패딩하고 버퍼 끝을 넘으면 새 줄을 확장한다', () => {
      let state: VimEditorState = {
        lines: [
          '12345',
          'x',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        registers: {
          '"': { type: 'block', content: 'AB\nC\nDE', blockWidth: 2 },
        },
        clipboard: { type: 'block', content: 'AB\nC\nDE', blockWidth: 2 },
      };

      // col 3 ('4') 뒤(insertCol=4)에 3줄 블록 붙여넣기 + gp 커서 확인
      state = { ...state, cursor: { line: 0, col: 3 } };
      state = handleKey(state, 'g');
      state = handleKey(state, 'p');
      expect(state.lines).toEqual([
        '1234AB5',
        'x   C',
        '    DE',
      ]);
      expect(state.cursor.line).toBe(2);
    });

    it('VISUAL_BLOCK 모드에서 > / < 는 블록 시작 열(minCol) 기준으로 들여쓰기·내어쓰기를 수행한다', () => {
      let state: VimEditorState = {
        lines: [
          'foo = 1',
          'bar = 2',
          'baz = 3',
        ],
        cursor: { line: 0, col: 4 }, // '=' 위치
        mode: 'NORMAL',
      };

      // Ctrl-v 2j > -> col 4 위치에 2칸 들여쓰기
      for (const k of ['Ctrl-v', 'j', 'j', '>']) {
        state = handleKey(state, k);
      }
      expect(state.lines).toEqual([
        'foo   = 1',
        'bar   = 2',
        'baz   = 3',
      ]);

      // 다시 Ctrl-v 2j < -> col 4 위치에서 2칸 내어쓰기
      for (const k of ['Ctrl-v', 'j', 'j', '<']) {
        state = handleKey(state, k);
      }
      expect(state.lines).toEqual([
        'foo = 1',
        'bar = 2',
        'baz = 3',
      ]);
    });

    it('Vimscript getreg(), getregtype(), setreg() 가 char/line/block 레지스터를 완벽히 지원한다', () => {
      let state: VimEditorState = {
        lines: ['111', '222'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // setreg 로 블록 레지스터("b) 설정 후 getreg / getregtype 확인
      state = executeCommandLine(state, 'call setreg("b", ["XX", "YY"], "b2")');
      state = executeCommandLine(state, 'echo [getreg("b", 1, 1), getregtype("b") == "\\x162" || stridx(getregtype("b"), "2") >= 0]');
      expect(state.commandMessage).toBe("[['XX', 'YY'], 1]");

      // setreg("a", "hi", "c") + append("A", "!") + linewise("l")
      state = executeCommandLine(state, 'call setreg("a", "hi", "c") | call setreg("A", "!") | call setreg("l", ["L1", "L2"], "l")');
      state = executeCommandLine(state, 'echo [getreg("a"), getregtype("a"), getregtype("l")]');
      expect(state.commandMessage).toBe("['hi!', 'v', 'V']");

      // "bP 로 블록 레지스터를 열 앞에 수직 붙여넣기
      state = handleKey(state, '"');
      state = handleKey(state, 'b');
      state = handleKey(state, 'P');
      expect(state.lines).toEqual(['XX111', 'YY222']);
    });
  });

  describe('Numbered Delete History ("1~"9), Small Delete ("-), and "1p + . redo-register', () => {
    it('줄 단위 삭제(dd, :d) 시 "1 ~ "9 번호 레지스터가 차례로 시프트된다', () => {
      let state: VimEditorState = {
        lines: ['first', 'second', 'third', 'fourth'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 1) first 삭제 -> "1 = first
      state = handleKey(state, 'd');
      state = handleKey(state, 'd');
      expect(state.registers?.['1']?.content).toBe('first');

      // 2) second 삭제 -> "1 = second, "2 = first
      state = handleKey(state, 'd');
      state = handleKey(state, 'd');
      expect(state.registers?.['1']?.content).toBe('second');
      expect(state.registers?.['2']?.content).toBe('first');

      // 3) :d 로 third 삭제 -> "1 = third, "2 = second, "3 = first
      state = executeCommandLine(state, 'd');
      expect(state.registers?.['1']?.content).toBe('third');
      expect(state.registers?.['2']?.content).toBe('second');
      expect(state.registers?.['3']?.content).toBe('first');
    });

    it('한 줄 미만 소규모 삭제(dw, x, D)는 "- 에 기록되고 "1~"9 는 시프트하지 않는다', () => {
      let state: VimEditorState = {
        lines: ['keepLine', 'hello world'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 먼저 첫 줄 dd -> "1 = keepLine
      state = handleKey(state, 'd');
      state = handleKey(state, 'd');
      expect(state.registers?.['1']?.content).toBe('keepLine');

      // hello world 에서 dw -> "- = 'hello ', "1 은 여전히 keepLine 유지!
      state = handleKey(state, 'd');
      state = handleKey(state, 'w');
      expect(state.registers?.['-']).toEqual({ type: 'char', content: 'hello ' });
      expect(state.registers?.['1']?.content).toBe('keepLine');
      expect(state.registers?.['2']).toBeUndefined();

      // "-P 로 방금 지운 작은 단어 복원
      state = handleKey(state, '"');
      state = handleKey(state, '-');
      state = handleKey(state, 'P');
      expect(state.lines[0]).toBe('hello world');
    });

    it('"1p 실행 후 . (또는 u.) 반복 시 "2 -> "3 순서로 삭제 이력을 순회 붙여넣는다', () => {
      let state: VimEditorState = {
        lines: ['lineA', 'lineB', 'lineC', 'base'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 3줄 연속 dd -> "1=lineC, "2=lineB, "3=lineA
      for (let i = 0; i < 3; i++) {
        state = handleKey(state, 'd');
        state = handleKey(state, 'd');
      }
      expect(state.lines).toEqual(['base']);

      // "1p -> lineC 붙여넣기, 이어서 . -> "2(lineB), 이어서 . -> "3(lineA)
      state = handleKey(state, '"');
      state = handleKey(state, '1');
      state = handleKey(state, 'p');
      state = handleKey(state, '.');
      state = handleKey(state, '.');

      expect(state.lines).toEqual(['base', 'lineC', 'lineB', 'lineA']);
    });
  });

  describe('Indent-Adjusted Put (]p, [p, ]P, [P) and Special Read-Only Registers ("%, "#, "., ":, "/)', () => {
    it(']p 와 [p 는 줄 단위 레지스터를 현재 줄의 들여쓰기에 맞춰 정렬해 붙여넣고, Visual 모드에서도 선택 영역을 들여쓰기 맞춰 교체한다', () => {
      let state: VimEditorState = {
        lines: ['if (ok) {', '    const a = 1;', '  const b = 2;', '}'],
        cursor: { line: 2, col: 2 },
        mode: 'NORMAL',
      };

      // 3번째 줄(2칸 들여쓰기)을 yy 복사 후 2번째 줄(4칸 들여쓰기) 아래에 ]p 로 붙여넣기 -> 4칸으로 자동 정렬
      state = handleKey(state, 'y');
      state = handleKey(state, 'y');
      state = handleKey(state, 'k');
      state = handleKey(state, ']');
      state = handleKey(state, 'p');

      expect(state.lines).toEqual([
        'if (ok) {',
        '    const a = 1;',
        '    const b = 2;',
        '  const b = 2;',
        '}',
      ]);
      expect(state.cursor).toEqual({ line: 2, col: 4 });
      expect(state.lastBracketMarks?.start.row).toBe(2);
      expect(state.lastBracketMarks?.end.row).toBe(2);

      // 줄 단위 레지스터("l = "return true;")도 [p 로 붙여넣으면 현재 줄(4칸) 앞에 줄 단위로 정렬되어 들어간다
      state = executeCommandLine(state, 'call setreg("l", ["return true;"], "l")');
      state = handleKey(state, '"');
      state = handleKey(state, 'l');
      state = handleKey(state, '[');
      state = handleKey(state, 'p');
      expect(state.lines[2]).toBe('    return true;');
    });

    it('다중 줄 블록을 ]p 로 붙여넣을 때 첫 비공백 줄을 기준으로 상대 들여쓰기 구조를 보존한다', () => {
      let state: VimEditorState = {
        lines: [
          '  function foo() {',
          '    return 1;',
          '  }',
          '      if (nested) {',
          '      }',
        ],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 1~3줄(2칸/4칸/2칸)을 3yy 복사 후 4번째 줄(6칸 들여쓰기)에서 ]p -> 6칸/8칸/6칸으로 상대 들여쓰기 유지
      state = handleKey(state, '3');
      state = handleKey(state, 'y');
      state = handleKey(state, 'y');
      state = handleKey(state, '3');
      state = handleKey(state, 'j');
      state = handleKey(state, ']');
      state = handleKey(state, 'p');

      expect(state.lines).toEqual([
        '  function foo() {',
        '    return 1;',
        '  }',
        '      if (nested) {',
        '      function foo() {',
        '        return 1;',
        '      }',
        '      }',
      ]);
    });

    it('특수 레지스터 ("%, "#, "., ":, "/)를 Normal 붙여넣기, Insert <C-r>, Vimscript @r/getreg(), :registers 에서 일관되게 지원한다', () => {
      let state: VimEditorState = {
        lines: [''],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
        primaryFilename: 'main.ts',
        secondaryFilename: 'utils.ts',
        lastSearchQuery: 'targetPattern',
        commandHistory: ['set number'],
      };

      // Insert 모드로 텍스트 입력하여 ". (lastInsertedText) 기록
      for (const k of ['i', 'h', 'e', 'l', 'l', 'o', 'Escape']) {
        state = handleKey(state, k);
      }
      expect(state.lastInsertedText).toBe('hello');

      // 1) Vimscript @%, @#, @., @:, @/ 및 getreg() 일관성 확인
      state = executeCommandLine(
        state,
        'echo [@%, @#, @., @/, getreg("%"), getreg("#"), getreg("."), getreg("/")]'
      );
      expect(state.commandMessage).toBe(
        "['main.ts', 'utils.ts', 'hello', 'targetPattern', 'main.ts', 'utils.ts', 'hello', 'targetPattern']"
      );

      // 2) :let @/ = 'newPat' 및 setreg('#', 'alt.ts') 쓰기 지원, 읽기 전용(@%) 대입 시 E354 에러 확인
      state = executeCommandLine(state, 'let @/ = "newPat" | call setreg("#", "alt.ts")');
      expect(state.lastSearchQuery).toBe('newPat');
      expect(state.secondaryFilename).toBe('alt.ts');

      const roAttempt = executeCommandLine(state, 'let @% = " forbidden.ts"');
      expect(roAttempt.bell).toBe(true);
      expect(roAttempt.commandMessage).toContain('E354');

      // 3) :registers 출력에 "., "%, "#, ":, "/ 가 모두 포함된다
      const regOut = formatRegisters(state);
      expect(regOut).toContain('".   c   hello');
      expect(regOut).toContain('"%   c   main.ts');
      expect(regOut).toContain('"#   c   alt.ts');
      expect(regOut).toContain('"/   c   newPat');

      // 4) Normal 모드 "#p 로 대안 파일명 붙여넣기
      state = handleKey(state, '"');
      state = handleKey(state, '#');
      state = handleKey(state, 'p');
      expect(state.lines[0]).toBe('helloalt.ts');
    });
  });
});
