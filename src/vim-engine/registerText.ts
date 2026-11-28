import type { RegisterEntry } from './types';

/**
 * 녹화한 매크로 키와 레지스터 텍스트 사이의 변환 (Vim 과 같은 실제 바이트).
 *
 * Vim 은 `qa…q` 로 녹화한 키를 문자 단위 텍스트로 저장합니다. 특수 키는 표기(`<Esc>`)가 아니라
 * 실제 글자(ESC = `\x1b`, Enter = `\r`, Ctrl-w = `\x17`)이고, 글자가 없는 키는 K_SPECIAL(`\x80`)
 * 뒤 두 글자 코드입니다(`<BS>` = `\x80kb`). 그래서 `"ap` 는 ESC 글자를 붙여 넣고 화면에는 `^[` 로 보이며,
 * 손으로 친 `<Esc>` 다섯 글자를 `@a` 로 실행하면 `<`, `E`, `s`, `c`, `>` 를 차례로 입력합니다.
 */

/** 글자가 없는 특수 키의 Vim 터미널 코드 (`\x80` 뒤 두 글자). */
const SPECIAL_KEY_CODES: Record<string, string> = {
  Backspace: 'kb',
  Delete: 'kD',
  ArrowUp: 'ku',
  ArrowDown: 'kd',
  ArrowLeft: 'kl',
  ArrowRight: 'kr',
  Home: 'kh',
  End: '@7',
  PageUp: 'kP',
  PageDown: 'kN',
  Insert: 'kI',
  'Shift-Tab': 'kB',
};
const SPECIAL_CODE_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(SPECIAL_KEY_CODES).map(([k, v]) => [v, k])
);

/** 키 이름 하나를 레지스터에 저장되는 실제 텍스트로 바꿉니다. */
export function macroKeyToRegisterText(key: string): string {
  if (key.length === 1) return key;
  if (key === 'Escape') return '\x1b';
  if (key === 'Enter') return '\r';
  if (key === 'Tab') return '\t';
  if (key === 'Space') return ' ';
  const code = SPECIAL_KEY_CODES[key];
  if (code) return `\x80${code}`;
  const ctrl = key.match(/^Ctrl[-+](.)$/);
  if (ctrl) {
    const ch = ctrl[1];
    const upper = ch.toUpperCase();
    const c = upper.charCodeAt(0);
    // Ctrl-@ … Ctrl-_ (A-Z, [ \ ] ^ _) 는 제어 문자 하나입니다. Ctrl-@(NUL) 은 Vim 레지스터에서도 따로 표기합니다.
    if (c >= 0x41 && c <= 0x5f) return String.fromCharCode(c & 0x1f);
    if (ch === '?') return '\x7f';
  }
  // 그 밖의 키(Ctrl-Space, Alt-j, F1 …)는 K_SPECIAL 뒤에 키 표기를 붙여 둡니다 (화면에는 `<80><C-Space>`).
  return `\x80<${key}>`;
}

/** 녹화한 키 배열을 Vim 레지스터 텍스트로 바꿉니다 (`['A', '!', 'Escape', 'j']` → `"A!\x1bj"`). */
export function macroKeysToRegisterText(keys: readonly string[]): string {
  return keys.map(macroKeyToRegisterText).join('');
}

/**
 * 레지스터 텍스트를 `@a` 가 입력할 키 배열로 바꿉니다 (Vim 과 같음).
 * 실제 제어 글자만 특수 키가 되고, 손으로 친 `<Esc>` 같은 표기는 그대로 글자들입니다.
 */
export function registerTextToKeys(text: string): string[] {
  const keys: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\x80') {
      const two = text.slice(i + 1, i + 3);
      const special = SPECIAL_CODE_TO_KEY[two];
      if (special) {
        keys.push(special);
        i += 3;
        continue;
      }
      if (text[i + 1] === '<') {
        const end = text.indexOf('>', i + 2);
        if (end > i + 2) {
          keys.push(text.slice(i + 2, end));
          i = end + 1;
          continue;
        }
      }
      keys.push(ch);
      i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (ch === '\x1b') keys.push('Escape');
    else if (ch === '\r' || ch === '\n') keys.push('Enter');
    else if (ch === '\t') keys.push('Tab');
    else if (ch === '\x08') keys.push('Backspace');
    else if (code >= 1 && code <= 0x1a) keys.push(`Ctrl-${String.fromCharCode(code + 0x60)}`);
    else if (code >= 0x1c && code <= 0x1f) keys.push(`Ctrl-${String.fromCharCode(code + 0x40)}`);
    else keys.push(ch);
    i++;
  }
  return keys;
}

/** 레지스터 항목의 텍스트 (녹화한 매크로는 실제 바이트로). */
export function registerEntryText(entry: RegisterEntry): string {
  if (!Array.isArray(entry.content)) return entry.content;
  return entry.type === 'macro' ? macroKeysToRegisterText(entry.content) : entry.content.join('');
}

/** 글자 하나가 Vim 화면에서 `^X`/`<80>` 처럼 특수 표기로 보이는 제어 글자인지 (탭 제외). */
export function isControlChar(ch: string): boolean {
  if (ch.length !== 1 || ch === '\t' || ch === '\n') return false;
  const c = ch.charCodeAt(0);
  return c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f);
}

/**
 * 제어 글자를 Vim 화면 표기로 바꿉니다 (Vim `transchar`): ESC → `^[`, CR → `^M`, DEL → `^?`, `\x80` → `<80>`.
 * 제어 글자가 아니면 그대로 돌려줍니다.
 */
export function controlCharDisplay(ch: string): string {
  if (!isControlChar(ch)) return ch;
  const c = ch.charCodeAt(0);
  if (c < 0x20) return `^${String.fromCharCode(c + 0x40)}`;
  if (c === 0x7f) return '^?';
  return `<${c.toString(16)}>`;
}

/** 문자열의 제어 글자를 모두 Vim 화면 표기로 바꿉니다 (`:registers`, 레지스터 인스펙터). 줄바꿈은 `^J`. */
export function toPrintableRegisterText(text: string): string {
  let out = '';
  for (const ch of text) out += ch === '\n' ? '^J' : controlCharDisplay(ch);
  return out;
}

/** 키 표기 `<...>` 안쪽 이름(`Esc`, `CR`, `C-w`, `BS`)을 엔진 키 이름으로 바꿉니다. 모르는 이름은 null. */
export function keyNotationToKey(name: string): string | null {
  const tag = name.toLowerCase();
  if (tag === 'esc' || tag === 'escape') return 'Escape';
  if (tag === 'cr' || tag === 'enter' || tag === 'return') return 'Enter';
  if (tag === 'nl') return 'Ctrl-j';
  if (tag === 'tab') return 'Tab';
  if (tag === 'space') return ' ';
  if (tag === 'bs' || tag === 'backspace') return 'Backspace';
  if (tag === 'del') return 'Delete';
  if (tag === 'lt') return '<';
  if (tag === 'bar') return '|';
  if (tag === 'bslash') return '\\';
  if (tag === 'up' || tag === 'down' || tag === 'left' || tag === 'right') {
    return `Arrow${tag[0].toUpperCase()}${tag.slice(1)}`;
  }
  const ctrl = tag.match(/^c(?:trl)?-(.)$/);
  if (ctrl) return `Ctrl-${ctrl[1]}`;
  return null;
}
