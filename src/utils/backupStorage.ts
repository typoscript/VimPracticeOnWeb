import {
  PROGRESS_STORAGE_KEY,
  RELATIVE_LINE_STORAGE_KEY,
  VIRTUAL_KEYBOARD_STORAGE_KEY,
  DIFF_VIEW_STORAGE_KEY,
  REGISTER_INSPECTOR_STORAGE_KEY,
  MARKS_VISUALIZER_STORAGE_KEY,
  GRAMMAR_AST_STORAGE_KEY,
  SPEEDRUN_RECORD_STORAGE_KEY,
  HARDCORE_MODE_STORAGE_KEY,
  DOJO_HIGH_SCORES_STORAGE_KEY,
  DOJO_LEADERBOARD_STORAGE_KEY,
  LessonProgress,
  LessonRecord,
} from './storage';
import { DUNGEON_STORAGE_KEY } from './dungeonStorage';
import { ANALYTICS_STORAGE_KEY } from './analyticsStorage';
import { SRS_STORAGE_KEY } from './srsScheduler';
import {
  KEYMAP_PRESETS_STORAGE_KEY,
  LEADER_KEY_STORAGE_KEY,
  CUSTOM_KEYMAPS_STORAGE_KEY,
} from './keymapStorage';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'VimPracticeOnWeb';

export const BACKUP_KEYS = [
  PROGRESS_STORAGE_KEY,
  DUNGEON_STORAGE_KEY,
  ANALYTICS_STORAGE_KEY,
  SRS_STORAGE_KEY,
  SPEEDRUN_RECORD_STORAGE_KEY,
  DOJO_HIGH_SCORES_STORAGE_KEY,
  DOJO_LEADERBOARD_STORAGE_KEY,
  KEYMAP_PRESETS_STORAGE_KEY,
  LEADER_KEY_STORAGE_KEY,
  CUSTOM_KEYMAPS_STORAGE_KEY,
  HARDCORE_MODE_STORAGE_KEY,
  RELATIVE_LINE_STORAGE_KEY,
  VIRTUAL_KEYBOARD_STORAGE_KEY,
  DIFF_VIEW_STORAGE_KEY,
  REGISTER_INSPECTOR_STORAGE_KEY,
  MARKS_VISUALIZER_STORAGE_KEY,
  GRAMMAR_AST_STORAGE_KEY,
  'vim_practice_action_timeline_enabled',
  'vim_selected_theme',
  'vim_sound_muted',
  'vim_locale_v1',
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
  try {
    for (const key of BACKUP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        entries[key] = tryParseStoredValue(raw);
      }
    }
  } catch {
    // ignore storage errors
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
    completedLessons: countCompletedLessons(payload.entries[PROGRESS_STORAGE_KEY]),
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

  try {
    if (mode === 'replace') {
      for (const key of BACKUP_KEYS) {
        if (!entryMap.has(key)) {
          localStorage.removeItem(key);
        }
      }
    }

    for (const [key, value] of validEntries) {
      if (mode === 'merge' && key === PROGRESS_STORAGE_KEY) {
        const merged = mergeLessonProgress(localStorage.getItem(key), value);
        localStorage.setItem(key, JSON.stringify(merged));
      } else if (mode === 'merge' && key === DUNGEON_STORAGE_KEY) {
        const merged = mergeDungeonSave(localStorage.getItem(key), value);
        localStorage.setItem(key, JSON.stringify(merged));
      } else {
        localStorage.setItem(key, serializeStoredValue(value));
      }
    }
  } catch {
    return { ok: false, errorCode: 'INVALID_FORMAT' };
  }

  let completedLessons = 0;
  try {
    const rawProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (rawProgress) completedLessons = countCompletedLessons(JSON.parse(rawProgress));
  } catch {
    completedLessons = 0;
  }

  return {
    ok: true,
    restoredKeys: validEntries.map(([k]) => k),
    completedLessons,
  };
}
