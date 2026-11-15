import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigExporterKeymapsTab } from './ConfigExporterKeymapsTab';
import { ConfigExporterBackupTab } from './ConfigExporterBackupTab';
import * as dailyChallengeUtils from '../../utils/dailyChallenge';
import * as configGenUtils from '../../utils/configGenerator';
import { exportBackupJson } from '../../utils/backupStorage';
import { CustomKeymapItem } from '../../utils/keymapStorage';

describe('ConfigExporterKeymapsTab', () => {
  const sampleKeymaps: CustomKeymapItem[] = [
    { id: 'km-1', mode: 'normal', from: '<leader>w', to: ':w<CR>', description: '저장' },
    { id: 'km-2', mode: 'insert', from: 'jk', to: '<Esc>', description: '탈출' },
  ];

  it('handles preset toggling, leader selection, and tab visibility classes', () => {
    const onTogglePreset = vi.fn();
    const onChangeLeaderKey = vi.fn();
    render(
      <ConfigExporterKeymapsTab
        activeMainTab="keymaps"
        leaderKey=" "
        activePresets={{ jkEsc: true }}
        onTogglePreset={onTogglePreset}
        onChangeLeaderKey={onChangeLeaderKey}
        customKeymaps={sampleKeymaps}
      />
    );

    expect(screen.getByTestId('presets-section').className).not.toContain('is-hidden');
    expect(screen.getByTestId('custom-keymaps-section').className).not.toContain('is-hidden');

    fireEvent.click(screen.getByTestId('preset-checkbox-jkEsc'));
    expect(onTogglePreset).toHaveBeenCalledWith('jkEsc');

    fireEvent.change(screen.getByTestId('leader-select'), { target: { value: ',' } });
    expect(onChangeLeaderKey).toHaveBeenCalledWith(',');
  });

  it('validates custom keymap form, prevents duplicates, applies chips/templates, filters, and deletes', () => {
    const onAdd = vi.fn();
    const onDelete = vi.fn();
    render(
      <ConfigExporterKeymapsTab
        activeMainTab="custom"
        leaderKey=" "
        activePresets={{}}
        onTogglePreset={vi.fn()}
        onChangeLeaderKey={vi.fn()}
        customKeymaps={sampleKeymaps}
        onAddCustomKeymap={onAdd}
        onDeleteCustomKeymap={onDelete}
      />
    );

    // Empty submit shows error
    fireEvent.click(screen.getByTestId('custom-keymap-add-btn'));
    expect(screen.getByTestId('custom-form-error')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    // Duplicate (normal + <leader>w) shows error
    fireEvent.change(screen.getByTestId('custom-keymap-lhs-input'), { target: { value: '<leader>w' } });
    fireEvent.change(screen.getByTestId('custom-keymap-rhs-input'), { target: { value: ':wq<CR>' } });
    fireEvent.click(screen.getByTestId('custom-keymap-add-btn'));
    expect(screen.getByTestId('custom-form-error')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();

    // Apply template suggestion + quick chip + submit new mapping
    fireEvent.click(screen.getByTestId('template-chip-0'));
    fireEvent.click(screen.getByTestId('quick-chip-<CR>'));
    fireEvent.change(screen.getByTestId('custom-keymap-mode-select'), { target: { value: 'visual' } });
    fireEvent.change(screen.getByTestId('custom-keymap-desc-input'), { target: { value: '커스텀' } });
    fireEvent.click(screen.getByTestId('custom-keymap-add-btn'));

    expect(onAdd).toHaveBeenCalledWith({
      mode: 'visual',
      from: 'Y',
      to: 'y$<CR>',
      description: '커스텀',
      noremap: true,
    });

    // Filter pills & delete
    expect(screen.getByTestId('custom-keymaps-grid')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('filter-pill-insert'));
    expect(screen.queryByTestId('keymap-card-km-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('keymap-card-km-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('delete-keymap-km-2'));
    expect(onDelete).toHaveBeenCalledWith('km-2');

    fireEvent.click(screen.getByTestId('filter-pill-visual'));
    expect(screen.getByTestId('empty-keymaps-notice')).toBeInTheDocument();
  });
});

describe('ConfigExporterBackupTab', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('copies backup json, downloads backup file, and validates/restores backup json', async () => {
    const copySpy = vi.spyOn(dailyChallengeUtils, 'copyTextToClipboard').mockResolvedValue(true);
    const downloadSpy = vi.spyOn(configGenUtils, 'downloadConfigFile').mockImplementation(() => true);
    const onRestoreBackup = vi.fn();

    localStorage.setItem(
      'vim_practice_progress_v1',
      JSON.stringify({ 1: { completed: true, bestStars: 3, minKeystrokes: 5 } })
    );
    const validBackup = exportBackupJson();

    render(
      <ConfigExporterBackupTab
        isOpen={true}
        activeMainTab="backup"
        onRestoreBackup={onRestoreBackup}
      />
    );

    expect(screen.getByTestId('backup-section').className).not.toContain('is-hidden');
    expect(screen.getByTestId('backup-summary-badge')).toHaveTextContent('완료 레슨 1개');

    fireEvent.click(screen.getByTestId('copy-backup-btn'));
    await waitFor(() => {
      expect(copySpy).toHaveBeenCalled();
      expect(screen.getByTestId('copy-backup-btn')).toHaveTextContent('복사 완료');
    });

    fireEvent.click(screen.getByTestId('download-backup-btn'));
    expect(downloadSpy).toHaveBeenCalledWith(expect.stringMatching(/^vim-practice-backup-.*\.json$/), expect.any(String));

    // Empty restore shows validation error
    fireEvent.click(screen.getByTestId('apply-backup-btn'));
    expect(screen.getByTestId('backup-status-msg')).toHaveTextContent('입력하거나');

    // Invalid JSON shows error
    fireEvent.change(screen.getByTestId('import-backup-textarea'), { target: { value: '{broken json' } });
    fireEvent.click(screen.getByTestId('apply-backup-btn'));
    expect(screen.getByTestId('backup-status-msg')).toHaveTextContent('유효한 JSON');

    // Switch mode and restore valid backup
    fireEvent.click(screen.getByTestId('restore-mode-replace'));
    fireEvent.change(screen.getByTestId('import-backup-textarea'), { target: { value: validBackup } });
    fireEvent.click(screen.getByTestId('apply-backup-btn'));

    expect(screen.getByTestId('backup-status-msg')).toHaveTextContent('백업 복원 완료');
    expect(onRestoreBackup).toHaveBeenCalledTimes(1);
  });
});
