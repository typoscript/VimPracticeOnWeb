import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';

describe('StatusBar Component', () => {
  it('renders mode badge and 1-indexed cursor position correctly', () => {
    render(<StatusBar mode="NORMAL" cursor={{ line: 2, col: 4 }} />);

    const modeBadge = screen.getByTestId('status-mode');
    expect(modeBadge).toHaveTextContent('NORMAL');
    expect(modeBadge).toHaveClass('mode-normal');

    const cursorPos = screen.getByTestId('status-cursor-pos');
    // line 2 -> 3, col 4 -> 5
    expect(cursorPos).toHaveTextContent('3:5');
  });

  it('renders different modes properly', () => {
    const { rerender } = render(<StatusBar mode="INSERT" cursor={{ line: 0, col: 0 }} />);
    expect(screen.getByTestId('status-mode')).toHaveTextContent('INSERT');
    expect(screen.getByTestId('status-mode')).toHaveClass('mode-insert');

    rerender(<StatusBar mode="VISUAL" cursor={{ line: 0, col: 0 }} />);
    expect(screen.getByTestId('status-mode')).toHaveTextContent('VISUAL');
    expect(screen.getByTestId('status-mode')).toHaveClass('mode-visual');

    rerender(<StatusBar mode="COMMAND" cursor={{ line: 0, col: 0 }} />);
    expect(screen.getByTestId('status-mode')).toHaveTextContent('COMMAND');
    expect(screen.getByTestId('status-mode')).toHaveClass('mode-command');
  });
});
