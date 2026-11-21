import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createVimState, handleKey } from '../vim-engine';
import {
  USER_INIT_PRESETS,
  loadUserInitConfig,
  saveUserInitConfig,
  applyUserInitConfigToState,
} from './userInitConfig';
import { buildSandboxInitialState } from './missionInitialState';
import { exportBackupJson, importBackupJson } from './backupStorage';
import { resolveWhichKeyData } from '../components/WhichKey/whichKeyCatalog';
import { ConfigExporterModal } from '../components/ConfigExporterModal/ConfigExporterModal';

describe('나만의 init.lua / .vimrc 영구 설정 플레이그라운드', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage 저장/불러오기 및 JSON 백업/복원(BACKUP_KEYS)을 지원한다', () => {
    expect(loadUserInitConfig()).toEqual({ format: 'lua', code: '', enabled: true });

    const lazy = USER_INIT_PRESETS.find((p) => p.id === 'lazyvim')!;
    saveUserInitConfig({ format: lazy.format, code: lazy.code, enabled: true });
    expect(loadUserInitConfig()).toEqual({ format: 'lua', code: lazy.code, enabled: true });

    const json = exportBackupJson();
    localStorage.clear();
    expect(loadUserInitConfig().code).toBe('');

    const restored = importBackupJson(json, 'replace');
    expect(restored.ok).toBe(true);
    expect(loadUserInitConfig().code).toContain('vim.keymap.set');
  });

  it('Lua 프리셋을 에디터 상태에 적용하면 옵션·키맵·리더키가 반영되고 Which-Key 에 동적 노출된다', () => {
    const lazy = USER_INIT_PRESETS.find((p) => p.id === 'lazyvim')!;
    const initial = createVimState(['keep line 1', 'keep line 2'], { line: 0, col: 3 });

    const res = applyUserInitConfigToState(initial, {
      format: 'lua',
      code: lazy.code,
      enabled: true,
    });
    expect(res.ok).toBe(true);
    expect(res.state.lines).toEqual(['keep line 1', 'keep line 2']);
    expect(res.state.cursor).toEqual({ line: 0, col: 3 });
    expect(res.state.options?.relativenumber).toBe(true);
    expect(res.state.options?.shiftwidth).toBe(2);
    expect(res.state.leaderKey).toBe(' ');

    // Space (<leader>) 입력 시 Which-Key 팝업에 init.lua 에서 등록한 f, g, o, w 키맵이 동적 표시
    const afterLeader = handleKey(res.state, ' ');
    const wk = resolveWhichKeyData(afterLeader);
    expect(wk?.prefix).toBe('<leader>');
    expect(wk?.items.some((i) => i.key === 'f' && i.custom)).toBe(true);
    expect(wk?.items.some((i) => i.key === 'o' && i.custom)).toBe(true);
  });

  it('.vimrc 프리셋 적용 및 잘못된 Lua 구문 오류 처리를 검증한다', () => {
    const vimrc = USER_INIT_PRESETS.find((p) => p.id === 'classicVimrc')!;
    const initial = createVimState(['hello world']);

    const okRes = applyUserInitConfigToState(initial, {
      format: 'vimrc',
      code: vimrc.code,
      enabled: true,
    });
    expect(okRes.ok).toBe(true);
    expect(okRes.state.options?.relativenumber).toBe(true);
    expect(okRes.state.options?.shiftwidth).toBe(2);
    expect(okRes.state.userKeymaps?.['i:jk']).toBe('<Esc>');

    const errRes = applyUserInitConfigToState(initial, {
      format: 'lua',
      code: 'vim.opt.shiftwidth = "unterminated',
      enabled: true,
    });
    expect(errRes.ok).toBe(false);
    expect(errRes.state).toBe(initial);
  });

  it('buildSandboxInitialState 가 활성화된 userInitConfig 를 자동 적용한다', () => {
    const minimal = USER_INIT_PRESETS.find((p) => p.id === 'minimal')!;
    const sb = buildSandboxInitialState({
      activePresets: {},
      leaderKey: ' ',
      customKeymaps: [],
      userInitConfig: { format: 'lua', code: minimal.code, enabled: true },
    });
    expect(sb.options?.shiftwidth).toBe(4);
    expect(sb.options?.expandtab).toBe(true);
    expect(sb.userKeymaps?.['n:H']).toBe('^');
  });

  it('ConfigExporterModal 의 init.lua 플레이그라운드 탭에서 프리셋 불러오기 및 저장·즉시 적용이 동작한다', () => {
    const onApply = vi.fn().mockReturnValue({ ok: true, message: '적용 완료' });

    render(
      <ConfigExporterModal
        isOpen={true}
        onClose={vi.fn()}
        relativenumber={true}
        theme="tokyonight"
        leaderKey=" "
        activePresets={{}}
        onTogglePreset={vi.fn()}
        onChangeLeaderKey={vi.fn()}
        onApplyUserInitConfig={onApply}
      />
    );

    fireEvent.click(screen.getByTestId('nav-playground-btn'));
    expect(screen.getByTestId('playground-section')).not.toHaveClass('is-hidden');

    fireEvent.click(screen.getByTestId('playground-preset-lazyvim'));
    const textarea = screen.getByTestId('playground-code-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('vim.keymap.set("n", "<leader>o", ":Oil<CR>")');

    fireEvent.click(screen.getByTestId('playground-apply-btn'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'lua',
        enabled: true,
      })
    );
    expect(screen.getByTestId('playground-status-msg')).toHaveTextContent('적용 완료');
  });
});
