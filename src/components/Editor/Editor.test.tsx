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

  it('상대 라인 번호(relativeLineNumbers) 활성화 시 커서 줄은 실제 줄 번호, 다른 줄은 상대 거리를 렌더링한다', () => {
    const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'];
    // 커서가 3번째 줄 (line index 2, 1-based: 3)에 위치
    render(
      <Editor
        lines={lines}
        cursor={{ line: 2, col: 0 }}
        mode="NORMAL"
        relativeLineNumbers={true}
      />
    );

    // 줄 1: 거리 Math.abs(0 - 2) = 2
    expect(screen.getByTestId('line-number-1')).toHaveTextContent('2');
    // 줄 2: 거리 Math.abs(1 - 2) = 1
    expect(screen.getByTestId('line-number-2')).toHaveTextContent('1');
    // 줄 3 (커서 줄): 실제 줄 번호 = 3
    expect(screen.getByTestId('line-number-3')).toHaveTextContent('3');
    // 줄 4: 거리 Math.abs(3 - 2) = 1
    expect(screen.getByTestId('line-number-4')).toHaveTextContent('1');
    // 줄 5: 거리 Math.abs(4 - 2) = 2
    expect(screen.getByTestId('line-number-5')).toHaveTextContent('2');
  });
});
