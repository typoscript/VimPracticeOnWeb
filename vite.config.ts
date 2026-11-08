/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // 프로덕션 빌드(GitHub Pages 배포) 시 '/VimPracticeOnWeb/', 로컬 개발/테스트 시에는 '/' 사용
  base: mode === 'production' ? '/VimPracticeOnWeb/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React 는 앱 코드와 따로 묶어 배포마다 바뀌지 않는 장기 캐시 청크로 둡니다
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          // 독립 모듈인 Vim 엔진은 앱 코드와 따로 묶어 청크 크기를 나누고 캐시를 분리합니다
          if (id.includes('/src/vim-engine/')) return 'vim-engine';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
}));
