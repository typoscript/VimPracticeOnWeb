/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite/Rollup 프로덕션 번들의 청크 분리 규칙.
 * - 대용량 정적 데이터(spellData·helpData·messagesEn)는 'vim-engine-data' 로 분리합니다.
 * - 순수 코어 기반/스크립트 엔진 레이어는 'vim-engine-core' 로 분리해
 *   엔진 모듈('vim-engine')과 함께 순환 참조 없이 500 kB 미만(여유 폭 150 kB+)으로 유지합니다.
 */
export function resolveManualChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');
  if (/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return 'react-vendor';
  if (/\/src\/vim-engine\/(spellData|helpData|messagesEn)\.ts$/.test(normalized)) return 'vim-engine-data';
  if (
    /\/src\/vim-engine\/(config|types|messages|cursor|vimRegex|vimscriptEval|vimscriptEngine|operators|undoTreeEngine|expressionParser|digraphs|invariants|bracketMatch|wordMotion|vfs)\.ts$/.test(
      normalized
    )
  ) {
    return 'vim-engine-core';
  }
  if (normalized.includes('/src/vim-engine/')) return 'vim-engine';
  // 영어 사전은 영어 모드 진입 시에만 지연 로딩되는 별도 청크로 분리합니다
  if (/\/src\/i18n\/en(Content)?\.ts$/.test(normalized)) return 'i18n-en';
  // 레슨 커리큘럼 데이터는 앱 로직과 별도 캐시 청크로 분리합니다
  if (/\/src\/data\/missions\.ts$/.test(normalized)) return 'curriculum';
  return undefined;
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // 프로덕션 빌드(GitHub Pages 배포) 시 '/VimPracticeOnWeb/', 로컬 개발/테스트 시에는 '/' 사용
  base: mode === 'production' ? '/VimPracticeOnWeb/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React·엔진 코어·대용량 정적 데이터·커리큘럼·영문 사전을 장기 캐시용 청크로 분리합니다
        manualChunks: resolveManualChunk,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
