/**
 * 브라우저 localStorage 접근을 일원화하는 타입 안전 스토리지 레이어 및 키 단일 진실 원천(SSOT)입니다.
 * 시크릿 모드·저장 공간 초과·비브라우저 환경에서도 예외를 삼키고 안전하게 기본값을 반환합니다.
 */

export const STORAGE_KEYS = {
  PROGRESS: 'vim_practice_progress_v1',
  RELATIVE_LINE: 'vim_relative_line_numbers_v1',
  VIRTUAL_KEYBOARD: 'vim_virtual_keyboard_v1',
  DIFF_VIEW: 'vim_diff_view_v1',
  REGISTER_INSPECTOR: 'vim_register_inspector_v1',
  MARKS_VISUALIZER: 'vim_marks_visualizer_v1',
  GRAMMAR_AST: 'vim_grammar_ast_v1',
  WHICH_KEY: 'vim_which_key_v1',
  ACTION_TIMELINE: 'vim_practice_action_timeline_enabled',
  SPEEDRUN_RECORD: 'vim_speedrun_record_v1',
  HARDCORE_MODE: 'vim_hardcore_mode_v1',
  DOJO_HIGH_SCORES: 'vim_dojo_high_scores_v1',
  DOJO_LEADERBOARD: 'vim_dojo_leaderboard_v1',
  DUNGEON_SAVE: 'vim_dungeon_save_v1',
  ANALYTICS: 'vim_user_analytics_v1',
  SRS_SCHEDULE: 'vim_srs_schedule_v1',
  CUSTOM_MISSIONS: 'vim_custom_missions_v1',
  KEYMAP_PRESETS: 'vim_keymap_presets_v1',
  LEADER_KEY: 'vim_leader_key_v1',
  CUSTOM_KEYMAPS: 'vim_custom_keymaps_v1',
  USER_INIT_CONFIG: 'vim_user_init_config_v1',
  THEME: 'vim_selected_theme',
  SOUND_MUTED: 'vim_sound_muted',
  LOCALE: 'vim_locale_v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export function readStorageRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStorageBoolean(key: string, defaultValue: boolean): boolean {
  const raw = readStorageRaw(key);
  return raw !== null ? raw === 'true' : defaultValue;
}

export function writeStorageBoolean(key: string, value: boolean): boolean {
  return writeStorageRaw(key, value ? 'true' : 'false');
}

export function readStorageJson<T>(key: string, fallback: T): T {
  const raw = readStorageRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorageJson(key: string, value: unknown): boolean {
  try {
    return writeStorageRaw(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
