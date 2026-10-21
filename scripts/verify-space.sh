#!/bin/sh
# space 形态本地一键冒烟：构建 → 运行 → 健康/端点冒烟 → pgvector 断言 → 打印日志 → 清理容器。
#
# 覆盖 docs/deploy/huggingface-spaces.md §6 的「本地等价验证」，任何有 Docker 的机器都能跑，
# 无需 HF 账号。默认不烘焙权重（分钟级）；置 MODELS_PRELOAD=1 可一并验证离线权重加载。
#
# 用法：
#   sh scripts/verify-space.sh                          # 快速验证（不下载权重）
#   MODELS_PRELOAD=1 sh scripts/verify-space.sh         # 含 1.2GB 权重烘焙，验证 LOCAL_MODELS_ONLY 离线加载
#   BUILDER_IMAGE=node:24-slim sh scripts/verify-space.sh   # Docker Hub 不可达时换本地已有镜像
#   KEEP=1 sh scripts/verify-space.sh                   # 验证后保留容器以便排查
set -e

IMAGE=${IMAGE:-studyplan:space-verify}
CONTAINER=${CONTAINER:-studyplan-space-verify}
APP_PORT=${APP_PORT:-7860}
MODELS_PRELOAD=${MODELS_PRELOAD:-0}
# 烘焙权重需要 glibc builder（onnxruntime-node 只有 glibc 二进制，alpine 下会 ERR_DLOPEN_FAILED）。
if [ -z "${BUILDER_IMAGE:-}" ]; then
  if [ "$MODELS_PRELOAD" = "1" ]; then
    BUILDER_IMAGE=node:24.22.1-slim
  else
    BUILDER_IMAGE=node:24.22.1-alpine
  fi
fi
KEEP=${KEEP:-0}
PGREADY_TIMEOUT=${PGREADY_TIMEOUT:-120}
# 生产 fail-fast 要求 secret ≥32 位且 URL 为 https；本地验证用一次性随机值即可。
VERIFY_SECRET=${VERIFY_SECRET:-"local-verify-secret-0123456789abcdefghijklmnop"}
VERIFY_URL=${VERIFY_URL:-https://local-verify.invalid}

echo "==> [1/5] 构建 space 形态镜像（MODELS_PRELOAD=$MODELS_PRELOAD，builder=$BUILDER_IMAGE）"
docker build \
  --build-arg RUNTIME_FLAVOR=space \
  --build-arg MODELS_PRELOAD="$MODELS_PRELOAD" \
  --build-arg BUILDER_IMAGE="$BUILDER_IMAGE" \
  -t "$IMAGE" .

echo "==> [2/5] 启动容器（宿主端口 $APP_PORT → 容器 7860）"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -p "$APP_PORT":7860 \
  -e BETTER_AUTH_SECRET="$VERIFY_SECRET" \
  -e BETTER_AUTH_URL="$VERIFY_URL" \
  -e PGREADY_TIMEOUT="$PGREADY_TIMEOUT" \
  "$IMAGE"

cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "==> 保留容器 $CONTAINER（排查后请手动 docker rm -f $CONTAINER）"
    docker logs --tail 80 "$CONTAINER" || true
    return 0
  fi
  echo "==> [5/5] 清理容器"
  docker logs --tail 40 "$CONTAINER" || true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> [3/5] 端点冒烟（/api/health、/、/ebook、/ai）"
APP_PORT="$APP_PORT" node scripts/smoke-container.mjs

echo "==> [4/5] 同机 pgvector 断言"
docker exec "$CONTAINER" psql -U studyplan -d studyplan -tAc \
  "SELECT extname FROM pg_extension WHERE extname='vector';" | tee /tmp/space-verify-vector.txt
if ! grep -q vector /tmp/space-verify-vector.txt; then
  echo "pgvector 扩展缺失，冒烟失败" >&2
  exit 1
fi
rm -f /tmp/space-verify-vector.txt

echo "==> 冒烟通过：health 已就绪且同机 pgvector 生效"
