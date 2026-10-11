import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ebookChunks } from '@/lib/db/schema/embeddings'
import { AI_MODEL, isAiConfigured } from '@/lib/rag/remote'
import { logger } from '@/lib/logger'
import { checkQuota } from './quota'

/**
 * /api/ai/status 七字段（T11 / SPEC §8.4）。
 * 字段沿用 v2.0：enabled / keyConfigured / model / remainingToday / limitPerDay / codeIndexLoaded / codeIndexFiles。
 *
 * 映射说明：v2.0 的「代码索引」在本项目对应**电子书分块索引**（RAG 只检索电子书），
 * 因此 codeIndexLoaded = 分块数 > 0，codeIndexFiles = 分块数；加载失败置 0 且不阻断启动（§6.4）。
 */
export interface AiStatus {
  enabled: boolean
  keyConfigured: boolean
  model: string
  remainingToday: number
  limitPerDay: number
  codeIndexLoaded: boolean
  codeIndexFiles: number
}

async function countEbookChunks(): Promise<number> {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ebookChunks)
    return Number(rows[0]?.count ?? 0)
  } catch (error) {
    logger.warn({ code: 'AI_INDEX_COUNT_FAILED', message: (error as Error).message })
    return 0
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  const keyConfigured = isAiConfigured() && AI_MODEL.length > 0
  const quota = await checkQuota()
  const files = await countEbookChunks()

  return {
    enabled: keyConfigured && quota.allowed,
    keyConfigured,
    model: AI_MODEL,
    remainingToday: quota.remaining,
    limitPerDay: quota.limit,
    codeIndexLoaded: files > 0,
    codeIndexFiles: files,
  }
}
