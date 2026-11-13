import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpViewer } from './HelpViewer';
import { HelpSession } from '../../vim-engine';

describe('HelpViewer 컴포넌트', () => {
  const mockSession: HelpSession = {
    isOpen: true,
    topic: 'help.txt',
    title: 'Vim 메인 도움말 색인',
    lines: [
      '*help.txt* 메인 도움말',
      '탐색 가이드:',
      '  - |motion|: 이동 모션',
      '  - |change|: 변경 연산자',
    ],
    cursor: { line: 0, col: 0 },
    tagStack: [],
  };

  it('도움말 헤더와 본문 라인이 정상 렌더링되어야 한다', () => {
    render(
      <HelpViewer
        session={mockSession}
        onJumpTag={vi.fn()}
        onPopTag={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getAllByText('help.txt').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Vim 메인 도움말 색인')).toBeInTheDocument();
    expect(screen.getByText(/탐색 가이드:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '|motion|' })).toBeInTheDocument();
  });

  it('태그 링크 클릭 시 onJumpTag 콜백이 호출되어야 한다', () => {
    const handleJumpTag = vi.fn();
    render(
      <HelpViewer
        session={mockSession}
        onJumpTag={handleJumpTag}
        onPopTag={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const motionTagBtn = screen.getByRole('button', { name: '|motion|' });
    fireEvent.click(motionTagBtn);

    expect(handleJumpTag).toHaveBeenCalledWith('motion');
  });

  it('tagStack이 있을 때 뒤로 가기 버튼이 나타나고 클릭 시 onPopTag가 호출되어야 한다', () => {
    const handlePopTag = vi.fn();
    const sessionWithStack: HelpSession = {
      ...mockSession,
      topic: 'motion.txt',
      title: '커서 이동 모션',
      tagStack: [{ topic: 'help.txt', cursor: { line: 2, col: 0 } }],
    };

    render(
      <HelpViewer
        session={sessionWithStack}
        onJumpTag={vi.fn()}
        onPopTag={handlePopTag}
        onClose={vi.fn()}
      />
    );

    const backBtn = screen.getByText(/뒤로/);
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(handlePopTag).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼 클릭 시 onClose 콜백이 호출되어야 한다', () => {
    const handleClose = vi.fn();
    render(
      <HelpViewer
        session={mockSession}
        onJumpTag={vi.fn()}
        onPopTag={vi.fn()}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
