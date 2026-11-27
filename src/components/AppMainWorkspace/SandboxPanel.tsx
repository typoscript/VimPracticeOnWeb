import React, { useRef } from 'react';
import { LOCAL_FILE_ACCEPT } from '../../utils/sandboxFileAccept';
import { getReturnToNormalKeys } from '../../utils/returnToNormalKeys';
import { t } from '../../i18n';
import { SANDBOX_QUICK_TRY_CHIPS } from './sandboxQuickTryChips';
import type { WorkspaceEditorProps, WorkspaceMissionProps } from './workspaceTypes';

interface SandboxPanelProps {
  mission: WorkspaceMissionProps;
  editor: WorkspaceEditorProps;
}

// 자유 연습장 상단 패널: 로컬 파일 열기·내보내기, 로컬 파일 전환 칩, '바로 체험' 칩
export const SandboxPanel: React.FC<SandboxPanelProps> = ({ mission, editor }) => {
  const { editorState, displayEditorState } = editor;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="sandbox-panel" data-testid="sandbox-panel">
      <div className="sandbox-top-row">
        <div className="sandbox-info">
          <span className="sandbox-badge">🧪 SANDBOX</span>
          <span className="sandbox-desc">
            {t('미션 제약 없이 모든 Vim 키보드 명령어를 자유롭게 실험해 볼 수 있습니다.')}
          </span>
        </div>
        <div className="sandbox-actions">
          {mission.onImportLocalFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={LOCAL_FILE_ACCEPT}
                className="sandbox-file-input-hidden"
                data-testid="sandbox-local-file-input"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    mission.onImportLocalFiles?.(e.target.files);
                    editor.onFocus();
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="sandbox-file-btn"
                onClick={() => fileInputRef.current?.click()}
                data-testid="sandbox-import-file-btn"
                title={t('로컬 코드 파일 불러오기 (또는 화면에 드래그&드롭)')}
              >
                {t('📂 로컬 파일 열기')}
              </button>
              <input
                ref={(el) => {
                  folderInputRef.current = el;
                  if (el) {
                    el.setAttribute('webkitdirectory', '');
                    el.setAttribute('directory', '');
                  }
                }}
                type="file"
                multiple
                className="sandbox-file-input-hidden"
                data-testid="sandbox-local-folder-input"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    mission.onImportLocalFiles?.(e.target.files);
                    editor.onFocus();
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="sandbox-file-btn"
                onClick={() => folderInputRef.current?.click()}
                data-testid="sandbox-import-folder-btn"
                title={t('프로젝트 폴더 전체를 VFS 트리로 불러오기')}
              >
                {t('📁 폴더 열기')}
              </button>
            </>
          )}
          {mission.onExportCurrentFile && (
            <button
              type="button"
              className="sandbox-export-btn"
              onClick={mission.onExportCurrentFile}
              data-testid="sandbox-export-file-btn"
              title={t('현재 버퍼의 수정된 코드를 로컬 파일로 다운로드')}
            >
              {t('💾 파일 내보내기')}
            </button>
          )}
          {mission.onExportWorkspaceZip && (
            <button
              type="button"
              className="sandbox-export-btn zip"
              onClick={mission.onExportWorkspaceZip}
              data-testid="sandbox-export-zip-btn"
              title={t('작업공간의 모든 파일을 .zip 아카이브로 한 번에 다운로드')}
            >
              {t('📦 ZIP 내보내기')}
            </button>
          )}
          <button
            className="sandbox-byoc-btn"
            onClick={mission.onOpenBYOCModal}
            data-testid="open-byoc-modal-btn"
            title={t('내 실제 업무 코드를 붙여넣어 자동 리팩토링 미션 생성')}
          >
            {t('✨ 내 코드로 리팩토링 미션 생성 (BYOC)')}
          </button>
          <button
            className="sandbox-reset-btn"
            onClick={mission.onResetSandbox}
            data-testid="sandbox-reset-btn"
          >
            {t('🔄 코드 초기화')}
          </button>
        </div>
      </div>
      {mission.localSandboxFiles && mission.localSandboxFiles.length > 0 && (
        <div className="sandbox-local-files-bar" data-testid="sandbox-local-files-bar">
          <span className="sandbox-local-files-label">{t('📂 로컬 파일:')}</span>
          <div className="sandbox-local-files-chips">
            {mission.localSandboxFiles.map((file) => {
              const isActive = displayEditorState.primaryFilename === file;
              return (
                <button
                  key={file}
                  type="button"
                  className={`sandbox-local-file-chip ${isActive ? 'active' : ''}`}
                  data-testid={`sandbox-local-file-${file}`}
                  onClick={() => {
                    mission.onOpenSandboxFile?.(file);
                    editor.onFocus();
                  }}
                >
                  📄 {file}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="sandbox-quick-try" data-testid="sandbox-quick-try">
        <span className="sandbox-quick-try-label">{t('바로 체험:')}</span>
        <div className="sandbox-quick-try-chips">
          {SANDBOX_QUICK_TRY_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="sandbox-quick-chip"
              data-testid={`sandbox-chip-${chip.id}`}
              title={t(chip.titleKey)}
              tabIndex={-1}
              onClick={() => {
                editor.onFocus();
                const keys = [...getReturnToNormalKeys(editorState), ...chip.keys];
                for (const k of keys) {
                  editor.processKeyInput(k);
                }
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
