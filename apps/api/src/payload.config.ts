import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { collections } from './collections/index.js'

const connectionString =
  process.env.DATABASE_URI ?? 'postgresql://postgres:postgres@127.0.0.1:5433/payload_dev'

/**
 * Payload Config（方案 A：Payload 主导 schema，Express 只做 HTTP ↔ Local API 转接）
 *
 * ⚠️ 这里【没有】 trustProxy 选项 —— Payload 官方 Config 根本不提供（PoC P2 实测）。
 *    `app.set('trust proxy', …)` 必须在 Express 层做，且要早于本 config 被 init。
 * ⚠️ Payload v3 也已移除内置全局限流（issue #10321），限流全部由
 *    `rate-limiter-flexible` + 自建中间件承担。
 */
export const config = buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? 'dev-only-secret-change-me',
  db: postgresAdapter({
    pool: { connectionString },
    // 偏差 #1 处置（REFACTOR-BATCHES.md）：Payload 默认整型 id（实测 "1"），
    // 会让迁移脚本 oidToUuid 映射与所有 FK 语义错位 —— 必须显式声明 uuid。
    idType: 'uuid',
    // 生产不要 push；本地开发允许直接对齐结构
    push: process.env.NODE_ENV !== 'production',
  }),
  // D4=A：不引入独立 admin 运行时
  admin: { disable: true },
  collections,
  /**
   * ⚠️ 不要在这里传 `logger: { level }` —— 实测会把 Payload 内部的 pino 实例
   *    替换成普通对象，启动时报 `this.logger.warn is not a function`。
   *    日志脱敏（截断 160 字符 + 密钥替换 ***）属于批次 3 的活，
   *    到时候通过 pino 的 redact / 自定义 transport 接，而不是在这里塞配置。
   */
})
