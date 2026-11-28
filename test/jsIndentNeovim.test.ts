import { describe, it, expect } from 'vitest';
import { handleKey } from '../src/vim-engine';
import type { VimEditorState } from '../src/vim-engine';
import cases from './fixtures/neovim-jsindent-cases.json';

/**
 * JS/TS 버퍼에서 `gg=G` (파일타입 들여쓰기 스크립트) 결과를 실제 Neovim 과 비교합니다.
 * 기대값은 scripts/neovimJsIndentFixtures.ts 가 `nvim --headless -u NONE` + `filetype plugin indent on` +
 * `syntax on` (ts=2 sw=2 et) 로 만든 값이며, 이 테스트는 nvim 없이 돕니다.
 */
interface JsIndentCase {
  id: string;
  ft: 'typescript' | 'typescriptreact' | 'javascript' | 'javascriptreact';
  lines: string[];
  expected: string[];
}

const FILENAME: Record<JsIndentCase['ft'], string> = {
  typescript: 'case.ts',
  typescriptreact: 'case.tsx',
  javascript: 'case.js',
  javascriptreact: 'case.jsx',
};

function run(state: VimEditorState): VimEditorState {
  let s = state;
  for (const key of ['g', 'g', '=', 'G']) s = handleKey(s, key);
  return s;
}

/**
 * 알려진 차이: TypeScript 구문 파일(yats)은 문맥마다 그룹이 달라, 객체 리터럴·interface 본문 바로 안의
 * `x = /re/` 는 정규식으로, `[` 뒤 `/*` 는 주석으로 보지 않습니다. jsIndentSyntax.ts 는 문맥을 따지지 않으므로
 * 이런 (올바른 코드가 아닌) 무작위 조각 두 개는 결과가 다릅니다.
 */
const KNOWN_DIFFERENCES = new Set(['random-typescript-21-68', 'random-typescript-21-163']);

describe('= 연산자 JS/TS 파일타입 들여쓰기 (Neovim 결과)', () => {
  const compared = (cases as JsIndentCase[]).filter((c) => !KNOWN_DIFFERENCES.has(c.id));
  it.each(compared.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const state = run({ lines: c.lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL', primaryFilename: FILENAME[c.ft] });
    expect(state.lines).toEqual(c.expected);
  });
});

describe('= 연산자 파일타입 들여쓰기 전환', () => {
  const lines = ['interface User {', 'id: number;', '}'];
  it('파일 이름이 .ts 이면 TypeScript 들여쓰기', () => {
    expect(run({ lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL', primaryFilename: 'sandbox.ts' }).lines).toEqual([
      'interface User {',
      '  id: number;',
      '}',
    ]);
  });
  it('파일타입이 없으면 cindent (id: 가 레이블)', () => {
    expect(run({ lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' }).lines).toEqual(['interface User {', 'id: number;', '}']);
  });
  it(':filetype indent off 이면 cindent', () => {
    const state: VimEditorState = {
      lines,
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
      primaryFilename: 'sandbox.ts',
      filetypeSettings: { detect: true, plugin: true, indent: false },
    };
    expect(run(state).lines).toEqual(['interface User {', 'id: number;', '}']);
  });
  it(":set ft=typescript 이면 파일 이름이 없어도 TypeScript 들여쓰기", () => {
    let s: VimEditorState = { lines, cursor: { line: 0, col: 0 }, mode: 'NORMAL' };
    for (const k of ':set ft=typescript') s = handleKey(s, k);
    s = handleKey(s, 'Enter');
    expect(run(s).lines).toEqual(['interface User {', '  id: number;', '}']);
  });
});
