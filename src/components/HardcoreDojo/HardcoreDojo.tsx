import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DojoDrillType,
  DojoProblem,
  RelativeJumpProblem,
  FTSniperProblem,
  WordJumpProblem,
} from './HardcoreDojo.types';
import {
  DOJO_DRILL_METAS,
  generateRelativeJumpProblem,
  generateFTSniperProblem,
  generateWordJumpProblem,
} from './drillGenerators';
import { HardcoreGuard } from '../../utils/hardcoreGuard';
import { handleKey } from '../../vim-engine';
import { VimEditorState, VimMode } from '../../vim-engine';
import {
  loadDojoHighScores,
  saveDojoHighScore,
  DojoHighScore,
} from '../../utils/storage';
import './HardcoreDojo.css';
import { t } from '../../i18n';

export interface HardcoreDojoProps {
  onBackToCourse?: () => void;
  playKeySound?: (key: string, mode: VimMode) => void;
  playSuccessSound?: () => void;
}

export function HardcoreDojo({
  onBackToCourse,
  playKeySound,
  playSuccessSound,
}: HardcoreDojoProps) {
  const [selectedDrill, setSelectedDrill] = useState<DojoDrillType>('relative-jump');
  const [gameState, setGameState] = useState<'ready' | 'running' | 'finished'>('ready');
  const [timeLeft, setTimeLeft] = useState<number>(30.0);
  const [score, setScore] = useState<number>(0);
  const [targetsHit, setTargetsHit] = useState<number>(0);
  const [keystrokes, setKeystrokes] = useState<number>(0);
  const [problemKeystrokes, setProblemKeystrokes] = useState<number>(0);

  const [currentProblem, setCurrentProblem] = useState<DojoProblem | null>(null);
  const [editorState, setEditorState] = useState<VimEditorState>({
    lines: [''],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
  });

  const [highScores, setHighScores] = useState<Record<string, DojoHighScore>>(() =>
    loadDojoHighScores()
  );
  const [isNewRecord, setIsNewRecord] = useState(false);

  // 시각 효과 상태
  const [isShaking, setIsShaking] = useState(false);
  const [isTargetHit, setIsTargetHit] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hardcoreGuardRef = useRef(new HardcoreGuard());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);

  // 문제 생성 헬퍼
  const createProblemForDrill = useCallback((drillType: DojoDrillType): DojoProblem => {
    switch (drillType) {
      case 'relative-jump':
        return generateRelativeJumpProblem();
      case 'ft-sniper':
        return generateFTSniperProblem();
      case 'word-jump':
        return generateWordJumpProblem();
    }
  }, []);

  // 새 문제 로드 및 에디터 상태 초기화
  const loadProblem = useCallback((problem: DojoProblem) => {
    setCurrentProblem(problem);
    setProblemKeystrokes(0);

    if (problem.type === 'relative-jump') {
      setEditorState({
        lines: problem.lines,
        cursor: problem.initialCursor,
        mode: 'NORMAL',
      });
    } else {
      setEditorState({
        lines: [problem.line],
        cursor: problem.initialCursor,
        mode: 'NORMAL',
      });
    }
  }, []);

  // 드릴 변경 시 준비 상태로 전환
  const handleSelectDrill = useCallback(
    (drillType: DojoDrillType) => {
      if (gameState === 'running') return;
      setSelectedDrill(drillType);
      setGameState('ready');
      const prob = createProblemForDrill(drillType);
      loadProblem(prob);
    },
    [gameState, createProblemForDrill, loadProblem]
  );

  // 게임 시작
  const startGame = useCallback(() => {
    setScore(0);
    setTargetsHit(0);
    setKeystrokes(0);
    setTimeLeft(30.0);
    setIsNewRecord(false);
    setWarningMessage(null);
    hardcoreGuardRef.current.reset();

    const prob = createProblemForDrill(selectedDrill);
    loadProblem(prob);

    setGameState('running');
    startTimeRef.current = Date.now();
    arenaRef.current?.focus();
  }, [selectedDrill, createProblemForDrill, loadProblem]);

  // 카운트다운 타이머
  useEffect(() => {
    if (gameState !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - (startTimeRef.current ?? now)) / 1000;
      const remaining = Math.max(0, 30.0 - elapsed);

      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        setGameState('finished');
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  // 게임 종료 시 고득점 계산 및 저장
  useEffect(() => {
    if (gameState === 'finished') {
      const finalSpm = Math.round((targetsHit / 30) * 60);
      const finalApm = Math.round((keystrokes / 30) * 60);

      const res = saveDojoHighScore(selectedDrill, {
        score,
        targetsHit,
        spm: finalSpm,
        apm: finalApm,
      });

      setIsNewRecord(res.isNewRecord);
      setHighScores(loadDojoHighScores());
    }
  }, [gameState, selectedDrill, score, targetsHit, keystrokes]);

  // 타깃 피격 효과음 & 애니메이션
  const triggerTargetHit = useCallback(
    (addedScore: number) => {
      playSuccessSound?.();
      setScore((s) => s + addedScore);
      setTargetsHit((h) => h + 1);
      setIsTargetHit(true);

      setTimeout(() => {
        setIsTargetHit(false);
      }, 300);

      // 다음 문제 로드
      const nextProblem = createProblemForDrill(selectedDrill);
      loadProblem(nextProblem);
    },
    [playSuccessSound, createProblemForDrill, selectedDrill, loadProblem]
  );

  // 하드코어 경고 & 셰이크 발동
  const triggerHardcoreWarning = useCallback((message: string, suggestion?: string) => {
    setIsShaking(true);
    setWarningMessage(`${message}${suggestion ? ` 👉 ${suggestion}` : ''}`);

    setTimeout(() => {
      if (isMountedRef.current) {
        setIsShaking(false);
      }
    }, 400);

    setTimeout(() => {
      if (isMountedRef.current) {
        setWarningMessage(null);
      }
    }, 1800);
  }, []);

  // 에디터 마우스 클릭 방지
  const handleEditorClick = useCallback(() => {
    if (gameState !== 'running') return;
    const check = hardcoreGuardRef.current.checkMouseClick();
    if (check.blocked) {
      triggerHardcoreWarning(check.message!, check.suggestion);
    }
  }, [gameState, triggerHardcoreWarning]);

  // 키 입력 핸들러
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (gameState !== 'running' || !currentProblem) return;

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      // 브라우저 기본 동작 차단
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Tab'].includes(
          e.key
        )
      ) {
        e.preventDefault();
      }

      // 하드코어 가드 체크 (방향키, 1.5초 3회 초과 spam 차단)
      const check = hardcoreGuardRef.current.checkKey(e.key, Date.now());
      if (check.blocked) {
        triggerHardcoreWarning(check.message!, check.suggestion);
        return;
      }

      // 키 사운드 재생
      playKeySound?.(e.key, editorState.mode);

      setKeystrokes((k) => k + 1);
      const nextProbKeys = problemKeystrokes + 1;
      setProblemKeystrokes(nextProbKeys);

      // Vim 엔진 실행
      const nextState = handleKey(editorState, e.key);
      setEditorState(nextState);

      // 각 드릴별 성공 조건 판정
      if (currentProblem.type === 'relative-jump') {
        const targetPresent = nextState.lines.some((l) =>
          l.includes(currentProblem.targetText)
        );
        if (!targetPresent) {
          // 목표 라인이 dd 등으로 성공적으로 삭제됨!
          const bonus = nextProbKeys <= 5 ? 50 : 0;
          triggerTargetHit(100 + bonus);
        }
      } else if (currentProblem.type === 'ft-sniper') {
        if (
          nextState.cursor.line === 0 &&
          nextState.cursor.col === currentProblem.targetCol
        ) {
          // 목표 문자 위치에 착지함!
          const bonus = nextProbKeys <= 3 ? 50 : 0;
          triggerTargetHit(100 + bonus);
        }
      } else if (currentProblem.type === 'word-jump') {
        if (
          nextState.cursor.line === 0 &&
          nextState.cursor.col >= currentProblem.targetStartCol &&
          nextState.cursor.col <= currentProblem.targetEndCol
        ) {
          // 목표 단어 범위에 착지함!
          const bonus = nextProbKeys <= currentProblem.optimalKeyCount + 1 ? 50 : 0;
          triggerTargetHit(100 + bonus);
        }
      }
    },
    [
      gameState,
      currentProblem,
      problemKeystrokes,
      editorState,
      playKeySound,
      triggerHardcoreWarning,
      triggerTargetHit,
    ]
  );

  // 최초 초기화
  useEffect(() => {
    if (!currentProblem) {
      const prob = createProblemForDrill(selectedDrill);
      loadProblem(prob);
    }
  }, [currentProblem, selectedDrill, createProblemForDrill, loadProblem]);

  // 실시간 SPM / APM 계산
  const elapsedSeconds = 30.0 - timeLeft;
  const currentSpm =
    elapsedSeconds > 0 ? Math.round((targetsHit / Math.max(1, elapsedSeconds)) * 60) : 0;
  const currentApm =
    elapsedSeconds > 0 ? Math.round((keystrokes / Math.max(1, elapsedSeconds)) * 60) : 0;

  // 도장 수료 등급 산출
  const getTier = () => {
    if (score >= 1000 || targetsHit >= 10) {
      return { title: '👑 MASTER', className: 'master', desc: t('신들린 Vim 마스터의 손놀림!') };
    }
    if (score >= 600 || targetsHit >= 6) {
      return { title: '🥇 GOLD', className: 'gold', desc: t('상위 5% 실무 고수 레벨!') };
    }
    if (score >= 300 || targetsHit >= 3) {
      return { title: '🥈 SILVER', className: 'silver', desc: t('좋은 감각입니다. 조금 더 연습해 보세요.') };
    }
    return { title: '🥉 BRONZE', className: 'bronze', desc: t('hjkl 연타 대신 카운트와 점프를 의식해 보세요!') };
  };

  const currentMeta = DOJO_DRILL_METAS[selectedDrill];
  const activeHighScore = highScores[selectedDrill];

  return (
    <div className="hardcore-dojo-container">
      {/* 상단 네비게이션 & 헤더 */}
      <div className="dojo-header">
        <div className="dojo-title-group">
          <h2>{t('🥋 하드코어 도장 (Vim Reflex Drills)')}</h2>
          <div className="dojo-subtitle">
            {t('나쁜 습관(방향키/연타)을 교정하고 30초 동안 순수 모션 근육 기억을 단련합니다.')}
            {activeHighScore && (
              <span style={{ marginLeft: '0.75rem', color: '#ff9e64', fontWeight: 600 }}>
                {t('🏆 {title} 최고: {score}점 ({hits}개)', { title: currentMeta.title, score: activeHighScore.score, hits: activeHighScore.targetsHit })}
              </span>
            )}
          </div>
        </div>
        {onBackToCourse && (
          <button type="button" className="dojo-back-btn" onClick={onBackToCourse}>
            {t('← 연습장으로 돌아가기')}
          </button>
        )}
      </div>

      {/* 드릴 선택 탭 */}
      <div className="dojo-drill-tabs">
        {(Object.keys(DOJO_DRILL_METAS) as DojoDrillType[]).map((drillId) => {
          const meta = DOJO_DRILL_METAS[drillId];
          const best = highScores[drillId];
          return (
            <button
              key={drillId}
              type="button"
              className={`dojo-drill-tab ${selectedDrill === drillId ? 'active' : ''}`}
              onClick={() => handleSelectDrill(drillId)}
            >
              <div className="dojo-tab-badge">{meta.badge}</div>
              <div className="dojo-tab-title">{meta.title}</div>
              <div className="dojo-tab-desc">{meta.description}</div>
              {best && (
                <div style={{ fontSize: '0.72rem', color: '#ff9e64', marginTop: '0.35rem' }}>
                  {t('👑 최고: {score}점 ({hits}개)', { score: best.score, hits: best.targetsHit })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 대시보드 게이지 & 메트릭 */}
      <div className="dojo-dashboard">
        {/* 30초 게이지 바 */}
        <div className="dojo-progress-track">
          <div
            className={`dojo-progress-fill ${timeLeft <= 5 ? 'danger' : ''}`}
            style={{ width: `${(timeLeft / 30.0) * 100}%` }}
          />
        </div>

        <div className="dojo-metrics-grid">
          <div className="dojo-metric-card">
            <div className="dojo-metric-label">{t('⏱️ 남은 시간')}</div>
            <div className={`dojo-metric-value ${timeLeft <= 5 ? 'highlight' : ''}`}>
              {timeLeft.toFixed(1)}s
            </div>
          </div>
          <div className="dojo-metric-card">
            <div className="dojo-metric-label">{t('🎯 점수')}</div>
            <div className="dojo-metric-value highlight">{t('{n}점', { n: score })}</div>
          </div>
          <div className="dojo-metric-card">
            <div className="dojo-metric-label">{t('👾 처치 과녁')}</div>
            <div className="dojo-metric-value">{t('{n}개', { n: targetsHit })}</div>
          </div>
          <div className="dojo-metric-card">
            <div className="dojo-metric-label">{t('⚡ SPM (목표/분)')}</div>
            <div className="dojo-metric-value">{currentSpm}</div>
          </div>
          <div className="dojo-metric-card">
            <div className="dojo-metric-label">{t('⌨️ APM (타수/분)')}</div>
            <div className="dojo-metric-value">{currentApm}</div>
          </div>
        </div>
      </div>

      {/* 아레나 에디터 박스 */}
      <div
        ref={arenaRef}
        tabIndex={0}
        className={`dojo-arena-wrapper ${isShaking ? 'shake' : ''} ${
          isTargetHit ? 'hit' : ''
        }`}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        aria-label="Dojo Editor Arena"
      >
        {/* 경고 툴팁 토스트 */}
        {warningMessage && <div className="dojo-warning-toast">{warningMessage}</div>}

        {/* 상단 툴바 */}
        <div className="dojo-arena-toolbar">
          <div>
            {t('모드:')} <strong>{editorState.mode}</strong> | {t('대기 키:')}{' '}
            <code>{editorState.pendingKeys || t('(없음)')}</code>
          </div>
          <div className="dojo-rule-badge">{t('🔥 방향키·마우스 차단 | 1.5초 3회 초과 연타 무시')}</div>
        </div>

        {/* 안내 지침 바 */}
        <div className="dojo-instruction-bar">
          <div>💡 {currentMeta.keyInstructions}</div>
          {currentProblem?.type === 'ft-sniper' && (
            <div style={{ color: '#7aa2f7' }}>{t("🎯 타깃: '{char}'", { char: currentProblem.targetChar })}</div>
          )}
          {currentProblem?.type === 'word-jump' && (
            <div style={{ color: '#7aa2f7' }}>{t("🎯 타깃: '{char}'", { char: currentProblem.targetToken })}</div>
          )}
        </div>

        {/* 코드 편집 영역 */}
        <div className="dojo-editor-content">
          {editorState.lines.map((lineText, lineIdx) => {
            const isCursorLine = editorState.cursor.line === lineIdx;
            const isRelativeJump = currentProblem?.type === 'relative-jump';
            const isTargetLine =
              isRelativeJump &&
              lineIdx === (currentProblem as RelativeJumpProblem).targetLine;

            // 상대 라인 번호 계산
            const dist = Math.abs(lineIdx - editorState.cursor.line);
            const lineNumDisplay = dist === 0 ? lineIdx + 1 : dist;

            return (
              <div
                key={lineIdx}
                className={`dojo-line-row ${isCursorLine ? 'active-line' : ''} ${
                  isTargetLine ? 'target-line' : ''
                }`}
              >
                {/* 라인 거터 (상대 라인 번호) */}
                <div className="dojo-line-gutter">
                  <span className={dist > 0 ? 'dojo-relative-number' : ''}>
                    {lineNumDisplay}
                  </span>
                </div>

                {/* 코드 텍스트 및 커서/타깃 렌더링 */}
                <div className="dojo-code-text">
                  {lineText.length === 0 ? (
                    isCursorLine && editorState.cursor.col === 0 ? (
                      <span className="dojo-char dojo-cursor">&nbsp;</span>
                    ) : (
                      <span>&nbsp;</span>
                    )
                  ) : (
                    lineText.split('').map((ch, charIdx) => {
                      const isCursor =
                        isCursorLine && editorState.cursor.col === charIdx;

                      // FT-Sniper 타깃 표시
                      const isFTSniperTarget =
                        currentProblem?.type === 'ft-sniper' &&
                        lineIdx === 0 &&
                        charIdx === (currentProblem as FTSniperProblem).targetCol;

                      // Word-Jump 타깃 표시
                      const isWordTarget =
                        currentProblem?.type === 'word-jump' &&
                        lineIdx === 0 &&
                        charIdx >= (currentProblem as WordJumpProblem).targetStartCol &&
                        charIdx <= (currentProblem as WordJumpProblem).targetEndCol;

                      let classNames = 'dojo-char';
                      if (isCursor) classNames += ' dojo-cursor';
                      if (isFTSniperTarget || isWordTarget) {
                        classNames += ' dojo-target-reticle';
                      }

                      return (
                        <span key={charIdx} className={classNames}>
                          {ch}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 시작 전 오버레이 */}
        {gameState === 'ready' && (
          <div className="dojo-overlay">
            <h3>{currentMeta.title}</h3>
            <p>{currentMeta.description}</p>
            <div style={{ color: '#bb9af7', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              {t('⚡ 30초 동안 방향키 없이 최단 경로로 과녁을 격파하세요!')}
            </div>
            <button type="button" className="dojo-start-btn" onClick={startGame}>
              {t('🥋 수련 시작 (30초)')}
            </button>
          </div>
        )}

        {/* 종료 결과 오버레이 */}
        {gameState === 'finished' && (
          <div className="dojo-overlay">
            <div className="dojo-tier-badge">{getTier().title.split(' ')[0]}</div>
            <div className={`dojo-tier-title ${getTier().className}`}>
              {getTier().title}
            </div>
            <div style={{ color: '#9aa5ce', fontSize: '0.9rem', marginBottom: '1rem' }}>
              {getTier().desc}
            </div>

            {isNewRecord && <div className="dojo-new-record-tag">{t('🎉 신기록 달성!')}</div>}

            <div className="dojo-stats-summary">
              <div className="dojo-stat-item">
                <div className="num">{score}</div>
                <div className="label">{t('최종 점수')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{t('{n}개', { n: targetsHit })}</div>
                <div className="label">{t('처치 과녁')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{Math.round((targetsHit / 30) * 60)}</div>
                <div className="label">{t('SPM (목표/분)')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{Math.round((keystrokes / 30) * 60)}</div>
                <div className="label">{t('APM (타수/분)')}</div>
              </div>
            </div>

            <div className="dojo-btn-row">
              <button type="button" className="dojo-start-btn" onClick={startGame}>
                {t('🔄 다시 수련하기')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
