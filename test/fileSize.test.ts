import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 프로덕션 소스 파일 줄 수 상한 (CLAUDE.md '파일 크기 규칙').
 * - 상한 1,000줄: 넘으면 이 테스트가 실패합니다. 파일을 나눈 뒤 기존 경로에서 다시 export 하세요.
 * - 권장 800줄: 강제하지 않지만, 800줄이 넘는 파일을 크게 고칠 때 나누기를 함께 검토합니다.
 * 데이터·번역 사전·순수 타입 선언·테스트는 대상이 아닙니다.
 */

export const MAX_SOURCE_LINES = 1000;

const SRC_DIR = path.resolve(__dirname, '..', 'src');

/** 줄 수 제한에서 빼는 파일 (데이터·사전·타입 선언) */
const EXCLUDED_DIRS = ['data', 'i18n'];
const EXCLUDED_FILES = new Set([
  'vim-engine/types.ts',
  'vim-engine/spellData.ts',
  'vim-engine/helpData.ts',
  'vim-engine/messagesEn.ts',
  'vim-engine/wildmenuCatalog.ts',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(SRC_DIR, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (dir === SRC_DIR && EXCLUDED_DIRS.includes(entry.name)) continue;
      out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name) &&
      !EXCLUDED_FILES.has(rel)
    ) {
      out.push(full);
    }
  }
  return out;
}

const lineCount = (file: string) => fs.readFileSync(file, 'utf8').split('\n').length;

describe('소스 파일 크기', () => {
  it(`프로덕션 소스 파일은 ${MAX_SOURCE_LINES}줄을 넘지 않는다`, () => {
    const files = sourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(100);
    const tooLong = files
      .map((file) => ({ file: path.relative(SRC_DIR, file), lines: lineCount(file) }))
      .filter((f) => f.lines > MAX_SOURCE_LINES)
      .sort((a, b) => b.lines - a.lines);
    expect(tooLong, '파일을 나누고 기존 경로에서 다시 export 하세요').toEqual([]);
  });

  it('제외 목록의 파일이 실제로 있다 (이름이 바뀌면 목록도 고치기)', () => {
    for (const rel of EXCLUDED_FILES) {
      expect(fs.existsSync(path.join(SRC_DIR, rel)), rel).toBe(true);
    }
  });
});
