import { DEFAULT_KEYMAP_PRESETS } from './configGenerator';

export const KEYMAP_PRESETS_STORAGE_KEY = 'vim_keymap_presets_v1';
export const LEADER_KEY_STORAGE_KEY = 'vim_leader_key_v1';
export const CUSTOM_KEYMAPS_STORAGE_KEY = 'vim_custom_keymaps_v1';

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
  try {
    const raw = localStorage.getItem(KEYMAP_PRESETS_STORAGE_KEY);
    if (!raw) return getDefaultActivePresets();
    return {
      ...getDefaultActivePresets(),
      ...JSON.parse(raw),
    };
  } catch {
    return getDefaultActivePresets();
  }
}

export function saveActivePresets(presets: Record<string, boolean>): void {
  try {
    localStorage.setItem(KEYMAP_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 예외 무시
  }
}

export function loadLeaderKey(): string {
  try {
    return localStorage.getItem(LEADER_KEY_STORAGE_KEY) || ' ';
  } catch {
    return ' ';
  }
}

export function saveLeaderKey(key: string): void {
  try {
    localStorage.setItem(LEADER_KEY_STORAGE_KEY, key);
  } catch {
    // 예외 무시
  }
}

export function loadCustomKeymaps(): CustomKeymapItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEYMAPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomKeymaps(keymaps: CustomKeymapItem[]): void {
  try {
    localStorage.setItem(CUSTOM_KEYMAPS_STORAGE_KEY, JSON.stringify(keymaps));
  } catch {
    // 예외 무시
  }
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

