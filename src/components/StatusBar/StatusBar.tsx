import React from 'react';
import { CursorPosition, VimMode } from '../../types/vim';
import './StatusBar.css';

export interface StatusBarProps {
  mode: VimMode;
  cursor: CursorPosition;
  filename?: string;
  pendingKeys?: string;
  /** 매크로 기록 중 상태 정보 */
  recordingMacro?: { register: string; keys: string[] } | null;
  /** 커맨드라인 종류 (':' | '/') */
  commandType?: ':' | '/';
  /** 커맨드라인 입력 문자열 */
  commandBuffer?: string;
  /** 커맨드/검색 실행 결과 알림 메시지 */
  commandMessage?: string;
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  cursor,
  filename = 'practice.txt',
  pendingKeys,
  recordingMacro,
  commandType,
  commandBuffer,
  commandMessage,
  insertNormalSession,
}) => {
  const displayMode =
    insertNormalSession
      ? 'INSERT (normal)'
      : mode === 'VISUAL_LINE'
      ? 'VISUAL LINE'
      : mode === 'VISUAL_BLOCK'
      ? 'VISUAL BLOCK'
      : mode;
  const modeClass =
    insertNormalSession
      ? 'mode-insert-normal'
      : mode === 'VISUAL_LINE' || mode === 'VISUAL_BLOCK'
      ? 'mode-visual'
      : `mode-${mode.toLowerCase()}`;
  const isCommandLineActive = mode === 'COMMAND' || mode === 'SEARCH';
  const promptPrefix = commandType ?? (mode === 'COMMAND' ? ':' : '/');

  const isErrorMessage = commandMessage?.startsWith('E') || commandMessage?.includes('오류') || commandMessage?.includes('찾을 수 없습니다');

  return (
    <footer
      className={`status-bar ${isCommandLineActive ? 'status-bar-active-command' : ''}`}
      data-testid="status-bar"
    >
      <div className="status-bar-left">
        {isCommandLineActive ? (
          <div className="commandline-prompt" data-testid="commandline-prompt">
            <span className="prompt-prefix">{promptPrefix}</span>
            <span className="prompt-text">{commandBuffer ?? ''}</span>
            <span className="prompt-cursor">_</span>
            <span className="prompt-hint">
              {mode === 'COMMAND'
                ? '(예: 10, %s/old/new/g, w • Enter 실행, Esc 취소)'
                : '(단어 입력 후 Enter 실행, Esc 취소)'}
            </span>
          </div>
        ) : (
          <>
            <span
              className={`status-mode-badge ${modeClass}`}
              data-testid="status-mode"
            >
              {displayMode}
            </span>
            {recordingMacro && (
              <span
                className="status-macro-recording"
                data-testid="status-macro-recording"
              >
                <span className="macro-rec-dot">●</span> recording @{recordingMacro.register}
              </span>
            )}
            {commandMessage ? (
              <span
                className={`status-command-message ${isErrorMessage ? 'error' : 'info'}`}
                data-testid="status-command-message"
              >
                <span className="message-icon">{isErrorMessage ? '⚠️' : 'ℹ️'}</span>
                <span className="message-text">{commandMessage}</span>
              </span>
            ) : (
              <span className="status-filename" data-testid="status-filename">
                {filename}
              </span>
            )}
          </>
        )}
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
