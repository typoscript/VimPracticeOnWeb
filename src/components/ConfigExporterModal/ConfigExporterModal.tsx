import React, { useState, useMemo } from 'react';
import {
  ConfigPlatform,
  DEFAULT_KEYMAP_PRESETS,
  generateVimrc,
  generateInitLua,
  generateVSCodeSettings,
  generateIdeaVimrc,
  downloadConfigFile,
} from '../../utils/configGenerator';
import { copyTextToClipboard } from '../../utils/dailyChallenge';
import './ConfigExporterModal.css';

export interface ConfigExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  relativenumber: boolean;
  theme: string;
  leaderKey: string;
  activePresets: Record<string, boolean>;
  onTogglePreset: (presetId: string) => void;
  onChangeLeaderKey: (newLeader: string) => void;
  customKeymaps?: Array<{ mode: string; from: string; to: string }>;
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
  customKeymaps,
}) => {
  const [activeTab, setActiveTab] = useState<ConfigPlatform>('vimrc');
  const [copied, setCopied] = useState(false);

  const exportOptions = useMemo(
    () => ({
      relativenumber,
      theme,
      leaderKey,
      activePresets,
      customKeymaps,
    }),
    [relativenumber, theme, leaderKey, activePresets, customKeymaps]
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
        return '경로: ~/.vimrc (Linux/Mac) 또는 ~/_vimrc (Windows)';
      case 'initLua':
        return '경로: ~/.config/nvim/init.lua (Linux/Mac) 또는 ~/AppData/Local/nvim/init.lua (Windows)';
      case 'vscode':
        return '경로: VS Code 설정 > Open User Settings (JSON)에 추가 붙여넣기';
      case 'ideaVim':
        return '경로: ~/.ideavimrc (홈 디렉터리에 파일 생성 후 IntelliJ 재시작)';
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

  if (!isOpen) return null;

  return (
    <div className="config-modal-backdrop" onClick={onClose} data-testid="config-modal-backdrop">
      <div
        className="config-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="커스텀 키매핑 및 설정 파일 익스포터"
        data-testid="config-modal"
      >
        <header className="config-header">
          <div className="config-title-group">
            <span className="config-icon">⚙️</span>
            <div>
              <h2 className="config-title">커스텀 키매핑 &amp; 설정 파일 익스포터</h2>
              <p className="config-subtitle">
                웹에서 익힌 키매핑과 옵션을 내 실제 로컬 개발 환경(Vim, Neovim, VS Code, IntelliJ)으로 바로 내보내세요.
              </p>
            </div>
          </div>
          <button
            className="config-close-btn"
            onClick={onClose}
            aria-label="닫기"
            data-testid="close-config-modal-btn"
          >
            ✕
          </button>
        </header>

        {/* 상단: 커스텀 키매핑 프리셋 토글 섹션 */}
        <section className="presets-section">
          <div className="presets-header">
            <h3 className="section-label">⚡ 실무 인기 키매핑 프리셋</h3>
            <div className="leader-picker">
              <label htmlFor="leader-select">리더 키 (Leader):</label>
              <select
                id="leader-select"
                value={leaderKey}
                onChange={(e) => onChangeLeaderKey(e.target.value)}
                data-testid="leader-select"
              >
                <option value=" ">Space (공백)</option>
                <option value="\">Backslash (\)</option>
                <option value=",">Comma (,)</option>
              </select>
            </div>
          </div>

          <div className="presets-grid" data-testid="presets-grid">
            {DEFAULT_KEYMAP_PRESETS.map((preset) => {
              const checked = !!activePresets[preset.id];
              return (
                <label
                  key={preset.id}
                  className={`preset-card ${checked ? 'active' : ''}`}
                  data-testid={`preset-card-${preset.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onTogglePreset(preset.id)}
                    data-testid={`preset-checkbox-${preset.id}`}
                  />
                  <div className="preset-info">
                    <span className="preset-title">{preset.title}</span>
                    <span className="preset-desc">{preset.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* 중단: 4개 플랫폼 탭 & 설정 코드 뷰어 */}
        <section className="exporter-viewer-section">
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

        {/* 하단: 액션 버튼 */}
        <footer className="config-modal-footer">
          <div className="footer-left">
            <span className="file-info-badge">
              파일명: <strong>{configFilename}</strong>
            </span>
          </div>
          <div className="footer-right">
            <button
              className={`action-btn copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              data-testid="copy-config-btn"
            >
              {copied ? '✅ 복사 완료!' : '📋 클립보드 복사'}
            </button>
            <button
              className="action-btn download-btn"
              onClick={handleDownload}
              data-testid="download-config-btn"
            >
              💾 파일 다운로드 ({configFilename})
            </button>
            <button
              className="action-btn close-action-btn"
              onClick={onClose}
              data-testid="confirm-config-btn"
            >
              닫기
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
