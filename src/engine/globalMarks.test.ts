import { describe, it, expect } from 'vitest';
import { setMark, jumpToMark, formatMarksList } from './marks';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('Global Marks (mA ~ mZ, \'A ~ \'Z)', () => {
  it('소문자 마크(ma)는 로컬 좌표만 저장하고 대문자 마크(mA)는 파일/버퍼 메타데이터를 포함한다', () => {
    let state: VimEditorState = {
      lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
      cursor: { line: 1, col: 6 },
      mode: 'NORMAL',
      primaryFilename: 'app.ts',
      currentBufferId: 1,
    };

    // 소문자 마크 설정
    state = setMark(state, 'a');
    expect(state.marks?.a).toEqual({ row: 1, col: 6 });
    expect(state.marks?.a.filename).toBeUndefined();

    // 대문자 전역 마크 설정
    state = setMark(state, 'A');
    expect(state.marks?.A).toBeDefined();
    expect(state.marks?.A.row).toBe(1);
    expect(state.marks?.A.col).toBe(6);
    expect(state.marks?.A.filename).toBe('app.ts');
    expect(state.marks?.A.bufferId).toBe(1);
    expect(state.commandMessage).toContain("전역 마크 'A' 설정됨");
  });

  it('다중 버퍼 환경에서 다른 파일로 이동한 후 \'A를 누르면 원래 파일 버퍼로 자동 전환하며 점프한다', () => {
    let state: VimEditorState = {
      lines: ['// main.ts line 1', '// main.ts line 2 (target)', '// main.ts line 3'],
      cursor: { line: 1, col: 3 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      currentBufferId: 1,
      buffers: [
        {
          id: 1,
          name: 'main.ts',
          lines: ['// main.ts line 1', '// main.ts line 2 (target)', '// main.ts line 3'],
          cursor: { line: 1, col: 3 },
        },
        {
          id: 2,
          name: 'utils.ts',
          lines: ['export function add(a, b) {', '  return a + b;', '}'],
          cursor: { line: 0, col: 0 },
        },
      ],
    };

    // 1. main.ts에서 mA 전역 마크 저장
    state = handleKey(state, 'm');
    state = handleKey(state, 'A');
    expect(state.marks?.A?.filename).toBe('main.ts');

    // 2. :bnext로 utils.ts로 전환
    const cmd = ':bnext\n';
    for (const char of cmd) {
      state = handleKey(state, char === '\n' ? 'Enter' : char);
    }
    expect(state.currentBufferId).toBe(2);
    expect(state.lines[0]).toBe('export function add(a, b) {');

    // 3. utils.ts에서 'A 를 누르면 main.ts로 자동 복귀하여 해당 줄로 점프
    state = handleKey(state, "'");
    state = handleKey(state, 'A');

    expect(state.currentBufferId).toBe(1);
    expect(state.lines[1]).toBe('// main.ts line 2 (target)');
    expect(state.cursor.line).toBe(1);
  });

  it('분할 창 환경에서 다른 창에 있을 때 \'A를 누르면 마크가 있는 창으로 포커스가 전환된다', () => {
    let state: VimEditorState = {
      lines: ['left 1', 'left 2 target'],
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      splitDirection: 'vertical',
      activePaneIndex: 0,
      primaryFilename: 'left.ts',
      secondaryFilename: 'right.ts',
      splitPanes: [
        {
          filename: 'left.ts',
          lines: ['left 1', 'left 2 target'],
          cursor: { line: 1, col: 0 },
          mode: 'NORMAL',
        },
        {
          filename: 'right.ts',
          lines: ['right 1', 'right 2'],
          cursor: { line: 0, col: 0 },
          mode: 'NORMAL',
        },
      ],
    };

    // 왼쪽 창에서 mA 설정
    state = handleKey(state, 'm');
    state = handleKey(state, 'A');

    // 오른쪽 창으로 이동 (Ctrl-w w)
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'w');
    expect(state.activePaneIndex).toBe(1);

    // 오른쪽 창에서 'A 점프
    state = handleKey(state, "'");
    state = handleKey(state, 'A');

    expect(state.activePaneIndex).toBe(0);
    expect(state.cursor.line).toBe(1);
  });

  it(':marks 명령으로 마크 목록을 확인하고 필터링할 수 있다', () => {
    let state: VimEditorState = {
      lines: ['line 1', 'line 2', 'line 3'],
      cursor: { line: 1, col: 2 },
      mode: 'NORMAL',
      primaryFilename: 'test.ts',
    };

    state = setMark(state, 'a');
    state = setMark(state, 'A');

    const allMarks = formatMarksList(state);
    expect(allMarks).toContain('mark line  col file/text');
    expect(allMarks).toContain('a       2    2');
    expect(allMarks).toContain('A       2    2 test.ts');

    // 필터링 (:marks A)
    const filtered = formatMarksList(state, 'A');
    expect(filtered).toContain('A       2    2 test.ts');
    expect(filtered).not.toContain('a       2    2');
  });

  it(':marks Ex 명령어를 직접 키스트로크로 호출할 수 있다', () => {
    let state: VimEditorState = {
      lines: ['line 1', 'line 2'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    state = setMark(state, 'x');

    const cmd = ':marks\n';
    for (const char of cmd) {
      state = handleKey(state, char === '\n' ? 'Enter' : char);
    }
    expect(state.commandMessage).toContain('mark line  col file/text');
    expect(state.commandMessage).toContain('x       1    0');
  });

  it('jumpToMark 함수 직접 호출 시에도 마크 위치로 정상 점프한다', () => {
    let state: VimEditorState = {
      lines: ['line 1', 'line 2 target'],
      cursor: { line: 1, col: 5 },
      mode: 'NORMAL',
    };
    state = setMark(state, 'M');
    state = { ...state, cursor: { line: 0, col: 0 } };

    const res = jumpToMark(state, 'M', false);
    expect(res.cursor).toEqual({ line: 1, col: 5 });
  });
});
