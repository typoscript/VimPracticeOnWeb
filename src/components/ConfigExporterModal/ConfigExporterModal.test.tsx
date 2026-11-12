import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigExporterModal } from './ConfigExporterModal';

describe('ConfigExporterModal 컴포넌트', () => {
  const onTogglePreset = vi.fn();
  const onChangeLeaderKey = vi.fn();
  const onClose = vi.fn();

  it('isOpen이 false일 때는 렌더링되지 않는다', () => {
    render(
      <ConfigExporterModal
        isOpen={false}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );
    expect(screen.queryByTestId('config-modal')).toBeNull();
  });

  it('isOpen이 true일 때 프리셋 목록과 코드 뷰어를 렌더링한다', () => {
    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true, leaderW: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );

    expect(screen.getByTestId('config-modal')).toBeDefined();
    expect(screen.getByTestId('presets-grid')).toBeDefined();
    expect(screen.getByTestId('config-code-preview')).toBeDefined();
    expect(screen.getByTestId('config-code-preview').textContent).toContain('inoremap jk <Esc>');
  });

  it('플랫폼 탭 클릭 시 표시되는 설정 코드가 변경된다', () => {
    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );

    const initLuaBtn = screen.getByTestId('tab-initlua-btn');
    fireEvent.click(initLuaBtn);

    expect(screen.getByTestId('config-code-preview').textContent).toContain('init.lua');
    expect(screen.getByTestId('config-code-preview').textContent).toContain('vim.keymap.set');

    const vscodeBtn = screen.getByTestId('tab-vscode-btn');
    fireEvent.click(vscodeBtn);
    expect(screen.getByTestId('config-code-preview').textContent).toContain('vim.insertModeKeyBindings');
  });

  it('프리셋 체크박스 클릭 시 onTogglePreset이 호출된다', () => {
    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );

    const checkbox = screen.getByTestId('preset-checkbox-jkEsc');
    fireEvent.click(checkbox);
    expect(onTogglePreset).toHaveBeenCalledWith('jkEsc');
  });

  it('리더 키 셀렉트 변경 시 onChangeLeaderKey가 호출된다', () => {
    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );

    const select = screen.getByTestId('leader-select');
    fireEvent.change(select, { target: { value: '\\' } });
    expect(onChangeLeaderKey).toHaveBeenCalledWith('\\');
  });

  it('닫기 버튼 클릭 시 onClose가 호출된다', () => {
    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={onClose}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
      />
    );

    const closeBtn = screen.getByTestId('close-config-modal-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  describe('커스텀 키바인딩 인터페이스 (GUI Keymap Configurator)', () => {
    const onAddCustomKeymap = vi.fn();
    const onDeleteCustomKeymap = vi.fn();

    const sampleCustomKeymaps = [
      { id: 'm1', mode: 'normal' as const, from: 'Y', to: 'y$', description: '줄 끝 복사' },
      { id: 'm2', mode: 'insert' as const, from: 'fd', to: '<Esc>' },
    ];

    it('등록된 커스텀 키매핑 목록을 렌더링한다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={sampleCustomKeymaps}
          onAddCustomKeymap={onAddCustomKeymap}
          onDeleteCustomKeymap={onDeleteCustomKeymap}
        />
      );

      expect(screen.getByTestId('keymap-card-m1')).toBeDefined();
      expect(screen.getByTestId('keymap-card-m2')).toBeDefined();
      expect(screen.getByText('줄 끝 복사')).toBeDefined();
    });

    it('신규 키매핑 입력 폼 제출 시 onAddCustomKeymap이 호출된다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={[]}
          onAddCustomKeymap={onAddCustomKeymap}
          onDeleteCustomKeymap={onDeleteCustomKeymap}
        />
      );

      fireEvent.change(screen.getByTestId('custom-keymap-mode-select'), {
        target: { value: 'normal' },
      });
      fireEvent.change(screen.getByTestId('custom-keymap-lhs-input'), {
        target: { value: '<leader>p' },
      });
      fireEvent.change(screen.getByTestId('custom-keymap-rhs-input'), {
        target: { value: '"+p' },
      });
      fireEvent.change(screen.getByTestId('custom-keymap-desc-input'), {
        target: { value: '클립보드 붙여넣기' },
      });

      fireEvent.submit(screen.getByTestId('custom-keymap-form'));

      expect(onAddCustomKeymap).toHaveBeenCalledWith({
        mode: 'normal',
        from: '<leader>p',
        to: '"+p',
        description: '클립보드 붙여넣기',
        noremap: true,
      });
    });

    it('빈 입력 제출 시 유효성 검사 에러 메시지를 표시한다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={[]}
          onAddCustomKeymap={onAddCustomKeymap}
        />
      );

      fireEvent.submit(screen.getByTestId('custom-keymap-form'));
      expect(screen.getByTestId('custom-form-error')).toBeDefined();
    });

    it('중복 단축키 제출 시 에러를 표시한다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={sampleCustomKeymaps}
          onAddCustomKeymap={onAddCustomKeymap}
        />
      );

      fireEvent.change(screen.getByTestId('custom-keymap-lhs-input'), {
        target: { value: 'Y' },
      });
      fireEvent.change(screen.getByTestId('custom-keymap-rhs-input'), {
        target: { value: 'y$' },
      });
      fireEvent.submit(screen.getByTestId('custom-keymap-form'));

      expect(screen.getByTestId('custom-form-error').textContent).toContain('이미 등록된');
    });

    it('빠른 특수키 칩 클릭 시 입력 필드에 토큰이 삽입된다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={[]}
        />
      );

      const chip = screen.getByTestId('quick-chip-<Esc>');
      fireEvent.click(chip);

      const rhsInput = screen.getByTestId('custom-keymap-rhs-input') as HTMLInputElement;
      expect(rhsInput.value).toBe('<Esc>');
    });

    it('추천 템플릿 칩 클릭 시 폼 필드가 자동으로 채워진다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={[]}
        />
      );

      const tmplChip = screen.getByTestId('template-chip-0'); // Y -> y$
      fireEvent.click(tmplChip);

      const lhsInput = screen.getByTestId('custom-keymap-lhs-input') as HTMLInputElement;
      const rhsInput = screen.getByTestId('custom-keymap-rhs-input') as HTMLInputElement;
      expect(lhsInput.value).toBe('Y');
      expect(rhsInput.value).toBe('y$');
    });

    it('삭제 버튼 클릭 시 onDeleteCustomKeymap이 호출된다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={sampleCustomKeymaps}
          onDeleteCustomKeymap={onDeleteCustomKeymap}
        />
      );

      const deleteBtn = screen.getByTestId('delete-keymap-m1');
      fireEvent.click(deleteBtn);
      expect(onDeleteCustomKeymap).toHaveBeenCalledWith('m1');
    });

    it('모드별 필터 버튼 클릭 시 필터링이 적용된다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={sampleCustomKeymaps}
        />
      );

      // Insert 필터 클릭
      fireEvent.click(screen.getByTestId('filter-pill-insert'));

      expect(screen.queryByTestId('keymap-card-m1')).toBeNull(); // Normal 카드는 숨겨짐
      expect(screen.getByTestId('keymap-card-m2')).toBeDefined(); // Insert 카드는 표시됨
    });

    it('상단 탭 클릭으로 키바인딩과 익스포터 섹션 사이를 전환한다', () => {
      render(
        <ConfigExporterModal
          isOpen={true}
          onClose={onClose}
          relativenumber={true}
          theme="tokyonight"
          leaderKey=" "
          activePresets={{}}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={[]}
        />
      );

      const exportTabBtn = screen.getByTestId('nav-export-btn');
      fireEvent.click(exportTabBtn);

      const exporterSection = screen.getByTestId('exporter-viewer-section');
      expect(exporterSection.className).not.toContain('is-hidden');
    });
  });
});
