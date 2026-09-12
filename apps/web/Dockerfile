# ============================================================
#  前端 Dockerfile（Nuxt 4，SSR）
# ------------------------------------------------------------
#  ⚠️ 构建上下文同样是**仓库根**（Dokploy 里 Docker Context Path 填 `.`）
#
#  Dokploy 配置：
#    Build Type          = Dockerfile
#    Dockerfile Path     = apps/web/Dockerfile
#    Docker Context Path = .
#    Build Time Argument : NUXT_PUBLIC_API_BASE = https://你的域名/api
#    Environment（运行时）: NUXT_PUBLIC_API_BASE / NODE_ENV / HOST / PORT
# ============================================================

ARG NODE_VERSION=24

# ---------- 公共基础层 ----------
FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

# ---------- 依赖层 ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @studyplan/web...

# ---------- 构建层 ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

# 接口地址是**构建期常量**：Nuxt 会把它烘焙进客户端 bundle。
# 用 ARG 接收（Dokploy 的 Build Time Arguments 填的就是它），
# 再转ENV 让 nuxt build 能读到。
# 忘了传 → 线上页面全部请求 localhost，而本地完全看不出来。
ARG NUXT_PUBLIC_API_BASE
ENV NUXT_PUBLIC_API_BASE=$NUXT_PUBLIC_API_BASE
RUN test -n "$NUXT_PUBLIC_API_BASE" || (echo "❗ 必须通过 --build-arg NUXT_PUBLIC_API_BASE=... 注入接口地址" && exit 1)

RUN pnpm --filter @studyplan/shared build
RUN pnpm --filter @studyplan/web build

# ---------- 生产依赖层 ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @studyplan/web...

# ---------- 运行层 ----------
FROM node:${NODE_VERSION}-alpine AS runtime
# HOST 必须是 0.0.0.0：Traefik 通过 Docker 网络访问容器，
# 绑 127.0.0.1 会导致"部署成功但站点 502"，且容器日志一切正常 —— 极难排查
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Nitro 的 SSR 产物
COPY --from=build /app/apps/web/.output ./apps/web/.output

COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
