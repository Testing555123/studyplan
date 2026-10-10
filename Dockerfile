# StudyPlan 容器构建（T16）：node:24-alpine 多阶段，复用 next.config 的 output:'standalone'。
# 单容器单进程（CMD 仅 node server.js）；PG 由 docker-compose 单独服务承载，绝不进本容器。

# ---------- builder ----------
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable

# 构建期模块顶层会执行 zod 校验，要求 DATABASE_URL 存在（仅校验格式，无需连通）。
ENV DATABASE_URL=postgresql://studyplan:studyplan@localhost:5432/studyplan
ENV NEXT_TELEMETRY_DISABLED=1

# 全量源码（.dockerignore 已排除 node_modules/.next/.model-cache/.git 等无关内容）。
COPY . .

RUN pnpm install --frozen-lockfile

# 方案B：可选预下载本地模型权重进构建期 .model-cache（默认关闭，避免镜像过大/构建期联网失败）。
# 生产通常改用卷挂载注入权重，或构建时传 --build-arg MODELS_PRELOAD=1。
ARG MODELS_PRELOAD=0
RUN mkdir -p /app/.model-cache
RUN if [ "$MODELS_PRELOAD" = "1" ]; then pnpm models:download; fi

RUN pnpm build

# ---------- runner ----------
FROM node:24-alpine AS runner
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
  && mkdir -p /app/.model-cache \
  && chown -R nextjs:nodejs /app/.model-cache

# standalone 产物（output:'standalone' 已包含精简后的 node_modules 与 server.js）。
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 模型权重（若构建期已预下载则存在；否则为空目录，运行时由卷挂载填充）。
COPY --from=builder /app/.model-cache ./.model-cache

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
