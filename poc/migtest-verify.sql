-- 迁移后置深度断言（对 migtest 库）
-- 覆盖：向量维度 / 弱引用 R-B / 复合唯一 / 快照语义 / jsonb / 头像下标

\pset tuples_only on
\pset format unaligned

\echo '--- A. 向量：必须是 1024 维且能参与 pgvector 检索 ---'
SELECT 'A1 维度=' || vector_dims(vector) FROM postembeddings;
SELECT 'A2 与自身余弦≈1=' || (1 - (vector <=> vector) BETWEEN 0.999 AND 1.001)
FROM postembeddings;

\echo '--- B. R-B：daily_picks.post_id 四种形态 ---'
SELECT 'B1 可映射(非空)=' || count(*) FILTER (WHERE post_id IS NOT NULL) FROM daily_picks;
SELECT 'B2 非法值/孤儿/空 → NULL=' || count(*) FILTER (WHERE post_id IS NULL) FROM daily_picks;
SELECT 'B3 全部 post_id 都指向真实帖子=' ||
       (CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FAIL' END)
FROM daily_picks d LEFT JOIN posts p ON p.id = d.post_id
WHERE d.post_id IS NOT NULL AND p.id IS NULL;

\echo '--- C. 复合唯一：重复点赞与重复题目各只留 1 条 ---'
SELECT 'C1 likes=' || count(*) FROM likes;
SELECT 'C2 interview_questions=' || count(*) FROM interview_questions;

\echo '--- D. 快照语义：author_id 保持原始 ObjectId 字符串，不做 UUID 映射 ---'
SELECT 'D1 posts.author_id=' || author_id FROM posts;
SELECT 'D2 comments.author_id=' || author_id FROM comments;

\echo '--- E. 头像：字符串 → 下标（无法识别回落 0）---'
SELECT 'E1 alice(rose)=' || avatar_gradient FROM users WHERE username = 'alice';
SELECT 'E2 bob(未知色值)=' || avatar_gradient FROM users WHERE username = 'bob';

\echo '--- F. 邮箱归一为小写 / bio 可空 ---'
SELECT 'F1 email=' || email FROM users WHERE username = 'alice';
SELECT 'F2 alice.bio IS NULL=' || (bio IS NULL) FROM users WHERE username = 'alice';
SELECT 'F3 bob.bio=' || coalesce(bio, '(null)') FROM users WHERE username = 'bob';

\echo '--- G. jsonb ---'
SELECT 'G1 trending payload 是数组=' || jsonb_typeof(payload) FROM trending_caches;
SELECT 'G2 roadmap steps.stage-1.status=' || (steps -> 'stage-1' ->> 'status') FROM roadmap_progress;

\echo '--- H. 引用完整性：无孤儿外键 ---'
SELECT 'H1 孤儿 comments=' || count(*) FROM comments c LEFT JOIN posts p ON p.id = c.post_id WHERE p.id IS NULL;
SELECT 'H2 孤儿 likes=' || count(*) FROM likes l LEFT JOIN posts p ON p.id = l.post_id WHERE p.id IS NULL;
SELECT 'H3 孤儿 postembeddings=' || count(*) FROM postembeddings e LEFT JOIN posts p ON p.id = e.post_id WHERE p.id IS NULL;

\echo '--- I. 硬约束反向校验 ---'
SELECT 'I1 pg_cron 不存在=' || (CASE WHEN count(*)=0 THEN 'OK' ELSE 'FAIL' END) FROM pg_extension WHERE extname='pg_cron';
SELECT 'I2 excludes.date 非唯一(同日期 2 条)=' || count(*) FROM daily_pick_excludes WHERE date='2026-02-05';
SELECT 'I3 posts.tags 用 GIN=' || count(*) FROM pg_indexes WHERE tablename='posts' AND indexdef LIKE '%USING gin%';
SELECT 'I4 ai_answer_cache 无 TTL 列=' || (CASE WHEN count(*)=0 THEN 'OK' ELSE 'FAIL' END)
  FROM information_schema.columns WHERE table_name='ai_answer_cache' AND column_name IN ('expires_at','ttl');
