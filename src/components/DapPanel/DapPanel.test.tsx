import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DapPanel } from './DapPanel';
import { Editor } from '../Editor/Editor';
import { createVimState, runExCommand } from '../../vim-engine';

describe('DapPanel & Editor 머지 충돌/DAP 시각화', () => {
  it('DapPanel 이 지역 변수, 감시식 입력, 콜스택·중단점·콘솔 탭과 컨트롤 버튼을 렌더링한다', () => {
    let state = createVimState(
      [
        'const subtotal = 100;',
        'const discount = 20;',
        'const finalPrice = subtotal + discount;',
        'console.log(finalPrice);',
      ],
      { line: 2, col: 0 },
      { primaryFilename: 'src/discount.ts' }
    );
    state = runExCommand(state, 'DapBp');
    state = runExCommand(state, 'DapContinue');

    const onStepOver = vi.fn();
    const onAddWatch = vi.fn();
    const onTerminate = vi.fn();
    const onJumpBp = vi.fn();

    render(
      <DapPanel
        session={state.dapSession!}
        breakpoints={state.dapBreakpoints ?? {}}
        onContinue={vi.fn()}
        onStepOver={onStepOver}
        onStepInto={vi.fn()}
        onStepOut={vi.fn()}
        onToggleBreakpoint={vi.fn()}
        onTerminate={onTerminate}
        onSelectFrame={vi.fn()}
        onAddWatch={onAddWatch}
        onRemoveWatch={vi.fn()}
        onJumpBreakpoint={onJumpBp}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('dap-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dap-var-finalPrice')).toHaveTextContent('120');

    fireEvent.click(screen.getByTestId('dap-btn-step-over'));
    expect(onStepOver).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByTestId('dap-watch-input'), {
      target: { value: 'subtotal - discount' },
    });
    fireEvent.submit(screen.getByTestId('dap-watch-input').closest('form')!);
    expect(onAddWatch).toHaveBeenCalledWith('subtotal - discount');

    fireEvent.click(screen.getByTestId('dap-tab-breakpoints'));
    fireEvent.click(screen.getByTestId('dap-bp-row-3'));
    expect(onJumpBp).toHaveBeenCalledWith('src/discount.ts', 2);

    fireEvent.click(screen.getByTestId('dap-btn-stop'));
    expect(onTerminate).toHaveBeenCalledTimes(1);
  });

  it('Editor 가 머지 충돌 하이라이트·인라인 액션과 DAP 거터 중단점·가상 텍스트를 렌더링한다', () => {
    const onChoose = vi.fn();
    const onToggleBp = vi.fn();

    let dapState = createVimState(
      [
        '<<<<<<< HEAD',
        'const a = 1;',
        '=======',
        'const a = 2;',
        '>>>>>>> feat',
      ],
      { line: 0, col: 0 },
      { primaryFilename: 'src/conflict.ts' }
    );
    dapState = runExCommand(dapState, 'DapBp');
    dapState = runExCommand(dapState, 'DapContinue');

    render(
      <Editor
        lines={dapState.lines}
        cursor={dapState.cursor}
        mode="NORMAL"
        primaryFilename="src/conflict.ts"
        onChooseGitConflict={onChoose}
        dapBreakpointLines={dapState.dapBreakpoints?.['src/conflict.ts']}
        dapSession={dapState.dapSession}
        onToggleDapBreakpointLine={onToggleBp}
      />
    );

    expect(screen.getByTestId('editor-row-1')).toHaveClass('git-conflict-marker-ours');
    expect(screen.getByTestId('editor-row-2')).toHaveClass('git-conflict-ours');
    expect(screen.getByTestId('editor-row-4')).toHaveClass('git-conflict-theirs');
    expect(screen.getByTestId('dap-bp-sign-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('git-conflict-choose-theirs-1'));
    expect(onChoose).toHaveBeenCalledWith(0, 'theirs');

    fireEvent.click(screen.getByTestId('dap-bp-sign-1'));
    expect(onToggleBp).toHaveBeenCalledWith(0);
  });
});
