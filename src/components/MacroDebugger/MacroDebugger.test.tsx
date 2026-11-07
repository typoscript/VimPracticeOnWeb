import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MacroDebugger, formatMacroKey } from './MacroDebugger';
import type { VimEditorState } from '../../types/vim';

function createRecordedState(): VimEditorState {
  return {
    lines: ['apple', 'banana', 'cherry'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    registers: {
      a: { type: 'macro', content: ['I', '-', ' ', 'Escape', 'j'] },
    },
  };
}

describe('MacroDebugger Component', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('특수 키를 읽기 쉬운 라벨로 변환한다', () => {
    expect(formatMacroKey(' ')).toBe('␣');
    expect(formatMacroKey('Escape')).toBe('Esc');
    expect(formatMacroKey('Ctrl-a')).toBe('^a');
    expect(formatMacroKey('x')).toBe('x');
  });

  it('녹화된 매크로가 없으면 안내 문구를 표시한다', () => {
    render(
      <MacroDebugger
        baseState={{ lines: [''], cursor: { line: 0, col: 0 }, mode: 'NORMAL' }}
        isOpen={true}
        onToggle={vi.fn()}
        onPreviewFrame={vi.fn()}
        onRunMacro={vi.fn()}
      />
    );
    expect(screen.getByTestId('macro-debugger-empty')).toBeInTheDocument();
  });

  it('isOpen=false 이면 렌더링하지 않는다', () => {
    render(
      <MacroDebugger
        baseState={createRecordedState()}
        isOpen={false}
        onToggle={vi.fn()}
        onPreviewFrame={vi.fn()}
        onRunMacro={vi.fn()}
      />
    );
    expect(screen.queryByTestId('macro-debugger')).not.toBeInTheDocument();
  });

  it('다음/이전 키 스텝 실행 시 해당 프레임 상태를 미리보기로 전달한다', () => {
    const onPreviewFrame = vi.fn();
    render(
      <MacroDebugger
        baseState={createRecordedState()}
        isOpen={true}
        onToggle={vi.fn()}
        onPreviewFrame={onPreviewFrame}
        onRunMacro={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('macro-next-btn')); // I
    fireEvent.click(screen.getByTestId('macro-next-btn')); // -
    expect(screen.getByTestId('macro-current-key')).toHaveTextContent('-');
    const lastPreview = onPreviewFrame.mock.calls[onPreviewFrame.mock.calls.length - 1][0] as VimEditorState;
    expect(lastPreview.lines[0]).toBe('-apple');
    expect(lastPreview.mode).toBe('INSERT');

    fireEvent.click(screen.getByTestId('macro-prev-btn'));
    expect(screen.getByTestId('macro-current-key')).toHaveTextContent('I');

    fireEvent.click(screen.getByTestId('macro-reset-btn'));
    expect(onPreviewFrame).toHaveBeenLastCalledWith(null);
  });

  it('슬로우모션 재생 시 선택한 속도 간격으로 프레임이 자동 진행된다', () => {
    vi.useFakeTimers();
    const onPreviewFrame = vi.fn();
    render(
      <MacroDebugger
        baseState={createRecordedState()}
        isOpen={true}
        onToggle={vi.fn()}
        onPreviewFrame={onPreviewFrame}
        onRunMacro={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('macro-speed-0.5x'));
    fireEvent.click(screen.getByTestId('macro-play-btn'));
    expect(screen.queryByTestId('macro-current-key')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('macro-current-key')).toHaveTextContent('I');

    // 각 프레임 타이머는 리렌더 후 예약되므로 프레임마다 act로 진행시킨다
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(600);
      });
    }
    // 끝까지 재생되면 마지막 키(j)에서 멈춘다
    expect(screen.getByTestId('macro-current-key')).toHaveTextContent('j');
    expect(screen.getByTestId('macro-play-btn')).toHaveTextContent('재생');
  });

  it('실행 버튼은 미리보기를 해제하고 [count]@{reg} 실행을 요청한다', () => {
    const onPreviewFrame = vi.fn();
    const onRunMacro = vi.fn();
    render(
      <MacroDebugger
        baseState={createRecordedState()}
        isOpen={true}
        onToggle={vi.fn()}
        onPreviewFrame={onPreviewFrame}
        onRunMacro={onRunMacro}
      />
    );

    fireEvent.click(screen.getByTestId('macro-count-inc'));
    expect(screen.getByTestId('macro-count-value')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('macro-run-btn'));
    expect(onRunMacro).toHaveBeenCalledWith('a', 2);
    expect(onPreviewFrame).toHaveBeenLastCalledWith(null);
  });
});
