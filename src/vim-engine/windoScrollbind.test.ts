import { describe, it, expect } from 'vitest';
import { handleKey } from './vimEngine';
import type { VimEditorState } from './types';

function ex(state: VimEditorState, cmd: string): VimEditorState {
  let s = state;
  for (const ch of `:${cmd}`) {
    s = handleKey(s, ch);
  }
  return handleKey(s, 'Enter');
}

function makeSplitState(lineCount = 30): VimEditorState {
  const lines = Array.from({ length: lineCount }, (_, i) => `left line ${i + 1}`);
  const secondaryLines = Array.from({ length: lineCount }, (_, i) => `right line ${i + 1}`);
  const base: VimEditorState = {
    lines,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'left.ts',
    secondaryFilename: 'right.ts',
    secondaryLines,
    viewport: { topRow: 0, visibleRows: 10 },
  };
  return ex(base, 'vsp');
}

describe(':windo 일괄 실행 & :wincmd 확장', () => {
  it(':windo set scb 로 양쪽 분할 창 모두에 scrollbind 를 활성화한다', () => {
    let s = makeSplitState(20);
    expect(s.splitPanes![0].scrollbind).toBe(false);
    expect(s.splitPanes![1].scrollbind).toBe(false);

    s = ex(s, 'windo set scb');
    expect(s.splitPanes![0].scrollbind).toBe(true);
    expect(s.splitPanes![1].scrollbind).toBe(true);
    expect(s.activePaneIndex).toBe(0);
    expect(s.commandMessage).toContain('2개 창에 대해 :windo');
  });

  it(':windo %s/line/row/g 및 파이프(|) 포함 명령을 모든 창에 적용한다', () => {
    let s = makeSplitState(5);
    s = ex(s, 'windo %s/line/row/g | set scb');
    expect(s.splitPanes![0].lines[0]).toBe('left row 1');
    expect(s.splitPanes![1].lines[0]).toBe('right row 1');
    expect(s.splitPanes![0].scrollbind).toBe(true);
    expect(s.splitPanes![1].scrollbind).toBe(true);
  });

  it(':windo 는 에러(bell) 시 중단하고 :windo! 는 끝까지 계속 실행한다', () => {
    let s: VimEditorState = {
      lines: ['alpha'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      secondaryLines: ['beta'],
    };
    s = ex(s, 'vsp');

    const stopped = ex(s, 'windo %s/beta/BETA/g');
    expect(stopped.bell).toBe(true);
    expect(stopped.splitPanes![1].lines[0]).toBe('beta');

    const forced = ex(s, 'windo! %s/beta/BETA/g');
    expect(forced.bell).toBeFalsy();
    expect(forced.splitPanes![1].lines[0]).toBe('BETA');
  });

  it('인수 없는 :windo 는 E471 에러를 반환하고, 단일 창에서는 1개 창에 실행한다', () => {
    const emptyArg = ex(makeSplitState(5), 'windo');
    expect(emptyArg.bell).toBe(true);
    expect(emptyArg.commandMessage).toContain('E471');

    const single = ex(
      { lines: ['hello'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' },
      'windo %s/hello/world/'
    );
    expect(single.lines).toEqual(['world']);
    expect(single.commandMessage).toContain('1개 창에 대해 :windo');
  });

  it(':wincmd H/J/K/L/r/R/x 및 :10wincmd + 가 대소문자를 구분해 동작한다', () => {
    let s = makeSplitState(5);
    expect(s.splitDirection).toBe('vertical');

    // :wincmd J -> 가로 분할, 현재 창 아래쪽(1)으로 이동
    s = ex(s, 'wincmd J');
    expect(s.splitDirection).toBe('horizontal');
    expect(s.activePaneIndex).toBe(1);
    expect(s.splitPanes![1].filename).toBe('left.ts');

    // :wincmd H -> 세로 분할, 현재 창 왼쪽(0)으로 이동
    s = ex(s, 'wincmd H');
    expect(s.splitDirection).toBe('vertical');
    expect(s.activePaneIndex).toBe(0);
    expect(s.splitPanes![0].filename).toBe('left.ts');

    // :wincmd x -> 두 창 위치 맞바꾸기
    s = ex(s, 'wincmd x');
    expect(s.splitPanes![0].filename).toBe('right.ts');
    expect(s.splitPanes![1].filename).toBe('left.ts');

    // :wincmd R -> 반시계 회전 및 포커스 전환
    s = ex(s, 'wincmd R');
    expect(s.activePaneIndex).toBe(1);
    expect(s.splitPanes![1].filename).toBe('right.ts');

    // :10wincmd + -> 활성 창 크기 증가
    const beforeRatio = s.splitRatio ?? 50;
    s = ex(s, '10wincmd +');
    expect(s.splitRatio).not.toBe(beforeRatio);
  });

  it('Ctrl-w R 은 반시계 방향으로 창을 회전한다', () => {
    let s = makeSplitState(5);
    s = handleKey(s, 'Ctrl-w');
    s = handleKey(s, 'R');
    expect(s.activePaneIndex).toBe(1);
    expect(s.splitPanes![0].filename).toBe('right.ts');
    expect(s.splitPanes![1].filename).toBe('left.ts');
    expect(s.commandMessage).toContain('Ctrl-w R');
  });
});

describe(':set scrollbind (scb) 동기 스크롤', () => {
  it(':set scb 는 창 로컬로 동작하며 한쪽만 켜면 상대 창이 따라 스크롤되지 않는다', () => {
    let s = makeSplitState(30);
    s = ex(s, 'set scb');
    expect(ex(s, 'set scb?').commandMessage).toBe('scrollbind');

    s = handleKey(s, 'Ctrl-w');
    s = handleKey(s, 'l');
    expect(ex(s, 'set scb?').commandMessage).toBe('noscrollbind');

    s = handleKey(s, 'Ctrl-w');
    s = handleKey(s, 'h');
    for (let i = 0; i < 4; i++) s = handleKey(s, 'Ctrl-e');
    expect(s.viewport!.topRow).toBe(4);
    expect(s.splitPanes![1].viewport!.topRow).toBe(0);
  });

  it('양쪽 창에 scrollbind 가 켜지면 Ctrl-e/Ctrl-y/Ctrl-d/G 이동 시 상대 창도 같은 양만큼 스크롤된다', () => {
    let s = makeSplitState(30);
    s = ex(s, 'windo set scb');

    // Ctrl-e 3회
    for (let i = 0; i < 3; i++) s = handleKey(s, 'Ctrl-e');
    expect(s.viewport!.topRow).toBe(3);
    expect(s.splitPanes![1].viewport!.topRow).toBe(3);

    // Ctrl-y 1회
    s = handleKey(s, 'Ctrl-y');
    expect(s.viewport!.topRow).toBe(2);
    expect(s.splitPanes![1].viewport!.topRow).toBe(2);

    // Ctrl-d 반 페이지 스크롤
    s = handleKey(s, 'Ctrl-d');
    expect(s.viewport!.topRow).toBe(7);
    expect(s.splitPanes![1].viewport!.topRow).toBe(7);

    // :set noscb 후 한쪽 스크롤 해제 확인
    s = ex(s, 'set noscb');
    s = handleKey(s, 'Ctrl-e');
    expect(s.viewport!.topRow).toBe(8);
    expect(s.splitPanes![1].viewport!.topRow).toBe(7);
  });

  it(':syncbind 는 이미 scrollbind 된 상대 창의 스크롤 오프셋을 현재 창과 맞춘다', () => {
    let s = makeSplitState(30);
    for (let i = 0; i < 6; i++) s = handleKey(s, 'Ctrl-e');
    expect(s.viewport!.topRow).toBe(6);
    expect(s.splitPanes![1].viewport!.topRow).toBe(0);

    s = ex(s, 'windo set scb');
    s = ex(s, 'syncbind');
    expect(s.splitPanes![1].viewport!.topRow).toBe(6);
  });
});
