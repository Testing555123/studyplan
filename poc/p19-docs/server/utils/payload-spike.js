/**
 * Spike：Payload 3 的 Local API 能否跑在 Nitro 里
 *
 * 用 `buildConfig()` 在 JS 里直接构造配置，而不是让 Payload 去加载 payload.config.ts ——
 * 这样能绕开 Payload 自己的配置文件解析机制，把 spike 的变量减到最少。
 */
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'

const connectionString =
  process.env.DATABASE_URI ?? 'postgresql://postgres:postgres@127.0.0.1:5433/payload_spike'

export const spikeConfig = buildConfig({
  secret: 'spike-secret-do-not-use-in-prod',
  db: postgresAdapter({ pool: { connectionString } }),
  // 关掉 admin：本 spike 只验 Local API，且 D4=A 已裁定不引入 admin 运行时
  admin: { disable: true },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [
        { name: 'email', type: 'email', required: true, unique: true },
        { name: 'username', type: 'text', required: true },
      ],
    },
  ],
})
