import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * SPEC §4：公开 id 一律 UUID v4；非法 UUID 在访问数据库前转 404，
 * 避免 PostgreSQL 类型错误泄漏成 500。
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * 通用物理列约定（D12）：snake_case 物理列，TS 侧 camelCase 由 Drizzle schema 映射。
 * 仅在 base.ts 定义，其余 schema 文件通过展开复用，禁止在别处重复定义通用列。
 */
export const baseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * id 映射表骨架（SPEC §4）：为后续 Mongo ObjectId → UUID 历史链接兼容预留。
 * 第一批只建表与导入骨架，不实际迁入数据。
 */
export const idMigrations = pgTable('id_migrations', {
  legacyId: text('legacy_id').primaryKey(),
  newId: uuid('new_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
