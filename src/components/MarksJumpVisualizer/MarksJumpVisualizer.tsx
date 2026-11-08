import React, { useState, useMemo } from 'react';
import { MarkPosition } from '../../vim-engine';
import './MarksJumpVisualizer.css';
import { t } from '../../i18n';

export interface MarksJumpVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  marks?: Record<string, MarkPosition>;
  jumpList?: Array<{ row: number; col: number }>;
  jumpIndex?: number;
  lines: string[];
  currentCursor: { line: number; col: number };
  primaryFilename?: string;
  onJumpToMark?: (markChar: string) => void;
  onDeleteMark?: (markChar: string) => void;
  onDeleteAllLocalMarks?: () => void;
  onJumpToIndex?: (index: number) => void;
  onJumpOlder?: () => void;
  onJumpNewer?: () => void;
  onClearJumps?: () => void;
  onSetMark?: (markChar: string) => void;
  onJumpToLine?: (line: number) => void;
}

export type VisualizerTab = 'marks' | 'jumps' | 'minimap';
export type MarkScopeFilter = 'all' | 'local' | 'global' | 'special';

export const MarksJumpVisualizer: React.FC<MarksJumpVisualizerProps> = ({
  isOpen,
  onClose,
  marks = {},
  jumpList = [],
  jumpIndex = 0,
  lines,
  currentCursor,
  primaryFilename = 'source.ts',
  onJumpToMark,
  onDeleteMark,
  onDeleteAllLocalMarks,
  onJumpToIndex,
  onJumpOlder,
  onJumpNewer,
  onClearJumps,
  onSetMark,
  onJumpToLine,
}) => {
  const [activeTab, setActiveTab] = useState<VisualizerTab>('marks');
  const [markFilter, setMarkFilter] = useState<MarkScopeFilter>('all');
  const [selectedSetMarkChar, setSelectedSetMarkChar] = useState<string>('a');

  // 마크 분류 및 필터링
  const markEntries = useMemo(() => {
    return Object.entries(marks).map(([char, pos]) => {
      const isLocal = /^[a-z]$/.test(char);
      const isGlobal = /^[A-Z]$/.test(char);
      const isSpecial = !isLocal && !isGlobal;
      return {
        char,
        pos,
        isLocal,
        isGlobal,
        isSpecial,
        lineText: (lines[pos.row] ?? '').trim(),
      };
    });
  }, [marks, lines]);

  const filteredMarks = useMemo(() => {
    switch (markFilter) {
      case 'local':
        return markEntries.filter((m) => m.isLocal);
      case 'global':
        return markEntries.filter((m) => m.isGlobal);
      case 'special':
        return markEntries.filter((m) => m.isSpecial);
      default:
        return markEntries;
    }
  }, [markEntries, markFilter]);

  const localCount = markEntries.filter((m) => m.isLocal).length;
  const globalCount = markEntries.filter((m) => m.isGlobal).length;
  const specialCount = markEntries.filter((m) => m.isSpecial).length;

  // 점프 리스트 상대 거리 계산
  const currentJumpPointer = Math.min(jumpIndex, Math.max(0, jumpList.length - 1));

  if (!isOpen) return null;

  return (
    <div
      className="marks-visualizer-container"
      data-testid="marks-jump-visualizer"
      role="region"
      aria-label={t('마크 및 점프 리스트 비주얼 맵')}
    >
      {/* 1. 패널 상단 헤더 */}
      <div className="marks-visualizer-header">
        <div className="header-left">
          <span className="header-icon">📍</span>
          <span className="header-title">{t('마크 & 점프 리스트 (Marks & Jump Visualizer)')}</span>
          <span className="marks-badge">{t('{n}개 마크', { n: markEntries.length })}</span>
          <span className="jumps-badge">{t('{n}개 점프', { n: jumpList.length })}</span>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="btn-close-visualizer"
            onClick={onClose}
            data-testid="close-marks-visualizer-btn"
            title={t('패널 닫기 (Esc 또는 :marks close)')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 2. 탭 네비게이션 */}
      <div className="marks-visualizer-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'marks' ? 'active' : ''}`}
          onClick={() => setActiveTab('marks')}
          data-testid="tab-marks-btn"
        >
          🏷️ {t('마크 맵 ({count})', { count: markEntries.length })}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'jumps' ? 'active' : ''}`}
          onClick={() => setActiveTab('jumps')}
          data-testid="tab-jumps-btn"
        >
          🦘 {t('점프 리스트 ({count})', { count: jumpList.length })}
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'minimap' ? 'active' : ''}`}
          onClick={() => setActiveTab('minimap')}
          data-testid="tab-minimap-btn"
        >
          🗺️ {t('시각 분포도')}
        </button>
      </div>

      {/* 3. 탭별 콘텐츠 */}
      <div className="marks-visualizer-body">
        {/* --- TAB 1: 마크 목록 --- */}
        {activeTab === 'marks' && (
          <div className="tab-content marks-tab-content">
            {/* 서브 필터 및 액션 바 */}
            <div className="marks-toolbar">
              <div className="filter-chips">
                <button
                  type="button"
                  className={`filter-chip ${markFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setMarkFilter('all')}
                  data-testid="filter-mark-all"
                >
                  {t('전체 ({n})', { n: markEntries.length })}
                </button>
                <button
                  type="button"
                  className={`filter-chip ${markFilter === 'local' ? 'active' : ''}`}
                  onClick={() => setMarkFilter('local')}
                  data-testid="filter-mark-local"
                >
                  {t('로컬 a-z ({n})', { n: localCount })}
                </button>
                <button
                  type="button"
                  className={`filter-chip ${markFilter === 'global' ? 'active' : ''}`}
                  onClick={() => setMarkFilter('global')}
                  data-testid="filter-mark-global"
                >
                  {t('전역 A-Z ({n})', { n: globalCount })}
                </button>
                {specialCount > 0 && (
                  <button
                    type="button"
                    className={`filter-chip ${markFilter === 'special' ? 'active' : ''}`}
                    onClick={() => setMarkFilter('special')}
                    data-testid="filter-mark-special"
                  >
                    {t('특수 마크 ({n})', { n: specialCount })}
                  </button>
                )}
              </div>

              <div className="marks-quick-actions">
                {onSetMark && (
                  <div className="quick-set-mark">
                    <span className="quick-label">m</span>
                    <input
                      type="text"
                      className="mark-char-input"
                      value={selectedSetMarkChar}
                      maxLength={1}
                      onChange={(e) => setSelectedSetMarkChar(e.target.value)}
                      placeholder="a"
                      data-testid="set-mark-input"
                    />
                    <button
                      type="button"
                      className="btn-set-mark"
                      onClick={() => onSetMark(selectedSetMarkChar)}
                      data-testid="set-mark-btn"
                      title={t('현재 커서 위치에 마크 설정 (m{char})', { char: selectedSetMarkChar })}
                    >
                      {t('마크 설정')}
                    </button>
                  </div>
                )}
                {onDeleteAllLocalMarks && (
                  <button
                    type="button"
                    className="btn-delmarks-all"
                    onClick={onDeleteAllLocalMarks}
                    data-testid="delmarks-all-btn"
                    title={t('현재 버퍼의 모든 소문자 마크 삭제 (:delmarks!)')}
                  >
                    {t('로컬 마크 전체 삭제 (:delm!)')}
                  </button>
                )}
              </div>
            </div>

            {/* 마크 리스트 테이블 */}
            {filteredMarks.length === 0 ? (
              <div className="empty-state" data-testid="empty-marks-message">
                <span className="empty-icon">📭</span>
                <p className="empty-text">{t('설정된 마크가 없습니다.')}</p>
                <span className="empty-hint">
                  {t('노멀 모드에서 m{a-z} 키를 입력하여 현재 줄을 마크에 저장하세요.')}
                </span>
              </div>
            ) : (
              <div className="marks-table">
                <div className="marks-table-header">
                  <span className="col-mark">{t('마크')}</span>
                  <span className="col-scope">{t('구분')}</span>
                  <span className="col-pos">{t('위치')}</span>
                  <span className="col-preview">{t('코드 / 줄 내용')}</span>
                  <span className="col-actions">{t('점프 / 관리')}</span>
                </div>
                <div className="marks-table-body">
                  {filteredMarks.map(({ char, pos, isLocal, isGlobal, lineText }) => (
                    <div
                      key={char}
                      className="mark-row"
                      data-testid={`mark-item-${char}`}
                    >
                      <span className="col-mark">
                        <button
                          type="button"
                          className={`mark-badge-btn ${isLocal ? 'badge-local' : isGlobal ? 'badge-global' : 'badge-special'}`}
                          onClick={() => onJumpToMark?.(char)}
                          data-testid={`jump-mark-badge-${char}`}
                          title={t('\'{char} 위치로 점프', { char })}
                        >
                          '{char}
                        </button>
                      </span>
                      <span className="col-scope">
                        <span className={`scope-tag ${isLocal ? 'local' : isGlobal ? 'global' : 'special'}`}>
                          {isLocal ? t('로컬') : isGlobal ? t('전역') : t('특수')}
                        </span>
                      </span>
                      <span className="col-pos">
                        <span className="pos-text">
                          Ln {pos.row + 1}, Col {pos.col}
                        </span>
                        {pos.filename && (
                          <span className="filename-tag" title={pos.filename}>
                            📄 {pos.filename}
                          </span>
                        )}
                      </span>
                      <span className="col-preview" title={lineText}>
                        <code>{lineText || t('(빈 줄)')}</code>
                      </span>
                      <span className="col-actions">
                        <button
                          type="button"
                          className="action-btn jump-btn"
                          onClick={() => onJumpToMark?.(char)}
                          data-testid={`jump-mark-btn-${char}`}
                          title={t('\'{char} 위치로 점프', { char })}
                        >
                          {t('점프 (\'{char})', { char })}
                        </button>
                        {onDeleteMark && (
                          <button
                            type="button"
                            className="action-btn delete-btn"
                            onClick={() => onDeleteMark(char)}
                            data-testid={`delete-mark-btn-${char}`}
                            title={t('마크 삭제')}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB 2: 점프 리스트 --- */}
        {activeTab === 'jumps' && (
          <div className="tab-content jumps-tab-content">
            <div className="jumps-toolbar">
              <div className="jumps-nav-buttons">
                {onJumpOlder && (
                  <button
                    type="button"
                    className="btn-jump-nav"
                    onClick={onJumpOlder}
                    data-testid="jump-older-btn"
                    title={t('과거 점프 위치로 이동 (Ctrl+o)')}
                  >
                    ⬅ <kbd>Ctrl+o</kbd> {t('과거 점프')}
                  </button>
                )}
                {onJumpNewer && (
                  <button
                    type="button"
                    className="btn-jump-nav"
                    onClick={onJumpNewer}
                    data-testid="jump-newer-btn"
                    title={t('최신 점프 위치로 이동 (Ctrl+i)')}
                  >
                    <kbd>Ctrl+i</kbd> {t('최신 점프')} ➡
                  </button>
                )}
                {onClearJumps && (
                  <button
                    type="button"
                    className="btn-clear-jumps"
                    onClick={onClearJumps}
                    data-testid="clear-jumps-btn"
                    title={t('점프 목록 초기화 (:clearjumps)')}
                  >
                    🗑 {t('점프 목록 비우기 (:clearjumps)')}
                  </button>
                )}
              </div>
              <div className="jumps-pointer-indicator">
                <span className="pointer-icon">▶</span>
                <span className="pointer-label">{t('현재 포인터:')}</span>
                <span className="pointer-index">
                  {jumpList.length > 0 ? `${currentJumpPointer + 1} / ${jumpList.length}` : '0 / 0'}
                </span>
              </div>
            </div>

            {jumpList.length === 0 ? (
              <div className="empty-state" data-testid="empty-jumps-message">
                <span className="empty-icon">🦘</span>
                <p className="empty-text">{t('점프 기록이 없습니다.')}</p>
                <span className="empty-hint">
                  {t('gg, G, /검색, *, %, \'{mark} 등의 큰 커서 점프 이동 시 자동으로 기록됩니다.')}
                </span>
              </div>
            ) : (
              <div className="jumps-table">
                <div className="jumps-table-header">
                  <span className="col-status">{t('상태')}</span>
                  <span className="col-jump-offset">{t('거리')}</span>
                  <span className="col-pos">{t('위치')}</span>
                  <span className="col-preview">{t('코드 내용')}</span>
                  <span className="col-action">{t('이동')}</span>
                </div>
                <div className="jumps-table-body">
                  {jumpList.map((item, idx) => {
                    const isCurrent = idx === currentJumpPointer;
                    const diff = idx - currentJumpPointer;
                    const lineText = (lines[item.row] ?? '').trim();
                    return (
                      <div
                        key={idx}
                        className={`jump-row ${isCurrent ? 'current-jump' : ''}`}
                        data-testid={`jump-item-${idx}`}
                        onClick={() => onJumpToIndex?.(idx)}
                      >
                        <span className="col-status">
                          {isCurrent ? (
                            <span className="current-pointer-badge">▶ {t('현재')}</span>
                          ) : (
                            <span className="past-future-indicator">
                              {diff < 0 ? t('과거') : t('미래')}
                            </span>
                          )}
                        </span>
                        <span className="col-jump-offset">
                          <span className="offset-num">{diff === 0 ? '0' : diff > 0 ? `+${diff}` : `${diff}`}</span>
                        </span>
                        <span className="col-pos">
                          <span className="pos-text">Ln {item.row + 1}, Col {item.col}</span>
                        </span>
                        <span className="col-preview" title={lineText}>
                          <code>{lineText || t('(빈 줄)')}</code>
                        </span>
                        <span className="col-action">
                          <button
                            type="button"
                            className="action-btn jump-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onJumpToIndex?.(idx);
                            }}
                            data-testid={`jump-to-index-btn-${idx}`}
                          >
                            {t('점프')}
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TAB 3: 시각 분포도 (Minimap) --- */}
        {activeTab === 'minimap' && (
          <div className="tab-content minimap-tab-content">
            <div className="minimap-header">
              <span className="minimap-filename">📄 {primaryFilename}</span>
              <span className="minimap-lines-count">{t('총 {n}개 줄', { n: lines.length })}</span>
              <div className="minimap-legend">
                <span className="legend-item"><span className="dot cursor-dot"></span> {t('현재 커서')}</span>
                <span className="legend-item"><span className="dot local-mark-dot"></span> {t('로컬 마크')}</span>
                <span className="legend-item"><span className="dot global-mark-dot"></span> {t('전역 마크')}</span>
                <span className="legend-item"><span className="dot jump-dot"></span> {t('점프 포인트')}</span>
              </div>
            </div>

            <div className="minimap-viewport" data-testid="minimap-viewport">
              {lines.map((lineText, lineIdx) => {
                const isCursor = currentCursor.line === lineIdx;
                const marksHere = markEntries.filter((m) => m.pos.row === lineIdx);
                const jumpsHere = jumpList.filter((j) => j.row === lineIdx);

                return (
                  <div
                    key={lineIdx}
                    className={`minimap-row ${isCursor ? 'cursor-row' : ''} ${marksHere.length > 0 ? 'has-mark' : ''} ${jumpsHere.length > 0 ? 'has-jump' : ''}`}
                    onClick={() => onJumpToLine?.(lineIdx)}
                    title={t('줄 {n}: {text}', { n: lineIdx + 1, text: lineText.slice(0, 30) })}
                    data-testid={`minimap-row-${lineIdx + 1}`}
                  >
                    <span className="minimap-line-num">{lineIdx + 1}</span>
                    <span className="minimap-badges">
                      {isCursor && <span className="cursor-tag" title={t('현재 커서')}>🟡</span>}
                      {marksHere.map((m) => (
                        <span
                          key={m.char}
                          className={`minimap-mark-tag ${m.isLocal ? 'local' : m.isGlobal ? 'global' : 'special'}`}
                          title={`'${m.char}`}
                        >
                          '{m.char}
                        </span>
                      ))}
                      {jumpsHere.length > 0 && (
                        <span className="minimap-jump-tag" title={t('{n}개 점프 위치', { n: jumpsHere.length })}>
                          📍
                        </span>
                      )}
                    </span>
                    <span className="minimap-line-preview">
                      {lineText.slice(0, 48) || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. 하단 도움말 & 단축키 치트시트 */}
      <div className="marks-visualizer-footer">
        <span className="tip-title">💡 {t('Vim 팁:')}</span>
        <span className="tip-text">
          <kbd>m[a-z]</kbd> {t('마크 생성')} · <kbd>'[a-z]</kbd> {t('마크 줄로 점프')} · <kbd>`[a-z]</kbd> {t('정확한 좌표로 점프')} · <kbd>Ctrl+o</kbd> / <kbd>Ctrl+i</kbd> {t('점프 이동')} · <kbd>:delmarks!</kbd> {t('로컬 마크 초기화')}
        </span>
      </div>
    </div>
  );
};
