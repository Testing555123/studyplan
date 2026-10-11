// 程序化执行 drizzle 迁移，仅依赖运行时依赖（drizzle-orm + pg），
// 适用于精简后的 standalone 镜像（镜像内无 drizzle-kit / pnpm）。
// 等价替代 `pnpm db:migrate`，但无需构建期工具链。
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[migrate] DATABASE_URL 未设置，无法执行迁移')
  process.exit(1)
}

const pool = new Pool({ connectionString, max: 1 })
const db = drizzle(pool)

try {
  // 确保迁移元数据 schema 存在（首次迁移建表前）。
  await pool.query('CREATE SCHEMA IF NOT EXISTS drizzle')
  console.log('[migrate] 正在应用 drizzle/ 下的迁移...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[migrate] 迁移完成')
} catch (err) {
  console.error('[migrate] 迁移失败：', err)
  await pool.end()
  process.exit(1)
}

await pool.end()
