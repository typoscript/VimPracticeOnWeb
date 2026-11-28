/** 퍼저·테스트가 함께 쓰는 Neovim 키 표기 → 엔진 키 변환 */
const SPECIAL: Record<string, string> = {
  '<Esc>': 'Escape',
  '<CR>': 'Enter',
  '<BS>': 'Backspace',
  '<C-a>': 'Ctrl-a',
  '<C-x>': 'Ctrl-x',
  '<C-r>': 'Ctrl-r',
  '<C-v>': 'Ctrl-v',
  '<C-w>': 'Ctrl-w',
  '<C-u>': 'Ctrl-u',
  '<C-o>': 'Ctrl-o',
  '<C-t>': 'Ctrl-t',
  '<C-d>': 'Ctrl-d',
};

export function toEngineKeys(notation: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < notation.length; i++) {
    const tag = Object.keys(SPECIAL).find((t) => notation.startsWith(t, i));
    if (tag) {
      keys.push(SPECIAL[tag]);
      i += tag.length - 1;
    } else {
      keys.push(notation[i]);
    }
  }
  return keys;
}

