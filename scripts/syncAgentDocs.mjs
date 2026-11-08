#!/usr/bin/env node
/**
 * CLAUDE.md 와 AGENTS.md 를 항상 같은 내용으로 맞춥니다.
 *
 * Claude 는 CLAUDE.md, Gemini·Antigravity 등은 AGENTS.md 를 읽고 고치므로
 * 한쪽만 바뀌었으면 그 내용을 다른 쪽에 복사합니다. (마지막 커밋과 비교해 바뀐 쪽을 판단)
 * 둘 다 바뀌었으면 가장 최근에 저장된 파일을 기준으로 합니다.
 *
 *   node scripts/syncAgentDocs.mjs          동기화 (git pre-commit 훅, npm run sync:docs)
 *   node scripts/syncAgentDocs.mjs --check  다르면 실패만 함
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['CLAUDE.md', 'AGENTS.md'];
const check = process.argv.includes('--check');

const read = (name) => {
  const file = path.join(ROOT, name);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

const committed = (name) => {
  try {
    return execFileSync('git', ['show', `HEAD:${name}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const [claudeName, agentsName] = FILES;
const claude = read(claudeName);
const agents = read(agentsName);

if (claude === agents) process.exit(0);

if (check) {
  console.error(`${claudeName} 와 ${agentsName} 내용이 다릅니다. npm run sync:docs 로 맞추세요.`);
  process.exit(1);
}

const claudeChanged = claude !== null && claude !== committed(claudeName);
const agentsChanged = agents !== null && agents !== committed(agentsName);

let source;
if (agents === null || (claudeChanged && !agentsChanged)) source = claudeName;
else if (claude === null || (agentsChanged && !claudeChanged)) source = agentsName;
else {
  // 둘 다 커밋 이후 바뀌었으면 (한 번 동기화한 뒤 다시 고친 경우) 가장 최근에 저장된 파일이 기준입니다.
  const mtime = (name) => statSync(path.join(ROOT, name)).mtimeMs;
  source = mtime(claudeName) >= mtime(agentsName) ? claudeName : agentsName;
}

const target = source === claudeName ? agentsName : claudeName;
writeFileSync(path.join(ROOT, target), read(source));
console.log(`[sync:docs] ${source} → ${target}`);
