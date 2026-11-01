import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BYOCModal } from './BYOCModal';

describe('BYOCModal Component', () => {
  it('does not render when isOpen is false', () => {
    render(
      <BYOCModal
        isOpen={false}
        onClose={vi.fn()}
        onStartMission={vi.fn()}
      />
    );
    expect(screen.queryByTestId('byoc-modal-overlay')).not.toBeInTheDocument();
  });

  it('renders modal with presets, textarea, detected rules, and preview when isOpen is true', () => {
    render(
      <BYOCModal
        isOpen={true}
        onClose={vi.fn()}
        onStartMission={vi.fn()}
      />
    );

    expect(screen.getByTestId('byoc-modal-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-code-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-rules-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-selected-rule-card')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-preview-initial')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-preview-target')).toBeInTheDocument();
  });

  it('updates analysis when typing into textarea or clicking presets', () => {
    render(
      <BYOCModal
        isOpen={true}
        onClose={vi.fn()}
        onStartMission={vi.fn()}
      />
    );

    const textarea = screen.getByTestId('byoc-code-textarea');
    fireEvent.change(textarea, { target: { value: 'var count = 10;' } });

    expect(screen.getByTestId('byoc-rule-tab-var_to_const')).toBeInTheDocument();
    expect(screen.getByTestId('byoc-preview-target')).toHaveTextContent('const count = 10;');

    // Click React preset
    const reactPresetBtn = screen.getByTestId('byoc-preset-React 이벤트 핸들러');
    fireEvent.click(reactPresetBtn);

    expect((textarea as HTMLTextAreaElement).value).toContain('handleClick');
  });

  it('calls onStartMission with selected mission data and closes modal', () => {
    const onStartMission = vi.fn();
    const onClose = vi.fn();

    render(
      <BYOCModal
        isOpen={true}
        initialCode="var token = 'xyz';"
        onClose={onClose}
        onStartMission={onStartMission}
      />
    );

    const startBtn = screen.getByTestId('byoc-start-btn');
    fireEvent.click(startBtn);

    expect(onStartMission).toHaveBeenCalledTimes(1);
    const calledArg = onStartMission.mock.calls[0][0];
    expect(calledArg.initialText).toBe("var token = 'xyz';");
    expect(calledArg.targetText).toContain('const');
    expect(calledArg.par).toBeGreaterThan(0);
    expect(calledArg.hint).toBeDefined();

    expect(onClose).toHaveBeenCalled();
  });
});
