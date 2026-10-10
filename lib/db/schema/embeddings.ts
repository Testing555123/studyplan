import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { vector } from '@/lib/db/vector'

/**
 * 电子书分块向量表（T10）。
 * - 维度固定 1024，与 lib/embeddings.ts 的 EMBED_DIMENSION 对齐（此处不 import 该模块，
 *   避免 drizzle-kit / 请求路径被动加载 transformers.js 的 300MB 权重）。
 * - HNSW + vector_cosine_ops：cosine 距离检索，亚 100ms 级 top-K。
 * - (slug, chunk_index) 唯一：backfill 可重复执行且幂等（ON CONFLICT 覆盖）。
 */
export const EMBEDDING_DIMENSIONS = 1024

export const ebookChunks = pgTable(
  'ebook_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 文档路径（相对 content/ebook），如 "design/01-visual-style-analysis"。 */
    slug: text('slug').notNull(),
    /** 文档标题（首个 h1，来自 ebook-title）。 */
    title: text('title').notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    charCount: integer('char_count').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    /** 嵌入模型标识，换模型后可据此判断是否需重建向量。 */
    embedModel: text('embed_model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ebook_chunks_slug_chunk_idx').on(table.slug, table.chunkIndex),
    index('ebook_chunks_slug_idx').on(table.slug),
    index('ebook_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
  ],
)

export type EbookChunkRow = typeof ebookChunks.$inferSelect
export type NewEbookChunk = typeof ebookChunks.$inferInsert
