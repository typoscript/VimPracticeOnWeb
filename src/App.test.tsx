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

    // j 누름 -> 빈 줄(2번째 줄) -> 2:1
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('2:1');

    // j 누름 -> 3번째 줄 -> 3:1
    fireEvent.keyDown(window, { key: 'j' });
    expect(cursorPos).toHaveTextContent('3:1');

    // $ 누름 -> 3번째 줄 끝으로 이동 ('Practice your Vim motions and commands directly in the browser.' 길이는 63 -> 3:63)
    fireEvent.keyDown(window, { key: '$' });
    expect(cursorPos).toHaveTextContent('3:63');

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
