import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Lua 스크립트(`_G.arg[1]` = 케이스 배열 JSON, `_G.arg[2]` = 결과 배열 JSON)를 케이스마다 새 `nvim --headless`
 * 프로세스로 실행합니다. 한 프로세스에서 여러 케이스를 돌리면 이름 있는 레지스터·`.` 반복·마지막 입력 텍스트
 * 같은 상태가 다음 케이스로 새어, 엔진 문제가 아닌 차이가 섞였습니다. 프로세스는 CPU 수만큼 동시에 띄웁니다.
 */
export async function runNeovimIsolated<C, R>(lua: string, cases: readonly C[], concurrency = os.cpus().length): Promise<R[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvimrun-'));
  const luaFile = path.join(dir, 'run.lua');
  fs.writeFileSync(luaFile, lua);
  const results: R[] = new Array(cases.length);
  let next = 0;

  const runOne = (index: number) =>
    new Promise<void>((resolve, reject) => {
      const inFile = path.join(dir, `in-${index}.json`);
      const outFile = path.join(dir, `out-${index}.json`);
      fs.writeFileSync(inFile, JSON.stringify([cases[index]]));
      const child = spawn(process.env.NVIM_PATH ?? 'nvim', ['--headless', '-u', 'NONE', '-i', 'NONE', '-l', luaFile, inFile, outFile], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
      child.on('error', reject);
      child.on('exit', () => {
        clearTimeout(timer);
        try {
          const out = JSON.parse(fs.readFileSync(outFile, 'utf8')) as R[];
          results[index] = out[0];
          resolve();
        } catch (err) {
          reject(new Error(`nvim produced no result for case ${index}: ${String(err)}`));
        }
      });
    });

  const worker = async () => {
    while (next < cases.length) {
      const index = next++;
      await runOne(index);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, cases.length)) }, worker));
    return results;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
