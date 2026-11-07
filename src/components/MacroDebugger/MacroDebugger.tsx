import React, { useEffect, useMemo, useState } from 'react';
import { VimEditorState } from '../../types/vim';
import {
  MacroTrace,
  MACRO_PLAYBACK_SPEEDS,
  buildMacroTrace,
  clampFrameIndex,
  getMacroKeys,
  listMacroRegisters,
} from '../../engine/macroDebugger';
import './MacroDebugger.css';

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

  const register = macroRegisters.includes(selectedRegister) ? selectedRegister : macroRegisters[0] ?? '';

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
    if (!register) return null;
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
    if (!register) return;
    handleReset();
    onPreviewFrame(null);
    onRunMacro(register, count);
  };

  const keys = trace ? trace.keys : getMacroKeys(baseState, register);
  const frame = trace ? trace.frames[frameIndex] : null;
  const totalFrames = trace ? trace.frames.length - 1 : keys.length * count;
  const frameState = frame?.state;
  const cursorLine = frameState ? frameState.lines[frameState.cursor.line] ?? '' : '';
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
          <span className="macro-debugger-subtitle">매크로 슬로우모션 단계별 실행</span>
        </div>
        <button
          className="macro-debugger-close-btn"
          onClick={onToggle}
          title="매크로 디버거 닫기"
          data-testid="close-macro-debugger-btn"
        >
          ✕
        </button>
      </div>

      {macroRegisters.length === 0 ? (
        <div className="macro-debugger-empty" data-testid="macro-debugger-empty">
          녹화된 매크로가 없습니다. <code>qa</code> … <code>q</code> 로 매크로를 먼저 녹화하세요.
        </div>
      ) : (
        <>
          <div className="macro-debugger-controls">
            <div className="macro-control">
              <span>레지스터</span>
              <div className="macro-register-group" role="radiogroup" aria-label="매크로 레지스터">
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
              <span>반복</span>
              <button
                type="button"
                className="macro-count-btn"
                onClick={() => changeCount(-1)}
                data-testid="macro-count-dec"
                aria-label="반복 횟수 감소"
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
                aria-label="반복 횟수 증가"
              >
                +
              </button>
            </div>
            <div className="macro-speed-group" role="radiogroup" aria-label="재생 속도">
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
            <button type="button" onClick={handleReset} title="처음으로" data-testid="macro-reset-btn">
              ⏮
            </button>
            <button type="button" onClick={() => handleStep(-1)} title="이전 키" data-testid="macro-prev-btn">
              ◀
            </button>
            <button
              type="button"
              className="macro-play-btn"
              onClick={handlePlayPause}
              title={isPlaying ? '일시정지' : '슬로우모션 재생'}
              data-testid="macro-play-btn"
            >
              {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
            </button>
            <button type="button" onClick={() => handleStep(1)} title="다음 키" data-testid="macro-next-btn">
              ▶
            </button>
            <button
              type="button"
              className="macro-run-btn"
              onClick={handleRun}
              title={`에디터에 ${count > 1 ? count : ''}@${register} 실제 실행`}
              data-testid="macro-run-btn"
            >
              ⚡ {count > 1 ? count : ''}@{register} 실행
            </button>
          </div>

          <div className="macro-key-strip" data-testid="macro-key-strip">
            {Array.from({ length: trace ? trace.count : 1 }).map((_, it) => (
              <div className="macro-iteration" key={it}>
                {trace && trace.count > 1 && <span className="macro-iteration-label">#{it + 1}</span>}
                {keys.map((k, ki) => {
                  const isCurrent = !!frame && frame.iteration === it && frame.keyIndex === ki;
                  const isDone =
                    !!frame && (frame.iteration > it || (frame.iteration === it && frame.keyIndex > ki));
                  return (
                    <span
                      key={ki}
                      className={`macro-key-chip ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                      data-testid={isCurrent ? 'macro-current-key' : undefined}
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
                  프레임 {frameIndex} / {totalFrames}
                </span>
                <span className={`macro-mode-badge mode-${frameState.mode.toLowerCase()}`}>{frameState.mode}</span>
                <span className="macro-cursor-pos">
                  {frameState.cursor.line + 1}:{frameState.cursor.col + 1}
                </span>
                {frame.changed && <span className="macro-changed-badge">✎ 버퍼 변경</span>}
                <code className="macro-line-preview" data-testid="macro-line-preview">
                  {cursorLine.slice(0, cursorCol)}
                  <span className="macro-cursor-char">{cursorLine[cursorCol] ?? ' '}</span>
                  {cursorLine.slice(cursorCol + 1)}
                </code>
              </>
            ) : (
              <span className="macro-frame-hint">
                총 {totalFrames}개 키 · ▶ 재생 또는 ▶ 다음 키로 한 프레임씩 확인하세요. 미리보기 중 에디터는 변경되지
                않습니다.
              </span>
            )}
          </div>
        </>
      )}
    </aside>
  );
};
