import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';

describe('StatusBar Component', () => {
  it('renders mode badge and 1-indexed cursor position correctly', () => {
    render(<StatusBar mode="NORMAL" cursor={{ line: 2, col: 4 }} />);

    const modeBadge = screen.getByTestId('status-mode');
    expect(modeBadge).toHaveTextContent('NORMAL');
    expect(modeBadge).toHaveClass('mode-normal');

    const cursorPos = screen.getByTestId('status-cursor-pos');
    // line 2 -> 3, col 4 -> 5
    expect(cursorPos).toHaveTextContent('3:5');
  });

  it('renders different modes properly', () => {
    const { rerender } = render(<StatusBar mode="INSERT" cursor={{ line: 0, col: 0 }} />);
    expect(screen.getByTestId('status-mode')).toHaveTextContent('INSERT');
    expect(screen.getByTestId('status-mode')).toHaveClass('mode-insert');

    rerender(<StatusBar mode="VISUAL" cursor={{ line: 0, col: 0 }} />);
    expect(screen.getByTestId('status-mode')).toHaveTextContent('VISUAL');
    expect(screen.getByTestId('status-mode')).toHaveClass('mode-visual');
  });

  it('COMMAND 모드 또는 SEARCH 모드일 때 커맨드라인 프롬프트를 렌더링한다', () => {
    const { rerender } = render(
      <StatusBar
        mode="COMMAND"
        cursor={{ line: 0, col: 0 }}
        commandType=":"
        commandBuffer="10"
      />
    );

    const prompt = screen.getByTestId('commandline-prompt');
    expect(prompt).toBeInTheDocument();
    expect(prompt).toHaveTextContent(':10');

    rerender(
      <StatusBar
        mode="SEARCH"
        cursor={{ line: 0, col: 0 }}
        commandType="/"
        commandBuffer="target"
      />
    );
    expect(screen.getByTestId('commandline-prompt')).toHaveTextContent('/target');
  });

  it('COMMAND 모드 진입 시 활성화 클래스와 안내 힌트를 정상 렌더링한다', () => {
    render(
      <StatusBar
        mode="COMMAND"
        cursor={{ line: 0, col: 0 }}
        commandType=":"
        commandBuffer=""
      />
    );

    const statusBar = screen.getByTestId('status-bar');
    expect(statusBar).toHaveClass('status-bar-active-command');
    expect(screen.getByText(/Enter 실행, Esc 취소/)).toBeInTheDocument();
  });

  it('commandMessage가 전달되면 정보 또는 에러 알림 배지를 렌더링한다', () => {
    const { rerender } = render(
      <StatusBar
        mode="NORMAL"
        cursor={{ line: 0, col: 0 }}
        commandMessage="5번째 줄로 이동했습니다."
      />
    );

    const infoMsg = screen.getByTestId('status-command-message');
    expect(infoMsg).toHaveClass('info');
    expect(infoMsg).toHaveTextContent('5번째 줄로 이동했습니다.');

    rerender(
      <StatusBar
        mode="NORMAL"
        cursor={{ line: 0, col: 0 }}
        commandMessage="E486: 패턴을 찾을 수 없습니다: foo"
      />
    );

    const errorMsg = screen.getByTestId('status-command-message');
    expect(errorMsg).toHaveClass('error');
    expect(errorMsg).toHaveTextContent('E486: 패턴을 찾을 수 없습니다: foo');
  });

  it('매크로 녹화 중(recordingMacro)일 때 깜빡이는 녹화 배지를 렌더링한다', () => {
    const { rerender } = render(
      <StatusBar
        mode="NORMAL"
        cursor={{ line: 0, col: 0 }}
        recordingMacro={{ register: 'a', keys: [] }}
      />
    );

    const recordingBadge = screen.getByTestId('status-macro-recording');
    expect(recordingBadge).toBeInTheDocument();
    expect(recordingBadge).toHaveTextContent('recording @a');

    rerender(
      <StatusBar
        mode="NORMAL"
        cursor={{ line: 0, col: 0 }}
        recordingMacro={null}
      />
    );
    expect(screen.queryByTestId('status-macro-recording')).not.toBeInTheDocument();
  });
});
