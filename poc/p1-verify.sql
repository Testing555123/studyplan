-- P1 复跑后的数量基线校验
-- 期望：tables=14, total_idx=35, pk=14, uniq_idx=14, pg_cron=0
\pset tuples_only on
\pset format unaligned

SELECT 'tables=' || count(*) FROM pg_tables WHERE schemaname = 'public';
SELECT 'total_idx=' || count(*) FROM pg_indexes WHERE schemaname = 'public';
SELECT 'pk=' || count(*) FROM pg_constraint
  WHERE contype = 'p' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
SELECT 'uniq_idx=' || count(*) FROM pg_indexes
  WHERE schemaname = 'public' AND indexdef LIKE '%UNIQUE%';
SELECT 'pg_cron=' || count(*) FROM pg_extension WHERE extname = 'pg_cron';
SELECT 'vector=' || coalesce((SELECT extversion FROM pg_extension WHERE extname = 'vector'), 'MISSING');

-- 逐表索引数（用于与 gap-closing §2.12 对照表逐条比对）
SELECT 'per_table', tablename, count(*) FROM pg_indexes
  WHERE schemaname = 'public' GROUP BY tablename ORDER BY tablename;

-- 硬约束 #4：posts.tags 必须是 GIN，不能是 B-tree 复合
SELECT 'posts_tags_ gin=' || count(*) FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'posts' AND indexdef LIKE '%USING gin%';

-- 硬约束 #2：daily_pick_excludes.date 必须非唯一
SELECT 'excludes_date_unique=' || count(*) FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'excludes_date' AND indexdef LIKE '%UNIQUE%';
