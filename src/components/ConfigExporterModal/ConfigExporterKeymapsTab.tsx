import React, { useState, useMemo, useRef } from 'react';
import { DEFAULT_KEYMAP_PRESETS } from '../../utils/configGenerator';
import { CustomKeymapItem } from '../../utils/keymapStorage';
import { t } from '../../i18n';

const TEMPLATE_SUGGESTIONS = [
  { mode: 'normal' as const, from: 'Y', to: 'y$', desc: '줄 끝까지 복사' },
  { mode: 'normal' as const, from: '<leader>p', to: '"+p', desc: '클립보드 붙여넣기' },
  { mode: 'normal' as const, from: '<leader>y', to: '"+y', desc: '클립보드 복사' },
  { mode: 'insert' as const, from: 'fd', to: '<Esc>', desc: '빠른 노멀 모드 복귀' },
  { mode: 'normal' as const, from: '<leader>h', to: ':noh<CR>', desc: '검색 하이라이트 끄기' },
];

const SPECIAL_KEY_CHIPS = [
  '<leader>',
  '<Esc>',
  '<CR>',
  '<Space>',
  '<Tab>',
  '<C-w>',
  '"+',
  '"_',
  'Ctrl-',
];

export interface ConfigExporterKeymapsTabProps {
  activeMainTab: string;
  leaderKey: string;
  activePresets: Record<string, boolean>;
  onTogglePreset: (presetId: string) => void;
  onChangeLeaderKey: (newLeader: string) => void;
  customKeymaps: CustomKeymapItem[];
  onAddCustomKeymap?: (item: Omit<CustomKeymapItem, 'id'>) => void;
  onDeleteCustomKeymap?: (id: string) => void;
}

export const ConfigExporterKeymapsTab: React.FC<ConfigExporterKeymapsTabProps> = ({
  activeMainTab,
  leaderKey,
  activePresets,
  onTogglePreset,
  onChangeLeaderKey,
  customKeymaps,
  onAddCustomKeymap,
  onDeleteCustomKeymap,
}) => {
  // 커스텀 키매핑 입력 폼 상태
  const [newMode, setNewMode] = useState<'normal' | 'insert' | 'visual'>('normal');
  const [newLhs, setNewLhs] = useState('');
  const [newRhs, setNewRhs] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'normal' | 'insert' | 'visual'>('all');
  const [lastFocusedField, setLastFocusedField] = useState<'lhs' | 'rhs'>('rhs');

  const lhsInputRef = useRef<HTMLInputElement>(null);
  const rhsInputRef = useRef<HTMLInputElement>(null);

  // 특수키 칩 클릭 시 활성 필드에 삽입
  const handleInsertToken = (token: string) => {
    if (lastFocusedField === 'lhs') {
      setNewLhs((prev) => prev + token);
      lhsInputRef.current?.focus();
    } else {
      setNewRhs((prev) => prev + token);
      rhsInputRef.current?.focus();
    }
  };

  // 템플릿 추천 클릭 시 폼에 채우기
  const handleApplyTemplate = (tmpl: { mode: 'normal' | 'insert' | 'visual'; from: string; to: string; desc: string }) => {
    setNewMode(tmpl.mode);
    setNewLhs(tmpl.from);
    setNewRhs(tmpl.to);
    setNewDesc(tmpl.desc);
    setFormError(null);
  };

  // 신규 커스텀 키매핑 등록
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLhs = newLhs.trim();
    const cleanRhs = newRhs.trim();

    if (!cleanLhs || !cleanRhs) {
      setFormError(t('단축키(LHS)와 실행 동작(RHS)을 모두 입력해주세요.'));
      return;
    }

    const isDuplicate = customKeymaps.some(
      (m) => m.mode === newMode && m.from.toLowerCase() === cleanLhs.toLowerCase()
    );

    if (isDuplicate) {
      setFormError(t('이미 등록된 단축키입니다.'));
      return;
    }

    onAddCustomKeymap?.({
      mode: newMode,
      from: cleanLhs,
      to: cleanRhs,
      description: newDesc.trim() || undefined,
      noremap: true,
    });

    setNewLhs('');
    setNewRhs('');
    setNewDesc('');
    setFormError(null);
  };

  const filteredCustomKeymaps = useMemo(() => {
    if (filterMode === 'all') return customKeymaps;
    return customKeymaps.filter((m) => m.mode === filterMode);
  }, [customKeymaps, filterMode]);

  return (
    <>
      {/* 1. 키매핑 프리셋 섹션 */}
      <section
        className={`presets-section ${activeMainTab !== 'keymaps' ? 'is-hidden' : ''}`}
        data-testid="presets-section"
      >
        <div className="presets-header">
          <h3 className="section-label">{t('⚡ 실무 인기 키매핑 프리셋')}</h3>
          <div className="leader-picker">
            <label htmlFor="leader-select">{t('리더 키 (Leader):')}</label>
            <select
              id="leader-select"
              value={leaderKey}
              onChange={(e) => onChangeLeaderKey(e.target.value)}
              data-testid="leader-select"
            >
              <option value=" ">{t('Space (공백)')}</option>
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

      {/* 2. 나만의 커스텀 키바인딩 관리기 섹션 */}
      <section
        className={`custom-keymaps-section ${activeMainTab !== 'keymaps' ? 'is-hidden' : ''}`}
        data-testid="custom-keymaps-section"
      >
        <div className="custom-keymaps-header">
          <div className="custom-header-title">
            <h3 className="section-label">⌨️ {t('나만의 커스텀 키바인딩 (Custom Keymaps)')}</h3>
            <span className="count-badge">
              {customKeymaps.length}
              {t('개 등록됨')}
            </span>
          </div>
        </div>

        {/* 신규 키매핑 추가 폼 */}
        <form className="custom-keymap-form" onSubmit={handleAddSubmit} data-testid="custom-keymap-form">
          <div className="form-row">
            <div className="form-group mode-select-group">
              <label htmlFor="custom-mode-select">{t('모드:')}</label>
              <select
                id="custom-mode-select"
                value={newMode}
                onChange={(e) => setNewMode(e.target.value as 'normal' | 'insert' | 'visual')}
                data-testid="custom-keymap-mode-select"
              >
                <option value="normal">{t('일반 모드 (Normal)')}</option>
                <option value="insert">{t('입력 모드 (Insert)')}</option>
                <option value="visual">{t('비주얼 모드 (Visual)')}</option>
              </select>
            </div>

            <div className="form-group lhs-group">
              <label htmlFor="custom-lhs-input">{t('단축키 (LHS):')}</label>
              <input
                ref={lhsInputRef}
                id="custom-lhs-input"
                type="text"
                placeholder={t('예: Y, <leader>w, jk')}
                value={newLhs}
                onChange={(e) => setNewLhs(e.target.value)}
                onFocus={() => setLastFocusedField('lhs')}
                data-testid="custom-keymap-lhs-input"
              />
            </div>

            <div className="form-arrow">➔</div>

            <div className="form-group rhs-group">
              <label htmlFor="custom-rhs-input">{t('실행 동작 (RHS):')}</label>
              <input
                ref={rhsInputRef}
                id="custom-rhs-input"
                type="text"
                placeholder={t('예: y$, :w<CR>, <Esc>')}
                value={newRhs}
                onChange={(e) => setNewRhs(e.target.value)}
                onFocus={() => setLastFocusedField('rhs')}
                data-testid="custom-keymap-rhs-input"
              />
            </div>

            <div className="form-group desc-group">
              <label htmlFor="custom-desc-input">{t('설명 (선택):')}</label>
              <input
                id="custom-desc-input"
                type="text"
                placeholder={t('예: 줄 끝까지 복사')}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                data-testid="custom-keymap-desc-input"
              />
            </div>

            <button
              type="submit"
              className="add-keymap-btn"
              data-testid="custom-keymap-add-btn"
            >
              {t('➕ 키매핑 등록')}
            </button>
          </div>

          {formError && <div className="form-error-msg" data-testid="custom-form-error">{formError}</div>}

          {/* 빠른 특수키 칩 & 추천 템플릿 바 */}
          <div className="chips-and-templates-bar">
            <div className="quick-chips-group">
              <span className="chips-label">{t('빠른 특수키 칩:')}</span>
              <div className="chips-container">
                {SPECIAL_KEY_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="quick-chip"
                    onClick={() => handleInsertToken(chip)}
                    title={t('{chip} 삽입', { chip })}
                    data-testid={`quick-chip-${chip}`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <div className="templates-group">
              <span className="chips-label">{t('추천 템플릿:')}</span>
              <div className="templates-container">
                {TEMPLATE_SUGGESTIONS.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="template-chip"
                    onClick={() => handleApplyTemplate(tmpl)}
                    title={tmpl.desc}
                    data-testid={`template-chip-${idx}`}
                  >
                    <span className="tmpl-mode">{tmpl.mode[0].toUpperCase()}</span>
                    <span className="tmpl-keys">{tmpl.from} ➔ {tmpl.to}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>

        {/* 등록된 커스텀 키매핑 목록 */}
        <div className="registered-keymaps-wrapper">
          <div className="filter-and-count-bar">
            <span className="sub-title">{t('등록된 커스텀 키바인딩 목록')}</span>
            <div className="filter-pills" role="radiogroup">
              <button
                type="button"
                className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
                data-testid="filter-pill-all"
              >
                {t('전체')} ({customKeymaps.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'normal' ? 'active' : ''}`}
                onClick={() => setFilterMode('normal')}
                data-testid="filter-pill-normal"
              >
                {t('일반 모드 (Normal)')}
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'insert' ? 'active' : ''}`}
                onClick={() => setFilterMode('insert')}
                data-testid="filter-pill-insert"
              >
                {t('입력 모드 (Insert)')}
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'visual' ? 'active' : ''}`}
                onClick={() => setFilterMode('visual')}
                data-testid="filter-pill-visual"
              >
                {t('비주얼 모드 (Visual)')}
              </button>
            </div>
          </div>

          {filteredCustomKeymaps.length === 0 ? (
            <div className="empty-keymaps-notice" data-testid="empty-keymaps-notice">
              <span className="empty-icon">⌨️</span>
              <p>{t('아직 등록된 커스텀 키바인딩이 없습니다. 위 폼을 통해 나만의 단축키를 등록해보세요!')}</p>
            </div>
          ) : (
            <div className="keymaps-cards-grid" data-testid="custom-keymaps-grid">
              {filteredCustomKeymaps.map((item) => (
                <div key={item.id} className="custom-keymap-card" data-testid={`keymap-card-${item.id}`}>
                  <div className="card-top">
                    <span className={`keymap-mode-badge ${item.mode}`}>
                      {item.mode.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="delete-keymap-btn"
                      onClick={() => onDeleteCustomKeymap?.(item.id)}
                      title={t('삭제')}
                      aria-label={t('삭제')}
                      data-testid={`delete-keymap-${item.id}`}
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="keymap-mapping-row">
                    <code className="key-code lhs">{item.from}</code>
                    <span className="key-arrow">➔</span>
                    <code className="key-code rhs">{item.to}</code>
                  </div>

                  {item.description && (
                    <div className="keymap-desc-text">{item.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
};
