import { DEFAULT_KEYMAP_PRESETS } from './configGenerator';

export const KEYMAP_PRESETS_STORAGE_KEY = 'vim_keymap_presets_v1';
export const LEADER_KEY_STORAGE_KEY = 'vim_leader_key_v1';

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

/**
 * 활성화된 프리셋과 리더 키, 커스텀 매핑을 Vim 엔진용 테이블로 컴파일합니다.
 */
export function compileUserKeymaps(
  activePresets: Record<string, boolean>,
  leaderKey = ' ',
  customMappings?: Record<string, string>
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

  if (customMappings) {
    Object.assign(keymaps, customMappings);
  }

  return keymaps;
}
