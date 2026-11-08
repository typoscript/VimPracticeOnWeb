import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * vim-engine 이 "이 폴더만 복사하면 쓸 수 있는" 독립 모듈로 유지되는지 검사합니다.
 * - 엔진 코드(테스트 제외)는 폴더 밖의 파일·외부 패키지를 import 하지 않습니다.
 * - 브라우저·Node 전용 전역(process, window, document, localStorage)과 import.meta 를 쓰지 않습니다.
 * - 앱 쪽 코드는 엔진 내부 파일이 아닌 index.ts(공개 API)만 import 합니다.
 */

const ENGINE_DIR = path.resolve(__dirname);
const PROJECT_ROOT = path.resolve(ENGINE_DIR, '..', '..');

function engineSourceFiles(): string[] {
  return fs
    .readdirSync(ENGINE_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(ENGINE_DIR, f));
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) specs.push(m[1] ?? m[2]);
  return specs;
}

/** 주석과 문자열 리터럴을 지운 코드 (전역 사용 검사용) */
function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, "''");
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe('vim-engine 모듈 경계', () => {
  it('엔진 코드는 같은 폴더 안의 파일만 import 한다 (외부 패키지·상위 폴더 금지)', () => {
    const violations: string[] = [];
    for (const file of engineSourceFiles()) {
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('./')) violations.push(`${path.basename(file)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('엔진 코드는 process / window / document / localStorage / import.meta 를 쓰지 않는다', () => {
    const forbidden = /(^|[^.\w$])(process|window|document|localStorage|sessionStorage)\s*\.|import\.meta/;
    const violations = engineSourceFiles()
      .filter((file) => forbidden.test(stripCommentsAndStrings(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.basename(file));
    expect(violations).toEqual([]);
  });

  it('앱·테스트 코드는 엔진 내부 파일이 아니라 index.ts(공개 API)만 import 한다', () => {
    const outside = [...walk(path.join(PROJECT_ROOT, 'src')), ...walk(path.join(PROJECT_ROOT, 'test'))].filter(
      (f) => !f.startsWith(ENGINE_DIR + path.sep)
    );
    const violations: string[] = [];
    for (const file of outside) {
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (/vim-engine\/./.test(spec)) violations.push(`${path.relative(PROJECT_ROOT, file)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('공개 API 로 키 입력·Ex 명령·Vim script 를 실행할 수 있다', async () => {
    const api = await import('./index');
    let state = api.createVimState(['hello world']);
    state = api.sendKeys(state, 'dw');
    expect(state.lines).toEqual(['world']);
    state = api.sendKeys(state, 'Afoo<Esc>');
    expect(state.lines).toEqual(['worldfoo']);
    expect(api.runExCommand(state, ':s/o/0/g').lines).toEqual(['w0rldf00']);
    expect(api.evalVimExpression(state, "toupper(getline(1)) . '!'").value).toBe('WORLDFOO!');
    expect(api.createVimState('a\nb').lines).toEqual(['a', 'b']);
  });
});
