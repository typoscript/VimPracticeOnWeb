import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from '../types/vim';

describe('Multi-Window Splits & Focus Control (:sp, :vsp, Ctrl+w)', () => {
  it(':vsp 명령어로 세로 분할 창을 생성하고 보조 파일을 로드한다', () => {
    let state: VimEditorState = {
      lines: ['export function leftFn() {}'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'source.ts',
      secondaryFilename: 'target.ts',
      secondaryLines: ['// Target file content'],
    };

    // : v s p Enter
    state = handleKey(state, ':');
    state = handleKey(state, 'v');
    state = handleKey(state, 's');
    state = handleKey(state, 'p');
    state = handleKey(state, 'Enter');

    expect(state.splitDirection).toBe('vertical');
    expect(state.activePaneIndex).toBe(0);
    expect(state.splitPanes).toBeDefined();
    expect(state.splitPanes![0].filename).toBe('source.ts');
    expect(state.splitPanes![0].lines).toEqual(['export function leftFn() {}']);
    expect(state.splitPanes![1].filename).toBe('target.ts');
    expect(state.splitPanes![1].lines).toEqual(['// Target file content']);
  });

  it(':sp 및 Ctrl-w s로 가로 분할 창을 생성한다', () => {
    let state: VimEditorState = {
      lines: ['Top buffer line'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    state = handleKey(state, 'Ctrl-w');
    expect(state.pendingKeys).toBe('Ctrl-w');
    state = handleKey(state, 's');

    expect(state.splitDirection).toBe('horizontal');
    expect(state.splitPanes?.length).toBe(2);
  });

  it('Ctrl-w l과 Ctrl-w h로 분할된 창 간 포커스를 전환한다', () => {
    let state: VimEditorState = {
      lines: ['Source content'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['Target content'],
    };

    // :vsp
    state = handleKey(state, ':');
    state = handleKey(state, 'v');
    state = handleKey(state, 's');
    state = handleKey(state, 'p');
    state = handleKey(state, 'Enter');
    expect(state.activePaneIndex).toBe(0);

    // Ctrl-w l -> 오른쪽 창(target)으로 이동
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'l');
    expect(state.activePaneIndex).toBe(1);
    expect(state.lines).toEqual(['Target content']);

    // Ctrl-w h -> 왼쪽 창(source)으로 이동
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'h');
    expect(state.activePaneIndex).toBe(0);
    expect(state.lines).toEqual(['Source content']);
  });

  it('두 창이 레지스터를 완벽하게 공유하여 왼쪽 창에서 복사 후 오른쪽 창에 붙여넣기가 동작한다', () => {
    let state: VimEditorState = {
      lines: [
        'export function helperA() { return "A"; }',
        'export function helperB() { return "B"; }',
      ],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'source.ts',
      secondaryFilename: 'target.ts',
      secondaryLines: ['// Refactored Target'],
    };

    // 1. :vsp 분할 실행
    state = handleKey(state, ':');
    state = handleKey(state, 'v');
    state = handleKey(state, 's');
    state = handleKey(state, 'p');
    state = handleKey(state, 'Enter');

    // 2. 왼쪽 창에서 첫 줄을 "a 레지스터에 복사 ("ayy)
    state = handleKey(state, '"');
    state = handleKey(state, 'a');
    state = handleKey(state, 'y');
    state = handleKey(state, 'y');
    expect(state.registers?.a?.content).toBe('export function helperA() { return "A"; }');

    // 3. 둘째 줄로 이동 후 "b 레지스터에 복사 ("byy)
    state = handleKey(state, 'j');
    state = handleKey(state, '"');
    state = handleKey(state, 'b');
    state = handleKey(state, 'y');
    state = handleKey(state, 'y');
    expect(state.registers?.b?.content).toBe('export function helperB() { return "B"; }');

    // 4. Ctrl-w l 로 오른쪽 창(target.ts)으로 포커스 전환
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'l');
    expect(state.activePaneIndex).toBe(1);
    expect(state.lines[0]).toBe('// Refactored Target');

    // 5. 오른쪽 창에서 "ap 와 "bp 로 순차적으로 붙여넣기
    state = handleKey(state, '"');
    state = handleKey(state, 'a');
    state = handleKey(state, 'p');

    state = handleKey(state, '"');
    state = handleKey(state, 'b');
    state = handleKey(state, 'p');

    expect(state.lines).toEqual([
      '// Refactored Target',
      'export function helperA() { return "A"; }',
      'export function helperB() { return "B"; }',
    ]);
  });

  it(':q 또는 Ctrl-w c로 현재 활성 창을 닫으면 단일 창 상태로 복귀한다', () => {
    let state: VimEditorState = {
      lines: ['Primary content'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['Secondary content'],
    };

    // 세로 분할
    state = handleKey(state, ':');
    state = handleKey(state, 'v');
    state = handleKey(state, 's');
    state = handleKey(state, 'p');
    state = handleKey(state, 'Enter');
    expect(state.splitDirection).toBe('vertical');

    // 보조 창으로 이동
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'w');
    expect(state.activePaneIndex).toBe(1);

    // :q 입력으로 보조 창 닫기
    state = handleKey(state, ':');
    state = handleKey(state, 'q');
    state = handleKey(state, 'Enter');

    expect(state.splitDirection).toBe('none');
    expect(state.activePaneIndex).toBe(0);
    expect(state.splitPanes).toBeUndefined();
    expect(state.lines).toEqual(['Primary content']);
  });
});
