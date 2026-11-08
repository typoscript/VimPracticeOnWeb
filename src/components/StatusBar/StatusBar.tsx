import React from 'react';
import { CursorPosition, VimMode, ConfirmSubstituteSession } from '../../vim-engine';
import './StatusBar.css';
import { t } from '../../i18n';

export interface StatusBarProps {
  mode: VimMode;
  cursor: CursorPosition;
  filename?: string;
  pendingKeys?: string;
  /** 매크로 기록 중 상태 정보 */
  recordingMacro?: { register: string; keys: string[] } | null;
  /** 커맨드라인 종류 (':' | '/' | '=') */
  commandType?: ':' | '/' | '=';
  /** 커맨드라인 입력 문자열 */
  commandBuffer?: string;
  /** 커맨드/검색 실행 결과 알림 메시지 */
  commandMessage?: string;
  /** Insert 모드 일회성 Normal 명령 실행 세션 (Ctrl+o) */
  insertNormalSession?: boolean;
  /** Insert 모드 레지스터 삽입 대기 상태 (Ctrl+r) */
  insertRegisterPending?: boolean;
  /** Insert 모드 Ctrl+x 자동완성 서브모드 활성 여부 (^X mode) */
  insertCtrlXMode?: boolean;
  /** :s/.../.../gc 대화형 치환 확인 세션 */
  confirmSubstitute?: ConfirmSubstituteSession | null;
  /** 와일드메뉴 자동완성 세션 상태 */
  wildmenu?: import('../../vim-engine').WildmenuState | null;
  /** 와일드메뉴 비주얼 바 표시 여부 (:set wildmenu) */
  showWildmenuBar?: boolean;
  /** :function 본문 입력 중인 함수 이름과 지금까지 입력한 줄 수 */
  functionDraft?: { name: string; lines: number } | null;
  /** 맞춤법 검사기 활성화 여부 (:set spell) */
  spellActive?: boolean;
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
  insertRegisterPending,
  insertCtrlXMode,
  confirmSubstitute,
  wildmenu,
  functionDraft,
  showWildmenuBar = true,
  spellActive,
}) => {
  const displayMode =
    insertCtrlXMode
      ? '-- ^X mode (^]^D^E^F^I^K^L^N^O^Ps^U^V^Y) --'
      : insertNormalSession
      ? 'INSERT (normal)'
      : insertRegisterPending
      ? 'INSERT (register)'
      : mode === 'REPLACE'
      ? '-- REPLACE --'
      : mode === 'VISUAL_LINE'
      ? 'VISUAL LINE'
      : mode === 'VISUAL_BLOCK'
      ? 'VISUAL BLOCK'
      : mode;
  const modeClass =
    insertCtrlXMode
      ? 'mode-insert-ctrlx'
      : insertNormalSession || insertRegisterPending
      ? 'mode-insert-normal'
      : mode === 'VISUAL_LINE' || mode === 'VISUAL_BLOCK'
      ? 'mode-visual'
      : `mode-${mode.toLowerCase()}`;
  const isCommandLineActive = mode === 'COMMAND' || mode === 'SEARCH';
  const promptPrefix = commandType ?? (mode === 'COMMAND' ? ':' : '/');

  // 언어와 무관하게 판정: Vim 에러 번호(E486 등)로 시작하거나 한/영 에러 문구를 포함
  const isErrorMessage = !!commandMessage && (commandMessage.startsWith('E') || /오류|찾을 수 없습니다|error|not found/i.test(commandMessage));

  return (
    <footer
      className={`status-bar ${isCommandLineActive || confirmSubstitute ? 'status-bar-active-command' : ''}`}
      data-testid="status-bar"
    >
      {wildmenu?.active && showWildmenuBar && wildmenu.candidates.length > 0 && (
        <div className="wildmenu-bar" data-testid="wildmenu-bar">
          {wildmenu.candidates.map((cand, idx) => (
            <span
              key={`${cand}-${idx}`}
              className={`wildmenu-item ${idx === wildmenu.selectedIndex ? 'selected' : ''}`}
              data-testid={idx === wildmenu.selectedIndex ? 'wildmenu-item-selected' : 'wildmenu-item'}
            >
              {cand}
            </span>
          ))}
        </div>
      )}
      <div className="status-bar-left">
        {confirmSubstitute ? (
          <div className="commandline-prompt" data-testid="commandline-prompt">
            <span className="prompt-text">
              replace with {confirmSubstitute.currentMatch.replacement} (y/n/a/q)?
            </span>
            <span className="prompt-cursor">_</span>
          </div>
        ) : isCommandLineActive ? (
          <div className="commandline-prompt" data-testid="commandline-prompt">
            <span className="prompt-prefix">{promptPrefix}</span>
            <span className="prompt-text">{commandBuffer ?? ''}</span>
            <span className="prompt-cursor">_</span>
            <span className="prompt-hint">
              {functionDraft
                ? t('(함수 {name} 본문 {v}번째 줄 • endfunction 으로 끝내기, Esc 취소)', { name: functionDraft.name, v: functionDraft.lines + 1 })
                : commandType === '='
                ? t('(수식 입력 후 Enter 계산 삽입, Esc 취소)')
                : mode === 'COMMAND'
                ? t('(예: 10, %s/old/new/g, w • Enter 실행, Esc 취소)')
                : t('(단어 입력 후 Enter 실행, Esc 취소)')}
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
        {spellActive && (
          <span className="status-spell-badge" data-testid="status-spell-badge">
            [SPELL]
          </span>
        )}
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
