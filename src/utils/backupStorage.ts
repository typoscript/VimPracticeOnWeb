import { LessonProgress, LessonRecord } from './storage';
import { mergeSavedCustomMissions } from './customMission';
import {
  STORAGE_KEYS,
  readStorageRaw,
  writeStorageRaw,
  removeStorageItem,
  readStorageJson,
} from './localStorageClient';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'VimPracticeOnWeb';

export const BACKUP_KEYS = [
  STORAGE_KEYS.PROGRESS,
  STORAGE_KEYS.DUNGEON_SAVE,
  STORAGE_KEYS.ANALYTICS,
  STORAGE_KEYS.SRS_SCHEDULE,
  STORAGE_KEYS.CUSTOM_MISSIONS,
  STORAGE_KEYS.CAPSTONE_PROGRESS,
  STORAGE_KEYS.SPEEDRUN_RECORD,
  STORAGE_KEYS.DOJO_HIGH_SCORES,
  STORAGE_KEYS.DOJO_LEADERBOARD,
  STORAGE_KEYS.KEYMAP_PRESETS,
  STORAGE_KEYS.LEADER_KEY,
  STORAGE_KEYS.CUSTOM_KEYMAPS,
  STORAGE_KEYS.USER_INIT_CONFIG,
  STORAGE_KEYS.HARDCORE_MODE,
  STORAGE_KEYS.RELATIVE_LINE,
  STORAGE_KEYS.VIRTUAL_KEYBOARD,
  STORAGE_KEYS.DIFF_VIEW,
  STORAGE_KEYS.REGISTER_INSPECTOR,
  STORAGE_KEYS.MARKS_VISUALIZER,
  STORAGE_KEYS.GRAMMAR_AST,
  STORAGE_KEYS.WHICH_KEY,
  STORAGE_KEYS.ACTION_TIMELINE,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.SOUND_MUTED,
  STORAGE_KEYS.LOCALE,
  STORAGE_KEYS.SANDBOX_AUTOSAVE,
] as const;

const BACKUP_KEY_SET = new Set<string>(BACKUP_KEYS);

export type BackupRestoreMode = 'merge' | 'replace';

export interface VimBackupPayload {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  entries: Record<string, unknown>;
}

export type BackupImportResult =
  | { ok: true; restoredKeys: string[]; completedLessons: number }
  | { ok: false; errorCode: 'INVALID_JSON' | 'INVALID_FORMAT' | 'EMPTY_BACKUP' };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function tryParseStoredValue(raw: string): unknown {
  if (raw === 'true' || raw === 'false' || raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function serializeStoredValue(val: unknown): string {
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function countCompletedLessons(progressObj: unknown): number {
  if (!isPlainObject(progressObj)) return 0;
  return Object.values(progressObj).filter(
    (rec) => isPlainObject(rec) && rec.completed === true
  ).length;
}

function mergeLessonProgress(existingRaw: string | null, incoming: unknown): LessonProgress {
  let existing: LessonProgress = {};
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (isPlainObject(parsed)) existing = parsed as LessonProgress;
    } catch {
      existing = {};
    }
  }
  if (!isPlainObject(incoming)) return existing;

  const merged: LessonProgress = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    const id = Number(k);
    if (!Number.isFinite(id) || !isPlainObject(v)) continue;
    const prev = merged[id];
    const nextStars = typeof v.bestStars === 'number' ? v.bestStars : 0;
    const nextKeys = typeof v.minKeystrokes === 'number' ? v.minKeystrokes : Number.MAX_SAFE_INTEGER;
    const nextCompleted = Boolean(v.completed);

    const record: LessonRecord = prev
      ? {
          completed: prev.completed || nextCompleted,
          bestStars: Math.max(prev.bestStars, nextStars),
          minKeystrokes: Math.min(prev.minKeystrokes, nextKeys),
        }
      : {
          completed: nextCompleted,
          bestStars: nextStars,
          minKeystrokes: nextKeys,
        };
    merged[id] = record;
  }
  return merged;
}

function mergeDungeonSave(existingRaw: string | null, incoming: unknown): unknown {
  if (!isPlainObject(incoming)) return incoming;
  let existing: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (isPlainObject(parsed)) existing = parsed;
    } catch {
      existing = {};
    }
  }
  const exCleared = Array.isArray(existing.clearedStages) ? existing.clearedStages : [];
  const inCleared = Array.isArray(incoming.clearedStages) ? incoming.clearedStages : [];
  const exSkills = Array.isArray(existing.unlockedSkills) ? existing.unlockedSkills : [];
  const inSkills = Array.isArray(incoming.unlockedSkills) ? incoming.unlockedSkills : [];
  return {
    ...existing,
    ...incoming,
    clearedStages: Array.from(new Set([...exCleared, ...inCleared])),
    unlockedSkills: Array.from(new Set([...exSkills, ...inSkills])),
  };
}

/**
 * 현재 localStorage에 저장된 학습 진도와 설정을 백업 페이로드로 수집합니다.
 */
export function exportBackupPayload(): VimBackupPayload {
  const entries: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const raw = readStorageRaw(key);
    if (raw !== null) {
      entries[key] = tryParseStoredValue(raw);
    }
  }
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function exportBackupJson(): string {
  return JSON.stringify(exportBackupPayload(), null, 2);
}

export function getBackupSummary(): { keyCount: number; completedLessons: number } {
  const payload = exportBackupPayload();
  const keys = Object.keys(payload.entries);
  return {
    keyCount: keys.length,
    completedLessons: countCompletedLessons(payload.entries[STORAGE_KEYS.PROGRESS]),
  };
}

/**
 * JSON 백업 문자열을 검증하고 localStorage에 복원합니다.
 */
export function importBackupJson(
  rawJson: string,
  mode: BackupRestoreMode = 'merge'
): BackupImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, errorCode: 'INVALID_JSON' };
  }

  if (!isPlainObject(parsed) || !isPlainObject(parsed.entries)) {
    return { ok: false, errorCode: 'INVALID_FORMAT' };
  }
  if (parsed.app !== undefined && parsed.app !== BACKUP_APP_ID) {
    return { ok: false, errorCode: 'INVALID_FORMAT' };
  }

  const validEntries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!BACKUP_KEY_SET.has(key) || value === undefined || value === null) continue;
    validEntries.push([key, value]);
  }

  if (validEntries.length === 0) {
    return { ok: false, errorCode: 'EMPTY_BACKUP' };
  }

  const entryMap = new Map(validEntries);

  if (mode === 'replace') {
    for (const key of BACKUP_KEYS) {
      if (!entryMap.has(key) && !removeStorageItem(key)) {
        return { ok: false, errorCode: 'INVALID_FORMAT' };
      }
    }
  }

  for (const [key, value] of validEntries) {
    let serialized: string;
    if (mode === 'merge' && key === STORAGE_KEYS.PROGRESS) {
      serialized = JSON.stringify(mergeLessonProgress(readStorageRaw(key), value));
    } else if (mode === 'merge' && key === STORAGE_KEYS.DUNGEON_SAVE) {
      serialized = JSON.stringify(mergeDungeonSave(readStorageRaw(key), value));
    } else if (mode === 'merge' && key === STORAGE_KEYS.CUSTOM_MISSIONS) {
      const existing = readStorageJson<unknown>(key, []);
      serialized = JSON.stringify(mergeSavedCustomMissions(existing, value));
    } else {
      serialized = serializeStoredValue(value);
    }
    if (!writeStorageRaw(key, serialized)) {
      return { ok: false, errorCode: 'INVALID_FORMAT' };
    }
  }

  const completedLessons = countCompletedLessons(readStorageJson<unknown>(STORAGE_KEYS.PROGRESS, null));

  return {
    ok: true,
    restoredKeys: validEntries.map(([k]) => k),
    completedLessons,
  };
}
