#!/bin/sh
# 定时备份循环（supervisord 托管）：每 BACKUP_INTERVAL_MIN 分钟把同机 Postgres dump 上传私有 HF Dataset。
# 免费档容器文件系统临时，本循环 + db-restore.mjs 构成持久化闭环。
# 备份失败只记录日志不退出（下一轮重试），避免把 Web 与 PG 一起拖死。

BACKUP_INTERVAL_MIN=${BACKUP_INTERVAL_MIN:-30}
SLEEP_SEC=$((BACKUP_INTERVAL_MIN * 60))

if [ "$SLEEP_SEC" -le 0 ]; then
  SLEEP_SEC=1800
fi

echo "[backup] 备份循环启动，间隔 ${BACKUP_INTERVAL_MIN} 分钟"

while true; do
  sleep "$SLEEP_SEC"
  echo "[backup] 开始备份 $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  if node /app/scripts/db-backup.mjs; then
    echo "[backup] 备份完成"
  else
    echo "[backup] 本轮备份失败，下一轮重试" >&2
  fi
done
