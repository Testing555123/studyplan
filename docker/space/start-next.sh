#!/bin/sh
# Space 形态的 Web 启动（supervisord 托管）。
# 与 postgres 并行启动，靠 pg_isready 轮询对齐依赖顺序，避免迁移打在未就绪的库上。
set -e

PGUSER=${PGUSER:-studyplan}
PGDATABASE=${PGDATABASE:-studyplan}
PGREADY_TIMEOUT=${PGREADY_TIMEOUT:-120}

echo "[next] 等待 Postgres 就绪（最多 ${PGREADY_TIMEOUT}s）"
i=0
until pg_isready -h 127.0.0.1 -p 5432 -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$PGREADY_TIMEOUT" ]; then
    echo "[next] Postgres 未在 ${PGREADY_TIMEOUT}s 内就绪，放弃启动" >&2
    exit 1
  fi
  sleep 1
done

# 冷启动数据恢复：无备份则跳过（降级为空库 + 迁移），失败不阻断启动。
echo "[next] 尝试从备份恢复（无备份则跳过）"
if ! node scripts/db-restore.mjs; then
  echo "[next] 备份恢复跳过/失败，按空库继续（降级）" >&2
fi

echo "==> 校验生产环境变量"
node scripts/check-env.mjs

echo "==> 执行数据库迁移（幂等）"
node scripts/migrate.mjs

echo "==> 启动 Next standalone 服务（PORT=${PORT:-7860}）"
exec node server.js
