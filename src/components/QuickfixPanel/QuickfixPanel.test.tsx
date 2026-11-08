import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickfixPanel } from './QuickfixPanel';
import { QuickfixState } from '../../vim-engine';

describe('QuickfixPanel Component', () => {
  const sampleState: QuickfixState = {
    items: [
      { filename: 'src/main.ts', line: 10, col: 5, text: 'Unexpected token', type: 'E' },
      { filename: 'src/utils.ts', line: 25, col: 2, text: 'Unused variable foo', type: 'W' },
      { filename: 'src/config.ts', line: 42, col: 1, text: 'Consider refactoring', type: 'I' },
    ],
    currentIndex: 1,
    isOpen: true,
    height: 5,
  };

  it('퀵픽스 목록 항목과 헤더 상태를 정확하게 렌더링한다', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickfixPanel
        type="quickfix"
        state={sampleState}
        onJump={onJump}
        onClose={onClose}
      />
    );

    // 퀵픽스 창 및 헤더 확인
    const qfWindow = screen.getByTestId('quickfix-window');
    expect(qfWindow).toBeInTheDocument();
    expect(qfWindow).toHaveClass('quickfix-window-container');
    expect(screen.getByText(/\[Quickfix List\] src\/utils\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 of 3\)/)).toBeInTheDocument();

    // 항목 3개 렌더링 확인
    expect(screen.getByText('Unexpected token')).toBeInTheDocument();
    expect(screen.getByText('Unused variable foo')).toBeInTheDocument();
    expect(screen.getByText('Consider refactoring')).toBeInTheDocument();

    // 2번째 항목(인덱스 1)이 활성 상태(active)인지 확인
    const item1 = screen.getByTestId('quickfix-item-1');
    const item2 = screen.getByTestId('quickfix-item-2');
    expect(item1).not.toHaveClass('active');
    expect(item2).toHaveClass('active');
    expect(item2).toHaveTextContent('▶');

    // 에러/경고/정보 배지 확인
    expect(screen.getByText('[E]')).toBeInTheDocument();
    expect(screen.getByText('[W]')).toBeInTheDocument();
    expect(screen.getByText('[I]')).toBeInTheDocument();
  });

  it('항목 클릭 시 onJump 콜백이 올바른 인덱스와 함께 호출된다', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickfixPanel
        type="quickfix"
        state={sampleState}
        onJump={onJump}
        onClose={onClose}
      />
    );

    // 1번째 항목(인덱스 0) 클릭
    fireEvent.click(screen.getByTestId('quickfix-item-1'));
    expect(onJump).toHaveBeenCalledWith(0);

    // 3번째 항목(인덱스 2) 클릭
    fireEvent.click(screen.getByTestId('quickfix-item-3'));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('닫기 버튼 클릭 시 onClose 콜백이 호출된다', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickfixPanel
        type="quickfix"
        state={sampleState}
        onJump={onJump}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: '✕' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('로케이션 리스트 모드로 렌더링 시 전용 스타일과 testid가 적용된다', () => {
    const onJump = vi.fn();
    const onClose = vi.fn();

    render(
      <QuickfixPanel
        type="locationList"
        state={sampleState}
        onJump={onJump}
        onClose={onClose}
      />
    );

    const locWindow = screen.getByTestId('locationlist-window');
    expect(locWindow).toBeInTheDocument();
    expect(locWindow).toHaveClass('location-list-container');
    expect(screen.getByText('LOCLIST')).toBeInTheDocument();
    expect(screen.getByText(/\[Location List\]/)).toBeInTheDocument();
  });

  it('항목이 비어 있을 때 안내 메시지를 렌더링한다', () => {
    const emptyState: QuickfixState = {
      items: [],
      currentIndex: 0,
      isOpen: true,
    };

    render(
      <QuickfixPanel
        type="quickfix"
        state={emptyState}
        onJump={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/에러 목록이 비어 있습니다/)).toBeInTheDocument();
  });
});
