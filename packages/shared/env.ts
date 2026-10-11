import { z } from 'zod'

/**
 * 环境校验（SPEC §8.4）。
 * - DATABASE_URL 必填：缺失时校验抛错（T0 验收）。
 * - AI 相关项可选且允许空串：未配 Key 应用照常启动（§6.4 / V5）。
 * - 认证密钥可选：开发态允许为空，由 better-auth 在运行期提示。
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  BETTER_AUTH_SECRET: z.string().default(''),
  BETTER_AUTH_URL: z.string().default(''),
  AI_API_KEY: z.string().default(''),
  AI_BASE_URL: z.string().default(''),
  AI_MODEL: z.string().default(''),
})

export const parsedEnv = envSchema.parse(process.env)

// 生产环境 fail-fast（P1-1 / P1-2）：密钥与回调 URL 必须合规。
// 构建期 `next build` 会令 NODE_ENV=production 但置 NEXT_PHASE=phase-production-build，
// 此处跳过以避免破坏构建；仅在运行时（容器启动）强制校验。
const IS_BUILD = process.env.NEXT_PHASE === 'phase-production-build'
if (!IS_BUILD && parsedEnv.NODE_ENV === 'production') {
  if (!parsedEnv.BETTER_AUTH_SECRET || parsedEnv.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET 生产环境必须注入 ≥32 位随机串')
  }
  if (!/^https:\/\//.test(parsedEnv.BETTER_AUTH_URL)) {
    throw new Error('BETTER_AUTH_URL 生产环境必须为空 https:// 开头的域名')
  }
}

/** 生成请求级唯一 ID，用于响应体 requestId 与 X-Request-Id 头（§1.1 / §1.2 修正）。 */
export function createRequestId(): string {
  return crypto.randomUUID()
}
