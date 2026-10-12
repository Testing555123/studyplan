#!/bin/sh
# standalone 形态的 Web 启动（supervisord 托管）。
# 逻辑与原 docker-entrypoint.sh 的 standalone 分支一致：校验环境变量 → 迁移 → 起服务。
set -e

echo "==> 校验生产环境变量"
node scripts/check-env.mjs

echo "==> 执行数据库迁移（幂等）"
node scripts/migrate.mjs

echo "==> 启动 Next standalone 服务（PORT=${PORT:-3000}）"
exec node server.js
