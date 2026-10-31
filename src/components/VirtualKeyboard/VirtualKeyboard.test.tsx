import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualKeyboard } from './VirtualKeyboard';

describe('VirtualKeyboard Component', () => {
  it('기본 가상 키보드를 렌더링하고 NORMAL 모드 역할을 표시한다', () => {
    render(<VirtualKeyboard mode="NORMAL" />);

    expect(screen.getByTestId('virtual-keyboard')).toBeInTheDocument();
    expect(screen.getByText('현재 모드: NORMAL')).toBeInTheDocument();

    // 이동 키 h, j, k, l 확인
    const hKey = screen.getByTestId('vkey-h');
    expect(hKey).toHaveClass('role-motion');
    expect(hKey).toHaveTextContent('h');

    // 삭제 키 d 확인
    const dKey = screen.getByTestId('vkey-d');
    expect(dKey).toHaveClass('role-operator');

    // 입력 키 i 확인
    const iKey = screen.getByTestId('vkey-i');
    expect(iKey).toHaveClass('role-insert');
  });

  it('lastPressedKey가 전달되면 해당 키캡에 vkey-pressed 클래스가 적용된다', () => {
    const { rerender } = render(<VirtualKeyboard mode="NORMAL" lastPressedKey="j" />);

    const jKey = screen.getByTestId('vkey-j');
    expect(jKey).toHaveClass('vkey-pressed');

    rerender(<VirtualKeyboard mode="NORMAL" lastPressedKey="Escape" />);
    const escKey = screen.getByTestId('vkey-Escape');
    expect(escKey).toHaveClass('vkey-pressed');
  });

  it('키캡 클릭 시 onKeyPress 콜백이 올바른 키 값과 함께 호출된다', () => {
    const handleKeyPress = vi.fn();
    render(<VirtualKeyboard mode="NORMAL" onKeyPress={handleKeyPress} />);

    const wKey = screen.getByTestId('vkey-w');
    fireEvent.click(wKey);

    expect(handleKeyPress).toHaveBeenCalledWith('w');
  });

  it('INSERT 모드에서는 Esc 키가 제어 역할로 강조된다', () => {
    render(<VirtualKeyboard mode="INSERT" />);

    const escKey = screen.getByTestId('vkey-Escape');
    expect(escKey).toHaveClass('role-control');
  });
});
