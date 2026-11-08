import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarksJumpVisualizer } from './MarksJumpVisualizer';

describe('MarksJumpVisualizer Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    marks: {
      a: { row: 1, col: 4 },
      B: { row: 3, col: 0, filename: 'source.ts' },
      "'": { row: 0, col: 2 },
    },
    jumpList: [
      { row: 0, col: 0 },
      { row: 2, col: 4 },
      { row: 4, col: 2 },
    ],
    jumpIndex: 1,
    lines: [
      'import React from "react";',
      'const a = 10;',
      'export function add(x, y) {',
      '  return x + y;',
      '}',
    ],
    currentCursor: { line: 1, col: 4 },
    primaryFilename: 'app.ts',
    onJumpToMark: vi.fn(),
    onDeleteMark: vi.fn(),
    onDeleteAllLocalMarks: vi.fn(),
    onJumpToIndex: vi.fn(),
    onJumpOlder: vi.fn(),
    onJumpNewer: vi.fn(),
    onClearJumps: vi.fn(),
    onSetMark: vi.fn(),
    onJumpToLine: vi.fn(),
  };

  it('isOpen이 false이면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<MarksJumpVisualizer {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('마크 탭에서 로컬/전역/특수 마크가 올바르게 표시된다', () => {
    render(<MarksJumpVisualizer {...defaultProps} />);

    expect(screen.getByTestId('marks-jump-visualizer')).toBeInTheDocument();
    expect(screen.getByText(/마크 & 점프 리스트/i)).toBeInTheDocument();

    // 마크 목록 아이템 확인
    expect(screen.getByTestId('mark-item-a')).toBeInTheDocument();
    expect(screen.getByTestId('mark-item-B')).toBeInTheDocument();
    expect(screen.getByTestId('mark-item-\'')).toBeInTheDocument();

    // 줄 미리보기 텍스트 확인
    expect(screen.getByText('const a = 10;')).toBeInTheDocument();
    expect(screen.getByText('return x + y;')).toBeInTheDocument();
  });

  it('마크 클릭 시 onJumpToMark 콜백이 호출된다', () => {
    const onJumpToMark = vi.fn();
    render(<MarksJumpVisualizer {...defaultProps} onJumpToMark={onJumpToMark} />);

    const jumpBtn = screen.getByTestId('jump-mark-btn-a');
    fireEvent.click(jumpBtn);
    expect(onJumpToMark).toHaveBeenCalledWith('a');

    const markBadge = screen.getByTestId('jump-mark-badge-B');
    fireEvent.click(markBadge);
    expect(onJumpToMark).toHaveBeenCalledWith('B');
  });

  it('마크 삭제 및 전체 로컬 마크 삭제 버튼이 동작한다', () => {
    const onDeleteMark = vi.fn();
    const onDeleteAllLocalMarks = vi.fn();
    render(
      <MarksJumpVisualizer
        {...defaultProps}
        onDeleteMark={onDeleteMark}
        onDeleteAllLocalMarks={onDeleteAllLocalMarks}
      />
    );

    const deleteBtn = screen.getByTestId('delete-mark-btn-a');
    fireEvent.click(deleteBtn);
    expect(onDeleteMark).toHaveBeenCalledWith('a');

    const delAllBtn = screen.getByTestId('delmarks-all-btn');
    fireEvent.click(delAllBtn);
    expect(onDeleteAllLocalMarks).toHaveBeenCalled();
  });

  it('점프 리스트 탭 전환 및 점프 제어 버튼이 동작한다', () => {
    const onJumpOlder = vi.fn();
    const onJumpNewer = vi.fn();
    const onClearJumps = vi.fn();
    const onJumpToIndex = vi.fn();

    render(
      <MarksJumpVisualizer
        {...defaultProps}
        onJumpOlder={onJumpOlder}
        onJumpNewer={onJumpNewer}
        onClearJumps={onClearJumps}
        onJumpToIndex={onJumpToIndex}
      />
    );

    // 점프 리스트 탭 클릭
    const jumpsTab = screen.getByTestId('tab-jumps-btn');
    fireEvent.click(jumpsTab);

    // 점프 아이템들 렌더링 확인
    expect(screen.getByTestId('jump-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('jump-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('jump-item-2')).toBeInTheDocument();

    // 현재 포인터 위치(1)에 '현재' 뱃지 표시 확인
    expect(screen.getByText(/▶ 현재/)).toBeInTheDocument();

    // 과거 점프 버튼 클릭
    fireEvent.click(screen.getByTestId('jump-older-btn'));
    expect(onJumpOlder).toHaveBeenCalled();

    // 최신 점프 버튼 클릭
    fireEvent.click(screen.getByTestId('jump-newer-btn'));
    expect(onJumpNewer).toHaveBeenCalled();

    // 초기화 버튼 클릭
    fireEvent.click(screen.getByTestId('clear-jumps-btn'));
    expect(onClearJumps).toHaveBeenCalled();

    // 특정 항목 점프 클릭
    fireEvent.click(screen.getByTestId('jump-to-index-btn-0'));
    expect(onJumpToIndex).toHaveBeenCalledWith(0);
  });

  it('시각 분포도(Minimap) 탭 전환 시 에디터 라인별 마크/점프가 시각화된다', () => {
    const onJumpToLine = vi.fn();
    render(<MarksJumpVisualizer {...defaultProps} onJumpToLine={onJumpToLine} />);

    // 시각 분포도 탭 클릭
    const minimapTab = screen.getByTestId('tab-minimap-btn');
    fireEvent.click(minimapTab);

    expect(screen.getByTestId('minimap-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('minimap-row-2')).toBeInTheDocument();

    // 행 클릭 시 해당 라인으로 점프 콜백 호출
    fireEvent.click(screen.getByTestId('minimap-row-2'));
    expect(onJumpToLine).toHaveBeenCalledWith(1);
  });

  it('닫기 버튼 클릭 시 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(<MarksJumpVisualizer {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('close-marks-visualizer-btn'));
    expect(onClose).toHaveBeenCalled();
  });
});
