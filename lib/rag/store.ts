import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  EMBEDDING_DIMENSIONS,
  ebookChunks,
  type NewEbookChunk,
} from '@/lib/db/schema/embeddings'
import { logger } from '@/lib/logger'

export interface SimilarChunk {
  slug: string
  title: string
  chunkIndex: number
  content: string
  /** cosine 相似度（1 - distance），越大越相关。 */
  score: number
}

/** pgvector 文本向量字面量：`[0.1,0.2,...]`。 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

/**
 * 向量检索（T10）：cosine 距离排序取 top-K。
 * 失败只 warn 并返回空数组（§6.4：检索降级不得阻断问答）。
 */
export async function searchSimilar(
  queryEmbedding: number[],
  topK = 8,
): Promise<SimilarChunk[]> {
  if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    logger.warn({
      code: 'RAG_DIMENSION_MISMATCH',
      expected: EMBEDDING_DIMENSIONS,
      actual: queryEmbedding.length,
    })
    return []
  }

  const literal = toVectorLiteral(queryEmbedding)
  try {
    const result = await db.execute(sql`
      select slug, title, chunk_index, content, 1 - (embedding <=> ${literal}::vector) as score
      from ebook_chunks
      order by embedding <=> ${literal}::vector
      limit ${topK}
    `)
    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows ?? []
    return rows.map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      chunkIndex: Number(row.chunk_index),
      content: String(row.content),
      score: Number(row.score),
    }))
  } catch (error) {
    logger.warn({ code: 'RAG_SEARCH_DEGRADED', message: (error as Error).message })
    return []
  }
}

export interface StoreInput {
  slug: string
  title: string
  chunkIndex: number
  content: string
}

/**
 * 嵌入并入库（T10）。仅供后台 job / backfill 脚本调用：
 * 内部动态 import 本地 Qwen3 模型（300MB 权重），**绝不可在请求路径调用**（D9/D15）。
 * (slug, chunk_index) 冲突即覆盖，保证重复执行幂等。
 */
export async function embedAndStore(
  items: StoreInput[],
  options: { batchSize?: number; embedModel?: string } = {},
): Promise<number> {
  if (items.length === 0) return 0
  const batchSize = options.batchSize ?? 8
  const { embedTexts } = await import('@/lib/embeddings')
  // 与 lib/embeddings.ts 的默认模型保持一致（该常量未导出，此处不改动既有文件）。
  const embedModel =
    options.embedModel ?? process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'

  let stored = 0
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const vectors = await embedTexts(batch.map((item) => item.content))
    const rows: NewEbookChunk[] = batch.map((item, index) => ({
      slug: item.slug,
      title: item.title,
      chunkIndex: item.chunkIndex,
      content: item.content,
      charCount: item.content.length,
      embedding: vectors[index],
      embedModel,
    }))

    await db
      .insert(ebookChunks)
      .values(rows)
      .onConflictDoUpdate({
        target: [ebookChunks.slug, ebookChunks.chunkIndex],
        set: {
          title: sql`excluded.title`,
          content: sql`excluded.content`,
          charCount: sql`excluded.char_count`,
          embedding: sql`excluded.embedding`,
          embedModel: sql`excluded.embed_model`,
        },
      })
    stored += rows.length
  }

  return stored
}
