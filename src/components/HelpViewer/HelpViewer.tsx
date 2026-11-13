import React, { useEffect, useRef } from 'react';
import { HelpSession } from '../../vim-engine';
import { t, useLocale } from '../../i18n';
import './HelpViewer.css';

export interface HelpViewerProps {
  session: HelpSession;
  onJumpTag: (tag: string) => void;
  onPopTag: () => void;
  onClose: () => void;
}

export const HelpViewer: React.FC<HelpViewerProps> = ({
  session,
  onJumpTag,
  onPopTag,
  onClose,
}) => {
  useLocale();
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // 커서 줄 변경 시 자동 스크롤
  useEffect(() => {
    if (activeLineRef.current && typeof activeLineRef.current.scrollIntoView === 'function') {
      activeLineRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [session.cursor.line]);

  const totalLines = session.lines.length;
  const currentLine = session.cursor.line + 1;
  const percent = totalLines > 0 ? Math.round((currentLine / totalLines) * 100) : 100;

  // 태그 스택 브레드크럼 표시
  const breadcrumbs = [...session.tagStack.map((s) => s.topic), session.topic];

  /**
   * 라인 텍스트 내 |tag| 및 *tag* 구문 하이라이트 렌더링
   */
  const renderLineContent = (line: string) => {
    // |tag| 또는 *tag* 패턴 분할
    const regex = /(\|[a-zA-Z0-9_\-:]+\||\*[a-zA-Z0-9_\-:]+\*)/g;
    const parts = line.split(regex);

    return parts.map((part, index) => {
      if (part.startsWith('|') && part.endsWith('|')) {
        const tag = part.slice(1, -1);
        return (
          <button
            key={index}
            type="button"
            className="help-tag-link"
            onClick={(e) => {
              e.stopPropagation();
              onJumpTag(tag);
            }}
            title={t('이 태그로 이동 (Ctrl-] 또는 클릭)')}
          >
            {part}
          </button>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <span key={index} className="help-tag-def">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div
      className="help-viewer-backdrop"
      onClick={onClose}
      data-testid="help-viewer-backdrop"
    >
      <div
        className="help-viewer-window"
        onClick={(e) => e.stopPropagation()}
        data-testid="help-viewer-window"
      >
        {/* 헤더 */}
        <div className="help-viewer-header">
          <div className="help-viewer-title-group">
            <span className="help-viewer-badge">HELP</span>
            <span className="help-viewer-filename">{session.topic}</span>
            <span className="help-viewer-sep">-</span>
            <span className="help-viewer-title">{session.title}</span>
          </div>

          <div className="help-viewer-header-actions">
            {session.tagStack.length > 0 && (
              <button
                type="button"
                className="help-viewer-btn help-back-btn"
                onClick={onPopTag}
                title={t('이전 도움말 위치로 복귀 (Ctrl-t)')}
              >
                ◀ {t('뒤로 (Ctrl-t)')}
              </button>
            )}
            <button
              type="button"
              className="help-viewer-close-btn"
              onClick={onClose}
              title={t('도움말 닫기 (:q, q)')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 태그 탐색 히스토리 브레드크럼 */}
        {breadcrumbs.length > 1 && (
          <div className="help-viewer-breadcrumbs">
            <span className="breadcrumb-label">{t('태그 히스토리')}:</span>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="breadcrumb-sep">&gt;</span>}
                <span className={`breadcrumb-item ${i === breadcrumbs.length - 1 ? 'active' : ''}`}>
                  {b}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* 조작 힌트 바 */}
        <div className="help-viewer-hint-bar">
          <span>
            <kbd>j</kbd>/<kbd>k</kbd> {t('스크롤')}
          </span>
          <span>
            <kbd>|</kbd> <kbd>Ctrl-]</kbd> {t('태그 점프')}
          </span>
          <span>
            <kbd>Ctrl-t</kbd> {t('이전 위치')}
          </span>
          <span>
            <kbd>q</kbd> / <kbd>:q</kbd> {t('닫기')}
          </span>
        </div>

        {/* 도움말 본문 텍스트 영역 */}
        <div className="help-viewer-body" data-testid="help-viewer-body">
          {session.lines.map((line, idx) => {
            const isCursor = idx === session.cursor.line;
            return (
              <div
                key={idx}
                ref={isCursor ? activeLineRef : null}
                className={`help-line ${isCursor ? 'active-cursor-line' : ''}`}
                data-line-index={idx}
              >
                <span className="help-line-num">{idx + 1}</span>
                <span className="help-line-text">{renderLineContent(line)}</span>
              </div>
            );
          })}
        </div>

        {/* 상태라인 */}
        <div className="help-viewer-statusline">
          <div className="statusline-left">
            <span className="statusline-mode">[RO]</span>
            <span className="statusline-topic">{session.topic}</span>
          </div>
          <div className="statusline-right">
            <span>
              {currentLine}/{totalLines} ({percent}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
