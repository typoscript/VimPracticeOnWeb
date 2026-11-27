import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, type VimEditorState } from './index';

const run = (s: VimEditorState, keys: string[]) => keys.reduce((a, k) => handleKey(a, k), s);
const ex = (s: VimEditorState, cmd: string) => run(s, [':', ...cmd.split(''), 'Enter']);

function twoFiles(): VimEditorState {
  return {
    ...createVimState(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], { line: 0, col: 0 }),
    primaryFilename: 'a.ts',
    virtualFiles: { 'a.ts': ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], 'b.ts': ['b1', 'b2'] },
  };
}

describe('버퍼 로컬 상태는 파일별로 분리된다 (Vim buffer-local)', () => {
  // a.ts: 마크 a(1행), 변경 2건, 비주얼 선택, 삽입 위치, 전역 마크 B
  const prepared = () => run(twoFiles(), ['j', 'm', 'a', 'j', 'x', 'v', 'j', 'Escape', 'i', 'Z', 'Escape', 'm', 'B']);

  it("새 파일에서는 소문자 마크·g;·gv 가 이전 파일 값을 쓰지 않는다", () => {
    const b = ex(prepared(), 'e b.ts');
    expect(b.primaryFilename).toBe('b.ts');

    const markJump = run(b, ["'", 'a']);
    expect(markJump.bell).toBe(true);
    expect(markJump.cursor).toEqual({ line: 0, col: 0 });

    const changeJump = run(b, ['g', ';']);
    expect(changeJump.bell).toBe(true);
    expect(changeJump.commandMessage).toContain('E664');

    const reselect = run(b, ['g', 'v']);
    expect(reselect.mode).toBe('NORMAL');
    expect(reselect.bell).toBe(true);
  });

  it('전역 마크(A-Z)는 그대로 다른 파일로 점프한다', () => {
    const b = ex(prepared(), 'e b.ts');
    expect(run(b, ["'", 'B']).primaryFilename).toBe('a.ts');
  });

  it('원래 파일로 돌아오면 마크·변경 목록·gv·gi 가 복원된다', () => {
    const a = run(ex(prepared(), 'e b.ts'), ['Ctrl-^']);
    expect(a.primaryFilename).toBe('a.ts');
    expect(run(a, ["'", 'a']).cursor.line).toBe(1);
    expect(run(a, ['g', ';']).bell).toBeFalsy();
    expect(run(a, ['g', 'v']).mode).toBe('VISUAL');
    const gi = run(a, ['g', 'i']);
    expect(gi.mode).toBe('INSERT');
    expect(gi.cursor).toEqual({ line: 3, col: 1 });
  });

  it('Netrw 에서 만든 폴드가 Netrw 를 닫은 뒤 원래 버퍼로 새지 않는다', () => {
    let s = ex(twoFiles(), 'Explore');
    s = run(s, ['V', 'z', 'f']);
    expect(s.folds?.length).toBe(1);
    s = run(s, ['q']);
    expect(s.primaryFilename).toBe('a.ts');
    expect(s.folds ?? []).toEqual([]);
  });
});

describe('gv / g; 빈 상태 (Neovim 대조)', () => {
  it('이전 비주얼 선택이 없으면 gv 는 벨만 울리고 NORMAL 유지', () => {
    const s = run(createVimState(['abc'], { line: 0, col: 0 }), ['g', 'v']);
    expect(s.mode).toBe('NORMAL');
    expect(s.bell).toBe(true);
  });

  it('변경 목록이 비어 있으면 g; 는 E664', () => {
    const s = run(createVimState(['abc'], { line: 0, col: 0 }), ['g', ';']);
    expect(s.commandMessage).toContain('E664');
    expect(s.bell).toBe(true);
  });
});

describe('Netrw 버퍼 범위', () => {
  it('Netrw 목록은 수정할 수 없다 (E21)', () => {
    const s = run(ex(twoFiles(), 'Explore'), ['a']);
    expect(s.mode).toBe('NORMAL');
    expect(s.bell).toBe(true);
    expect(s.commandMessage).toContain('E21');
  });

  it(':bp 로 떠난 뒤에는 Netrw 키 처리가 Ex 명령을 가로채지 않는다', () => {
    let s = ex(twoFiles(), 'Explore');
    s = ex(s, 'bp');
    expect(s.primaryFilename).toBe('a.ts');
    s = ex(s, 'set nu');
    expect(s.mode).toBe('NORMAL');
    expect(s.options?.number).toBe(true);
    expect(s.lines[0]).toBe('a1');
  });

  it('Netrw 안에서 Ex 명령 입력 중 d·% 를 눌러도 Netrw 동작이 실행되지 않는다', () => {
    const s = run(ex(twoFiles(), 'Explore'), [':', 'e', 'c', 'h', 'o', ' ', '"', 'd', '%', '"']);
    expect(s.mode).toBe('COMMAND');
    expect(s.commandBuffer ?? '').toContain('d%');
  });
});

describe('다중 커서 입력 하위 모드', () => {
  it('a / A 로 입력을 시작하면 INSERT 모드가 되고 커서가 줄 끝에 있어도 불변성이 깨지지 않는다', () => {
    let s = run(createVimState(['b1', 'b2 foo'], { line: 0, col: 0 }), ['g', 'Ctrl-n']);
    s = run(s, ['A']);
    expect(s.mode).toBe('INSERT');
    expect(s.multiCursor?.submode).toBe('insert');
    s = run(s, ['X', 'Escape']);
    expect(s.mode).toBe('NORMAL');
    expect(s.lines[0]).toBe('b1X');
  });
});

describe('도움말 창 키 처리', () => {
  it('도움말이 열린 상태에서도 Ex 명령이 실행되고 :q 는 도움말만 닫는다', () => {
    let s = ex(createVimState(['abc'], { line: 0, col: 0 }), 'help gv');
    expect(s.helpSession?.isOpen).toBe(true);
    const nu = ex(s, 'set nu');
    expect(nu.options?.number).toBe(true);
    s = ex(s, 'q');
    expect(s.helpSession?.isOpen).toBeFalsy();
    expect(s.lines).toEqual(['abc']);
  });
});

describe('Oil 시작 디렉터리', () => {
  it('터미널 버퍼에서 :Oil 을 열면 term: 이 아닌 루트에서 시작한다', () => {
    let s = ex(twoFiles(), 'terminal');
    s = run(s, ['Ctrl-\\', 'Ctrl-n']);
    s = ex(s, 'Oil');
    expect(s.primaryFilename).toBe('oil:///');
  });
});
