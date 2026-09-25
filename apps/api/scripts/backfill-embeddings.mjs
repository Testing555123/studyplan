#!/usr/bin/env node
/**
 * 存量帖子的向量回填。
 *
 * 为什么是独立脚本而不是启动时自动回填？
 *   回填要真实烧 API 额度。启动自动跑意味着每一次冷启动都可能
 *   不可预测地花掉配额 —— 可选项不该有这种权力。和 code-index 一样，
 *   生成发生在构建期/运维期，不是启动期。
 *
 * 用法：
 *   pnpm backfill:embeddings              只补库里缺向量的帖子
 *   pnpm backfill:embeddings -- --rebuild 全库重算（换了 embedding 模型时用）
 *
 * 退出码：0 成功；1 模型混库拒绝或存在失败批；2 配置缺失。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'

const here = dirname(fileURLToPath(import.meta.url))

// 自己解析 .env：不为一个脚本引入 dotenv。只处理 KEY=VALUE 行，够用。
function loadEnv() {
  const values = {}
  try {
    const text = readFileSync(join(here, '..', '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line.trim())
      if (match) values[match[1]] = match[2].replace(/^"|"$/g, '')
    }
  } catch {
    // 没有 .env 就全靠进程环境变量
  }
  return { ...values, ...process.env }
}

const env = loadEnv()
const REBUILD = process.argv.includes('--rebuild')
const BATCH_SIZE = 32
const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const EMBED_MODEL = env.NVNIM_EMBED_MODEL?.trim() || 'baai/bge-m3'
const EMBED_TEXT_MAX = 2000

if (!env.MONGODB_URI || !env.NVNIM_API_KEY) {
  console.error('缺 MONGODB_URI 或 NVNIM_API_KEY（读 apps/api/.env 或环境变量）')
  process.exit(2)
}

function buildText(post) {
  return [post.title, post.summary || '', post.content]
    .filter(Boolean)
    .join('\n')
    .slice(0, EMBED_TEXT_MAX)
}

/** 与后端 l2Normalize 同逻辑：写进库的向量必须都是归一化过的 */
function l2Normalize(vector) {
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm)
  return norm > 0 ? vector.map((v) => v / norm) : vector
}

async function embedBatch(texts) {
  const response = await fetch(`${NIM_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.NVNIM_API_KEY}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const hint =
      response.status === 410 || response.status === 404
        ? `（模型 ${EMBED_MODEL} 可能已下线，改 NVNIM_EMBED_MODEL 后 --rebuild）`
        : ''
    throw new Error(`embedding 请求失败 HTTP ${response.status} ${hint}`)
  }
  const payload = await response.json()
  if ((payload.data ?? []).length !== texts.length) {
    throw new Error(`返回条数 ${payload.data?.length ?? 0} ≠ 请求条数 ${texts.length}`)
  }
  return [...payload.data].sort((a, b) => a.index - b.index).map((row) => row.embedding)
}

const db = await mongoose.connect(env.MONGODB_URI).then(() => mongoose.connection)
const posts = db.collection('posts')
const embeddings = db.collection('postembeddings')

// 混库防呆：库里只要存在异模型记录，默认模式直接拒绝 ——
// 新旧向量混在一起时点积没有意义，这不是补几条能救的，必须全库重算。
if (!REBUILD) {
  const foreign = await embeddings.countDocuments({ model: { $ne: EMBED_MODEL } })
  if (foreign > 0) {
    console.error(
      `检测到 ${foreign} 条向量由其它模型生成（当前：${EMBED_MODEL}）。请改用：pnpm backfill:embeddings -- --rebuild`,
    )
    await mongoose.disconnect()
    process.exit(1)
  }
}

const existing = (await embeddings.find({}, { projection: { postId: 1 } }).toArray()).map(
  (r) => r.postId,
)
const filter = REBUILD ? {} : { _id: { $nin: existing } }
const targets = await posts
  .find(filter, { projection: { title: 1, content: 1, summary: 1 } })
  .toArray()
console.log(`待处理 ${targets.length} 篇（模式：${REBUILD ? 'rebuild' : 'fill'}，模型：${EMBED_MODEL}）`)

let done = 0
let failed = 0
for (let i = 0; i < targets.length; i += BATCH_SIZE) {
  const batch = targets.slice(i, i + BATCH_SIZE)
  try {
    const vectors = await embedBatch(batch.map(buildText))
    for (let j = 0; j < batch.length; j++) {
      const vector = l2Normalize(vectors[j])
      await embeddings.updateOne(
        { postId: batch[j]._id },
        {
          $set: {
            postId: batch[j]._id,
            model: EMBED_MODEL,
            dim: vector.length,
            vector,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      )
      done++
    }
  } catch (error) {
    // 单批失败不中断：幂等 upsert 意味着重跑一次就能接着补
    failed += batch.length
    console.warn(`第 ${i / BATCH_SIZE + 1} 批失败，跳过：${error.message}`)
  }
  process.stdout.write(`\r进度：${done + failed}/${targets.length}`)
}

console.log(`\n完成：补 ${done} / 跳过 0 / 失败 ${failed}`)
await mongoose.disconnect()
process.exit(failed === 0 ? 0 : 1)
