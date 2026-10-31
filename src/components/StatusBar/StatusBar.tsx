import React from 'react';
import { CursorPosition, VimMode } from '../../types/vim';
import './StatusBar.css';

export interface StatusBarProps {
  mode: VimMode;
  cursor: CursorPosition;
  filename?: string;
  pendingKeys?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  cursor,
  filename = 'practice.txt',
  pendingKeys,
}) => {
  const displayMode = mode === 'VISUAL_LINE' ? 'VISUAL LINE' : mode;
  const modeClass = mode === 'VISUAL_LINE' ? 'mode-visual' : `mode-${mode.toLowerCase()}`;

  return (
    <footer className="status-bar" data-testid="status-bar">
      <div className="status-bar-left">
        <span
          className={`status-mode-badge ${modeClass}`}
          data-testid="status-mode"
        >
          {displayMode}
        </span>
        <span className="status-filename" data-testid="status-filename">
          {filename}
        </span>
      </div>

      <div className="status-bar-right">
        {pendingKeys && (
          <span className="status-pending-keys" data-testid="status-pending-keys">
            {pendingKeys}
          </span>
        )}
        <span className="status-cursor-pos" data-testid="status-cursor-pos">
          {cursor.line + 1}:{cursor.col + 1}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
