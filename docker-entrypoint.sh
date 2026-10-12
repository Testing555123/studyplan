#!/bin/sh
# StudyPlan 容器启动入口（双形态分派，见 Dockerfile 的 RUNTIME_FLAVOR）：
#   standalone（默认）：转交 supervisord 托管双进程（next + embed-proxy）；
#     原「校验环境变量 → 迁移 → 起服务」逻辑迁至 docker/standalone/start-next.sh。
#   space：转交 docker/space/entrypoint-space.sh（同机起 PG → 恢复备份 → 迁移 → 起 Web）。
# supervisord 以 nodaemon 运行并接管 PID 1，正确接收终止信号（SIGTERM 等）。
set -e

if [ "${RUNTIME_FLAVOR:-standalone}" = "space" ]; then
  echo "==> space 形态：转交 docker/space/entrypoint-space.sh"
  exec sh /app/docker/space/entrypoint-space.sh "$@"
fi

echo "==> 启动 supervisord（next + embed-proxy）"
exec supervisord -c /app/docker/standalone/supervisord.conf
