import { drizzle } from 'drizzle-orm/node-postgres'
import { pool } from './config'
import * as schema from './schema'

/** Drizzle 实例（单例）。 */
export const db = drizzle(pool, { schema })

export type Database = typeof db

/**
 * 事务辅助（T1）。回调内使用 tx 执行一系列写操作，原子提交/回滚。
 * tx 在查询 API 上与 db 等价，此处以兼容类型透传。
 */
export async function withTransaction<T>(
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Database))
}

export { vector } from './vector'
export * as schema from './schema'
