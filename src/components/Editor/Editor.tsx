import React from 'react';
import { CursorPosition, VimMode } from '../../types/vim';
import './Editor.css';

export interface EditorProps {
  lines: string[];
  cursor: CursorPosition;
  mode: VimMode;
}

export const Editor: React.FC<EditorProps> = ({ lines, cursor, mode }) => {
  return (
    <div className="editor-container" data-testid="editor-container">
      <div className="editor-scroller">
        <div className="editor-lines">
          {lines.map((lineText, lineIdx) => {
            const isCursorLine = cursor.line === lineIdx;

            return (
              <div
                key={lineIdx}
                className={`editor-row ${isCursorLine ? 'active-row' : ''}`}
                data-testid={`editor-row-${lineIdx + 1}`}
              >
                <div className="line-number" aria-hidden="true">
                  {lineIdx + 1}
                </div>
                <div className="line-content">
                  {renderLineContent(lineText, isCursorLine ? cursor.col : null, mode)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function renderLineContent(
  text: string,
  cursorCol: number | null,
  mode: VimMode
): React.ReactNode {
  // 빈 줄이면서 커서가 없는 경우
  if (text.length === 0 && cursorCol === null) {
    return <span className="empty-char">&nbsp;</span>;
  }

  // 커서가 없는 줄은 원본 텍스트 그대로 표시 (white-space: pre)
  if (cursorCol === null) {
    return text;
  }

  // 커서가 있는 줄 처리
  const chars = text.length === 0 ? [' '] : text.split('');
  const maxIdx = Math.max(chars.length - 1, cursorCol);

  const elements: React.ReactNode[] = [];
  for (let i = 0; i <= maxIdx; i++) {
    const char = chars[i] !== undefined ? chars[i] : ' ';
    const isCursor = i === cursorCol;
    const isTrailingCursor = isCursor && i >= text.length;
    // 빈 줄이거나 줄 끝 뒤의 가상 커서 위치에서는 공백 너비 유지를 위해 non-breaking space 사용
    const displayChar = ((text.length === 0 || isTrailingCursor) && char === ' ') ? '\u00A0' : char;

    if (isCursor) {
      elements.push(
        <span
          key={i}
          className={`vim-cursor cursor-${mode.toLowerCase()}`}
          data-testid="vim-cursor"
        >
          {displayChar}
        </span>
      );
    } else {
      elements.push(
        <span key={i} className="vim-char">
          {displayChar}
        </span>
      );
    }
  }

  return <>{elements}</>;
}

export default Editor;
