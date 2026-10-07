-- P30 复跑装置
-- 目的：在 P1 已建好的 14 表基线上，复跑「daily_picks 外键三步方案」并做断言。
-- 与 p30-foreign-key-fixed.sql 的关系：本文件负责「前置数据 + 断言」，
-- 被验证的脚本本身保持原样不改动（它是一份可复跑的证据）。

\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- 前置：插入目标帖子，使 ON DELETE SET NULL 的结果可观测
--   （原脚本直接 DELETE FROM posts WHERE id='1111...'，若该行不存在则删 0 行，
--    断言会假通过——这是复跑装置必须补齐的部分）
-- ---------------------------------------------------------------------------
INSERT INTO posts (id, title, content, author_id, author_username)
VALUES ('11111111-1111-1111-1111-111111111111', 'p30-probe', 'probe', 'probe-user', 'probe')
ON CONFLICT (id) DO NOTHING;

\echo ''
\echo '########## 开始执行 p30-foreign-key-fixed.sql ##########'
\i /tmp/p30-foreign-key-fixed.sql
\echo '########## 脚本执行结束（最后一条 INSERT 预期报 FK 错误）##########'

\echo ''
\echo '=== 阶段二：独立复刻完整流程，使用「不会被删掉」的对照帖子 ==='
\echo '-- 为什么需要阶段二：脚本内部自带 DELETE FROM posts WHERE id=1111...，'
\echo '--   而 ON DELETE SET NULL 会让 2026-10-07 那行的 post_id 变 NULL。'
\echo '--   若在脚本结束后才断言「映射成功」，恒为 0 —— 那是假失败。'
\echo '-- 为什么不能复用 daily_picks_migrate：1b-2 之后它的 post_id 已是 uuid 类型，'
\echo '--   无法再插入 ObjectId 字符串来复现「varchar → uuid」的转换。'
\echo '--   故新建一张 varchar 表，完整重跑 ①清理 → ②映射 → ③转换 → ④加外键。'

INSERT INTO posts (id, title, content, author_id, author_username)
VALUES ('22222222-2222-2222-2222-222222222222', 'p30-probe2', 'probe', 'probe-user', 'probe')
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS phase2_picks;
CREATE TABLE phase2_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  repo_id bigint NOT NULL,
  post_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO phase2_picks (date, repo_id, post_id) VALUES
  ('2026-10-11', 555, 'aaaaaaaaaaaaaaaaaaaaaaaa'),   -- 合法 24 位 hex，映射到存在的帖子
  ('2026-10-12', 666, 'bbbbbbbbbbbbbbbbbbbbbbbb'),   -- 合法 hex，但映射目标为 NULL
  ('2026-10-13', 777, 'ZZZ_NOT_HEX');                -- 非法值

INSERT INTO oid_uuid_map (oid_string, uuid_value) VALUES
  ('aaaaaaaaaaaaaaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbbbbbbbbbbbbbbbbbb', NULL);

-- ① 清理：非法值置 NULL（必须最先）
UPDATE phase2_picks SET post_id = NULL
WHERE post_id IS NOT NULL AND post_id !~ '^[0-9a-f]{24}$';
-- ② 映射写回
UPDATE phase2_picks d SET post_id = m.uuid_value
FROM oid_uuid_map m
WHERE m.oid_string = d.post_id AND m.uuid_value IS NOT NULL
  AND d.post_id ~ '^[0-9a-f]{24}$';
-- ③ 映射为空 → NULL
UPDATE phase2_picks d SET post_id = NULL
FROM oid_uuid_map m
WHERE m.oid_string = d.post_id AND m.uuid_value IS NULL AND d.post_id IS NOT NULL;
-- ④ 纯类型转换
ALTER TABLE phase2_picks ALTER COLUMN post_id TYPE uuid USING (post_id::uuid);
-- ⑤ 加外键
ALTER TABLE phase2_picks ADD CONSTRAINT phase2_picks_fk
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;

\echo ''
\echo '=== 断言 ==='

-- 断言 1：合法 24 位 hex 且映射命中 → 转成 uuid 且保留（对照帖子尚未删除）
SELECT 'A1 合法OID已转UUID=' || count(*) FROM phase2_picks
  WHERE date = '2026-10-11' AND post_id = '22222222-2222-2222-2222-222222222222';

-- 断言 2：合法 hex 但无对应帖子 → 置 NULL（不丢数据，只断开引用）
SELECT 'A2 无对应帖子已置NULL=' || count(*) FROM daily_picks_migrate
  WHERE date = '2026-10-08' AND post_id IS NULL;

-- 断言 3：非法值（非 24 位 hex）→ 置 NULL，而不是强转报错
SELECT 'A3 非法值已置NULL=' || count(*) FROM daily_picks_migrate
  WHERE date = '2026-10-09' AND post_id IS NULL;

-- 断言 4：列类型已是 uuid（1b-2 生效）
SELECT 'A4 列类型=' || data_type FROM information_schema.columns
  WHERE table_name = 'daily_picks_migrate' AND column_name = 'post_id';

-- 断言 5：外键约束已建立（1c 生效）
SELECT 'A5 外键存在=' || count(*) FROM pg_constraint
  WHERE conname = 'daily_picks_post_fk' AND contype = 'f';

-- 断言 6：ON DELETE SET NULL 真的生效（删帖后引用自动清空）
SELECT 'A6 删帖后引用=' || coalesce(
  (SELECT post_id::text FROM daily_picks_migrate WHERE date = '2026-10-07'), '(NULL)');

-- 断言 7：孤儿引用被数据库拒绝（该行不应存在）
SELECT 'A7 孤儿行被拒=' || (CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL' END)
  FROM daily_picks_migrate WHERE date = '2026-10-10';

-- 断言 8：帖子确实已被删除（证明 A6 不是因为行本来就不存在）
SELECT 'A8 目标帖子已删=' || (CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL' END)
  FROM posts WHERE id = '11111111-1111-1111-1111-111111111111';

-- 断言 9：删掉对照帖子 → 该行引用自动清空，证明 SET NULL 是「删帖触发」
--         而非「本来就 NULL」（A1 已证明它在删帖之前确实持有 uuid）
DELETE FROM posts WHERE id = '22222222-2222-2222-2222-222222222222';
SELECT 'A9 对照组删帖后=' || coalesce(
  (SELECT post_id::text FROM phase2_picks WHERE date = '2026-10-11'), '(NULL)');

-- 断言 10：阶段二的合法 hex 但无目标帖 → NULL；非法值 → NULL
SELECT 'A10 无目标帖已置NULL=' || count(*) FROM phase2_picks
  WHERE date = '2026-10-12' AND post_id IS NULL;
SELECT 'A11 非法值已置NULL=' || count(*) FROM phase2_picks
  WHERE date = '2026-10-13' AND post_id IS NULL;
