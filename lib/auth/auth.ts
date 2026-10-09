import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { account, session, user, verification } from '@/lib/db/schema/auth'
import { parsedEnv } from '@app/shared/env'

/**
 * better-auth 实例（T3）。
 * - 邮箱+密码注册/登录/刷新/登出由 better-auth 处理。
 * - 会话是唯一身份来源（V1）：受保护路由一律经 requireSession() 取身份，绝不读请求体 authorId/role。
 * - nextCookies() 插件（v1.7）：在响应中正确下发会话 Cookie，无需单独的 middleware。
 * - secret 缺失时 better-auth 在开发态自签（生产必须配置 BETTER_AUTH_SECRET）。
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  secret: parsedEnv.BETTER_AUTH_SECRET || undefined,
  baseURL: parsedEnv.BETTER_AUTH_URL || undefined,
  plugins: [nextCookies()],
})
