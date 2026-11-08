import React, { useMemo } from 'react';
import { ClipboardRegister, RegisterEntry } from '../../vim-engine';
import './RegisterInspector.css';
import { t } from '../../i18n';

export interface RegisterInspectorProps {
  registers?: Record<string, RegisterEntry>;
  activeRegister?: string | null;
  clipboard?: ClipboardRegister;
  isOpen: boolean;
  onToggle: () => void;
}

interface DisplayRegisterItem {
  key: string;
  label: string;
  type: 'char' | 'line' | 'macro';
  content: string;
  isSpecial?: boolean;
}

export const RegisterInspector: React.FC<RegisterInspectorProps> = ({
  registers = {},
  activeRegister,
  clipboard,
  isOpen,
  onToggle,
}) => {
  // 표시할 레지스터 목록 계산
  const registerItems = useMemo<DisplayRegisterItem[]>(() => {
    const items: DisplayRegisterItem[] = [];

    // 1. 기본 무명 레지스터 ("")
    const unnamedEntry = registers['"'];
    const defaultContent = unnamedEntry
      ? (Array.isArray(unnamedEntry.content) ? unnamedEntry.content.join('') : unnamedEntry.content)
      : clipboard?.content ?? '';

    items.push({
      key: '""',
      label: t('기본 클립보드 (Unnamed)'),
      type: unnamedEntry?.type === 'line' || clipboard?.type === 'line' ? 'line' : 'char',
      content: defaultContent,
      isSpecial: true,
    });

    // 2. 복사 전용 레지스터 ("0)
    const zeroEntry = registers['0'];
    if (zeroEntry) {
      items.push({
        key: '"0',
        label: t('최근 복사본 (Yank)'),
        type: zeroEntry.type === 'line' ? 'line' : 'char',
        content: Array.isArray(zeroEntry.content) ? zeroEntry.content.join('') : zeroEntry.content,
        isSpecial: true,
      });
    }

    // 3. 명명된 레지스터 ("a ~ "z) 및 기타 저장소
    const sortedKeys = Object.keys(registers)
      .filter((k) => k !== '"' && k !== '0')
      .sort();

    for (const k of sortedKeys) {
      const entry = registers[k];
      if (!entry) continue;
      const isMacro = entry.type === 'macro';
      const contentStr = Array.isArray(entry.content)
        ? (isMacro ? entry.content.join(' ') : entry.content.join(''))
        : entry.content;

      items.push({
        key: `"${k}`,
        label: isMacro ? t('매크로 @{k}', { k }) : t('레지스터 "{k}', { k }),
        type: entry.type,
        content: contentStr,
      });
    }

    return items;
  }, [registers, clipboard]);

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="register-inspector-panel" data-testid="register-inspector">
      <div className="inspector-header">
        <div className="inspector-title-area">
          <span className="inspector-icon">📋</span>
          <h3 className="inspector-title">Register Inspector</h3>
          <span className="inspector-subtitle">{t('레지스터 실시간 현황')}</span>
        </div>
        <button
          className="inspector-close-btn"
          onClick={onToggle}
          title={t('레지스터 패널 닫기')}
          data-testid="close-register-inspector-btn"
        >
          ✕
        </button>
      </div>

      {/* 활성 레지스터 알림 배너 */}
      {activeRegister && (
        <div className="active-register-banner" data-testid="active-register-banner">
          <span className="pulse-dot" />
          <span>
            {t('다음 연산 대상 레지스터:')} <strong>&quot;{activeRegister}&quot;</strong>
            {activeRegister === '_' && t(' (블랙홀: 삭제/복사 시 기존 클립보드 보존)')}
          </span>
        </div>
      )}

      {/* 레지스터 가이드 툴팁 */}
      <div className="inspector-guide">
        <span className="guide-chip"><code>&quot;ayiw</code> {t('a에 복사')}</span>
        <span className="guide-chip"><code>&quot;ap</code> {t('a에서 붙여넣기')}</span>
        <span className="guide-chip"><code>&quot;0p</code> {t('최근 복사본')}</span>
        <span className="guide-chip"><code>&quot;_dd</code> {t('블랙홀 삭제')}</span>
      </div>

      <div className="inspector-table-wrapper">
        <table className="inspector-table">
          <thead>
            <tr>
              <th className="col-reg">{t('레지스터')}</th>
              <th className="col-type">{t('타입')}</th>
              <th className="col-content">{t('내용')}</th>
            </tr>
          </thead>
          <tbody>
            {registerItems.map((item) => (
              <tr
                key={item.key}
                className={`register-row ${activeRegister && item.key === `"${activeRegister}` ? 'active' : ''}`}
                data-testid={`register-row-${item.key.replace(/"/g, '')}`}
              >
                <td className="cell-reg">
                  <span className={`reg-badge ${item.isSpecial ? 'special' : ''}`}>
                    {item.key}
                  </span>
                </td>
                <td className="cell-type">
                  <span className={`type-badge type-${item.type}`}>
                    {item.type === 'line' ? t('줄 단위') : item.type === 'macro' ? t('매크로') : t('문자열')}
                  </span>
                </td>
                <td className="cell-content">
                  {item.content ? (
                    <code className="content-code" title={item.content}>
                      {item.content.length > 60 ? `${item.content.slice(0, 60)}…` : item.content}
                    </code>
                  ) : (
                    <span className="empty-content">{t('(비어 있음)')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
};
