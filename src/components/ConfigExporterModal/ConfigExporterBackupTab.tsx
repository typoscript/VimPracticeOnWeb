import React, { useState, useMemo, useRef } from 'react';
import { downloadConfigFile } from '../../utils/configGenerator';
import { copyTextToClipboard } from '../../utils/dailyChallenge';
import {
  BackupRestoreMode,
  exportBackupJson,
  getBackupSummary,
  importBackupJson,
} from '../../utils/backupStorage';
import { t } from '../../i18n';

export interface ConfigExporterBackupTabProps {
  isOpen: boolean;
  activeMainTab: string;
  onRestoreBackup?: () => void;
}

export const ConfigExporterBackupTab: React.FC<ConfigExporterBackupTabProps> = ({
  isOpen,
  activeMainTab,
  onRestoreBackup,
}) => {
  const [backupCopied, setBackupCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('merge');
  const [backupStatus, setBackupStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const backupSummary = useMemo(
    () => getBackupSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, activeMainTab, summaryVersion]
  );

  const handleCopyBackup = async () => {
    const ok = await copyTextToClipboard(exportBackupJson());
    if (ok) {
      setBackupCopied(true);
      setTimeout(() => setBackupCopied(false), 2000);
    }
  };

  const handleDownloadBackup = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    downloadConfigFile(`vim-practice-backup-${dateTag}.json`, exportBackupJson());
  };

  const handleBackupFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImportText(reader.result);
        setBackupStatus(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyBackup = () => {
    const raw = importText.trim();
    if (!raw) {
      setBackupStatus({ kind: 'err', text: t('복원할 JSON 백업 내용을 입력하거나 파일을 선택해주세요.') });
      return;
    }
    const result = importBackupJson(raw, restoreMode);
    if (!result.ok) {
      const msgText =
        result.errorCode === 'INVALID_JSON'
          ? t('유효한 JSON 형식이 아닙니다.')
          : result.errorCode === 'EMPTY_BACKUP'
          ? t('복원할 유효한 학습 데이터가 백업에 포함되어 있지 않습니다.')
          : t('지원되지 않는 백업 파일 형식입니다.');
      setBackupStatus({ kind: 'err', text: msgText });
      return;
    }
    setSummaryVersion((v) => v + 1);
    setBackupStatus({
      kind: 'ok',
      text: t('백업 복원 완료: {keys}개 항목 · 완료 레슨 {lessons}개', {
        keys: result.restoredKeys.length,
        lessons: result.completedLessons,
      }),
    });
    onRestoreBackup?.();
  };

  return (
    <section
      className={`backup-section ${activeMainTab !== 'backup' ? 'is-hidden' : ''}`}
      data-testid="backup-section"
    >
      <div className="backup-card">
        <div className="backup-card-header">
          <h3 className="section-label">📤 {t('현재 학습 진도 JSON 내보내기')}</h3>
          <span className="backup-summary-badge" data-testid="backup-summary-badge">
            {t('완료 레슨 {lessons}개 · 저장 항목 {keys}개', {
              lessons: backupSummary.completedLessons,
              keys: backupSummary.keyCount,
            })}
          </span>
        </div>
        <p className="backup-desc">
          {t('레슨 별점, 던전 진행도, 도장/스피드런 기록, 분석 통계, 커스텀 키매핑과 환경 설정을 한 번에 JSON으로 백업합니다.')}
        </p>
        <div className="backup-actions-row">
          <button
            type="button"
            className={`action-btn copy-btn ${backupCopied ? 'copied' : ''}`}
            onClick={handleCopyBackup}
            data-testid="copy-backup-btn"
          >
            {backupCopied ? t('✅ JSON 복사 완료!') : t('📋 백업 JSON 복사')}
          </button>
          <button
            type="button"
            className="action-btn download-btn"
            onClick={handleDownloadBackup}
            data-testid="download-backup-btn"
          >
            💾 {t('백업 파일 다운로드 (.json)')}
          </button>
        </div>
      </div>

      <div className="backup-card">
        <div className="backup-card-header">
          <h3 className="section-label">📥 {t('JSON 백업에서 복원하기')}</h3>
          <div className="backup-mode-select" role="group" aria-label={t('복원 방식')}>
            <label className="backup-mode-option">
              <input
                type="radio"
                name="restoreMode"
                value="merge"
                checked={restoreMode === 'merge'}
                onChange={() => setRestoreMode('merge')}
                data-testid="restore-mode-merge"
              />
              {t('진도 병합 (최고 기록 유지)')}
            </label>
            <label className="backup-mode-option">
              <input
                type="radio"
                name="restoreMode"
                value="replace"
                checked={restoreMode === 'replace'}
                onChange={() => setRestoreMode('replace')}
                data-testid="restore-mode-replace"
              />
              {t('완전 덮어쓰기')}
            </label>
          </div>
        </div>

        <div className="backup-file-row">
          <input
            ref={backupFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleBackupFileChange}
            className="backup-file-input"
            data-testid="import-backup-file-input"
          />
          <button
            type="button"
            className="action-btn"
            onClick={() => backupFileInputRef.current?.click()}
            data-testid="pick-backup-file-btn"
          >
            📂 {t('.json 파일 불러오기')}
          </button>
        </div>

        <textarea
          className="backup-textarea"
          rows={5}
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value);
            setBackupStatus(null);
          }}
          placeholder={t('백업한 JSON 내용을 붙여넣거나 위 버튼으로 .json 파일을 선택하세요.')}
          data-testid="import-backup-textarea"
        />

        {backupStatus && (
          <div
            className={`backup-status-msg ${backupStatus.kind === 'ok' ? 'is-ok' : 'is-err'}`}
            data-testid="backup-status-msg"
          >
            {backupStatus.text}
          </div>
        )}

        <div className="backup-actions-row">
          <button
            type="button"
            className="action-btn download-btn"
            onClick={handleApplyBackup}
            data-testid="apply-backup-btn"
          >
            📥 {t('백업 복원 적용')}
          </button>
        </div>
      </div>
    </section>
  );
};
