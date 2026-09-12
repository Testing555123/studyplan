# ============================================================
#  后端 Dockerfile（NestJS 11）
# ------------------------------------------------------------
#  ⚠️ 本文件的**构建上下文必须是仓库根**（Dokploy 里 Docker Context Path 填 `.`）：
#     因为 apps/api 通过 workspace:* 依赖 packages/shared，
#     上下文若设成 apps/api，就 COPY 不到 packages/，构建必然失败。
#
#  Dokploy 配置：
#    Build Type        = Dockerfile
#    Dockerfile Path   = apps/api/Dockerfile
#    Docker Context Path = .
# ============================================================

ARG NODE_VERSION=24

# ---------- 公共基础层 ----------
FROM node:${NODE_VERSION}-alpine AS base
# pnpm 走 corepack（Node 自带），并锁定与 packageManager 一致的版本，
# 避免"本地 11.20、服务器 10.x"这类只在 CI 里才出现的差异
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

# ---------- 依赖层（单独一层，最大化构建缓存）----------
# 只复制"清单文件"：源码变了不会触发重装依赖，构建时间能从 3 分钟降到 20 秒
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# --filter @studyplan/api... 的「...」很关键：它把 workspace 内部的 shared 一并装入
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @studyplan/api...

# ---------- 构建层 ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
# 顺序不能反：shared 是 workspace 内部依赖，子包构建时读的是它的 dist
RUN pnpm --filter @studyplan/shared build
RUN pnpm --filter @studyplan/api build

# ---------- 生产依赖层 ----------
# 与 deps 分开：这里只要 prod 依赖，镜像不含 typescript/jest 等
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @studyplan/api...

# ---------- 运行层 ----------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules

# ⚠️ 这里**没有** packages/shared/node_modules，不是漏写：
#    shared 是纯类型 + 常量的包，运行时零依赖（只有 typescript 这个 devDependency），
#    因此 `pnpm install --prod` 不会为它创建 node_modules 目录 ——
#    去 COPY 一个不存在的路径会让构建直接失败。
#    它运行时只需要 dist（下面会拷）与 package.json。

# 只搬构建产物，不搬源码：镜像里没有 .ts，也就没有源码泄漏面
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# 运行时解析 @studyplan/shared 需要各自的 package.json
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# 容器内监听 3000。这个端口不会 publish 到宿主，
# 外部流量一律经 Traefik（80/443）进来
EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
