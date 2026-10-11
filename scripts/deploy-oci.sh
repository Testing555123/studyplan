#!/usr/bin/env bash
# 在 OCI Always Free (ARM) 实例上原生构建并部署 StudyPlan。
# 前置条件：
#   - 实例已安装 docker + docker compose；
#   - /opt/studyplan 已 clone 本仓库，且含 .env（至少 BETTER_AUTH_SECRET / APP_DOMAIN / ACME_EMAIL / DATABASE_URL）。
# 原生 ARM 构建可避免跨平台模拟导致的烘焙权重下载极慢/失败。
set -euo pipefail

REMOTE="${DEPLOY_REMOTE:-ubuntu@<OCI_PUBLIC_IP>}"
APP_DIR="${APP_DIR:-/opt/studyplan}"
BRANCH="${BRANCH:-main}"

# 单引号 heredoc：变量均在远端展开；BRANCH/APP_DIR 通过 bash -s 参数传入，避免本地误展开。
echo "==> SSH 部署到 ${REMOTE}:${APP_DIR} (branch=${BRANCH})"
ssh -o StrictHostKeyChecking=no "$REMOTE" bash -s "$BRANCH" "$APP_DIR" <<'EOF'
set -e
BRANCH="$1"
APP_DIR="$2"
cd "${APP_DIR}"
# 载入 .env 中的 APP_DOMAIN 等变量供后续命令使用
set -a; . ./.env; set +a
git pull origin "${BRANCH}"
docker compose build app
docker compose up -d
sleep 5
docker compose run --rm -e BASE_URL="https://${APP_DOMAIN}" app node scripts/smoke-container.mjs || true
EOF
echo "==> 部署脚本结束"
