import { describe, it, expect } from 'vitest';
import { createVimState, sendKeys, handleKey, runExCommand } from './index';

describe('mini.move 줄·선택 블록 즉시 이동 (Alt-h/j/k/l) & :ZenMode', () => {
  it('NORMAL 모드에서 Alt-j / Alt-k 로 현재 줄을 상하 이동하고 도트(.) 반복 및 Undo 를 지원한다', () => {
    let s = createVimState(['first', 'second', 'third'], { line: 0, col: 2 });
    s = handleKey(s, 'Alt-j');
    expect(s.lines).toEqual(['second', 'first', 'third']);
    expect(s.cursor).toEqual({ line: 1, col: 2 });

    // . 반복으로 한 줄 더 아래로 이동
    s = handleKey(s, '.');
    expect(s.lines).toEqual(['second', 'third', 'first']);
    expect(s.cursor).toEqual({ line: 2, col: 2 });

    // 맨 아래 줄에서 Alt-j 는 bell
    const bottomFail = handleKey(s, 'Alt-j');
    expect(bottomFail.bell).toBe(true);

    // <A-k> 문자열 표기로 위로 2칸 이동
    s = sendKeys(s, '2<A-k>');
    expect(s.lines).toEqual(['first', 'second', 'third']);
    expect(s.cursor).toEqual({ line: 0, col: 2 });

    // Undo 복원
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(['second', 'third', 'first']);
  });

  it('NORMAL 모드에서 Alt-l / Alt-h 로 커서 상대 위치를 유지하며 들여쓰기를 이동한다', () => {
    let s = createVimState(['const x = 1;'], { line: 0, col: 6 });
    s = handleKey(s, 'Alt-l');
    expect(s.lines).toEqual(['  const x = 1;']);
    expect(s.cursor).toEqual({ line: 0, col: 8 });

    s = handleKey(s, 'Alt-h');
    expect(s.lines).toEqual(['const x = 1;']);
    expect(s.cursor).toEqual({ line: 0, col: 6 });
  });

  it('VISUAL / VISUAL_LINE 모드에서 선택 영역을 유지한 채 다중 줄 블록을 상하·좌우로 이동한다', () => {
    let s = createVimState(['top', 'blockA', 'blockB', 'bottom'], { line: 1, col: 0 });
    s = sendKeys(s, 'Vj<A-j>');
    expect(s.lines).toEqual(['top', 'bottom', 'blockA', 'blockB']);
    expect(s.mode).toBe('VISUAL_LINE');
    expect(s.visualAnchor?.line).toBe(2);
    expect(s.cursor.line).toBe(3);

    // 선택 상태 그대로 들여쓰기 오른쪽 이동 후 위로 이동
    s = sendKeys(s, '<A-l><A-k>');
    expect(s.lines).toEqual(['top', '  blockA', '  blockB', 'bottom']);
    expect(s.mode).toBe('VISUAL_LINE');
  });

  it(':ZenMode / :Zen [on|off|toggle] 명령으로 집중 모드를 제어한다', () => {
    let s = createVimState(['hello']);
    expect(s.zenMode).toBeFalsy();

    s = runExCommand(s, ':ZenMode');
    expect(s.zenMode).toBe(true);
    expect(s.commandMessage).toContain('[ZenMode]');

    s = runExCommand(s, ':Zen off');
    expect(s.zenMode).toBe(false);

    s = runExCommand(s, ':ZenMode on');
    expect(s.zenMode).toBe(true);
  });
});
