// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ENGINE_CHUNK_LAYERS, resolveManualChunk } from '../vite.config';

describe('Vite 번들 청크 분리 규칙 (resolveManualChunk)', () => {
  it('각 엔진 청크 계층 파일들을 지정된 청크 이름으로 매핑한다 (Win/POSIX 경로 모두 지원)', () => {
    for (const layer of ENGINE_CHUNK_LAYERS) {
      for (const file of layer.files) {
        expect(resolveManualChunk(`/repo/src/vim-engine/${file}`)).toBe(layer.name);
        expect(resolveManualChunk(`C:\\repo\\src\\vim-engine\\${file}`)).toBe(layer.name);
      }
    }
  });

  it('상위 모드 디스패처와 공개 엔트리포인트는 vim-engine 청크로 묶인다', () => {
    expect(resolveManualChunk('/repo/src/vim-engine/normalMode.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/normalGPrefix.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/visualMode.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/insertMode.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/vimEngine.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/index.ts')).toBe('vim-engine');
  });

  it('청크 목록에 중복 파일이나 누락된 파일이 없으며 모든 하위 청크는 단방향 비순환 계층을 지킨다', () => {
    const engineDir = path.resolve(__dirname, '..', 'src', 'vim-engine');
    const seen = new Set<string>();
    const allowedModules = new Set<string>();

    for (const layer of ENGINE_CHUNK_LAYERS) {
      for (const file of layer.files) {
        expect(seen.has(file)).toBe(false);
        seen.add(file);
        expect(fs.existsSync(path.join(engineDir, file))).toBe(true);
        allowedModules.add(file.replace(/\.ts$/, ''));
      }

      for (const file of layer.files) {
        const source = fs.readFileSync(path.join(engineDir, file), 'utf8');
        const matches = [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]\.\/([^'"]+)['"]/g)];
        for (const m of matches) {
          expect(allowedModules.has(m[1]), `${layer.name}/${file} -> ./${m[1]}`).toBe(true);
        }
      }
    }
  });

  it('react-vendor·i18n-en·curriculum 청크와 일반 앱 파일을 올바르게 구분한다', () => {
    expect(resolveManualChunk('/repo/node_modules/react/index.js')).toBe('react-vendor');
    expect(resolveManualChunk('/repo/node_modules/react-dom/client.js')).toBe('react-vendor');
    expect(resolveManualChunk('/repo/src/i18n/en.ts')).toBe('i18n-en');
    expect(resolveManualChunk('/repo/src/i18n/enContent.ts')).toBe('i18n-en');
    expect(resolveManualChunk('/repo/src/data/missions.ts')).toBe('curriculum');
    expect(resolveManualChunk('/repo/src/data/missions/part1Basics.ts')).toBe('curriculum');
    expect(resolveManualChunk('/repo/src/App.tsx')).toBeUndefined();
  });

  it('ENGINE_CHUNK_LAYERS 에 테스트 파일(.test.ts)이 포함되지 않고 모든 비테스트 엔진 파일이 유효한 청크로 귀속된다', () => {
    const engineDir = path.resolve(__dirname, '..', 'src', 'vim-engine');
    for (const layer of ENGINE_CHUNK_LAYERS) {
      for (const file of layer.files) {
        expect(file.endsWith('.test.ts')).toBe(false);
      }
    }
    const nonTestFiles = fs
      .readdirSync(engineDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(nonTestFiles.length).toBeGreaterThan(ENGINE_CHUNK_LAYERS.reduce((acc, l) => acc + l.files.length, 0));
    for (const file of nonTestFiles) {
      const chunk = resolveManualChunk(path.join(engineDir, file));
      expect(chunk).toMatch(/^vim-engine/);
    }
  });
});
