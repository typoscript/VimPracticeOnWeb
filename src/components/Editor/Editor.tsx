import React from 'react';
import {
  CursorPosition,
  VimMode,
  SearchMatch,
  ViewportState,
  FoldRange,
  CompletionSession,
} from '../../types/vim';
import { isPositionSelected } from '../../engine/visual';
import { findMatches } from '../../engine/search';
import './Editor.css';

export interface EditorProps {
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
  targetPosition?: CursorPosition;
  visualAnchor?: CursorPosition;
  /** 상대 라인 번호 (relativenumber) 활성화 여부 */
  relativeLineNumbers?: boolean;
  /** 현재 검색어 (실시간 하이라이트용) */
  searchQuery?: string;
  /** 에디터 포커스 활성화 여부 */
  isFocused?: boolean;
  /** 에디터 클릭 시 포커스 활성화 콜백 */
  onFocus?: () => void;
  /** 마크 위치 목록 (m{a-z}) */
  marks?: Record<string, { row: number; col: number }>;
  /** 화면 뷰포트 상태 */
  viewport?: ViewportState;
  /** 코드 폴딩 상태 (zc, zo, za, zR, zM) */
  folds?: FoldRange[];
  /** 버퍼 내 단어 자동완성 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  lines,
  cursor,
  mode,
  targetPosition,
  visualAnchor,
  relativeLineNumbers = false,
  searchQuery,
  isFocused = true,
  onFocus,
  marks,
  viewport,
  folds,
  completionSession,
  insertNormalSession,
}) => {
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollerRef.current && viewport) {
      const rowHeight = 24;
      scrollerRef.current.scrollTop = viewport.topRow * rowHeight;
    }
  }, [viewport?.topRow]);

  // 전체 검색 일치 항목 수집
  const allMatches = searchQuery && searchQuery.length > 0
    ? findMatches(lines, searchQuery)
    : [];

  return (
    <div
      className={`editor-container ${!isFocused ? 'editor-unfocused' : ''}`}
      data-testid="editor-container"
      onClick={onFocus}
    >
      {!isFocused && (
        <div
          className="editor-blur-overlay"
          data-testid="editor-blur-overlay"
          title="클릭하여 에디터 포커스를 활성화하세요"
        >
          <div className="blur-overlay-pill">
            <span className="blur-icon">🖱️</span>
            <span className="blur-text">클릭하여 에디터 포커스 활성화</span>
          </div>
        </div>
      )}

      <div ref={scrollerRef} className="editor-scroller">
        <div className="editor-lines">
          {lines.map((lineText, lineIdx) => {
            const closedFolds = (folds ?? []).filter((f) => f.closed);
            // 닫힌 폴드의 숨겨진 행(startRow < lineIdx <= endRow)은 렌더링하지 않음
            if (closedFolds.some((f) => f.startRow < lineIdx && lineIdx <= f.endRow)) {
              return null;
            }

            const foldStartingHere = closedFolds.find((f) => f.startRow === lineIdx);
            const isFoldedHeader = !!foldStartingHere;
            const foldedLineCount = foldStartingHere
              ? foldStartingHere.endRow - foldStartingHere.startRow + 1
              : 0;

            const isCursorLine = cursor.line === lineIdx;
            const targetCol =
              targetPosition && targetPosition.line === lineIdx
                ? targetPosition.col
                : null;

            const lineNumberDisplay = relativeLineNumbers
              ? isCursorLine
                ? lineIdx + 1
                : Math.abs(lineIdx - cursor.line)
              : lineIdx + 1;

            const lineMatches = allMatches.filter((m) => m.line === lineIdx);
            const marksOnLine = marks
              ? Object.entries(marks)
                  .filter(([_, pos]) => pos.row === lineIdx)
                  .map(([name]) => name)
              : [];

            return (
              <div
                key={lineIdx}
                className={`editor-row ${isCursorLine ? 'active-row' : ''} ${isFoldedHeader ? 'folded-row' : ''}`}
                data-testid={`editor-row-${lineIdx + 1}`}
              >
                <div
                  className={`line-number ${isCursorLine ? 'active-line-number' : ''}`}
                  data-testid={`line-number-${lineIdx + 1}`}
                  aria-hidden="true"
                >
                  {marksOnLine.length > 0 && (
                    <span className="gutter-marks">
                      {marksOnLine.map((m) => (
                        <span
                          key={m}
                          className="gutter-mark-badge"
                          data-testid={`mark-badge-${m}`}
                        >
                          [{m}]
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="line-num-text">{lineNumberDisplay}</span>
                </div>
                <div className="line-content">
                  {isFoldedHeader ? (
                    <div
                      className="folded-summary"
                      data-testid={`fold-summary-${lineIdx + 1}`}
                    >
                      {`+--- [${foldedLineCount} lines folded] ---`}
                    </div>
                  ) : (
                    <>
                      {renderLineContent({
                        text: lineText,
                        lineIdx,
                        cursor,
                        mode,
                        targetCol,
                        visualAnchor,
                        lineMatches,
                        isFocused,
                        insertNormalSession,
                      })}
                      {isCursorLine &&
                        completionSession &&
                        completionSession.candidates.length > 0 && (
                          <div
                            className="vim-completion-menu"
                            data-testid="vim-completion-menu"
                            style={{ left: `calc(${cursor.col} * 1ch)` }}
                          >
                            <div className="completion-header">
                              <span className="completion-prefix-tag">
                                {completionSession.prefix}
                              </span>
                              <span className="completion-count-tag">
                                {completionSession.selectedIndex + 1}/
                                {completionSession.candidates.length}
                              </span>
                            </div>
                            <div className="completion-list">
                              {completionSession.candidates.map((cand, idx) => (
                                <div
                                  key={cand}
                                  className={`completion-item ${
                                    idx === completionSession.selectedIndex ? 'selected' : ''
                                  }`}
                                  data-testid={`completion-item-${idx}`}
                                >
                                  <span className="cand-match-prefix">
                                    {cand.slice(0, completionSession.prefix.length)}
                                  </span>
                                  <span className="cand-remainder">
                                    {cand.slice(completionSession.prefix.length)}
                                  </span>
                                  {idx === completionSession.selectedIndex && (
                                    <span className="cand-selected-indicator">⏎</span>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="completion-footer">
                              <span>Ctrl+n: 다음 | Ctrl+p: 이전</span>
                            </div>
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface RenderLineOptions {
  text: string;
  lineIdx: number;
  cursor: CursorPosition;
  mode: VimMode;
  targetCol: number | null;
  visualAnchor?: CursorPosition;
  lineMatches: SearchMatch[];
  isFocused: boolean;
  insertNormalSession?: boolean;
}

function renderLineContent(opts: RenderLineOptions): React.ReactNode {
  const {
    text,
    lineIdx,
    cursor,
    mode,
    targetCol,
    visualAnchor,
    lineMatches,
    isFocused,
    insertNormalSession,
  } = opts;
  const isCursorLine = cursor.line === lineIdx;
  const cursorCol = isCursorLine ? cursor.col : null;

  // 빈 줄이면서 커서와 타겟, 비주얼 선택, 검색 매칭이 모두 없는 경우
  const hasVisual =
    (mode === 'VISUAL' || mode === 'VISUAL_LINE' || mode === 'VISUAL_BLOCK') && !!visualAnchor;
  const isLineInVisualRange =
    hasVisual &&
    lineIdx >= Math.min(visualAnchor.line, cursor.line) &&
    lineIdx <= Math.max(visualAnchor.line, cursor.line);

  const hasSearchMatches = lineMatches.length > 0;

  if (
    text.length === 0 &&
    cursorCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches
  ) {
    return <span className="empty-char">&nbsp;</span>;
  }

  // 커서, 타겟, 비주얼 선택, 검색 매칭이 모두 없는 일반 줄은 원본 텍스트 그대로 반환
  if (
    cursorCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches
  ) {
    return text;
  }

  // 커서 또는 타겟, 비주얼 선택, 검색 매치가 있는 줄 처리
  const chars = text.length === 0 ? [' '] : text.split('');
  const maxIdx = Math.max(
    chars.length - 1,
    cursorCol !== null ? cursorCol : 0,
    targetCol !== null ? targetCol : 0
  );

  const elements: React.ReactNode[] = [];
  for (let i = 0; i <= maxIdx; i++) {
    const char = chars[i] !== undefined ? chars[i] : ' ';
    const isCursor = i === cursorCol;
    const isTarget = i === targetCol;
    const isSelected =
      hasVisual &&
      isPositionSelected(lineIdx, i, visualAnchor, cursor, mode);
    const isSearchMatch = lineMatches.some(
      (m) => i >= m.col && i < m.col + m.length
    );
    const isTrailingCursor = isCursor && i >= text.length;

    // 빈 줄이거나 줄 끝 뒤의 가상 커서 위치에서는 공백 너비 유지를 위해 non-breaking space 사용
    const displayChar =
      (text.length === 0 || isTrailingCursor) && char === ' '
        ? '\u00A0'
        : char;

    let classNames = isCursor
      ? `vim-cursor ${
          isFocused
            ? insertNormalSession
              ? 'cursor-insert-normal'
              : `cursor-${mode.toLowerCase()}`
            : 'cursor-unfocused'
        }`
      : 'vim-char';

    if (isSelected) {
      classNames += ' visual-selected';
    }

    if (isSearchMatch) {
      classNames += ' search-match';
    }

    if (isTarget) {
      classNames += ' target-marker';
    }

    elements.push(
      <span
        key={i}
        className={classNames}
        data-testid={
          isCursor
            ? 'vim-cursor'
            : isSelected
            ? 'visual-selected-char'
            : isSearchMatch
            ? 'search-match'
            : isTarget
            ? 'target-marker'
            : undefined
        }
      >
        {displayChar}
      </span>
    );
  }

  return <>{elements}</>;
}

export default Editor;
