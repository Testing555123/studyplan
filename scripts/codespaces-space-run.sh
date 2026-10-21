#!/bin/sh
# GitHub Codespaces 部署编排（space 形态单容器，见 docs/deploy/codespaces.md）。
#
# 职责（幂等，可重复执行）：
#   1. 由 $CODESPACE_NAME 推导转发地址，作为 NEXT_PUBLIC_SITE_URL（构建期）与 BETTER_AUTH_URL（运行期）；
#   2. 镜像不存在时构建 RUNTIME_FLAVOR=space 镜像（层缓存使重复构建很快）；
#   3. 容器未运行时以命名卷 + 环境变量拉起；已运行则跳过；
#   4. 轮询 /api/health，超时输出容器日志排查提示。
#
# 环境变量（均可在 Codespaces Secrets / devcontainer 配置中覆盖）：
#   MODELS_PRELOAD       =0（默认，快速构建，运行期联网拉权重）或 =1（烘焙权重离线运行，自动用 glibc builder）
#   BETTER_AUTH_SECRET   优先取 Codespaces Secret；缺省自动生成并持久化到 .codespaces-secret（已 gitignore）
#   HF_ENDPOINT          构建期权重下载源（MODELS_PRELOAD=1 时有效）；默认 https://hf-mirror.com（Dockerfile 默认值）
#   CODESPACE_DOMAIN     转发域名后缀，默认 app.github.dev（GitHub 默认，一般无需设置）
#   CONTAINER_NAME       容器名，默认 studyplan-space
#   IMAGE_NAME           镜像名，默认 studyplan:space
set -eu

APP_PORT=7860
CONTAINER_NAME=${CONTAINER_NAME:-studyplan-space}
IMAGE_NAME=${IMAGE_NAME:-studyplan:space}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

# ---------- 1) 推导转发地址 ----------
if [ -n "${CODESPACE_NAME:-}" ]; then
  SITE_URL="https://${CODESPACE_NAME}-${APP_PORT}.${CODESPACE_DOMAIN:-app.github.dev}"
else
  # 非 Codespaces 环境兜底（本地调试脚本用）：直连本机端口。
  SITE_URL="http://localhost:${APP_PORT}"
  echo "[codespaces] 未检测到 CODESPACE_NAME，降级为 ${SITE_URL}"
fi
echo "[codespaces] 站点地址：${SITE_URL}"

# ---------- 2) 构建镜像（如缺失） ----------
if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[codespaces] 镜像 ${IMAGE_NAME} 已存在，跳过构建"
else
  BUILD_ARGS="--build-arg RUNTIME_FLAVOR=space --build-arg NEXT_PUBLIC_SITE_URL=${SITE_URL}"
  if [ "${MODELS_PRELOAD:-0}" = "1" ]; then
    # onnxruntime-node 仅发布 glibc 二进制，烘焙权重必须换 glibc builder（见 Dockerfile 注释）。
    BUILD_ARGS="$BUILD_ARGS --build-arg MODELS_PRELOAD=1 --build-arg BUILDER_IMAGE=node:24.22.1-slim"
    [ -n "${HF_ENDPOINT:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg HF_ENDPOINT=${HF_ENDPOINT}"
    echo "[codespaces] 构建 ${IMAGE_NAME}（烘焙模型权重，耗时较长）..."
  else
    echo "[codespaces] 构建 ${IMAGE_NAME}（不烘焙权重，快速模式）..."
  fi
  # shellcheck disable=SC2086
  docker build $BUILD_ARGS -t "$IMAGE_NAME" "$REPO_ROOT"
fi

# ---------- 3) 准备 BETTER_AUTH_SECRET ----------
SECRET_FILE="$REPO_ROOT/.codespaces-secret"
if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  if [ -f "$SECRET_FILE" ]; then
    BETTER_AUTH_SECRET=$(cat "$SECRET_FILE")
  else
    BETTER_AUTH_SECRET=$(openssl rand -hex 32)
    printf '%s' "$BETTER_AUTH_SECRET" > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "[codespaces] 已生成随机 BETTER_AUTH_SECRET 并保存到 ${SECRET_FILE}"
  fi
fi

# ---------- 4) 拉起容器（如未运行） ----------
if [ "$(docker ps -q -f "name=^/${CONTAINER_NAME}$")" != "" ]; then
  echo "[codespaces] 容器 ${CONTAINER_NAME} 已在运行，跳过启动"
else
  # 残留的已停止容器先清掉，避免名字冲突。
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  echo "[codespaces] 启动容器 ${CONTAINER_NAME}..."
  # 命名卷持久化：PG 数据 / 模型权重缓存；备份循环以超大间隔变相禁用（演示场景）。
  docker run -d --name "$CONTAINER_NAME" \
    -p "${APP_PORT}:${APP_PORT}" \
    -e PORT="$APP_PORT" \
    -e BETTER_AUTH_URL="$SITE_URL" \
    -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
    -e LOCAL_MODELS_ONLY=${LOCAL_MODELS_ONLY:-false} \
    -e BACKUP_INTERVAL_MIN=${BACKUP_INTERVAL_MIN:-525600} \
    -v studyplan-cs-pgdata:/app/data/pg \
    -v studyplan-cs-models:/app/.model-cache \
    "$IMAGE_NAME" >/dev/null
fi

# ---------- 5) 健康检查 ----------
echo "[codespaces] 等待 ${SITE_URL}/api/health 就绪（最多 ${HEALTH_TIMEOUT}s）..."
i=0
until curl -fsS "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$HEALTH_TIMEOUT" ]; then
    echo "[codespaces] 健康检查超时，输出容器日志排查：" >&2
    docker logs --tail 100 "$CONTAINER_NAME" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "[codespaces] 就绪！在浏览器打开（Ports 面板也可访问）：${SITE_URL}"
