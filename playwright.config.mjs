import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'E:/四六级真题/work/app-test-results',
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chrome', headless: true, locale: 'zh-CN' },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { viewport: { width: 1180, height: 820 }, hasTouch: true } },
  ],
  webServer: { command: 'npm run dev:h5 -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 90000 },
})
