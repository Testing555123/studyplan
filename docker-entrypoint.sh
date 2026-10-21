#!/bin/sh
# StudyPlan 容器启动入口（双形态分派，见 Dockerfile 的 RUNTIME_FLAVOR）：
#   standalone（默认）：转交 supervisord 托管双进程（next + embed-proxy）；
#     原「校验环境变量 → 迁移 → 起服务」逻辑迁至 docker/standalone/start-next.sh。
#   space：转交 docker/space/entrypoint-space.sh（同机起 PG → 恢复备份 → 迁移 → 起 Web）。
# supervisord 以 nodaemon 运行并接管 PID 1，正确接收终止信号（SIGTERM 等）。
set -e

# 打印**运行时**的 Node 版本。
# 为什么值得打这一行：Node 的安全补丁只在运行时生效，而"线上实例里跑的是哪个 Node"
# 平时是不可观测的——镜像是构建产物，构建期用的版本不等于运行进程加载的版本
# （缓存层、回滚、多形态都会让两者不同）。有了这行日志，以后遇到官方安全发布，
# 查一次容器日志就能判定是否受影响，不必靠"构建时间"间接推断。
echo "==> Node 运行时：$(node -v 2>/dev/null || echo 'node 不可用')"

if [ "${RUNTIME_FLAVOR:-standalone}" = "space" ]; then
  echo "==> space 形态：转交 docker/space/entrypoint-space.sh"
  exec sh /app/docker/space/entrypoint-space.sh "$@"
fi

echo "==> 启动 supervisord（next + embed-proxy）"
exec supervisord -c /app/docker/standalone/supervisord.conf
