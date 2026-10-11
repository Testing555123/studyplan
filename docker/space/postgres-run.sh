#!/bin/sh
# 同机 Postgres 启动（supervisord 托管，前台运行，崩溃自动重启）。
#
# 容器文件系统是临时的（免费档无持久卷），因此每次冷启动都会命中 initdb 分支：
#   initdb → 临时实例建库 + CREATE EXTENSION vector → 关闭 → 前台 postgres 接管。
# 数据本身由 db-restore.mjs（冷启动恢复）与 db-backup.mjs（定时上传）闭环保证。
set -e

PGDATA=${PGDATA:-/app/data/pg}
PGUSER=${PGUSER:-studyplan}
PGDATABASE=${PGDATABASE:-studyplan}
PGSOCKET_DIR=${PGSOCKET_DIR:-/var/run/postgresql}

mkdir -p "$PGDATA" "$PGSOCKET_DIR"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[postgres] 数据目录为空，初始化：$PGDATA"
  initdb -D "$PGDATA" -U "$PGUSER" --auth=trust -E UTF8 --locale=C

  echo "[postgres] 临时实例建库与扩展"
  pg_ctl -D "$PGDATA" -w -o "-c listen_addresses='' -c unix_socket_directories='$PGSOCKET_DIR'" start

  if ! psql -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$PGDATABASE'" | grep -q 1; then
    createdb -U "$PGUSER" "$PGDATABASE"
  fi

  psql -U "$PGUSER" -d "$PGDATABASE" -c 'CREATE EXTENSION IF NOT EXISTS vector;'

  pg_ctl -D "$PGDATA" -m fast -w stop
  echo "[postgres] 初始化完成"
fi

echo "[postgres] 前台启动：127.0.0.1:5432（socket=$PGSOCKET_DIR）"
exec postgres -D "$PGDATA" -h 127.0.0.1 -p 5432 -k "$PGSOCKET_DIR"
