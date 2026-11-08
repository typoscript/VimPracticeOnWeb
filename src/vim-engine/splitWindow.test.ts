import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

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

  it(':only 및 Ctrl-w o로 현재 창만 남기고 나머지 분할 창을 닫는다', () => {
    let state: VimEditorState = {
      lines: ['Main file'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['Other file'],
    };

    // :vsp 분할
    for (const ch of ':vsp\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitPanes).toHaveLength(2);

    // Ctrl-w w 로 보조 창 이동 후 :only 실행
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'w');
    expect(state.activePaneIndex).toBe(1);

    for (const ch of ':only\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitPanes).toBeUndefined();
    expect(state.splitDirection).toBe('none');
    expect(state.lines).toEqual(['Other file']);

    // 단일 창에서 Ctrl-w c 실행 시 E444 가드
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'c');
    expect(state.commandMessage).toContain('E444');
  });

  it(':new 및 :vnew로 새 빈 버퍼 분할 창을 생성한다', () => {
    let state: VimEditorState = {
      lines: ['original code'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };

    for (const ch of ':vnew helper.ts\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitDirection).toBe('vertical');
    expect(state.secondaryFilename).toBe('helper.ts');
    expect(state.splitPanes![1].lines).toEqual(['']);
  });

  it('Ctrl-w x로 두 분할 창의 위치를 맞바꾸고, Ctrl-w r로 회전한다', () => {
    let state: VimEditorState = {
      lines: ['LeftPane'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'left.ts',
      secondaryFilename: 'right.ts',
      secondaryLines: ['RightPane'],
    };

    for (const ch of ':vsp\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);

    // Ctrl-w x : 두 창의 위치와 내용 교환
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'x');
    expect(state.splitPanes![0].filename).toBe('right.ts');
    expect(state.splitPanes![1].filename).toBe('left.ts');

    // Ctrl-w r : 창 회전 및 포커스 토글
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'r');
    expect(state.activePaneIndex).toBe(1);
    expect(state.splitPanes![0].filename).toBe('left.ts');
    expect(state.splitPanes![1].filename).toBe('right.ts');
  });

  it('Ctrl-w H/J/K/L로 분할 방향 및 창 배치를 자유자재로 재배치한다', () => {
    let state: VimEditorState = {
      lines: ['Top content'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['Bottom content'],
    };

    // :sp 가로 분할
    for (const ch of ':sp\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitDirection).toBe('horizontal');

    // Ctrl-w H -> 세로 분할로 변경하며 현재 창을 왼쪽(0)으로 배치
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'H');
    expect(state.splitDirection).toBe('vertical');
    expect(state.activePaneIndex).toBe(0);

    // Ctrl-w J -> 가로 분할로 변경하며 현재 창을 아래쪽(1)으로 배치
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'J');
    expect(state.splitDirection).toBe('horizontal');
    expect(state.activePaneIndex).toBe(1);
  });

  it('Ctrl-w =, +, -, >, <, _, | 및 :res 명령어로 창 크기를 조절한다', () => {
    let state: VimEditorState = {
      lines: ['Pane 1'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['Pane 2'],
    };

    for (const ch of ':vsp\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitRatio).toBe(50);

    // Ctrl-w + (주 창 크기 확대)
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, '+');
    expect(state.splitRatio).toBe(55);

    // Ctrl-w = (균등화)
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, '=');
    expect(state.splitRatio).toBe(50);

    // Ctrl-w | (최대화)
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, '|');
    expect(state.splitRatio).toBe(80);

    // :res = 명령어로 균등화
    for (const ch of ':res =\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    expect(state.splitRatio).toBe(50);
  });

  it('Ctrl-w T로 분할 창을 독립된 새 탭 페이지로 떼어낸다', () => {
    let state: VimEditorState = {
      lines: ['Main file'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'main.ts',
      secondaryFilename: 'breakout.ts',
      secondaryLines: ['Breakout file'],
    };

    for (const ch of ':vsp\n') state = handleKey(state, ch === '\n' ? 'Enter' : ch);
    // 보조 창으로 이동
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'w');
    expect(state.activePaneIndex).toBe(1);

    // Ctrl-w T 실행
    state = handleKey(state, 'Ctrl-w');
    state = handleKey(state, 'T');

    // 2개의 탭이 생기고 현재 탭은 breakout.ts 버퍼 단일 창
    expect(state.tabPages).toHaveLength(2);
    expect(state.currentTabId).toBe(2);
    expect(state.primaryFilename).toBe('breakout.ts');
    expect(state.splitPanes).toBeUndefined();
  });
});
