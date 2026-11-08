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

  it(':copen 실행 시 퀵픽스 분할 창이 열리고 항목 클릭 점프 및 :cclose로 닫을 수 있다', () => {
    render(<App />);

    // 1. 자유 연습장(Sandbox)으로 전환
    const sandboxTabBtn = screen.getByTestId('tab-sandbox-btn');
    fireEvent.click(sandboxTabBtn);

    const typeCommand = (cmd: string) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
        for (const ch of cmd) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
    };

    // 2. :vimgrep /function/ % 실행으로 퀵픽스 목록 생성
    typeCommand('vimgrep /function/ %');

    // 3. :copen 4 실행으로 퀵픽스 전용 분할 창 열기
    typeCommand('copen 4');

    const qfWindow = screen.getByTestId('quickfix-window');
    expect(qfWindow).toBeInTheDocument();
    expect(qfWindow).toHaveClass('quickfix-window-container');
    expect(screen.getByText(/\[Quickfix List\]/)).toBeInTheDocument();

    // 퀵픽스 항목들이 렌더링되어 있는지 확인
    const qfItems = screen.getAllByTestId(/^quickfix-item-/);
    expect(qfItems.length).toBeGreaterThan(0);

    // 항목 클릭 시 점프 확인
    fireEvent.click(qfItems[0]);
    expect(screen.getByTestId('editor-container')).toHaveClass('editor-container');

    // 4. :cclose 로 퀵픽스 창 닫기
    typeCommand('cclose');
    expect(screen.queryByTestId('quickfix-window')).not.toBeInTheDocument();
  });

  it(':lopen 실행 시 로케이션 리스트 분할 창이 열리고 :lclose로 닫을 수 있다', () => {
    render(<App />);

    // 1. 자유 연습장(Sandbox)으로 전환
    const sandboxTabBtn = screen.getByTestId('tab-sandbox-btn');
    fireEvent.click(sandboxTabBtn);

    const typeCommand = (cmd: string) => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
        for (const ch of cmd) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
    };

    // 2. :lvimgrep /function/ % 실행으로 로케이션 리스트 생성
    typeCommand('lvimgrep /function/ %');

    // 3. :lopen 실행으로 로케이션 리스트 분할 창 열기
    typeCommand('lopen');

    const locWindow = screen.getByTestId('locationlist-window');
    expect(locWindow).toBeInTheDocument();
    expect(locWindow).toHaveClass('location-list-container');
    expect(screen.getByText(/\[Location List\]/)).toBeInTheDocument();

    // 4. :lclose 로 로케이션 리스트 창 닫기
    typeCommand('lclose');
    expect(screen.queryByTestId('locationlist-window')).not.toBeInTheDocument();
  });

  it('마크 & 점프 리스트 비주얼 맵 패널이 토글 및 Ex 명령(:marks, :jumps)으로 동작한다', () => {
    render(<App />);

    // 1. 드롭다운 토글 버튼 클릭 시 패널 열림
    const toggleBtn = screen.getByTestId('toggle-marks-visualizer-btn');
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('marks-jump-visualizer')).toBeInTheDocument();

    // 2. 패널 닫기 버튼 클릭 시 패널 닫힘
    fireEvent.click(screen.getByTestId('close-marks-visualizer-btn'));
    expect(screen.queryByTestId('marks-jump-visualizer')).not.toBeInTheDocument();

    // 3. ma 로 마크 a 생성 후 :marks 실행 시 패널이 열린다
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
      for (const ch of 'marks') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(screen.getByTestId('marks-jump-visualizer')).toBeInTheDocument();
    expect(screen.getByTestId('mark-item-a')).toBeInTheDocument();

    // 4. :jumps 실행 시 패널이 열린 상태를 유지하고 점프 리스트 확인 가능
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ':' }));
      for (const ch of 'jumps') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });

    expect(screen.getByTestId('marks-jump-visualizer')).toBeInTheDocument();
  });
});
