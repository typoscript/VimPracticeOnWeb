import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DojoDrillType,
  DojoProblem,
  DojoLeaderboardEntry,
} from './HardcoreDojo.types';
import { DojoArenaContent } from './DojoArenaContent';
import { DojoOverlays, DojoGamePhase } from './DojoOverlays';
import { DojoLeaderboardModal } from './DojoLeaderboardModal';
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
  LessonProgress,
} from '../../utils/storage';
import { loadUserAnalytics } from '../../utils/analyticsStorage';
import {
  buildWeaknessDrillPlan,
  WeaknessDrillPlan,
} from '../../utils/weaknessDrillAnalyzer';
import './HardcoreDojo.css';
import { t } from '../../i18n';

export interface HardcoreDojoProps {
  onBackToCourse?: () => void;
  playKeySound?: (key: string, mode: VimMode) => void;
  playSuccessSound?: () => void;
  initialDrill?: { drill: DojoDrillType; nonce: number } | null;
  analyticsProgress?: LessonProgress;
}

export function HardcoreDojo({
  onBackToCourse,
  playKeySound,
  playSuccessSound,
  initialDrill,
  analyticsProgress,
}: HardcoreDojoProps) {
  const [selectedDrill, setSelectedDrill] = useState<DojoDrillType>(
    initialDrill?.drill ?? 'relative-jump'
  );
  const [gameState, setGameState] = useState<DojoGamePhase>('ready');
  const [weaknessPlan, setWeaknessPlan] = useState<WeaknessDrillPlan>(() =>
    buildWeaknessDrillPlan(loadUserAnalytics(), analyticsProgress ?? {})
  );
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
    (drillType: DojoDrillType, targetCombo = 0, planOverride?: WeaknessDrillPlan): DojoProblem => {
      const activePlan = planOverride ?? weaknessPlan;
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
        case 'weakness-custom': {
          const idx = Math.max(0, targetCombo % activePlan.queue.length);
          return activePlan.queue[idx].problem;
        }
      }
    },
    [weaknessPlan]
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

  // 통계 기반 약점 플랜 재분석
  const refreshWeaknessPlan = useCallback((): WeaknessDrillPlan => {
    const freshPlan = buildWeaknessDrillPlan(loadUserAnalytics(), analyticsProgress ?? {});
    setWeaknessPlan(freshPlan);
    return freshPlan;
  }, [analyticsProgress]);

  // 드릴 변경 시 준비 상태로 전환
  const handleSelectDrill = useCallback(
    (drillType: DojoDrillType) => {
      if (gameState === 'running') return;
      setSelectedDrill(drillType);
      setGameState('ready');
      setCombo(0);
      setFinalTime(null);
      setSuddenDeathFailReason(null);
      const activePlan = drillType === 'weakness-custom' ? refreshWeaknessPlan() : weaknessPlan;
      const prob = createProblemForDrill(drillType, 0, activePlan);
      loadProblem(prob);
    },
    [gameState, createProblemForDrill, loadProblem, refreshWeaknessPlan, weaknessPlan]
  );

  // AnalyticsModal 등에서 특정 드릴로 진입 시 자동 선택/재분석
  const lastInitialNonceRef = useRef<number | undefined>(initialDrill?.nonce);
  useEffect(() => {
    if (!initialDrill) return;
    if (lastInitialNonceRef.current === initialDrill.nonce && selectedDrill === initialDrill.drill) {
      return;
    }
    lastInitialNonceRef.current = initialDrill.nonce;
    setSelectedDrill(initialDrill.drill);
    setGameState('ready');
    setCombo(0);
    setScore(0);
    setTargetsHit(0);
    setKeystrokes(0);
    setFinalTime(null);
    setSuddenDeathFailReason(null);
    const activePlan =
      initialDrill.drill === 'weakness-custom' ? refreshWeaknessPlan() : weaknessPlan;
    loadProblem(createProblemForDrill(initialDrill.drill, 0, activePlan));
  }, [initialDrill, selectedDrill, refreshWeaknessPlan, weaknessPlan, createProblemForDrill, loadProblem]);

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

    const activePlan = selectedDrill === 'weakness-custom' ? refreshWeaknessPlan() : weaknessPlan;

    if (
      selectedDrill === 'sudden-death' ||
      selectedDrill === 'pro-master' ||
      selectedDrill === 'weakness-custom'
    ) {
      setTimeLeft(0.0);
    } else {
      setTimeLeft(30.0);
    }

    const prob = createProblemForDrill(selectedDrill, 0, activePlan);
    loadProblem(prob);

    setGameState('running');
    startTimeRef.current = Date.now();
    arenaRef.current?.focus();
  }, [selectedDrill, createProblemForDrill, loadProblem, refreshWeaknessPlan, weaknessPlan]);

  // 카운트다운 또는 스피드런 타이머
  useEffect(() => {
    if (gameState !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - (startTimeRef.current ?? now)) / 1000;

      if (
        selectedDrill === 'sudden-death' ||
        selectedDrill === 'pro-master' ||
        selectedDrill === 'weakness-custom'
      ) {
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
    if (
      gameState === 'finished' &&
      selectedDrill !== 'sudden-death' &&
      selectedDrill !== 'pro-master' &&
      selectedDrill !== 'weakness-custom'
    ) {
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

  // 약점 집중 맞춤 드릴 타깃 해결 핸들러 (10문제 완주형)
  const handleWeaknessHit = useCallback(
    (currentCombo: number, currentScore: number, totalKeys: number) => {
      const nextCombo = currentCombo + 1;
      const nextScore = currentScore + 120;
      playSuccessSound?.();
      setScore(nextScore);
      setTargetsHit((h) => h + 1);
      setIsTargetHit(true);

      setTimeout(() => {
        if (isMountedRef.current) setIsTargetHit(false);
      }, 300);

      const totalProblems = weaknessPlan.queue.length || 10;
      if (nextCombo >= totalProblems) {
        const now = Date.now();
        const elapsed = (now - (startTimeRef.current ?? now)) / 1000;
        const finalSec = Number(Math.max(0.1, elapsed).toFixed(2));
        setFinalTime(finalSec);
        setCombo(totalProblems);
        const res = saveDojoHighScore('weakness-custom', {
          score: nextScore,
          targetsHit: totalProblems,
          spm: Math.round((totalProblems / Math.max(1, finalSec)) * 60),
          apm: Math.round((totalKeys / Math.max(1, finalSec)) * 60),
        });
        setIsNewRecord(res.isNewRecord);
        setHighScores(loadDojoHighScores());
        setGameState('weakness-cleared');
      } else {
        setCombo(nextCombo);
        const nextProblem = createProblemForDrill('weakness-custom', nextCombo);
        loadProblem(nextProblem);
      }
    },
    [playSuccessSound, weaknessPlan, createProblemForDrill, loadProblem]
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
          if (selectedDrill === 'weakness-custom') {
            handleWeaknessHit(combo, score, keystrokes + 1);
          } else if (selectedDrill === 'sudden-death') {
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
          if (selectedDrill === 'weakness-custom') {
            handleWeaknessHit(combo, score, keystrokes + 1);
          } else if (selectedDrill === 'sudden-death') {
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
          if (selectedDrill === 'weakness-custom') {
            handleWeaknessHit(combo, score, keystrokes + 1);
          } else if (selectedDrill === 'sudden-death') {
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
          if (selectedDrill === 'weakness-custom') {
            handleWeaknessHit(combo, score, keystrokes + 1);
          } else {
            handleSuddenDeathHit(combo);
          }
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
      score,
      keystrokes,
      playKeySound,
      triggerHardcoreWarning,
      triggerTargetHit,
      handleSuddenDeathHit,
      handleWeaknessHit,
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
  const isTenStageMode =
    selectedDrill === 'sudden-death' ||
    selectedDrill === 'pro-master' ||
    selectedDrill === 'weakness-custom';
  const elapsedSeconds = isTenStageMode ? timeLeft : 30.0 - timeLeft;
  const activeWeaknessItem =
    selectedDrill === 'weakness-custom'
      ? weaknessPlan.queue[Math.min(combo, weaknessPlan.queue.length - 1)]
      : null;
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
              {!isSpeedrun && drillId !== 'weakness-custom' && best && (
                <div style={{ fontSize: '0.72rem', color: '#ff9e64', marginTop: '0.35rem' }}>
                  {t('👑 최고: {score}점 ({hits}개)', { score: best.score, hits: best.targetsHit })}
                </div>
              )}
              {drillId === 'weakness-custom' && (
                <div style={{ fontSize: '0.72rem', color: '#7dcfff', marginTop: '0.35rem', fontWeight: 700 }}>
                  {t('🧬 내 약점 집중 10문제')}
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
        {isTenStageMode ? (
          /* 10문제 진행도 프로그레스 바 */
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
          {isTenStageMode ? (
            <>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">{t('⏱️ 경과 시간')}</div>
                <div className="dojo-metric-value highlight">{timeLeft.toFixed(1)}s</div>
              </div>
              <div className="dojo-metric-card">
                <div className="dojo-metric-label">
                  {selectedDrill === 'weakness-custom' ? t('진행 문제') : t('🔥 연속 콤보')}
                </div>
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

        <DojoArenaContent
          selectedDrill={selectedDrill}
          editorState={editorState}
          currentProblem={currentProblem}
          activeWeaknessItem={activeWeaknessItem}
          keyInstructions={currentMeta.keyInstructions}
        />

        <DojoOverlays
          gameState={gameState}
          selectedDrill={selectedDrill}
          metaTitle={currentMeta.title}
          metaDescription={currentMeta.description}
          weaknessPlan={weaknessPlan}
          onRefreshWeaknessPlan={() => {
            const fresh = refreshWeaknessPlan();
            loadProblem(createProblemForDrill('weakness-custom', 0, fresh));
          }}
          onStartGame={startGame}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          tierInfo={getTier()}
          isNewRecord={isNewRecord}
          score={score}
          targetsHit={targetsHit}
          keystrokes={keystrokes}
          combo={combo}
          timeLeft={timeLeft}
          finalTime={finalTime}
          myRank={myRank}
          suddenDeathFailReason={suddenDeathFailReason}
        />
      </div>

      <DojoLeaderboardModal
        isOpen={isLeaderboardOpen}
        leaderboard={leaderboard}
        onClose={() => setIsLeaderboardOpen(false)}
      />
    </div>
  );
}
