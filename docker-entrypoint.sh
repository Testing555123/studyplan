#!/bin/sh
# StudyPlan 容器启动入口（双形态分派，见 Dockerfile 的 RUNTIME_FLAVOR）：
#   standalone（默认）：先校验生产环境变量、再迁移数据库、最后启动服务（PG 由外部服务承载）。
#   space：转交 docker/space/entrypoint-space.sh（同机起 PG → 恢复备份 → 迁移 → 起 Web）。
# 使用 exec 让被启动的进程接管 PID 1，正确接收终止信号（SIGTERM 等）。
set -e

if [ "${RUNTIME_FLAVOR:-standalone}" = "space" ]; then
  echo "==> space 形态：转交 docker/space/entrypoint-space.sh"
  exec sh /app/docker/space/entrypoint-space.sh "$@"
fi

echo "==> 校验生产环境变量"
node scripts/check-env.mjs

echo "==> 执行数据库迁移（幂等）"
node scripts/migrate.mjs

echo "==> 启动 Next standalone 服务"
exec node server.js
