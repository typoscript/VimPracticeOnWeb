import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegisterInspector } from './RegisterInspector';

describe('RegisterInspector Component', () => {
  it('기본 무명 레지스터 및 복사 레지스터를 올바르게 렌더링한다', () => {
    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        registers={{
          '"': { type: 'char', content: 'default clipboard content' },
          '0': { type: 'line', content: 'last yanked line' },
          a: { type: 'char', content: 'named register a' },
        }}
      />
    );

    expect(screen.getByTestId('register-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('register-row-')).toBeInTheDocument(); // ""
    expect(screen.getByTestId('register-row-0')).toBeInTheDocument(); // "0
    expect(screen.getByTestId('register-row-a')).toBeInTheDocument(); // "a
    expect(screen.getByText('default clipboard content')).toBeInTheDocument();
    expect(screen.getByText('last yanked line')).toBeInTheDocument();
    expect(screen.getByText('named register a')).toBeInTheDocument();
  });

  it('activeRegister가 설정되어 있을 때 활성 배너를 강조 표시한다', () => {
    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        activeRegister="a"
        registers={{
          a: { type: 'char', content: 'saved token' },
        }}
      />
    );

    expect(screen.getByTestId('active-register-banner')).toBeInTheDocument();
    expect(screen.getByText(/"a"/)).toBeInTheDocument();
  });

  it('isOpen이 false이면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <RegisterInspector
        isOpen={false}
        onToggle={vi.fn()}
        registers={{}}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('닫기 버튼 클릭 시 onToggle 콜백을 호출한다', () => {
    const handleToggle = vi.fn();
    render(
      <RegisterInspector
        isOpen={true}
        onToggle={handleToggle}
        registers={{}}
      />
    );

    const closeBtn = screen.getByTestId('close-register-inspector-btn');
    fireEvent.click(closeBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
