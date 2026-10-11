import { createHash } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aiAnswerCache } from '@/lib/db/schema/ai-cache'
import { logger } from '@/lib/logger'

/**
 * AI 答案缓存（T11 / SPEC §8.3）。
 * - 双层：进程内 LRU（max 200）+ PG 表 `ai_answer_cache`。
 * - **禁 TTL 索引与定时清理**：过期判定放在读路径（now > expiresAt 视为未命中）。
 * - 键必须含模型名（v2.0 缺陷修正），不含用户 id（同问题全局共享）。
 * - 读写失败只 warn，绝不阻断答案（§6.4）。
 */
export const CACHE_TTL_MS = Number(process.env.AI_CACHE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000)
export const LRU_MAX = 200

export interface CachedAnswer {
  answer: string
  model: string
  sources: { slug: string; title: string; chunkIndex: number }[]
  createdAt: string
}

interface LruEntry {
  value: CachedAnswer
  expiresAt: number
}

const lru = new Map<string, LruEntry>()

function touch(key: string, entry: LruEntry) {
  lru.delete(key)
  lru.set(key, entry)
  while (lru.size > LRU_MAX) {
    const oldest = lru.keys().next()
    if (oldest.done) break
    lru.delete(oldest.value)
  }
}

/** sha256(问题 + 检索上下文 + 模型名).slice(0,32)：换模型必换键。 */
export function buildCacheKey(question: string, contextName: string, model: string): string {
  const normalized = `${question.trim().toLowerCase()}|${contextName}|${model}`
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

export async function getAnswerCached(key: string): Promise<CachedAnswer | null> {
  const now = Date.now()
  const hit = lru.get(key)
  if (hit) {
    if (hit.expiresAt <= now) {
      lru.delete(key)
      return null
    }
    touch(key, hit)
    return hit.value
  }

  try {
    const rows = await db
      .select()
      .from(aiAnswerCache)
      .where(eq(aiAnswerCache.cacheKey, key))
    const row = rows[0]
    if (!row) return null
    if (row.expiresAt.getTime() <= now) return null

    const value: CachedAnswer = {
      answer: row.answer,
      model: row.model,
      sources: row.sources ?? [],
      createdAt: row.createdAt.toISOString(),
    }
    touch(key, { value, expiresAt: row.expiresAt.getTime() })
    return value
  } catch (error) {
    logger.warn({ code: 'AI_CACHE_READ_FAILED', message: (error as Error).message })
    return null
  }
}

export async function putAnswerCache(input: {
  key: string
  model: string
  question: string
  answer: string
  sources: { slug: string; title: string; chunkIndex: number }[]
}): Promise<void> {
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS)
  const value: CachedAnswer = {
    answer: input.answer,
    model: input.model,
    sources: input.sources,
    createdAt: new Date().toISOString(),
  }
  touch(input.key, { value, expiresAt: expiresAt.getTime() })

  try {
    await db
      .insert(aiAnswerCache)
      .values({
        cacheKey: input.key,
        model: input.model,
        question: input.question,
        answer: input.answer,
        sources: input.sources,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: aiAnswerCache.cacheKey,
        set: {
          model: input.model,
          answer: input.answer,
          sources: input.sources,
          expiresAt,
        },
      })
  } catch (error) {
    logger.warn({ code: 'AI_CACHE_WRITE_FAILED', message: (error as Error).message })
  }
}

/** 清理过期行（运维入口；业务读路径不依赖它，过期由读路径判定）。 */
export async function purgeExpiredCache(now = new Date()): Promise<number> {
  try {
    const deleted = await db
      .delete(aiAnswerCache)
      .where(lt(aiAnswerCache.expiresAt, now))
      .returning({ key: aiAnswerCache.cacheKey })
    return deleted.length
  } catch (error) {
    logger.warn({ code: 'AI_CACHE_PURGE_FAILED', message: (error as Error).message })
    return 0
  }
}

/** 测试辅助：清空进程内 LRU。 */
export function __resetAnswerCacheLru(): void {
  lru.clear()
}
