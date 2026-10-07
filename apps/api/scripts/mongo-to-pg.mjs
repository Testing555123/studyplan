/**
 * Mongo → PostgreSQL 一次性数据迁移
 * ===================================================================
 * 使用：
 *   node apps/api/scripts/mongo-to-pg.mjs --apply-ddl poc/p1-schema.sql   # 建表（可选）
 *   node apps/api/scripts/mongo-to-pg.mjs --precheck                      # 只体检，不写
 *   node apps/api/scripts/mongo-to-pg.mjs --migrate                       # 真正迁移
 *   node apps/api/scripts/mongo-to-pg.mjs --verify                        # 迁移后对账
 *
 * 环境变量：
 *   MONGODB_URI  默认 mongodb://127.0.0.1:27017/studyplan
 *   PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE  默认 127.0.0.1:5433 postgres/postgres/studyplan
 *
 * 设计要点（对应 TECH-SELECTION.md 的硬约束）：
 *  1. 目标 schema 以已通过的 PoC 为准（poc/p1-schema.sql），本脚本不重新设计表结构。
 *  2. ObjectId → UUID 用**显式映射表**（不靠"确定性推导"），并落库到 migration_oid_map 以便审计。
 *  3. daily_picks.post_id / daily_pick_excludes.post_id 是**弱引用 String**（R-B）：
 *     转换前必须先校验 24 位 hex 且能映射，否则置 NULL —— 顺序错了会让 ADD CONSTRAINT 失败。
 *  4. posts.author_id / comments.author_id 是**快照字符串**，刻意保持 text 不做映射。
 *  5. ai_answer_cache 刻意无 TTL（硬约束 #3），本脚本不得创建任何定时清理。
 *  6. daily_pick_excludes.date 刻意非唯一（硬约束 #2），不得"顺手"唯一化。
 */

import { readFileSync } from 'node:fs'
import { MongoClient, ObjectId } from 'mongodb'
import pg from 'pg'

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/studyplan'
const PG = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'postgres',
  database: process.env.PGDATABASE ?? 'studyplan',
}
const BATCH = Number(process.env.MIGRATE_BATCH ?? 500)
const OID_RE = /^[0-9a-f]{24}$/i

/** 头像渐变色板 —— 与 packages/shared/src/constants/avatar.ts 的 AVATAR_GRADIENTS 一致 */
const AVATAR_GRADIENTS = [
  'from-brand-400 to-brand-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-sky-500 to-blue-600',
]

const isOid = (v) => typeof v === 'string' && OID_RE.test(v)
const oidStr = (v) => (v instanceof ObjectId ? v.toHexString() : isOid(v) ? v.toLowerCase() : null)
const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString())
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** 1024 维浮点数组 → pgvector 字面量 '[0.1,0.2,...]' */
function toVectorLiteral(vec) {
  if (!Array.isArray(vec)) return null
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`
}

/**
 * ObjectId → UUID。
 * 取 ObjectId 的 12 字节，左侧补 4 个零字节凑满 16 字节（UUID 的长度要求）。
 * 刻意不伪造 version/variant 位 —— 它不是随机 UUID，不需要假装是 v4。
 */
function oidToUuid(oid) {
  const hex = oid.toLowerCase()
  const padded = hex + '00000000'
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20)}`
}

// ---------------------------------------------------------------------------
// 集合 → 表的字段映射
// row(doc, map) 返回 PG 一行；map 是 oid→uuid 映射表
// ---------------------------------------------------------------------------
const PLANS = [
  {
    from: 'users',
    to: 'users',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      email: String(d.email ?? '').toLowerCase(),
      username: d.username,
      password_hash: d.passwordHash,
      bio: d.bio ?? null,
      avatar_gradient: Math.max(0, AVATAR_GRADIENTS.indexOf(d.avatarColor)),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
      updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'posts',
    to: 'posts',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      title: d.title,
      content: d.content,
      summary: d.summary ?? null,
      tags: Array.isArray(d.tags) ? d.tags : [],
      // 快照语义：author.id 是字符串，刻意保持 text，不做 ObjectId→UUID 映射
      author_id: String(d.author?.id ?? ''),
      author_username: String(d.author?.username ?? ''),
      comment_count: int(d.commentCount),
      like_count: int(d.likeCount),
      is_daily_pick: Boolean(d.isDailyPick),
      embedding_model: d.embeddingModel ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
      updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'comments',
    to: 'comments',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      post_id: map.get(oidStr(d.postId)) ?? null,
      content: d.content,
      author_id: String(d.author?.id ?? ''),
      author_username: String(d.author?.username ?? ''),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'likes',
    to: 'likes',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      post_id: map.get(oidStr(d.postId)) ?? null,
      user_id: map.get(oidStr(d.userId)) ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'ai_daily_usage',
    to: 'ai_daily_usage',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      date: iso(d.date)?.slice(0, 10) ?? null,
      used: int(d.used),
      updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'ai_answer_cache',
    to: 'ai_answer_cache',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      hash: d.hash,
      answer: d.answer,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'postembeddings',
    to: 'postembeddings',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      post_id: map.get(oidStr(d.postId)) ?? null,
      model: d.model,
      vector: toVectorLiteral(d.vector),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'trending_caches',
    to: 'trending_caches',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      range: d.range,
      payload: JSON.stringify(d.items ?? d.payload ?? []),
      fetched_at: iso(d.fetchedAt) ?? new Date().toISOString(),
      last_attempt_at: iso(d.lastAttemptAt) ?? new Date().toISOString(),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'repo_snapshots',
    to: 'repo_snapshots',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      repo_id: int(d.repoId),
      full_name: d.fullName,
      payload: JSON.stringify(d.payload ?? {}),
      fetched_at: iso(d.fetchedAt) ?? new Date().toISOString(),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'repo_intros',
    to: 'repo_intros',
    row: (d) => ({
      id: oidToUuid(oidStr(d._id)),
      repo_id: int(d.repoId),
      intro: d.intro ?? null,
      model: d.model,
      input_hash: d.inputHash ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
      updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'daily_picks',
    to: 'daily_picks',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      date: iso(d.date)?.slice(0, 10) ?? null,
      repo_id: int(d.repoId),
      // R-B：弱引用，映射不到就置 NULL（绝不写入非法值，否则 ADD CONSTRAINT 会失败）
      post_id: map.get(oidStr(d.postId)) ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'daily_pick_excludes',
    to: 'daily_pick_excludes',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      repo_id: int(d.repoId),
      date: iso(d.date)?.slice(0, 10) ?? null,
      reason: d.reason ?? null,
      option: d.option ?? null,
      post_id: map.get(oidStr(d.postId)) ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'roadmap_progress',
    to: 'roadmap_progress',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      user_id: map.get(oidStr(d.userId)) ?? null,
      steps: JSON.stringify(d.steps ?? {}),
      roadmap_version: int(d.roadmapVersion, 2),
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
      updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
    }),
  },
  {
    from: 'interview_questions',
    to: 'interview_questions',
    row: (d, map) => ({
      id: oidToUuid(oidStr(d._id)),
      node_id: d.nodeId,
      question: d.question,
      answer: d.answer ?? null,
      priority: d.priority ?? null,
      frequency: d.frequency ?? null,
      company: d.company ?? null,
      created_by: map.get(oidStr(d.createdBy)) ?? null,
      created_at: iso(d.createdAt) ?? new Date().toISOString(),
    }),
  },
]

// ---------------------------------------------------------------------------

async function withClients(fn) {
  const mongo = new MongoClient(MONGO_URI)
  const pool = new pg.Pool(PG)
  await mongo.connect()
  try {
    return await fn(mongo.db(), pool)
  } finally {
    await mongo.close()
    await pool.end()
  }
}

/** 读取 psql 脚本并执行（跳过 \ 开头的元命令） */
async function applyDdl(pool, file) {
  const sql = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('\\'))
    .join('\n')
  await pool.query(sql)
  console.log(`✓ 已应用 DDL：${file}`)
}

/** 建 oid→uuid 映射表：先把所有集合的 _id 收进来，保证任何引用都能查到 */
async function buildOidMap(db, pool) {
  const map = new Map()
  const names = await db.listCollections().toArray()
  for (const { name } of names) {
    const docs = await db.collection(name).find({}, { projection: { _id: 1 } }).toArray()
    for (const d of docs) {
      const s = oidStr(d._id)
      if (s) map.set(s, oidToUuid(s))
    }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS migration_oid_map (
    oid text PRIMARY KEY, uuid uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`)
  const rows = [...map.entries()]
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = []
    const params = []
    chunk.forEach(([oid, uuid], j) => {
      vals.push(`($${j * 2 + 1}, $${j * 2 + 2})`)
      params.push(oid, uuid)
    })
    await pool.query(
      `INSERT INTO migration_oid_map (oid, uuid) VALUES ${vals.join(',')} ON CONFLICT DO NOTHING`,
      params,
    )
  }
  console.log(`✓ ObjectId → UUID 映射表：${map.size} 条（已落库 migration_oid_map）`)
  return map
}

async function precheck(db, map) {
  console.log('\n=== 预检（不写入） ===')
  const report = []
  for (const p of PLANS) {
    const total = await db.collection(p.from).countDocuments()
    report.push({ table: p.to, mongo: total })
  }
  for (const r of report) console.log(`  ${r.table.padEnd(22)} mongo=${r.mongo}`)

  // R-B 专项：弱引用 postId 的合法性 / 孤儿统计
  for (const col of ['daily_picks', 'daily_pick_excludes']) {
    const docs = await db.collection(col).find({}, { projection: { postId: 1 } }).toArray()
    let nullish = 0
    let invalid = 0
    let orphan = 0
    let ok = 0
    for (const d of docs) {
      if (d.postId == null) { nullish += 1; continue }
      const s = oidStr(d.postId)
      if (!s) { invalid += 1; continue }
      if (!map.has(s)) { orphan += 1; continue }
      ok += 1
    }
    console.log(
      `  [R-B] ${col.padEnd(22)} 可映射=${ok} 空=${nullish} 非法值=${invalid} 孤儿=${orphan}` +
        (invalid + orphan > 0 ? '  ⚠️ 这些行将被置 NULL' : ''),
    )
  }
  console.log('\n预检完成，未写入任何数据。')
}

async function migrate(db, pool, map) {
  console.log('\n=== 迁移 ===')
  for (const p of PLANS) {
    const cursor = db.collection(p.from).find({})
    let done = 0
    let skipped = 0
    let batch = []
    const flush = async () => {
      if (batch.length === 0) return
      const cols = Object.keys(batch[0])
      const vals = []
      const params = []
      batch.forEach((row, i) => {
        vals.push(`(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(',')})`)
        cols.forEach((c) => params.push(row[c]))
      })
      const sql =
        `INSERT INTO ${p.to} (${cols.join(',')}) VALUES ${vals.join(',')} ON CONFLICT DO NOTHING`
      try {
        const res = await pool.query(sql, params)
        skipped += batch.length - res.rowCount
        done += res.rowCount
      } catch (err) {
        // 带上表名与列名，否则 PG 只报 position，排查成本很高
        throw new Error(`写入 ${p.to} 失败：${err.message}\n  列：${cols.join(', ')}\n  ${sql.slice(0, 160)}`, { cause: err })
      }
      batch = []
    }
    for await (const doc of cursor) {
      const row = p.row(doc, map)
      // 外键列为 NULL 的行不写入（它们会破坏引用完整性）
      if (p.to === 'comments' && !row.post_id) { skipped += 1; continue }
      if (p.to === 'likes' && (!row.post_id || !row.user_id)) { skipped += 1; continue }
      if (p.to === 'postembeddings' && (!row.post_id || !row.vector)) { skipped += 1; continue }
      if (p.to === 'roadmap_progress' && !row.user_id) { skipped += 1; continue }
      batch.push(row)
      if (batch.length >= BATCH) await flush()
    }
    await flush()
    console.log(`  ${p.to.padEnd(22)} 写入=${done} 跳过=${skipped}`)
  }
  console.log('\n迁移完成。')
}

async function verify(db, pool) {
  console.log('\n=== 对账 ===')
  let bad = 0
  console.log(`${'table'.padEnd(22)} mongo    pg     差异`)
  for (const p of PLANS) {
    const m = await db.collection(p.from).countDocuments()
    const r = await pool.query(`SELECT count(*)::int AS n FROM ${p.to}`)
    const g = r.rows[0].n
    const diff = g - m
    if (diff !== 0) bad += 1
    console.log(`${p.to.padEnd(22)} ${String(m).padEnd(7)} ${String(g).padEnd(6)} ${diff}`)
  }
  console.log(bad === 0 ? '\n✓ 全部一致' : `\n⚠️ ${bad} 张表数量不一致（见上；跳过规则会导致 PG 少于 Mongo）`)
  return bad
}

const arg = process.argv[2]
await withClients(async (db, pool) => {
  if (arg === '--apply-ddl') return applyDdl(pool, process.argv[3] ?? 'poc/p1-schema.sql')
  const map = await buildOidMap(db, pool)
  if (arg === '--precheck') return precheck(db, map)
  if (arg === '--migrate') return migrate(db, pool, map)
  if (arg === '--verify') return verify(db, pool)
  console.log('用法：--apply-ddl <file> | --precheck | --migrate | --verify')
})
