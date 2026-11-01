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
});
