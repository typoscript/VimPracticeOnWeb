import React, { useEffect, useMemo, useState } from 'react';
import { VimEditorState } from '../../vim-engine';
import {
  MacroTrace,
  MACRO_PLAYBACK_SPEEDS,
  buildMacroTrace,
  clampFrameIndex,
  getMacroKeys,
  listMacroRegisters,
  explainMacroKeyAction,
  getMacroFailureReason,
} from '../../vim-engine';
import './MacroDebugger.css';
import { t } from '../../i18n';

export interface MacroDebuggerProps {
  /** 매크로 추적의 출발점이 되는 실제 에디터 상태 */
  baseState: VimEditorState;
  isOpen: boolean;
  onToggle: () => void;
  /** 현재 프레임의 상태를 에디터에 미리보기로 표시 (null = 미리보기 해제) */
  onPreviewFrame: (state: VimEditorState | null) => void;
  /** 디버깅을 마치고 `[count]@{reg}`를 에디터에 실제로 실행 */
  onRunMacro: (register: string, count: number) => void;
}

/** 특수 키를 사람이 읽기 쉬운 라벨로 변환합니다. */
export function formatMacroKey(key: string): string {
  if (key === ' ') return '␣';
  if (key === 'Escape') return 'Esc';
  if (key === 'Enter') return '⏎';
  if (key === 'Backspace') return '⌫';
  if (key === 'Tab') return '⇥';
  if (key.startsWith('Ctrl-')) return `^${key.slice(5)}`;
  return key;
}

export const MacroDebugger: React.FC<MacroDebuggerProps> = ({
  baseState,
  isOpen,
  onToggle,
  onPreviewFrame,
  onRunMacro,
}) => {
  const macroRegisters = useMemo(() => listMacroRegisters(baseState), [baseState]);
  const [selectedRegister, setSelectedRegister] = useState<string>('');
  const [count, setCount] = useState(1);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [trace, setTrace] = useState<MacroTrace | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTutorMode, setIsTutorMode] = useState(true);

  const register = macroRegisters.includes(selectedRegister) ? selectedRegister : macroRegisters[0] ?? '';
  // @{reg}는 NORMAL 모드의 새 명령으로만 실행되므로, 다른 모드나 대기 키가 있을 때는 추적·실행을 막습니다.
  const canDebug = baseState.mode === 'NORMAL' && !baseState.pendingKeys;

  // 에디터 상태가 바뀌면(키 입력, 실제 실행 등) 기존 추적 결과는 더 이상 유효하지 않으므로 초기화합니다.
  useEffect(() => {
    setTrace(null);
    setIsPlaying(false);
    setFrameIndex(0);
  }, [baseState]);

  // 현재 프레임을 에디터 미리보기로 반영합니다.
  useEffect(() => {
    onPreviewFrame(trace ? trace.frames[frameIndex].state : null);
  }, [trace, frameIndex, onPreviewFrame]);

  // 패널이 닫히거나 언마운트되면 미리보기를 해제합니다.
  useEffect(() => {
    if (!isOpen) onPreviewFrame(null);
    return () => onPreviewFrame(null);
  }, [isOpen, onPreviewFrame]);

  // 슬로우모션 자동 재생
  useEffect(() => {
    if (!isPlaying || !trace) return;
    if (frameIndex >= trace.frames.length - 1) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setFrameIndex((i) => clampFrameIndex(trace, i + 1));
    }, MACRO_PLAYBACK_SPEEDS[speedIndex].delayMs);
    return () => clearTimeout(timer);
  }, [isPlaying, trace, frameIndex, speedIndex]);

  if (!isOpen) {
    return null;
  }

  const ensureTrace = (): MacroTrace | null => {
    if (trace) return trace;
    if (!register || !canDebug) return null;
    const next = buildMacroTrace(baseState, register, count);
    setTrace(next);
    setFrameIndex(0);
    return next;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const t = ensureTrace();
    if (!t) return;
    if (trace && frameIndex >= t.frames.length - 1) {
      setFrameIndex(0);
    }
    setIsPlaying(true);
  };

  const handleStep = (delta: number) => {
    setIsPlaying(false);
    const t = ensureTrace();
    if (!t) return;
    // 처음 추적을 시작하는 스텝은 첫 키 적용 프레임으로 이동합니다.
    const base = trace ? frameIndex : 0;
    setFrameIndex(clampFrameIndex(t, base + delta));
  };

  const handleJumpToKey = (iteration: number, keyIndex: number) => {
    setIsPlaying(false);
    const t = ensureTrace();
    if (!t) return;
    const targetIdx = t.frames.findIndex(
      (f) => f.iteration === iteration && f.keyIndex === keyIndex
    );
    if (targetIdx >= 0) {
      setFrameIndex(targetIdx);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setTrace(null);
    setFrameIndex(0);
  };

  const changeCount = (delta: number) => {
    setCount((c) => Math.max(1, Math.min(99, c + delta)));
    handleReset();
  };

  const handleRun = () => {
    if (!register || !canDebug) return;
    handleReset();
    onPreviewFrame(null);
    onRunMacro(register, count);
  };

  const keys = trace ? trace.keys : getMacroKeys(baseState, register);
  const frame = trace ? trace.frames[frameIndex] : null;
  const prevFrame = trace && frameIndex > 0 ? trace.frames[frameIndex - 1] : null;
  const prevFrameState = prevFrame?.state;
  const totalFrames = trace ? trace.frames.length - 1 : keys.length * count;
  const frameState = frame?.state;
  const cursorLine = frameState ? frameState.lines[frameState.cursor.line] ?? '' : '';
  const prevLine = prevFrameState
    ? (frameState ? prevFrameState.lines[frameState.cursor.line] ?? prevFrameState.lines[prevFrameState.cursor.line] ?? '' : '')
    : '';
  const cursorCol = frameState?.cursor.col ?? 0;

  return (
    // 패널 버튼이 포커스를 가져가면 이후 Enter/Space 키가 에디터와 버튼에 동시에 전달되므로 포커스를 막습니다.
    <aside
      className="macro-debugger-panel"
      data-testid="macro-debugger"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="macro-debugger-header">
        <div className="macro-debugger-title-area">
          <span className="macro-debugger-icon">🎞️</span>
          <h3 className="macro-debugger-title">Macro Debugger</h3>
          <span className="macro-debugger-subtitle">{t('매크로 슬로우모션 단계별 실행')}</span>
          <button
            type="button"
            className={`macro-tutor-toggle-btn ${isTutorMode ? 'active' : ''}`}
            onClick={() => setIsTutorMode(!isTutorMode)}
            title={t('단계별 Vim 의미와 변경사항을 해설하는 튜터 모드 토글')}
            data-testid="macro-tutor-toggle-btn"
          >
            🎓 {t('스마트 튜터')}
          </button>
        </div>
        <button
          className="macro-debugger-close-btn"
          onClick={onToggle}
          title={t('매크로 디버거 닫기')}
          data-testid="close-macro-debugger-btn"
        >
          ✕
        </button>
      </div>

      {macroRegisters.length === 0 ? (
        <div className="macro-debugger-empty" data-testid="macro-debugger-empty">
          {t('녹화된 매크로가 없습니다.')} <code>qa</code> … <code>q</code> {t('로 매크로를 먼저 녹화하세요.')}
        </div>
      ) : (
        <>
          <div className="macro-debugger-controls">
            <div className="macro-control">
              <span>{t('레지스터')}</span>
              <div className="macro-register-group" role="radiogroup" aria-label={t('매크로 레지스터')}>
                {macroRegisters.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={register === r}
                    className={`macro-register-btn ${register === r ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedRegister(r);
                      handleReset();
                    }}
                    data-testid={`macro-register-${r}`}
                  >
                    @{r}
                  </button>
                ))}
              </div>
            </div>
            <div className="macro-control">
              <span>{t('반복')}</span>
              <button
                type="button"
                className="macro-count-btn"
                onClick={() => changeCount(-1)}
                data-testid="macro-count-dec"
                aria-label={t('반복 횟수 감소')}
              >
                −
              </button>
              <span className="macro-count-value" data-testid="macro-count-value">
                {count}
              </span>
              <button
                type="button"
                className="macro-count-btn"
                onClick={() => changeCount(1)}
                data-testid="macro-count-inc"
                aria-label={t('반복 횟수 증가')}
              >
                +
              </button>
            </div>
            <div className="macro-speed-group" role="radiogroup" aria-label={t('재생 속도')}>
              {MACRO_PLAYBACK_SPEEDS.map((sp, i) => (
                <button
                  key={sp.label}
                  type="button"
                  role="radio"
                  aria-checked={speedIndex === i}
                  className={`macro-speed-btn ${speedIndex === i ? 'active' : ''}`}
                  onClick={() => setSpeedIndex(i)}
                  data-testid={`macro-speed-${sp.label}`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>

          <div className="macro-debugger-transport">
            <button type="button" onClick={handleReset} title={t('처음으로')} data-testid="macro-reset-btn">
              ⏮
            </button>
            <button type="button" onClick={() => handleStep(-1)} title={t('이전 키')} data-testid="macro-prev-btn">
              ◀
            </button>
            <button
              type="button"
              className="macro-play-btn"
              onClick={handlePlayPause}
              disabled={!canDebug && !trace}
              title={isPlaying ? t('일시정지') : t('슬로우모션 재생')}
              data-testid="macro-play-btn"
            >
              {isPlaying ? t('⏸ 일시정지') : t('▶ 재생')}
            </button>
            <button type="button" onClick={() => handleStep(1)} title={t('다음 키')} data-testid="macro-next-btn">
              ▶
            </button>
            <button
              type="button"
              className="macro-run-btn"
              onClick={handleRun}
              disabled={!canDebug}
              title={t('에디터에 {v}@{register} 실제 실행', { v: count > 1 ? count : '', register })}
              data-testid="macro-run-btn"
            >
              {t('⚡ {count}@{register} 실행', { count: count > 1 ? count : '', register })}
            </button>
          </div>

          {!canDebug && (
            <div className="macro-debugger-warning" data-testid="macro-debugger-mode-warning">
              {t('⚠ NORMAL 모드에서 대기 중인 키 없이만 매크로를 추적·실행할 수 있습니다. (현재: {mode}', { mode: baseState.mode })}
              {baseState.pendingKeys ? t(' · 대기 키 {pendingKeys}', { pendingKeys: baseState.pendingKeys }) : ''})
            </div>
          )}

          <div className="macro-key-strip" data-testid="macro-key-strip">
            {Array.from({ length: trace ? trace.count : 1 }).map((_, it) => (
              <div className="macro-iteration" key={it}>
                {trace && trace.count > 1 && <span className="macro-iteration-label">#{it + 1}</span>}
                {keys.map((k, ki) => {
                  const isCurrent = !!frame && frame.iteration === it && frame.keyIndex === ki;
                  const isDone =
                    !!frame && (frame.iteration > it || (frame.iteration === it && frame.keyIndex > ki));
                  const isSkipped = !!frame?.failed && !isCurrent && !isDone;
                  return (
                    <span
                      key={ki}
                      className={`macro-key-chip ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''} ${
                        isCurrent && frame?.failed ? 'failed' : ''
                      } ${isSkipped ? 'skipped' : ''}`}
                      data-testid={isCurrent ? 'macro-current-key' : undefined}
                      onClick={() => handleJumpToKey(it, ki)}
                      title={t('클릭하여 이 키 시점으로 점프')}
                    >
                      {formatMacroKey(k)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="macro-frame-info" data-testid="macro-frame-info">
            {frame && frameState ? (
              <>
                <span className="macro-frame-counter">
                  {t('프레임 {frame} / {total}', { frame: frameIndex, total: totalFrames })}
                </span>
                <span className={`macro-mode-badge mode-${frameState.mode.toLowerCase()}`}>{frameState.mode}</span>
                <span className="macro-cursor-pos">
                  {frameState.cursor.line + 1}:{frameState.cursor.col + 1}
                </span>
                {frame.changed && <span className="macro-changed-badge">{t('✎ 버퍼 변경')}</span>}
                {frame.failed && (
                  <span className="macro-failed-badge" data-testid="macro-failed-badge">
                    {t('⚠ 모션 실패 → 매크로 중단 (남은 키·반복 생략)')}
                  </span>
                )}
                <code className="macro-line-preview" data-testid="macro-line-preview">
                  {cursorLine.slice(0, cursorCol)}
                  <span className="macro-cursor-char">{cursorLine[cursorCol] ?? ' '}</span>
                  {cursorLine.slice(cursorCol + 1)}
                </code>
              </>
            ) : (
              <span className="macro-frame-hint">
                {t('총 {n}개 키 · ▶ 재생 또는 ▶ 다음 키로 한 프레임씩 확인하세요. 미리보기 중 에디터는 변경되지 않습니다.', { n: totalFrames })}
              </span>
            )}
          </div>

          {isTutorMode && frame && (
            <div className="macro-tutor-card" data-testid="macro-tutor-card">
              <div className="macro-tutor-header">
                <span className="macro-tutor-badge">💡 {t('스마트 튜터 해설')}</span>
                <span className="macro-tutor-key-label">
                  {frame.key ? (
                    <>
                      <code>{formatMacroKey(frame.key)}</code> : {explainMacroKeyAction(frame.key, prevFrame?.state, frameState)}
                    </>
                  ) : (
                    t('실행 전 초기 상태')
                  )}
                </span>
              </div>
              {frame.changed && prevFrameState && (
                <div className="macro-tutor-diff" data-testid="macro-tutor-diff">
                  <div className="macro-tutor-diff-line diff-del">
                    <span className="diff-marker">−</span>
                    <code>{prevLine}</code>
                  </div>
                  <div className="macro-tutor-diff-line diff-add">
                    <span className="diff-marker">+</span>
                    <code>{cursorLine}</code>
                  </div>
                </div>
              )}
              {frame.failed && (
                <div className="macro-tutor-failure" data-testid="macro-tutor-failure">
                  <span className="macro-tutor-failure-icon">🚨</span>
                  <span className="macro-tutor-failure-text">
                    {getMacroFailureReason(frame, prevFrame)}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
};
