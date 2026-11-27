import React, { useState, useMemo } from 'react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  ConfigPlatform,
  generateVimrc,
  generateInitLua,
  generateVSCodeSettings,
  generateIdeaVimrc,
  downloadConfigFile,
} from '../../utils/configGenerator';
import { copyTextToClipboard } from '../../utils/dailyChallenge';
import { CustomKeymapItem } from '../../utils/keymapStorage';
import './ConfigExporterModal.css';
import { t } from '../../i18n';
import { ConfigExporterKeymapsTab } from './ConfigExporterKeymapsTab';
import { ConfigExporterBackupTab } from './ConfigExporterBackupTab';
import { ConfigExporterPlaygroundTab } from './ConfigExporterPlaygroundTab';
import type { UserInitConfig } from '../../utils/userInitConfig';

export interface ConfigExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  relativenumber: boolean;
  theme: string;
  leaderKey: string;
  activePresets: Record<string, boolean>;
  onTogglePreset: (presetId: string) => void;
  onChangeLeaderKey: (newLeader: string) => void;
  customKeymaps?: CustomKeymapItem[];
  onAddCustomKeymap?: (item: Omit<CustomKeymapItem, 'id'>) => void;
  onDeleteCustomKeymap?: (id: string) => void;
  options?: Partial<import('../../vim-engine').VimOptions>;
  onRestoreBackup?: () => void;
  userInitConfig?: UserInitConfig;
  onApplyUserInitConfig?: (config: UserInitConfig) => { ok: boolean; message: string };
}

export const ConfigExporterModal: React.FC<ConfigExporterModalProps> = ({
  isOpen,
  onClose,
  relativenumber,
  theme,
  leaderKey,
  activePresets,
  onTogglePreset,
  onChangeLeaderKey,
  customKeymaps = [],
  onAddCustomKeymap,
  onDeleteCustomKeymap,
  options,
  onRestoreBackup,
  userInitConfig,
  onApplyUserInitConfig,
}) => {
  useEscapeToClose(isOpen, onClose);
  const [activeMainTab, setActiveMainTab] = useState<'keymaps' | 'playground' | 'exporter' | 'backup'>('keymaps');
  const [activeTab, setActiveTab] = useState<ConfigPlatform>('vimrc');
  const [copied, setCopied] = useState(false);

  const exportOptions = useMemo(
    () => ({
      relativenumber,
      theme,
      leaderKey,
      activePresets,
      customKeymaps,
      options,
    }),
    [relativenumber, theme, leaderKey, activePresets, customKeymaps, options]
  );

  const configContent = useMemo(() => {
    switch (activeTab) {
      case 'vimrc':
        return generateVimrc(exportOptions);
      case 'initLua':
        return generateInitLua(exportOptions);
      case 'vscode':
        return generateVSCodeSettings(exportOptions);
      case 'ideaVim':
        return generateIdeaVimrc(exportOptions);
      default:
        return '';
    }
  }, [activeTab, exportOptions]);

  const configFilename = useMemo(() => {
    switch (activeTab) {
      case 'vimrc':
        return '.vimrc';
      case 'initLua':
        return 'init.lua';
      case 'vscode':
        return 'settings.json';
      case 'ideaVim':
        return '.ideavimrc';
      default:
        return 'config.txt';
    }
  }, [activeTab]);

  const filePathGuide = useMemo(() => {
    switch (activeTab) {
      case 'vimrc':
        return t('경로: ~/.vimrc (Linux/Mac) 또는 ~/_vimrc (Windows)');
      case 'initLua':
        return t('경로: ~/.config/nvim/init.lua (Linux/Mac) 또는 ~/AppData/Local/nvim/init.lua (Windows)');
      case 'vscode':
        return t('경로: VS Code 설정 > Open User Settings (JSON)에 추가 붙여넣기');
      case 'ideaVim':
        return t('경로: ~/.ideavimrc (홈 디렉터리에 파일 생성 후 IntelliJ 재시작)');
      default:
        return '';
    }
  }, [activeTab]);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(configContent);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    downloadConfigFile(configFilename, configContent);
  };

  const activePresetsCount = Object.values(activePresets).filter(Boolean).length;
  const totalActiveKeymapsCount = activePresetsCount + customKeymaps.length;

  if (!isOpen) return null;

  return (
    <div className="config-modal-backdrop" onClick={onClose} data-testid="config-modal-backdrop">
      <div
        className="config-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('커스텀 키매핑 및 설정 파일 익스포터')}
        data-testid="config-modal"
      >
        <header className="config-header">
          <div className="config-title-group">
            <span className="config-icon">⚙️</span>
            <div>
              <h2 className="config-title">{t('커스텀 키매핑 & 설정 파일 익스포터')}</h2>
              <p className="config-subtitle">
                {t('웹에서 익힌 키매핑과 옵션을 내 실제 로컬 개발 환경(Vim, Neovim, VS Code, IntelliJ)으로 바로 내보내세요.')}
              </p>
            </div>
          </div>
          <button
            className="config-close-btn"
            onClick={onClose}
            aria-label={t('닫기')}
            data-testid="close-config-modal-btn"
          >
            ✕
          </button>
        </header>

        {/* 대분류 탭 전환: 키바인딩 & 프리셋 / 설정 파일 내보내기 */}
        <div className="config-nav-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeMainTab === 'keymaps'}
            className={`config-nav-tab ${activeMainTab === 'keymaps' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('keymaps')}
            data-testid="nav-keymaps-btn"
          >
            ⌨️ {t('키바인딩 & 프리셋')} ({totalActiveKeymapsCount})
          </button>
          <button
            role="tab"
            aria-selected={activeMainTab === 'playground'}
            className={`config-nav-tab ${activeMainTab === 'playground' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('playground')}
            data-testid="nav-playground-btn"
          >
            🌙 {t('init.lua 플레이그라운드')}
          </button>
          <button
            role="tab"
            aria-selected={activeMainTab === 'exporter'}
            className={`config-nav-tab ${activeMainTab === 'exporter' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('exporter')}
            data-testid="nav-export-btn"
          >
            💾 {t('설정 파일 내보내기')}
          </button>
          <button
            role="tab"
            aria-selected={activeMainTab === 'backup'}
            className={`config-nav-tab ${activeMainTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('backup')}
            data-testid="nav-backup-btn"
          >
            📦 {t('진도 백업/복원')}
          </button>
        </div>

        {/* 1~2. 키매핑 프리셋 & 커스텀 키바인딩 */}
        <ConfigExporterKeymapsTab
          activeMainTab={activeMainTab}
          leaderKey={leaderKey}
          activePresets={activePresets}
          onTogglePreset={onTogglePreset}
          onChangeLeaderKey={onChangeLeaderKey}
          customKeymaps={customKeymaps}
          onAddCustomKeymap={onAddCustomKeymap}
          onDeleteCustomKeymap={onDeleteCustomKeymap}
        />

        {/* 1-b. 나만의 init.lua / .vimrc 영구 설정 플레이그라운드 */}
        <ConfigExporterPlaygroundTab
          activeMainTab={activeMainTab}
          userInitConfig={userInitConfig}
          onApplyUserInitConfig={onApplyUserInitConfig}
        />

        {/* 3. 플랫폼별 설정 코드 뷰어 섹션 */}
        <section
          className={`exporter-viewer-section ${activeMainTab !== 'exporter' ? 'is-hidden' : ''}`}
          data-testid="exporter-viewer-section"
        >
          <div className="platform-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'vimrc'}
              className={`platform-tab ${activeTab === 'vimrc' ? 'active' : ''}`}
              onClick={() => setActiveTab('vimrc')}
              data-testid="tab-vimrc-btn"
            >
              📄 1. .vimrc (Vim)
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'initLua'}
              className={`platform-tab ${activeTab === 'initLua' ? 'active' : ''}`}
              onClick={() => setActiveTab('initLua')}
              data-testid="tab-initlua-btn"
            >
              🌙 2. init.lua (Neovim)
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'vscode'}
              className={`platform-tab ${activeTab === 'vscode' ? 'active' : ''}`}
              onClick={() => setActiveTab('vscode')}
              data-testid="tab-vscode-btn"
            >
              💙 3. settings.json (VS Code)
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'ideaVim'}
              className={`platform-tab ${activeTab === 'ideaVim' ? 'active' : ''}`}
              onClick={() => setActiveTab('ideaVim')}
              data-testid="tab-ideavim-btn"
            >
              🚀 4. .ideavimrc (IntelliJ)
            </button>
          </div>

          <div className="filepath-guide-bar">
            <span>💡 {filePathGuide}</span>
          </div>

          <div className="code-viewer-container">
            <pre className="code-pre" data-testid="config-code-preview">
              <code>{configContent}</code>
            </pre>
          </div>
        </section>

        {/* 4. 학습 진도 & 설정 JSON 백업/복원 섹션 */}
        <ConfigExporterBackupTab
          isOpen={isOpen}
          activeMainTab={activeMainTab}
          onRestoreBackup={onRestoreBackup}
        />

        {/* 하단: 액션 버튼 */}
        <footer className="config-modal-footer">
          <div className="footer-left">
            {activeMainTab === 'exporter' ? (
              <span className="file-info-badge">
                {t('파일명:')} <strong>{configFilename}</strong>
              </span>
            ) : (
              <button
                type="button"
                className="action-btn goto-export-btn"
                onClick={() => setActiveMainTab('exporter')}
                data-testid="goto-export-btn"
              >
                💾 {t('설정 파일 내보내기')} ➔
              </button>
            )}
          </div>
          <div className="footer-right">
            {activeMainTab === 'exporter' ? (
              <>
                <button
                  className={`action-btn copy-btn ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                  data-testid="copy-config-btn"
                >
                  {copied ? t('✅ 복사 완료!') : t('📋 클립보드 복사')}
                </button>
                <button
                  className="action-btn download-btn"
                  onClick={handleDownload}
                  data-testid="download-config-btn"
                >
                  {t('💾 파일 다운로드 ({file})', { file: configFilename })}
                </button>
              </>
            ) : null}
            <button
              className="action-btn close-action-btn"
              onClick={onClose}
              data-testid="confirm-config-btn"
            >
              {t('닫기')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
