import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDefaultDungeonSave,
  loadDungeonSave,
  saveDungeonSave,
  recordStageClear,
} from './dungeonStorage';

describe('dungeonStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadDungeonSave returns default state when empty', () => {
    const save = loadDungeonSave();
    expect(save.highestUnlockedStage).toBe(1);
    expect(save.unlockedSkillIds).toEqual(['basic_move', 'basic_slash']);
    expect(save.badges).toEqual([]);
    expect(save.stageRecords).toEqual({});
  });

  it('saveDungeonSave persists and loadDungeonSave retrieves correctly', () => {
    const defaultData = getDefaultDungeonSave();
    defaultData.highestUnlockedStage = 3;
    defaultData.badges.push('Test Badge');
    saveDungeonSave(defaultData);

    const loaded = loadDungeonSave();
    expect(loaded.highestUnlockedStage).toBe(3);
    expect(loaded.badges).toContain('Test Badge');
  });

  it('recordStageClear correctly calculates stars and unlocks next stage and skill', () => {
    const stageId = 1;
    const par = 10;
    
    // Keystrokes <= par -> 3 stars
    const res1 = recordStageClear(stageId, 8, par, 'word_jump');
    expect(res1.isNewClear).toBe(true);
    expect(res1.stars).toBe(3);
    expect(res1.data.highestUnlockedStage).toBe(2);
    expect(res1.data.unlockedSkillIds).toContain('word_jump');
    expect(res1.data.stageRecords[1].minKeystrokes).toBe(8);

    // Keystrokes between par+1 and par+4 -> 2 stars
    const res2 = recordStageClear(2, 13, 10, 'find_char');
    expect(res2.stars).toBe(2);
    expect(res2.data.highestUnlockedStage).toBe(3);

    // Keystrokes > par+4 -> 1 star
    const res3 = recordStageClear(3, 20, 10, 'bracket_portal');
    expect(res3.stars).toBe(1);
    expect(res3.data.highestUnlockedStage).toBe(4);
  });

  it('recordStageClear for stage 5 awards special master badges', () => {
    // Par 이하 클리어 시
    const parClear = recordStageClear(5, 10, 12);
    expect(parClear.newBadgeEarned).toBe('🏆 [Vim Dungeon Master - Par 이하 정복]');
    expect(parClear.data.badges).toContain('🏆 [Vim Dungeon Master - Par 이하 정복]');

    // Par 초과 클리어 시
    localStorage.clear();
    const normalClear = recordStageClear(5, 20, 12);
    expect(normalClear.newBadgeEarned).toBe('🗡️ [Vim Dungeon Conqueror]');
    expect(normalClear.data.badges).toContain('🗡️ [Vim Dungeon Conqueror]');
  });
});
