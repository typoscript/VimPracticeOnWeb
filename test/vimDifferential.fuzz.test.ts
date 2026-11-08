import { describe, it, expect } from 'vitest';
import { runDifferentialCheck } from './oracle/codemirrorOracle';
import { handleKey } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';

/**
 * CodeMirror Vim 오라클이 실제 Vim 과 다르게 동작하는 퍼징 케이스는 실제 Neovim(nvim --headless -u NONE)
 * 으로 확인한 결과와 비교합니다. (시드가 고정되어 있어 케이스 번호와 키 시퀀스는 항상 같습니다)
 */
const NEOVIM_VERIFIED_CASES: Record<number, { keys: string; lines: string[]; cursor: { line: number; col: number } }> = {
  // 3ggdi{yyP: 여러 줄 di{ 는 { 줄과 } 줄을 남깁니다 (CodeMirror 는 한 줄로 합침)
  82: {
    keys: '3 g g d i { y y P',
    lines: ['class UserManager {', '  getUser(id) {', '  }', '  }', '}'],
    cursor: { line: 2, col: 2 },
  },
};

/**
 * 시드 기반 의사 난수 생성기 (재현 가능한 퍼징 테스트용)
 */
class PseudoRandom {
  private state: number;

  constructor(seed = 123456789) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  intBetween(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/**
 * 무작위 유효 Vim 명령 시퀀스 생성기
 */
function generateRandomVimCommands(rng: PseudoRandom, numCommands = 5): string[] {
  const motions = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '^', '$', 'gg', 'G', '%'];
  const textChars = ['a', 'e', 'i', 'o', 'u', 't', 's', '"', '(', '{', ',', ';', '='];
  const textObjects = ['iw', 'aw', 'i"', 'a"', 'i(', 'a(', 'i{', 'a{'];

  const sequence: string[] = [];

  for (let c = 0; c < numCommands; c++) {
    const actionType = rng.intBetween(1, 6);

    switch (actionType) {
      // 1. 단일/카운트 모션 (예: 2w, $, 0, 2j, k)
      case 1: {
        const useCount = rng.next() > 0.6;
        if (useCount) {
          sequence.push(String(rng.intBetween(2, 4)));
        }
        const m = rng.choice(motions);
        if (m === 'gg') {
          sequence.push('g', 'g');
        } else {
          sequence.push(m);
        }
        break;
      }

      // 2. 문자 탐색 점프 (f{c}, t{c}, F{c})
      case 2: {
        const fKey = rng.choice(['f', 't', 'F']);
        const targetChar = rng.choice(textChars);
        sequence.push(fKey);
        sequence.push(targetChar);
        break;
      }

      // 3. 삭제 연산자 조합 (dw, de, d$, d0, dd, diw, daw, di", da()
      case 3: {
        sequence.push('d');
        const dTargetChoice = rng.intBetween(1, 4);
        if (dTargetChoice === 1) {
          sequence.push('d'); // dd
        } else if (dTargetChoice === 2) {
          sequence.push(rng.choice(['w', 'e', '$', '0']));
        } else {
          const tobj = rng.choice(textObjects);
          sequence.push(tobj[0]); // 'i' or 'a'
          sequence.push(tobj[1]); // target char
        }
        break;
      }

      // 4. 변경 연산자 조합 (cw, ce, ciw, caw, c$, c0 -> 텍스트 삽입 -> Escape)
      case 4: {
        sequence.push('c');
        const cTargetChoice = rng.choice(['w', 'e', '$', '0', 'iw', 'aw']);
        for (const ch of cTargetChoice) {
          sequence.push(ch);
        }
        // Insert 모드에서 짧은 단어 입력 후 Escape
        const insertWord = rng.choice(['foo', 'bar', 'val', 'X']);
        for (const ch of insertWord) {
          sequence.push(ch);
        }
        sequence.push('Escape');
        break;
      }

      // 5. 문자 삭제 및 단일 조작 (x, r{c}, .)
      case 5: {
        const sub = rng.intBetween(1, 3);
        if (sub === 1) {
          sequence.push('x');
        } else if (sub === 2) {
          sequence.push('r');
          sequence.push(rng.choice(['x', 'y', 'z', '_']));
        } else {
          sequence.push('.');
        }
        break;
      }

      // 6. 복사(y) 및 붙여넣기(p)
      case 6: {
        const yChoice = rng.choice(['yy', 'yw', 'ye', 'y$']);
        for (const ch of yChoice) {
          sequence.push(ch);
        }
        sequence.push(rng.choice(['p', 'P']));
        break;
      }
    }
  }

  return sequence;
}

const CORPUS_TEXTS = [
  'const greeting = "hello world";\nconst count = 42;\nreturn greeting;',
  'function calculateTotal(items) {\n  let sum = 0;\n  for (let i = 0; i < items.length; i++) {\n    sum += items[i].price;\n  }\n  return sum;\n}',
  'class UserManager {\n  getUser(id) {\n    return { id: id, name: "Alice" };\n  }\n}',
  'first line\n\nthird line after empty\nfourth line with words',
  'alpha beta gamma delta epsilon zeta eta theta',
];

describe('Vim Differential Fuzzer: Random Command Combinations', () => {
  const rng = new PseudoRandom(20261101);
  const TOTAL_FUZZ_ITERATIONS = 100;

  for (let i = 1; i <= TOTAL_FUZZ_ITERATIONS; i++) {
    const text = rng.choice(CORPUS_TEXTS);
    const numCmds = rng.intBetween(3, 7);
    const keys = generateRandomVimCommands(rng, numCmds);

    it(`Fuzz Test #${i}: ${keys.slice(0, 6).join(' ')}${keys.length > 6 ? '...' : ''}`, () => {
      const verified = NEOVIM_VERIFIED_CASES[i];
      if (verified) {
        // 시드가 바뀌어 다른 키 시퀀스가 나오면 이 예외 목록도 다시 확인해야 합니다
        expect(keys.join(' ')).toBe(verified.keys);
        const start: VimEditorState = { lines: text.split('\n'), cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
        const end = keys.reduce((s, k) => handleKey(s, k), start);
        expect(end.lines).toEqual(verified.lines);
        expect(end.cursor).toEqual(verified.cursor);
        return;
      }

      const res = runDifferentialCheck(text, keys);

      if (!res.passed) {
        // 불일치 감지 시 문제 리포트 출력 및 즉시 테스트 실패
        console.error(res.mismatch?.diffReport);
      }

      expect(res.passed, res.mismatch?.diffReport).toBe(true);
    });
  }
});
