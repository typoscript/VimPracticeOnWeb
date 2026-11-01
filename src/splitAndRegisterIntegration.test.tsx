import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from './App';

describe('Split Windows & Register Inspector Integration', () => {
  it('레지스터 인스펙터 패널 토글 버튼 클릭 시 패널이 나타나고 사라진다', () => {
    render(<App />);

    const toggleBtn = screen.getByTestId('toggle-register-inspector-btn');
    expect(toggleBtn).toBeInTheDocument();

    // 초기 상태에서 열려있음 (기본값 true)
    expect(screen.getByTestId('register-inspector')).toBeInTheDocument();

    // 토글 클릭 -> 닫힘
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('register-inspector')).not.toBeInTheDocument();

    // 다시 토글 클릭 -> 열림
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('register-inspector')).toBeInTheDocument();
  });

  it(':vsp 커맨드 실행 시 화면이 2개의 페인으로 세로 분할되고 클릭으로 포커스를 전환할 수 있다', () => {
    render(<App />);

    // : v s p Enter 입력
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    // 세로 분할 컨테이너 및 2개 페인 렌더링 확인
    const splitContainer = screen.getByTestId('editor-split-container');
    expect(splitContainer).toBeInTheDocument();
    expect(splitContainer).toHaveClass('split-vertical');

    const pane0 = screen.getByTestId('split-pane-0');
    const pane1 = screen.getByTestId('split-pane-1');
    expect(pane0).toBeInTheDocument();
    expect(pane1).toBeInTheDocument();
    expect(pane0).toHaveClass('active');

    // 오른쪽 페인(pane1) 클릭 시 포커스 이동
    fireEvent.click(pane1);
    expect(pane1).toHaveClass('active');
    expect(pane0).not.toHaveClass('active');

    // :q 로 활성 분할 창 닫기
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    // 단일 창 복귀 확인
    expect(screen.queryByTestId('editor-split-container')).not.toBeInTheDocument();
  });

  it('"a 레지스터를 지정하면 레지스터 인스펙터에 활성 배너가 실시간으로 나타난다', () => {
    render(<App />);

    // " a 입력
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '"' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });

    // 활성 레지스터 배너 표시 확인
    expect(screen.getByTestId('active-register-banner')).toBeInTheDocument();
    expect(screen.getByText(/"a"/)).toBeInTheDocument();

    // Escape 입력 시 활성 레지스터 배너 해제
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByTestId('active-register-banner')).not.toBeInTheDocument();
  });
});
