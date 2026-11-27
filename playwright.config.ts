import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * 실제 브라우저(Chromium)에서 프로덕션 빌드를 띄워 키 입력·IME·화면 흐름을 검사합니다.
 * vitest(jsdom)와 겹치지 않도록 테스트 파일은 e2e/*.e2e.ts 로 둡니다.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/VimPracticeOnWeb/`,
    trace: 'retain-on-failure',
    locale: 'ko-KR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/VimPracticeOnWeb/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
