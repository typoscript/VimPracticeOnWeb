import React, { useReducer, useEffect, useRef, useCallback } from 'react';
import {
  DojoDrillType,
  DojoProblem,
  DojoLeaderboardEntry,
} from './HardcoreDojo.types';
import { DojoGamePhase } from './DojoOverlays';
import {
  DOJO_DRILL_METAS,
  generateRelativeJumpProblem,
  generateFTSniperProblem,
  generateWordJumpProblem,
  generateSuddenDeathProblem,
  generateProMasterProblem,
} from './drillGenerators';
import { HardcoreGuard } from '../../utils/hardcoreGuard';
import { handleKey, VimEditorState, VimMode } from '../../vim-engine';
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
import { t } from '../../i18n';

export interface UseHardcoreDojoOptions {
  playKeySound?: (key: string, mode: VimMode) => void;
  playSuccessSound?: () => void;
  initialDrill?: { drill: DojoDrillType; nonce: number } | null;
  analyticsProgress?: LessonProgress;
}

interface DojoState {
  selectedDrill: DojoDrillType;
  gameState: DojoGamePhase;
  weaknessPlan: WeaknessDrillPlan;
  timeLeft: number;
  score: number;
  targetsHit: number;
  keystrokes: number;
  problemKeystrokes: number;
  combo: number;
  suddenDeathFailReason: string | null;
  finalTime: number | null;
  myRank: number | null;
  isLeaderboardOpen: boolean;
  leaderboard: DojoLeaderboardEntry[];
  playerName: string;
  currentProblem: DojoProblem | null;
  editorState: VimEditorState;
  highScores: Record<string, DojoHighScore>;
  isNewRecord: boolean;
  isShaking: boolean;
  isTargetHit: boolean;
  warningMessage: string | null;
}

type DojoAction =
  | { type: 'SET_WEAKNESS_PLAN'; plan: WeaknessDrillPlan }
  | { type: 'LOAD_PROBLEM'; problem: DojoProblem }
  | {
      type: 'SELECT_DRILL';
      drill: DojoDrillType;
      plan?: WeaknessDrillPlan;
      problem: DojoProblem;
      resetStats?: boolean;
    }
  | { type: 'START_GAME'; plan?: WeaknessDrillPlan; problem: DojoProblem; initialTime: number }
  | { type: 'TICK_TIME'; timeLeft: number; finished?: boolean }
  | { type: 'RECORD_STANDARD_FINISH'; isNewRecord: boolean; highScores: Record<string, DojoHighScore> }
  | { type: 'APPLY_KEY'; nextEditorState: VimEditorState; nextProblemKeystrokes: number }
  | { type: 'STANDARD_HIT'; addedScore: number; nextProblem: DojoProblem }
  | { type: 'SUDDEN_DEATH_STEP'; nextCombo: number; nextProblem: DojoProblem }
  | {
      type: 'SUDDEN_DEATH_CLEARED';
      finalTime: number;
      leaderboard: DojoLeaderboardEntry[];
      myRank: number | null;
    }
  | { type: 'WEAKNESS_STEP'; nextCombo: number; nextScore: number; nextProblem: DojoProblem }
  | {
      type: 'WEAKNESS_CLEARED';
      totalProblems: number;
      nextScore: number;
      finalTime: number;
      isNewRecord: boolean;
      highScores: Record<string, DojoHighScore>;
    }
  | { type: 'SUDDEN_DEATH_FAILED'; reason: string }
  | { type: 'SHOW_WARNING'; message: string }
  | { type: 'CLEAR_SHAKE' }
  | { type: 'CLEAR_WARNING' }
  | { type: 'CLEAR_TARGET_HIT' }
  | { type: 'SET_LEADERBOARD_OPEN'; open: boolean };

function isTenStageDrill(drill: DojoDrillType): boolean {
  return drill === 'sudden-death' || drill === 'pro-master' || drill === 'weakness-custom';
}

function createProblemForDrillWithPlan(
  drillType: DojoDrillType,
  targetCombo: number,
  plan: WeaknessDrillPlan
): DojoProblem {
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
      const idx = Math.max(0, targetCombo % plan.queue.length);
      return plan.queue[idx].problem;
    }
  }
}

function buildEditorStateForProblem(problem: DojoProblem): VimEditorState {
  if (problem.type === 'relative-jump' || problem.type === 'pro-master') {
    return {
      lines: [...problem.lines],
      cursor: { ...problem.initialCursor },
      mode: 'NORMAL',
    };
  }
  return {
    lines: [problem.line],
    cursor: { ...problem.initialCursor },
    mode: 'NORMAL',
  };
}

function resolveSpeedrunTier(drill: DojoDrillType, finalSec: number): string {
  if (drill === 'pro-master') {
    if (finalSec > 35.0) return '📜 PRO-DEV';
    if (finalSec > 22.0) return '💼 TECH-LEAD';
    if (finalSec > 14.0) return '⚔️ SENIOR ARCHITECT';
    return '👑 GRANDMASTER';
  }
  if (finalSec > 28.0) return '📜 DISCIPLE';
  if (finalSec > 18.0) return '🥈 DOJO-MASTER';
  if (finalSec > 12.0) return '🥇 ONE-STRIKE';
  return '👑 GODSPEED';
}

function evaluateProblemSuccess(
  problem: DojoProblem,
  nextState: VimEditorState,
  nextProbKeys: number
): { hit: boolean; standardBonus: number } {
  if (problem.type === 'relative-jump') {
    const targetPresent = nextState.lines.some((l) => l.includes(problem.targetText));
    return { hit: !targetPresent, standardBonus: nextProbKeys <= 5 ? 50 : 0 };
  }
  if (problem.type === 'ft-sniper') {
    const landed = nextState.cursor.line === 0 && nextState.cursor.col === problem.targetCol;
    return { hit: landed, standardBonus: nextProbKeys <= 3 ? 50 : 0 };
  }
  if (problem.type === 'word-jump') {
    const landed =
      nextState.cursor.line === 0 &&
      nextState.cursor.col >= problem.targetStartCol &&
      nextState.cursor.col <= problem.targetEndCol;
    return { hit: landed, standardBonus: nextProbKeys <= problem.optimalKeyCount + 1 ? 50 : 0 };
  }
  const isMatched =
    nextState.mode === 'NORMAL' &&
    nextState.lines.length === problem.targetLines.length &&
    nextState.lines.every((l, i) => l === problem.targetLines[i]);
  return { hit: isMatched, standardBonus: 0 };
}

function createInitialDojoState(
  initialDrill: DojoDrillType,
  analyticsProgress?: LessonProgress
): DojoState {
  const weaknessPlan = buildWeaknessDrillPlan(loadUserAnalytics(), analyticsProgress ?? {});
  const initialProblem = createProblemForDrillWithPlan(initialDrill, 0, weaknessPlan);
  return {
    selectedDrill: initialDrill,
    gameState: 'ready',
    weaknessPlan,
    timeLeft: 30.0,
    score: 0,
    targetsHit: 0,
    keystrokes: 0,
    problemKeystrokes: 0,
    combo: 0,
    suddenDeathFailReason: null,
    finalTime: null,
    myRank: null,
    isLeaderboardOpen: false,
    leaderboard: loadDojoLeaderboard(),
    playerName: 'VimRunner',
    currentProblem: initialProblem,
    editorState: buildEditorStateForProblem(initialProblem),
    highScores: loadDojoHighScores(),
    isNewRecord: false,
    isShaking: false,
    isTargetHit: false,
    warningMessage: null,
  };
}

function dojoReducer(state: DojoState, action: DojoAction): DojoState {
  switch (action.type) {
    case 'SET_WEAKNESS_PLAN':
      return { ...state, weaknessPlan: action.plan };

    case 'LOAD_PROBLEM':
      return {
        ...state,
        currentProblem: action.problem,
        problemKeystrokes: 0,
        editorState: buildEditorStateForProblem(action.problem),
      };

    case 'SELECT_DRILL':
      return {
        ...state,
        selectedDrill: action.drill,
        gameState: 'ready',
        weaknessPlan: action.plan ?? state.weaknessPlan,
        combo: 0,
        score: action.resetStats ? 0 : state.score,
        targetsHit: action.resetStats ? 0 : state.targetsHit,
        keystrokes: action.resetStats ? 0 : state.keystrokes,
        finalTime: null,
        suddenDeathFailReason: null,
        currentProblem: action.problem,
        problemKeystrokes: 0,
        editorState: buildEditorStateForProblem(action.problem),
      };

    case 'START_GAME':
      return {
        ...state,
        gameState: 'running',
        weaknessPlan: action.plan ?? state.weaknessPlan,
        timeLeft: action.initialTime,
        score: 0,
        targetsHit: 0,
        keystrokes: 0,
        problemKeystrokes: 0,
        combo: 0,
        finalTime: null,
        myRank: null,
        suddenDeathFailReason: null,
        isNewRecord: false,
        warningMessage: null,
        currentProblem: action.problem,
        editorState: buildEditorStateForProblem(action.problem),
      };

    case 'TICK_TIME':
      return {
        ...state,
        timeLeft: action.timeLeft,
        gameState: action.finished ? 'finished' : state.gameState,
      };

    case 'RECORD_STANDARD_FINISH':
      return {
        ...state,
        isNewRecord: action.isNewRecord,
        highScores: action.highScores,
      };

    case 'APPLY_KEY':
      return {
        ...state,
        keystrokes: state.keystrokes + 1,
        problemKeystrokes: action.nextProblemKeystrokes,
        editorState: action.nextEditorState,
      };

    case 'STANDARD_HIT':
      return {
        ...state,
        score: state.score + action.addedScore,
        targetsHit: state.targetsHit + 1,
        isTargetHit: true,
        currentProblem: action.nextProblem,
        problemKeystrokes: 0,
        editorState: buildEditorStateForProblem(action.nextProblem),
      };

    case 'SUDDEN_DEATH_STEP':
      return {
        ...state,
        score: state.score + 150,
        targetsHit: state.targetsHit + 1,
        isTargetHit: true,
        combo: action.nextCombo,
        currentProblem: action.nextProblem,
        problemKeystrokes: 0,
        editorState: buildEditorStateForProblem(action.nextProblem),
      };

    case 'SUDDEN_DEATH_CLEARED':
      return {
        ...state,
        score: state.score + 150,
        targetsHit: state.targetsHit + 1,
        isTargetHit: true,
        combo: 10,
        finalTime: action.finalTime,
        leaderboard: action.leaderboard,
        myRank: action.myRank,
        gameState: 'sudden-death-cleared',
      };

    case 'WEAKNESS_STEP':
      return {
        ...state,
        score: action.nextScore,
        targetsHit: state.targetsHit + 1,
        isTargetHit: true,
        combo: action.nextCombo,
        currentProblem: action.nextProblem,
        problemKeystrokes: 0,
        editorState: buildEditorStateForProblem(action.nextProblem),
      };

    case 'WEAKNESS_CLEARED':
      return {
        ...state,
        score: action.nextScore,
        targetsHit: state.targetsHit + 1,
        isTargetHit: true,
        combo: action.totalProblems,
        finalTime: action.finalTime,
        isNewRecord: action.isNewRecord,
        highScores: action.highScores,
        gameState: 'weakness-cleared',
      };

    case 'SUDDEN_DEATH_FAILED':
      return {
        ...state,
        gameState: 'sudden-death-failed',
        suddenDeathFailReason: action.reason,
        isShaking: true,
      };

    case 'SHOW_WARNING':
      return {
        ...state,
        isShaking: true,
        warningMessage: action.message,
      };

    case 'CLEAR_SHAKE':
      return { ...state, isShaking: false };

    case 'CLEAR_WARNING':
      return { ...state, warningMessage: null };

    case 'CLEAR_TARGET_HIT':
      return { ...state, isTargetHit: false };

    case 'SET_LEADERBOARD_OPEN':
      return { ...state, isLeaderboardOpen: action.open };

    default:
      return state;
  }
}

export function useHardcoreDojo({
  playKeySound,
  playSuccessSound,
  initialDrill,
  analyticsProgress,
}: UseHardcoreDojoOptions) {
  const [state, dispatch] = useReducer(
    dojoReducer,
    undefined,
    () => createInitialDojoState(initialDrill?.drill ?? 'relative-jump', analyticsProgress)
  );

  const isMountedRef = useRef(true);
  const activeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeTimersRef.current.forEach((timer) => clearTimeout(timer));
      activeTimersRef.current = [];
    };
  }, []);

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      if (isMountedRef.current) fn();
    }, ms);
    activeTimersRef.current.push(timer);
  }, []);

  const hardcoreGuardRef = useRef(new HardcoreGuard());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const arenaRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);

  const buildFreshWeaknessPlan = useCallback(
    () => buildWeaknessDrillPlan(loadUserAnalytics(), analyticsProgress ?? {}),
    [analyticsProgress]
  );

  const handleSelectDrill = useCallback(
    (drillType: DojoDrillType) => {
      if (state.gameState === 'running') return;
      const activePlan =
        drillType === 'weakness-custom' ? buildFreshWeaknessPlan() : state.weaknessPlan;
      const problem = createProblemForDrillWithPlan(drillType, 0, activePlan);
      dispatch({
        type: 'SELECT_DRILL',
        drill: drillType,
        plan: drillType === 'weakness-custom' ? activePlan : undefined,
        problem,
      });
    },
    [state.gameState, state.weaknessPlan, buildFreshWeaknessPlan]
  );

  // AnalyticsModal 등에서 특정 드릴로 진입 시 자동 선택/재분석
  const lastInitialNonceRef = useRef<number | undefined>(initialDrill?.nonce);
  useEffect(() => {
    if (!initialDrill) return;
    if (
      lastInitialNonceRef.current === initialDrill.nonce &&
      state.selectedDrill === initialDrill.drill
    ) {
      return;
    }
    lastInitialNonceRef.current = initialDrill.nonce;
    const activePlan =
      initialDrill.drill === 'weakness-custom' ? buildFreshWeaknessPlan() : state.weaknessPlan;
    const problem = createProblemForDrillWithPlan(initialDrill.drill, 0, activePlan);
    dispatch({
      type: 'SELECT_DRILL',
      drill: initialDrill.drill,
      plan: initialDrill.drill === 'weakness-custom' ? activePlan : undefined,
      problem,
      resetStats: true,
    });
  }, [initialDrill, state.selectedDrill, state.weaknessPlan, buildFreshWeaknessPlan]);

  const startGame = useCallback(() => {
    hardcoreGuardRef.current.reset();
    const activePlan =
      state.selectedDrill === 'weakness-custom' ? buildFreshWeaknessPlan() : state.weaknessPlan;
    const problem = createProblemForDrillWithPlan(state.selectedDrill, 0, activePlan);
    const initialTime = isTenStageDrill(state.selectedDrill) ? 0.0 : 30.0;

    dispatch({
      type: 'START_GAME',
      plan: state.selectedDrill === 'weakness-custom' ? activePlan : undefined,
      problem,
      initialTime,
    });
    startTimeRef.current = Date.now();
    arenaRef.current?.focus();
  }, [state.selectedDrill, state.weaknessPlan, buildFreshWeaknessPlan]);

  // 카운트다운 또는 스피드런 타이머
  useEffect(() => {
    if (state.gameState !== 'running') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - (startTimeRef.current ?? now)) / 1000;

      if (isTenStageDrill(state.selectedDrill)) {
        dispatch({ type: 'TICK_TIME', timeLeft: elapsed });
      } else {
        const remaining = Math.max(0, 30.0 - elapsed);
        if (remaining <= 0 && timerRef.current) {
          clearInterval(timerRef.current);
        }
        dispatch({ type: 'TICK_TIME', timeLeft: remaining, finished: remaining <= 0 });
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.gameState, state.selectedDrill]);

  // 게임 종료 시 고득점 계산 및 저장 (일반 드릴)
  useEffect(() => {
    if (state.gameState === 'finished' && !isTenStageDrill(state.selectedDrill)) {
      const finalSpm = Math.round((state.targetsHit / 30) * 60);
      const finalApm = Math.round((state.keystrokes / 30) * 60);
      const res = saveDojoHighScore(state.selectedDrill, {
        score: state.score,
        targetsHit: state.targetsHit,
        spm: finalSpm,
        apm: finalApm,
      });
      dispatch({
        type: 'RECORD_STANDARD_FINISH',
        isNewRecord: res.isNewRecord,
        highScores: loadDojoHighScores(),
      });
    }
  }, [state.gameState, state.selectedDrill, state.score, state.targetsHit, state.keystrokes]);

  const failSuddenDeath = useCallback(
    (reason: string) => {
      dispatch({ type: 'SUDDEN_DEATH_FAILED', reason });
      scheduleTimer(() => dispatch({ type: 'CLEAR_SHAKE' }), 400);
    },
    [scheduleTimer]
  );

  const triggerHardcoreWarning = useCallback(
    (message: string, suggestion?: string) => {
      dispatch({
        type: 'SHOW_WARNING',
        message: `${message}${suggestion ? ` 👉 ${suggestion}` : ''}`,
      });
      scheduleTimer(() => dispatch({ type: 'CLEAR_SHAKE' }), 400);
      scheduleTimer(() => dispatch({ type: 'CLEAR_WARNING' }), 1800);
    },
    [scheduleTimer]
  );

  const handleSuddenDeathHit = useCallback(() => {
    const nextCombo = state.combo + 1;
    playSuccessSound?.();
    scheduleTimer(() => dispatch({ type: 'CLEAR_TARGET_HIT' }), 300);

    if (nextCombo >= 10) {
      const now = Date.now();
      const elapsed = (now - (startTimeRef.current ?? now)) / 1000;
      const finalSec = Number(elapsed.toFixed(2));
      const tierName = resolveSpeedrunTier(state.selectedDrill, finalSec);
      const saveRes = saveDojoLeaderboardEntry({
        playerName: state.playerName.trim() || 'VimRunner',
        clearTime: finalSec,
        tier: tierName,
        combo: 10,
      });
      dispatch({
        type: 'SUDDEN_DEATH_CLEARED',
        finalTime: finalSec,
        leaderboard: saveRes.leaderboard,
        myRank: saveRes.rank,
      });
    } else {
      const nextProblem = createProblemForDrillWithPlan(
        state.selectedDrill,
        nextCombo,
        state.weaknessPlan
      );
      dispatch({ type: 'SUDDEN_DEATH_STEP', nextCombo, nextProblem });
    }
  }, [state.combo, state.selectedDrill, state.playerName, state.weaknessPlan, playSuccessSound, scheduleTimer]);

  const handleWeaknessHit = useCallback(
    (totalKeys: number) => {
      const nextCombo = state.combo + 1;
      const nextScore = state.score + 120;
      playSuccessSound?.();
      scheduleTimer(() => dispatch({ type: 'CLEAR_TARGET_HIT' }), 300);

      const totalProblems = state.weaknessPlan.queue.length || 10;
      if (nextCombo >= totalProblems) {
        const now = Date.now();
        const elapsed = (now - (startTimeRef.current ?? now)) / 1000;
        const finalSec = Number(Math.max(0.1, elapsed).toFixed(2));
        const res = saveDojoHighScore('weakness-custom', {
          score: nextScore,
          targetsHit: totalProblems,
          spm: Math.round((totalProblems / Math.max(1, finalSec)) * 60),
          apm: Math.round((totalKeys / Math.max(1, finalSec)) * 60),
        });
        dispatch({
          type: 'WEAKNESS_CLEARED',
          totalProblems,
          nextScore,
          finalTime: finalSec,
          isNewRecord: res.isNewRecord,
          highScores: loadDojoHighScores(),
        });
      } else {
        const nextProblem = createProblemForDrillWithPlan(
          'weakness-custom',
          nextCombo,
          state.weaknessPlan
        );
        dispatch({ type: 'WEAKNESS_STEP', nextCombo, nextScore, nextProblem });
      }
    },
    [state.combo, state.score, state.weaknessPlan, playSuccessSound, scheduleTimer]
  );

  const handleEditorClick = useCallback(() => {
    if (state.gameState !== 'running') return;
    const check = hardcoreGuardRef.current.checkMouseClick();
    if (!check.blocked) return;
    if (state.selectedDrill === 'sudden-death' || state.selectedDrill === 'pro-master') {
      failSuddenDeath(check.message || t('마우스 클릭 사용으로 탈락!'));
      return;
    }
    triggerHardcoreWarning(check.message!, check.suggestion);
  }, [state.gameState, state.selectedDrill, failSuddenDeath, triggerHardcoreWarning]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (state.gameState !== 'running' || !state.currentProblem) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Backspace', 'Tab'].includes(
          e.key
        )
      ) {
        e.preventDefault();
      }

      const check = hardcoreGuardRef.current.checkKey(e.key, Date.now());
      if (check.blocked) {
        if (state.selectedDrill === 'sudden-death' || state.selectedDrill === 'pro-master') {
          failSuddenDeath(check.message || t('방향키 또는 비정상 입력으로 탈락!'));
          return;
        }
        triggerHardcoreWarning(check.message!, check.suggestion);
        return;
      }

      const nextProbKeys = state.problemKeystrokes + 1;
      const isSpeedrun =
        state.selectedDrill === 'sudden-death' || state.selectedDrill === 'pro-master';
      const maxAllowed = state.selectedDrill === 'pro-master' ? 25 : 12;
      if (isSpeedrun && nextProbKeys > maxAllowed) {
        failSuddenDeath(t('타수 초과: 한 번의 모션으로 정확히 격파하지 못했습니다.'));
        return;
      }

      playKeySound?.(e.key, state.editorState.mode);
      const nextEditorState = handleKey(state.editorState, e.key);
      dispatch({ type: 'APPLY_KEY', nextEditorState, nextProblemKeystrokes: nextProbKeys });

      const { hit, standardBonus } = evaluateProblemSuccess(
        state.currentProblem,
        nextEditorState,
        nextProbKeys
      );
      if (!hit) return;

      if (state.selectedDrill === 'weakness-custom') {
        handleWeaknessHit(state.keystrokes + 1);
      } else if (state.selectedDrill === 'sudden-death' || state.selectedDrill === 'pro-master') {
        handleSuddenDeathHit();
      } else {
        playSuccessSound?.();
        scheduleTimer(() => dispatch({ type: 'CLEAR_TARGET_HIT' }), 300);
        const nextProblem = createProblemForDrillWithPlan(
          state.selectedDrill,
          0,
          state.weaknessPlan
        );
        dispatch({ type: 'STANDARD_HIT', addedScore: 100 + standardBonus, nextProblem });
      }
    },
    [
      state.gameState,
      state.currentProblem,
      state.problemKeystrokes,
      state.editorState,
      state.selectedDrill,
      state.keystrokes,
      state.weaknessPlan,
      playKeySound,
      playSuccessSound,
      failSuddenDeath,
      triggerHardcoreWarning,
      handleSuddenDeathHit,
      handleWeaknessHit,
      scheduleTimer,
    ]
  );

  const setIsLeaderboardOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_LEADERBOARD_OPEN', open });
  }, []);

  const handleRefreshWeaknessPlan = useCallback(() => {
    const fresh = buildFreshWeaknessPlan();
    dispatch({ type: 'SET_WEAKNESS_PLAN', plan: fresh });
    dispatch({
      type: 'LOAD_PROBLEM',
      problem: createProblemForDrillWithPlan('weakness-custom', 0, fresh),
    });
  }, [buildFreshWeaknessPlan]);

  const isTenStageMode = isTenStageDrill(state.selectedDrill);
  const elapsedSeconds = isTenStageMode ? state.timeLeft : 30.0 - state.timeLeft;
  const activeWeaknessItem =
    state.selectedDrill === 'weakness-custom'
      ? state.weaknessPlan.queue[Math.min(state.combo, state.weaknessPlan.queue.length - 1)]
      : null;
  const currentSpm =
    elapsedSeconds > 0 ? Math.round((state.targetsHit / Math.max(1, elapsedSeconds)) * 60) : 0;
  const currentApm =
    elapsedSeconds > 0 ? Math.round((state.keystrokes / Math.max(1, elapsedSeconds)) * 60) : 0;

  const getTier = () => {
    if (state.score >= 1000 || state.targetsHit >= 10) {
      return { title: '👑 MASTER', className: 'master', desc: t('신들린 Vim 마스터의 손놀림!') };
    }
    if (state.score >= 600 || state.targetsHit >= 6) {
      return { title: '🥇 GOLD', className: 'gold', desc: t('상위 5% 실무 고수 레벨!') };
    }
    if (state.score >= 300 || state.targetsHit >= 3) {
      return { title: '🥈 SILVER', className: 'silver', desc: t('좋은 감각입니다. 조금 더 연습해 보세요.') };
    }
    return { title: '🥉 BRONZE', className: 'bronze', desc: t('hjkl 연타 대신 카운트와 점프를 의식해 보세요!') };
  };

  return {
    selectedDrill: state.selectedDrill,
    gameState: state.gameState,
    weaknessPlan: state.weaknessPlan,
    timeLeft: state.timeLeft,
    score: state.score,
    targetsHit: state.targetsHit,
    keystrokes: state.keystrokes,
    combo: state.combo,
    suddenDeathFailReason: state.suddenDeathFailReason,
    finalTime: state.finalTime,
    myRank: state.myRank,
    isLeaderboardOpen: state.isLeaderboardOpen,
    setIsLeaderboardOpen,
    leaderboard: state.leaderboard,
    currentProblem: state.currentProblem,
    editorState: state.editorState,
    highScores: state.highScores,
    isNewRecord: state.isNewRecord,
    isShaking: state.isShaking,
    isTargetHit: state.isTargetHit,
    warningMessage: state.warningMessage,
    arenaRef,
    handleSelectDrill,
    startGame,
    handleEditorClick,
    handleKeyDown,
    isTenStageMode,
    activeWeaknessItem,
    currentSpm,
    currentApm,
    getTier,
    currentMeta: DOJO_DRILL_METAS[state.selectedDrill],
    activeHighScore: state.highScores[state.selectedDrill],
    handleRefreshWeaknessPlan,
  };
}
