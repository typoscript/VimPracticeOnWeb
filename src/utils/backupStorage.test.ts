import { describe, it, expect, beforeEach } from 'vitest';
import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  exportBackupJson,
  exportBackupPayload,
  getBackupSummary,
  importBackupJson,
} from './backupStorage';
import { PROGRESS_STORAGE_KEY, RELATIVE_LINE_STORAGE_KEY, saveLessonRecord, loadProgress } from './storage';
import { DUNGEON_STORAGE_KEY } from './dungeonStorage';

describe('backupStorage (JSON 백업 / 복원)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('현재 진도와 설정을 JSON 페이로드로 내보내고 요약을 계산한다', () => {
    saveLessonRecord(1, 3, 12);
    saveLessonRecord(2, 2, 20);
    localStorage.setItem(RELATIVE_LINE_STORAGE_KEY, 'true');

    const payload = exportBackupPayload();
    expect(payload.app).toBe(BACKUP_APP_ID);
    expect(payload.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(payload.entries[RELATIVE_LINE_STORAGE_KEY]).toBe(true);
    expect(getBackupSummary()).toEqual({ keyCount: 2, completedLessons: 2 });

    const json = exportBackupJson();
    expect(JSON.parse(json).entries[PROGRESS_STORAGE_KEY]['1'].bestStars).toBe(3);
  });

  it('merge 모드는 기존 더 높은 별점·낮은 타수 기록과 던전 클리어를 보존한다', () => {
    saveLessonRecord(1, 3, 10);
    localStorage.setItem(
      DUNGEON_STORAGE_KEY,
      JSON.stringify({ clearedStages: [1], unlockedSkills: ['x'] })
    );

    const backup = JSON.stringify({
      app: BACKUP_APP_ID,
      version: 1,
      entries: {
        [PROGRESS_STORAGE_KEY]: {
          1: { completed: true, bestStars: 1, minKeystrokes: 25 },
          3: { completed: true, bestStars: 2, minKeystrokes: 15 },
        },
        [DUNGEON_STORAGE_KEY]: {
          clearedStages: [2],
          unlockedSkills: ['w'],
        },
      },
    });

    const res = importBackupJson(backup, 'merge');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.completedLessons).toBe(2);
    }

    const progress = loadProgress();
    expect(progress[1]).toEqual({ completed: true, bestStars: 3, minKeystrokes: 10 });
    expect(progress[3]).toEqual({ completed: true, bestStars: 2, minKeystrokes: 15 });

    const dungeon = JSON.parse(localStorage.getItem(DUNGEON_STORAGE_KEY)!);
    expect(dungeon.clearedStages).toEqual([1, 2]);
    expect(dungeon.unlockedSkills).toEqual(['x', 'w']);
  });

  it('replace 모드는 백업에 없는 기존 키를 제거하고 정확히 덮어쓴다', () => {
    saveLessonRecord(1, 3, 10);
    localStorage.setItem(RELATIVE_LINE_STORAGE_KEY, 'true');

    const backup = JSON.stringify({
      app: BACKUP_APP_ID,
      version: 1,
      entries: {
        [PROGRESS_STORAGE_KEY]: {
          5: { completed: true, bestStars: 2, minKeystrokes: 18 },
        },
      },
    });

    const res = importBackupJson(backup, 'replace');
    expect(res.ok).toBe(true);
    expect(localStorage.getItem(RELATIVE_LINE_STORAGE_KEY)).toBeNull();
    expect(loadProgress()[1]).toBeUndefined();
    expect(loadProgress()[5].bestStars).toBe(2);
  });

  it('잘못된 JSON, 다른 앱 스키마, 알 수 없는 키만 있는 백업을 거부한다', () => {
    expect(importBackupJson('{bad')).toEqual({ ok: false, errorCode: 'INVALID_JSON' });
    expect(importBackupJson('{"app":"Other","entries":{"a":1}}')).toEqual({
      ok: false,
      errorCode: 'INVALID_FORMAT',
    });
    expect(importBackupJson('{"entries":{"__proto_evil__":1}}')).toEqual({
      ok: false,
      errorCode: 'EMPTY_BACKUP',
    });
  });

  it('merge 모드에서 저장된 커스텀 미션 라이브러리도 중복 없이 병합한다', () => {
    const existing = [
      {
        id: 'cm-local',
        savedAt: '2026-01-01T00:00:00Z',
        data: { title: 'Local', description: '', initialText: 'a', targetText: 'b', par: 5 },
      },
    ];
    localStorage.setItem('vim_custom_missions_v1', JSON.stringify(existing));

    const backup = JSON.stringify({
      app: BACKUP_APP_ID,
      version: 1,
      entries: {
        vim_custom_missions_v1: [
          {
            id: 'cm-remote-dup',
            savedAt: '2026-01-02T00:00:00Z',
            data: { title: 'Local', description: '', initialText: 'a', targetText: 'b', par: 5 },
          },
          {
            id: 'cm-remote-new',
            savedAt: '2026-01-03T00:00:00Z',
            data: { title: 'Remote', description: '', initialText: 'x', targetText: 'y', par: 7 },
          },
        ],
      },
    });

    const res = importBackupJson(backup, 'merge');
    expect(res.ok).toBe(true);
    const merged = JSON.parse(localStorage.getItem('vim_custom_missions_v1')!);
    expect(merged).toHaveLength(2);
    expect(merged.map((m: { id: string }) => m.id)).toEqual(['cm-local', 'cm-remote-new']);
  });
});
