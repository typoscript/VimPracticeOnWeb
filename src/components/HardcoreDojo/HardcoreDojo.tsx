import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DojoDrillType,
  DojoProblem,
  RelativeJumpProblem,
  FTSniperProblem,
  WordJumpProblem,
  ProMasterProblem,
  DojoLeaderboardEntry,
} from './HardcoreDojo.types';
import {
  DOJO_DRILL_METAS,
  generateRelativeJumpProblem,
  generateFTSniperProblem,
  generateWordJumpProblem,
  generateSuddenDeathProblem,
  generateProMasterProblem,
} from './drillGenerators';
import { HardcoreGuard } from '../../utils/hardcoreGuard';
import { handleKey } from '../../vim-engine';
import { VimEditorState, VimMode } from '../../vim-engine';
import {
  loadDojoHighScores,
  saveDojoHighScore,
  DojoHighScore,
  loadDojoLeaderboard,
  saveDojoLeaderboardEntry,
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
  const [gameState, setGameState] = useState<
    'ready' | 'running' | 'finished' | 'sudden-death-failed' | 'sudden-death-cleared'
  >('ready');
  const [timeLeft, setTimeLeft] = useState<number>(30.0);
  const [score, setScore] = useState<number>(0);
  const [targetsHit, setTargetsHit] = useState<number>(0);
  const [keystrokes, setKeystrokes] = useState<number>(0);
  const [problemKeystrokes, setProblemKeystrokes] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [suddenDeathFailReason, setSuddenDeathFailReason] = useState<string | null>(null);
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [leaderboard, setLeaderboard] = useState<DojoLeaderboardEntry[]>(() =>
    loadDojoLeaderboard()
  );
  const [playerName] = useState<string>('VimRunner');

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
  const createProblemForDrill = useCallback(
    (drillType: DojoDrillType, targetCombo = 0): DojoProblem => {
      switch (drillType) {
        case 'relative-jump':
          return generateRelativeJumpProblem();
        case 'ft-sniper':
          return generateFTSniperProblem();
        case 'word-jump':
          return generateWordJumpProblem();
        case 'sudden-death':
          return generateSuddenDeathProblem(targetCombo);
        case 'pro-master':
          return generateProMasterProblem(targetCombo);
      }
    },
    []
  );

  // 새 문제 로드 및 에디터 상태 초기화
  const loadProblem = useCallback((problem: DojoProblem) => {
    setCurrentProblem(problem);
    setProblemKeystrokes(0);

    if (problem.type === 'relative-jump' || problem.type === 'pro-master') {
      setEditorState({
        lines: [...problem.lines],
        cursor: { ...problem.initialCursor },
        mode: 'NORMAL',
      });
    } else {
      setEditorState({
        lines: [problem.line],
        cursor: { ...problem.initialCursor },
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
      setCombo(0);
      setFinalTime(null);
      setSuddenDeathFailReason(null);
      const prob = createProblemForDrill(drillType, 0);
      loadProblem(prob);
    },
    [gameState, createProblemForDrill, loadProblem]
  );

  // 게임 시작
  const startGame = useCallback(() => {
    setScore(0);
    setTargetsHit(0);
    setKeystrokes(0);
    setCombo(0);
    setFinalTime(null);
    setMyRank(null);
    setSuddenDeathFailReason(null);
    setIsNewRecord(false);
    setWarningMessage(null);
    hardcoreGuardRef.current.reset();

    if (selectedDrill === 'sudden-death' || selectedDrill === 'pro-master') {
      setTimeLeft(0.0);
    } else {
      setTimeLeft(30.0);
    }

    const prob = createProblemForDrill(selectedDrill, 0);
    loadProblem(prob);

    setGameState('running');
    startTimeRef.current = Date.now();
    arenaRef.current?.focus();
  }, [selectedDrill, createProblemForDrill, loadProblem]);

  // 카운트다운 또는 스피드런 타이머
  useEffect(() => {
    if (gameState !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - (startTimeRef.current ?? now)) / 1000;

      if (selectedDrill === 'sudden-death' || selectedDrill === 'pro-master') {
        setTimeLeft(elapsed);
      } else {
        const remaining = Math.max(0, 30.0 - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          setGameState('finished');
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, selectedDrill]);

  // 게임 종료 시 고득점 계산 및 저장 (일반 드릴)
  useEffect(() => {
    if (gameState === 'finished' && selectedDrill !== 'sudden-death') {
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

  // 타깃 피격 효과음 & 애니메이션 (일반 모드)
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

  // 서든데스 타깃 격파 핸들러
  const handleSuddenDeathHit = useCallback(
    (currentCombo: number) => {
      const nextCombo = currentCombo + 1;
      playSuccessSound?.();
      setScore((s) => s + 150);
      setTargetsHit((h) => h + 1);
      setIsTargetHit(true);

      setTimeout(() => {
        setIsTargetHit(false);
      }, 300);

      if (nextCombo >= 10) {
        const now = Date.now();
        const elapsed = (now - (startTimeRef.current ?? now)) / 1000;
        const finalSec = Number(elapsed.toFixed(2));
        setFinalTime(finalSec);
        setCombo(10);

        let tierName = '👑 GODSPEED';
        if (selectedDrill === 'pro-master') {
          if (finalSec > 35.0) tierName = '📜 PRO-DEV';
          else if (finalSec > 22.0) tierName = '💼 TECH-LEAD';
          else if (finalSec > 14.0) tierName = '⚔️ SENIOR ARCHITECT';
          else tierName = '👑 GRANDMASTER';
        } else {
          if (finalSec > 28.0) tierName = '📜 DISCIPLE';
          else if (finalSec > 18.0) tierName = '🥈 DOJO-MASTER';
          else if (finalSec > 12.0) tierName = '🥇 ONE-STRIKE';
        }

        const saveRes = saveDojoLeaderboardEntry({
          playerName: playerName.trim() || 'VimRunner',
          clearTime: finalSec,
          tier: tierName,
          combo: 10,
        });
        setLeaderboard(saveRes.leaderboard);
        setMyRank(saveRes.rank);
        setGameState('sudden-death-cleared');
      } else {
        setCombo(nextCombo);
        const nextProblem = createProblemForDrill(selectedDrill, nextCombo);
        loadProblem(nextProblem);
      }
    },
    [playSuccessSound, playerName, createProblemForDrill, loadProblem]
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
      if (selectedDrill === 'sudden-death' || selectedDrill === 'pro-master') {
        setGameState('sudden-death-failed');
        setSuddenDeathFailReason(check.message || t('마우스 클릭 사용으로 탈락!'));
        setIsShaking(true);
        setTimeout(() => {
          if (isMountedRef.current) setIsShaking(false);
        }, 400);
        return;
      }
      triggerHardcoreWarning(check.message!, check.suggestion);
    }
  }, [gameState, selectedDrill, triggerHardcoreWarning]);

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
        if (selectedDrill === 'sudden-death' || selectedDrill === 'pro-master') {
          setGameState('sudden-death-failed');
          setSuddenDeathFailReason(check.message || t('방향키 또는 비정상 입력으로 탈락!'));
          setIsShaking(true);
          setTimeout(() => {
            if (isMountedRef.current) setIsShaking(false);
          }, 400);
          return;
        }
        triggerHardcoreWarning(check.message!, check.suggestion);
        return;
      }

      const nextProbKeys = problemKeystrokes + 1;
      const isSpeedrun = selectedDrill === 'sudden-death' || selectedDrill === 'pro-master';
      const maxAllowed = selectedDrill === 'pro-master' ? 25 : 12;
      if (isSpeedrun && nextProbKeys > maxAllowed) {
        setGameState('sudden-death-failed');
        setSuddenDeathFailReason(t('타수 초과: 한 번의 모션으로 정확히 격파하지 못했습니다.'));
        setIsShaking(true);
        setTimeout(() => {
          if (isMountedRef.current) setIsShaking(false);
        }, 400);
        return;
      }

      // 키 사운드 재생
      playKeySound?.(e.key, editorState.mode);

      setKeystrokes((k) => k + 1);
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
          if (selectedDrill === 'sudden-death') {
            handleSuddenDeathHit(combo);
          } else {
            const bonus = nextProbKeys <= 5 ? 50 : 0;
            triggerTargetHit(100 + bonus);
          }
        }
      } else if (currentProblem.type === 'ft-sniper') {
        if (
          nextState.cursor.line === 0 &&
          nextState.cursor.col === currentProblem.targetCol
        ) {
          // 목표 문자 위치에 착지함!
          if (selectedDrill === 'sudden-death') {
            handleSuddenDeathHit(combo);
          } else {
            const bonus = nextProbKeys <= 3 ? 50 : 0;
            triggerTargetHit(100 + bonus);
          }
        }
      } else if (currentProblem.type === 'word-jump') {
        if (
          nextState.cursor.line === 0 &&
          nextState.cursor.col >= currentProblem.targetStartCol &&
          nextState.cursor.col <= currentProblem.targetEndCol
        ) {
          // 목표 단어 범위에 착지함!
          if (selectedDrill === 'sudden-death') {
            handleSuddenDeathHit(combo);
          } else {
            const bonus = nextProbKeys <= currentProblem.optimalKeyCount + 1 ? 50 : 0;
            triggerTargetHit(100 + bonus);
          }
        }
      } else if (currentProblem.type === 'pro-master') {
        const isMatched =
          nextState.lines.length === currentProblem.targetLines.length &&
          nextState.lines.every((l, i) => l === currentProblem.targetLines[i]);
        if (isMatched && nextState.mode === 'NORMAL') {
          handleSuddenDeathHit(combo);
        }
      }
    },
    [
      gameState,
      currentProblem,
      problemKeystrokes,
      editorState,
      selectedDrill,
      combo,
      playKeySound,
      triggerHardcoreWarning,
      triggerTargetHit,
      handleSuddenDeathHit,
    ]
  );

  // 최초 초기화
  useEffect(() => {
    if (!currentProblem) {
      const prob = createProblemForDrill(selectedDrill, 0);
      loadProblem(prob);
    }
  }, [currentProblem, selectedDrill, createProblemForDrill, loadProblem]);

  // 실시간 SPM / APM 계산
  const elapsedSeconds =
    selectedDrill === 'sudden-death' ? timeLeft : 30.0 - timeLeft;
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
                {t('🏆 {title} 최고: {score}점 ({hits}개)', {
                  title: currentMeta.title,
                  score: activeHighScore.score,
                  hits: activeHighScore.targetsHit,
                })}
              </span>
            )}
          </div>
        </div>
        <div className="dojo-header-actions">
          <button
            type="button"
            className="dojo-leaderboard-toggle-btn"
            onClick={() => setIsLeaderboardOpen(true)}
          >
            {t('🏆 명예의 전당')}
          </button>
          {onBackToCourse && (
            <button type="button" className="dojo-back-btn" onClick={onBackToCourse}>
              {t('← 연습장으로 돌아가기')}
            </button>
          )}
        </div>
      </div>

      {/* 드릴 선택 탭 */}
      <div className="dojo-drill-tabs">
        {(Object.keys(DOJO_DRILL_METAS) as DojoDrillType[]).map((drillId) => {
          const meta = DOJO_DRILL_METAS[drillId];
          const best = highScores[drillId];
          const isSpeedrun = drillId === 'sudden-death' || drillId === 'pro-master';
          return (
            <button
              key={drillId}
              type="button"
              className={`dojo-drill-tab ${selectedDrill === drillId ? 'active' : ''} ${
                isSpeedrun ? 'sudden-death' : ''
              }`}
              onClick={() => handleSelectDrill(drillId)}
            >
              <div className="dojo-tab-badge">{meta.badge}</div>
              <div className="dojo-tab-title">{meta.title}</div>
              <div className="dojo-tab-desc">{meta.description}</div>
              {!isSpeedrun && best && (
                <div style={{ fontSize: '0.72rem', color: '#ff9e64', marginTop: '0.35rem' }}>
                  {t('👑 최고: {score}점 ({hits}개)', { score: best.score, hits: best.targetsHit })}
                </div>
              )}
              {isSpeedrun && (
                <div style={{ fontSize: '0.72rem', color: drillId === 'pro-master' ? '#bb9af7' : '#f7768e', marginTop: '0.35rem', fontWeight: 700 }}>
                  {drillId === 'pro-master' ? t('👑 실무 프로 10연타') : t('⚡ 10연타 노미스 서든데스')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 대시보드 게이지 & 메트릭 */}
      <div className="dojo-dashboard">
        {selectedDrill === 'sudden-death' || selectedDrill === 'pro-master' ? (
          /* 10연타 콤보 프로그레스 바 */
          <div className="dojo-progress-track sudden-death">
            <div
              className="dojo-progress-fill sudden-death"
              style={{ width: `${(combo / 10) * 100}%` }}
            />
          </div>
        ) : (
          /* 일반 드릴 30초 게이지 바 */
          <div className="dojo-progress-track">
            <div
              className={`dojo-progress-fill ${timeLeft <= 5 ? 'danger' : ''}`}
              style={{ width: `${(timeLeft / 30.0) * 100}%` }}
            />
          </div>
        )}

        <div className="dojo-metrics-grid">
          {selectedDrill === 'sudden-death' || selectedDrill === 'pro-master' ? (
            <>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⏱️ 경과 시간')}</div>
                <div className="dojo-metric-value highlight">{timeLeft.toFixed(1)}s</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('🔥 연속 콤보')}</div>
                <div className="dojo-metric-value highlight">{combo} / 10</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('🎯 점수')}</div>
                <div className="dojo-metric-value">{t('{n}점', { n: score })}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⚡ SPM (목표/분)')}</div>
                <div className="dojo-metric-value">{currentSpm}</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⌨️ APM (타수/분)')}</div>
                <div className="dojo-metric-value">{currentApm}</div>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* 아레나 에디터 박스 */}
      <div
        ref={arenaRef}
        tabIndex={0}
        className={`dojo-arena-wrapper ${isShaking ? 'shake' : ''} ${
          isTargetHit ? 'hit' : ''
        } ${selectedDrill === 'sudden-death' ? 'sudden-death-arena' : ''}`}
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
          {selectedDrill === 'sudden-death' ? (
            <div className="dojo-rule-badge sudden-death">
              {t('💀 서든데스: 1회 실수·방향키·연타 즉시 탈락 | 10연타 스피드런')}
            </div>
          ) : (
            <div className="dojo-rule-badge">{t('🔥 방향키·마우스 차단 | 1.5초 3회 초과 연타 무시')}</div>
          )}
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
          {currentProblem?.type === 'pro-master' && (
            <div style={{ color: '#bb9af7', fontWeight: 600 }}>
              {t('🎯 목표:')} {(currentProblem as ProMasterProblem).prompt} | {t('힌트:')} {(currentProblem as ProMasterProblem).hint}
            </div>
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
            {selectedDrill === 'pro-master' ? (
              <>
                <div style={{ color: '#bb9af7', fontSize: '0.9rem', marginBottom: '1.25rem', fontWeight: 700 }}>
                  {t('👑 실무 핵심 텍스트 객체와 연산자 10문제를 최단 타수로 돌파하세요!')}
                </div>
                <button type="button" className="dojo-start-btn" style={{ background: '#bb9af7', color: '#1a1b26' }} onClick={startGame}>
                  {t('👑 프로 마스터 도전 시작 (10연타)')}
                </button>
              </>
            ) : selectedDrill === 'sudden-death' ? (
              <>
                <div style={{ color: '#f7768e', fontSize: '0.9rem', marginBottom: '1.25rem', fontWeight: 700 }}>
                  {t('⚡ 단 1회의 실수도 허용되지 않는 서든데스! 10연속 노미스로 목표를 완주하세요!')}
                </div>
                <button type="button" className="dojo-start-btn sudden-death" onClick={startGame}>
                  {t('⚡ 서든데스 도전 시작 (10연타)')}
                </button>
              </>
            ) : (
              <>
                <div style={{ color: '#bb9af7', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  {t('⚡ 30초 동안 방향키 없이 최단 경로로 과녁을 격파하세요!')}
                </div>
                <button type="button" className="dojo-start-btn" onClick={startGame}>
                  {t('🥋 수련 시작 (30초)')}
                </button>
              </>
            )}
          </div>
        )}

        {/* 일반 드릴 종료 결과 오버레이 */}
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

        {/* 서든데스 탈락 오버레이 */}
        {gameState === 'sudden-death-failed' && (
          <div className="dojo-overlay failed">
            <div className="dojo-tier-badge">💀</div>
            <div className="dojo-tier-title bronze" style={{ color: '#f7768e' }}>
              {t('서든데스 탈락!')}
            </div>
            <div className="dojo-failure-reason">
              {t('탈락 사유:')} <strong>{suddenDeathFailReason || t('오입력 감지')}</strong>
            </div>

            <div className="dojo-stats-summary">
              <div className="dojo-stat-item">
                <div className="num" style={{ color: '#ff9e64' }}>
                  {combo} / 10
                </div>
                <div className="label">{t('달성 콤보')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{timeLeft.toFixed(2)}s</div>
                <div className="label">{t('생존 시간')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{keystrokes}</div>
                <div className="label">{t('총 타수')}</div>
              </div>
            </div>

            <div className="dojo-btn-row">
              <button type="button" className="dojo-start-btn" onClick={startGame}>
                {t('🔄 다시 도전하기')}
              </button>
              <button
                type="button"
                className="dojo-leaderboard-btn"
                onClick={() => setIsLeaderboardOpen(true)}
              >
                {t('🏆 랭킹 보드 보기')}
              </button>
            </div>
          </div>
        )}

        {/* 서든데스 완주 클리어 오버레이 */}
        {gameState === 'sudden-death-cleared' && (
          <div className="dojo-overlay cleared">
            <div className="dojo-tier-badge">👑</div>
            <div className="dojo-tier-title master" style={{ color: '#e0af68' }}>
              {t('🎉 10연타 서든데스 완전 정복!')}
            </div>
            <div style={{ color: '#9ece6a', fontSize: '1rem', marginBottom: '1rem', fontWeight: 700 }}>
              {t('🏆 명예의 전당 {rank}위 등극!', { rank: myRank ?? 1 })}
            </div>

            <div className="dojo-stats-summary">
              <div className="dojo-stat-item">
                <div className="num" style={{ color: '#9ece6a' }}>
                  {finalTime?.toFixed(2)}s
                </div>
                <div className="label">{t('완주 시간')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num" style={{ color: '#ff9e64' }}>
                  10 / 10
                </div>
                <div className="label">{t('달성 콤보')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">
                  {Math.round((10 / Math.max(1, finalTime ?? 1)) * 60)}
                </div>
                <div className="label">{t('SPM (목표/분)')}</div>
              </div>
              <div className="dojo-stat-item">
                <div className="num">{keystrokes}</div>
                <div className="label">{t('총 타수')}</div>
              </div>
            </div>

            <div className="dojo-btn-row">
              <button type="button" className="dojo-start-btn" onClick={startGame}>
                {t('🔄 다시 도전하기')}
              </button>
              <button
                type="button"
                className="dojo-leaderboard-btn"
                onClick={() => setIsLeaderboardOpen(true)}
              >
                {t('🏆 랭킹 보드 보기')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 실시간 랭킹 모달 (Leaderboard) */}
      {isLeaderboardOpen && (
        <div
          className="dojo-modal-backdrop"
          onClick={() => setIsLeaderboardOpen(false)}
        >
          <div
            className="dojo-leaderboard-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Dojo Leaderboard"
          >
            <div className="dojo-modal-header">
              <h3>{t('🏆 하드코어 도장 서든데스 명예의 전당')}</h3>
              <button
                type="button"
                className="dojo-modal-close-btn"
                onClick={() => setIsLeaderboardOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="dojo-modal-subtitle">
              {t('노미스 10연타를 가장 빠른 속도로 주파한 전설의 Vim 전사들')}
            </p>

            <div className="dojo-table-container">
              <table className="dojo-leaderboard-table">
                <thead>
                  <tr>
                    <th>{t('순위')}</th>
                    <th>{t('플레이어')}</th>
                    <th>{t('클리어 시간')}</th>
                    <th>{t('칭호')}</th>
                    <th>{t('일시')}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => {
                    const isTop1 = index === 0;
                    const isTop2 = index === 1;
                    const isTop3 = index === 2;
                    return (
                      <tr
                        key={entry.id}
                        className={
                          isTop1
                            ? 'rank-gold'
                            : isTop2
                            ? 'rank-silver'
                            : isTop3
                            ? 'rank-bronze'
                            : ''
                        }
                      >
                        <td className="rank-col">
                          {isTop1
                            ? '🥇 1'
                            : isTop2
                            ? '🥈 2'
                            : isTop3
                            ? '🥉 3'
                            : `${index + 1}`}
                        </td>
                        <td className="player-col">{entry.playerName}</td>
                        <td className="time-col">{entry.clearTime.toFixed(2)}s</td>
                        <td className="tier-col">{entry.tier}</td>
                        <td className="date-col">
                          {new Date(entry.completedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="dojo-modal-footer">
              <button
                type="button"
                className="dojo-modal-btn"
                onClick={() => setIsLeaderboardOpen(false)}
              >
                {t('닫기')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
