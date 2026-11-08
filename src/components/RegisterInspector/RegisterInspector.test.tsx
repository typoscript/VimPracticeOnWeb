import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RegisterInspector,
  categorizeMacroKey,
  formatMacroKeyDisplay,
  parseMacroInputToKeys,
  formatKeysToMacroInput,
} from './RegisterInspector';

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

  it('매크로 구문 토큰 및 탭 필터링이 올바르게 동작한다', () => {
    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        registers={{
          '"': { type: 'char', content: 'unnamed text' },
          a: { type: 'char', content: ['c', 'w', 'new', 'Escape', 'j'] },
          b: { type: 'char', content: 'simple string' },
        }}
      />
    );

    // 전체 탭: 세 레지스터 모두 존재
    expect(screen.getByTestId('register-row-')).toBeInTheDocument();
    expect(screen.getByTestId('register-row-a')).toBeInTheDocument();
    expect(screen.getByTestId('register-row-b')).toBeInTheDocument();

    // 매크로 키 토큰 칩 렌더링 확인 (<Esc>, cw, j 등)
    expect(screen.getByText('<Esc>')).toBeInTheDocument();

    // 매크로 탭으로 전환
    const macroTab = screen.getByTestId('filter-tab-macro');
    fireEvent.click(macroTab);

    // 매크로(@a)만 보이고 일반 클립보드("")는 필터링됨
    expect(screen.getByTestId('register-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('register-row-')).not.toBeInTheDocument();

    // 클립보드 탭으로 전환
    const clipboardTab = screen.getByTestId('filter-tab-clipboard');
    fireEvent.click(clipboardTab);

    expect(screen.getByTestId('register-row-')).toBeInTheDocument();
    expect(screen.queryByTestId('register-row-a')).not.toBeInTheDocument();
  });

  it('매크로 녹화 중일 때 라이브 레코딩 배너를 표시한다', () => {
    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        recordingMacro={{ register: 'a', keys: ['d', 'w', 'j', '0'] }}
        registers={{}}
      />
    );

    expect(screen.getByTestId('recording-macro-banner')).toBeInTheDocument();
    expect(screen.getByText(/REC @a/)).toBeInTheDocument();
    expect(screen.getByText(/4개 키 기록 중/)).toBeInTheDocument();
  });

  it('매크로 실행 및 디버거 열기 콜백을 정상 호출한다', () => {
    const handleRunMacro = vi.fn();
    const handleOpenDebugger = vi.fn();

    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        onRunMacro={handleRunMacro}
        onOpenMacroDebugger={handleOpenDebugger}
        registers={{
          a: { type: 'char', content: ['d', 'w'] },
        }}
      />
    );

    const runBtn = screen.getByTestId('run-macro-a');
    fireEvent.click(runBtn);
    expect(handleRunMacro).toHaveBeenCalledWith('a', 1);

    const debugBtn = screen.getByTestId('debug-macro-a');
    fireEvent.click(debugBtn);
    expect(handleOpenDebugger).toHaveBeenCalledWith('a');
  });

  it('레지스터 인라인 편집 및 저장/취소가 올바르게 동작한다', () => {
    const handleUpdate = vi.fn();
    const handleDelete = vi.fn();

    render(
      <RegisterInspector
        isOpen={true}
        onToggle={vi.fn()}
        onUpdateRegister={handleUpdate}
        onDeleteRegister={handleDelete}
        registers={{
          a: { type: 'char', content: ['d', 'w', 'Escape'] },
        }}
      />
    );

    // 편집 버튼 클릭
    const editBtn = screen.getByTestId('edit-reg-a');
    fireEvent.click(editBtn);

    const editRow = screen.getByTestId('edit-row-a');
    expect(editRow).toBeInTheDocument();

    const input = screen.getByTestId('inline-edit-input-a') as HTMLInputElement;
    expect(input.value).toBe('dw<Esc>');

    // 빠른 태그 버튼 '+ <CR>' 클릭
    const crTagBtn = screen.getByRole('button', { name: '+ <CR>' });
    fireEvent.click(crTagBtn);
    expect(input.value).toBe('dw<Esc><CR>');

    // 저장 버튼 클릭
    const saveBtn = screen.getByTestId('save-reg-a');
    fireEvent.click(saveBtn);

    expect(handleUpdate).toHaveBeenCalledWith(
      'a',
      ['d', 'w', 'Escape', 'Enter'],
      'macro'
    );
    expect(screen.getByText('💾 레지스터가 수정되었습니다.')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const deleteBtn = screen.getByTestId('delete-reg-a');
    fireEvent.click(deleteBtn);
    expect(handleDelete).toHaveBeenCalledWith('a');
  });

  describe('Macro parsing and formatting utilities', () => {
    it('categorizeMacroKey가 키 종류를 정확히 판별한다', () => {
      expect(categorizeMacroKey('h')).toBe('motion');
      expect(categorizeMacroKey('w')).toBe('motion');
      expect(categorizeMacroKey('d')).toBe('operator');
      expect(categorizeMacroKey('c')).toBe('operator');
      expect(categorizeMacroKey('i')).toBe('mode');
      expect(categorizeMacroKey('Escape')).toBe('special');
      expect(categorizeMacroKey('Ctrl-v')).toBe('special');
      expect(categorizeMacroKey('x')).toBe('operator');
      expect(categorizeMacroKey('a')).toBe('mode');
      expect(categorizeMacroKey('z')).toBe('insert');
    });

    it('formatMacroKeyDisplay가 Vim 특수 키 표기법으로 변환한다', () => {
      expect(formatMacroKeyDisplay('Escape')).toBe('<Esc>');
      expect(formatMacroKeyDisplay('Enter')).toBe('<CR>');
      expect(formatMacroKeyDisplay(' ')).toBe('<Space>');
      expect(formatMacroKeyDisplay('Tab')).toBe('<Tab>');
      expect(formatMacroKeyDisplay('Backspace')).toBe('<BS>');
      expect(formatMacroKeyDisplay('Ctrl-r')).toBe('<C-r>');
      expect(formatMacroKeyDisplay('w')).toBe('w');
    });

    it('parseMacroInputToKeys 및 formatKeysToMacroInput 상호 변환이 정확하다', () => {
      const input = 'ciwfoo<Esc>j0<CR>';
      const parsed = parseMacroInputToKeys(input);
      expect(parsed).toEqual(['c', 'i', 'w', 'f', 'o', 'o', 'Escape', 'j', '0', 'Enter']);

      const formatted = formatKeysToMacroInput(parsed);
      expect(formatted).toBe('ciwfoo<Esc>j0<CR>');
    });
  });
});
