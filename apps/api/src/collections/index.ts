import type { CollectionConfig } from 'payload'

/**
 * 14 个集合定义
 * ===================================================================
 * 方案 A（用户 2026-10-08 裁定）：集合定义为准，表结构由 Payload/Drizzle 生成；
 * Payload 表达不了的四项由自定义迁移补齐 ——
 *   ① posts.tags 的 GIN 索引（硬约束 #4）
 *   ② postembeddings.vector 的 HNSW 索引（P23）
 *   ③ daily_picks.post_id 的 FK ON DELETE SET NULL（R-B）
 *   ④ daily_pick_excludes.date **刻意非唯一**（硬约束 #2，不得被迁移"顺手"唯一化）
 *
 * dbName 显式对齐 poc/p1-schema.sql 的表名，避免 Payload 按 slug 自行推导产生偏差。
 */

const timestamps = true

/** posts / comments 的作者快照 —— 内嵌，不建关系（快照语义，非引用语义） */
const authorFields = (): CollectionConfig['fields'] => [
  { name: 'authorId', type: 'text', required: true, index: true },
  { name: 'authorUsername', type: 'text', required: true },
]

export const collections: CollectionConfig[] = [
  {
    slug: 'users',
    dbName: 'users',
    auth: true, // Payload 接管认证：密码哈希、登录、JWT、refresh 全由它负责
    timestamps,
    admin: { useAsTitle: 'username' },
    access: {
      // 只有本人能改自己；读全部公开（经 toPublicUser 裁剪）
      update: ({ req: { user }, id }) => Boolean(user && (user.id === id || user.role === 'admin')),
    },
    fields: [
      { name: 'username', type: 'text', required: true, unique: true },
      { name: 'bio', type: 'textarea' },
      { name: 'avatarGradient', type: 'number', required: true, defaultValue: 0 },
    ],
  },
  {
    slug: 'posts',
    dbName: 'posts',
    timestamps,
    fields: [
      { name: 'title', type: 'text', required: true },
      { name: 'content', type: 'textarea', required: true },
      { name: 'summary', type: 'textarea' },
      /**
       * 偏差 #2 处置（采纳建议 ①）：hasMany text 会被 Payload 拆成子表
       * posts_texts（parent_id + path + text），P1 的 tags text[] + GIN 方案不成立。
       * 改用 json 存字符串数组，语义与现状 Mongo 一致；
       * 按标签筛帖走 jsonb @>，GIN 索引仍由自定义迁移补（硬约束 #4）。
       */
      { name: 'tags', type: 'json', defaultValue: [] },
      ...authorFields(),
      { name: 'commentCount', type: 'number', defaultValue: 0, required: true },
      { name: 'likeCount', type: 'number', defaultValue: 0, required: true },
      { name: 'isDailyPick', type: 'checkbox', defaultValue: false },
      { name: 'embeddingModel', type: 'text' },
    ],
  },
  {
    slug: 'comments',
    dbName: 'comments',
    timestamps,
    fields: [
      { name: 'post', type: 'relationship', relationTo: 'posts', required: true, index: true },
      { name: 'content', type: 'textarea', required: true },
      ...authorFields(),
    ],
  },
  {
    slug: 'likes',
    dbName: 'likes',
    timestamps,
    fields: [
      { name: 'post', type: 'relationship', relationTo: 'posts', required: true },
      { name: 'user', type: 'relationship', relationTo: 'users', required: true },
    ],
    // 复合唯一 (post, user) —— 幂等点赞的正确性基石（对应 Mongo 的 11000 → PG 的 23505）
    indexes: [{ fields: ['post', 'user'], unique: true }],
  },
  {
    slug: 'ai-daily-usage',
    dbName: 'ai_daily_usage',
    timestamps,
    fields: [
      { name: 'date', type: 'date', required: true, unique: true },
      { name: 'used', type: 'number', defaultValue: 0, required: true },
    ],
  },
  {
    slug: 'ai-answer-cache',
    dbName: 'ai_answer_cache',
    timestamps,
    // ⚠️ 硬约束 #3：刻意【无 TTL】。现状注释说明「清理有 60s 延迟、时间写死不好调」，
    //    改为查询时手动判过期。这里不得加任何定时清理（也禁止用 pg_cron 模拟）。
    fields: [
      { name: 'hash', type: 'text', required: true, unique: true, index: true },
      { name: 'answer', type: 'textarea', required: true },
    ],
  },
  {
    slug: 'post-embeddings',
    dbName: 'postembeddings',
    timestamps,
    fields: [
      { name: 'post', type: 'relationship', relationTo: 'posts', required: true, unique: true },
      // model 是【混库防线】：换嵌入模型后过滤掉旧向量，避免不同模型的向量混检
      { name: 'model', type: 'text', required: true },
      /**
       * Payload 没有 vector 类型，这里用 json 承载 1024 维数组；
       * 真正的 pgvector 列与 HNSW 索引由自定义迁移创建，
       * 检索走 payload.db.drizzle（批次 4）。
       */
      { name: 'vector', type: 'json', required: true },
    ],
  },
  {
    slug: 'trending-caches',
    dbName: 'trending_caches',
    timestamps,
    fields: [
      { name: 'range', type: 'text', required: true, unique: true },
      { name: 'payload', type: 'json', required: true },
      // fetchedAt 决定 360 分钟 TTL，lastAttemptAt 做 60 秒最小刷新节流 —— 必须分开存
      { name: 'fetchedAt', type: 'date', required: true },
      { name: 'lastAttemptAt', type: 'date', required: true },
    ],
  },
  {
    slug: 'repo-snapshots',
    dbName: 'repo_snapshots',
    timestamps,
    fields: [
      { name: 'repoId', type: 'number', required: true, unique: true },
      { name: 'fullName', type: 'text', required: true, unique: true },
      { name: 'payload', type: 'json', required: true },
      { name: 'fetchedAt', type: 'date', required: true },
    ],
  },
  {
    slug: 'repo-intros',
    dbName: 'repo_intros',
    timestamps,
    fields: [
      { name: 'repoId', type: 'number', required: true, unique: true },
      { name: 'intro', type: 'textarea' },
      { name: 'model', type: 'text', required: true },
      // 输入指纹：内容没变就不必重新生成简介
      { name: 'inputHash', type: 'text' },
    ],
  },
  {
    slug: 'daily-picks',
    dbName: 'daily_picks',
    timestamps,
    fields: [
      { name: 'date', type: 'date', required: true, unique: true },
      { name: 'repoId', type: 'number', required: true, unique: true },
      /**
       * R-B：弱引用。Payload 的 relationship 会建 FK，但删除语义需自定义迁移
       * 显式指定 ON DELETE SET NULL（删帖后清空引用，而不是级联删报道）。
       */
      { name: 'post', type: 'relationship', relationTo: 'posts' },
    ],
  },
  {
    slug: 'daily-pick-excludes',
    dbName: 'daily_pick_excludes',
    timestamps,
    fields: [
      { name: 'repoId', type: 'number', required: true, unique: true },
      // ⚠️ 硬约束 #2：date 刻意【非唯一】—— 同名不同选项不该被索引冲突挡住，不要"顺手修正"
      { name: 'date', type: 'date', required: true, index: true },
      { name: 'reason', type: 'text' },
      { name: 'option', type: 'text' },
      { name: 'post', type: 'relationship', relationTo: 'posts' },
    ],
  },
  {
    slug: 'roadmap-progress',
    dbName: 'roadmap_progress',
    timestamps,
    fields: [
      { name: 'user', type: 'relationship', relationTo: 'users', required: true, unique: true },
      // 每人一份文档（不是每人每节点一份）：steps 是 { [courseId]: { status } } 动态键
      { name: 'steps', type: 'json', required: true, defaultValue: {} },
      { name: 'roadmapVersion', type: 'number', required: true, defaultValue: 2 },
    ],
  },
  {
    slug: 'interview-questions',
    dbName: 'interview_questions',
    timestamps,
    fields: [
      { name: 'nodeId', type: 'text', required: true, index: true },
      { name: 'question', type: 'textarea', required: true },
      { name: 'answer', type: 'textarea' },
      { name: 'priority', type: 'text', index: true },
      { name: 'frequency', type: 'text' },
      { name: 'company', type: 'text', index: true },
      { name: 'createdBy', type: 'relationship', relationTo: 'users' },
    ],
    // nodeId + question 复合唯一 —— 同时是【种子幂等灌入】的前提
    indexes: [{ fields: ['nodeId', 'question'], unique: true }],
  },
]
