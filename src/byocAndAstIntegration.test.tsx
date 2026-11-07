import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';

describe('Vim Grammar AST Inspector & BYOC Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggles Grammar AST Inspector and synchronizes with editor typing', () => {
    render(<App />);

    // Initially AST viewer is hidden (default false)
    expect(screen.queryByTestId('vim-grammar-ast-viewer')).not.toBeInTheDocument();

    // Toggle button in toolbar
    const toggleAstBtn = screen.getByTestId('toggle-grammar-ast-btn');
    expect(toggleAstBtn).toHaveTextContent('🧩 문법 AST: OFF');

    // Click to turn ON
    fireEvent.click(toggleAstBtn);
    expect(toggleAstBtn).toHaveTextContent('🧩 문법 AST: ON');
    expect(screen.getByTestId('vim-grammar-ast-viewer')).toBeInTheDocument();

    // Type '2' then 'd' in editor
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });

    // The AST Inspector should reflect operator pending state
    expect(screen.getByTestId('ast-candidates-guide')).toBeInTheDocument();

    // Clicking candidate 'w' from the candidate guide sends 'w' to editor, completing '2dw'
    const wCandidateBtn = screen.getByTestId('candidate-btn-w');
    fireEvent.click(wCandidateBtn);

    // After completing command, candidates guide should close or reset
    expect(screen.queryByTestId('ast-candidates-guide')).not.toBeInTheDocument();
  });

  it('opens BYOC Modal from Sandbox and launches custom refactoring challenge with diff', async () => {
    render(<App />);

    // Switch to Sandbox tab
    const sandboxTabBtn = screen.getByTestId('tab-sandbox-btn');
    fireEvent.click(sandboxTabBtn);

    // Check BYOC button in sandbox panel
    const openByocBtn = screen.getByTestId('open-byoc-modal-btn');
    expect(openByocBtn).toBeInTheDocument();

    // Open BYOC Modal
    fireEvent.click(openByocBtn);
    expect(await screen.findByTestId('byoc-modal-overlay')).toBeInTheDocument();

    // Select the React preset
    const reactPresetBtn = screen.getByTestId('byoc-preset-React 이벤트 핸들러');
    fireEvent.click(reactPresetBtn);

    // Start mission
    const startMissionBtn = screen.getByTestId('byoc-start-btn');
    fireEvent.click(startMissionBtn);

    // Modal should close
    expect(screen.queryByTestId('byoc-modal-overlay')).not.toBeInTheDocument();

    // Tab should automatically switch to custom mission
    expect(screen.getByTestId('tab-custom-btn')).toHaveClass('active');

    // Diff view should automatically be turned ON
    const diffToggleBtn = screen.getByTestId('toggle-diff-view-btn');
    expect(diffToggleBtn).toHaveTextContent('🎯 목표 Diff: ON');
    expect(screen.getByTestId('diff-viewer')).toBeInTheDocument();
  });
});
