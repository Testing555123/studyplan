-- P30 验证 · daily_picks 外键约束（R-B 根治手段）
-- 现状：daily-pick.schema.ts:58-59 声明 type: String（弱引用，无 ref / 无 ObjectId / 无索引）
--       而 PG 的 posts.id 是 uuid —— 类型与值域不匹配，不能直接加 FK
-- 验证三步方案：1a 映射表 → 1b 列类型迁移 → 1c 加外键

\echo '=== 1a：ObjectId → UUID 映射表 ==='
CREATE TABLE IF NOT EXISTS oid_uuid_map (
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
\echo '=== 1b：post_id 列类型迁移（varchar → uuid）==='
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

ALTER TABLE daily_picks_migrate
  ALTER COLUMN post_id TYPE uuid USING (
    CASE
      WHEN post_id ~ '^[0-9a-f]{24}$'
        AND EXISTS (SELECT 1 FROM oid_uuid_map m JOIN posts p ON p.id = m.uuid_value
                    WHERE m.oid_string = daily_picks_migrate.post_id)
      THEN (SELECT m.uuid_value FROM oid_uuid_map m WHERE m.oid_string = daily_picks_migrate.post_id)
      ELSE NULL
    END
  );

\echo '-- 转换结果：合法且有对应帖子的被转换，孤儿与非法值置 NULL'
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
\echo '引用自动置 NULL —— 数据库层保证无孤儿引用（R-B 根治成立）'
