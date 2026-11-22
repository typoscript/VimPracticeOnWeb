import React, { useState, useEffect } from 'react';
import {
  UserInitConfig,
  UserInitFormat,
  USER_INIT_PRESETS,
  DEFAULT_USER_INIT_CONFIG,
} from '../../utils/userInitConfig';
import { t } from '../../i18n';

export interface ConfigExporterPlaygroundTabProps {
  activeMainTab: string;
  userInitConfig?: UserInitConfig;
  onApplyUserInitConfig?: (config: UserInitConfig) => { ok: boolean; message: string };
}

/**
 * 설정 모달 내 나만의 init.lua / .vimrc 영구 설정 플레이그라운드 탭입니다.
 */
export const ConfigExporterPlaygroundTab: React.FC<ConfigExporterPlaygroundTabProps> = ({
  activeMainTab,
  userInitConfig = DEFAULT_USER_INIT_CONFIG,
  onApplyUserInitConfig,
}) => {
  const [format, setFormat] = useState<UserInitFormat>(userInitConfig.format);
  const [code, setCode] = useState<string>(userInitConfig.code);
  const [enabled, setEnabled] = useState<boolean>(userInitConfig.enabled);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setFormat(userInitConfig.format);
    setCode(userInitConfig.code);
    setEnabled(userInitConfig.enabled);
  }, [userInitConfig.format, userInitConfig.code, userInitConfig.enabled]);

  const handleLoadPreset = (presetId: string) => {
    const preset = USER_INIT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setFormat(preset.format);
    setCode(preset.code);
    setEnabled(true);
    setStatus(null);
  };

  const handleApply = () => {
    const nextCfg: UserInitConfig = { format, code, enabled };
    if (onApplyUserInitConfig) {
      const res = onApplyUserInitConfig(nextCfg);
      setStatus({ kind: res.ok ? 'ok' : 'err', text: res.message });
    }
  };

  const handleClear = () => {
    const cleared: UserInitConfig = { format, code: '', enabled };
    setCode('');
    if (onApplyUserInitConfig) {
      const res = onApplyUserInitConfig(cleared);
      setStatus({ kind: res.ok ? 'ok' : 'err', text: res.message });
    }
  };

  return (
    <section
      className={`playground-section ${activeMainTab !== 'playground' ? 'is-hidden' : ''}`}
      data-testid="playground-section"
    >
      <div className="backup-card">
        <div className="backup-card-header">
          <h3 className="section-label">🌙 {t('나만의 init.lua / .vimrc 영구 설정 플레이그라운드')}</h3>
          <label className="playground-toggle-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              data-testid="playground-enabled-checkbox"
            />
            <span>{t('자유 연습장 시작 시 자동 적용')}</span>
          </label>
        </div>

        <p className="backup-desc">
          {t(
            'Neovim Lua(vim.opt.autopairs/cmdlinepopup, vim.keymap.set, vim.snippets.add, vim.g.mapleader) 또는 .vimrc 스크립트를 작성하고 저장하면 현재 에디터와 Which-Key·nvim-cmp 팝업, 자유 연습장에 즉시 반영됩니다.'
          )}
        </p>

        <div className="playground-controls-row">
          <div className="playground-format-group">
            <button
              type="button"
              className={`platform-tab ${format === 'lua' ? 'active' : ''}`}
              onClick={() => setFormat('lua')}
              data-testid="playground-format-lua"
            >
              🌙 init.lua (Lua)
            </button>
            <button
              type="button"
              className={`platform-tab ${format === 'vimrc' ? 'active' : ''}`}
              onClick={() => setFormat('vimrc')}
              data-testid="playground-format-vimrc"
            >
              📄 .vimrc (Vimscript)
            </button>
          </div>

          <div className="playground-presets-group">
            <span className="playground-preset-caption">{t('⚡ 원클릭 프리셋 불러오기')}</span>
            {USER_INIT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="playground-preset-chip"
                onClick={() => handleLoadPreset(preset.id)}
                data-testid={`playground-preset-${preset.id}`}
              >
                {t(preset.label)}
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="backup-textarea playground-textarea"
          rows={11}
          value={code}
          spellCheck={false}
          placeholder={t('init.lua / .vimrc 코드를 입력하세요...')}
          onChange={(e) => {
            setCode(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          data-testid="playground-code-textarea"
        />

        <div className="backup-actions-row">
          <button
            type="button"
            className="action-btn download-btn"
            onClick={handleApply}
            data-testid="playground-apply-btn"
          >
            {t('▶ 저장 및 에디터 즉시 적용')}
          </button>
          <button
            type="button"
            className="action-btn close-action-btn"
            onClick={handleClear}
            data-testid="playground-clear-btn"
          >
            {t('🧹 코드 비우기')}
          </button>
        </div>

        {status && (
          <div
            className={`backup-status-msg ${status.kind === 'ok' ? 'is-ok' : 'is-err'}`}
            data-testid="playground-status-msg"
          >
            {status.text}
          </div>
        )}
      </div>
    </section>
  );
};
