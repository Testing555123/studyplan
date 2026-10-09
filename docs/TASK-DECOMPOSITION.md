# 并行任务分工（Agent-Ready Task Packages）

> 配套文档：`docs/TECH-SELECTION.md`（选型）、`docs/SPEC.md`（契约/验收）、`docs/DECISIONS.md`（决策）。
> 本文件是「仅分工」交付物：每个 T0–T16 是一个**自包含 Agent prompt 块**，含目标范围、依赖、接口契约、文件独占归属、验收、反模式。
> 执行者：并行 AI Agent。每条任务块可直接复制给一个独立 Agent 执行；同一 Wave 内可同时派发。
> **文件独占**是并行不冲突的前提：每个任务只能改自己归属的文件，共享契约只 import 不新建。

---

## 依赖波次图（Wave 0 → 3）

```
Wave 0 (串行起点):  T0 ──► { T1, T2 可并发 }
Wave 1 (全并发):    T3, T4, T5, T6, T7, T8, T9   (各自依赖已满足)
Wave 2 (分组并发):  T10 完成后 → { T11, T12, T13 } 并发；T14 在 T4 完成后即可并发（与 T10 组并行）
Wave 3 (全并发):    T15, T16   (均依赖前面功能模块)
```

### 同一时刻可并发派发的 Agent 清单
- **Wave 0 第二拍**：T1（数据基座）+ T2（日志）并发。
- **Wave 1**：T3、T4、T5、T6、T7、T8、T9 七个并发。
- **Wave 2**：T11、T12、T13 并发；外加 T14 与它们并发（T14 只依赖 T4）。
- **Wave 3**：T15（测试）+ T16（部署）并发。

> 注意：T7 依赖 {T1,T2}，T8 依赖 {T0,T2}，T9 依赖 {T4,T5}，T10 依赖 {T1,T6}，T11 依赖 {T1,T2,T10}，T12/T13 依赖 T10，T14 依赖 T4，T15 依赖全部功能模块，T16 依赖 T15。派发前确认前置 Wave 已合并且 `pnpm typecheck` 通过。

---

## 基线现状（分工时认领「剩余部分」，不要重建）

- 选型已齐全：`package.json`（Next 16.4 / React 19.3 / better-auth 1.7.7 / drizzle 0.45.4+kit 0.31.11 / fumadocs core16.16.2+mdx15.4.6+ui16.16.2 / @base-ui/react 1.8.0 / tailwind4.3.3 / lucide-react / zod 4.6.5 / @huggingface/transformers 4.3.1 / pg / sonner）。
- `components/ui/`：已落地 12 个 shadcn 组件。
- `lib/`：已有 `embeddings.ts`、`rerank.ts`（本地 Qwen3 全套，第二批后台 job）、`source.ts`、`ebook-title.ts`（电子书管线）、`utils.ts`（`cn`）。
- `content/ebook/` 与 `app/ebook/`：电子书 markdown 资产与路由骨架已就位（29 篇无 frontmatter、无 order，靠文件名前缀 + 首个 h1 标题）。
- `scripts/spike-embed.mjs`：Spike 实测脚本已存在。
- `tests/unit/`：空目录；`vitest.config.ts` 已存在。
- `docker-compose.yml`：已存在（PG16 + pgvector）。
- 配置文件已存在：`next.config.mjs`、`tsconfig.json`、`postcss.config.mjs`、`eslint.config.mjs`、`vitest.config.ts`、`source.config.ts`、`components.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`。

---

## Wave 0 — 基座

### T0 工程契约基座【第一批】
- **目标/范围**：确认 pnpm workspace；env 校验 zod schema（DATABASE_URL 等，AI 项可选且允许空串，符合 SPEC §8.4 未配 Key 照常启动）；新建 `packages/shared` 放置共享类型与 zod schema（`ErrorBodySchema`、`SuccessBodySchema<T>()`、`HealthStatusSchema`、`PublicUserSchema`、`createRequestId()`）；ESLint 禁裸 `console.*`（logger 文件 overrides 豁免）；`tsconfig.json` 加 `@shared/*` 别名（保留 `@/*`）。
- **依赖**：无。
- **接口契约（对外导出）**：`ErrorBodySchema`、`SuccessBodySchema<T>()`、`HealthStatusSchema`、`PublicUserSchema`、`parsedEnv`、`createRequestId()`。
- **文件归属（独占）**：`packages/shared/`（index.ts、schemas/*.ts、env.ts、package.json）、`tsconfig.json`（别名）、`eslint.config.mjs`（no-console + logger 豁免）。
- **验收**：`pnpm install` + `pnpm typecheck` 通过；src 内 `console.log` 触发 lint error（logger 豁免）；缺 `DATABASE_URL` 时 env 校验抛错；`@shared/*` 可被 import 解析。
- **反模式**：禁止其它任务自建重复 zod schema（本任务是单一来源）；禁止改现有别名命名；不得新增运行时依赖（shared 以 `workspace:*` 接入）。

### T1 数据访问基座【第一批】
- **目标/范围**：从零建 Drizzle 客户端、`drizzle.config.ts`、迁移脚手架；启用 pgvector 扩展；`id_migrations` 表骨架；base 表约定（物理列 snake_case、公开 id UUID v4、非法 UUID 访问 DB 前转 404）。
- **依赖**：T0（shared 类型/别名）。
- **接口契约**：导出 `db`（drizzle 实例）、`vector()` 辅助、`withTransaction()`；`schema/base.ts`（通用列 + `id_migrations`）。
- **文件归属（独占）**：`lib/db/index.ts`、`lib/db/config.ts`、`lib/db/schema/base.ts`、`drizzle.config.ts`、`drizzle/` 迁移目录（本次增量）。
- **验收**：`pnpm db:generate` 产出迁移；`db:migrate` 成功建 `id_migrations`；UUID 前缀校验函数可单测。
- **反模式**：禁止在 base.ts 之外定义通用列；禁止触碰 T3/T10/T11 的 schema 文件。

### T2 日志脱敏模块【第一批】
- **目标/范围**：pino 封装 + SPEC §6.3 脱敏清单（`authorization`/`cookie`/`password*`/`token*`/`secret`/`apiKey`/`DATABASE_URL` 等）；全字符串截断 160；请求体不落日志；只写 error code；初始化失败不阻断启动（V5）。
- **依赖**：T0（别名）。
- **接口契约**：导出 `logger`、`redact(obj)`、`withRequestId(id)`（注入 X-Request-Id）。
- **文件归属（独占）**：`lib/logger.ts` 及对应单测。
- **验收**：日志不出现 `DATABASE_URL` 明文；logger 初始化抛错时应用仍启动；单测覆盖脱敏清单。
- **反模式**：禁止裸 `console.*`；禁止把请求体写入日志。

---

## Wave 1 — 第一批核心（全并发）

### T3 认证模块 better-auth【第一批】
- **目标/范围**：注册/登录/refresh/logout；`toNextJsHandler` + `nextCookies()`；`requireSession()`（受保护路由唯一身份来源）；auth 表由 better-auth 自带 drizzle schema 生成（独立文件）。
- **依赖**：T0、T1（db）。
- **接口契约**：导出 `auth`、`getSession()`、`requireSession()`；路由 `app/api/auth/[...all]/route.ts`；`middleware.ts`（nextCookies 守卫）。
- **文件归属（独占）**：`lib/auth/`（auth.ts、session.ts）、`lib/db/schema/auth.ts`、`app/api/auth/[...all]/route.ts`、`middleware.ts`。
- **验收**：V1（body 塞 `authorId`/`role` 被 `.strict()` 拒 400）；CONFLICT 409 邮箱重复；未登录受保护路由 401。
- **反模式**：禁止在 body 读取用户身份；禁止改 T1 base 表；禁止其它任务改 `middleware.ts`。

### T4 电子书/文档模块 Fumadocs+MDX【第一批】
- **目标/范围**：完善 `source.ts`/`ebook-title.ts`；接入 `content/ebook` 29 篇（无 frontmatter、无 order）；`meta.json` 显式排序或文件名前缀 + 首个 h1 标题；`/ebook` 路由 + 搜索索引 + SSR。
- **依赖**：T0（别名）。
- **接口契约**：导出 `source`（Fumadocs source）、`getEbookTitle(page)`、`EBOOK_TREE`；路由 `app/ebook/**`；为 T14 暴露评论挂载点组件 `<EbookCommentsSlot slug=... />`（空实现占位）。
- **文件归属（独占）**：`app/ebook/**`、`lib/source.ts`、`lib/ebook-title.ts`、`content/ebook/**/meta.json`、`source.config.ts`。
- **验收**：29/30 篇渲染；标题取自首个 h1；搜索索引可用；SSR 出 HTML。
- **反模式**：禁止改 shared schemas；评论组件仅留插槽，逻辑归 T14。

### T5 UI 组件层 shadcn/Tailwind4/lucide【第一批】
- **目标/范围**：核对已有 12 件；补齐缺失（form/dialog/card/sonner/toast/avatar 等）；设计 token；`globals.css` 主题（明暗）。
- **依赖**：T0（别名）。
- **接口契约**：导出组件库（`@/components/ui/*`）；`cn()` 复用 `lib/utils.ts`（不重建）。
- **文件归属（独占）**：`components/ui/**`、`app/globals.css`、`components.json`（如需补充）。
- **验收**：子模块可 import；明暗主题 token 生效；无重复组件。
- **反模式**：禁止其它任务新建 UI 原语；禁止覆盖已有 12 件除非 T5 统一处理。

### T6 错误包络 next-safe-action【第一批】
- **目标/范围**：用 next-safe-action 包裹 Server Action；zod `.strict()`；统一 ErrorBody/SuccessBody；requestId 注入 + X-Request-Id 头（**[修正]** 必须真进响应体，v2.0 缺陷）。
- **依赖**：T0（ErrorBody/SuccessBody schema、`createRequestId`）。
- **接口契约**：导出 `actionClient`（基础）、`authedActionClient`（含 `requireSession`，来自 T3）、`toErrorBody(e)`、`toSuccessBody(data)`。
- **文件归属（独占）**：`lib/actions/`（client.ts、error.ts）、`app/api/_envelope/` 辅助。
- **验收**：V1（非法字段 400）；响应体真含 requestId；成功体走 SuccessBodySchema。
- **反模式**：禁止手写 try/catch 重复包络；禁止让 requestId 再次丢失。

### T7 健康检查 /api/health【第一批】
- **目标/范围**：SPEC §8.1；只查 PG 连通；503 联动 `database:'disconnected'`；不走统一包装；HTTP 码与 status 联动（degraded⇔503）。
- **依赖**：T1（db）、T2（logger）。
- **接口契约**：`GET /api/health` 返回 `HealthStatusSchema` 形状；导出 `checkHealth()`。
- **文件归属（独占）**：`app/api/health/route.ts`、`lib/health.ts`。
- **验收**：断库 → 503 + `database:'disconnected'`；恢复 → 200 + `status:'ok'`。
- **反模式**：禁止把 health 套 SuccessBodySchema 包装；禁止查除 PG 外依赖。

### T8 单实例限流【第一批】
- **目标/范围**：SPEC §8.2；内存实现 + 12 档位（值不得改）；只读豁免；超限 429（RATE_LIMITED）。
- **依赖**：T0（错误码）、T2（logger）。
- **接口契约**：导出 `rateLimit(bucket, key?)` 工厂 / 高阶 `withRateLimit(bucket, handler)`；档位常量：default30 / register5 / login10 / refresh60 / createPost10 / aiAsk10 / agentAsk10 / semanticSearch30 / askBook10 / repoIntros10 / digestRead20 / digestGenerate10。
- **文件归属（独占）**：`lib/ratelimit.ts` 及单测。
- **验收**：档位语义不变；超 default 30/60s → 429；只读路由不挂限流。
- **反模式**：禁止改 12 档位数值；禁止引入外部限流库（单实例内存即可）。

### T9 首页/落地页 + 全局 layout/SEO 骨架【第一批】
- **目标/范围**：`app/layout.tsx`、`app/page.tsx`；next-themes 明暗；`useSeoMeta`/`sitemap.ts`/`robots.ts` 初版；整合 T3 会话、T4 电子书入口、T5 组件。
- **依赖**：T4、T5、T3（会话可消费）。
- **接口契约**：导出根 layout、首页、SEO 元信息函数；`app/sitemap.ts`、`app/robots.ts`、`app/providers.tsx`（主题）。
- **文件归属（独占）**：`app/layout.tsx`、`app/page.tsx`、`app/sitemap.ts`、`app/robots.ts`、`app/providers.tsx`。
- **验收**：SSR 出 SEO meta；明暗切换；首页链接 `/ebook`。
- **反模式**：禁止改 T4/T5 组件内部；SEO 不得破坏 SSR。

---

## Wave 2 — 第二批（核心完成后并发）

### T10 RAG 检索编排 Vercel AI SDK【第二批】
- **目标/范围**：embed（已落地 `lib/embeddings.ts`）→ pgvector → rerank（已落地 `lib/rerank.ts`）→ LLM 编排；拒答原则 SPEC §8.5；向量表 `vector(1024)`；backfill 脚本。
- **依赖**：T1（db/vector）、T6（错误包络）。
- **接口契约**：导出 `retrieveAndAnswer(query)`、`embedAndStore()`；schema `lib/db/schema/embeddings.ts`（`vector(1024)`）。
- **文件归属（独占）**：`lib/rag/`（orchestrate.ts、store.ts）、`lib/db/schema/embeddings.ts`、`scripts/embed-backfill.mjs`（完善）。
- **验收**：检索空 → 模型输出拒答语义、不编造来源；向量表建表成功。
- **反模式**：禁止改 T1 base；本地模型不可用须降级 LLM+网络搜索（§6.4）。

### T11 AI 缓存 + 状态 + 额度【第二批】
- **目标/范围**：SPEC §8.3/§8.4；`ai_answer_cache` PG 表；7 天禁 TTL（读路径判定）；键含模型名（**[修正]** v2.0 缺陷）；`/api/ai/status` 7 字段；每日额度 300 原子 upsert；未配 Key 降级 `enabled:false`。
- **依赖**：T1（db）、T2（logger）、T10（问答端点）。
- **接口契约**：导出 `getAnswerCached(key)`、`putAnswerCache(...)`、`getDailyUsage()`、`checkQuota()`；路由 `/api/ai/status`、`/api/ai/ask`；schema `lib/db/schema/ai-cache.ts`。
- **文件归属（独占）**：`lib/ai/`（cache.ts、status.ts、quota.ts）、`lib/db/schema/ai-cache.ts`、`app/api/ai/status/route.ts`、`app/api/ai/ask/route.ts`。
- **验收**：无 Key → `enabled:false`；第 301 次额度用尽（与 429 区分）；跨模型不命中旧缓存。
- **反模式**：禁止漏模型名进缓存键；禁止非原子额度计数；禁止缓存失败阻断答案。

### T12 AI 助手 UI assistant-ui【第二批】
- **目标/范围**：聊天组件、streaming/tools/persistence、明暗主题；对接 T10/T11 端点。
- **依赖**：T10（问答）、T11（status/ask 端点）。
- **接口契约**：导出 `<AiChat />`（assistant-ui 风格）；消费 `/api/ai/ask` SSE。
- **文件归属（独占）**：`components/ai/`（chat.tsx、provider.tsx）、`app/ai/page.tsx` 或嵌入式入口。
- **验收**：流式问答可用；明暗跟随；额度耗尽提示。
- **反模式**：禁止自建聊天协议；禁止改 T11 端点。

### T13 Agent loop Mastra/LangGraph【第二批】
- **目标/范围**：tool calling/ReAct 编排；业务 tool 自研；可评估 Mastra 或 LangGraph.js。
- **依赖**：T10（检索/LLM 原语）。
- **接口契约**：导出 `runAgentLoop(input, tools)`；业务 tool 注册接口。
- **文件归属（独占）**：`lib/agent/`（loop.ts、tools/*.ts）。
- **验收**：tool 调用路径可达；拒答原则仍生效。
- **反模式**：禁止把领域编排（拒答/额度）下沉到框架而丢语义。

### T14 Giscus 评论【第二批】
- **目标/范围**：SPEC §12.5；电子书/页面底部挂载；GitHub Discussions 映射（`data-mapping="pathname"`）；明暗跟随；填入 T4 的 `<EbookCommentsSlot />`。
- **依赖**：T4（插槽挂载点）。
- **接口契约**：导出 `<GiscusComments repo repoId category categoryId mapping="pathname" />`；注入到 T4 插槽。
- **文件归属（独占）**：`components/comments/giscus.tsx`；仅修改 T4 插槽引用处（约定组件名）。
- **验收**：每篇章节自动对应一个 thread；主题跟随明暗。
- **反模式**：禁止把评论写进自有 PG（数据存 GitHub Discussions）；禁止改 T4 路由。

---

## Wave 3 — 交叉收口（可并发）

### T15 测试体系 Vitest+Playwright【跨批】
- **目标/范围**：测试基座 + 各模块契约/不变量（V1–V6）；CI 命令序列一致（V6）。
- **依赖**：全部功能模块（T3/T7/T8/T9/T11/T12/T13/T14 完成后）。
- **接口契约**：导出测试工具（mock db/logger/session）；`playwright.config.ts`（新增）；CI 脚本命令序列。
- **文件归属（独占）**：`tests/`（unit/e2e）、`playwright.config.ts`、CI 配置。
- **验收**：V1 身份来自会话、V5 观测失效不阻断启动、V6 三条命令一致；不变量勾选。
- **反模式**：禁止把集成测试当单测堆；禁止绕过 lint 写 console。

### T16 部署 Vercel Container Runtime【跨批】
- **目标/范围**：Dockerfile node:24-alpine、`output:'standalone'`、模型缓存显式拷贝（pnpm 清空 `.cache` 风险）、对齐现有 `docker-compose.yml`。
- **依赖**：T15（测试通过后）。
- **接口契约**：导出容器构建与 smoke 脚本；与本地共用端点。
- **文件归属（独占）**：`Dockerfile`、`.dockerignore`、`scripts/smoke*.mjs`、更新 `docker-compose.yml`。
- **验收**：容器 smoke 与本地 smoke 命中相同端点（V6）；模型缓存就位。
- **反模式**：禁止单容器引入多进程/多服务；禁止漏拷模型缓存。

---

## 文件独占总表（冲突规避）

| 路径 | 独占任务 |
| --- | --- |
| `packages/shared/**` | T0（其余仅 import） |
| `lib/db/index.ts`、`config.ts`、`schema/base.ts`、`drizzle.config.ts`、`drizzle/` | T1 |
| `lib/db/schema/auth.ts` | T3；`embeddings.ts` → T10；`ai-cache.ts` → T11（各独立迁移） |
| `lib/logger.ts` | T2 |
| `lib/auth/**`、`middleware.ts`、`app/api/auth/[...all]/route.ts` | T3 |
| `app/ebook/**`、`lib/source.ts`、`lib/ebook-title.ts`、`content/ebook/**/meta.json` | T4（T14 仅填插槽） |
| `components/ui/**`、`app/globals.css` | T5 |
| `lib/actions/**`、`app/api/_envelope/` | T6 |
| `app/api/health/route.ts`、`lib/health.ts` | T7 |
| `lib/ratelimit.ts` | T8 |
| `app/layout.tsx`、`app/page.tsx`、`app/sitemap.ts`、`app/robots.ts`、`app/providers.tsx` | T9 |
| `lib/rag/**`、`scripts/embed-backfill.mjs` | T10 |
| `lib/ai/**`、`app/api/ai/status`、`app/api/ai/ask` | T11 |
| `components/ai/**` | T12 |
| `lib/agent/**` | T13 |
| `components/comments/giscus.tsx` | T14 |
| `tests/**`、`playwright.config.ts`、CI | T15 |
| `Dockerfile`、`.dockerignore`、`scripts/smoke*` | T16 |

## 执行铁律（防回归/防冲突）
1. 每个 Agent 开工前先 `pnpm install` + `pnpm typecheck` 基线通过，再改自己独占文件。
2. 共享契约（T0）发布后冻结；变更回到 T0，禁止其它任务私自扩展 shared。
3. Drizzle 迁移各任务独立 `generate` 后统一 `migrate`；禁止手工改 `drizzle/` 已生成文件。
4. 限流（T8）与错误包络（T6）以工厂/高阶函数导出，T3/T7/T11 通过调用挂载，不抢 `middleware.ts` 与 route 包装逻辑。
5. 第二批（T10–T14）须遵守 SPEC §6.4 降级：可选能力失效只 warn 不抛，确保未配 Key/模型不可用时不阻断启动。
