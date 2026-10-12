# StudyPlan 容器构建（T16）：多阶段 + 双运行形态（RUNTIME_FLAVOR）。
#
#   standalone（默认，等价改造前行为）：node:24-alpine，单进程 node server.js，
#     PG 由外部服务承载（本地 docker compose 的 postgres / OCI 自管库），端口 3000。
#   space（免卡免费托管：HF Spaces Docker SDK）：pgvector/pgvector:pg16，
#     容器内同机跑 postgres+pgvector 与 Next.js（supervisord 托管双进程），端口 7860，
#     编排文件见 docker/space/，模型权重建议 MODELS_PRELOAD=1 烘焙进镜像。
#
# 用法：
#   docker build -t studyplan:standalone .
#   docker build --build-arg RUNTIME_FLAVOR=space --build-arg MODELS_PRELOAD=1 \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://<user>-<space>.hf.space -t studyplan:space .

ARG RUNTIME_FLAVOR=standalone

# ---------- builder（两种形态共用） ----------
# BUILDER_IMAGE 可在受限网络下换成已在本机/私有源存在的等价 Node 镜像（如 node:24-slim）。
ARG BUILDER_IMAGE=node:24-alpine
FROM ${BUILDER_IMAGE} AS builder
WORKDIR /app

RUN corepack enable

# 构建期模块顶层会执行 zod 校验，要求 DATABASE_URL 存在（仅校验格式，无需连通）。
ENV DATABASE_URL=postgresql://studyplan:studyplan@localhost:5432/studyplan
ENV NEXT_TELEMETRY_DISABLED=1

# 站点绝对地址（sitemap/robots/layout 用 NEXT_PUBLIC_SITE_URL，build 期内联）。
# 默认必须是合法 URL：ARG 会以环境变量形式出现在 RUN 中，空串会让 `new URL('')` 抛 ERR_INVALID_URL
# （next build 阶段即失败，已实测）。
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
# 权重下载镜像源：默认走 hf-mirror.com（受限网络）；传空串则直连 huggingface.co。
ARG HF_ENDPOINT=https://hf-mirror.com

# 全量源码（.dockerignore 已排除 node_modules/.next/.model-cache/.git 等无关内容）。
COPY . .

RUN pnpm install --frozen-lockfile

# 方案B：可选预下载本地模型权重进构建期 .model-cache（默认关闭，避免镜像过大/构建期联网失败）。
# Space 形态通常置 1（容器文件系统临时，运行期再拉 1.2GB 权重会让冷启动慢到分钟级）。
# ⚠ MODELS_PRELOAD=1 时 builder 必须是 glibc 镜像（如 --build-arg BUILDER_IMAGE=node:24-slim）：
#   onnxruntime-node 只发布 glibc 二进制，在 alpine(musl) 上加载会报
#   ERR_DLOPEN_FAILED: ld-linux-x86-64.so.2 not found（已实测）。
ARG MODELS_PRELOAD=0
RUN mkdir -p /app/.model-cache
RUN if [ "$MODELS_PRELOAD" = "1" ]; then pnpm models:download; fi

# 以下两个包既进不了 Turbopack 的 server bundle，也不会被 Next standalone 的 file tracing 带上，
# 但运行期必须真实存在（实测均报 MODULE_NOT_FOUND / Cannot find module）：
#   - drizzle-orm      ：scripts/migrate.mjs（裸 node 脚本）依赖
#   - onnxruntime-node ：@huggingface/transformers 在 Node 下的推理后端（含原生 .so）
# 故在 builder 里「解引用」复制一份，装配阶段放进运行镜像的 node_modules。
# 注意：必须放在权重下载之后，避免让耗时的下载层失效。
# 用 .pnpm 真实路径定位（pnpm 严格布局下二者不一定在顶层 node_modules），cp -rL 解引用复制。
RUN mkdir -p /app/.runtime-deps \
  && DRIZZLE_DIR=$(ls -d /app/node_modules/.pnpm/drizzle-orm@*/node_modules/drizzle-orm | head -1) \
  && ORT_DIR=$(ls -d /app/node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node | head -1) \
  && ORT_COMMON_DIR=$(ls -d /app/node_modules/.pnpm/onnxruntime-common@*/node_modules/onnxruntime-common | head -1) \
  && cp -rL "$DRIZZLE_DIR" /app/.runtime-deps/drizzle-orm \
  && cp -rL "$ORT_DIR" /app/.runtime-deps/onnxruntime-node \
  && cp -rL "$ORT_COMMON_DIR" /app/.runtime-deps/onnxruntime-common

RUN pnpm build

# ---------- runner: standalone（默认形态，行为不变） ----------
FROM node:24-alpine AS runner-standalone
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 方案B：本地模型权重目录（避开 pnpm 会清空的 .cache）。生产用卷挂载此目录注入权重。
ENV MODEL_CACHE_DIR=/app/.model-cache
ENV LOCAL_MODELS_ONLY=1

RUN addgroup -S nodejs \
  && adduser -S nextjs -G nodejs \
  && mkdir -p /app/.model-cache /app/public \
  && chown -R nextjs:nodejs /app/.model-cache /app/public

# 嵌入代理服务需要 supervisord 托管双进程（next + embed-proxy）。
RUN apk add --no-cache supervisor

EXPOSE 3000

# ---------- runner: space（HF Spaces 单容器：PG + Next 同机） ----------
FROM pgvector/pgvector:pg16 AS runner-space

# Node 运行时：官方 tarball（与 builder 的 alpine 解耦，产物为纯 JS，跨 libc 无风险）。
# 版本需满足 package.json engines（node >=22.19）。
ARG NODE_VERSION=22.20.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl xz-utils supervisor \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
  && tar -xJ -f /tmp/node.tar.xz -C /usr/local --strip-components=1 \
  && rm -f /tmp/node.tar.xz \
  && node -v

# 关键：postgres 系列基础镜像带 ENTRYPOINT docker-entrypoint.sh（内部会自己 initdb），
# 不清空会让 CMD 被它吞掉，导致容器根本不启动我们的编排脚本。
ENTRYPOINT []

# 统一以 UID 1000 运行：Space 要求非 root，且 postgres 拒绝 root 启动。
# Debian 基础镜像通常无 UID 1000，useradd 失败则说明已存在同名/同号用户，忽略即可。
RUN (useradd -m -u 1000 -U -s /bin/sh nextjs || true)

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

# 本地模型权重：镜像内烘焙（MODELS_PRELOAD=1），运行期离线只读加载。
ENV MODEL_CACHE_DIR=/app/.model-cache
ENV LOCAL_MODELS_ONLY=1

# 同机 Postgres：容器内 127.0.0.1:5432，数据目录落在 /app/data/pg（临时文件系统，靠备份闭环）。
ENV PGDATA=/app/data/pg
ENV PGUSER=studyplan
ENV PGDATABASE=studyplan
ENV DATABASE_URL=postgresql://studyplan:studyplan@127.0.0.1:5432/studyplan

# PG 需要 unix socket 目录可写；应用需要 .next/cache 可写。
RUN mkdir -p /app/.model-cache /app/public /app/data/pg /app/.next/cache /var/run/postgresql \
  && chown -R nextjs /app /var/run/postgresql

EXPOSE 7860

# ---------- 公共产物装配 ----------
FROM runner-${RUNTIME_FLAVOR} AS runner
ARG RUNTIME_FLAVOR=standalone
ARG MODELS_PRELOAD=0

WORKDIR /app

# 运行期据此分派入口脚本（standalone → 原逻辑；space → docker/space/entrypoint-space.sh）。
ENV RUNTIME_FLAVOR=${RUNTIME_FLAVOR}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV MODEL_CACHE_DIR=/app/.model-cache
ENV LOCAL_MODELS_ONLY=1

# standalone 产物（output:'standalone' 已包含精简后的 node_modules 与 server.js）。
COPY --from=builder /app/.next/standalone ./
# 迁移脚本与 ONNX 推理后端依赖（standalone tracing 未包含，见 builder 阶段说明）。
COPY --from=builder /app/.runtime-deps/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/.runtime-deps/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=builder /app/.runtime-deps/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=builder /app/.next/static ./.next/static
# P0-1：public 已存在（仓库 public/.gitkeep），此处 mkdir 兜底杜绝 COPY 失败。
COPY --from=builder /app/public ./public

# 迁移与启动所需：drizzle 迁移文件 + 程序化迁移脚本 + 环境变量校验脚本 + 启动入口。
COPY --from=builder /app/drizzle ./drizzle
# 本地模型权重：仅当构建期 MODELS_PRELOAD=1 才非空（线上烘焙方案由此带入运行镜像）。
COPY --from=builder /app/.model-cache ./.model-cache
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/scripts/check-env.mjs ./scripts/check-env.mjs
# 备份/恢复脚本（space 形态的持久化闭环；standalone 形态不会被调用）。
COPY --from=builder /app/scripts/db-backup.mjs ./scripts/db-backup.mjs
COPY --from=builder /app/scripts/db-restore.mjs ./scripts/db-restore.mjs
# 备份存储后端（GitHub Contents API 封装）。
COPY --from=builder /app/scripts/lib ./scripts/lib
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
# space 形态的同机编排（standalone 形态下不参与启动，无副作用）。
COPY --from=builder /app/docker ./docker

# 嵌入代理服务（services/embed-proxy，Express + TypeScript）：
# 在 runner 内现场构建（两形态均带 node+npm；受限网络环境可改为 COPY 预构建产物）。
# 只 COPY 构建所需源文件，node_modules/dist 不进上下文（见 .dockerignore）。
COPY --from=builder /app/services/embed-proxy/package.json ./services/embed-proxy/package.json
COPY --from=builder /app/services/embed-proxy/package-lock.json ./services/embed-proxy/package-lock.json
COPY --from=builder /app/services/embed-proxy/tsconfig.json ./services/embed-proxy/tsconfig.json
COPY --from=builder /app/services/embed-proxy/src ./services/embed-proxy/src
# 全量安装（runner 阶段 NODE_ENV=production 会跳过 devDependencies，故显式 --include=dev
# 带上 typescript）→ 构建 → 剪掉 devDependencies，控制运行镜像体积。
RUN cd services/embed-proxy \
  && npm ci --include=dev \
  && npm run build \
  && npm prune --omit=dev

# Next 运行期会写 .next/cache（ISR/fetch cache），必须给运行用户写权限。
RUN mkdir -p /app/.next/cache \
  && chown -R nextjs /app/.next /app/.model-cache /app/public \
  && chmod +x ./docker-entrypoint.sh \
  && chmod +x ./docker/space/*.sh \
  && chmod +x ./docker/standalone/*.sh

USER nextjs

# P0-2：入口脚本统一分派，space 形态下先起 PG、恢复备份、迁移，再起 Web（失败即非零退出）。
CMD ["sh", "docker-entrypoint.sh"]
