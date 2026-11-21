import React, { useMemo, useState } from 'react';
import {
  VimEditorState,
  UndotreeGraphRow,
  buildUndotreeGraphRows,
} from '../../vim-engine';
import { t } from '../../i18n';
import './UndotreePanel.css';

export interface UndotreePanelProps {
  editorState: VimEditorState;
  onJumpSeq: (seq: number) => void;
  onTravelOlder: () => void;
  onTravelNewer: () => void;
  onClose: () => void;
}

interface DiffLine {
  kind: 'context' | 'removed' | 'added';
  text: string;
}

function computeSimpleDiffLines(prevLines: string[] | null, nextLines: string[]): DiffLine[] {
  if (!prevLines) {
    return nextLines.slice(0, 12).map((text) => ({ kind: 'context', text }));
  }

  const out: DiffLine[] = [];
  const maxLen = Math.max(prevLines.length, nextLines.length);
  for (let i = 0; i < maxLen; i++) {
    const a = prevLines[i];
    const b = nextLines[i];
    if (a === b) {
      if (a !== undefined && out.length < 18) {
        out.push({ kind: 'context', text: a });
      }
    } else {
      if (a !== undefined) out.push({ kind: 'removed', text: a });
      if (b !== undefined) out.push({ kind: 'added', text: b });
    }
    if (out.length >= 20) break;
  }
  return out;
}

function formatRelativeAge(timestamp: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  return `${Math.floor(diffSec / 3600)}h`;
}

/**
 * mbbill/undotree 스타일의 분기형 Undo Tree 시각화 및 시간 여행 분할 패널 (:UndotreeToggle)
 */
export const UndotreePanel: React.FC<UndotreePanelProps> = ({
  editorState,
  onJumpSeq,
  onTravelOlder,
  onTravelNewer,
  onClose,
}) => {
  const rows: UndotreeGraphRow[] = useMemo(
    () => buildUndotreeGraphRows(editorState),
    [editorState]
  );

  const [hoveredSeq, setHoveredSeq] = useState<number | null>(null);
  const activeSeq = editorState.currentUndoSeq ?? 0;
  const previewRow =
    rows.find((r) => r.seq === (hoveredSeq ?? activeSeq)) ?? rows[0] ?? null;

  const diffLines = useMemo(() => {
    if (!previewRow) return [];
    return computeSimpleDiffLines(previewRow.parentLines, previewRow.lines);
  }, [previewRow]);

  const now = Date.now();
  const branchCount = useMemo(() => {
    const cols = new Set(rows.map((r) => r.branchCol));
    return cols.size;
  }, [rows]);

  return (
    <div
      className="undotree-panel-container"
      data-testid="undotree-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="undotree-panel-header">
        <div className="undotree-title-group">
          <span className="undotree-badge">UNDOTREE</span>
          <span className="undotree-title">{t('시각적 Undo 트리 (시간 여행)')}</span>
          <span className="undotree-stats" data-testid="undotree-stats">
            {t('{nodes}개 노드 · {branches}개 브랜치', {
              nodes: rows.length,
              branches: branchCount,
            })}
          </span>
        </div>

        <div className="undotree-actions">
          <button
            type="button"
            className="undotree-nav-btn"
            data-testid="undotree-older-btn"
            onClick={onTravelOlder}
            title={t('이전 시간 상태로 이동 (g-)')}
            tabIndex={-1}
          >
            ◀ g-
          </button>
          <button
            type="button"
            className="undotree-nav-btn"
            data-testid="undotree-newer-btn"
            onClick={onTravelNewer}
            title={t('이후 시간 상태로 이동 (g+)')}
            tabIndex={-1}
          >
            g+ ▶
          </button>
          <button
            type="button"
            className="undotree-close-btn"
            data-testid="undotree-close-btn"
            onClick={onClose}
            title={t('Undotree 패널 닫기')}
            tabIndex={-1}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="undotree-panel-body">
        <div className="undotree-graph-pane" data-testid="undotree-graph-pane">
          {rows.map((row) => (
            <div
              key={row.seq}
              className={`undotree-node-row ${row.isCurrent ? 'current' : ''} ${
                hoveredSeq === row.seq ? 'hovered' : ''
              }`}
              data-testid={`undotree-node-${row.seq}`}
              onClick={() => onJumpSeq(row.seq)}
              onMouseEnter={() => setHoveredSeq(row.seq)}
              onMouseLeave={() => setHoveredSeq(null)}
            >
              <span className="undotree-graph-ascii">{row.graphPrefix}</span>
              <span className="undotree-seq">#{row.seq}</span>
              {row.seq === 0 && (
                <span className="undotree-root-tag">{t('초기')}</span>
              )}
              {row.isCurrent && (
                <span className="undotree-current-pill">CURRENT</span>
              )}
              {row.saveNumber !== undefined && row.saveNumber > 0 && (
                <span className="undotree-save-tag" title={t('저장 스냅샷')}>
                  S{row.saveNumber}
                </span>
              )}
              <span className="undotree-delta">
                {row.addedCount > 0 && (
                  <span className="delta-add">+{row.addedCount}</span>
                )}
                {row.removedCount > 0 && (
                  <span className="delta-del">-{row.removedCount}</span>
                )}
              </span>
              <span className="undotree-age">
                {formatRelativeAge(row.timestamp, now)}
              </span>
            </div>
          ))}
        </div>

        <div className="undotree-diff-pane" data-testid="undotree-diff-pane">
          <div className="undotree-diff-header">
            <span>
              {previewRow
                ? previewRow.parentSeq !== null
                  ? t('변경 Diff: #{parent} → #{seq}', {
                      parent: previewRow.parentSeq,
                      seq: previewRow.seq,
                    })
                  : t('루트 스냅샷 (#0)')
                : ''}
            </span>
          </div>
          <div className="undotree-diff-lines">
            {diffLines.map((dl, idx) => (
              <div
                key={idx}
                className={`undotree-diff-line diff-${dl.kind}`}
              >
                <span className="undotree-diff-sign">
                  {dl.kind === 'added' ? '+' : dl.kind === 'removed' ? '-' : ' '}
                </span>
                <span className="undotree-diff-text">{dl.text || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
