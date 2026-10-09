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

/** 生成请求级唯一 ID，用于响应体 requestId 与 X-Request-Id 头（§1.1 / §1.2 修正）。 */
export function createRequestId(): string {
  return crypto.randomUUID()
}
