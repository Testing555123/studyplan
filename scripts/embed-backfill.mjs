/**
 * 电子书向量 backfill（T10）。
 *
 * 定位：**仅后台 job**。Node 24 直接加载 TS（类型剥离），因此可复用
 * lib/rag/chunk.ts 与 lib/embeddings.ts 的唯一实现，不重复造轮子；
 * 但本脚本会冷加载 ~300MB 的 Qwen3-Embedding 权重，**绝不可在请求路径调用**（D9/D15）。
 *
 * 用法：
 *   DATABASE_URL=... node scripts/embed-backfill.mjs            # 全量（幂等，冲突覆盖）
 *   EMBED_LIMIT=3 node scripts/embed-backfill.mjs               # 只处理前 3 篇（冒烟）
 *   EMBED_DRY_RUN=1 node scripts/embed-backfill.mjs             # 只切分不嵌入不写库
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { Pool } from 'pg'
import { chunkMarkdown } from '../lib/rag/chunk.ts'
import { EMBED_DIMENSION, embedTexts } from '../lib/embeddings.ts'

const EBOOK_DIR = resolve(process.env.EBOOK_DIR ?? 'content/ebook')
const BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE ?? 8)
const LIMIT = process.env.EMBED_LIMIT ? Number(process.env.EMBED_LIMIT) : null
const DRY_RUN = process.env.EMBED_DRY_RUN === '1'
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'onnx-community/Qwen3-Embedding-0.6B-ONNX'

const started = Date.now()

async function listMarkdown(dir) {
  const found = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await listMarkdown(full)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full)
    }
  }
  return found.sort()
}

/** 标题取首个 h1，与 lib/ebook-title.ts 的口径一致（此处避免引入 fumadocs 依赖）。 */
function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[backfill] 缺少 DATABASE_URL，退出')
    process.exit(1)
  }

  const files = await listMarkdown(EBOOK_DIR)
  const targets = LIMIT ? files.slice(0, LIMIT) : files
  if (targets.length === 0) {
    console.log(`[backfill] ${EBOOK_DIR} 下没有 markdown，退出`)
    return
  }

  console.log(`[backfill] 文档 ${targets.length}/${files.length} 篇，dryRun=${DRY_RUN}`)

  const pool = DRY_RUN ? null : new Pool({ connectionString: databaseUrl })
  let chunkTotal = 0

  try {
    for (const file of targets) {
      const markdown = await readFile(file, 'utf8')
      const slug = relative(EBOOK_DIR, file).replace(/\.md$/, '').replace(/\\/g, '/')
      const title = extractTitle(markdown)
      const chunks = chunkMarkdown(markdown)

      if (DRY_RUN) {
        console.log(`[backfill] ${slug} → ${chunks.length} 块（标题：${title || '无'}）`)
        chunkTotal += chunks.length
        continue
      }

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        const vectors = await embedTexts(batch.map((chunk) => chunk.content))

        for (let j = 0; j < batch.length; j += 1) {
          const chunk = batch[j]
          const vector = vectors[j]
          if (!vector || vector.length !== EMBED_DIMENSION) {
            console.error(`[backfill] ${slug}#${chunk.chunkIndex} 向量维度异常，跳过`)
            continue
          }
          await pool.query(
            `insert into ebook_chunks (slug, title, chunk_index, content, char_count, embedding, embed_model)
             values ($1, $2, $3, $4, $5, $6::vector, $7)
             on conflict (slug, chunk_index) do update
               set title = excluded.title,
                   content = excluded.content,
                   char_count = excluded.char_count,
                   embedding = excluded.embedding,
                   embed_model = excluded.embed_model`,
            [
              slug,
              title || slug,
              chunk.chunkIndex,
              chunk.content,
              chunk.content.length,
              `[${vector.join(',')}]`,
              EMBED_MODEL,
            ],
          )
          chunkTotal += 1
        }
      }

      console.log(`[backfill] ${slug} → ${chunks.length} 块已入库`)
    }
  } finally {
    await pool?.end()
  }

  console.log(`[backfill] 完成：${chunkTotal} 块，耗时 ${Date.now() - started} ms`)
}

await main()
