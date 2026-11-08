import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/** AI 에이전트 규약 문서는 CLAUDE.md 와 AGENTS.md 두 곳에 같은 내용으로 있어야 합니다. (npm run sync:docs) */
describe('agent docs', () => {
  it('keeps CLAUDE.md and AGENTS.md identical', () => {
    const root = path.resolve(__dirname, '..');
    const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents === claude, 'CLAUDE.md 와 AGENTS.md 가 다릅니다. npm run sync:docs 를 실행하세요.').toBe(true);
  });
});
