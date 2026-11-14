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
          // 영어 사전은 영어 모드 진입 시에만 지연 로딩되는 별도 청크로 분리합니다
          if (/\/src\/i18n\/en(Content)?\.ts$/.test(id)) return 'i18n-en';
          // 레슨 커리큘럼 데이터는 앱 로직과 별도 캐시 청크로 분리합니다
          if (/\/src\/data\/missions\.ts$/.test(id)) return 'curriculum';
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
