import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  retries: 0,
  // TC-5 / TC-6 链式依赖 shared state（见 e2e/api/shared-state.ts），必须串行
  workers: 1,
  fullyParallel: false,
  // 纯 API 测试文件不需要浏览器；通过匹配 /e2e/api/ 子目录单独配置
  projects: [
    {
      name: 'api',
      testMatch: /e2e\/api\/.*\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8000',
      },
    },
    {
      name: 'chromium',
      testIgnore: /e2e\/api\/.*\.spec\.ts/,
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5173',
        headless: false,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        viewport: { width: 1440, height: 900 },
        launchOptions: { slowMo: 500 },
      },
    },
  ],
});
