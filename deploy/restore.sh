#!/usr/bin/env bash
# ============================================================
#  数据库恢复
#
#  用法：
#    MONGODB_URI='...' bash deploy/restore.sh baseline          # 回到干净基线
#    MONGODB_URI='...' bash deploy/restore.sh 20260912-040000   # 回到某次归档
#    bash deploy/restore.sh --list                              # 列出可用备份
#
#  ⚠️ 恢复会先清空现有数据（--drop），不可撤销。
#     脚本会要求你手动输入备份目录名再执行一次确认。
# ============================================================
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/opt/studyplan/backups}"

if [ "${1:-}" = "--list" ] || [ -z "${1:-}" ]; then
  echo "可用备份："
  ls -1 "$BACKUP_ROOT" 2>/dev/null | sed 's/^/  /' || echo "  （无）"
  echo
  echo "用法：MONGODB_URI='...' bash deploy/restore.sh <备份目录名>"
  exit 0
fi

NAME="$1"
TARGET="$BACKUP_ROOT/$NAME"
[ -d "$TARGET" ] || { echo "❌ 找不到备份：$TARGET"; exit 1; }

if [ -z "${MONGODB_URI:-}" ] && [ -r /opt/studyplan/api.env ]; then
  MONGODB_URI="$(grep -E '^MONGODB_URI=' /opt/studyplan/api.env | cut -d= -f2-)"
fi
: "${MONGODB_URI:?❗ 请先设置 MONGODB_URI 环境变量}"

echo "⚠️  即将把数据库恢复到：$TARGET"
echo "    这会清空现有数据（--drop），且不可撤销。"
read -r -p "    输入备份名以确认（$NAME）： " confirm
[ "$confirm" = "$NAME" ] || { echo "确认不匹配，已取消。"; exit 1; }

mongorestore --uri="$MONGODB_URI" --drop --quiet "$TARGET"
echo "✅ 已恢复到：$NAME"
