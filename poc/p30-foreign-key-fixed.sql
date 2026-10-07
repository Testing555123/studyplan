-- P30 验证（修正版）· daily_picks 外键三步方案
--
-- 首轮验证发现的障碍：PG 的 ALTER COLUMN ... TYPE 不允许在 USING 表达式里用子查询
--   ERROR: cannot use subquery in transform expression
--   → 1b 必须拆成两步：先用 UPDATE ... FROM（DML，允许子查询）写回映射结果，
--     再用 ALTER COLUMN ... TYPE ... USING (col::uuid) 做纯类型转换（不含子查询）

\echo '=== 1a：ObjectId → UUID 映射表 ==='
DROP TABLE IF EXISTS daily_picks_migrate CASCADE;
DROP TABLE IF EXISTS oid_uuid_map CASCADE;

CREATE TABLE oid_uuid_map (
  oid_string text PRIMARY KEY,
  uuid_value uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO oid_uuid_map (oid_string, uuid_value) VALUES
  ('507f1f77bcf86cd799439011', '11111111-1111-1111-1111-111111111111'),
  ('507f191e810c19729de860ea', NULL),
  ('NOT_A_VALID_OID',        NULL);

\echo '-- 转换前校验：只接受合法的 24 位 hex'
SELECT count(*) FILTER (WHERE oid_string ~ '^[0-9a-f]{24}$') AS 合法OID,
       count(*) FILTER (WHERE oid_string !~ '^[0-9a-f]{24}$') AS 非法OID,
       count(*) FILTER (WHERE uuid_value IS NULL) AS 无对应帖子
FROM oid_uuid_map;

\echo ''
\echo '=== 1b-1：先用 UPDATE ... FROM 把映射结果写回（DML，允许子查询）==='
CREATE TABLE daily_picks_migrate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  repo_id bigint NOT NULL,
  post_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO daily_picks_migrate (date, repo_id, post_id) VALUES
  ('2026-10-07', 111, '507f1f77bcf86cd799439011'),
  ('2026-10-08', 222, '507f191e810c19729de860ea'),
  ('2026-10-09', 333, 'NOT_A_VALID_OID');

UPDATE daily_picks_migrate d
SET post_id = m.uuid_value
FROM oid_uuid_map m
WHERE m.oid_string = d.post_id
  AND m.uuid_value IS NOT NULL
  AND d.post_id ~ '^[0-9a-f]{24}$';

\echo '-- 非法值与无对应帖子的置 NULL（必须在类型转换之前）'
UPDATE daily_picks_migrate SET post_id = NULL
WHERE post_id IS NOT NULL AND post_id !~ '^[0-9a-f]{24}$';

UPDATE daily_picks_migrate d SET post_id = NULL
FROM oid_uuid_map m
WHERE m.oid_string = d.post_id AND m.uuid_value IS NULL AND d.post_id IS NOT NULL;

\echo ''
\echo '=== 1b-2：纯类型转换（USING 里不含子查询）==='
ALTER TABLE daily_picks_migrate
  ALTER COLUMN post_id TYPE uuid USING (post_id::uuid);

\echo '-- 转换结果'
SELECT date, repo_id, post_id FROM daily_picks_migrate ORDER BY date;

\echo ''
\echo '=== 1c：加真实外键（此时类型已匹配）==='
ALTER TABLE daily_picks_migrate
  ADD CONSTRAINT daily_picks_post_fk
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
\echo '外键添加成功 —— 应用层检查可以被遗忘，约束不能'

\echo ''
\echo '=== 验证 ON DELETE SET NULL ==='
SELECT post_id AS before_delete FROM daily_picks_migrate WHERE date = '2026-10-07';
DELETE FROM posts WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT coalesce(post_id::text, '(NULL)') AS after_delete FROM daily_picks_migrate WHERE date = '2026-10-07';

\echo ''
\echo '=== 反向验证：外键拒绝指向不存在帖子的引用（预期报错）==='
INSERT INTO daily_picks_migrate (date, repo_id, post_id)
VALUES ('2026-10-10', 444, '99999999-9999-9999-9999-999999999999');
