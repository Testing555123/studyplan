import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiDailyUsage } from '@/lib/db/schema/ai-cache'
import { logger } from '@/lib/logger'

/**
 * 每日额度（T11 / SPEC §8.4）。
 * - 默认 300/日，env `AI_DAILY_LIMIT` 可覆盖。
 * - 按**自然日重置**：键为 UTC 日期串，日期变更即自然清零，无重置任务。
 * - [修正] v2.0「先读再增」非原子 → 本实现用单条 `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`
 *   的原子 upsert，避免并发丢更新。
 * - 额度用尽与限流（429）是两种失败，调用方必须区分（额度 → 402）。
 */
export const DEFAULT_DAILY_LIMIT = 300

export function getDailyLimit(): number {
  const raw = Number(process.env.AI_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_LIMIT
}

/** UTC 自然日键（YYYY-MM-DD）。 */
export function currentDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export interface QuotaState {
  allowed: boolean
  used: number
  limit: number
  remaining: number
}

export async function getDailyUsage(dayKey = currentDayKey()): Promise<number> {
  try {
    const rows = await db
      .select({ count: aiDailyUsage.count })
      .from(aiDailyUsage)
      .where(sql`${aiDailyUsage.dayKey} = ${dayKey}`)
    return rows[0]?.count ?? 0
  } catch (error) {
    logger.warn({ code: 'AI_QUOTA_READ_FAILED', message: (error as Error).message })
    return 0
  }
}

/** 只判定不计数：用于 /api/ai/status 展示剩余额度。 */
export async function checkQuota(): Promise<QuotaState> {
  const limit = getDailyLimit()
  const used = await getDailyUsage()
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  }
}

/**
 * 原子占用一次额度。返回 allowed=false 表示额度已用尽（调用方应回 402，而不是 429）。
 */
export async function consumeQuota(dayKey = currentDayKey()): Promise<QuotaState> {
  const limit = getDailyLimit()
  try {
    const rows = await db
      .insert(aiDailyUsage)
      .values({ dayKey, count: 1 })
      .onConflictDoUpdate({
        target: aiDailyUsage.dayKey,
        set: { count: sql`${aiDailyUsage.count} + 1`, updatedAt: new Date() },
      })
      .returning({ count: aiDailyUsage.count })

    // 先读后判：并发下可能读到自增后的值，故以「自增前是否已达上限」为准会导致略超，
    // 这里采用「自增后若超过上限则回滚一次」来严格卡住第 301 次。
    const used = rows[0]?.count ?? 1
    if (used > limit) {
      await db
        .update(aiDailyUsage)
        .set({ count: limit })
        .where(sql`${aiDailyUsage.dayKey} = ${dayKey}`)
      return { allowed: false, used: limit, limit, remaining: 0 }
    }
    return { allowed: true, used, limit, remaining: Math.max(0, limit - used) }
  } catch (error) {
    logger.warn({ code: 'AI_QUOTA_WRITE_FAILED', message: (error as Error).message })
    return { allowed: false, used: limit, limit, remaining: 0 }
  }
}
