import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  syncPerFileState,
  switchPaneFocus,
  switchBuffer,
  deleteBuffer,
  openNewTab,
  closeTab,
  openNeotreeNode,
  type VimEditorState,
} from './index';

const run = (s: VimEditorState, keys: string[]) => keys.reduce((a, k) => handleKey(a, k), s);
const ex = (s: VimEditorState, cmd: string) => run(s, [':', ...cmd.split(''), 'Enter']);
/** 앱의 UI 클릭 경로와 같게: 엔진 함수를 직접 부른 뒤 파일별 상태를 맞춤 */
const ui = (s: VimEditorState, fn: (x: VimEditorState) => VimEditorState) => syncPerFileState(s, fn(s));

function workspace(): VimEditorState {
  return {
    ...createVimState(['const foo = 1;', 'foo(a, b);', 'if (x) { y(); }', 'TODO: fix foo', ''], { line: 0, col: 0 }),
    primaryFilename: 'a.ts',
    virtualFiles: { 'a.ts': ['const foo = 1;'], 'b.ts': ['b1', 'b2 foo', 'b3'], 'src/c.ts': ['c1 foo', 'c2'] },
  };
}

describe('분할 창: 현재 파일은 포커스를 가진 창의 파일', () => {
  it('Ctrl-w w 로 옮긴 창에서 :w 하면 그 창의 파일에 저장된다 (다른 파일을 덮어쓰지 않음)', () => {
    let s = ex(workspace(), 'vsp b.ts');
    s = run(s, ['Ctrl-w', 'w']);
    expect(s.primaryFilename).toBe('b.ts');
    s = ex(run(s, ['x']), 'w');
    expect(s.virtualFiles?.['b.ts']).toEqual(['1', 'b2 foo', 'b3']);
    expect(s.virtualFiles?.['a.ts']).toEqual(['const foo = 1;']);
  });

  it('창마다 소문자 마크가 그 창의 파일에 속한다', () => {
    let s = ex(workspace(), 'vsp b.ts');
    s = run(s, ['Ctrl-w', 'w', 'j', 'm', 'a', 'Ctrl-w', 'w']);
    expect(s.primaryFilename).toBe('a.ts');
    expect(run(s, ["'", 'a']).bell).toBe(true);
  });

  it(':bp 는 현재 창만 바꾸고 다른 창 내용은 그대로 둔다', () => {
    let s = ex(workspace(), 'e b.ts');
    s = ex(s, 'vsp');
    s = ex(s, 'bp');
    expect(s.primaryFilename).toBe('a.ts');
    const other = s.splitPanes!.find((_, i) => i !== s.activePaneIndex)!;
    expect(other.lines).toEqual(['b1', 'b2 foo', 'b3']);
    expect(s.splitPanes![s.activePaneIndex ?? 0].filename).toBe('a.ts');
  });

  it('UI 로 창을 옮긴 뒤에도 현재 파일이 따라간다', () => {
    let s = ex(workspace(), 'vsp b.ts');
    s = ui(s, (x) => switchPaneFocus(x, 1));
    expect(s.primaryFilename).toBe(s.splitPanes![1].filename);
  });
});

describe('탭·버퍼 전환 후 상태 정합성', () => {
  it('새 탭은 새 빈 버퍼를 만들고 currentBufferId 가 그 버퍼를 가리킨다', () => {
    const s = ui(workspace(), (x) => openNewTab(x));
    const cur = s.buffers?.find((b) => b.id === s.currentBufferId);
    expect(cur?.name).toBe('[No Name]');
    expect(s.primaryFilename).toBe('[No Name]');
  });

  it('입력 중 저장된 커서(줄 끝 다음 칸)를 다른 탭에서 돌아올 때 NORMAL 범위로 맞춘다', () => {
    let s = ex(workspace(), 'tabnew');
    s = run(s, ['i', 'y', 'y']);
    s = ui(s, (x) => openNewTab(x));
    s = ex(s, 'tabclose');
    expect(s.mode).toBe('NORMAL');
    expect(s.cursor.col).toBeLessThanOrEqual(Math.max(0, s.lines[s.cursor.line].length - 1));
  });

  it('탭을 바꾸면 저장된 탭 모드를 되살리지 않는다 (Vim 의 모드는 탭에 속하지 않음)', () => {
    let s = ex(workspace(), 'tabnew');
    s = run(s, ['i']);
    s = ui(s, (x) => openNewTab(x));
    s = ui(s, (x) => closeTab(x));
    expect(s.mode).toBe('NORMAL');
  });

  it('다른 탭이 보여 주던 버퍼를 삭제하면 그 탭은 남은 버퍼를 보여 준다', () => {
    let s = ex(workspace(), 'e src/c.ts');
    s = ui(s, (x) => openNewTab(x));
    const cId = s.buffers!.find((b) => b.name === 'src/c.ts')!.id;
    s = ui(s, (x) => deleteBuffer(x, String(cId), true));
    const tab1 = s.tabPages!.find((t) => t.id !== s.currentTabId)!;
    expect(s.buffers!.some((b) => b.id === tab1.currentBufferId)).toBe(true);
    expect(tab1.primaryFilename).not.toBe('src/c.ts');
  });

  it('Netrw 를 닫아 버퍼가 사라져도 그 버퍼를 보여 주던 탭이 남지 않는다', () => {
    let s = ex(workspace(), 'Explore');
    s = ui(s, (x) => openNewTab(x));
    s = run(s, ['Ctrl-^', 'q']);
    s = ui(s, (x) => closeTab(x));
    expect(s.primaryFilename?.startsWith('Netrw')).toBe(false);
    expect(s.buffers!.some((b) => b.id === s.currentBufferId)).toBe(true);
  });

  it('비주얼 모드의 Ctrl-^ 는 파일을 바꾸지 않는다 (Neovim 대조)', () => {
    let s = ex(workspace(), 'e b.ts');
    s = run(s, ['Ctrl-^', 'V', 'Ctrl-^']);
    expect(s.primaryFilename).toBe('a.ts');
    expect(s.mode).toBe('VISUAL_LINE');
    expect(s.bell).toBe(true);
  });

  it('UI 로 버퍼를 바꾸면 비주얼·다중 커서가 닫히고 커서가 새 버퍼 범위에 있다', () => {
    let s = run(workspace(), ['G', 'V']);
    const bId = ex(workspace(), 'e b.ts').buffers!.find((b) => b.name === 'b.ts')!.id;
    s = ex(run(s, ['Escape']), 'badd b.ts');
    s = run(s, ['G', 'V']);
    s = ui(s, (x) => switchBuffer(x, bId));
    expect(s.mode).toBe('NORMAL');
    expect(s.cursor.line).toBeLessThan(s.lines.length);
  });
});

describe('폴드는 줄 변화를 따라간다', () => {
  it('폴드 위 줄을 지우면 폴드가 한 줄 위로 이동한다', () => {
    let s = run(workspace(), ['j', 'V', 'j', 'z', 'f']);
    expect(s.folds?.[0]).toMatchObject({ startRow: 1, endRow: 2 });
    s = run(s, ['g', 'g', 'd', 'd']);
    expect(s.folds?.[0]).toMatchObject({ startRow: 0, endRow: 1 });
  });

  it(':g 로 폴드 줄을 모두 지우면 폴드도 사라지고 범위를 벗어나지 않는다', () => {
    let s = run(workspace(), ['j', 'j', 'j', 'V', 'j', 'z', 'f']);
    s = ex(s, 'g/foo/d');
    for (const f of s.folds ?? []) expect(f.endRow).toBeLessThan(s.lines.length);
  });
});

describe('특수 버퍼·창 전환과 모드', () => {
  it('터미널 입력 중 Neo-tree 로 파일을 열면 TERMINAL 모드가 풀리고 파일 내용이 바뀌지 않는다', () => {
    let s = ex(workspace(), 'Neotree');
    s = ex(s, 'ToggleTerm');
    expect(s.mode).toBe('TERMINAL');
    s = run(s, ['Enter']);
    // 앱의 Neo-tree 클릭과 같은 경로 (퍼즈가 찾은 재현: 4번째 항목 = 파일)
    s = ui(s, (x) => openNeotreeNode(x, 3));
    expect(s.primaryFilename?.startsWith('term://')).toBe(false);
    expect(s.mode).toBe('NORMAL');
    const before = [...s.lines];
    s = run(s, ['Enter']);
    expect(s.lines).toEqual(before);
    expect(s.lines.every((l) => typeof l === 'string')).toBe(true);
  });

  it('Neo-tree 포커스 상태의 u 는 실행 취소 불변성 검사에 걸리지 않는다', () => {
    let s = ex(workspace(), 'g/foo/d');
    s = ex(s, 'Neotree');
    expect(() => run(s, ['u'])).not.toThrow();
  });
});

describe('재귀 매크로·Oil 복귀', () => {
  it('자기 자신을 두 번 부르는 매크로도 정해진 키 수에서 멈추고 알려 준다 (브라우저가 멈추지 않음)', () => {
    let s = createVimState(['foo bar', 'baz'], { line: 0, col: 0 });
    s = { ...s, registers: { ...(s.registers ?? {}), a: { type: 'macro', content: ['j', 'k', '@', 'a', '@', 'a'] } } } as VimEditorState;
    const started = Date.now();
    s = run(s, ['@', 'a']);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(s.bell).toBe(true);
    expect(s.commandMessage).toContain('100000');
  });

  it('Oil 을 연 사이 원래 버퍼를 삭제해도 :q 후 버퍼 목록과 현재 버퍼가 일치한다', () => {
    let s = ex(ex(workspace(), 'e b.ts'), 'Oil');
    const bId = s.buffers!.find((b) => b.name === 'b.ts')!.id;
    s = ui(s, (x) => deleteBuffer(x, String(bId), true));
    s = ex(s, 'q');
    expect(s.oilSession?.isOpen).toBeFalsy();
    const cur = s.buffers!.find((b) => b.id === s.currentBufferId);
    expect(cur?.name).toBe(s.primaryFilename);
  });
});
