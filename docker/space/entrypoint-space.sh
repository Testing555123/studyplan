#!/bin/sh
# HF Spaces 单容器入口（RUNTIME_FLAVOR=space）。
#
# 职责：把容器降到 UID 1000 运行（Space 要求非 root，且 postgres 拒绝 root 启动），
# 然后把 postgres / next / 备份循环交给 supervisord 托管；任一子进程崩溃自动重启。
#
# 冷启动顺序由各 program 脚本自行保证：
#   postgres-run.sh：initdb（幂等）→ 建库 → CREATE EXTENSION vector → 前台起 PG
#   start-next.sh  ：pg_isready 轮询 → db-restore（无备份则跳过）→ check-env → migrate → node server.js
#   backup-loop.sh ：每 BACKUP_INTERVAL_MIN 分钟 pg_dump 上传私有 HF Dataset
set -e

# 1) 以 root 启动时降权到 UID 1000（镜像内用户 nextjs 即 UID 1000）。
if [ "$(id -u)" = "0" ]; then
  echo "[space] 以 root 启动，降权到 UID 1000 后重新执行"
  chown -R nextjs "${PGDATA:-/app/data/pg}" /var/run/postgresql /app/.next 2>/dev/null || true
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=1000 --regid=1000 --init-groups "$0" "$@"
  fi
  # setpriv 缺失时的兜底（util-linux 通常自带，仅防御）。
  exec su nextjs -s /bin/sh -c "\"$0\""
fi

echo "[space] 启动 supervisord（postgres + next + dbbackup）"
exec supervisord -c /app/docker/space/supervisord.conf
