#!/usr/bin/env bash
# ============================================================
#  数据库备份
#
#  用法（在 Dokploy 服务器上）：
#    MONGODB_URI='mongodb+srv://...' bash deploy/backup.sh baseline
#    MONGODB_URI='mongodb+srv://...' bash deploy/backup.sh        # 按日期归档
#
#  连接串从环境变量读取（Dokploy 里填在应用的 Environment 或 Schedule 的环境变量中），
#  不再依赖固定路径的明文文件。若环境变量缺失，会退回读取 /opt/studyplan/api.env。
#
#  为什么必须有它：Atlas 的 M0 免费集群**没有平台级自动快照**（要 M10 以上），
#  而上线验证会用真实浏览器跑注册/发帖/评论/点赞，会往生产库写数据。
#  没有备份，这些脏数据只能手工删 —— 而项目又没有管理后台。
# ============================================================
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/studyplan/backups}"
MODE="${1:-daily}"
KEEP_DAYS="${KEEP_DAYS:-7}"

# 优先用环境变量；没有则退回只读一次环境文件（不 export，避免污染）
if [ -z "${MONGODB_URI:-}" ] && [ -r /opt/studyplan/api.env ]; then
  MONGODB_URI="$(grep -E '^MONGODB_URI=' /opt/studyplan/api.env | cut -d= -f2-)"
fi

: "${MONGODB_URI:?❗ 请先设置 MONGODB_URI 环境变量}"

command -v mongodump >/dev/null 2>&1 || {
  echo "❗ 未找到 mongodump。安装：https://www.mongodb.com/try/download/database-tools"
  exit 1
}

mkdir -p "$BACKUP_ROOT"

if [ "$MODE" = "baseline" ]; then
  TARGET="$BACKUP_ROOT/baseline"
  rm -rf "$TARGET"
else
  TARGET="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
fi

echo "▶ 备份到 $TARGET"
# --uri 里若含特殊字符需已做 URL 编码；如密码含 @ : / ? 等请提前转义
mongodump --uri="$MONGODB_URI" --out "$TARGET" --quiet

if [ "$MODE" != "baseline" ]; then
  find "$BACKUP_ROOT" -maxdepth 1 -type d -name '20*' -mtime "+${KEEP_DAYS}" -exec rm -rf {} + || true
fi

echo "✅ 完成：$TARGET（$(du -sh "$TARGET" | cut -f1)）"
