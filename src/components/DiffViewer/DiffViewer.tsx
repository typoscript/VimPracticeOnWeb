import React from 'react';
import './DiffViewer.css';

export interface DiffViewerProps {
  currentLines: string[];
  targetLines?: string[];
  isCompleted?: boolean;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  currentLines,
  targetLines,
  isCompleted = false,
}) => {
  if (!targetLines || targetLines.length === 0) {
    return (
      <div className="diff-viewer empty" data-testid="diff-viewer">
        <div className="diff-header">
          <span className="diff-title">🎯 목표 상태 비교 (Diff View)</span>
          <span className="diff-badge match">위치 이동 미션</span>
        </div>
        <p className="diff-empty-msg">
          이 레슨은 텍스트 편집 없이 커서를 목표 위치로 이동하는 미션입니다.
        </p>
      </div>
    );
  }

  const maxLines = Math.max(currentLines.length, targetLines.length);
  const rows = [];
  let diffCount = 0;

  for (let i = 0; i < maxLines; i++) {
    const cur = currentLines[i];
    const tgt = targetLines[i];
    const isLineMatch = cur === tgt;
    if (!isLineMatch) {
      diffCount++;
    }

    rows.push({
      lineNum: i + 1,
      current: cur,
      target: tgt,
      isMatch: isLineMatch,
      isRemoved: cur !== undefined && tgt === undefined,
      isMissing: cur === undefined && tgt !== undefined,
    });
  }

  const allTextMatch = diffCount === 0;

  return (
    <div className="diff-viewer" data-testid="diff-viewer">
      <div className="diff-header">
        <div className="diff-header-left">
          <span className="diff-title">🎯 목표 상태 비교 (Diff View)</span>
          <span className="diff-subtitle">목표 코드와 일치하도록 편집하세요</span>
        </div>
        <span
          className={`diff-badge ${allTextMatch || isCompleted ? 'match' : 'mismatch'}`}
          data-testid="diff-status-badge"
        >
          {allTextMatch || isCompleted ? '✨ 텍스트 일치' : `⚠️ ${diffCount}줄 수정 필요`}
        </span>
      </div>

      <div className="diff-grid" data-testid="diff-grid">
        <div className="diff-column current-col">
          <div className="diff-column-header">현재 에디터 코드 (Current)</div>
          <div className="diff-lines">
            {rows.map((row) => (
              <div
                key={`cur-${row.lineNum}`}
                className={`diff-line-row ${row.isMatch ? 'match' : 'diff-different'}`}
                data-testid={`diff-cur-line-${row.lineNum}`}
              >
                <span className="diff-line-no">{row.lineNum}</span>
                <span className="diff-line-marker">{row.isMatch ? ' ' : '-'}</span>
                <span className="diff-line-content">
                  {row.current !== undefined ? row.current || <span className="diff-blank">〈빈 줄〉</span> : <span className="diff-none">〈줄 없음〉</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="diff-column target-col">
          <div className="diff-column-header">목표 완성 코드 (Target Goal)</div>
          <div className="diff-lines">
            {rows.map((row) => (
              <div
                key={`tgt-${row.lineNum}`}
                className={`diff-line-row ${row.isMatch ? 'match' : 'diff-target'}`}
                data-testid={`diff-tgt-line-${row.lineNum}`}
              >
                <span className="diff-line-no">{row.lineNum}</span>
                <span className="diff-line-marker">{row.isMatch ? '✓' : '+'}</span>
                <span className="diff-line-content">
                  {row.target !== undefined ? row.target || <span className="diff-blank">〈빈 줄〉</span> : <span className="diff-none">〈줄 삭제 대상〉</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;
