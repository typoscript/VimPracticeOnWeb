import { describe, it, expect } from 'vitest';
import { createVimState, handleKey, type VimEditorState } from '../src/vim-engine';
import { getReturnToNormalKeys } from '../src/utils/returnToNormalKeys';

/**
 * 모드·특수 버퍼(Netrw/Oil/터미널/도움말/Neo-tree)·팝업(Harpoon/Yanky/퍼지 파인더)·다중 커서를
 * 무작위로 섞어 실행하며 (1) 불변성 검사(devChecks)가 깨지지 않는지, (2) UI 버튼처럼
 * `getReturnToNormalKeys` 뒤에 Ex 명령을 보냈을 때 실제로 실행되는지 검증합니다.
 */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const EX = [
  'Oil', 'ToggleTerm', 'terminal', 'Neotree', 'help gv', 'Explore', 'e b.ts', 'e src/c.ts', 'bn', 'bp', 'q',
  'HarpoonMenu', 'Trouble', 'Yanks', 'Spectre a z', 'UndotreeToggle', 'Git', 'DapUiToggle', 'GitConflictListQf',
  'copen', 'Snippets', 'set noice', 'MultiCursor foo', 'LiveGrep foo', 'TSJToggle', 'ZenMode', 'LspSymbols',
  'tabnew', 'vsp', 'close', 'Files',
];
const KEYS = [
  'h', 'j', 'k', 'l', 'w', 'b', 'x', 'dd', 'u', 'Ctrl-r', 'i', 'a', 'o', 'Escape', 'v', 'V', 'Ctrl-v', 'gv', 'g;',
  'gi', "'a", 'ma', 'mA', "'A", 'Ctrl-^', 'Ctrl-o', 'Ctrl-i', 'gs', 'g Ctrl-n', 'Ctrl-n', 'Ctrl-x', 'Enter', '-',
  'q', 'Ctrl-\\ Ctrl-n', 'p', 'yy', '.', 'n', '*', 'R', 'gR', 'gh', 'Alt-j', 'crs', 'gS', 'Ctrl-a', ']h', 'zf',
  'za', 'zz', 'Tab', 'Backspace',
];
const SINGLE = new Set(['Escape', 'Enter', 'Tab', 'Backspace']);
const toKeys = (t: string): string[] => {
  if (t === 'g Ctrl-n') return ['g', 'Ctrl-n'];
  if (t === 'Ctrl-\\ Ctrl-n') return ['Ctrl-\\', 'Ctrl-n'];
  if (t.startsWith('Ctrl-') || t.startsWith('Alt-') || SINGLE.has(t)) return [t];
  return t.split('');
};

function initialState(): VimEditorState {
  return {
    ...createVimState(['const foo = 1;', 'foo(a, b);', 'if (x) { y(); }', 'TODO: fix', ''], { line: 0, col: 0 }),
    primaryFilename: 'a.ts',
    virtualFiles: { 'a.ts': ['const foo = 1;'], 'b.ts': ['b1', 'b2 foo'], 'src/c.ts': ['c1'] },
  };
}

describe('모드·특수 버퍼·팝업 조합 퍼즈', () => {
  it('불변성이 깨지지 않고, UI 버튼 키는 항상 NORMAL 에서 실행된다', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 150 && failures.length === 0; seed++) {
      const r = rng(seed);
      let s = initialState();
      const trace: string[] = [];
      for (let step = 0; step < 50; step++) {
        const roll = r();
        let label: string;
        let keys: string[];
        let isChip = false;
        if (roll < 0.2) {
          const c = EX[Math.floor(r() * EX.length)];
          label = `:${c}`;
          keys = [':', ...c.split(''), 'Enter'];
        } else if (roll < 0.3) {
          label = 'UI(:Oil)';
          keys = [...getReturnToNormalKeys(s), ':', 'O', 'i', 'l', 'Enter'];
          isChip = true;
        } else {
          label = KEYS[Math.floor(r() * KEYS.length)];
          keys = toKeys(label);
        }
        trace.push(label);
        try {
          for (const k of keys) s = handleKey(s, k);
        } catch (e) {
          failures.push(`seed=${seed}: ${(e as Error).message}\n  ${trace.join(' | ')}`);
          break;
        }
        if (isChip && !s.oilSession?.isOpen) {
          failures.push(`seed=${seed}: UI 버튼 :Oil 미실행 (mode=${s.mode})\n  ${trace.join(' | ')}`);
          break;
        }
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
