import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VimGrammarASTViewer } from './VimGrammarASTViewer';

describe('VimGrammarASTViewer Component', () => {
  it('renders initial AST pipeline and natural language explanation for compound command', () => {
    render(<VimGrammarASTViewer />);

    expect(screen.getByTestId('vim-grammar-ast-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('ast-pipeline-container')).toBeInTheDocument();

    // Default is "a2d3aw
    const explanation = screen.getByTestId('ast-explanation-text');
    expect(explanation).toHaveTextContent('레지스터 a');
    expect(explanation).toHaveTextContent('6개(2×3)의');
    expect(explanation).toHaveTextContent('단어(주변 공백 포함)');
    expect(explanation).toHaveTextContent('잘라내어 저장합니다');

    // 5 nodes rendered
    expect(screen.getByTestId('ast-node-0')).toHaveTextContent('"a');
    expect(screen.getByTestId('ast-node-1')).toHaveTextContent('2');
    expect(screen.getByTestId('ast-node-2')).toHaveTextContent('d');
    expect(screen.getByTestId('ast-node-3')).toHaveTextContent('3');
    expect(screen.getByTestId('ast-node-4')).toHaveTextContent('aw');
  });

  it('updates AST tree when clicking preset examples', () => {
    render(<VimGrammarASTViewer />);

    const presetBtn = screen.getByTestId('preset-chip-3ciquote');
    fireEvent.click(presetBtn);

    const input = screen.getByTestId('ast-command-input') as HTMLInputElement;
    expect(input.value).toBe('3ci"');

    const explanation = screen.getByTestId('ast-explanation-text');
    expect(explanation).toHaveTextContent('3개의');
    expect(explanation).toHaveTextContent('큰따옴표("...")');
    expect(explanation).toHaveTextContent('INSERT 모드로 전환');
  });

  it('displays candidate guide when command is in Operator-Pending state', () => {
    const onSelectCandidate = vi.fn();
    render(<VimGrammarASTViewer onSelectCandidate={onSelectCandidate} />);

    const input = screen.getByTestId('ast-command-input');
    fireEvent.change(input, { target: { value: '2d' } });

    // Candidates guide should now be visible
    expect(screen.getByTestId('ast-candidates-guide')).toBeInTheDocument();
    expect(screen.getByText(/연산자 대기 상태/)).toBeInTheDocument();

    // Candidate buttons like iw, aw, w, $
    const iwBtn = screen.getByTestId('candidate-btn-iw');
    expect(iwBtn).toBeInTheDocument();

    // Click candidate button
    fireEvent.click(iwBtn);
    expect(onSelectCandidate).toHaveBeenCalledWith('iw');

    // Input should now be updated to '2diw' and guide hidden
    const updatedInput = screen.getByTestId('ast-command-input') as HTMLInputElement;
    expect(updatedInput.value).toBe('2diw');
    expect(screen.queryByTestId('ast-candidates-guide')).not.toBeInTheDocument();
  });

  it('syncs automatically with currentKeySequence and activeRegister props from editor', () => {
    const { rerender } = render(
      <VimGrammarASTViewer currentKeySequence="d" activeRegister="b" />
    );

    const input = screen.getByTestId('ast-command-input') as HTMLInputElement;
    expect(input.value).toBe('"bd');

    const explanation = screen.getByTestId('ast-explanation-text');
    expect(explanation).toHaveTextContent("레지스터 'b'");
    expect(explanation).toHaveTextContent('삭제 (Delete) 대기 중');

    // User types 'w' in editor
    rerender(<VimGrammarASTViewer currentKeySequence="dw" activeRegister="b" />);
    const updatedInput = screen.getByTestId('ast-command-input') as HTMLInputElement;
    expect(updatedInput.value).toBe('"bdw');
  });
});
