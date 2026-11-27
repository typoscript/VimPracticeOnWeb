import { useReducer, useEffect, useRef, useCallback } from 'react';
import { VimEditorState, VimMode } from '../../vim-engine';
import { safeHandleKey } from '../../utils/safeHandleKey';
import {
  saveArcadeRecord,
  loadUserAnalytics,
  recordKeyInputStats,
} from '../../utils/analyticsStorage';
import { t } from '../../i18n';
import { ARCADE_MISSIONS } from './arcadeMissions';

type UserAnalytics = ReturnType<typeof loadUserAnalytics>;
type ArcadeMission = (typeof ARCADE_MISSIONS)[number];

export interface ArcadePowerUps {
  freeze: number;
  bomb: number;
  shield: number;
}

export interface ArcadeBanners {
  perfect: string | null;
  penalty: string | null;
  skill: string | null;
  bossAlert: string | null;
  bossDefeated: string | null;
}

export type ArcadeBannerKind = keyof ArcadeBanners;

interface ArcadeState {
  gameState: 'ready' | 'playing' | 'gameover';
  wave: number;
  score: number;
  combo: number;
  maxCombo: number;
  timeLeft: number;
  maxTime: number;
  keystrokesInWave: number;
  totalKeystrokes: number;
  powerups: ArcadePowerUps;
  freezeTimeLeft: number;
  banners: ArcadeBanners;
  recentKeys: string[];
  isNewRecord: boolean;
  analytics: UserAnalytics;
  editorState: VimEditorState;
  shieldEmergencyNonce: number;
}

type ArcadeAction =
  | { type: 'START_GAME' }
  | { type: 'TICK' }
  | { type: 'GAME_OVER'; isNewRecord: boolean; analytics: UserAnalytics }
  | { type: 'USE_FREEZE' }
  | { type: 'USE_BOMB' }
  | { type: 'WAVE_CLEARED'; isBomb: boolean }
  | { type: 'APPLY_KEY'; key: string; nextEditorState: VimEditorState; isArrow: boolean }
  | { type: 'CLEAR_BANNER'; kind: ArcadeBannerKind };

const EMPTY_BANNERS: ArcadeBanners = {
  perfect: null,
  penalty: null,
  skill: null,
  bossAlert: null,
  bossDefeated: null,
};

function getMissionForWave(waveNum: number): ArcadeMission {
  return ARCADE_MISSIONS[(waveNum - 1) % ARCADE_MISSIONS.length];
}

function getWaveTimeLimit(waveNum: number, mission: ArcadeMission): number {
  return Math.max(6, mission.timeLimit - Math.floor((waveNum - 1) / 3));
}

function createMissionEditorState(mission: ArcadeMission): VimEditorState {
  return {
    lines: [...mission.initialLines],
    cursor: { ...mission.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };
}

function createInitialArcadeState(): ArcadeState {
  const firstMission = getMissionForWave(1);
  return {
    gameState: 'ready',
    wave: 1,
    score: 0,
    combo: 0,
    maxCombo: 0,
    timeLeft: 15,
    maxTime: 15,
    keystrokesInWave: 0,
    totalKeystrokes: 0,
    powerups: { freeze: 1, bomb: 1, shield: 0 },
    freezeTimeLeft: 0,
    banners: { ...EMPTY_BANNERS },
    recentKeys: [],
    isNewRecord: false,
    analytics: loadUserAnalytics(),
    editorState: createMissionEditorState(firstMission),
    shieldEmergencyNonce: 0,
  };
}

function applyWaveClear(state: ArcadeState, isBomb: boolean): ArcadeState {
  const currentMission = getMissionForWave(state.wave);
  const nextCombo = state.combo + 1;
  const isParBeaten = !isBomb && state.keystrokesInWave + 1 <= currentMission.par;

  let waveBonus = 50;
  let freeze = state.powerups.freeze;
  let bomb = state.powerups.bomb;
  let shield = state.powerups.shield;
  const nextBanners: ArcadeBanners = { ...state.banners };

  if (isBomb) {
    waveBonus = 100;
    bomb = Math.max(0, bomb - 1);
    nextBanners.skill = t('💣 버그 폭탄 폭발! 버그 섬멸!');
  } else if (isParBeaten) {
    waveBonus = 200;
    freeze += 1;
    nextBanners.perfect = t('⭐ PERFECT! +{waveBonus} Bonus! (최소 타수 달성)', { waveBonus });
    nextBanners.skill = t('⏳ PERFECT 달성! 시간 정지 +1 획득!');
  }

  if (nextCombo > 0 && nextCombo % 3 === 0) {
    shield += 1;
    nextBanners.skill = t('🛡️ 콤보 보너스! 쉴드 +1 획득!');
  }

  let bossBonus = 0;
  if (currentMission.isBoss) {
    bossBonus = state.wave % 10 === 0 ? 1000 : 500;
    freeze += 1;
    bomb += 1;
    shield += 1;
    nextBanners.bossDefeated = t(
      '👑 BOSS DEFEATED! 보스 격퇴 보너스 (+{bossBonus}점) & 파워업 충전!',
      { bossBonus }
    );
  }

  const timeBonus = Math.round(state.timeLeft * 10);
  const waveScore = 150 * nextCombo + waveBonus + timeBonus + bossBonus;
  const nextWave = state.wave + 1;
  const nextMission = getMissionForWave(nextWave);
  const nextWaveTime = getWaveTimeLimit(nextWave, nextMission);

  if (nextMission.isBoss) {
    nextBanners.bossAlert = t('🚨 BOSS ALERT: {bossName} 출현!', {
      bossName: nextMission.bossName ?? 'BOSS',
    });
  }

  return {
    ...state,
    wave: nextWave,
    score: state.score + waveScore,
    combo: nextCombo,
    maxCombo: Math.max(state.maxCombo, nextCombo),
    timeLeft: nextWaveTime,
    maxTime: nextWaveTime,
    freezeTimeLeft: 0,
    keystrokesInWave: 0,
    powerups: { freeze, bomb, shield },
    banners: nextBanners,
    editorState: createMissionEditorState(nextMission),
  };
}

function arcadeReducer(state: ArcadeState, action: ArcadeAction): ArcadeState {
  switch (action.type) {
    case 'START_GAME': {
      const mission = getMissionForWave(1);
      const waveTime = getWaveTimeLimit(1, mission);
      return {
        ...state,
        gameState: 'playing',
        wave: 1,
        score: 0,
        combo: 0,
        maxCombo: 0,
        timeLeft: waveTime,
        maxTime: waveTime,
        keystrokesInWave: 0,
        totalKeystrokes: 0,
        powerups: { freeze: 1, bomb: 1, shield: 0 },
        freezeTimeLeft: 0,
        banners: {
          ...EMPTY_BANNERS,
          bossAlert: mission.isBoss
            ? t('🚨 BOSS ALERT: {bossName} 출현!', { bossName: mission.bossName ?? 'BOSS' })
            : null,
        },
        isNewRecord: false,
        editorState: createMissionEditorState(mission),
      };
    }

    case 'TICK': {
      if (state.gameState !== 'playing') return state;
      if (state.freezeTimeLeft > 0) {
        const nextFreeze = Number((state.freezeTimeLeft - 0.1).toFixed(1));
        return { ...state, freezeTimeLeft: nextFreeze <= 0 ? 0 : nextFreeze };
      }
      if (state.timeLeft <= 0.1) {
        if (state.powerups.shield > 0) {
          return {
            ...state,
            timeLeft: 5.0,
            powerups: {
              ...state.powerups,
              shield: Math.max(0, state.powerups.shield - 1),
            },
            banners: {
              ...state.banners,
              skill: t('🛡️ 쉴드 비상 발동! 타임아웃 방어 (+5초)'),
            },
            shieldEmergencyNonce: state.shieldEmergencyNonce + 1,
          };
        }
        return { ...state, timeLeft: 0 };
      }
      return { ...state, timeLeft: Number((state.timeLeft - 0.1).toFixed(1)) };
    }

    case 'GAME_OVER':
      return {
        ...state,
        gameState: 'gameover',
        isNewRecord: action.isNewRecord,
        analytics: action.analytics,
      };

    case 'USE_FREEZE': {
      if (
        state.gameState !== 'playing' ||
        state.powerups.freeze <= 0 ||
        state.freezeTimeLeft > 0
      ) {
        return state;
      }
      return {
        ...state,
        powerups: {
          ...state.powerups,
          freeze: Math.max(0, state.powerups.freeze - 1),
        },
        freezeTimeLeft: 5.0,
        banners: {
          ...state.banners,
          skill: t('⏳ 시간 정지 발동! 5초간 시간이 멈춥니다.'),
        },
      };
    }

    case 'USE_BOMB': {
      if (state.gameState !== 'playing' || state.powerups.bomb <= 0) return state;
      return applyWaveClear(state, true);
    }

    case 'WAVE_CLEARED':
      return applyWaveClear(state, action.isBomb);

    case 'APPLY_KEY': {
      let combo = state.combo;
      let shield = state.powerups.shield;
      let penalty = state.banners.penalty;

      if (action.isArrow) {
        if (shield > 0) {
          shield = Math.max(0, shield - 1);
          penalty = t('🛡️ 쉴드 방어! 방향키 페널티를 막아냈습니다.');
        } else {
          combo = 0;
          penalty = t('⚠️ 방향키 사용으로 콤보가 리셋되었습니다! (hjkl을 사용하세요)');
        }
      }

      return {
        ...state,
        combo,
        powerups: { ...state.powerups, shield },
        banners: { ...state.banners, penalty },
        keystrokesInWave: state.keystrokesInWave + 1,
        totalKeystrokes: state.totalKeystrokes + 1,
        recentKeys: [...state.recentKeys.slice(-6), action.key],
        editorState: action.nextEditorState,
      };
    }

    case 'CLEAR_BANNER':
      return {
        ...state,
        banners: { ...state.banners, [action.kind]: null },
      };

    default:
      return state;
  }
}

export interface UseArcadeSurvivalOptions {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
}

export function useArcadeSurvival({
  onPlayKeySound,
  onPlaySuccessSound,
}: UseArcadeSurvivalOptions) {
  const [state, dispatch] = useReducer(arcadeReducer, undefined, createInitialArcadeState);
  const currentMission = getMissionForWave(state.wave);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerTimersRef = useRef<Partial<Record<ArcadeBannerKind, ReturnType<typeof setTimeout>>>>(
    {}
  );

  const scheduleBannerClear = useCallback((kind: ArcadeBannerKind, ms: number) => {
    const existing = bannerTimersRef.current[kind];
    if (existing) clearTimeout(existing);
    bannerTimersRef.current[kind] = setTimeout(() => {
      dispatch({ type: 'CLEAR_BANNER', kind });
    }, ms);
  }, []);

  // 언마운트 시 모든 배너 타이머 정리
  useEffect(() => {
    return () => {
      Object.values(bannerTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      bannerTimersRef.current = {};
    };
  }, []);

  // 쉴드 비상 발동 시 배너 자동 해제 타이머 등록
  useEffect(() => {
    if (state.shieldEmergencyNonce > 0) {
      scheduleBannerClear('skill', 1800);
    }
  }, [state.shieldEmergencyNonce, scheduleBannerClear]);

  // 카운트다운 타이머 (100ms)
  useEffect(() => {
    if (state.gameState === 'playing') {
      timerRef.current = setInterval(() => {
        dispatch({ type: 'TICK' });
      }, 100);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.gameState]);

  // 시간 초과 시 게임 오버 처리
  useEffect(() => {
    if (state.gameState === 'playing' && state.timeLeft <= 0 && state.freezeTimeLeft <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const { isNewBestScore, data } = saveArcadeRecord(state.score, state.wave, state.maxCombo);
      dispatch({ type: 'GAME_OVER', isNewRecord: isNewBestScore, analytics: data });
    }
  }, [state.gameState, state.timeLeft, state.freezeTimeLeft, state.score, state.wave, state.maxCombo]);

  const handleStartGame = useCallback(() => {
    dispatch({ type: 'START_GAME' });
    const firstMission = getMissionForWave(1);
    if (firstMission.isBoss) {
      scheduleBannerClear('bossAlert', 2000);
    }
  }, [scheduleBannerClear]);

  const scheduleWaveClearBanners = useCallback(
    (isBomb: boolean) => {
      const nextCombo = state.combo + 1;
      const isParBeaten = !isBomb && state.keystrokesInWave + 1 <= currentMission.par;
      if (isBomb) {
        scheduleBannerClear('skill', 1500);
      } else if (isParBeaten) {
        scheduleBannerClear('perfect', 1200);
        scheduleBannerClear('skill', 1800);
      }
      if (nextCombo > 0 && nextCombo % 3 === 0) {
        scheduleBannerClear('skill', 1800);
      }
      if (currentMission.isBoss) {
        scheduleBannerClear('bossDefeated', 2200);
      }
      if (getMissionForWave(state.wave + 1).isBoss) {
        scheduleBannerClear('bossAlert', 2000);
      }
    },
    [state.combo, state.keystrokesInWave, state.wave, currentMission, scheduleBannerClear]
  );

  const useChronoFreeze = useCallback(() => {
    if (
      state.gameState !== 'playing' ||
      state.powerups.freeze <= 0 ||
      state.freezeTimeLeft > 0
    ) {
      return;
    }
    dispatch({ type: 'USE_FREEZE' });
    scheduleBannerClear('skill', 1500);
  }, [state.gameState, state.powerups.freeze, state.freezeTimeLeft, scheduleBannerClear]);

  const useBugBomb = useCallback(() => {
    if (state.gameState !== 'playing' || state.powerups.bomb <= 0) {
      return;
    }
    onPlaySuccessSound();
    dispatch({ type: 'USE_BOMB' });
    scheduleWaveClearBanners(true);
  }, [state.gameState, state.powerups.bomb, onPlaySuccessSound, scheduleWaveClearBanners]);

  const processArcadeKey = useCallback(
    (key: string) => {
      if (state.gameState !== 'playing') {
        if (key === 'Enter') {
          handleStartGame();
        }
        return;
      }

      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key);
      if (isArrow) {
        scheduleBannerClear('penalty', 1500);
      }

      onPlayKeySound(key, state.editorState.mode);
      recordKeyInputStats(key);

      const nextEditorState = safeHandleKey(state.editorState, key);
      dispatch({ type: 'APPLY_KEY', key, nextEditorState, isArrow });

      const isTargetMatched =
        nextEditorState.mode === 'NORMAL' &&
        nextEditorState.lines.length === currentMission.targetLines.length &&
        nextEditorState.lines.every((line, idx) => line === currentMission.targetLines[idx]);

      if (isTargetMatched) {
        onPlaySuccessSound();
        dispatch({ type: 'WAVE_CLEARED', isBomb: false });
        scheduleWaveClearBanners(false);
      }
    },
    [
      state.gameState,
      state.editorState,
      currentMission,
      handleStartGame,
      onPlayKeySound,
      onPlaySuccessSound,
      scheduleBannerClear,
      scheduleWaveClearBanners,
    ]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useChronoFreeze();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        useBugBomb();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      processArcadeKey(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [processArcadeKey, useChronoFreeze, useBugBomb]);

  const isFrozen = state.freezeTimeLeft > 0;
  const timeRatio = isFrozen
    ? 100
    : Math.max(0, Math.min(100, (state.timeLeft / state.maxTime) * 100));
  const timeBarColor = isFrozen
    ? '#7dcfff'
    : timeRatio > 50
      ? '#9ece6a'
      : timeRatio > 25
        ? '#e0af68'
        : '#f7768e';

  return {
    ...state,
    currentMission,
    isFrozen,
    timeRatio,
    timeBarColor,
    handleStartGame,
    useChronoFreeze,
    useBugBomb,
  };
}
