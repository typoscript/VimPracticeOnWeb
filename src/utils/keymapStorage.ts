import { DEFAULT_KEYMAP_PRESETS } from './configGenerator';
import {
  STORAGE_KEYS,
  readStorageRaw,
  writeStorageRaw,
  readStorageJson,
  writeStorageJson,
} from './localStorageClient';

export const KEYMAP_PRESETS_STORAGE_KEY = STORAGE_KEYS.KEYMAP_PRESETS;
export const LEADER_KEY_STORAGE_KEY = STORAGE_KEYS.LEADER_KEY;
export const CUSTOM_KEYMAPS_STORAGE_KEY = STORAGE_KEYS.CUSTOM_KEYMAPS;

export interface CustomKeymapItem {
  id: string;
  mode: 'normal' | 'insert' | 'visual';
  from: string;
  to: string;
  description?: string;
  noremap?: boolean;
}

export function getDefaultActivePresets(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  DEFAULT_KEYMAP_PRESETS.forEach((preset) => {
    result[preset.id] = preset.defaultActive;
  });
  return result;
}

export function loadActivePresets(): Record<string, boolean> {
  const parsed = readStorageJson<Record<string, boolean> | null>(KEYMAP_PRESETS_STORAGE_KEY, null);
  return parsed ? { ...getDefaultActivePresets(), ...parsed } : getDefaultActivePresets();
}

export function saveActivePresets(presets: Record<string, boolean>): void {
  writeStorageJson(KEYMAP_PRESETS_STORAGE_KEY, presets);
}

export function loadLeaderKey(): string {
  return readStorageRaw(LEADER_KEY_STORAGE_KEY) || ' ';
}

export function saveLeaderKey(key: string): void {
  writeStorageRaw(LEADER_KEY_STORAGE_KEY, key);
}

export function loadCustomKeymaps(): CustomKeymapItem[] {
  const parsed = readStorageJson<unknown>(CUSTOM_KEYMAPS_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as CustomKeymapItem[]) : [];
}

export function saveCustomKeymaps(keymaps: CustomKeymapItem[]): void {
  writeStorageJson(CUSTOM_KEYMAPS_STORAGE_KEY, keymaps);
}

/**
 * 활성화된 프리셋과 리더 키, 커스텀 매핑을 Vim 엔진용 테이블로 컴파일합니다.
 */
export function compileUserKeymaps(
  activePresets: Record<string, boolean>,
  leaderKey = ' ',
  customMappings?: Record<string, string> | CustomKeymapItem[]
): Record<string, string> {
  const keymaps: Record<string, string> = {};

  if (activePresets['jkEsc']) {
    keymaps['i:jk'] = '<Esc>';
  }
  if (activePresets['jjEsc']) {
    keymaps['i:jj'] = '<Esc>';
  }
  if (activePresets['leaderW']) {
    keymaps['n:<leader>w'] = ':w';
    keymaps[`n:${leaderKey}w`] = ':w';
  }
  if (activePresets['leaderQ']) {
    keymaps['n:<leader>q'] = ':q';
    keymaps[`n:${leaderKey}q`] = ':q';
  }
  if (activePresets['hlLineMove']) {
    keymaps['n:H'] = '^';
    keymaps['n:L'] = '$';
  }
  if (activePresets['ctrlWindowNav']) {
    keymaps['n:Ctrl-h'] = 'Ctrl-w h';
    keymaps['n:Ctrl-j'] = 'Ctrl-w j';
    keymaps['n:Ctrl-k'] = 'Ctrl-w k';
    keymaps['n:Ctrl-l'] = 'Ctrl-w l';
  }
  if (activePresets['leaderBlackhole']) {
    keymaps['n:<leader>d'] = '"_d';
    keymaps[`n:${leaderKey}d`] = '"_d';
  }

  if (Array.isArray(customMappings)) {
    for (const item of customMappings) {
      if (!item.from || !item.to) continue;
      const prefix = item.mode === 'insert' ? 'i' : item.mode === 'visual' ? 'v' : 'n';
      keymaps[`${prefix}:${item.from}`] = item.to;
      keymaps[item.from] = item.to;

      if (item.from.includes('<leader>')) {
        const expanded = item.from.replace(/<leader>/gi, leaderKey);
        keymaps[`${prefix}:${expanded}`] = item.to;
        keymaps[expanded] = item.to;
      } else if (item.from.startsWith(leaderKey)) {
        const withLeader = '<leader>' + item.from.slice(leaderKey.length);
        keymaps[`${prefix}:${withLeader}`] = item.to;
        keymaps[withLeader] = item.to;
      }
    }
  } else if (customMappings) {
    Object.assign(keymaps, customMappings);
  }

  return keymaps;
}

