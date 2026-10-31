import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Editor } from './Editor';

describe('Editor Component', () => {
  it('renders buffer lines with 1-based line numbers', () => {
    const lines = ['First line', 'Second line', 'Third line'];
    render(<Editor lines={lines} cursor={{ line: 0, col: 0 }} mode="NORMAL" />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    const row1 = screen.getByTestId('editor-row-1');
    expect(row1.textContent).toContain('First line');

    expect(screen.getByText('Second line')).toBeInTheDocument();
    expect(screen.getByText('Third line')).toBeInTheDocument();
  });

  it('renders the cursor at the designated position', () => {
    const lines = ['Hello Vim'];
    render(<Editor lines={lines} cursor={{ line: 0, col: 1 }} mode="NORMAL" />);

    const cursorEl = screen.getByTestId('vim-cursor');
    expect(cursorEl).toBeInTheDocument();
    expect(cursorEl).toHaveTextContent('e');
    expect(cursorEl).toHaveClass('cursor-normal');
  });

  it('renders empty line with non-breaking space for cursor when buffer is empty', () => {
    const lines = [''];
    render(<Editor lines={lines} cursor={{ line: 0, col: 0 }} mode="INSERT" />);

    const cursorEl = screen.getByTestId('vim-cursor');
    expect(cursorEl).toBeInTheDocument();
    expect(cursorEl).toHaveClass('cursor-insert');
  });
});
