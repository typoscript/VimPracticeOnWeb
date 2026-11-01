import { DungeonSaveData, DungeonRecord } from '../types/dungeon';

export const DUNGEON_STORAGE_KEY = 'vim_dungeon_save_v1';

export function getDefaultDungeonSave(): DungeonSaveData {
  return {
    highestUnlockedStage: 1,
    stageRecords: {},
    unlockedSkillIds: ['basic_move', 'basic_slash'],
    badges: [],
  };
}

export function loadDungeonSave(): DungeonSaveData {
  try {
    const raw = localStorage.getItem(DUNGEON_STORAGE_KEY);
    if (!raw) return getDefaultDungeonSave();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultDungeonSave(),
      ...parsed,
    };
  } catch {
    return getDefaultDungeonSave();
  }
}

export function saveDungeonSave(data: DungeonSaveData): void {
  try {
    localStorage.setItem(DUNGEON_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장 실패 무시
  }
}

/**
 * 스테이지 클리어 기록 및 스킬/배지 언락을 처리합니다.
 */
export function recordStageClear(
  stageId: number,
  keystrokes: number,
  par: number,
  newSkillId?: string
): {
  isNewClear: boolean;
  stars: number;
  data: DungeonSaveData;
  newBadgeEarned?: string;
} {
  const data = loadDungeonSave();
  const existing = data.stageRecords[stageId];
  const isNewClear = !existing || !existing.completed;

  // 별점 계산 (Par 이하: 3성, Par + 4 이하: 2성, 그 외: 1성)
  const stars = keystrokes <= par ? 3 : keystrokes <= par + 4 ? 2 : 1;

  const updatedRecord: DungeonRecord = {
    stageId,
    completed: true,
    minKeystrokes: existing ? Math.min(existing.minKeystrokes, keystrokes) : keystrokes,
    stars: existing ? Math.max(existing.stars, stars) : stars,
    completedAt: new Date().toISOString(),
  };

  data.stageRecords[stageId] = updatedRecord;

  // 다음 스테이지 해금
  if (data.highestUnlockedStage < stageId + 1 && stageId < 5) {
    data.highestUnlockedStage = stageId + 1;
  }

  // 신규 스킬 해금
  if (newSkillId && !data.unlockedSkillIds.includes(newSkillId)) {
    data.unlockedSkillIds.push(newSkillId);
  }

  // 보스 스테이지 5 클리어 시 특별 마스터 칭호 부여
  let newBadgeEarned: string | undefined = undefined;
  if (stageId === 5) {
    const badgeName =
      keystrokes <= par
        ? '🏆 [Vim Dungeon Master - Par 이하 정복]'
        : '🗡️ [Vim Dungeon Conqueror]';
    if (!data.badges.includes(badgeName)) {
      data.badges.push(badgeName);
      newBadgeEarned = badgeName;
    }
  }

  saveDungeonSave(data);
  return { isNewClear, stars, data, newBadgeEarned };
}
