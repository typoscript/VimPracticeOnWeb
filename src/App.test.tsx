import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App Component with Keyboard Navigation', () => {
  it('renders application title, editor container, and status bar', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /VimPracticeOnWeb/i })).toBeInTheDocument();
    expect(screen.getByTestId('editor-container')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    expect(screen.getByTestId('status-mode')).toHaveTextContent('NORMAL');
    expect(screen.getByTestId('status-cursor-pos')).toHaveTextContent('1:1');
  });

  it('moves cursor and updates status bar on keydown events (l, j, h, k, $, 0, gg)', () => {
    render(<App />);

    const cursorPos = screen.getByTestId('status-cursor-pos');
    expect(cursorPos).toHaveTextContent('1:1');

    // l 누름 -> 1:2
    fireEvent.keyDown(window, { key: 'l' });
    expect(cursorPos).toHaveTextContent('1:2');

    // j 누름 -> 2번째 줄 -> 2:2
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('2:2');

    // j 누름 -> 3번째 줄 -> 3:2
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('3:2');

    // $ 누름 -> 3번째 줄 맨 끝 문자 -> 3:30
    fireEvent.keyDown(window, { key: '$' });
    expect(cursorPos).toHaveTextContent('3:30');

    // 0 누름 -> 줄 맨 앞
    fireEvent.keyDown(window, { key: '0' });
    expect(cursorPos).toHaveTextContent('3:1');

    // gg 누름 -> 첫 줄 맨 앞
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByTestId('status-pending-keys')).toHaveTextContent('g');
    fireEvent.keyDown(window, { key: 'g' });
    expect(cursorPos).toHaveTextContent('1:1');
    expect(screen.queryByTestId('status-pending-keys')).not.toBeInTheDocument();
  });

  it('completes lesson 1 upon reaching target cursor and advances to lesson 2', () => {
    render(<App />);

    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 1');
    expect(screen.getByText('진행 중')).toBeInTheDocument();

    // 레슨 1 목표: line 2, col 13
    // 아래로 2번 이동 (line 2)
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'j' });

    // 오른쪽으로 13번 이동 (col 13)
    for (let i = 0; i < 13; i++) {
      fireEvent.keyDown(window, { key: 'l' });
    }

    // 성공 상태 확인
    expect(screen.getByTestId('mission-completed-badge')).toHaveTextContent('✓ 성공!');
    expect(screen.getByTestId('mission-success-banner')).toBeInTheDocument();

    // 다음 레슨 도전하기 클릭
    const nextBtn = screen.getByRole('button', { name: /다음 레슨 도전하기/i });
    fireEvent.click(nextBtn);

    // 레슨 2로 전환 확인
    expect(screen.getByTestId('mission-title')).toHaveTextContent('레슨 2');
    expect(screen.getByTestId('status-filename')).toHaveTextContent('lesson_2.txt');
  });

  it('enters INSERT mode, types text, and returns to NORMAL mode with Escape', () => {
    render(<App />);

    const statusMode = screen.getByTestId('status-mode');
    const cursorPos = screen.getByTestId('status-cursor-pos');

    expect(statusMode).toHaveTextContent('NORMAL');

    // i 누름 -> INSERT 모드 진입
    fireEvent.keyDown(window, { key: 'i' });
    expect(statusMode).toHaveTextContent('INSERT');

    // 'H', 'i' 입력
    fireEvent.keyDown(window, { key: 'H' });
    fireEvent.keyDown(window, { key: 'i' });
    expect(cursorPos).toHaveTextContent('1:3');

    // 첫 번째 줄에 'HiWelcome...' 포함 확인
    const row1 = screen.getByTestId('editor-row-1');
    expect(row1.textContent).toContain('HiWelcome');

    // Escape 누름 -> NORMAL 모드 복귀 (커서 1칸 좌측 보정)
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(statusMode).toHaveTextContent('NORMAL');
    expect(cursorPos).toHaveTextContent('1:2');

    // x 누름 -> 현재 커서 위치의 문자('i') 삭제
    fireEvent.keyDown(window, { key: 'x' });
    expect(row1.textContent).toContain('HWelcome');
  });
});
