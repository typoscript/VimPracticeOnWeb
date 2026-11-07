import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

  it('포커스 이탈(isFocused=false) 시 아웃라인 커서와 블러 오버레이 배너를 렌더링한다', () => {
    const lines = ['Vim editor text'];
    render(
      <Editor
        lines={lines}
        cursor={{ line: 0, col: 0 }}
        mode="NORMAL"
        isFocused={false}
      />
    );

    const cursorEl = screen.getByTestId('vim-cursor');
    expect(cursorEl).toHaveClass('cursor-unfocused');

    const blurOverlay = screen.getByTestId('editor-blur-overlay');
    expect(blurOverlay).toBeInTheDocument();
    expect(blurOverlay).toHaveTextContent('클릭하여 에디터 포커스 활성화');
  });

  it('마크가 설정된 줄의 Gutter(줄 번호 영역)에 마크 배지([a])를 시각적으로 렌더링한다', () => {
    const lines = ['First line', 'Second line with mark', 'Third line'];
    render(
      <Editor
        lines={lines}
        cursor={{ line: 0, col: 0 }}
        mode="NORMAL"
        marks={{
          a: { row: 1, col: 5 },
          b: { row: 1, col: 10 },
        }}
      />
    );

    const markBadgeA = screen.getByTestId('mark-badge-a');
    expect(markBadgeA).toBeInTheDocument();
    expect(markBadgeA).toHaveTextContent('[a]');

    const markBadgeB = screen.getByTestId('mark-badge-b');
    expect(markBadgeB).toBeInTheDocument();
    expect(markBadgeB).toHaveTextContent('[b]');

    const line2 = screen.getByTestId('line-number-2');
    expect(line2).toContainElement(markBadgeA);
    expect(line2).toContainElement(markBadgeB);
  });

  it('코드 폴딩(closed fold) 시 해당 구간을 숨기고 축약 요약 바(+--- [3 lines folded] ---)를 렌더링한다', () => {
    const lines = [
      'function test() {',
      '  const a = 1;',
      '  const b = 2;',
      '  return a + b;',
      '}',
      'console.log(test());',
    ];

    render(
      <Editor
        lines={lines}
        cursor={{ line: 1, col: 0 }}
        mode="NORMAL"
        folds={[{ startRow: 1, endRow: 3, closed: true }]}
      />
    );

    // 접힌 요약 텍스트 검증
    const foldSummary = screen.getByTestId('fold-summary-2');
    expect(foldSummary).toBeInTheDocument();
    expect(foldSummary).toHaveTextContent('+--- [3 lines folded] ---');

    // 숨겨진 행(3번, 4번 줄)은 렌더링되지 않음
    expect(screen.queryByTestId('editor-row-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-row-4')).not.toBeInTheDocument();

    // 0번 줄(1번 라인)과 4번 줄(5번 라인)은 정상 렌더링됨
    expect(screen.getByTestId('editor-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('editor-row-5')).toBeInTheDocument();
  });

  it('bellSignal 값이 바뀌면 visualbell 깜빡임 클래스를 잠깐 적용한다', async () => {
    const props = { lines: ['abc'], cursor: { line: 0, col: 0 }, mode: 'NORMAL' as const };
    const { rerender } = render(<Editor {...props} bellSignal={0} />);
    const container = screen.getByTestId('editor-container');
    expect(container).not.toHaveClass('editor-bell');

    rerender(<Editor {...props} bellSignal={1} />);
    await waitFor(() => expect(container).toHaveClass('editor-bell'));
    await waitFor(() => expect(container).not.toHaveClass('editor-bell'));
  });
});
