import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * GitHub 热门仓库按自然日快照（本批功能）。
 *
 * - dayKey 唯一：一天最多拉取一次 Search API，读路径懒刷新，upsert 幂等。
 * - repos 为白名单契约的 jsonb 数组（字段显式挑选，绝不透传原始 API 行）。
 * - 保留最近 7 天：旧行在后台刷新成功后顺手清理（best-effort），无定时任务。
 */
export const githubTrendingDays = pgTable(
  'github_trending_days',
  {
    /** UTC 自然日，格式 YYYY-MM-DD（与 ai_daily_usage 同键语义）。 */
    dayKey: text('day_key').primaryKey(),
    repos: jsonb('repos').$type<TrendingRepo[]>().notNull().default([]),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('github_trending_days_fetched_idx').on(table.fetchedAt)],
)

/** 对外白名单契约（Search API item 的显式字段挑选）。 */
export interface TrendingRepo {
  fullName: string
  htmlUrl: string
  description: string | null
  language: string | null
  stargazersCount: number
  forksCount: number
  /** 可选：与电子书最相关阶段的 slug（embed 相似度标注，未配置/失败时不写入）。 */
  relatedStageSlug?: string
  relatedStageTitle?: string
}

export type GithubTrendingDayRow = typeof githubTrendingDays.$inferSelect
