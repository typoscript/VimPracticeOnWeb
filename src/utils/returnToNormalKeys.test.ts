import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, executeCommandLine, switchPaneFocus, syncPerFileState } from '../vim-engine';
import { getReturnToNormalKeys, isReadyForUiKeys } from './returnToNormalKeys';

const run = (state: ReturnType<typeof createVimState>, keys: string[]) =>
  keys.reduce((s, k) => handleKey(s, k), state);

describe('getReturnToNormalKeys (UI 버튼 키 주입 전 NORMAL 복귀)', () => {
  it('NORMAL 모드에서는 아무 키도 보내지 않는다', () => {
    expect(getReturnToNormalKeys(createVimState(['a'], { line: 0, col: 0 }))).toEqual([]);
  });

  it('TERMINAL 모드에서는 Ctrl-\\ Ctrl-n 으로 빠져나온 뒤 Ex 명령이 실행된다', () => {
    let s = executeCommandLine(createVimState(['a'], { line: 0, col: 0 }), 'ToggleTerm', handleKey);
    expect(s.mode).toBe('TERMINAL');
    const keys = getReturnToNormalKeys(s);
    expect(keys).toEqual(['Ctrl-\\', 'Ctrl-n']);
    s = run(s, [...keys, ':', 's', 'e', 't', ' ', 'n', 'u', 'Enter']);
    expect(s.mode).toBe('NORMAL');
    expect(s.options?.number).toBe(true);
  });

  it('INSERT 모드·대기 키는 Escape 로 정리한다', () => {
    const ins = run(createVimState(['a'], { line: 0, col: 0 }), ['i']);
    expect(getReturnToNormalKeys(ins)).toEqual(['Escape']);
    const pending = run(createVimState(['a'], { line: 0, col: 0 }), ['d']);
    expect(getReturnToNormalKeys(pending)).toEqual(['Escape']);
  });
});

describe('getReturnToNormalKeys: 팝업·포커스 상태', () => {
  const base = () => ({
    ...createVimState(['const foo = 1;'], { line: 0, col: 0 }),
    primaryFilename: 'a.ts',
    virtualFiles: { 'a.ts': ['const foo = 1;'], 'b.ts': ['b'] },
  });
  const ex = (s: ReturnType<typeof createVimState>, cmd: string) => run(s, [':', ...cmd.split(''), 'Enter']);

  it.each(['Neotree', 'HarpoonMenu', 'Files', 'Yanks'])('%s 가 키를 가로채는 상태에서도 다음 Ex 명령이 실행된다', (cmd) => {
    let s = ex(base(), cmd);
    s = run(s, [...getReturnToNormalKeys(s), ':', 'O', 'i', 'l', 'Enter']);
    expect(s.oilSession?.isOpen).toBe(true);
  });

  it('Neo-tree 파일 생성 프롬프트에 입력되지 않는다', () => {
    let s = ex(base(), 'Neotree');
    s = run(s, ['a']);
    expect(s.neotree?.prompt).toBeTruthy();
    s = run(s, [...getReturnToNormalKeys(s), ':', 'O', 'i', 'l', 'Enter']);
    expect(s.oilSession?.isOpen).toBe(true);
    expect(Object.keys(s.virtualFiles ?? {}).some((f) => f.includes('Oil'))).toBe(false);
  });
});

describe('getReturnToNormalKeys: 터미널 위 팝업', () => {
  it('터미널 창에서 Harpoon 메뉴가 열려 있으면 메뉴를 먼저 닫고 터미널 모드를 빠져나온다', () => {
    // 퍼즈 재현: :ToggleTerm → 코드 창 클릭 → :HarpoonMenu → 터미널 창 클릭
    const ui = (x: ReturnType<typeof createVimState>, i: number) => syncPerFileState(x, switchPaneFocus(x, i));
    let s = run({ ...createVimState(['a'], { line: 0, col: 0 }), primaryFilename: 'a.ts' }, [':', ...'ToggleTerm'.split(''), 'Enter']);
    s = ui(s, 0);
    s = run(s, [':', ...'HarpoonMenu'.split(''), 'Enter']);
    s = ui(s, 1);
    expect(s.harpoonMenu?.isOpen).toBe(true);
    const after = run(s, getReturnToNormalKeys(s));
    expect(isReadyForUiKeys(after)).toBe(true);
  });
});
