-- =============================================================================
-- P31 · 密码哈希保护的 SQL 层验证
-- =============================================================================
-- TECH-SELECTION.md §8.5.3 断言「PG 无 select:false 等价物」。
-- 本脚本实测：**PG 有原生等价物 —— 列级 GRANT/REVOKE**。
-- 它是唯一能被数据库强制的闸门（应用层检查可以被遗忘，权限不能），
-- 因此值得实测一次，把「能不能用」和「代价是什么」都测出来，再决定是否采纳。
--
-- 运行（在容器内）：
--   docker cp poc/p31-password-gates.sql studyplan-pg:/tmp/
--   docker exec studyplan-pg psql -U postgres -d poc_p31 -f /tmp/p31-password-gates.sql
-- =============================================================================

\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

DROP ROLE IF EXISTS p31_app;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  username        text NOT NULL,
  password_hash   text NOT NULL,
  bio             text,
  avatar_gradient smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (email, username, password_hash)
VALUES ('p31@example.com', 'p31user', '$2b$10$fakehash');

\echo ''
\echo '=== 基线：超级用户 SELECT * 会带出 password_hash ==='
SELECT 'baseline_has_password_hash=' || count(*)
FROM (SELECT * FROM users) t
WHERE to_jsonb(t) ? 'password_hash';

\echo ''
\echo '=== 方案：建一个不含 password_hash 列权限的角色 ==='
CREATE ROLE p31_app LOGIN;
GRANT USAGE ON SCHEMA public TO p31_app;
-- 关键：只授予「公开列」的 SELECT，**不授** password_hash
GRANT SELECT (id, email, username, bio, avatar_gradient, created_at) ON users TO p31_app;

\echo '-- 切换到受限角色，验证三种查询形态'

SET ROLE p31_app;

\echo '-- ① 显式公开列清单 → 应当成功'
SELECT 'explicit_public_cols=' || count(*) FROM (SELECT id, email, username FROM users) t;

\echo '-- ② SELECT * → 期望被拒（这就是 select:false 的效果）'
SELECT * FROM users;

\echo '-- ③ 显式点名 password_hash → 期望被拒'
SELECT password_hash FROM users;

RESET ROLE;

\echo ''
\echo '=== 结论核对：列级权限是否真的挡住了 password_hash ==='
SELECT 'has_column_privilege_SELECT_password_hash=' ||
       has_column_privilege('p31_app', 'users', 'password_hash', 'SELECT');
SELECT 'has_column_privilege_SELECT_username=' ||
       has_column_privilege('p31_app', 'users', 'username', 'SELECT');
SELECT 'has_table_privilege_SELECT_users=' ||
       has_table_privilege('p31_app', 'users', 'SELECT');

\echo ''
\echo '=== 代价核对：受限角色能否做写操作（注册/改资料）==='
SELECT 'can_insert=' || has_table_privilege('p31_app', 'users', 'INSERT');
SELECT 'can_update=' || has_table_privilege('p31_app', 'users', 'UPDATE');

\echo ''
\echo '=== 清理 ==='
REVOKE ALL ON users FROM p31_app;
REVOKE USAGE ON SCHEMA public FROM p31_app;
DROP ROLE p31_app;
