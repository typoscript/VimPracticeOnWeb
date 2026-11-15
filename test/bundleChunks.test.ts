// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveManualChunk } from '../vite.config';

const ENGINE_DATA_FILES = ['spellData.ts', 'helpData.ts', 'messagesEn.ts'];

describe('Vite 번들 청크 분리 규칙 (resolveManualChunk)', () => {
  it('맞춤법·도움말·영문 메시지 정적 데이터는 vim-engine-data 청크로 분리한다', () => {
    for (const file of ENGINE_DATA_FILES) {
      expect(resolveManualChunk(`/repo/src/vim-engine/${file}`)).toBe('vim-engine-data');
      expect(resolveManualChunk(`C:\\repo\\src\\vim-engine\\${file}`)).toBe('vim-engine-data');
    }
  });

  it('나머지 vim-engine 모듈은 vim-engine 청크로 묶인다', () => {
    expect(resolveManualChunk('/repo/src/vim-engine/normalMode.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/spellEngine.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/helpEngine.ts')).toBe('vim-engine');
    expect(resolveManualChunk('/repo/src/vim-engine/messages.ts')).toBe('vim-engine');
  });

  it('vim-engine-data 모듈은 다른 엔진 파일을 import 하지 않는다 (순환 청크 방지)', () => {
    const engineDir = path.resolve(__dirname, '..', 'src', 'vim-engine');
    for (const file of ENGINE_DATA_FILES) {
      const source = fs.readFileSync(path.join(engineDir, file), 'utf8');
      expect(source).not.toMatch(/(?:import|export)\s[^'"]*?from\s+['"]\.\/[^'"]+['"]/);
    }
  });

  it('react-vendor·i18n-en·curriculum 청크와 일반 앱 파일을 올바르게 구분한다', () => {
    expect(resolveManualChunk('/repo/node_modules/react/index.js')).toBe('react-vendor');
    expect(resolveManualChunk('/repo/node_modules/react-dom/client.js')).toBe('react-vendor');
    expect(resolveManualChunk('/repo/src/i18n/en.ts')).toBe('i18n-en');
    expect(resolveManualChunk('/repo/src/i18n/enContent.ts')).toBe('i18n-en');
    expect(resolveManualChunk('/repo/src/data/missions.ts')).toBe('curriculum');
    expect(resolveManualChunk('/repo/src/App.tsx')).toBeUndefined();
  });
});
