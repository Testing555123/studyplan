# 技术选型报告

> 调研日期：2026-10-09（初版）｜再调研复核：2026-10-09（同日，结论见下方「再调研复核」块）
> 方法：GitHub REST API 实测（stars / license / pushed_at）+ 官方文档核实 + 源仓库 `studyplan-v2.0` 只读提取
> 边界：本文只记录「选了什么、为什么、排除了什么」，不记录实现细节（见 `SPEC.md`）与决策取舍（见 `DECISIONS.md`）

> ## 再调研复核 · 2026-10-09（初版同日复核）
>
> 复核方法与原版同源：GitHub REST API 复拉各仓库 `stargazers_count / license.spdx_id / pushed_at`，npm registry `latest` 复拉版本，HuggingFace API 复验模型可用性与许可。
> 结论：**初版与复核均为 2026-10-09（同日）**，所有 star / license / pushed_at 与初版基本一致，仅因数小时自然增长出现个位数~二十余位偏差；初版数据准确，无需推翻任何选型。
>
> 关键复核结论（均已就地修正或确认）：
> 1. **Payload v4 仍未发布稳定版**：npm `payload@latest` = **3.90.2**（稳定），v4 仍处 canary。§4 / DECISIONS D2「v4 稳定度需核实」已落实为「确实未稳定」，本批次不引入结论不变。
> 2. **版本漂移（已修正）**：Drizzle ORM 最新 **0.45.4**（初版写 0.45.2）、drizzle-kit **0.31.11**；Playwright 最新 **1.64.0**（安装 `^1.63.0`）；lucide-react 最新 **1.53.0**（安装 `^0.552.0`，存在大版本漂移，仅提示）；Vercel AI SDK `ai` 最新 **7.0.136**；Fumadocs core **16.16.2** / mdx **15.4.6** / ui **16.16.2**。
> 3. **已选型版本确认仍为最新/一致**：Next.js 16.4.0、React 19.3.0、better-auth 1.7.7、zod 4.6.5、@huggingface/transformers 4.3.1、tailwindcss 4.3.3、@base-ui/react 1.8.0、next-themes 0.4.6、vitest 5.0.3，与 `package.json` 安装版本一致。
> 4. **Qwen3 ONNX 模型可用且未 gate**：`onnx-community/Qwen3-Embedding-0.6B-ONNX` 与 `Qwen3-Reranker-0.6B-ONNX` 均 `gated=false` 且含 `.onnx` 权重；Reranker 仓库显式 Apache-2.0，Embedding 仓库在 HF 未置 license 字段但派生自 Qwen3（Apache-2.0 可商用），与 §9 / D9 一致。
> 5. **Artalk 仓库已迁移**：`Artalk/Artalk` → `ArtalkJS/Artalk`，star 2,346 / MIT / pushed 2026-10-01 与初版完全一致，仅路径变化。

## 0. 评估标尺

用户确立的标尺是**全生命周期成本（开发 + 调试 + 长期维护）**，不是「第一批开发工作量」：

> agent 自写的代码在后续调试与 debug 上效率低于复用现成项目；成熟项目会随 GitHub 推送持续更新维护。

因此落地原则是：**每一层都用成熟方案，只有业务逻辑自研。** 自研量越接近 0 越好，且自研部分应是"产品本身"而非"横切关注点"。

## 1. 最终选型（逐层）

| 层 | 方案 | 版本 | 规模 / 许可 / 最后推送 | 自研量 |
| --- | --- | --- | --- | --- |
| 运行时 | Node.js | 24（本机 v24.18.1） | — | 0 |
| 包管理 | pnpm | 11.20.0（corepack 锁定） | — | 0 |
| 语言 | TypeScript | 5.9.3，全仓 ESM | — | 0 |
| 全栈框架 | **Next.js 16（App Router） + React 19** | 16.4.0 / 19.3.0 | **143,038★ / MIT / 2026-10-09** | 0 |
| 认证会话 | **better-auth** | 1.7.7 | **30,222★ / MIT / 2026-10-08** | 0（配置即完成） |
| ORM + 迁移 | **Drizzle ORM + drizzle-kit** | 0.45.4 / 0.31.11 | 35,981★ / Apache-2.0 / 2026-10-08 | 0（schema + migration） |
| 数据库 | PostgreSQL 16 + pgvector | `pgvector/pgvector:pg16` | — | 0 |
| 电子书 | **Fumadocs** | 最新稳定（core 16.16.2 / mdx 15.4.6 / ui 16.16.2） | Next.js 原生 MDX 文档框架；官方文档站 + 中文文档 + `create-fumadocs-app` | 0 |
| Markdown 渲染 | **MDX**（与电子书同一管线） | — | Fumadocs MDX | 0 |
| UI | **shadcn/ui + Tailwind 4 + lucide-react** | Tailwind 4.3.3 / lucide-react 1.53.0（安装 ^0.552.0） | Radix 无头原语 / MIT | 0 |
| 乐观更新 | **React 19 内置 `useOptimistic` + Server Actions** | — | React 官方 | 0 |
| 校验 | zod | 4.6.5 | MIT | 0 |
| 测试 | Vitest + Playwright | 5.0.3 / 1.64.0（安装 ^1.63.0） | MIT | 0 |
| 部署 | Vercel Container Runtime 单容器（`output: 'standalone'`） | node:24-alpine | — | 0 |
| AI 编排（第二批） | **Vercel AI SDK**（`ai`） | 最新稳定（npm 7.0.136） | Vercel 官方，"The AI Toolkit for TypeScript" | 0 |
| Agent 对照（第二批） | **LangGraph.js** | 最新稳定 | LangChain 官方 | 0 |
| Embedding（第二批） | **Qwen3-Embedding-0.6B（本地，q8，ONNX）** | — | 1024 维 / Apache-2.0 / 多语言 MTEB 64.33 / Spike 4 实测全绿 | 0 |
| Rerank（第二批） | **Qwen3-Reranker-0.6B（本地，q8，ONNX）** | — | Apache-2.0 / 生成式 yes/no 打分 / MTEB-R 65.80 | 0 |
| LLM（第二批） | OpenAI 兼容端点，baseURL/apiKey 环境变量化 | — | 可接 DeepSeek / 通义 / 智谱 / Kimi | 0 |
| **业务逻辑** | 帖子/评论/点赞数据模型与 Server Actions；检索编排与 Agent loop | — | — | **必须自研** |

**不引入**：NestJS、Express、Payload、Nuxt、Mongoose/MongoDB、Passport/jsonwebtoken/bcryptjs、class-validator、VitePress、Prisma、TanStack Query、markdown-it、better-sqlite3、任何低代码平台。

## 1.1 选型—模块职责对照

> §1 回答「选了什么」，本小节回答「每一项具体负责哪个产品模块」。两者逐行对应，便于追溯与责任划分。

| 技术选型 | 主要负责的产品模块 / 功能 | 职责说明 |
| --- | --- | --- |
| Node.js 24 + pnpm | 全栈运行时 / monorepo 编排 | 所有服务端代码运行环境；pnpm workspace 管理 apps / packages |
| TypeScript 5.9 | 全栈类型与契约 | 前后端共享类型，约束 API 契约（对应 `packages/shared`） |
| **Next.js 16 + React 19** | 前端页面 + SSR/SEO + 服务端逻辑 | App Router 承载各页面；Server Actions 处理写操作；`useSeoMeta`/sitemap 负责 SEO |
| **better-auth** | 认证与会话模块 | 注册/登录、HttpOnly Cookie 会话、refresh/logout、受保护路由唯一身份来源 |
| **Drizzle ORM + drizzle-kit** | 数据访问层（自研领域） | 仍需自研的数据模型 CRUD、迁移；JSONB 标签 / 向量查询 |
| **PostgreSQL 16 + pgvector** | 持久化 + 向量存储 | 主数据库；`pgvector` 存 embedding 向量支撑语义检索 |
| **Fumadocs + MDX** | 电子书 / 文档内容模块 | 30 篇 Markdown 电子书渲染、路由、`/ebook` 搜索索引 |
| **shadcn/ui + Tailwind 4 + lucide-react** | 全站 UI 组件与样式 | 表单/按钮/卡片/对话框等界面与图标 |
| **React 19 `useOptimistic` + Server Actions** | 乐观更新 / 交互体验 | 帖子发布、状态切换等即时反馈 |
| zod | 输入与契约校验 | Server Action 入参 `.strict()`、响应出口、env 校验 |
| **Vercel AI SDK（`ai`）** | AI 编排 | `embed` / `rerank` / `streamText`（tool calling）统一编排 |
| **Qwen3-Embedding-0.6B + Reranker + @huggingface/transformers** | 本地语义检索 / 重排 | 电子书内容本地 embedding 与重排，Apache-2.0 可商用 |
| **Vitest + Playwright** | 测试保障（所有模块） | 单元/契约测试 + 浏览器端到端 smoke |
| **Vercel Container Runtime** | 部署 / 单容器托管 | 单容器同域托管 API + SSR，契合单容器约束 |

> **D16 口径**：依社区模块反转，评论改用 Giscus（数据存 GitHub Discussions，不进自有 PG）、主帖与点赞移出第一批，故二者**不列为自研职责**（与 §8 / §12.0 / §12.3 一致）。自研业务逻辑仅剩 RAG 检索编排与 Agent loop（见 §12.3）。

## 2. 框架生态：为什么是 Next.js 而不是 Nuxt

| 框架 | Stars | 许可 | 最后推送 | open issues |
| --- | ---:|---|---|---:|---:|
| **vercel/next.js** | **143,038** | MIT | 2026-10-09 | 3,590 |
| nuxt/nuxt | 60,929 | MIT | 2026-10-08 | 488 |

2.35 倍差距。这个数字直接对应用户的痛点：**遇到报错时能否搜到答案、社区里有没有人踩过同一个坑**。

换栈成本被两件事削弱：

1. 用户已决定**代码完全从零重写**，Vue 代码不构成沉没成本；
2. 换到 Next.js 后不再需要 `@nuxt/content` + `better-sqlite3`，v2.0 的「Nuxt Content 干净构建不可复现」P0 风险整类消失，Alpine 镜像也不必再为 SQLite 准备编译工具链。

## 3. 后端 / 低代码平台：整类排除

| 项目 | Stars | 许可 | 最后推送 | 排除理由 |
| --- | ---:|---|---|---|---|
| supabase/supabase | 111,255 | Apache-2.0 | 2026-10-09 | 自托管为多容器 compose（2026-08 起 envoy 为默认网关）→ **与单容器约束冲突** |
| nocodb/nocodb | 65,219 | NOASSERTION | 2026-10-09 | Airtable 替代（表格数据库），出不了 C 端 SEO 页面 |
| pocketbase/pocketbase | 61,337 | MIT | 2026-10-08 | SQLite only → 与 PG/pgvector 冲突 |
| appwrite/appwrite | 57,604 | BSD-3-Clause | 2026-10-09 | **后端数据库是 MariaDB** → 与 PG/pgvector 冲突 |
| payloadcms/payload | 45,158 | MIT | 2026-10-08 | 见第 4 节（本批次不采用，非排除） |
| directus/directus | 38,326 | NOASSERTION | 2026-10-08 | v12 起改为 **MSCL**（Monospace Sustainable Core License），无许可自建跑受限社区模式 |
| refinedev/refine | 35,814 | MIT | 2026-09-10 | 定位内部工具 / admin panel，非 C 端社区 |
| hasura/graphql-engine | 32,127 | Apache-2.0 | 2026-10-07 | 只解决数据 API + 权限，认证需外部签发；2,373 open issues 偏高 |
| PostgREST/postgrest | 27,701 | MIT | 2026-10-07 | 零 CRUD 代码，但业务逻辑全下沉 SQL；Haskell 二进制在 Windows 本地必须走 Docker |
| nocobase/nocobase | 24,502 | NocoBase License Agreement | 2026-10-09 | 见第 5 节 |
| Budibase / Teable | 28,331 / 21,872 | NOASSERTION | 2026-10-08 | 内部工具 / 电子表格，自带前端抢路由 |
| baidu/amis | 18,896 | Apache-2.0 | **2026-03-18** | 7 个月未更新，React + JSON schema，与 App Router 不搭 |

**核心发现：这是品类错配，不是选型问题。** 低代码工具的主流品类是「内部工具 / admin panel / 表单 / 表格」，而 StudyPlan 是「面向公众的 C 端内容社区」——要 SSR/SEO、Markdown 电子书、乐观更新等自定义交互。两者重叠只有 CRUD，而 CRUD 恰恰是本项目最简单的部分。

## 4. Payload：两次反转，最终本批次不采用

文档目标态是「Nuxt SSR + Express 薄转接 + Payload 3 Local API」。Payload 3 本身很成熟（45,158★ / MIT / 2026-10-08）。

- **第一次排除**：Payload 自我定位是 "the open-source, fullstack **Next.js** framework"、"first-ever Next.js native CMS"，v4 canary 把最低 Next.js 版本提到 16.4。配 Nuxt 时只能走 standalone/Express 路线——那是**次路径**，社区答案少得多。
- **换栈后反转**：Payload 官方定位 "can **install directly in your existing `/app` folder`"——它是装进 Next.js 应用的**同一进程**，回到主路径。
- **最终仍未采用**：
  1. v4 已在 canary 且近乎每日发布（canary.37 = 09-24、canary.38 = 10-07、canary.39 = 10-08），最新稳定版 v3.90.2（09-23）。此刻上 v3 意味着不久就要面对一次 v4 大版本迁移；（复核 2026-10-09：npm `payload@latest` 仍为 3.90.2，v4 稳定版尚未发布，canary 路线延续，本批次不引入结论不变）
  2. 第一批不需要 admin panel；
  3. better-auth + Drizzle 在 Next.js 生态更主流且更轻。

**结论：留作后续批次需要 admin 时再引入。**

## 5. NocoBase 专项（用户举例项，非选择）

- 服务端实测 `@nocobase/server@2.2.22`：`koa ^3.2.0` + `@koa/router` + 自研 `@nocobase/database`（Sequelize 系）。**既非 NestJS 也非 Express。**
- 许可为主仓库 `LICENSE.txt`「NocoBase License Agreement（2026-02-24 更新）」= Apache-2.0 + 补充条款，SPDX 为 NOASSERTION：
  - **5.2** 禁止移除或更改界面上的品牌、名称、链接、版本号、许可信息（除左上角主 LOGO）
  - **5.4** 禁止使用原版或改版软件向公众提供任何形式的 no-code / zero-code / low-code / AI 平台 SaaS/PaaS
- 认证走 `auth:signIn` + `X-Authenticator` 头 + 自有 token；改造为「HttpOnly Cookie 会话」需写认证器插件，难度高于直接写中间件。
- 自带 Web 服务（默认 13000 端口、自带 Nginx），与 SSR 前端抢端口抢路由；官方系统要求「源码开发/插件开发建议预留 **4GB 以上**空闲内存」。

## 6. 认证方案对比

| 方案 | Stars | 许可 | 最后推送 | Nuxt / Next.js 支持 |
| --- | ---:|---|---|---|
| **better-auth/better-auth** | **30,222** | **MIT** | **2026-10-08** | 官方集成页（两者都有） |
| atinux/nuxt-auth-utils | 1,602 | MIT | 2026-10-08 | 官方（Nuxt 核心团队作者） |
| sidebase/nuxt-auth | 1,555 | MIT | 2026-09-25 | 官方 |

better-auth 创立于 2024-05-19，两年内 30k stars，最新稳定版 **1.7.7**。官方「Nuxt Integration」页确认的集成方式：

```ts
// 服务端：一个 catch-all 挂载全部认证端点
export default defineEventHandler((event) => auth.handler(toWebRequest(event)))
// 客户端：better-auth/vue 或 better-auth/react
export const { signIn, signUp, signOut, useSession } = createAuthClient()
// 服务端守卫
const session = await auth.api.getSession({ headers: event.headers })
```

Next.js 侧另有 `toNextJsHandler` 与 `nextCookies()` 两个专用入口（见 `DECISIONS.md` D3）。

## 7. ORM 对比

| 方案 | Stars | 许可 | 最后推送 | open issues |
| --- | ---:|---|---|---:|---:|
| prisma/orm | 47,697 | Apache-2.0 | 2026-10-09 | 2,751 |
| **drizzle-team/drizzle-orm** | **35,981** | Apache-2.0 | 2026-10-08 | 2,114 |

选 Drizzle：纯 TS **无原生二进制**（Alpine 单容器少一个编译风险点）、pgvector 支持更好、better-auth 官方示例即为此组合。Prisma 更成熟且有 Studio，但查询引擎二进制在 Alpine 镜像里是额外变量。

## 8. 业务层（帖子/评论/点赞）：已核实，无现成方案

| 候选 | Stars | 许可 | 最后推送 | 冲突点 |
| --- | ---:|---|---|---|---|
| Giscus | 12,144 | MIT | **2026-05-26（5 个月未更新）** | 数据存 GitHub Discussions、评论者须 GitHub 登录；不进自有 PG；无法与 posts 关联计数；iframe 无 SSR/SEO |
| Waline | 3,128 | **GPL-2.0（传染性）** | 2026-10-08 | 自带用户体系与独立 Node 服务端 → 与 better-auth 形成双用户体系 |
| Artalk | 2,346 | MIT | 2026-10-01 | Go 独立服务 → **多一个进程，违反单容器约束** |

三者都是「博客评论插件」，设计前提是"文章在别处、评论托管给我"。本项目要的是"评论是 posts 的一对多关系、计数与帖子强一致、SSR 渲染进 HTML、删除权限绑定 better-auth 会话"。

**点赞**：无独立成熟方案——它本身就是一个唯一索引 + 一次 insert/delete，任何库都只会把它包得更厚。

**自研边界因此收缩到：3 张表 + 约 8 个 Server Action / Route Handler + 计数触发器。**

## 9. RAG / Agent 层选型（第二批）

- **AI 编排：Vercel AI SDK**（`ai` 包，npm 最新 **7.0.136**，"The AI Toolkit for TypeScript"，2026 年 JS/TS GenAI 五大框架之一）。一个包覆盖：`embed()`、rerank（类型层面有 `RerankResult<VALUE>`）、`streamText`（SSE 流式）、**tool calling**（工具调用）、`useChat`（流式前端）。截图方案里的 Tool Use 与 SSE 两步都是它的现成能力。
- **向量存储：pgvector + Drizzle**。2026 年共识「**90% 场景 pgvector 就够了**」（小于 1 亿数据、100ms 级、复用 PG 运维）。镜像本就是 `pgvector/pgvector:pg16`，**零新增组件**，契合单容器约束。
- **Embedding：本地跑 `Qwen3-Embedding-0.6B`（1024 维，ONNX，transformers.js）**，取代原计划的 bge —— 维度对齐 `vector(1024)` 且多语言更强，理由见第 10 节。
- **兜底网络搜索**：LLM + search 工具（AI SDK tool calling + Tavily / Exa / 博查）。
- **Agent 对照**：LangGraph.js。截图方案明确建议"先手写 ReAct loop 再上 LangGraph"，本计划沿用该顺序。

## 10. 本地嵌入/重排：Qwen3 0.6B 全套一手证据（重要修正）

初版计划假设用 BGE-M3。经 2026-10-09 调研实测，升级为**全套 Qwen3 0.6B**（Embedding + Reranker 均在 Node 侧本地跑，Apache-2.0）。

**Spike 4 全套实测（本机 Windows + Node 24，transformers.js v4 + onnxruntime-node）**：

| 模型 | 加载 | 单条/每条 | 维度 / 打分 | 结论 |
| --- | ---:| ---:| --- | --- |
| Qwen3-Embedding-0.6B (q8) | 35.8 s | ~200 ms | 1024 维；相关 0.762 / 无关 0.437 | last_token pooling + 指令前缀生效，对齐 vector(1024) |
| Qwen3-Reranker-0.6B (q8) | 71.5 s | ~900 ms（串行） | yes/(yes+no)；相关 0.9975 / 0.9610 / 无关 0.0001 | 生成式 yes/no 打分方向正确 |

**模型归属**：`onnx-community/Qwen3-Embedding-0.6B-ONNX` 与 `onnx-community/Qwen3-Reranker-0.6B-ONNX`（官方 ONNX，Apache-2.0）。**默认 1024 维，恰好与 `vector(1024)` 对齐，不需改表。**

**接入要点（已落地 lib/embeddings.ts、lib/rerank.ts）**：
1. Embedding：`feature-extraction` + `pooling:'last_token'` + `normalize:true`，query 端拼官方指令，tokenizer `padding_side='left'`；
2. Reranker **不能用 `text-ranking` pipeline**（传统 cross-encoder 接口），须 `AutoModelForCausalLM` 构造 `<Query>/<Document>/<score>` prompt 取末 token yes/no logits；stateful 须串行；
3. transformers.js v4 用 `dtype:'q8'`，禁用 `quantized:true`；模型缓存 `node_modules/.pnpm/.cache/` 会被 pnpm 清空，Docker 须显式拷贝。

**同时保留一条反面证据**：v2.0 根 `pnpm-workspace.yaml` 的 `allowBuilds` 里有 `onnxruntime-node: false`——它当年主动拒绝了这个原生模块的构建。Spike 3 已证实 Windows + Node 24 上 `onnxruntime-node` 安装成功，故回退路径暂不需要启用；若 Alpine 构建失败则回退 WASM 或托管 API（仅替换 provider 适配层）。

## 11. 电子书内容资产的一手事实（决定 Fumadocs 怎么接）

只读提取 `studyplan-v2.0\apps\web\content\`：

- 目录四层：`design/`、`exercises/`、`guide/`、`stages/`，加根目录 `index.md`
- 文件构成：`stages/stage-1..8.md`、`exercises/stage-1..8.md`、`guide/{roadmap,environment,git-workflow,project-structure,daily-digest,debugging-lessons,deployment-lessons,integration-lessons}.md`、`design/{01-visual-style-analysis,02-design-system-recommendations,03-issues-and-fixes,04-modification-plan,brand}.md`
- **29 篇正文没有 frontmatter**，标题取自正文首个 `#`；只有 `index.md` 有 VitePress 风格的 `layout/hero/features`
- **没有 `order` 字段**，顺序靠文件名数字前缀与手写分组

这直接影响方案：Fumadocs 的目录树不能依赖 frontmatter 排序，需改用 `meta.json` 显式声明，或按文件名前缀排序并从正文首个 h1 提取标题。

---

## 12. 业务逻辑自研点的市面替代方案复核（2026-10-09）

> 复核对象：§1 表格「必须自研」行 —— 帖子/评论/点赞数据模型与 Server Actions、RAG 检索编排、Agent loop。
> 方法：在 §8/§9 基础上补满候选，并对全部候选用 web 实时核实 `stars / license / last push`（数据见下表，**核实日 2026-10-09**，来源 GitHub REST API 与各项目官网）。
> 标尺与硬约束同 §0/§1：全生命周期成本；单容器 Vercel standalone（禁多进程/多容器）；PG16 + pgvector + Drizzle；better-auth HttpOnly Cookie 会话；SSR/SEO（评论进 HTML）；计数原子化 `GREATEST(0)`；可选能力降级不阻断启动（V5）。

### 12.0 自研边界（最小可替换单元）

经精读 `lib/` 与 docs，已落地资产（**非**待自研）：`embeddings.ts` / `rerank.ts`（本地 Qwen3 全套，仅后台 job）、`source.ts` / `ebook-title.ts`（Fumadocs 电子书管线）。

社区模块已反转（D16）：主帖 `posts` 与点赞 `likes` 移除，评论改用 Giscus，挂在电子书/页面下。待自研业务逻辑只剩两块：

1. **RAG 检索编排**：嵌入 → 向量库（pgvector）→ 重排 → LLM 生成的**编排层**（嵌入/重排已落地，编排未写）。
2. **Agent loop**：ReAct / tool calling 编排（第二批）。

### 12.1 功能级候选（当日核实）

| 候选 | stars | license | pushed_at | 约束冲突 | 结论 |
|---|---:|---|---|---|---|
| **评论系统** Giscus | 12,144 | MIT | 2026-05-26 | 数据存 GitHub Discussions，不进自有 PG；iframe 无 SEO；评论者须 GitHub 登录 | 采用：社区内容不重要，放松硬约束后 Giscus 的 SaaS 零进程反而契合单容器（见 D16 / §12.5） |
| Waline | 3,128 | **GPL-2.0** | 2026-10-08 | 传染性许可；自带用户体系与独立 Node 服务端 → 与 better-auth 双用户 + 多进程 | 排除 |
| Artalk | 2,346 | MIT | 2026-10-01 | Go 独立服务 → 违反单容器 | 排除 |
| Remark42 | 5,623 | MIT | 2026-10-01 | Go 评论引擎 → 违反单容器 | 排除 |
| 其他（Utterances/Cusdis/Disqus/Isso/Staticman） | — | 各异 | — | 均「文章在别处、评论托管给我」；iframe 或无 SEO 或独立服务 | 排除 |
| **搜索/向量库** pgvector（现有） | — | PostgreSQL 扩展 | — | 零新增组件，契合单容器；90% 场景足够 | **维持（不替换）** |
| Pinecone / Qdrant Cloud / Weaviate / Milvus / Chroma | 各数万~数十万 | 各异 | 当天 | 独立服务或外部 SaaS → 违反单容器 / 引入外部依赖 | 排除（除非放弃单容器） |
| Meilisearch / Typesense / Algolia | 各数万 | MIT/BSL/专有 | 当天 | 独立搜索服务 → 违反单容器；且检索量未到需专用引擎 | 排除（YAGNI，pgvector 够） |
| **RAG/Agent 框架** Vercel AI SDK（已选） | — | — | — | 已覆盖 embed/rerank/streamText/tool calling/useChat | **维持（不替换）** |
| Mastra | 28,654 | NOASSERTION（Elastic 类） | 2026-10-09 | TS 原生 agent/workflow/memory；可替代手写 ReAct loop，但 Vercel AI SDK 已覆盖基础编排 | **可部分替换（第二批 Agent loop 评估）** |
| LangChain.js / LangGraph.js | 18,250（JS 部分） | MIT | 2026-10-08 | LangGraph 是复杂 Agent 事实标准，但偏 Python 生态，JS 版较重；与 Vercel AI SDK 重叠 | 维持 Vercel AI SDK；Agent loop 重时可上 LangGraph |
| **AI 托管 API** OpenAI/DeepSeek/通义/智谱/Kimi/SiliconFlow | 各 SaaS | 专有 | 当天 | LLM 端点已环境变量化（D10）；嵌入/重排托管可替代本地 Qwen3 | **本地 Qwen3 维持**（数据不出网+零外部成本）；托管 API 作 D9 回退增强 |
| Voyage / Cohere / Jina / Mixedbread（嵌入/重排） | SaaS | 专有 | 当天 | 省 600MB 模型包袱，但内容出网+按量成本；与本地 Qwen3 同级质量 | 维持本地；作回退（仅换 provider 适配层） |

**功能级裁定**：评论改用 Giscus，主帖与点赞移除；向量检索维持 pgvector；RAG 基础编排维持 Vercel AI SDK；Agent loop 第二批可评估 Mastra 或 LangGraph.js（见 D9）。

### 12.2 平台级候选（整栈/CMS/社区，当日核实 + 复核）

| 候选 | stars | license | pushed_at | 约束冲突 | 结论 |
|---|---:|---|---|---|---|
| Supabase | 111,255 | Apache-2.0 | 2026-10-09 | 自托管 envoy 多容器（12 服务）→ 单容器冲突**仍成立**；但其 auth/vector/rest 已被 better-auth+pgvector+Drizzle 等价替代 | **维持排除**（若弃单容器则最强承载） |
| Payload v4 | 45,158 | MIT | 2026-10-08 | **可装进 /app 同进程 → 单容器冲突已不成立**；v4 稳定度待核实（复核 2026-10-09：npm `latest` 仍 3.90.2，v4 未稳定）；第一批不需 admin；better-auth 更轻 | **维持不引入**（理由更新：仅剩稳定度/admin 需求/轻量） |
| Strapi | 73,293 | NOASSERTION | 2026-10-08 | 独立 Node 后端+admin，与 Next.js 同进程集成弱；CMS 内容模型非社区互动逻辑 | 排除（品类错配） |
| PocketBase | 61,335 | MIT | 2026-10-08 | SQLite only → 与 PG+pgvector 冲突 | 排除 |
| Discourse | 47,945 | GPL-2.0 | 2026-10-09 | 成品 C 端社区（Rails），无法装进 Next.js 单容器，自带用户/DB，GPL 传染 | 排除（整体替换=放弃 Next.js 外壳） |
| Convex | — | 闭源内核 | — | 独立云/服务 + 自定义 DB → 与 PG+pgvector+Drizzle 冲突 | 排除 |
| Directus / NocoBase | — | MSCL / NOASSERTION+品牌条款 | — | 许可限制 + 独立服务 | 排除 |
| Keystatic / ZenStack / tRPC+Prisma / Redwood / Wasp / Blitz / t3 | — | 各异 | — | 或基于 Git（非 PG）、或用 Prisma（与 Drizzle 冲突）、或重选框架 | 排除 |

**平台级复核更正（对 §3/§4 的修订）**：
- **Payload**：旧「单容器冲突」理由**已不成立**（v4 native 装进 /app 同进程，45k★/MIT/当天活跃）。新排除依据收紧为：① v4 稳定度需核实（§4 记 2026-10-08 仍在 canary，今日仍建议核实）；② 第一批不需要 admin panel；③ better-auth + Drizzle 更轻。不影响「本批次不引入」结论，但**修正了排除依据**。
- **Supabase**：旧「多容器冲突」理由**仍成立且加强**（supabase/docker 2026-08 起 envoy 为默认网关，自托管 12 服务）。但其 auth/vector/rest 能力已被本项目单组件等价替代，**排除理由从「冲突」升级为「已被替代 + 仍冲突」**。
- 其余整栈候选均因「单容器 / PG+pgvector / 品类（成品社区 vs 内容管理）」冲突被排除，与 §3 结论一致。

### 12.3 逐块最终裁定

| 自研块 | 裁定 | 依据 |
|---|---|---|
| 帖子/评论/点赞 | 反转：主帖+点赞移除、评论用 Giscus | 社区内容不重要，放松硬约束后 Giscus 可用，主帖与点赞无承载价值移除（见 D16） |
| RAG 检索编排（嵌入→pgvector→重排→LLM） | **维持自研（Vercel AI SDK 编排 + 本地 Qwen3）** | 框架已选 Vercel AI SDK；向量用 pgvector；嵌入/重排已落地且数据不出网；托管 API 仅作回退 |
| Agent loop（第二批） | **可部分替换** | 手写 ReAct 可用 Mastra（28k★/TS 原生）或 LangGraph.js 替代，降低调试成本；但非必须 |

### 12.4 对 §8/§9 结论的修订小结

- **§8「业务层必须自研」：反转（D16）**。社区内容不重要，放松硬约束后评论改用 Giscus，主帖与点赞移除；若社区变重要可重启自研或换 Discourse。
- **§9「本地 Qwen3 全套 + Vercel AI SDK」：维持**。补充：Agent loop 第二批可评估 Mastra / LangGraph.js 作为手写 ReAct 的替代（DECISIONS D9 可细化）。
- **新增平台级复核**：Payload v4 单容器兼容理由已不成立（仅剩稳定度/admin/轻量），Supabase 多容器冲突仍成立（且已被单组件替代）。

### 12.5 Giscus 接入要点（落地指南，留后续批次）

在电子书/页面底部挂载 Giscus 评论区（React 封装或原生 `<script>` + 容器 div），数据存 GitHub Discussions，不进自有模型。

- 仓库开启 Discussions，装 Giscus App 并授权；设 `data-repo` / `data-repo-id` / `data-category` / `data-category-id`。
- 映射：用 `data-mapping="pathname"` 让每篇章节自动对应一个 thread（`strict` 或 `specific-term` 控粒度）；主题跟随站点明暗模式。
- 评论者须 GitHub 登录，与 better-auth 解耦；零进程契合单容器；不进 PG、不进 RAG（RAG 仍只检索电子书）。
- 回退：换 Utterances，或社区变重要时重启自研（D16）。

## 12.6 工程横切 + RAG/Agent 现成项目替代性复核（2026-10-09 补写）

> 对象：在 §12「业务逻辑自研点」之外，Audit §2 还拆解了约 19 处「需自己写代码」的工程横切 / 平台模块（错误包络、限流、日志、健康检查、AI 助手 UI 等）。本节仅复核其中「可被现成项目整体替代」的两类；其余（库已选、仅产品特有胶水 / 配置 / 测试）详见归档 `docs/archive/SELFBUILD-ALTERNATIVES.md`。

### 12.6.1 近乎零自研替代（2 处）

| 模块 | 现成项目 | 替代程度 | 约束兼容 | 证据 |
|---|---|---|---|---|
| 统一错误/成功包络 + requestId（Audit #1） | **next-safe-action**（MIT） | 直接替代自研包络中间件 | ✅ 纯库、同进程；包裹原生 `use server` Action，注入 zod 校验 + 统一错误处理 + 类型安全，对齐 SPEC §1 `ErrorBodySchema`/`SuccessBodySchema` | web_search 核实 |
| AI 助手 UI（Audit #16） | **assistant-ui**（`@assistant-ui/react`，MIT） | 直接替代手写聊天 UI 组件 | ✅ 纯 React 组件、shadcn 风格，支持 streaming / tools / persistence | web_search 核实 |

> 对比项（不取）：`tRPC`（#1 候选）需另起 API 层，与 App Router 单应用冲突；`CopilotKit`（#16 候选）更重、带后端 runtime，有违单容器风险。

### 12.6.2 可显著加速、领域逻辑仍自研（2 处）

| 模块 | 现成项目 | 替代程度 | 剩余自研 | 约束兼容 | 证据 |
|---|---|---|---|---|---|
| RAG 检索编排（Audit #10） | **Vercel AI SDK**（已选，embed/rerank/streamText 原语）+ 可叠加 `Mastra` 或 `LlamaIndex.ts` | 框架承担通用编排 | 「检索 → 重排 → 拒答 → 缓存 → 领域拼接」仍产品特有，不可完全消除 | ✅ 可同进程、可用本地模型 | §9 / §12.3 |
| Agent loop / tool calling（Audit #14） | **Mastra**（TS 原生、MIT、可同进程）或 `LangGraph.js`（1.0 成熟但 JS 版偏重） | 替代手写 ReAct loop | 业务 tool 与状态定义仍自研 | ✅ Mastra 可同进程嵌入 Next.js | §12.1 / §12.3 |

> 这两块是 Audit §2 中仅有的「纯自研业务逻辑」。采用框架后从「写编排」降为「配框架 + 胶水」，但领域编排（拒答原则、缓存键、额度）无法被框架消除。

### 12.6.3 结论

- 19 处中约 **4 处（21%）** 可被现成项目显著替代 / 加速：2 处（错误包络、AI 助手 UI）近乎零自研，2 处（RAG、Agent）显著加速但领域逻辑仍自研。
- 其余约 15 处因产品特有逻辑或单容器 / 数据不出网约束无法被整体替代，但库已选好（better-auth / Drizzle / Fumadocs / Giscus / pgvector / Vercel AI SDK / pino），自研量极低。
- 整体打包替代（Dify / RAGFlow / Supabase）不可行，维持「库 + 自研编排」。
- 详细逐模块表与采纳建议见归档 `docs/archive/SELFBUILD-ALTERNATIVES.md`。

## 13. 继承功能缺口对照（2026-10-09 补写）

> 主支 README 中的功能行为在本文 §1–§12 中没有归属的，逐项对照如下。行为规格本体统一落在 [`SPEC.md` §8 继承功能契约](SPEC.md#8-继承功能契约来自-v20-源码只读提取2026-10-09)（事实来源为 v2.0 源码只读提取，非 README 转写），本节只做「缺口 → 归属」的索引，不重复规格。

| 缺口 | README 出处 | 新方案归属 | 规格落点 |
| --- | --- | --- | --- |
| 健康检查 `/health` 503 语义 | 技术栈表 terminus 行 | 第一批；v2.0 的 terminus 被 §2 自有 `HealthStatusSchema` + 联动 503 取代，语义（仅查数据库、依赖不可用才 503）不变 | SPEC §8.1 |
| 单实例限流档位与豁免 | 目标态栈项 5（rate-limiter-flexible） | 第一批；限流库未单独选型（单实例内存实现即可），但 12 档位值与只读豁免照 v2.0 继承；多实例全局限流维持 §7 推迟 | SPEC §8.2 |
| AI 答案 7 天缓存 + 键空间隔离 + 禁 TTL | 目标态栈项 6、README §8.5 硬约束 | 第二批；载体从 lru-cache+Mongo 改为 LRU + PG 表，键需**加模型名**（修正 v2.0 缺陷） | SPEC §8.3 |
| `/ai/status` 契约、每日额度 300、未配 Key 降级 | 技术栈表 AI 行、README 部署一节 | 第二批；对应 D10 + §6.4；**模型名必须配置化**（README 实测 410 Gone 教训）——此理由是 D10 的补充依据，D10 原文不改 | SPEC §8.4 |
| RAG 拒答原则（检索为空宁可拒答） | 四条贯穿取舍 | 第二批（RAG 编排自研，§12.3）；升级为验收条目 | SPEC §8.5 |
| `daily_picks.postId` 弱引用级联删（R-B） | §换库风险 R-B | 暂缓-恢复时须知；v2.0 已修复为分层处置范式，恢复模块前必读 | SPEC §8.6 |

**两点与 README 表述的差异（以 v2.0 源码为准）**：

1. R-B 的「静默失效缺陷」在 v2.0 当前源码**已修复**（分层处置：404 幂等、其它错误中止级联、仅删帖成功才删互动）——README 描述的是修复前行为；
2. 模型名配置化的 env 在 v2.0 实际是 `NVNIM_MODEL`（默认 `openai/gpt-oss-20b`），非 `OPENCODE_MODEL`；新项目对应 D10 的 `LLM_MODEL`。
