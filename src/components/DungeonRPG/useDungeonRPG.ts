import { useReducer, useEffect, useCallback, useRef } from 'react';
import { DUNGEON_STAGES } from '../../data/dungeonStages';
import { DungeonStage, DungeonSkill, DungeonSaveData } from '../../types/dungeon';
import { VimEditorState, VimMode, handleKey } from '../../vim-engine';
import { loadDungeonSave, recordStageClear } from '../../utils/dungeonStorage';
import { recordKeyInputStats } from '../../utils/analyticsStorage';
import { t } from '../../i18n';

export interface SlashEffect {
  line: number;
  col: number;
  label: string;
}

interface DungeonState {
  saveData: DungeonSaveData;
  currentStageIndex: number;
  editorState: VimEditorState;
  keystrokes: number;
  hasKey: boolean;
  doorOpen: boolean;
  isCompleted: boolean;
  starsEarned: number;
  newBadge: string | null;
  unlockedSkill: DungeonSkill | null;
  slashEffect: SlashEffect | null;
  toastMessage: string | null;
}

type DungeonAction =
  | { type: 'LOAD_STAGE'; index: number }
  | { type: 'SHOW_TOAST'; message: string }
  | { type: 'CLEAR_TOAST'; message: string }
  | { type: 'SET_SLASH'; effect: SlashEffect }
  | { type: 'CLEAR_SLASH' }
  | {
      type: 'APPLY_STEP';
      editorState: VimEditorState;
      hasKey: boolean;
      doorOpen: boolean;
      slashEffect?: SlashEffect;
    }
  | {
      type: 'COMPLETE_STAGE';
      keystrokes: number;
      saveData: DungeonSaveData;
      starsEarned: number;
      newBadge: string | null;
      unlockedSkill: DungeonSkill | null;
    };

function createStageEditorState(stage: DungeonStage): VimEditorState {
  return {
    lines: [...stage.initialLines],
    cursor: { ...stage.initialCursor },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };
}

function createInitialDungeonState(): DungeonState {
  const stage = DUNGEON_STAGES[0];
  return {
    saveData: loadDungeonSave(),
    currentStageIndex: 0,
    editorState: createStageEditorState(stage),
    keystrokes: 0,
    hasKey: false,
    doorOpen: false,
    isCompleted: false,
    starsEarned: 0,
    newBadge: null,
    unlockedSkill: null,
    slashEffect: null,
    toastMessage: null,
  };
}

function dungeonReducer(state: DungeonState, action: DungeonAction): DungeonState {
  switch (action.type) {
    case 'LOAD_STAGE': {
      const stage = DUNGEON_STAGES[action.index];
      return {
        ...state,
        currentStageIndex: action.index,
        editorState: createStageEditorState(stage),
        keystrokes: 0,
        hasKey: false,
        doorOpen: false,
        isCompleted: false,
        starsEarned: 0,
        newBadge: null,
        unlockedSkill: null,
        slashEffect: null,
        toastMessage: null,
      };
    }

    case 'SHOW_TOAST':
      return { ...state, toastMessage: action.message };

    case 'CLEAR_TOAST':
      return state.toastMessage === action.message ? { ...state, toastMessage: null } : state;

    case 'SET_SLASH':
      return { ...state, slashEffect: action.effect };

    case 'CLEAR_SLASH':
      return { ...state, slashEffect: null };

    case 'APPLY_STEP':
      return {
        ...state,
        editorState: action.editorState,
        keystrokes: state.keystrokes + 1,
        hasKey: action.hasKey,
        doorOpen: action.doorOpen,
        slashEffect: action.slashEffect !== undefined ? action.slashEffect : state.slashEffect,
      };

    case 'COMPLETE_STAGE':
      return {
        ...state,
        isCompleted: true,
        keystrokes: action.keystrokes,
        saveData: action.saveData,
        starsEarned: action.starsEarned,
        newBadge: action.newBadge,
        unlockedSkill: action.unlockedSkill,
      };

    default:
      return state;
  }
}

function resolveWalkCollision(
  stage: DungeonStage,
  nextState: VimEditorState,
  prevCursor: VimEditorState['cursor'],
  doorOpen: boolean
): { state: VimEditorState; warning?: string } {
  const { line, col } = nextState.cursor;
  const targetTileChar = stage.tileMap[line]?.[col];

  if (targetTileChar === '#') {
    return { state: { ...nextState, cursor: prevCursor }, warning: t('🧱 벽에 부딪혔습니다!') };
  }
  if (targetTileChar === '~') {
    return {
      state: { ...nextState, cursor: prevCursor },
      warning: t('🌊 깊은 물은 걸어서 건널 수 없습니다! w/b/e 도약 부츠를 사용하세요.'),
    };
  }
  if (targetTileChar === '_' && !nextState.lines[line]?.includes('BRIDGE')) {
    return {
      state: { ...nextState, cursor: prevCursor },
      warning: t('🕳️ 끊어진 심연입니다! 다리 블록을 yiw 복사한 후 p로 건설하세요.'),
    };
  }
  if (targetTileChar === 'D' && !doorOpen) {
    return {
      state: { ...nextState, cursor: prevCursor },
      warning: t('🚪 굳게 잠긴 문입니다! 황금 열쇠(K)를 획득하세요.'),
    };
  }
  return { state: nextState };
}

export interface UseDungeonRPGOptions {
  onPlayKeySound: (key: string, mode: VimMode) => void;
  onPlaySuccessSound: () => void;
}

export function useDungeonRPG({ onPlayKeySound, onPlaySuccessSound }: UseDungeonRPGOptions) {
  const [state, dispatch] = useReducer(dungeonReducer, undefined, createInitialDungeonState);
  const stage: DungeonStage = DUNGEON_STAGES[state.currentStageIndex];

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

  const loadStage = useCallback((index: number) => {
    dispatch({ type: 'LOAD_STAGE', index });
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      dispatch({ type: 'SHOW_TOAST', message: msg });
      scheduleTimer(() => dispatch({ type: 'CLEAR_TOAST', message: msg }), 2000);
    },
    [scheduleTimer]
  );

  const processDungeonKey = useCallback(
    (key: string) => {
      if (state.isCompleted) {
        if (key === 'Enter' && state.currentStageIndex < DUNGEON_STAGES.length - 1) {
          loadStage(state.currentStageIndex + 1);
        }
        return;
      }

      const isAllowed =
        stage.allowedKeys.includes(key) ||
        stage.allowedKeys.some((k) => key.startsWith(k)) ||
        ['Shift', 'Control', 'Alt', 'Meta'].includes(key);

      if (!isAllowed) {
        showToast(t('🔒 이 스테이지에서는 아직 [{key}] 키를 사용할 수 없습니다!', { key }));
        return;
      }

      onPlayKeySound(key, state.editorState.mode);
      recordKeyInputStats(key);
      const prevCursor = { ...state.editorState.cursor };

      let nextState = handleKey(state.editorState, key);
      let nextHasKey = state.hasKey;
      let nextDoorOpen = state.doorOpen;
      let nextSlash: SlashEffect | undefined;

      // 단일 보행(h/j/k/l) 충돌 검사
      if (['h', 'j', 'k', 'l'].includes(key)) {
        const walkResult = resolveWalkCollision(stage, nextState, prevCursor, nextDoorOpen);
        nextState = walkResult.state;
        if (walkResult.warning) showToast(walkResult.warning);
      }

      const nextCursor = nextState.cursor;

      // 타격 액션 이펙트
      if (key === 'x' || key === 'd' || nextState.pendingKeys?.includes('d')) {
        nextSlash = { line: nextCursor.line, col: nextCursor.col, label: 'SLASH! 🗡️' };
        scheduleTimer(() => dispatch({ type: 'CLEAR_SLASH' }), 600);
      }

      // 열쇠(K) 획득 검사
      const curCharInLine = nextState.lines[nextCursor.line]?.[nextCursor.col];
      const origCharInMap = stage.tileMap[nextCursor.line]?.[nextCursor.col];
      if (!nextHasKey && (curCharInLine === 'K' || origCharInMap === 'K')) {
        nextHasKey = true;
        nextDoorOpen = true;
        onPlaySuccessSound();
        showToast(t('🗝️ 황금 열쇠를 획득하여 잠긴 문(D)이 열렸습니다!'));

        const updatedLines = [...nextState.lines];
        const rowStr = updatedLines[nextCursor.line] || '';
        updatedLines[nextCursor.line] =
          rowStr.slice(0, nextCursor.col) + '.' + rowStr.slice(nextCursor.col + 1);
        nextState = { ...nextState, lines: updatedLines };
      }

      // 보스전(Stage 5) 특수 판정
      if (stage.id === 5) {
        const hasBossAlive = nextState.lines.some((l) => l.includes('BUG_LORD'));
        if (!hasBossAlive && !nextDoorOpen) {
          nextDoorOpen = true;
          nextHasKey = true;
          onPlaySuccessSound();
          nextSlash = { line: 2, col: 5, label: 'BOSS CRUSHED! 💥' };
          showToast(t('💥 버그 로드가 쓰러져 신전의 거대한 문이 열렸습니다!'));
        }
      }

      // 최종 보스전(Stage 6) 특수 판정
      if (stage.id === 6) {
        const hasDragonAlive = nextState.lines.some((l) => l.includes('CHAOS_DRAGON'));
        if (!hasDragonAlive && !nextDoorOpen) {
          nextDoorOpen = true;
          nextHasKey = true;
          onPlaySuccessSound();
          nextSlash = { line: 2, col: 7, label: 'DRAGON VANQUISHED! 🐉💥' };
          showToast(t('🐉 카오스 드래곤이 쓰러져 궁극의 차원 포탈이 열렸습니다!'));
        }

        const hasCoreAlive = nextState.lines.some((l) => l.includes('CORE'));
        if (!hasCoreAlive && state.editorState.lines.some((l) => l.includes('CORE'))) {
          nextSlash = { line: 1, col: 10, label: 'CORE SHATTERED! ⚡' };
          showToast(t('⚡ 마력 코어가 파괴되어 드래곤의 방어막이 약화되었습니다!'));
        }

        if (state.keystrokes === stage.par) {
          showToast(t('⚠️ 카오스 드래곤이 폭주(Enrage) 상태에 돌입했습니다! (Par 초과)'));
        }
      }

      // 출구(E) 도달 클리어 검사
      if (
        (origCharInMap === 'E' || curCharInLine === 'E') &&
        (nextDoorOpen || nextHasKey || stage.id === 2 || stage.id === 3)
      ) {
        onPlaySuccessSound();
        const nextKeystrokes = state.keystrokes + 1;
        const res = recordStageClear(
          stage.id,
          nextKeystrokes,
          stage.par,
          stage.newSkillUnlocked?.id
        );
        dispatch({
          type: 'COMPLETE_STAGE',
          keystrokes: nextKeystrokes,
          saveData: res.data,
          starsEarned: res.stars,
          newBadge: res.newBadgeEarned ?? null,
          unlockedSkill: stage.newSkillUnlocked ?? null,
        });
        return;
      }

      dispatch({
        type: 'APPLY_STEP',
        editorState: nextState,
        hasKey: nextHasKey,
        doorOpen: nextDoorOpen,
        slashEffect: nextSlash,
      });
    },
    [
      state.isCompleted,
      state.currentStageIndex,
      state.editorState,
      state.hasKey,
      state.doorOpen,
      state.keystrokes,
      stage,
      loadStage,
      onPlayKeySound,
      onPlaySuccessSound,
      showToast,
      scheduleTimer,
    ]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      processDungeonKey(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [processDungeonKey]);

  return {
    ...state,
    stage,
    loadStage,
  };
}
