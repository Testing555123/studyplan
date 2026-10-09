import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '@app/shared': fileURLToPath(new URL('./packages/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 测试环境注入最小环境变量，避免 @app/shared/env 在 import 期因缺 DATABASE_URL 抛错。
    env: {
      DATABASE_URL: 'postgresql://studyplan:studyplan@localhost:5433/studyplan',
      BETTER_AUTH_SECRET: 'test-secret',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    },
    // Windows 上并行跑容易出现转译缓存写竞争（v2.0 提交 5b5ba7a / 5ce3ab0 实证），
    // 这里关闭文件级并行，CI 与本地行为一致。
    fileParallelism: false,
  },
})
