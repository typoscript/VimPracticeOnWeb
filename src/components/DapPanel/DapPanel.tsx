import React, { useState } from 'react';
import {
  DapSessionState,
  evaluateDapWatch,
} from '../../vim-engine';
import { t } from '../../i18n';
import './DapPanel.css';

export interface DapPanelProps {
  session: DapSessionState;
  breakpoints: Record<string, number[]>;
  onContinue: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
  onToggleBreakpoint: () => void;
  onTerminate: () => void;
  onSelectFrame: (index: number) => void;
  onAddWatch: (expr: string) => void;
  onRemoveWatch: (expr: string) => void;
  onJumpBreakpoint: (filename: string, line: number) => void;
  onClose: () => void;
}

/**
 * nvim-dap-ui 스타일 인터랙티브 디버거 분할 패널 (:DapUiToggle / :DapContinue)
 */
export const DapPanel: React.FC<DapPanelProps> = ({
  session,
  breakpoints,
  onContinue,
  onStepOver,
  onStepInto,
  onStepOut,
  onToggleBreakpoint,
  onTerminate,
  onSelectFrame,
  onAddWatch,
  onRemoveWatch,
  onJumpBreakpoint,
  onClose,
}) => {
  const [watchInput, setWatchInput] = useState('');
  const [rightTab, setRightTab] = useState<'stack' | 'breakpoints' | 'console'>('stack');

  const activeFrame = session.frames[session.selectedFrameIndex] ?? session.frames[0];
  const variables = activeFrame?.variables ?? [];
  const bpEntries = Object.entries(breakpoints).flatMap(([file, lines]) =>
    lines.map((line) => ({ file, line }))
  );

  const handleSubmitWatch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = watchInput.trim();
    if (!trimmed) return;
    onAddWatch(trimmed);
    setWatchInput('');
  };

  return (
    <div
      className="dap-panel-container"
      data-testid="dap-panel"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dap-panel-header">
        <div className="dap-title-group">
          <span className="dap-badge">DAP</span>
          <span className="dap-title">nvim-dap-ui</span>
          <span
            className={`dap-status-pill ${
              session.isActive ? (session.isPaused ? 'paused' : 'running') : 'idle'
            }`}
            data-testid="dap-status-pill"
          >
            {session.isActive
              ? session.isPaused
                ? t('일시정지 L{line}', { line: session.currentLine + 1 })
                : t('실행 중')
              : t('대기 중')}
          </span>
        </div>

        <div className="dap-toolbar">
          <button
            type="button"
            className="dap-action-btn primary"
            data-testid="dap-btn-continue"
            onClick={onContinue}
            title={t('디버그 시작 / 계속 (:DapContinue)')}
          >
            ▶ {t('계속')}
          </button>
          <button
            type="button"
            className="dap-action-btn"
            data-testid="dap-btn-step-over"
            onClick={onStepOver}
            disabled={!session.isActive}
            title={t('다음 줄 실행 (:DapStepOver)')}
          >
            ⤵ {t('스텝 오버')}
          </button>
          <button
            type="button"
            className="dap-action-btn"
            data-testid="dap-btn-step-into"
            onClick={onStepInto}
            disabled={!session.isActive}
            title={t('함수 내부 진입 (:DapStepInto)')}
          >
            ↓ {t('스텝 인투')}
          </button>
          <button
            type="button"
            className="dap-action-btn"
            data-testid="dap-btn-step-out"
            onClick={onStepOut}
            disabled={!session.isActive}
            title={t('함수 빠져나오기 (:DapStepOut)')}
          >
            ↑ {t('스텝 아웃')}
          </button>
          <button
            type="button"
            className="dap-action-btn"
            data-testid="dap-btn-bp"
            onClick={onToggleBreakpoint}
            title={t('현재 줄 중단점 토글 (:DapBp)')}
          >
            ● BP
          </button>
          <button
            type="button"
            className="dap-action-btn danger"
            data-testid="dap-btn-stop"
            onClick={onTerminate}
            disabled={!session.isActive}
            title={t('디버그 세션 종료 (:DapTerminate)')}
          >
            ■ {t('중지')}
          </button>
          <button
            type="button"
            className="dap-close-btn"
            data-testid="dap-btn-close"
            onClick={onClose}
            aria-label={t('디버거 패널 닫기')}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="dap-panel-grid">
        {/* 좌측: Scopes / Variables */}
        <section className="dap-section" data-testid="dap-scopes-section">
          <div className="dap-section-title">
            {t('지역 변수 (Scopes)')}{' '}
            {activeFrame && <span className="dap-frame-tag">{activeFrame.name}</span>}
          </div>
          <div className="dap-section-body">
            {variables.length === 0 ? (
              <div className="dap-empty">
                {t(':DapContinue 로 디버깅을 시작하면 지역 변수가 표시됩니다.')}
              </div>
            ) : (
              variables.map((v) => (
                <div
                  key={v.name}
                  className={`dap-var-row ${v.changed ? 'changed' : ''}`}
                  data-testid={`dap-var-${v.name}`}
                >
                  <span className="dap-var-name">{v.name}</span>
                  <span className="dap-var-eq">=</span>
                  <span className="dap-var-val">{v.value}</span>
                  <span className="dap-var-type">{v.type}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 중앙: Watch Expressions */}
        <section className="dap-section" data-testid="dap-watches-section">
          <div className="dap-section-title">{t('감시 표현식 (Watches)')}</div>
          <form className="dap-watch-form" onSubmit={handleSubmitWatch}>
            <input
              type="text"
              className="dap-watch-input"
              data-testid="dap-watch-input"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder={t('표현식 추가 (예: total - discount)')}
            />
            <button type="submit" className="dap-watch-add-btn" data-testid="dap-watch-add-btn">
              +
            </button>
          </form>
          <div className="dap-section-body">
            {session.watches.length === 0 ? (
              <div className="dap-empty">{t(':DapWatch <expr> 또는 위 입력창으로 감시식을 추가하세요.')}</div>
            ) : (
              session.watches.map((expr) => {
                const res = evaluateDapWatch(expr, variables);
                return (
                  <div
                    key={expr}
                    className={`dap-var-row ${res.error ? 'error' : ''}`}
                    data-testid={`dap-watch-item-${expr}`}
                  >
                    <span className="dap-var-name">{expr}</span>
                    <span className="dap-var-eq">=</span>
                    <span className="dap-var-val">{res.value}</span>
                    <button
                      type="button"
                      className="dap-watch-rm"
                      onClick={() => onRemoveWatch(expr)}
                      aria-label={t('감시식 제거')}
                    >
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 우측: Call Stack / Breakpoints / Console */}
        <section className="dap-section" data-testid="dap-right-section">
          <div className="dap-right-tabs">
            <button
              type="button"
              className={`dap-tab-btn ${rightTab === 'stack' ? 'active' : ''}`}
              onClick={() => setRightTab('stack')}
              data-testid="dap-tab-stack"
            >
              {t('콜스택')} ({session.frames.length})
            </button>
            <button
              type="button"
              className={`dap-tab-btn ${rightTab === 'breakpoints' ? 'active' : ''}`}
              onClick={() => setRightTab('breakpoints')}
              data-testid="dap-tab-breakpoints"
            >
              {t('중단점')} ({bpEntries.length})
            </button>
            <button
              type="button"
              className={`dap-tab-btn ${rightTab === 'console' ? 'active' : ''}`}
              onClick={() => setRightTab('console')}
              data-testid="dap-tab-console"
            >
              {t('콘솔')} ({session.consoleOutput.length})
            </button>
          </div>
          <div className="dap-section-body">
            {rightTab === 'stack' &&
              (session.frames.length === 0 ? (
                <div className="dap-empty">{t('활성 콜스택이 없습니다.')}</div>
              ) : (
                session.frames.map((frame, idx) => (
                  <button
                    key={frame.id}
                    type="button"
                    className={`dap-list-row ${
                      idx === session.selectedFrameIndex ? 'selected' : ''
                    }`}
                    data-testid={`dap-frame-${idx}`}
                    onClick={() => onSelectFrame(idx)}
                  >
                    <span className="dap-frame-fn">{frame.name}</span>
                    <span className="dap-frame-loc">
                      {frame.filename}:{frame.line + 1}
                    </span>
                  </button>
                ))
              ))}

            {rightTab === 'breakpoints' &&
              (bpEntries.length === 0 ? (
                <div className="dap-empty">{t('설정된 중단점이 없습니다 (:DapBp).')}</div>
              ) : (
                bpEntries.map((bp) => (
                  <button
                    key={`${bp.file}:${bp.line}`}
                    type="button"
                    className="dap-list-row"
                    data-testid={`dap-bp-row-${bp.line + 1}`}
                    onClick={() => onJumpBreakpoint(bp.file, bp.line)}
                  >
                    <span className="dap-bp-dot">●</span>
                    <span className="dap-frame-fn">{bp.file}</span>
                    <span className="dap-frame-loc">L{bp.line + 1}</span>
                  </button>
                ))
              ))}

            {rightTab === 'console' &&
              (session.consoleOutput.length === 0 ? (
                <div className="dap-empty">{t('디버그 콘솔 출력이 없습니다.')}</div>
              ) : (
                session.consoleOutput.map((line, i) => (
                  <div key={i} className="dap-console-line" data-testid={`dap-console-${i}`}>
                    {line}
                  </div>
                ))
              ))}
          </div>
        </section>
      </div>
    </div>
  );
};
