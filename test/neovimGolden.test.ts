import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { handleKey } from '../src/vim-engine';
import { withInvariantCheck } from '../src/vim-engine';
import { VimEditorState } from '../src/vim-engine';
import { GoldenTestCase } from '../scripts/generateGoldenTests';

/**
 * Neovim 키 시퀀스 표기법 (예: "cwfoo<Esc>", "3gg", "\"ayiw")을
 * 엔진에 전달할 개별 키 입력 배열로 파싱합니다.
 */
export function parseVimKeyTokens(keySequence: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < keySequence.length) {
    if (keySequence[i] === '<') {
      const closeIdx = keySequence.indexOf('>', i);
      if (closeIdx !== -1) {
        const tag = keySequence.slice(i, closeIdx + 1).toLowerCase();
        if (tag === '<esc>') {
          tokens.push('Escape');
          i = closeIdx + 1;
          continue;
        } else if (tag === '<cr>' || tag === '<enter>') {
          tokens.push('Enter');
          i = closeIdx + 1;
          continue;
        } else if (tag === '<space>') {
          tokens.push(' ');
          i = closeIdx + 1;
          continue;
        }
      }
    }

    tokens.push(keySequence[i]);
    i++;
  }

  return tokens;
}

const fixturePath = path.resolve(process.cwd(), 'test/fixtures/neovim-golden-cases.json');
const goldenCases: GoldenTestCase[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

// Invariant Guard가 강제된 엔진 래퍼 생성
const engineWithInvariants = withInvariantCheck(handleKey, { deepFreeze: true });

describe('Neovim Golden Differential Test Suite', () => {
  it(`successfully loaded all ${goldenCases.length} golden cases`, () => {
    expect(goldenCases.length).toBeGreaterThanOrEqual(60);
  });

  goldenCases.forEach((tc, idx) => {
    it(`[#${idx + 1}] (${tc.category}) ${tc.id}: ${tc.description}`, () => {
      let state: VimEditorState = {
        lines: tc.initialText.split('\n'),
        cursor: { line: tc.startCursor.row, col: tc.startCursor.col },
        mode: 'NORMAL',
        undoStack: [],
        redoStack: [],
        registers: {},
      };

      const tokens = parseVimKeyTokens(tc.keys);

      for (const k of tokens) {
        state = engineWithInvariants(state, k);
      }

      // 1. 버퍼 텍스트 비교
      expect(
        state.lines,
        `[Buffer Mismatch in ${tc.id}] keys: '${tc.keys}'\nInitial:\n${tc.initialText}\nExpected lines: ${JSON.stringify(tc.expected.lines)}\nReceived lines: ${JSON.stringify(state.lines)}`
      ).toEqual(tc.expected.lines);

      // 2. 커서 줄(row) 비교
      expect(
        state.cursor.line,
        `[Cursor Row Mismatch in ${tc.id}] keys: '${tc.keys}'\nExpected row: ${tc.expected.cursor.row}, Got: ${state.cursor.line}`
      ).toBe(tc.expected.cursor.row);

      // 3. 커서 열(col) 비교
      expect(
        state.cursor.col,
        `[Cursor Col Mismatch in ${tc.id}] keys: '${tc.keys}'\nLine: '${state.lines[state.cursor.line]}'\nExpected col: ${tc.expected.cursor.col}, Got: ${state.cursor.col}`
      ).toBe(tc.expected.cursor.col);
    });
  });
});
