import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderLineContent, RenderLineOptions } from './EditorLineRenderer';

function renderLine(opts: Partial<RenderLineOptions>) {
  const defaults: RenderLineOptions = {
    text: 'hello world',
    lineIdx: 0,
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    targetCol: null,
    lineMatches: [],
    isFocused: true,
    ...opts,
  };
  return render(<div data-testid="line-wrap">{renderLineContent(defaults)}</div>);
}

describe('EditorLineRenderer', () => {
  it('renders empty line cursor, trailing insert cursor, and listchar EOL indicator', () => {
    const { rerender } = render(<div data-testid="line-wrap">{renderLineContent({
      text: '',
      lineIdx: 0,
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      targetCol: null,
      lineMatches: [],
      isFocused: true,
    })}</div>);
    expect(screen.getByTestId('vim-cursor')).toBeInTheDocument();

    rerender(<div data-testid="line-wrap">{renderLineContent({
      text: '',
      lineIdx: 0,
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      targetCol: null,
      lineMatches: [],
      isFocused: true,
      listMode: true,
      listchars: { eol: '¶', tab: '>-', trail: '•', space: '·', nbsp: '␣' },
    })}</div>);
    expect(screen.getByTestId('listchar-eol')).toHaveTextContent('¶');
  });

  it('renders cursor, target-marker, search-match, and visual-selected-char overlays', () => {
    renderLine({
      text: 'const foo = 1;',
      lineIdx: 0,
      cursor: { line: 0, col: 2 },
      mode: 'VISUAL',
      visualAnchor: { line: 0, col: 0 },
      targetCol: 12,
      lineMatches: [{ line: 0, col: 6, length: 3 }],
    });

    expect(screen.getByTestId('vim-cursor')).toHaveTextContent('n');
    expect(screen.getByTestId('target-marker')).toHaveTextContent('1');
    expect(screen.getAllByTestId('search-match')).toHaveLength(3);
    expect(screen.getAllByTestId('visual-selected-char').length).toBeGreaterThanOrEqual(2);
  });

  it('renders INSERT trailing cursor, spell error underlines, LSP diagnostics, and syntax tokens', () => {
    const { container } = renderLine({
      text: 'const wrng = 1;',
      lineIdx: 0,
      cursor: { line: 0, col: 15 },
      mode: 'INSERT',
      targetCol: null,
      lineMatches: [],
      spellErrors: [{ line: 0, startCol: 6, endCol: 10, word: 'wrng' }],
      lineDiagnostics: [{ id: 'd1', line: 0, col: 0, endCol: 5, severity: 'error', message: 'Err', source: 'ts' }],
      isSyntaxEnabled: true,
      syntaxLanguage: 'typescript',
    });

    expect(screen.getByTestId('vim-cursor')).toBeInTheDocument();
    expect(container.querySelectorAll('.spell-error').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.lsp-diag-error').length).toBeGreaterThan(0);
    expect(container.querySelector('.syn-keyword')).toBeInTheDocument();
  });

  it('renders listchars for tabs, trailing spaces, inner spaces, nbsp, and eol', () => {
    const { container } = renderLine({
      text: '\ta\u00a0b  ',
      lineIdx: 0,
      cursor: { line: 1, col: 0 },
      mode: 'NORMAL',
      targetCol: null,
      lineMatches: [],
      listMode: true,
      tabstop: 4,
      listchars: { tab: '▸ ', trail: '•', space: '·', nbsp: '␣', eol: '¬' },
    });

    expect(container.textContent).toContain('▸   ');
    expect(container.textContent).toContain('␣');
    expect(container.textContent).toContain('••');
    expect(screen.getByTestId('listchar-eol')).toHaveTextContent('¬');
  });
});
