---
name: Wave0+Wave1 多Agent式落地计划
overview: 按 docs/TASK-DECOMPOSITION.md 的 Wave 0 + Wave 1 执行：主代理以「文件独占 + 共享契约冻结」的方式，顺序落地 T0(共享契约基座) → T1(数据访问基座)/T2(日志脱敏) → T3–T9 七个核心任务。本轮不含 Wave2(T10–T14)/Wave3(T15/T16)。冲突处按用户决定：建立 packages/shared 工作区子包与 @shared/* 别名。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - Modern Minimalism
    - Glassmorphism
    - Clean Content Community
    - Soft Gradient
    - Dark/Light Adaptive
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 40px
      weight: 700
    subheading:
      size: 20px
      weight: 600
    body:
      size: 16px
      weight: 400
  colorSystem:
    primary:
      - "#4F46E5"
      - "#6366F1"
      - "#818CF8"
    background:
      - "#F8FAFC"
      - "#0B0F19"
      - "#FFFFFF"
    text:
      - "#0F172A"
      - "#E2E8F0"
    functional:
      - "#16A34A"
      - "#DC2626"
      - "#D97706"
      - "#4F46E5"
todos:
  - id: t0-shared-base
    content: T0：建 packages/shared 契约包、@shared 别名、env 校验、复核 no-console 规则
    status: completed
  - id: t1-db-base
    content: T1：Drizzle 客户端、base 表、id_migrations、pgvector 扩展与迁移
    status: completed
    dependencies:
      - t0-shared-base
  - id: t2-logger
    content: T2：pino 日志脱敏封装、redact/withRequestId 与单测（V5）
    status: completed
    dependencies:
      - t0-shared-base
  - id: t4-ebook
    content: T4：Fumadocs 电子书 29 篇渲染、搜索索引、SSR 与评论插槽
    status: completed
    dependencies:
      - t0-shared-base
  - id: t5-ui
    content: T5：核对并补全 shadcn 组件、globals.css 明暗主题 token
    status: completed
    dependencies:
      - t0-shared-base
  - id: t3-auth
    content: T3：better-auth 认证、requireSession、auth 路由与 middleware
    status: completed
    dependencies:
      - t0-shared-base
      - t1-db-base
  - id: t6-envelope
    content: T6：next-safe-action 错误/成功包络、requestId 真进响应体
    status: completed
    dependencies:
      - t3-auth
  - id: t7-health
    content: T7：/api/health 健康检查（503 联动）与 checkHealth
    status: completed
    dependencies:
      - t1-db-base
      - t2-logger
  - id: t8-ratelimit
    content: T8：单实例内存限流 12 档位工厂与单测
    status: completed
    dependencies:
      - t0-shared-base
      - t2-logger
  - id: t9-landing
    content: T9：落地页、全局 layout、SEO（sitemap/robots/providers）
    status: completed
    dependencies:
      - t3-auth
      - t4-ebook
      - t5-ui
---

## 用户需求
将当前项目 `studyplan-rebuild-test` 提交到 GitHub 仓库 `https://github.com/Testing555123/studyplan.git`，并在该仓库建立名为 `v3.0` 的分支，提交并推送当前全部工作区改动。

## 约束与现状（已核实）
- 工作目录当前**不是 git 仓库**，需先 `git init`。
- 已存在 `.gitignore`，已正确排除 `node_modules/`、`.next/`、`.env`、`.env.local`、`.env*.local`、`*.log`、`*.pem`、`coverage/`、`build/`、`out/`、`playwright-report/` 等；仅 `.env.example` 存在，无 `.env` 机密入库风险。
- 提交策略：从当前状态创建 `v3.0` 分支并提交全部（含 `packages/shared` 共享契约、`lib/`、`app/`、`components/`、`content/ebook/`、`drizzle/` 迁移、`tests/unit/` 与全部配置文件）。

## 执行流程
1. 初始化仓库并连接远程 `origin` 指向 `https://github.com/Testing555123/studyplan.git`；先 `git ls-remote origin` 探测远端是否已有 `v3.0` 分支或默认分支。
2. 创建并切换到 `v3.0` 分支。
3. 暂存全部改动（`git add .`），并利用 `.gitignore` 排除构建产物与机密；提交前用 `git status` 复核无 `.env`、`.next`、`.pnpm-debug.log` 等被暂存。
4. 提交，信息：`feat: StudyPlan v3.0 基座 — Wave0+1 (T0–T9)`。
5. 推送 `git push -u origin v3.0` 建立上游。

## 风险与回退
- **鉴权**：https 推送需 GitHub 凭据/PAT；若非交互 shell 鉴权失败，将暂停并提示用户提供 Personal Access Token 或改用 SSH。
- **远端冲突**：若 `v3.0` 已存在于远端，推送会被拒绝；届时提示用户确认是否覆盖/重命名，不擅自强推。
- **机密保护**：依赖 `.gitignore` 已覆盖；提交前强制复核暂存列表，杜绝 `.env` 等明文机密入库。
