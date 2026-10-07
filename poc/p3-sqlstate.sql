-- P1 验证：唯一冲突的 SQLSTATE 与约束名（应用层幂等处理的映射依据）
\echo '=== unique 冲突的 SQLSTATE（对照 Mongo 的 11000）==='

DO $$
DECLARE
  v_state   text;
  v_constraint text;
BEGIN
  BEGIN
    INSERT INTO likes (post_id, user_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001');
    RAISE NOTICE '异常：重复插入竟然成功了';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_constraint = CONSTRAINT_NAME;
    RAISE NOTICE 'SQLSTATE = %   约束名 = %', v_state, v_constraint;
    RAISE NOTICE '>>> 应把 23505 当作「成功幂等」处理（等同 Mongo 的 11000），且不重复计数';
  END;
END
$$;

\echo ''
\echo '=== 复合唯一：nodeId + question（种子幂等灌入的前提）==='
INSERT INTO interview_questions (node_id, question) VALUES ('node-1', '什么是幂等？');
DO $$
DECLARE v_state text;
BEGIN
  BEGIN
    INSERT INTO interview_questions (node_id, question) VALUES ('node-1', '什么是幂等？');
    RAISE NOTICE '异常：重复种子竟然成功了';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
    RAISE NOTICE 'SQLSTATE = % （种子幂等灌入前提成立）', v_state;
  END;
END
$$;

\echo ''
\echo '=== daily_pick_excludes.date 刻意非唯一（硬约束 #2 反向校验）==='
INSERT INTO daily_pick_excludes (repo_id, date, reason) VALUES (111, '2026-10-07', '理由A');
\echo '-- 同一天可有多条不同 repo 的排除记录：预期成功（若被唯一化则硬约束被违反）'
INSERT INTO daily_pick_excludes (repo_id, date, reason) VALUES (222, '2026-10-07', '理由B');
SELECT count(*) AS 同日期记录数 FROM daily_pick_excludes WHERE date = '2026-10-07';
