import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffViewer } from './DiffViewer';

describe('DiffViewer Component', () => {
  it('targetLines가 없을 때 위치 이동 미션 안내를 표시한다', () => {
    render(<DiffViewer currentLines={['Line 1', 'Line 2']} />);

    expect(screen.getByText('위치 이동 미션')).toBeInTheDocument();
    expect(screen.getByText(/이 레슨은 텍스트 편집 없이/)).toBeInTheDocument();
  });

  it('현재 텍스트와 목표 텍스트의 불일치 줄을 감지하고 상태 배지를 업데이트한다', () => {
    const currentLines = ['Viiim is fast', 'A cute cwt'];
    const targetLines = ['Vim is fast', 'A cute cat'];

    render(<DiffViewer currentLines={currentLines} targetLines={targetLines} />);

    expect(screen.getByTestId('diff-status-badge')).toHaveTextContent('⚠️ 2줄 수정 필요');
    expect(screen.getByTestId('diff-cur-line-1')).toHaveClass('diff-different');
    expect(screen.getByTestId('diff-tgt-line-1')).toHaveClass('diff-target');
  });

  it('텍스트가 완전히 일치하면 일치 완료 배지를 렌더링한다', () => {
    const lines = ['Vim is fast', 'A cute cat'];

    render(<DiffViewer currentLines={lines} targetLines={lines} />);

    expect(screen.getByTestId('diff-status-badge')).toHaveTextContent('✨ 텍스트 일치');
    expect(screen.getByTestId('diff-cur-line-1')).toHaveClass('match');
    expect(screen.getByTestId('diff-tgt-line-1')).toHaveClass('match');
  });

  it('줄 수가 다른 경우 (삭제 필요) 올바르게 표시한다', () => {
    const currentLines = ['Keep this', 'DELETE ME', 'Keep too'];
    const targetLines = ['Keep this', 'Keep too'];

    render(<DiffViewer currentLines={currentLines} targetLines={targetLines} />);

    expect(screen.getByTestId('diff-cur-line-2')).toHaveClass('diff-different');
    expect(screen.getByTestId('diff-tgt-line-3')).toBeInTheDocument();
  });
});
