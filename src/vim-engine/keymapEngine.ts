import { VimEditorState } from './types';
import { msg } from './messages';

export interface KeymapEntry {
  mode: string;
  lhs: string;
  rhs: string;
}

/**
 * Parses RHS/LHS key notation into an array of Vim atomic key tokens.
 * Handles <CR>, <Esc>, <Space>, <leader>, <BS>, <Tab>, <C-x>, Ctrl-x, etc.
 */
export function parseKeySequence(rhs: string, leaderKey = ' '): string[] {
  if (!rhs) return [];
  const tokens: string[] = [];
  let i = 0;

  while (i < rhs.length) {
    // 1. Bracketed token <...>
    if (rhs[i] === '<') {
      const closeIdx = rhs.indexOf('>', i + 1);
      if (closeIdx !== -1) {
        const rawToken = rhs.slice(i + 1, closeIdx);
        const lower = rawToken.toLowerCase();

        if (lower === 'cr' || lower === 'return' || lower === 'enter') {
          tokens.push('Enter');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'esc' || lower === 'escape') {
          tokens.push('Escape');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'space') {
          tokens.push(' ');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'leader') {
          tokens.push(leaderKey);
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'bs' || lower === 'backspace') {
          tokens.push('Backspace');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'tab') {
          tokens.push('Tab');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 's-tab' || lower === 'shift-tab') {
          tokens.push('Shift-Tab');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'up') {
          tokens.push('ArrowUp');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'down') {
          tokens.push('ArrowDown');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'left') {
          tokens.push('ArrowLeft');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'right') {
          tokens.push('ArrowRight');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'nop') {
          i = closeIdx + 1;
          continue;
        }

        const ctrlMatch = rawToken.match(/^(?:c|ctrl)-(.+)$/i);
        if (ctrlMatch) {
          const k = ctrlMatch[1].toLowerCase();
          tokens.push(`Ctrl-${k}`);
          i = closeIdx + 1;
          continue;
        }

        if (lower === 'lt') {
          tokens.push('<');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'gt') {
          tokens.push('>');
          i = closeIdx + 1;
          continue;
        }
        if (lower === 'bar') {
          tokens.push('|');
          i = closeIdx + 1;
          continue;
        }

        const fMatch = lower.match(/^f([1-9]|1[0-2])$/);
        if (fMatch) {
          tokens.push(`F${fMatch[1]}`);
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // 2. Unbracketed Ctrl-x pattern (e.g. "Ctrl-w", "Ctrl-h")
    const sub = rhs.slice(i);
    const unbracketedCtrl = sub.match(/^Ctrl-([a-zA-Z0-9])/i);
    if (unbracketedCtrl) {
      tokens.push(`Ctrl-${unbracketedCtrl[1].toLowerCase()}`);
      i += unbracketedCtrl[0].length;
      if (rhs[i] === ' ' && i + 1 < rhs.length && /[a-zA-Z0-9]/.test(rhs[i + 1])) {
        i += 1;
      }
      continue;
    }

    const unbracketedF = sub.match(/^F([1-9]|1[0-2])\b/);
    if (unbracketedF) {
      tokens.push(`F${unbracketedF[1]}`);
      i += unbracketedF[0].length;
      continue;
    }

    // 3. Literal character
    tokens.push(rhs[i]);
    i++;
  }

  return tokens;
}

/**
 * Resolves a matching keymap for the given mode and key sequence.
 */
export function resolveKeymap(
  state: VimEditorState,
  mode: 'n' | 'i' | 'v',
  keySequence: string
): string | null {
  const userKeymaps = state.userKeymaps;
  if (!userKeymaps) return null;

  const leaderKey = state.leaderKey || ' ';
  const variants = [keySequence];

  if (keySequence.includes('<leader>')) {
    variants.push(keySequence.replace(/<leader>/gi, leaderKey));
  } else if (keySequence.startsWith(leaderKey)) {
    variants.push('<leader>' + keySequence.slice(leaderKey.length));
  }

  for (const v of variants) {
    if (userKeymaps[`${mode}:${v}`] !== undefined) {
      return userKeymaps[`${mode}:${v}`];
    }
    if (userKeymaps[v] !== undefined) {
      return userKeymaps[v];
    }
  }

  return null;
}

/**
 * Checks if the current key sequence is a prefix of any registered keymap.
 */
export function isKeymapPrefix(
  state: VimEditorState,
  mode: 'n' | 'i' | 'v',
  keySequence: string
): boolean {
  const userKeymaps = state.userKeymaps;
  if (!userKeymaps) return false;

  const leaderKey = state.leaderKey || ' ';
  const variants = [keySequence];
  if (keySequence.includes('<leader>')) {
    variants.push(keySequence.replace(/<leader>/gi, leaderKey));
  } else if (keySequence.startsWith(leaderKey)) {
    variants.push('<leader>' + keySequence.slice(leaderKey.length));
  }

  for (const [k] of Object.entries(userKeymaps)) {
    let targetLhs = k;
    let targetMode = 'all';
    if (k.startsWith('n:')) {
      targetMode = 'n';
      targetLhs = k.slice(2);
    } else if (k.startsWith('i:')) {
      targetMode = 'i';
      targetLhs = k.slice(2);
    } else if (k.startsWith('v:')) {
      targetMode = 'v';
      targetLhs = k.slice(2);
    }

    if (targetMode !== 'all' && targetMode !== mode) continue;

    for (const v of variants) {
      if (targetLhs.length > v.length && targetLhs.startsWith(v)) {
        return true;
      }
      if (targetLhs.includes('<leader>')) {
        const expandedLhs = targetLhs.replace(/<leader>/gi, leaderKey);
        if (expandedLhs.length > v.length && expandedLhs.startsWith(v)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Formats user keymaps into a clean Vim-style list string.
 */
export function formatKeymapsList(state: VimEditorState, modeFilter = 'all'): string {
  const userKeymaps = state.userKeymaps ?? {};
  const entries: KeymapEntry[] = [];
  const seen = new Set<string>();

  for (const [rawKey, rhs] of Object.entries(userKeymaps)) {
    let mode = ' ';
    let lhs = rawKey;

    if (rawKey.startsWith('n:')) {
      mode = 'n';
      lhs = rawKey.slice(2);
    } else if (rawKey.startsWith('i:')) {
      mode = 'i';
      lhs = rawKey.slice(2);
    } else if (rawKey.startsWith('v:')) {
      mode = 'v';
      lhs = rawKey.slice(2);
    }

    const keyId = `${mode}:${lhs}:${rhs}`;
    if (seen.has(keyId)) continue;

    if (modeFilter !== 'all' && modeFilter !== 'map') {
      if (mode !== modeFilter && mode !== ' ') continue;
    }

    seen.add(keyId);
    entries.push({ mode, lhs, rhs });
  }

  if (entries.length === 0) {
    const modeName =
      modeFilter === 'n'
        ? msg('일반 (Normal)')
        : modeFilter === 'i'
        ? msg('입력 (Insert)')
        : modeFilter === 'v'
        ? msg('비주얼 (Visual)')
        : msg('전체');
    return msg('정의된 {modeName} 키 매핑이 없습니다.', { modeName });
  }

  const lines = [
    msg('--- 키 매핑 목록 ({v}) ---', { v: modeFilter === 'n'
        ? 'Normal'
        : modeFilter === 'i'
        ? 'Insert'
        : modeFilter === 'v'
        ? 'Visual'
        : 'All' }),
    ...entries.map(
      (e) => `${(e.mode === ' ' ? ' ' : e.mode).padEnd(2)} ${e.lhs.padEnd(12)} ${e.rhs}`
    ),
  ];

  return lines.join('\n');
}

/**
 * Registers a keymap into the editor state.
 */
export function registerKeymap(
  state: VimEditorState,
  cmdType: string,
  lhs: string,
  rhs: string
): VimEditorState {
  const cmd = cmdType.toLowerCase();
  let modePrefix = 'all';
  if (cmd.startsWith('i')) modePrefix = 'i';
  else if (cmd.startsWith('n')) modePrefix = 'n';
  else if (cmd.startsWith('v')) modePrefix = 'v';

  const newKeymaps = { ...(state.userKeymaps ?? {}) };
  const leaderKey = state.leaderKey || ' ';

  const variants = [lhs];
  if (lhs.includes('<leader>')) {
    variants.push(lhs.replace(/<leader>/gi, leaderKey));
  } else if (lhs.startsWith(leaderKey)) {
    variants.push('<leader>' + lhs.slice(leaderKey.length));
  }

  if (modePrefix === 'all') {
    for (const v of variants) {
      newKeymaps[`n:${v}`] = rhs;
      newKeymaps[`i:${v}`] = rhs;
      newKeymaps[`v:${v}`] = rhs;
      newKeymaps[v] = rhs;
    }
  } else {
    for (const v of variants) {
      newKeymaps[`${modePrefix}:${v}`] = rhs;
      newKeymaps[v] = rhs;
    }
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    userKeymaps: newKeymaps,
    commandMessage: msg('[키매핑 등록] {cmd}: {lhs} -> {rhs}', { cmd, lhs, rhs }),
  };
}

/**
 * Unregisters a keymap from the editor state.
 */
export function unregisterKeymap(
  state: VimEditorState,
  cmdType: string,
  lhs: string
): VimEditorState {
  const cmd = cmdType.toLowerCase();
  let modePrefix = 'all';
  if (cmd.startsWith('i')) modePrefix = 'i';
  else if (cmd.startsWith('n')) modePrefix = 'n';
  else if (cmd.startsWith('v')) modePrefix = 'v';

  const newKeymaps = { ...(state.userKeymaps ?? {}) };
  const leaderKey = state.leaderKey || ' ';
  const variants = [lhs];
  if (lhs.includes('<leader>')) {
    variants.push(lhs.replace(/<leader>/gi, leaderKey));
  } else if (lhs.startsWith(leaderKey)) {
    variants.push('<leader>' + lhs.slice(leaderKey.length));
  }

  let deletedCount = 0;
  for (const v of variants) {
    if (modePrefix === 'all') {
      if (newKeymaps[`n:${v}`]) {
        delete newKeymaps[`n:${v}`];
        deletedCount++;
      }
      if (newKeymaps[`i:${v}`]) {
        delete newKeymaps[`i:${v}`];
        deletedCount++;
      }
      if (newKeymaps[`v:${v}`]) {
        delete newKeymaps[`v:${v}`];
        deletedCount++;
      }
      if (newKeymaps[v]) {
        delete newKeymaps[v];
        deletedCount++;
      }
    } else {
      if (newKeymaps[`${modePrefix}:${v}`]) {
        delete newKeymaps[`${modePrefix}:${v}`];
        deletedCount++;
      }
      if (newKeymaps[v]) {
        delete newKeymaps[v];
        deletedCount++;
      }
    }
  }

  if (deletedCount === 0) {
    return {
      ...state,
      mode: 'NORMAL',
      commandBuffer: undefined,
      commandType: undefined,
      commandMessage: msg('E31: 매핑을 찾을 수 없습니다: {lhs}', { lhs }),
    };
  }

  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    userKeymaps: newKeymaps,
    commandMessage: msg('[키매핑 해제] {cmd}: {lhs}', { cmd, lhs }),
  };
}
