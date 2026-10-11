import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * AI 答案缓存与每日额度（T11 / SPEC §8.3、§8.4）。
 *
 * - 禁数据库 TTL 索引与定时清理：过期判定放**读路径**（now > expiresAt 即视为未命中）。
 * - 缓存键不含用户 id（同一问题全局共享一份答案），但**必须含模型名**（v2.0 缺陷修正）。
 * - 额度按自然日（UTC 日期串）成键，日期变更自然清零，无重置任务；计数走原子 upsert。
 */
export const aiAnswerCache = pgTable(
  'ai_answer_cache',
  {
    /** sha256(问题 + 上下文 + 模型).slice(0,32)。 */
    cacheKey: text('cache_key').primaryKey(),
    model: text('model').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    /** 检索来源（JSON 序列化），便于命中缓存时仍可展示引用。 */
    sources: jsonb('sources').$type<{ slug: string; title: string; chunkIndex: number }[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('ai_answer_cache_expires_idx').on(table.expiresAt)],
)

export const aiDailyUsage = pgTable('ai_daily_usage', {
  /** UTC 自然日，格式 YYYY-MM-DD。 */
  dayKey: text('day_key').primaryKey(),
  count: integer('count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AiAnswerCacheRow = typeof aiAnswerCache.$inferSelect
export type AiDailyUsageRow = typeof aiDailyUsage.$inferSelect
