import { defineConfig, devices } from '@playwright/test'

/**
 * T15 端到端冒烟配置（Playwright）。
 * - testDir 指向 tests/e2e（与 Vitest 的 *.test.ts 互不干扰）。
 * - webServer 启动应用后等待根路径就绪；CI 下不复用既有服务，本地可复用。
 * - baseURL 可被 BASE_URL 覆盖，便于对本地/容器同一端点跑同一套用例（V6）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.BASE_URL ? 'pnpm start' : 'pnpm dev',
    url: process.env.BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
