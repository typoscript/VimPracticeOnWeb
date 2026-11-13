import React from 'react';
import {
  CursorPosition,
  VimMode,
  SearchMatch,
  ViewportState,
  FoldRange,
  CompletionSession,
  ConfirmSubstituteSession,
  VimOptions,
  DiffHunk,
  SpellError,
  SyntaxToken,
  SupportedLanguage,
} from '../../vim-engine';
import {
  isPositionSelected,
  findMatches,
  findSpellErrorsInLine,
  detectFiletype,
  tokenizeLine,
  getSyntaxTokensMap,
} from '../../vim-engine';
import './Editor.css';
import { t } from '../../i18n';

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
  marks?: Record<string, { row: number; col: number; filename?: string }>;
  /** 점프 리스트 (Ctrl+o, Ctrl+i) */
  jumpList?: Array<{ row: number; col: number }>;
  /** 점프 리스트 현재 인덱스 */
  jumpIndex?: number;
  /** 거터 마크 클릭 시 점프 콜백 */
  onJumpToMark?: (markChar: string) => void;
  /** 화면 뷰포트 상태 */
  viewport?: ViewportState;
  /** 코드 폴딩 상태 (zc, zo, za, zR, zM) */
  folds?: FoldRange[];
  /** 버퍼 내 단어 자동완성 세션 (Ctrl+n, Ctrl+p) */
  completionSession?: CompletionSession | null;
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
  /** Insert 모드 및 Command 모드 Ctrl+r 레지스터 입력 대기 상태 */
  insertRegisterPending?: boolean;
  /** :s/.../.../gc 대화형 치환 확인 세션 */
  confirmSubstitute?: ConfirmSubstituteSession | null;
  /** 순정 Vim 환경 옵션 설정 (:set nu, :set rnu, :set ic 등) */
  options?: VimOptions;
  /** 순정 Vim diff 차이점 목록 */
  diffHunks?: DiffHunk[];
  /** 현재 에디터가 분할 창의 몇 번째 창인지 (0 또는 1) */
  diffPaneIndex?: number;
  /** 키 실패(bell) 횟수 카운터. 값이 바뀔 때마다 에디터 테두리를 잠깐 깜빡입니다 (visualbell) */
  bellSignal?: number;
  /** 맞춤법 사용자 사전 (zg/zw) */
  spellGoodWords?: string[];
  spellWrongWords?: string[];
  /** 자동완성 팝업 메뉴 항목 선택 콜백 */
  onSelectCompletionItem?: (index: number) => void;
  /** 현재 버퍼 파일명 (구문 강조 및 표시용) */
  primaryFilename?: string;
  /** 명시적 파일타입 (:set ft=... / :set syntax=...) */
  filetype?: string;
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
  jumpList,
  jumpIndex,
  onJumpToMark,
  viewport,
  folds,
  completionSession,
  insertNormalSession,
  insertRegisterPending,
  confirmSubstitute,
  options,
  diffHunks,
  diffPaneIndex = 0,
  bellSignal,
  spellGoodWords,
  spellWrongWords,
  onSelectCompletionItem,
  primaryFilename,
  filetype,
}) => {
  const explicitFt =
    options?.filetype ||
    (typeof options?.syntax === 'string' ? options.syntax : undefined) ||
    filetype;
  const detectedLanguage = detectFiletype(primaryFilename, explicitFt);
  const isSyntaxEnabled = options?.syntax !== false;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const selectedItemRef = React.useRef<HTMLDivElement>(null);
  const [isBellFlashing, setIsBellFlashing] = React.useState(false);

  // 완성 팝업 메뉴에서 선택 항목이 변경될 때 스크롤 뷰 내로 자동 정렬
  React.useEffect(() => {
    if (selectedItemRef.current && typeof selectedItemRef.current.scrollIntoView === 'function') {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [completionSession?.selectedIndex]);

  // visualbell: 키가 실패할 때마다 짧게 깜빡임 (연속 실패 시 애니메이션 재시작)
  React.useEffect(() => {
    if (!bellSignal) return;
    setIsBellFlashing(false);
    const start = requestAnimationFrame(() => setIsBellFlashing(true));
    const stop = setTimeout(() => setIsBellFlashing(false), 220);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(stop);
    };
  }, [bellSignal]);

  React.useEffect(() => {
    if (scrollerRef.current && viewport) {
      const rowHeight = 24;
      scrollerRef.current.scrollTop = viewport.topRow * rowHeight;
    }
  }, [viewport?.topRow]);

  const showLineNumbers = options?.number ?? true;
  const isRelative = options?.relativenumber ?? relativeLineNumbers;
  const isHlSearch = options?.hlsearch ?? true;
  const searchOpts = options ? { ignorecase: options.ignorecase, smartcase: options.smartcase } : undefined;

  // 전체 검색 일치 항목 수집
  const allMatches = searchQuery && searchQuery.length > 0 && isHlSearch
    ? findMatches(lines, searchQuery, searchOpts)
    : [];

  return (
    <div
      className={`editor-container ${!isFocused ? 'editor-unfocused' : ''} ${isBellFlashing ? 'editor-bell' : ''}`}
      data-testid="editor-container"
      onClick={onFocus}
    >
      {!isFocused && (
        <div
          className="editor-blur-overlay"
          data-testid="editor-blur-overlay"
          title={t('클릭하여 에디터 포커스를 활성화하세요')}
        >
          <div className="blur-overlay-pill">
            <span className="blur-icon">🖱️</span>
            <span className="blur-text">{t('클릭하여 에디터 포커스 활성화')}</span>
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
            const isCursorLineActive = isCursorLine && (options?.cursorline ?? true);
            const targetCol =
              targetPosition && targetPosition.line === lineIdx
                ? targetPosition.col
                : null;

            const lineNumberDisplay = !showLineNumbers
              ? ''
              : isRelative
              ? isCursorLine
                ? lineIdx + 1
                : Math.abs(lineIdx - cursor.line)
              : lineIdx + 1;

            const lineMatches = allMatches.filter((m) => m.line === lineIdx);
            const marksOnLine = marks
              ? Object.entries(marks)
                  .filter(([_, pos]) => pos.row === lineIdx)
                  .map(([name]) => ({
                    name,
                    isGlobal: /^[A-Z]$/.test(name),
                  }))
              : [];

            const jumpsOnLine = jumpList
              ? jumpList.filter((j) => j.row === lineIdx)
              : [];
            const hasCurrentJumpPointer =
              jumpList &&
              jumpIndex !== undefined &&
              jumpList[jumpIndex]?.row === lineIdx;

            let diffLineType: 'change' | 'add' | 'delete' | null = null;
            if (diffHunks && diffHunks.length > 0) {
              for (const h of diffHunks) {
                const hStart = diffPaneIndex === 0 ? h.pane0Start : h.pane1Start;
                const hCount = diffPaneIndex === 0 ? h.pane0Count : h.pane1Count;
                if (hCount > 0 && lineIdx >= hStart && lineIdx < hStart + hCount) {
                  diffLineType = h.type;
                  break;
                }
              }
            }

            return (
              <div
                key={lineIdx}
                className={`editor-row ${isCursorLineActive ? 'active-row' : ''} ${isFoldedHeader ? 'folded-row' : ''} ${diffLineType ? `diff-row diff-row-${diffLineType}` : ''}`}
                data-testid={`editor-row-${lineIdx + 1}`}
              >
                <div
                  className={`line-number ${isCursorLine ? 'active-line-number' : ''}`}
                  data-testid={`line-number-${lineIdx + 1}`}
                  aria-hidden="true"
                >
                  {marksOnLine.length > 0 && (
                    <span className="gutter-marks">
                      {marksOnLine.map(({ name, isGlobal }) => (
                        <span
                          key={name}
                          className={`gutter-mark-badge ${isGlobal ? 'gutter-mark-global' : 'gutter-mark-local'}`}
                          data-testid={`mark-badge-${name}`}
                          onClick={(e) => {
                            if (onJumpToMark) {
                              e.stopPropagation();
                              onJumpToMark(name);
                            }
                          }}
                          title={`'${name}`}
                        >
                          [{name}]
                        </span>
                      ))}
                    </span>
                  )}
                  {jumpsOnLine.length > 0 && (
                    <span
                      className={`gutter-jump-indicator ${hasCurrentJumpPointer ? 'active-jump' : ''}`}
                      data-testid={`gutter-jump-${lineIdx + 1}`}
                      title={hasCurrentJumpPointer ? '▶ 현재 점프 포인터 (v:jump)' : '📍 점프 위치'}
                    >
                      {hasCurrentJumpPointer ? '▶' : '•'}
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
                      {`+--- [${foldedLineCount} lines folded] --- ${lineText.trim()}`}
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
                        insertRegisterPending,
                        confirmSubstitute,
                        spellErrors: options?.spell
                          ? findSpellErrorsInLine(lineText, lineIdx, { spellGoodWords, spellWrongWords } as any)
                          : undefined,
                        syntaxLanguage: detectedLanguage,
                        isSyntaxEnabled,
                      })}
                      {isCursorLine &&
                        completionSession &&
                        completionSession.candidates.length > 0 && (
                          <div
                            className={`vim-completion-menu ${lines.length - 1 - lineIdx < 6 && lineIdx >= 5 ? 'open-upward' : ''}`}
                            data-testid="vim-completion-menu"
                            style={{ left: `calc(${cursor.col} * 1ch)` }}
                          >
                            <div className="completion-header">
                              <span className="completion-prefix-tag">
                                {completionSession.type === 'file'
                                  ? `📁 [FILE] ${completionSession.prefix || '/'}`
                                  : completionSession.type === 'line'
                                  ? `📄 [LINE] ${completionSession.prefix.trim().slice(0, 16)}`
                                  : `🔤 [ID] ${completionSession.prefix}`}
                              </span>
                              <span className="completion-count-tag">
                                {completionSession.selectedIndex + 1}/
                                {completionSession.candidates.length}
                              </span>
                            </div>
                            <div className="completion-list">
                              {completionSession.candidates.map((cand, idx) => {
                                const isLineType = completionSession.type === 'line';
                                return (
                                  <div
                                    key={`${cand}-${idx}`}
                                    ref={idx === completionSession.selectedIndex ? selectedItemRef : undefined}
                                    className={`completion-item ${
                                      idx === completionSession.selectedIndex ? 'selected' : ''
                                    }`}
                                    data-testid={`completion-item-${idx}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectCompletionItem?.(idx);
                                    }}
                                  >
                                    {isLineType ? (
                                      <span className="cand-remainder">
                                        {cand.length > 50 ? `${cand.slice(0, 50)}...` : cand}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="cand-match-prefix">
                                          {cand.slice(0, completionSession.prefix.length)}
                                        </span>
                                        <span className="cand-remainder">
                                          {cand.slice(completionSession.prefix.length)}
                                        </span>
                                      </>
                                    )}
                                    {idx === completionSession.selectedIndex && (
                                      <span className="cand-selected-indicator">⏎</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="completion-footer">
                              <span>{t('Ctrl+n: 다음 | Ctrl+p: 이전 | Enter/Ctrl+y: 선택')}</span>
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
  insertRegisterPending?: boolean;
  confirmSubstitute?: ConfirmSubstituteSession | null;
  spellErrors?: SpellError[];
  syntaxLanguage?: SupportedLanguage;
  isSyntaxEnabled?: boolean;
}

function renderSyntaxSpans(text: string, tokens: SyntaxToken[]): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startCol > lastIdx) {
      parts.push(text.slice(lastIdx, t.startCol));
    }
    parts.push(
      <span key={i} className={`vim-char syn-${t.type}`}>
        {t.text}
      </span>
    );
    lastIdx = t.endCol;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return <>{parts}</>;
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
    insertRegisterPending,
    confirmSubstitute,
    spellErrors,
    syntaxLanguage,
    isSyntaxEnabled,
  } = opts;
  const isCursorLine = cursor.line === lineIdx;
  const cursorCol = isCursorLine ? cursor.col : null;

  // 빈 줄이면서 커서와 타겟, 비주얼 선택, 검색 매칭, 맞춤법 오류가 모두 없는 경우
  const hasVisual =
    (mode === 'VISUAL' || mode === 'VISUAL_LINE' || mode === 'VISUAL_BLOCK') && !!visualAnchor;
  const isLineInVisualRange =
    hasVisual &&
    lineIdx >= Math.min(visualAnchor.line, cursor.line) &&
    lineIdx <= Math.max(visualAnchor.line, cursor.line);

  const hasSearchMatches = lineMatches.length > 0;
  const hasSpellErrors = (spellErrors?.length ?? 0) > 0;

  if (
    text.length === 0 &&
    cursorCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches &&
    !hasSpellErrors
  ) {
    return <span className="empty-char">&nbsp;</span>;
  }

  // 커서, 타겟, 비주얼 선택, 검색 매칭, 맞춤법 오류가 모두 없는 일반 줄
  if (
    cursorCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches &&
    !hasSpellErrors
  ) {
    if (!isSyntaxEnabled || !syntaxLanguage || syntaxLanguage === 'text' || text.length === 0) {
      return text;
    }
    const tokens = tokenizeLine(text, syntaxLanguage);
    if (tokens.length === 0) {
      return text;
    }
    return renderSyntaxSpans(text, tokens);
  }

  const tokenMap =
    isSyntaxEnabled && syntaxLanguage && syntaxLanguage !== 'text'
      ? getSyntaxTokensMap(text, syntaxLanguage)
      : null;

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
    const isConfirmMatch =
      confirmSubstitute &&
      confirmSubstitute.currentMatch.line === lineIdx &&
      i >= confirmSubstitute.currentMatch.col &&
      i < confirmSubstitute.currentMatch.col + confirmSubstitute.currentMatch.length;

    // 빈 줄이거나 줄 끝 뒤의 가상 커서 위치에서는 공백 너비 유지를 위해 non-breaking space 사용
    // Ctrl+r 레지스터 대기 상태에서는 커서 위치에 " 표시
    const displayChar =
      insertRegisterPending && isCursor
        ? '"'
        : (text.length === 0 || isTrailingCursor) && char === ' '
        ? '\u00A0'
        : char;

    const tokenType = tokenMap ? tokenMap[i] : null;

    let classNames = isCursor
      ? `vim-cursor ${
          isFocused
            ? insertRegisterPending
              ? 'cursor-insert-register'
              : insertNormalSession
              ? 'cursor-insert-normal'
              : `cursor-${mode.toLowerCase()}`
            : 'cursor-unfocused'
        }`
      : 'vim-char';

    if (tokenType) {
      classNames += ` syn-${tokenType}`;
    }

    if (isSelected) {
      classNames += ' visual-selected';
    }

    if (isSearchMatch) {
      classNames += ' search-match';
    }

    if (isConfirmMatch) {
      classNames += ' char-confirm-substitute';
    }

    const isSpell = spellErrors?.some((e) => i >= e.startCol && i < e.endCol);
    if (isSpell) {
      classNames += ' spell-error';
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
