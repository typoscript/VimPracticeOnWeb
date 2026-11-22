import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createVimState, handleKey, sendKeys, runExCommand } from '../vim-engine';
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

  it('vim.opt.autopairs / cmdlinepopup 및 vim.snippets.add 로 등록한 커스텀 스니펫이 Tab · Ctrl-Space · :Snippets 에서 동작한다', () => {
    const preset = USER_INIT_PRESETS.find((p) => p.id === 'snippetsPro')!;
    const initial = createVimState(['']);

    const applied = applyUserInitConfigToState(initial, {
      format: 'lua',
      code: preset.code,
      enabled: true,
    });
    expect(applied.ok).toBe(true);
    expect(applied.state.options?.autopairs).toBe(true);
    expect(applied.state.options?.cmdlinepopup).toBe(true);
    expect(applied.state.customSnippets?.length).toBe(3);

    // 1) :Snippets 목록에 커스텀 스니펫(*rfc)이 표시됨
    const listState = runExCommand(applied.state, 'Snippets');
    expect(listState.commandMessage).toContain('*rfc<Tab>');

    // 2) Insert 모드 <Tab> 으로 커스텀 스니펫 rfc 확장 → SELECT 모드 진입
    let s = sendKeys(applied.state, 'irfc<Tab>Card<Tab>body<Esc>');
    expect(s.lines).toEqual([
      'export function Card() {',
      '  return <div>body</div>;',
      '}',
    ]);

    // 3) Ctrl-Space (nvim-cmp) 팝업에서도 커스텀 스니펫 todo 가 최상위 제안되고 Enter 로 확장됨
    let cmpState = sendKeys(applied.state, 'ito');
    cmpState = handleKey(cmpState, 'Ctrl-Space');
    expect(cmpState.completionSession?.type).toBe('cmp');
    expect(cmpState.completionSession?.candidates[0]).toBe('todo');
    cmpState = handleKey(cmpState, 'Enter');
    expect(cmpState.mode).toBe('SELECT');
    expect(cmpState.lines[0]).toBe('// TODO(dev): follow up');
  });

  it('vim.snippets.remove / vim.snippets.clear 로 커스텀 스니펫을 개별 삭제하거나 전체 초기화한다', () => {
    let s = createVimState(['']);
    s = runExCommand(s, 'lua vim.snippets.add("hi", "hello ${1:world}$0", "greet")');
    expect(s.customSnippets?.map((x) => x.trigger)).toEqual(['hi']);

    s = runExCommand(s, 'lua vim.snippets.add("bye", { "goodbye $0" })');
    expect(s.customSnippets?.length).toBe(2);

    s = runExCommand(s, 'lua vim.snippets.remove("hi")');
    expect(s.customSnippets?.map((x) => x.trigger)).toEqual(['bye']);

    s = runExCommand(s, 'lua vim.snippets.clear()');
    expect(s.customSnippets).toEqual([]);
  });
});
