import { describe, it, expect } from 'vitest';
import {
  createVimState,
  sendKeys,
  runExCommand,
  buildUndotreeGraphRows,
  jumpUndoSeq,
  openUndotreePanel,
  closeUndotreePanel,
  toggleUndotreePanel,
} from './index';

describe('mbbill/undotree 스타일 시각적 Undo Tree 패널 (:UndotreeToggle)', () => {
  it(':UndotreeToggle / :Undotree / :UndotreeShow / :UndotreeHide 로 패널을 열고 닫는다', () => {
    let s = createVimState(['alpha', 'beta']);
    expect(s.undotreePanel?.isOpen).toBeFalsy();

    s = runExCommand(s, ':UndotreeToggle');
    expect(s.undotreePanel?.isOpen).toBe(true);
    expect(s.commandMessage).toContain('[Undotree]');

    s = runExCommand(s, ':UndotreeToggle');
    expect(s.undotreePanel).toBeNull();

    s = runExCommand(s, ':UndotreeShow');
    expect(s.undotreePanel?.isOpen).toBe(true);

    s = runExCommand(s, ':UndotreeHide');
    expect(s.undotreePanel).toBeNull();

    s = runExCommand(s, ':Undotree');
    expect(s.undotreePanel?.isOpen).toBe(true);
  });

  it('분기(branch)가 생긴 Undo 히스토리에서 멀티 브랜치 그래프 행과 Diff 델타를 정확히 계산한다', () => {
    let s = createVimState(['base line']);
    // Branch 1: base -> branchA
    s = sendKeys(s, 'A_A<Esc>');
    expect(s.lines).toEqual(['base line_A']);

    // Undo back to root (#0), then create Branch 2: base -> branchB
    s = sendKeys(s, 'u');
    expect(s.lines).toEqual(['base line']);
    s = sendKeys(s, 'A_B<Esc>');
    expect(s.lines).toEqual(['base line_B']);

    const rows = buildUndotreeGraphRows(s);
    // 최신(seq 2)이 최상단, 루트(seq 0)가 최하단
    expect(rows.map((r) => r.seq)).toEqual([2, 1, 0]);
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].branchCol).toBe(1); // 두 번째 브랜치 열
    expect(rows[1].branchCol).toBe(0); // 첫 번째 브랜치 열
    expect(rows[2].branchCol).toBe(0); // 루트
    expect(rows[0].addedCount).toBe(1);
    expect(rows[0].removedCount).toBe(1);

    // 이전 브랜치(#1)로 직접 점프하면 분기된 내용 복원
    const jumped = jumpUndoSeq(s, 1);
    expect(jumped.lines).toEqual(['base line_A']);
    expect(jumped.currentUndoSeq).toBe(1);
  });

  it('공개 헬퍼 openUndotreePanel / closeUndotreePanel / toggleUndotreePanel 이 불변 상태로 동작한다', () => {
    const base = createVimState(['hello']);
    const opened = openUndotreePanel(base);
    expect(opened.undotreePanel?.isOpen).toBe(true);
    expect(base.undotreePanel).toBeUndefined();

    const toggledOff = toggleUndotreePanel(opened);
    expect(toggledOff.undotreePanel).toBeNull();

    const closedAgain = closeUndotreePanel(opened);
    expect(closedAgain.undotreePanel).toBeNull();
  });
});
