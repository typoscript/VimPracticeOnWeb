import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewPanelsDropdown } from './ViewPanelsDropdown';

describe('ViewPanelsDropdown Component', () => {
  const defaultProps = {
    showDiffView: false,
    onToggleDiffView: vi.fn(),
    isSandbox: false,
    showRegisterInspector: true,
    onToggleRegisterInspector: vi.fn(),
    showGrammarAST: false,
    onToggleGrammarAST: vi.fn(),
    showActionTimeline: true,
    onToggleActionTimeline: vi.fn(),
    showVirtualKeyboard: false,
    onToggleVirtualKeyboard: vi.fn(),
    relativeLineNumbers: true,
    onToggleRelativeLineNumbers: vi.fn(),
  };

  it('기본 상태에서 활성화된 패널 개수를 트리거 버튼 뱃지에 정확히 표시한다', () => {
    // 3개 활성: showRegisterInspector, showActionTimeline, relativeLineNumbers
    render(<ViewPanelsDropdown {...defaultProps} />);

    const triggerBtn = screen.getByTestId('toggle-view-panels-menu-btn');
    expect(triggerBtn).toHaveTextContent('패널 보기');
    expect(triggerBtn).toHaveTextContent('3');
  });

  it('트리거 버튼 클릭 시 드롭다운 열림/닫힘 상태가 토글된다', () => {
    render(<ViewPanelsDropdown {...defaultProps} />);

    const triggerBtn = screen.getByTestId('toggle-view-panels-menu-btn');
    const menuContainer = screen.getByRole('menu');

    expect(menuContainer).not.toHaveClass('open');

    // 열기
    fireEvent.click(triggerBtn);
    expect(menuContainer).toHaveClass('open');

    // 닫기
    fireEvent.click(triggerBtn);
    expect(menuContainer).not.toHaveClass('open');
  });

  it('각 패널 토글 버튼 클릭 시 해당하는 이벤트 핸들러가 정상 호출된다', () => {
    const onToggleDiffView = vi.fn();
    const onToggleRegisterInspector = vi.fn();
    const onToggleGrammarAST = vi.fn();
    const onToggleActionTimeline = vi.fn();
    const onToggleVirtualKeyboard = vi.fn();
    const onToggleRelativeLineNumbers = vi.fn();

    render(
      <ViewPanelsDropdown
        {...defaultProps}
        onToggleDiffView={onToggleDiffView}
        onToggleRegisterInspector={onToggleRegisterInspector}
        onToggleGrammarAST={onToggleGrammarAST}
        onToggleActionTimeline={onToggleActionTimeline}
        onToggleVirtualKeyboard={onToggleVirtualKeyboard}
        onToggleRelativeLineNumbers={onToggleRelativeLineNumbers}
      />
    );

    // Diff 뷰 토글
    const diffBtn = screen.getByTestId('toggle-diff-view-btn');
    fireEvent.click(diffBtn);
    expect(onToggleDiffView).toHaveBeenCalledTimes(1);

    // 레지스터 토글
    const regBtn = screen.getByTestId('toggle-register-inspector-btn');
    fireEvent.click(regBtn);
    expect(onToggleRegisterInspector).toHaveBeenCalledTimes(1);

    // 문법 AST 토글
    const astBtn = screen.getByTestId('toggle-grammar-ast-btn');
    fireEvent.click(astBtn);
    expect(onToggleGrammarAST).toHaveBeenCalledTimes(1);

    // 타임라인 토글
    const tlBtn = screen.getByTestId('toggle-action-timeline-btn');
    fireEvent.click(tlBtn);
    expect(onToggleActionTimeline).toHaveBeenCalledTimes(1);

    // 가상 키보드 토글
    const kbBtn = screen.getByTestId('toggle-virtual-keyboard-btn');
    fireEvent.click(kbBtn);
    expect(onToggleVirtualKeyboard).toHaveBeenCalledTimes(1);

    // 상대 라인 번호 토글
    const relBtn = screen.getByTestId('toggle-relativenumber-btn');
    fireEvent.click(relBtn);
    expect(onToggleRelativeLineNumbers).toHaveBeenCalledTimes(1);
  });

  it('샌드박스(isSandbox=true) 모드일 때는 목표 Diff 토글 버튼이 숨겨진다', () => {
    render(<ViewPanelsDropdown {...defaultProps} isSandbox={true} />);

    expect(screen.queryByTestId('toggle-diff-view-btn')).not.toBeInTheDocument();
  });

  it('Esc 키 입력 시 열려있는 드롭다운이 닫힌다', () => {
    render(<ViewPanelsDropdown {...defaultProps} />);

    const triggerBtn = screen.getByTestId('toggle-view-panels-menu-btn');
    const menuContainer = screen.getByRole('menu');

    fireEvent.click(triggerBtn);
    expect(menuContainer).toHaveClass('open');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuContainer).not.toHaveClass('open');
  });

  it('매크로 디버거 토글 핸들러가 주어지면 토글 버튼을 표시하고 활성 개수에 반영한다', () => {
    const onToggleMacroDebugger = vi.fn();
    render(
      <ViewPanelsDropdown
        {...defaultProps}
        showMacroDebugger={true}
        onToggleMacroDebugger={onToggleMacroDebugger}
      />
    );

    expect(screen.getByTestId('toggle-view-panels-menu-btn')).toHaveTextContent('4');
    fireEvent.click(screen.getByTestId('toggle-macro-debugger-btn'));
    expect(onToggleMacroDebugger).toHaveBeenCalledTimes(1);
  });

  it('마크 & 점프 리스트 토글 핸들러가 주어지면 토글 버튼을 표시하고 활성 개수에 반영한다', () => {
    const onToggleMarksVisualizer = vi.fn();
    render(
      <ViewPanelsDropdown
        {...defaultProps}
        showMarksVisualizer={true}
        onToggleMarksVisualizer={onToggleMarksVisualizer}
      />
    );

    expect(screen.getByTestId('toggle-view-panels-menu-btn')).toHaveTextContent('4');
    fireEvent.click(screen.getByTestId('toggle-marks-visualizer-btn'));
    expect(onToggleMarksVisualizer).toHaveBeenCalledTimes(1);
  });
});
