# StudyPlan 重建：现状 → 目标态「需自建模块」统计分析

> 统计日期：2026-10-09
> 范围：以当前 Next.js 项目 `studyplan-rebuild-test` 为起点，统计补全到目标态还需**自己写代码实现**的功能模块数量
> 交付物：仅作构建前的范围清点与工作量预估，**不含任何实现代码**
> 配套调研（已归档）：**`docs/archive/SELFBUILD-ALTERNATIVES.md`** —— 上述自建模块能否用现成项目替代（结论：19 处中约 4 处可被现成项目显著替代/加速，其余因产品特有逻辑或单容器/数据不出网约束无法整体替代）

---

## 0. 统计口径与关键假设

| 项 | 取值 |
|---|---|
| **范围** | 现状 → 目标态缺口 |
| **「自建」定义** | 需自己写代码实现的功能（相对直接调用现成库 / SDK / 托管服务）。库配置即完成的算 0 自研；库的接线、守卫、编排、页面/Server Actions 组装、自定义 SQL 仍算自研 |
| **目标态来源** | 当前项目自有 `docs/`（SPEC / TECH-SELECTION / DECISIONS） |

### 0.1 关键冲突澄清（务必先读）

根目录 `PROJECT-ANALYSIS.md` **不应作为本次统计的目标态**。它描述的是另一个已被推翻的旧 Nuxt 4 monorepo（apps/api + apps/web + NestJS/Mongoose/MongoDB），与当前 Next.js 项目并不对应。当前项目已通过决策推翻它：

- **D1** 换栈 Nuxt 4 → Next.js 16（代码从零重写，Vue 资产非沉没成本）
- **D16** 社区模块反转：砍主帖 `posts` + 点赞 `likes`，评论改用 **Giscus**（GitHub Discussions 托管，SaaS 零进程）
- **SPEC §7** 显式划定第一批不做：GitHub 趋势 / 每日推荐与 cron / Meilisearch / 路线进度与面试题 / 帖子编辑删除 UI / 个人主页 / 真实 Mongo 导入 / 多实例全局限流 / admin 后台
- 技术选型（`TECH-SELECTION.md`）已排除 NestJS / Express / Payload / Mongoose / MongoDB / Prisma / 各类低代码平台

因此本统计以**当前项目 `docs/`** 的真实目标态为准。若你坚持按 `PROJECT-ANALYSIS.md` 字面「完整平台」口径，见 §4 扩展清单（+8~10 处）。

### 0.2 目标态边界（已实现精简）

- 认证：better-auth（配置即完成，非自建）
- ORM/DB：Drizzle + PostgreSQL 16 + pgvector（库，非自建；schema 与自定义 SQL 自研）
- 电子书：Fumadocs + MDX（引擎，非自建；页面/布局自研）
- UI：shadcn/ui + Tailwind 4（组件，非自建；组装自研）
- 嵌入/重排：本地 Qwen3 0.6B（**已落地** `lib/embeddings.ts`、`lib/rerank.ts`，非缺口）
- AI 编排：Vercel AI SDK（库，非自建；编排逻辑自研）
- 评论：Giscus（SaaS，非自建；挂载封装自研）
- RAG 检索对象仅为电子书

---

## 1. 现状已落地资产（非缺口，0 自研量）

以下代码已存在，**不计入「需自建」**：

| 资产 | 文件 | 说明 |
|---|---|---|
| 本地嵌入封装 | `lib/embeddings.ts` | Qwen3-Embedding-0.6B，1024 维，对齐 `vector(1024)`，仅后台 job |
| 本地重排封装 | `lib/rerank.ts` | Qwen3-Reranker-0.6B，生成式 yes/no 打分，串行推理 |
| 电子书标题兜底 | `lib/ebook-title.ts` + `tests/unit/ebook-title.test.ts` | 从 `structuredData.headings[0]` 取 h1 |
| Fumadocs source loader | `lib/source.ts`、`source.config.ts` | `.source/server` → `toFumadocsSource` 转换 |
| UI 组件库 | `components/ui/*.tsx`（12 个） | avatar/badge/button/card/dropdown-menu/input/label/separator/sheet/skeleton/sonner/textarea |
| 根布局 | `app/layout.tsx` | ThemeProvider + Toaster（next-themes + sonner） |
| 工具 | `lib/utils.ts`（`cn` 导出） | |
| 嵌入 spike 脚本 | `scripts/spike-embed.mjs` | |
| 首页 Spike | `app/page.tsx` | 仅列出 Fumadocs 页面，未实现阅读 UI |
| 配置 | `next.config.mjs`（`output:standalone` + MDX）、`components.json`、`tsconfig.json`、`vitest.config.ts` | |

> 注意：`package.json` 已声明 `better-auth`、`drizzle-orm`、`pg`、`@huggingface/transformers`、`fumadocs-*`、`zod`、`sonner`、`next-themes`、`vitest`，但**多数尚未接线**——接线代码属于 §2 的自建项。

---

## 2. 需自建模块逐项拆解

表头：**#** 序号 · **模块** · **自建性质** · **可复用库/SDK** · **批次** · **证据**

### 2.1 横切 / 基础设施（约 8 处）

| # | 模块 | 自建性质 | 可复用库 | 批次 | 证据 |
|---|---|---|---|---|---|
| 1 | 统一错误/成功包络 + `requestId` 中间件 | 自研中间件 + 类型 + 归一化 | `zod`（`ErrorBodySchema`/`SuccessBodySchema`） | 第一批 | SPEC §1.1/1.2/1.3、V5 |
| 2 | 脱敏 logger + 禁 `console.*` lint 规则 | 自研 logger + eslint rule | 需引入 `pino`（当前 `package.json` 无）；脱敏清单见 SPEC §6.3 | 第一批 | V5、SPEC §6.3 |
| 3 | better-auth 接线 + 受保护守卫 `requireSession` | 自研接线（3 处硬约束）+ 守卫 | `better-auth`（含 `toNextJsHandler`/`nextCookies`） | 第一批 | D3、SPEC §2 `PublicUserSchema` |
| 4 | 单实例限流 12 档 | 自研限流中间件（内存） | `rate-limiter-flexible`（内存后端，可选） | 第一批 | SPEC §8.2（档位值照继承） |
| 5 | Drizzle schema + migrations | 自研 schema 定义（knowledge_chunks / ai_answer_cache / ai_daily_usage / id_migrations 等） | `drizzle-orm` + `drizzle-kit` | 第一批 | D4、D11 |
| 6 | pgvector 检索自定义 SQL + 嵌入回填脚本 | 自研 SQL + 独立 job 脚本 | `pgvector` + `drizzle-orm` | 第一批（骨架）/ 第二批（真实回填） | D5、D11 |
| 7 | 健康检查 `/api/health` 503 语义 | 自研 Route Handler（查 PG 连通性，依赖不可用 → 503） | Next Route Handler | 第一批 | SPEC §8.1 |
| 8 | Zod env fail-fast 校验 | 自研 env schema（生产禁默认值） | `zod` | 第一批 | V4 修正 |

### 2.2 业务功能（约 8 处）

| # | 模块 | 自建性质 | 可复用库 | 批次 | 证据 |
|---|---|---|---|---|---|
| 9 | 电子书阅读页 + 目录树/上下篇导航 + 搜索 UI | 自研页面/布局/搜索组件 | `fumadocs-ui` + `shadcn/ui` + `lucide-react` | 第一批 | D13、TECH §1 |
| 10 | **RAG 检索编排层**（嵌入→pgvector→重排→LLM） | **核心自研编排**（嵌入/重排已落地，编排未写） | `Vercel AI SDK`（`ai`）+ 本地 Qwen3 + `pgvector` | 第一批（地基）/ 第二批（实现） | TECH §12.3、§9 |
| 11 | `/api/ai/status` + 每日额度 300 + 未配 Key 降级 | 自研 Route + 原子额度计数器 | `zod` env + `drizzle-orm` | 第二批 | SPEC §8.4 |
| 12 | AI 答案缓存（LRU + PG 表，禁 TTL，键含模型名） | 自研缓存层 | `lru-cache`（可选）+ `drizzle-orm` | 第二批 | SPEC §8.3 |
| 13 | RAG 拒答原则（检索为空宁可拒答） | 自研 prompt + 验收 | `Vercel AI SDK` `streamText` | 第二批 | SPEC §8.5 |
| 14 | Agent loop / tool calling | 自研 ReAct 或框架 | `Vercel AI SDK` tool calling / `Mastra` / `LangGraph.js` | 第二批 | D9、TECH §12.3 |
| 15 | Giscus 评论挂载 | 自研 React 封装/script 挂载 | `Giscus`（SaaS，零进程） | 第二批/后续 | D16、TECH §12.5 |
| 16 | AI 助手 UI（全局组件 + `useChat` 流式） | 自研 UI 组件 | `shadcn/ui` + `Vercel AI SDK` `useChat` | 第二批 | TECH §1 |

### 2.3 运维 / 测试（约 3–4 处）

| # | 模块 | 自建性质 | 可复用库 | 批次 | 证据 |
|---|---|---|---|---|---|
| 17 | Dockerfile（`output:standalone` + 绝对路径 `node` CMD）+ docker-compose（PG16+pgvector + 模型权重挂载） | 自研配置 | Vercel Container Runtime / `node:24-alpine` | 第一批 | D14 |
| 18 | CI 闸门（typecheck/build/unit/contract/migration/health smoke） | 自研 workflow | GitHub Actions | 第一批 | V6 |
| 19 | 契约测试 + 迁移测试 | 自研测试用例 | `vitest` + `playwright` | 第一批/第二批 | V3、V6、SPEC §5 |

---

## 3. 数量估算与批次划分

**主体缺口：约 19 处需自己写代码实现**（横切 8 + 业务 8 + 运维测试 3）。考虑边界浮动（如计数触发器/对账脚本是否单列、Agent loop 是否用框架），合理区间记为 **18–22 处**。

### 自研量分布（关键结论）

本项目的设计原则是「**每一层用成熟方案，只有业务逻辑自研**」（TECH §0），因此：

- **横切/基础设施（~8）**：绝大多数是「库的接线 + 守卫 + 自定义 SQL + 配置」，真正的纯自研逻辑集中在统一包络（#1）、脱敏 logger（#2）、RAG 编排（#10）。
- **业务功能（~8）**：真正的核心自研只有 **RAG 检索编排层（#10）** 与 **Agent loop（#14）**；其余是「库能力 + 自研页面/Route 组装」（AI status/缓存/拒答/助手 UI/Giscus 挂载）。
- **运维/测试（~3）**：纯配置与测试，非产品功能。

> 换句话说：从「产品业务代码」口径看，**真正必须手写的业务逻辑约 2 块（RAG 编排 + Agent loop）**；其余 17 处是「成熟库的能力接线 + 页面/Server Actions 组装 + 基础设施配置」，自研量低但工作量不可忽略。

### 第一批 vs 第二批

| 批次 | 包含模块 | 说明 |
|---|---|---|
| **第一批** | #1–#9、#17–#19（约 13 处） | 部署闭环、契约执行、认证会话、电子书阅读、DB/迁移、可观测与 CI |
| **第二批** | #10–#16（约 6 处，#10 地基在第一批） | RAG 编排、AI status/缓存/拒答、Agent loop、Giscus、AI 助手 UI |

---

## 4. 完整平台口径扩展清单（+8~10 处）

若坚持采用 `PROJECT-ANALYSIS.md` 字面「完整 StudyPlan 平台」（含社区/趋势/推荐等），在当前 `docs/` 边界之外需**额外自建**以下模块（均已被 D16/SPEC §7 显式划出，属未来批次）：

| # | 扩展模块 | 自建性质 | 可复用库 |
|---|---|---|---|
| E1 | GitHub 趋势列表/筛选页 + API | 自研页面 + Octokit 调用 | `Octokit` |
| E2 | 仓库详情 + AI 中文简介 | 自研页面 + LLM 生成 + 缓存 | `Vercel AI SDK` + `drizzle` |
| E3 | 每日推荐生成/查看 + Vercel Cron + 唯一抢占 job | 自研 job/状态机（保留唯一抢占、模板降级、撤回顺序） | cron + `drizzle` |
| E4 | 学习路线浏览页 + 进度持久化 | 自研页面 + collection + route | `drizzle` |
| E5 | 面试题 collection + UI | 自研 schema + 页面 | `drizzle` + `shadcn` |
| E6 | 个人主页 + 用户资料更新 UI | 自研页面 + Server Actions | `better-auth` + `shadcn` |
| E7 | 帖子编辑/删除 UI（若重启自研 `posts`） | 自研 UI + Route | `drizzle` + `shadcn` |
| E8 | admin 后台 | 自研或引 Payload（D2 留待后续） | `Payload`（同进程）或自研 |
| E9 | 路线进度对账/多实例全局限流（若需要） | 自研或引共享存储 | Redis（YAGNI，暂不引） |
| E10 | 真实 Mongo → PG 数据迁移 + id 映射表 | 自研迁移脚本 + 对账 | `drizzle` + Node 脚本 |

> 采用完整平台口径时，总自建处数约为 **19 + 8~10 = 27~29 处**。

---

## 5. 总结

- **以当前 `docs/` 目标态为准**：现状到目标态约 **18–22 处（主体 19 处）** 需自己写代码实现，其中真正纯自研业务逻辑约 2 块（RAG 编排、Agent loop），其余为成熟库的能力接线、页面组装与基础设施配置。
- **第一批约 13 处**，第二批约 6 处。
- **关键澄清**：`PROJECT-ANALYSIS.md` 是已失效的旧 Nuxt 项目分析，不应作为目标态；若按其字面完整平台口径，需额外 +8~10 处（总 ~27~29 处）。
- 所有「自建」项均已标注可复用库，符合「全生命周期成本最低、自研量趋近于 0」的选型原则（TECH §0）。
