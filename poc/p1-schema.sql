-- =============================================================================
-- P1 验证包 · 14 个集合的 PostgreSQL DDL
-- 目的：验证 35 个索引在 PG 16 + pgvector 0.8.7 上能否全部落地、语义是否等价
-- 来源：docs/archive/tech-selection/gap-closing.md §2.12（code-explorer 实测的对照表）
-- 基线：现状 MongoDB 21 个显式索引 + 14 个 _id_ 主键索引 = 35 个
-- =============================================================================

\set ON_ERROR_STOP on

-- 扩展：向量检索（栈内第 2 项已裁定）
CREATE EXTENSION IF NOT EXISTS vector;
-- 全文检索：tsvector + pg_trgm（替代 Mongo 的 text index）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 硬约束 #4：posts.tags 数组等值 + createdAt 排序在 PG 中不能用一个复合索引
--   Mongo 的 {tags:1, createdAt:-1} 照搬过来会对数组行漏命中，必须拆开

-- -----------------------------------------------------------------------------
-- 1. users（1 索引：email_1 unique）
--    R-C 相关：password_hash 为敏感列，PG 无 select:false 等价物，
--    方案是「显式 column 清单 + 受控类型」，DDL 层不做特殊处理
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  username      text NOT NULL,
  password_hash text NOT NULL,
  avatar_gradient smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email ON users (email);

-- -----------------------------------------------------------------------------
-- 2. posts（2 索引：createdAt_-1、tags_1 + createdAt_-1 复合）
-- -----------------------------------------------------------------------------
CREATE TABLE posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  content       text NOT NULL,
  summary       text,
  tags          text[] NOT NULL DEFAULT '{}',
  -- 作者快照（common/schemas/author.schema.ts 是 @Schema({_id:false}) 的内嵌文档，
  -- 且 id 声明为 String 而非 ObjectId）——保持 text，不改成 uuid 外键
  author_id     text NOT NULL,
  author_username text NOT NULL,
  comment_count integer NOT NULL DEFAULT 0,
  like_count    integer NOT NULL DEFAULT 0,
  is_daily_pick boolean NOT NULL DEFAULT false,
  embedding_model text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_at ON posts (created_at DESC);
-- ⚠️ 硬约束 #4：数组等值必须用 GIN，不能用 B-tree 复合索引
CREATE INDEX posts_tags_gin ON posts USING GIN (tags);
CREATE INDEX posts_created_at_btree ON posts (created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. comments（1 索引：postId_1 + createdAt_1 复合）
--    强引用（ObjectId + ref）→ 换 PG 后可加真 FK
-- -----------------------------------------------------------------------------
CREATE TABLE comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content           text NOT NULL,
  author_id         text NOT NULL,
  author_username   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_created ON comments (post_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. likes（1 索引：postId_1 + userId_1 复合唯一）
--    ★ 幂等点赞的正确性基石。11000 当成功幂等且不重复 $inc 的等价物
-- -----------------------------------------------------------------------------
CREATE TABLE likes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX likes_post_user ON likes (post_id, user_id);

-- -----------------------------------------------------------------------------
-- 5. ai_daily_usage（1 索引：date_1 unique）
-- -----------------------------------------------------------------------------
CREATE TABLE ai_daily_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date NOT NULL,
  used       integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_usage_date ON ai_daily_usage (date);

-- -----------------------------------------------------------------------------
-- 6. ai_answer_cache（1 索引：hash_1 unique）
--    ★ 硬约束 #3：刻意【无 TTL】。现状 ai-usage.schema.ts:49-55 注释说明
--      「清理有 60s 延迟、时间写死不好调」，改为查询时手动判过期。
--      因此这里【不得】加 pg_cron 清理或任何 TTL 模拟。
-- -----------------------------------------------------------------------------
CREATE TABLE ai_answer_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash       text NOT NULL,
  answer     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_cache_hash ON ai_answer_cache (hash);
-- 刻意不设 TTL —— 见上方说明

-- -----------------------------------------------------------------------------
-- 7. postembeddings（1 索引：postId_1 unique）
--    ★ model 列是【混库防线】：换 embedding 模型后过滤掉旧向量
--    ⚠️ 有唯一索引但无 ref → 是否补 FK 需决策（P1 待决项）
-- -----------------------------------------------------------------------------
CREATE TABLE postembeddings (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  model   text NOT NULL,
  vector  vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX embeddings_post ON postembeddings (post_id);
-- pgvector HNSW 索引（P23 验证项）
CREATE INDEX embeddings_hnsw ON postembeddings USING hnsw (vector vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- 8. trending_caches（1 索引：range_1 unique）
--    ★ fetchedAt 与 lastAttemptAt 必须分开存：
--      前者决定 360 分钟 TTL，后者做 60 秒最小刷新节流
-- -----------------------------------------------------------------------------
CREATE TABLE trending_caches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  range          text NOT NULL,
  payload        jsonb NOT NULL,
  fetched_at     timestamptz NOT NULL,
  last_attempt_at timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trending_range ON trending_caches (range);

-- -----------------------------------------------------------------------------
-- 9. repo_snapshots（2 索引：repoId_1 unique、fullName_1 unique）
-- -----------------------------------------------------------------------------
CREATE TABLE repo_snapshots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id    bigint NOT NULL,
  full_name  text NOT NULL,
  payload    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repo_snap_repo ON repo_snapshots (repo_id);
CREATE UNIQUE INDEX repo_snap_fullname ON repo_snapshots (full_name);

-- -----------------------------------------------------------------------------
-- 10. repo_intros（1 索引：repoId_1 unique）
--     fullName 刻意无索引（现状 repo-intro.schema.ts:24 仅 required）
-- -----------------------------------------------------------------------------
CREATE TABLE repo_intros (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id    bigint NOT NULL,
  intro      text,
  model      text NOT NULL,
  input_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repo_intro_repo ON repo_intros (repo_id);

-- -----------------------------------------------------------------------------
-- 11. daily_picks（2 索引：date_1 unique、repoId_1 unique）
--     ★ R-B 核心表。post_id 现状是【弱引用 String】（daily-pick.schema.ts:58-59
--       声明 type: String，无 ref / 无 ObjectId / 无索引）
-- -----------------------------------------------------------------------------
CREATE TABLE daily_picks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  repo_id       bigint NOT NULL,
  -- ★ P30 第一步：列类型必须是 uuid（与 posts.id 同类型）才能加 FK
  --   迁移时必须先建 ObjectId → UUID 映射表，且转换前校验 24 位 hex
  post_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX picks_date ON daily_picks (date);
CREATE UNIQUE INDEX picks_repo ON daily_picks (repo_id);

-- -----------------------------------------------------------------------------
-- 12. daily_pick_excludes（2 索引：repoId_1 unique、date_1 非唯一）
--     ⚠️ 硬约束：date 刻意【非唯一】。
--       daily-pick-exclude.schema.ts:14-21 注释说明——同名不同选项会抛
--       IndexOptionsConflict，所以刻意不加唯一索引。不要「顺手修正」。
-- -----------------------------------------------------------------------------
CREATE TABLE daily_pick_excludes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id    bigint NOT NULL,
  date       date NOT NULL,
  reason     text,
  option     text,
  post_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX excludes_repo ON daily_pick_excludes (repo_id);
CREATE INDEX excludes_date ON daily_pick_excludes (date);   -- ★ 刻意非唯一

-- -----------------------------------------------------------------------------
-- 13. roadmap_progress（1 索引：userId_1 unique）
--     ★ 每人一份文档（不是每人每节点一份）
--     steps 现状是 Object（无深层 schema）→ PG 用 jsonb
-- -----------------------------------------------------------------------------
CREATE TABLE roadmap_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  steps           jsonb NOT NULL DEFAULT '{}'::jsonb,
  roadmap_version integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roadmap_user ON roadmap_progress (user_id);

-- -----------------------------------------------------------------------------
-- 14. interview_questions（4 索引：nodeId_1、company_1、priority_1、nodeId_1+question_1 复合唯一）
--     ★ nodeId+question 复合唯一同时是【种子幂等灌入】的前提
-- -----------------------------------------------------------------------------
CREATE TABLE interview_questions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    text NOT NULL,
  question   text NOT NULL,
  answer     text,
  priority   text,
  frequency  text,
  company    text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX q_node ON interview_questions (node_id);
CREATE INDEX q_company ON interview_questions (company);
CREATE INDEX q_priority ON interview_questions (priority);
CREATE UNIQUE INDEX q_node_question ON interview_questions (node_id, question);
