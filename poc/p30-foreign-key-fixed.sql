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

-- ⚠️ 顺序修正（2026-10-07 复跑实测发现的原缺陷）：
--   原脚本先做「映射写回」再做「非法值置 NULL」，而后者的判据是
--   `post_id !~ '^[0-9a-f]{24}$'`——映射写回后该列已是 **36 字符带连字符的 UUID 字面量**，
--   同样不匹配 24 位 hex，于是被无条件置 NULL。
--   结果是【所有成功映射的 post_id 全被抹掉】，1b-2 的三行全为 NULL，
--   连带使 1c 之后「ON DELETE SET NULL」的验证退化成假通过（本来就是 NULL）。
--   这正是 R-B 要防的静默失效：不报错，但数据没了。
--
--   正确顺序：① 非法值 → NULL  ② 映射写回  ③ 映射为空（无对应帖子）→ NULL
--   即「清理」必须先于「写入」，而不是相反。

\echo '-- ① 非法值（非 24 位 hex）置 NULL —— 必须最先做'
UPDATE daily_picks_migrate SET post_id = NULL
WHERE post_id IS NOT NULL AND post_id !~ '^[0-9a-f]{24}$';

\echo '-- ② 映射写回（DML，允许子查询）'
UPDATE daily_picks_migrate d
SET post_id = m.uuid_value
FROM oid_uuid_map m
WHERE m.oid_string = d.post_id
  AND m.uuid_value IS NOT NULL
  AND d.post_id ~ '^[0-9a-f]{24}$';

\echo '-- ③ 合法 hex 但映射为空（无对应帖子）→ NULL，不丢数据只断开引用'
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
