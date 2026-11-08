import React, { useMemo, useState } from 'react';
import {
  ClipboardRegister,
  RegisterEntry,
  formatMacroKeysToString,
  parseMacroStringToKeys,
} from '../../vim-engine';
import './RegisterInspector.css';
import { t } from '../../i18n';

export interface RegisterInspectorProps {
  registers?: Record<string, RegisterEntry>;
  activeRegister?: string | null;
  clipboard?: ClipboardRegister;
  recordingMacro?: { register: string; keys: string[] } | null;
  isOpen: boolean;
  onToggle: () => void;
  onRunMacro?: (register: string, count?: number) => void;
  onOpenMacroDebugger?: (register: string) => void;
  onUpdateRegister?: (register: string, content: string | string[], type: 'char' | 'line' | 'macro') => void;
  onDeleteRegister?: (register: string) => void;
}

export interface DisplayRegisterItem {
  rawKey: string;
  key: string;
  label: string;
  type: 'char' | 'line' | 'macro';
  content: string;
  rawKeys?: string[];
  isSpecial?: boolean;
}

export type MacroKeyCategory = 'motion' | 'operator' | 'special' | 'mode' | 'insert';

const MOTION_KEYS = new Set([
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', 'ge', 'gE',
  '0', '$', '^', 'g_', 'gg', 'G', 'f', 't', 'F', 'T', ';', ',',
  '(', ')', '{', '}', '[', ']', '%',
]);
const OPERATOR_KEYS = new Set([
  'd', 'c', 'y', 'p', 'P', 'r', 'x', 's', 'J', '~', 'u', '>', '<', '.',
]);
const MODE_KEYS = new Set(['i', 'I', 'a', 'A', 'o', 'O', 'v', 'V', 'Ctrl-v']);

export function categorizeMacroKey(key: string): MacroKeyCategory {
  if (['Escape', 'Enter', ' ', 'Tab', 'Backspace'].includes(key) || key.startsWith('Ctrl-')) {
    return 'special';
  }
  if (MODE_KEYS.has(key)) return 'mode';
  if (OPERATOR_KEYS.has(key)) return 'operator';
  if (MOTION_KEYS.has(key) || /^\d+$/.test(key)) return 'motion';
  return 'insert';
}

export function formatMacroKeyDisplay(key: string): string {
  if (key === 'Escape') return '<Esc>';
  if (key === 'Enter') return '<CR>';
  if (key === ' ') return '<Space>';
  if (key === 'Tab') return '<Tab>';
  if (key === 'Backspace') return '<BS>';
  if (key.startsWith('Ctrl-')) return `<C-${key.slice(5)}>`;
  return key;
}

export function parseMacroInputToKeys(input: string): string[] {
  return parseMacroStringToKeys(input);
}

export function formatKeysToMacroInput(keys: string[] | string): string {
  if (typeof keys === 'string') return keys;
  return formatMacroKeysToString(keys);
}

export const RegisterInspector: React.FC<RegisterInspectorProps> = ({
  registers = {},
  activeRegister,
  clipboard,
  recordingMacro,
  isOpen,
  onToggle,
  onRunMacro,
  onOpenMacroDebugger,
  onUpdateRegister,
  onDeleteRegister,
}) => {
  const [filter, setFilter] = useState<'all' | 'macro' | 'clipboard'>('all');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 표시할 레지스터 목록 계산
  const registerItems = useMemo<DisplayRegisterItem[]>(() => {
    const items: DisplayRegisterItem[] = [];

    // 1. 기본 무명 레지스터 ("")
    const unnamedEntry = registers['"'];
    const defaultContent = unnamedEntry
      ? (Array.isArray(unnamedEntry.content) ? unnamedEntry.content.join('') : unnamedEntry.content)
      : clipboard?.content ?? '';

    items.push({
      rawKey: '"',
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
        rawKey: '0',
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
      const isMacro = entry.type === 'macro' || Array.isArray(entry.content);
      const rawKeys = Array.isArray(entry.content)
        ? entry.content
        : (isMacro ? parseMacroInputToKeys(entry.content) : undefined);
      const contentStr = Array.isArray(entry.content)
        ? (isMacro ? entry.content.map(formatMacroKeyDisplay).join('') : entry.content.join(''))
        : entry.content;

      items.push({
        rawKey: k,
        key: `"${k}`,
        label: isMacro ? t('매크로 @{k}', { k }) : t('레지스터 "{k}', { k }),
        type: isMacro ? 'macro' : entry.type,
        content: contentStr,
        rawKeys,
      });
    }

    return items;
  }, [registers, clipboard]);

  const filteredItems = useMemo(() => {
    if (filter === 'macro') {
      return registerItems.filter((i) => i.type === 'macro');
    }
    if (filter === 'clipboard') {
      return registerItems.filter((i) => i.isSpecial || i.type === 'char' || i.type === 'line');
    }
    return registerItems;
  }, [registerItems, filter]);

  const handleStartEdit = (item: DisplayRegisterItem) => {
    setEditingKey(item.rawKey);
    if (item.type === 'macro' && item.rawKeys) {
      setEditInput(formatKeysToMacroInput(item.rawKeys));
    } else {
      setEditInput(item.content);
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditInput('');
  };

  const handleSaveEdit = (item: DisplayRegisterItem) => {
    if (!onUpdateRegister) return;
    if (item.type === 'macro') {
      const keys = parseMacroInputToKeys(editInput);
      onUpdateRegister(item.rawKey, keys, 'macro');
    } else {
      onUpdateRegister(item.rawKey, editInput, item.type);
    }
    setEditingKey(null);
    setEditInput('');
    setToastMessage(t('💾 레지스터가 수정되었습니다.'));
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleCopy = (text: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setToastMessage(t('📋 클립보드에 복사되었습니다.'));
      setTimeout(() => setToastMessage(null), 2000);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="register-inspector-panel" data-testid="register-inspector">
      <div className="inspector-header">
        <div className="inspector-title-area">
          <span className="inspector-icon">📋</span>
          <h3 className="inspector-title">Register & Macro Inspector</h3>
          <span className="inspector-subtitle">{t('레지스터 & 매크로 실시간 인스펙터')}</span>
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

      {/* 토스트 알림 */}
      {toastMessage && <div className="inspector-toast">{toastMessage}</div>}

      {/* 녹화 중 실시간 라이브 스트림 배너 */}
      {recordingMacro && (
        <div className="recording-macro-banner" data-testid="recording-macro-banner">
          <span className="rec-dot" />
          <span className="rec-text">
            <strong>REC @{recordingMacro.register}</strong> ({t('{n}개 키 기록 중', { n: recordingMacro.keys.length })}):
          </span>
          <div className="rec-stream">
            {recordingMacro.keys.map((k, i) => (
              <span key={i} className={`macro-token-chip token-${categorizeMacroKey(k)}`}>
                {formatMacroKeyDisplay(k)}
              </span>
            ))}
          </div>
        </div>
      )}

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

      {/* 필터 탭 & 가이드 */}
      <div className="inspector-top-controls">
        <div className="inspector-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            data-testid="filter-tab-all"
          >
            {t('전체')} ({registerItems.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'macro' ? 'active' : ''}`}
            onClick={() => setFilter('macro')}
            data-testid="filter-tab-macro"
          >
            {t('매크로')} ({registerItems.filter((i) => i.type === 'macro').length})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'clipboard' ? 'active' : ''}`}
            onClick={() => setFilter('clipboard')}
            data-testid="filter-tab-clipboard"
          >
            {t('클립보드')} ({registerItems.filter((i) => i.isSpecial).length})
          </button>
        </div>

        <div className="inspector-guide">
          <span className="guide-chip"><code>&quot;ayiw</code> {t('a에 복사')}</span>
          <span className="guide-chip"><code>&quot;ap</code> {t('a에서 붙여넣기')}</span>
          <span className="guide-chip"><code>@a</code> {t('매크로 실행')}</span>
          <span className="guide-chip"><code>&quot;_dd</code> {t('블랙홀 삭제')}</span>
        </div>
      </div>

      <div className="inspector-table-wrapper">
        <table className="inspector-table">
          <thead>
            <tr>
              <th className="col-reg">{t('레지스터')}</th>
              <th className="col-type">{t('타입')}</th>
              <th className="col-content">{t('내용 및 키 시퀀스')}</th>
              <th className="col-actions">{t('작업')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-filter-cell">
                  {t('해당하는 레지스터가 없습니다.')}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isEditing = editingKey === item.rawKey;
                return (
                  <React.Fragment key={item.key}>
                    <tr
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
                        {item.type === 'macro' && item.rawKeys && item.rawKeys.length > 0 ? (
                          <div className="macro-token-flow">
                            {item.rawKeys.map((k, idx) => (
                              <span
                                key={idx}
                                className={`macro-token-chip token-${categorizeMacroKey(k)}`}
                                title={k}
                              >
                                {formatMacroKeyDisplay(k)}
                              </span>
                            ))}
                          </div>
                        ) : item.content ? (
                          <code className="content-code" title={item.content}>
                            {item.content.length > 60 ? `${item.content.slice(0, 60)}…` : item.content}
                          </code>
                        ) : (
                          <span className="empty-content">{t('(비어 있음)')}</span>
                        )}
                      </td>
                      <td className="cell-actions">
                        <div className="row-actions">
                          {item.type === 'macro' && onRunMacro && (
                            <button
                              type="button"
                              className="action-btn run-btn"
                              onClick={() => onRunMacro(item.rawKey, 1)}
                              title={t('매크로 실행 (@{k})', { k: item.rawKey })}
                              data-testid={`run-macro-${item.rawKey}`}
                            >
                              ▶
                            </button>
                          )}
                          {item.type === 'macro' && onOpenMacroDebugger && (
                            <button
                              type="button"
                              className="action-btn debug-btn"
                              onClick={() => onOpenMacroDebugger(item.rawKey)}
                              title={t('매크로 디버거 열기')}
                              data-testid={`debug-macro-${item.rawKey}`}
                            >
                              🎞️
                            </button>
                          )}
                          {onUpdateRegister && (
                            <button
                              type="button"
                              className="action-btn edit-btn"
                              onClick={() => handleStartEdit(item)}
                              title={t('레지스터 편집')}
                              data-testid={`edit-reg-${item.rawKey}`}
                            >
                              ✏️
                            </button>
                          )}
                          {onDeleteRegister && !item.isSpecial && (
                            <button
                              type="button"
                              className="action-btn delete-btn"
                              onClick={() => onDeleteRegister(item.rawKey)}
                              title={t('레지스터 비우기')}
                              data-testid={`delete-reg-${item.rawKey}`}
                            >
                              🗑️
                            </button>
                          )}
                          <button
                            type="button"
                            className="action-btn copy-btn"
                            onClick={() => handleCopy(item.content)}
                            title={t('클립보드 복사')}
                          >
                            📋
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* 인라인 매크로/레지스터 에디터 행 */}
                    {isEditing && (
                      <tr className="register-edit-row" data-testid={`edit-row-${item.rawKey}`}>
                        <td colSpan={4}>
                          <div className="inline-editor-box">
                            <div className="editor-input-row">
                              <input
                                type="text"
                                className="inline-edit-input"
                                value={editInput}
                                onChange={(e) => setEditInput(e.target.value)}
                                placeholder={
                                  item.type === 'macro'
                                    ? t('매크로 키스트로크 입력 (예: Ihello<Esc>j0)')
                                    : t('레지스터 내용 입력')
                                }
                                data-testid={`inline-edit-input-${item.rawKey}`}
                              />
                              <button
                                type="button"
                                className="save-edit-btn"
                                onClick={() => handleSaveEdit(item)}
                                data-testid={`save-reg-${item.rawKey}`}
                              >
                                💾 {t('저장')}
                              </button>
                              <button
                                type="button"
                                className="cancel-edit-btn"
                                onClick={handleCancelEdit}
                              >
                                ✕ {t('취소')}
                              </button>
                            </div>
                            {item.type === 'macro' && (
                              <div className="edit-token-preview">
                                <span className="preview-label">{t('키스트로크 미리보기:')}</span>
                                <div className="preview-chips">
                                  {parseMacroInputToKeys(editInput).map((k, i) => (
                                    <span
                                      key={i}
                                      className={`macro-token-chip token-${categorizeMacroKey(k)}`}
                                    >
                                      {formatMacroKeyDisplay(k)}
                                    </span>
                                  ))}
                                </div>
                                <div className="quick-tags">
                                  <button
                                    type="button"
                                    onClick={() => setEditInput((prev) => prev + '<Esc>')}
                                  >
                                    + &lt;Esc&gt;
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditInput((prev) => prev + '<CR>')}
                                  >
                                    + &lt;CR&gt;
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditInput((prev) => prev + '<Space>')}
                                  >
                                    + &lt;Space&gt;
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditInput((prev) => prev + '<Tab>')}
                                  >
                                    + &lt;Tab&gt;
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
};
