import React from 'react';
import {
  CursorPosition,
  VimMode,
  SearchMatch,
  CustomMatchSpan,
  ConfirmSubstituteSession,
  IncCommandPreviewMatch,
  FlashJumpMatch,
  BlockInsertSession,
  SpellError,
  SyntaxToken,
  SupportedLanguage,
  LspDiagnostic,
  ParsedListchars,
  isPositionSelected,
  tokenizeLine,
  getSyntaxTokensMap,
} from '../../vim-engine';

export interface RenderLineOptions {
  text: string;
  lineIdx: number;
  cursor: CursorPosition;
  mode: VimMode;
  targetCol: number | null;
  visualAnchor?: CursorPosition;
  visualBlockEndOfLine?: boolean;
  lineMatches: SearchMatch[];
  lineCustomMatches?: CustomMatchSpan[];
  isFocused: boolean;
  insertNormalSession?: boolean;
  insertRegisterPending?: boolean;
  confirmSubstitute?: ConfirmSubstituteSession | null;
  incCommandMatches?: IncCommandPreviewMatch[];
  incCommandHasReplacement?: boolean;
  flashMatches?: FlashJumpMatch[];
  blockInsertSession?: BlockInsertSession | null;
  spellErrors?: SpellError[];
  lineDiagnostics?: LspDiagnostic[];
  syntaxLanguage?: SupportedLanguage;
  isSyntaxEnabled?: boolean;
  listMode?: boolean;
  listchars?: ParsedListchars;
  tabstop?: number;
  cursorColumnCol?: number | null;
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

/** 에디터 단일 줄의 문자 단위 커서·비주얼 선택·검색·맞춤법·진단·listchars 하이라이트를 렌더링합니다. */
export function renderLineContent(opts: RenderLineOptions): React.ReactNode {
  const {
    text,
    lineIdx,
    cursor,
    mode,
    targetCol,
    visualAnchor,
    visualBlockEndOfLine,
    lineMatches,
    lineCustomMatches,
    isFocused,
    insertNormalSession,
    insertRegisterPending,
    confirmSubstitute,
    incCommandMatches,
    incCommandHasReplacement,
    flashMatches,
    blockInsertSession,
    spellErrors,
    lineDiagnostics,
    syntaxLanguage,
    isSyntaxEnabled,
    listMode,
    listchars,
    tabstop = 2,
    cursorColumnCol = null,
  } = opts;
  const isCursorLine = cursor.line === lineIdx;
  const cursorCol = isCursorLine ? cursor.col : null;

  // 빈 줄이면서 커서와 타겟, 비주얼/셀렉트 선택, 검색 매칭, 맞춤법 오류가 모두 없는 경우
  const hasVisual =
    (mode === 'VISUAL' ||
      mode === 'VISUAL_LINE' ||
      mode === 'VISUAL_BLOCK' ||
      mode === 'SELECT' ||
      mode === 'SELECT_LINE' ||
      mode === 'SELECT_BLOCK') &&
    !!visualAnchor;
  const isLineInVisualRange =
    hasVisual &&
    lineIdx >= Math.min(visualAnchor.line, cursor.line) &&
    lineIdx <= Math.max(visualAnchor.line, cursor.line);

  const hasSearchMatches = lineMatches.length > 0;
  const hasCustomMatches = (lineCustomMatches?.length ?? 0) > 0;
  const hasIncMatches = (incCommandMatches?.length ?? 0) > 0;
  const hasFlashMatches = (flashMatches?.length ?? 0) > 0;
  const hasSpellErrors = (spellErrors?.length ?? 0) > 0;
  const hasDiagnostics = (lineDiagnostics?.length ?? 0) > 0;

  // 비주얼 블록 I / A / c 다중 줄 실시간 멀티커서 & 고스트 프리뷰 계산 (첫 줄이 아닌 대상 줄)
  let blockSecondaryCol: number | null = null;
  let blockGhostText = '';
  if (
    mode === 'INSERT' &&
    blockInsertSession &&
    !isCursorLine &&
    blockInsertSession.lines.includes(lineIdx) &&
    !(blockInsertSession.skippedLines && blockInsertSession.skippedLines.includes(lineIdx))
  ) {
    const { col: insertCol, insertMode, endOfLine, minCol = 0, count = 1, typedChars } = blockInsertSession;
    const unitText = typedChars.join('');
    blockGhostText = count > 1 ? unitText.repeat(count) : unitText;
    if (endOfLine) {
      blockSecondaryCol = text.length;
    } else if (insertMode === 'A') {
      blockSecondaryCol = insertCol;
    } else if (insertMode === 'I') {
      if (insertCol === 0 || text.length > insertCol) {
        blockSecondaryCol = insertCol;
      }
    } else {
      blockSecondaryCol = Math.min(minCol, text.length);
    }
  }

  if (
    text.length === 0 &&
    cursorCol === null &&
    blockSecondaryCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches &&
    !hasCustomMatches &&
    !hasIncMatches &&
    !hasFlashMatches &&
    !hasSpellErrors &&
    !hasDiagnostics &&
    cursorColumnCol === null
  ) {
    if (listMode && listchars?.eol) {
      return (
        <span className="vim-char listchar listchar-eol" data-testid="listchar-eol">
          {listchars.eol}
        </span>
      );
    }
    return <span className="empty-char">&nbsp;</span>;
  }

  // 커서, 타겟, 비주얼 선택, 검색 매칭, 맞춤법/LSP 오류, 불가시 문자 표시가 모두 없는 일반 줄
  if (
    cursorCol === null &&
    blockSecondaryCol === null &&
    targetCol === null &&
    !isLineInVisualRange &&
    !hasSearchMatches &&
    !hasCustomMatches &&
    !hasIncMatches &&
    !hasFlashMatches &&
    !hasSpellErrors &&
    !hasDiagnostics &&
    !listMode &&
    cursorColumnCol === null
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

  let trailingSpaceStart = text.length;
  while (trailingSpaceStart > 0 && text[trailingSpaceStart - 1] === ' ') {
    trailingSpaceStart--;
  }
  let leadingEnd = 0;
  while (leadingEnd < text.length && text[leadingEnd] === ' ') {
    leadingEnd++;
  }

  // 커서 또는 타겟, 비주얼 선택, 검색 매치가 있는 줄 처리
  const chars = text.length === 0 ? [' '] : text.split('');
  const maxIdx = Math.max(
    chars.length - 1,
    cursorCol !== null ? cursorCol : 0,
    blockSecondaryCol !== null ? blockSecondaryCol : 0,
    targetCol !== null ? targetCol : 0,
    cursorColumnCol !== null ? cursorColumnCol : 0
  );

  let eolRenderedOnCursor = false;
  const elements: React.ReactNode[] = [];
  for (let i = 0; i <= maxIdx; i++) {
    if (blockSecondaryCol !== null && i === blockSecondaryCol && blockGhostText.length > 0) {
      elements.push(
        <span
          key={`block-ghost-${i}`}
          className="vim-block-ghost-preview"
          data-testid="vim-block-ghost-preview"
        >
          {blockGhostText}
        </span>
      );
    }
    const char = chars[i] !== undefined ? chars[i] : ' ';
    const isCursor = i === cursorCol;
    const isBlockSecondaryCursor = i === blockSecondaryCol;
    const isTarget = i === targetCol;
    const isSelected =
      hasVisual &&
      isPositionSelected(lineIdx, i, visualAnchor, cursor, mode, visualBlockEndOfLine);
    const isSearchMatch = lineMatches.some(
      (m) => i >= m.col && i < m.col + m.length
    );
    let customMatchGroupClass = '';
    if (lineCustomMatches && lineCustomMatches.length > 0) {
      let activeCustom: CustomMatchSpan | null = null;
      for (const cm of lineCustomMatches) {
        if (i >= cm.col && i < cm.col + cm.length) {
          activeCustom = cm;
        }
      }
      if (activeCustom) {
        const g = activeCustom.group.toLowerCase();
        const variant =
          g.includes('error')
            ? 'error'
            : g.includes('warn')
              ? 'warning'
              : g.includes('todo')
                ? 'todo'
                : g.includes('diffadd')
                  ? 'diffadd'
                  : g.includes('diffdel')
                    ? 'diffdelete'
                    : g.includes('visual')
                      ? 'visual'
                      : g.includes('search')
                        ? 'search'
                        : 'default';
        customMatchGroupClass = ` custom-match custom-match-${variant}`;
      }
    }
    const isTrailingCursor = (isCursor || isBlockSecondaryCursor) && i >= text.length;
    const isConfirmMatch =
      confirmSubstitute &&
      confirmSubstitute.currentMatch.line === lineIdx &&
      i >= confirmSubstitute.currentMatch.col &&
      i < confirmSubstitute.currentMatch.col + confirmSubstitute.currentMatch.length;
    const incMatchAtStart = incCommandMatches?.find((m) => m.col === i);
    const isIncMatch = incCommandMatches?.some((m) => i >= m.col && i < m.col + m.length) ?? false;
    const flashLabelAtStart = flashMatches?.find((m) => m.col === i);
    const isFlashMatch = flashMatches?.some((m) => i >= m.col && i < m.col + m.length) ?? false;

    if (flashLabelAtStart) {
      elements.push(
        <span
          key={i}
          className="vim-char flash-label-badge"
          data-testid={`flash-label-${flashLabelAtStart.label}`}
        >
          {flashLabelAtStart.label}
        </span>
      );
      continue;
    }

    let listCharClass = '';
    let listCharDisplay: string | null = null;
    if (listMode && listchars && !(insertRegisterPending && isCursor)) {
      if (i < text.length) {
        if (char === '\t' && listchars.tab) {
          const fill = listchars.tab[1] ?? ' ';
          const endChar = listchars.tab[2];
          listCharDisplay =
            listchars.tab[0] +
            (endChar
              ? fill.repeat(Math.max(0, tabstop - 2)) + endChar
              : fill.repeat(Math.max(0, tabstop - 1)));
          listCharClass = ' listchar listchar-tab';
        } else if (char === ' ') {
          if (i >= trailingSpaceStart && listchars.trail) {
            listCharDisplay = listchars.trail;
            listCharClass = ' listchar listchar-trail';
          } else if (i < leadingEnd && listchars.lead) {
            listCharDisplay = listchars.lead;
            listCharClass = ' listchar listchar-space';
          } else if (listchars.space) {
            listCharDisplay = listchars.space;
            listCharClass = ' listchar listchar-space';
          }
        } else if (char === '\u00A0' && listchars.nbsp) {
          listCharDisplay = listchars.nbsp;
          listCharClass = ' listchar listchar-nbsp';
        }
      } else if (i === text.length && listchars.eol) {
        listCharDisplay = listchars.eol;
        listCharClass = ' listchar listchar-eol';
        eolRenderedOnCursor = true;
      }
    }

    // 빈 줄이거나 줄 끝 뒤의 가상 커서 위치에서는 공백 너비 유지를 위해 non-breaking space 사용
    // Ctrl+r 레지스터 대기 상태에서는 커서 위치에 " 표시
    const displayChar =
      insertRegisterPending && isCursor
        ? '"'
        : listCharDisplay !== null
        ? listCharDisplay
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
      : isBlockSecondaryCursor
      ? 'vim-char vim-block-secondary-cursor'
      : 'vim-char';

    if (tokenType) {
      classNames += ` syn-${tokenType}`;
    }

    if (listCharClass) {
      classNames += listCharClass;
    }

    if (isSelected) {
      classNames += ' visual-selected';
    }

    if (isSearchMatch) {
      classNames += ' search-match';
    }

    if (customMatchGroupClass) {
      classNames += customMatchGroupClass;
    }

    if (isConfirmMatch) {
      classNames += ' char-confirm-substitute';
    }

    if (isIncMatch) {
      classNames += incCommandHasReplacement
        ? ' inccommand-match-replaced'
        : ' inccommand-match';
    }

    if (isFlashMatch) {
      classNames += ' flash-match-char';
    }

    const isSpell = spellErrors?.some((e) => i >= e.startCol && i < e.endCol);
    if (isSpell) {
      classNames += ' spell-error';
    }

    const diagAtChar = lineDiagnostics?.find((d) => i >= d.col && i < d.endCol);
    if (diagAtChar) {
      classNames += ` lsp-diag-${diagAtChar.severity}`;
    }

    if (isTarget) {
      classNames += ' target-marker';
    }

    if (cursorColumnCol !== null && i === cursorColumnCol && !isCursor) {
      classNames += ' cursor-column-cell';
    }

    if (incCommandHasReplacement && incMatchAtStart) {
      elements.push(
        <span
          key={`inc-rep-${i}`}
          className="vim-char inccommand-replacement"
          data-testid="inccommand-replacement"
        >
          {incMatchAtStart.replacement}
        </span>
      );
    }

    elements.push(
      <span
        key={i}
        className={classNames}
        data-testid={
          isCursor
            ? 'vim-cursor'
            : isBlockSecondaryCursor
            ? 'vim-block-secondary-cursor'
            : isSelected
            ? 'visual-selected-char'
            : isIncMatch
            ? 'inccommand-match'
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

  if (listMode && listchars?.eol && !eolRenderedOnCursor) {
    elements.push(
      <span
        key="eol"
        className="vim-char listchar listchar-eol"
        data-testid="listchar-eol"
      >
        {listchars.eol}
      </span>
    );
  }

  return <>{elements}</>;
}
