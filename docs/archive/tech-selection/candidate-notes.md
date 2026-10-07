# 附录 B · 候选项目核实笔记

  **✅ 2026-10-07：15 条决策 + T1–T5 最终裁定已全部给出，本附录的核实结论已定稿。** 采纳与否决的最终清单见 [`final-stack.md`](final-stack.md)；**权威结论见 [`TECH-SELECTION.md`](../../../TECH-SELECTION.md) §0 最终裁定**。
 
  被裁掉的三项：**tRPC**（D11 否决）、**Redis / Upstash Redis / ioredis**（D10 否决）、**Better Auth**（D1=A 连带不再需要——Payload auth 已覆盖，避免双认证实现并存）。

  **⚠️ 第四/五轮追加**：**BullMQ 亦被替代**——第四轮确认 Payload Jobs Queue 在「顺序编排 / 从失败节点重试 / 主动中止」三点更强且零新增依赖。**D10 的裁决理由随之收紧**：不引 Redis 的理由不再是「BullMQ 支持 PG 后端」，而是「**队列在 Payload 的 `payload-jobs` collection 内、缓存在进程内、限流用内存后端，全栈无 Redis 需求**」。
 
  **「未纳入评估」不等于「否决」**：Hono 与 Nuxt Nitro 承接后端两项**本轮未抓取核实**，已从「否决」降级为「未纳入评估」。

  **这份文档是什么**
  记录选型过程中对每个候选项目的**外部核实结果**：许可证、版本、维护状态、覆盖能力、明确缺口、核实来源。
 
  **核实纪律**：版本号、许可证、维护状态一律以官方仓库页/官方文档为准，不凭记忆断言。抓取不到的一律标「待核实」。
 
  **核实时间**：2026-10-07（全部条目同批核实）
 
  **知识库检索结论**：本次通过 `RAG_search` 检索已连接知识库，**未命中任何与本项目技术选型相关的沉淀**（返回内容为腾讯云/微信云开发/TDesign 等无关文档）。因此本附录全部依赖官方来源核实。

---

## 0. 候选总表

| # | 候选 | 层 | 许可证 | Star | 一句话判定 |
| --- | --- | --- | --- | --- | --- |
| 1 | **Payload CMS 3** | L2 后端基座 | **MIT** | 45.1k | **推荐**。唯一同时支持 MongoDB + Postgres、且官方文档点名支持 Nuxt 的候选 |
| 2 | NocoBase 2.x | L2 后端基座 | **Apache-2.0**（2026-02-26 起） | 24.5k | 备选。协议已宽松，但自带 React 客户端与 Nuxt 二选一 |
| 3 | Directus 12 | L2 后端基座 | **MSCL 1.0（source-available）** | 38.2k | **否决**。非 OSI 开源，许可证随规模变化 |
| 4 | Strapi 5 | L2 后端基座 | MIT | — | 备选，无向量/AI 能力 |
| 5 | Sanity | L2 后端基座 | 专有（分层付费） | — | 否决。Studio 非完全开源 |
| 6 | **Vercel AI SDK 6.x** | L8 AI 调用 / L9 Agent | **Apache-2.0** | 27.2k | **推荐**。内置 `ToolLoopAgent` + 流式 |
| 7 | LangGraph（Python） | L9 Agent 编排 | MIT | 42.8k | 否决（主生态为 Python，本项目为 Node） |
| 8 | LangGraph.js | L9 Agent 编排 | MIT | 3.3k | **推荐作为对比实现**（恰好满足 FR-AGENT-8 双实现并存） |
| 9 | **Langfuse** | L9 评测与可观测 | **MIT**（`ee/` 除外） | 35.5k | **推荐**。直接覆盖 FR-AGENT-10 |
| 10 | pgvector | L7 检索与向量 | PostgreSQL License | 23.3k | 仅在换 Postgres 时启用 |
| 11 | Nuxt Content 3 | L10 文档站 | MIT | 3.7k | **推荐**（Nuxt 4 兼容性待核实） |
| 12 | VitePress 1.6 | L10 文档站 | MIT | — | **否决**。批次 10 要求弃用独立文档站 |
| 13 | Basecoat | L5 前端组件 | 未标注（**待核实**） | — | 否决。Nuxt UI 已满足组件需求 |
| 14 | Better Auth | L3 鉴权 | MIT | 30.2k | 备选（若不选 Payload 则启用） |
| 15 | Meilisearch | L7 全文检索 | MIT（CE） | — | 推荐（文档站内搜索） |
| 16 | Typesense | L7 全文检索 | GPLv3 | — | 否决。GPLv3 传染性 |
| 17 | Refine | L11 后台管理 UI | MIT | — | 否决。React 框架，与 Nuxt 冲突 |

---

## 1. Payload CMS 3 —— L2 后端基座（推荐）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/payloadcms/payload  |
| 许可证 | **MIT License**（仓库页明确标注） |
| Star | 45.1k（forks 约 4.3k，watchers 163，16,055 commits） |
| 定位 | 开源全栈 **Next.js** 框架，提供即时后端能力 + admin panel |
| 数据库 | Topics 明确含 `postgres` 与 `mongodb`；另有 `db-sqlite` / D1 部署路径（**SQLite 原生适配器未在仓库页确认，标待核实**） |
| 内置能力 | `Auth out of the box`；`Extremely granular Access Control`（细粒度访问控制）；document-level 与 field-level **hooks**；类型化 collections |
| Admin Panel | 自带可定制 **React** admin panel，支持 React Server Components 扩展 |
| 版本 | 存在 v2→v3 迁移指南与 `3.0 Migration Guide`；**精确版本号未在页面确认 → 待核实** |

### 决定性发现：官方明确支持脱离 Next.js，且点名 Nuxt

官方文档 <https://payloadcms.com/docs/local-api/outside-nextjs  原文要点：

- Payload 核心与 **Local API 可完全在 Next.js 之外使用**，官方明确列举场景含「在 **SvelteKit、Remix、Nuxt** 等前端框架中直接通过 Local API 访问 Payload 数据」。
- 独立脚本用 `getPayload({ config })` 初始化实例，直接调 `payload.create()` 等 Local API 方法，不经过 Next.js API Route 或 HTTP 请求。
- **但**：该 Local API 实例不会启动 Next.js 服务，也**不会因此启动 Admin Panel**。若需要 Admin Panel，仍需单独运行官方 Payload/Next.js 应用。

### 官方列出的 trade-off

| 限制 | 内容 |
| --- | --- |
| 模块系统 | **Payload 及全部官方包完全 ESM** |
| 环境变量 | `payload run` 模拟 Next.js 的 env 加载，官方**不建议额外使用 `dotenv`** |
| 转译 | `--use-swc` 更快但**可能破坏部分 import** |
| 替代运行时 | Bun 等非官方保证环境 |

  **对选型的意义**：这意味着「保留 Nuxt 前端 + 用 Payload 做后端 + 想要 admin panel」三者不能在同一进程成立，需要为 admin panel 额外付出一个 Next.js 运行时。这一代价必须显式计入，见主报告 L11 判定。

### 覆盖能力与缺口

**覆盖**：集合/字段定义、REST + GraphQL 自动生成、auth、访问控制、hooks、自定义端点、admin panel、文件上传、迁移、种子脚本、env 校验。

**缺口**：
- Admin Panel 绑 Next.js（本项目前端是 Nuxt）
- Local API 文档未明确说明是否绕过访问控制、事务一致性、REST/GraphQL 性能差异 → **均标待核实，需 PoC**
- ESM-only：现仓库 `packages/shared` 产物为 CJS（`packages/shared/package.json` 的 `dist/index.js` 为 CJS），需调整

---

## 2. NocoBase 2.x —— L2 后端基座（备选）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/nocobase/nocobase  |
| 当前许可证 | **Apache License 2.0**（仓库含 `LICENSE-APACHE.txt` 与 `LICENSE.txt`） |
| Star | 24.5k，18,206 commits |
| 定位 | 开源 AI + 无代码平台，构建业务系统 |
| 版本节奏 | `main` / `next` / `develop` 三分支并行。**已核实发布**：V2.0.5 (2026-02-26)、V2.0.3 (2026-02-25)、V1.9.48 (2026-02-24)、V2.1.0-BETA.2 (2026-02-22)、V2.1.0-ALPHA.6 (2026-02-25) |

### 许可证变更已从官方更新日志确认

来源：<https://www.nocobase.com/cn/blog/weekly-updates-20260226 

  `[acl] 将多个商业插件开源，并将协议由 AGPL-3.0 调整为 Apache-2.0 (#8682) by @chenos`

即 **AGPL-3.0 → Apache-2.0 的调整发生在 V2.0.3 / V2.1.0-ALPHA.6（2026-02-25 前后）**。这消除了 AGPL 传染性的顾虑。

### 覆盖能力与缺口

**覆盖**：可视化建表与字段、插件化架构、工作流/审批引擎、多空间权限、表格/看板/日历/图表等区块、Markdown 区块、REST+GraphQL、内置 AI 员工与 AI 知识库。

**缺口（对本项目）**：
- **自带 React 客户端**，与 Nuxt 前端二选一。若采用 NocoBase，前端需切到 NocoBase 客户端 → 9 个页面 + 22 个组件（8,677 行）全部重写
- 其核心价值（可视化建表、工作流）对 124 条 FR 中约 20 条运营需求有效，对 AI / 检索 / 路线 / 文档等 100 余条无帮助
- 升级节奏快（2026-02 一天内发 5 个版本），稳定性风险高于 Payload

---

## 3. Directus 12 —— L2 后端基座（否决：许可证）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/directus/directus  |
| 当前许可证 | **Monospace Sustainable Core License（MSCL）1.0** |
| 性质 | **source-available**（源码可用），源自 Fair Core License，**非传统宽松开源许可证、非 OSI 开源** |
| Star | 38.2k，13,954 commits |
| 免费门槛 | 免费 Core Tier 面向所有人；**组织年收入低于 500 万美元且员工少于 50 人**可申请 Open Innovation Grant；超出门槛且使用高级/企业功能时可能需商业许可 |
| 变更历史 | **v12（2026-05）从 BSL 1.1 改为 MSCL**，并在 v12 引入注册密钥机制 |

### 判定

**一票否决。** 项目定位为「可上线产品」，许可证从 source-available 起就带规模门槛与商业许可触发条件，属于不可控的合规风险。若后续产品规模超过门槛，需重新采购商业许可。

  该结论已通过 `web_search` 交叉验证（opentetechhub、ai.atmarketing、contensu 三处均指向 v12 改 MSCL）。**具体条款仍需法务确认**，本报告只判定「不适合作为可上线产品的基座」。

---

## 4. Vercel AI SDK 6.x —— L8 AI 调用 / L9 Agent 编排（推荐）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/vercel/ai  |
| 许可证 | **Apache License 2.0** |
| Star | 27.2k |
| 主包名 | `ai`（`npm install ai`）；模型适配包为 `@ai-sdk/*` |
| 当前主版本 | **6.x**（README 使用 `ToolLoopAgent`、`Output.object`、`createAgentUIStreamResponse` 等 6 系 API） |
| 运行时要求 | **Node.js 22+** |
| 内置能力 | `tools`、**`ToolLoopAgent`**（工具调用循环）、工具执行状态、**流式输出**（`createAgentUIStreamResponse` + `useChat`）、结构化输出（`Output.object`） |

### 覆盖能力与缺口

**覆盖**：
- FR-AGENT-1 工具调用协议能力验证 —— 工具声明与解析能力
- FR-AGENT-2 工具声明与入参校验 —— `tools` 的 schema 定义
- FR-AGENT-4 循环轮次上限与收敛 —— `ToolLoopAgent` 的步数上限
- FR-AGENT-9 流式输出 —— 内置流式
- FR-AI-2 上游调用与错误转译 —— `@ai-sdk/*` 统一错误类型

**缺口**：
- 需把现自研的 `nv-nim.client.ts`（303 行裸 fetch）改写为 SDK 调用，**NIM 的 OpenAI 兼容端点是否已被 `@ai-sdk/*` 覆盖需 PoC**
- **强制 Node 22+**：现 `package.json` 为 `engines.node  = 20.19.0`（需升）；`Dockerfile.vercel` 已是 `node:24-alpine`（影响可控）
- FR-AIQA-3 每日额度、FR-AIQA-2 缓存属业务规则，SDK 不提供

---

## 5. LangGraph / LangGraph.js —— L9 Agent 编排（对比实现）

| 项 | Python 版 | JS 版 |
| --- | --- | --- |
| 仓库 | <https://github.com/langchain-ai/langgraph  | <https://github.com/langchain-ai/langgraphjs  |
| 包名 | `langgraph` | `@langchain/langgraph` |
| 许可证 | MIT | MIT |
| Star | 42.8k | 3.3k |
| 维护信号 | — | 3,178 commits、600 forks、106 open issues、91 open PR |
| 维护方 | LangChain Inc. | LangChain Inc. |

**已核实能力**（两版共同）：持久执行（durable execution，失败后从中断处恢复）、人工介入（任意节点检查与修改状态）、短期/跨会话记忆、streaming。JS 版官方称为 Python 版的 "equivalent library"（**框架级对等，非逐项功能对等**）。

**轮次上限**：LangGraph 的 recursion limit 是**图执行步数**限制，而非严格意义的「对话轮数」。Python 版常见默认约 25 supersteps（**该数字非本次页面明确给出，需按实际安装版本核实**）。

**生产采用**（项目方自述，未经独立验证）：Replit、Uber、LinkedIn、GitLab。

### 判定

- **不作为主实现**。Python 版是主生态，引入 Python 运行时会让部署复杂度翻倍；JS 版 3.3k star + 106 open issues，成熟度明显低于 Vercel AI SDK。
- **恰好适合作为 FR-AGENT-8 要求的「框架对比实现」**。FR-AGENT-8 原文要求「手写实现与框架实现位于各自独立目录、产出等价答案、共用工具集与外围能力、框架依赖为可选项未安装时仍以默认实现启动、实现切换通过配置完成」。LangGraph.js 的图编排模型与手写 ReAct 循环在概念上正好构成对照，而它 Python-first 的定位反而强化了「主实现必须是 Node 原生」这一结论。
- **recursion limit 语义差异**（supersteps vs 轮次）是 FR-AGENT-4 落地时的具体风险点，须在 PoC 中验证能否精确映射到 8 轮。

---

## 6. Langfuse —— L9 评测与可观测（推荐）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/langfuse/langfuse  |
| 许可证 | **MIT**，明确说明 **`ee` 目录除外**（该目录可能采用其他许可证） |
| Star | 35.5k |
| 自托管 | 支持 Docker Compose（本地约 5 分钟启动）、虚拟机、Kubernetes Helm（推荐生产）、AWS/Azure/GCP Terraform |
| LLM 追踪 | 支持：LLM 调用、检索、Embedding、**Agent 操作**、用户会话 |
| 评测 | 支持：**LLM-as-a-Judge**、代码评估器、用户反馈、人工标注、自定义评测流水线、**数据集与基准测试** |
| OpenTelemetry | **未确认**。页面中的 "telemetry" 指自托管实例向 PostHog 发匿名统计，**不是 OTEL** → 待核实 |

### 判定

直接覆盖 FR-AGENT-10 的三项要求：评测集独立数据文件、参考答案人工标注、三类指标（答案准确率 / 拒答正确率 / 平均工具调用轮次与令牌消耗）。且「Agent 操作」追踪正好覆盖 FR-AGENT-4「每轮的轮次计数可观测」与 FR-AGENT-5/7「工具失败次数被计数」「结构校验失败次数被计数」。

**待核实项**：`ee/` 目录的具体许可与本项目所需功能是否落在 `ee/` 内。

---

## 7. Nuxt Content 3 —— L10 文档站（推荐）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/nuxt/content  |
| 许可证 | **MIT** |
| Star | 约 3.7k |
| 数据层 | **SQLite**（"Powerful query builder on top of SQLite database"）+ **Fully typed collections and queries** |
| Nuxt 4 兼容性 | **未确认**。README 只明确列出 "Nuxt 3 support"，未出现 Nuxt 4 → **待核实** |
| 内置搜索 | **未确认**。特性列表未提搜索组件或全文搜索 UI；SQLite 查询能力不等同于开箱即用的搜索界面 |
| 外部 SQL 数据库 | **不支持**。内置 SQLite 代表不能连接任意外部 SQL |

### 判定

`FR-DOC-1` 要求「文档由主站构建产出，不再由独立文档站产出」，Nuxt Content 是 Nuxt 官方模块，天然满足。**但 Nuxt 4 兼容性是必须先验证的阻塞项**——项目当前是 Nuxt 4.5.2。

`FR-DOC-3` 要求文档纳入站内搜索，Nuxt Content 只给了 query builder，**搜索需另接 Meilisearch**。

---

## 8. pgvector —— L7 检索与向量（条件启用）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/pgvector/pgvector  |
| 许可证 | **PostgreSQL License**（宽松） |
| Star | 约 23.3k，1,973 commits，9 open issues / 8 PR |
| 文档版本 | **v0.8.7** |
| Postgres 支持 | README 声明 **PostgreSQL 13+**；官方 Docker 标签覆盖 13–18 |
| 索引类型 | **HNSW**、**IVFFlat**；不建索引时默认精确近邻搜索 |
| 过滤检索 | 先在过滤字段建普通 B-tree；HNSW/IVFFlat 下 `WHERE` 在索引扫描后应用，高选择性过滤可能返回不足 → **迭代索引扫描**（v0.8.0+，`strict_order` / `relaxed_order`）可缓解；过滤值少时可用**部分 HNSW 索引**；多租户可用**列表分区** |
| 混合检索 | 支持向量相似度 + PostgreSQL 全文搜索（`plainto_tsquery` / `ts_rank_cd`）结合，用 **RRF** 或 Cross-Encoder 融合。**但 RRF 融合器与 Cross-Encoder 不内置**，需 SQL / 存储过程 / 应用层自行实现 |

**判定**：仅在「换 Postgres」分支下启用。详见主报告 L7 层判定与 L1 层换库成本分析。

---

## 9. Meilisearch —— L7 全文检索（推荐）

| 项 | 核实结果 |
| --- | --- |
| 许可证 | **Community Edition 为 MIT**；仓库 LICENSE 注明部分 Enterprise Edition 内容为 **BSL 1.1** |
| 对比 | 官方对比页明确：Meilisearch CE 的 MIT 比 Typesense 的 GPL-3 **更宽松** |
| 能力 | 容错搜索、自托管、faceting（基础统计；不支持 ES 式复杂多层嵌套聚合） |

**Typesense 否决理由**：**GPLv3**，与项目「可上线产品」的部署与分发方式存在冲突风险。

**判定**：用于 `FR-DOC-3` 文档站内搜索与 `FR-HOME-2` 命令面板的全文检索。注意其 faceting 能力有限——若需要复杂多维聚合统计需另评估。

---

## 10. Better Auth —— L3 鉴权（备选）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/better-auth/better-auth  |
| 许可证 | **MIT** |
| Star | **30.2k**（forks 2.9k，watchers 51，**7,668 commits**） |
| 定位 | framework-agnostic 的 TypeScript 认证与授权框架 |
| 维护信号 | 378 open issues / 463 open PR / 37 security issues；含 `e2e/` 与 `docs/` 目录，工具链完整（biome / turbo / vitest / changesets） |
| 活跃度信号 | topics 含 authentication / iam / oauth2 / oidc / sso / stripe / typescript |

**待核实**：是否支持 Nuxt 官方插件、refresh token 轮换、httpOnly cookie 路径限定（`FR-AUTH-4` 要求 Cookie path 限定 `/api/auth`）、MongoDB / Mongoose adapter 支持。

**判定**：**仅在 L2 层否决 Payload 时才启用**。若采用 Payload，其自带 auth 已覆盖 FR-AUTH-1/2/5，同时避免引入第二个认证实现（双 Token 轮换是两套 auth 语义并存的高风险点）。

---

## 11. Basecoat —— L5 前端组件（否决）

| 项 | 核实结果 |
| --- | --- |
| 官网 | <https://basecoatui.com/  |
| 定位原文 | **"All of the shadcn/ui magic, none of the React. A component library built with Tailwind CSS that works with any web stack."** |
| 许可证 | **页面未标注 → 待核实** |
| 组件覆盖 | Button / Badge / Alert / Dialog / Button Group / Quick Actions / 多套 Sidebar / Nav / Charts / Table / Empty State / Pagination / Auth / Settings / Tasks / Kanban / Calendar / 通知中心 / Danger Zone 等 |

**判定：否决。** 项目已在用 **Nuxt UI 4**（`@nuxt/ui ^4.11.1`），Basecoat 的组件覆盖与 Nuxt UI 高度重叠，引入两个 Tailwind 组件库会产生样式冲突与双份设计系统。Basecoat 的独特价值（不绑定 React）对本项目无意义——项目本来就用 Vue。

---

## 12. Strapi 5 / Sanity —— L2 后端基座（否决）

| 项 | 核实结果 |
| --- | --- |
| Strapi | **MIT**，v5 开源版免费、自托管不限用户数与内容类型；商业化走 Strapi Cloud 与企业许可 |
| Sanity | **专有许可**，Studio 非完全开源；免费档限制用户数（对比文章提到 20 用户档） |

**判定**：Strapi 无向量 / AI / Agent 相关能力，且 Nuxt 集成需另配；Sanity 的专有许可与「可上线产品 + 自托管」的边界冲突。两者均不进入主选。

---

## 13. VitePress 1.6 —— L10 文档站（否决）

现状：`apps/docs/package.json` 声明 `vitepress ^1.6.4`，31 篇 md + `.vitepress/config.ts`（194 行）。

**判定：否决。** `FR-DOC-1` 明确要求「文档由主站构建产出，不再由独立文档站产出」与「构建链不再产出独立文档站」。VitePress 是独立站构建链，与该要求直接冲突。**必须迁移**。

---

## 14. Refine —— L11 后台管理 UI（否决）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/refinedev/refine  |
| 许可证 | **MIT**（v5） |
| 定位 | **React** meta-framework，构建 internal tools / admin panels / dashboards / B2B |
| 特性 | headless by design，内部 hooks 与组件消除重复任务代码；支持多种 UI 框架（Ant Design、Material UI 等） |

**判定：否决。** Refine 是 React 框架，项目前端是 Nuxt/Vue。虽 headless 设计理论上可扩展，但核心价值（配套 React UI 组件）无法跨框架复用，引入等于新增第二个前端技术栈。

---

## 15. 核实缺口汇总（须进 PoC 清单）

| # | 待核实项 | 涉及候选 | 影响 |
| --- | --- | --- | --- |
| 1 | 精确稳定版本号 | Payload、NocoBase、LangGraph.js、Basecoat | 锁定依赖 |
| 2 | Nuxt 4 兼容性 | Nuxt Content 3 | **L10 阻塞项** |
| 3 | Atlas Vector Search 在免费集群的当前可用性 | MongoDB Atlas | L7 判定（基线 4.11 记录 M0 不支持，本轮未能独立核实是否已放开） |
| 4 | Local API 是否绕过访问控制 / 事务一致性 / REST-GraphQL 性能差异 | Payload | 影响 FR-CORE-2 与 FR-POST-3 的正确性 |
| 5 | NIM 的 OpenAI 兼容端点是否被 `@ai-sdk/*` 覆盖 | Vercel AI SDK | L8 落地可行性 |
| 6 | Langfuse `ee/` 目录许可与所需功能归属 | Langfuse | FR-AGENT-10 可用性 |
| 7 | Directus MSCL 具体条款 | Directus | 已否决，仅供决策点留档 |
| 8 | Better Auth 的 Nuft 适配 / refresh 轮换 / Mongoose adapter | Better Auth | 备选路径可行性 |
| 9 | LangGraph.js recursion limit 能否精确映射到「8 轮」 | LangGraph.js | FR-AGENT-4 语义对齐 |
| 10 | Basecoat 许可证 | Basecoat | 已否决，仅备查 |

---

# 第二轮 · 候选核实笔记

  **核实时间**：2026-10-07（同批）
 
  **知识库检索**：本轮再次通过 `RAG_search` 检索「PostgreSQL pgvector 迁移 OpenTelemetry 自托管 pgvector 性能调优 踩坑经验」，**结果为空**（返回 `knowledge_base_result` 无条目）。两轮检索均确认知识库无相关沉淀，全部依赖官方来源核实。

---

## 16. 统一技术栈候选

### 16.1 tRPC（**不引入，但保留为可选**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/trpc/trpc  |
| 许可证 | **MIT License** |
| Star | **40.7k** |
| 当前主版本 | **未能从页面确认** → 待核实 |
| 服务端适配器 | 官方 README 列出 **Next.js / Express.js / Fastify**，另有 React.js（属客户端集成）与**未枚举的社区 adapter** |
| **Nuxt / Nitro adapter** | ⚠️ **官方 README 未列出**。这不能断定「不存在」，但**不能作为可依赖项** |
| Standard Schema / Zod | README 未明确提及；其「静态类型安全」是编译期能力，**不等同于 Zod 运行时校验** |

**判定：❌ 已否决（D11）。** Payload 已提供类型生成，tRPC 的增量价值主要是「前后端端到端类型安全」。**核心理由**：官方 README 未列 Nuxt / Nitro adapter，与「前后端统一栈减少开发」的目标相悖——引入一个依赖社区 adapter 的框架会增加维护面。若未来决定弃用 Payload，则 tRPC 应升为首选（MIT、40.7k star，框架级能力对等 Zod，缺的只是 Nuxt 集成）。

### 16.2 Drizzle ORM（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/drizzle-team/drizzle-orm  |
| 许可证 | **Apache-2.0 License** |
| Star | **36.0k**（forks 1.7k，watchers 91，**2,944 commits**） |
| 体积 | **~7.4kb minified+gzipped，0 dependencies** |
| 支持数据库 | PostgreSQL、MySQL、SQLite，含 serverless（Turso、Neon、Xata、PlanetScale、Cloudflare D1、FlyIO LiteFS、Vercel Postgres、Supabase、AWS Data API） |
| 运行时 | NodeJS、Bun、Deno、Cloudflare Workers、Supabase functions、Edge runtime、**浏览器** |
| **迁移工具** | **Drizzle Kit CLI** — 可生成 SQL migration 文件或直接应用 schema 变更 |
| 附加工具 | Drizzle Studio（浏览与操作数据）、drizzle-seed、`drizzle-zod` / `drizzle-valibot` / `drizzle-arktype` / `drizzle-typebox` 集成包、eslint-plugin-drizzle |
| 维护信号 | open issues 1.4k / PR 727 / security 1；采用 turbo + biome + vitest + changesets 工具链 |

**判定：引入。** 承担 Payload 未覆盖的复杂查询：pgvector 向量检索、`GROUP BY` 加权统计、`ILIKE` + `pg_trgm` 全文检索、`GREATEST(0, col + delta)`、`ON CONFLICT` 幂等。**Drizzle Kit 解决 PG 无 `autoIndex` 的 DDL 缺口**（现状 14 个索引需手写迁移）。

**与 Payload 的关系**：两者共存不冲突——Payload 负责 auth / 权限 / 集合定义 / 迁移，Drizzle 负责复杂查询，共用同一 Postgres schema。

### 16.3 Zod 4（**引入，作为统一校验层**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/colinhacks/zod  |
| 许可证 | **MIT License** |
| Star | **44.1k**（候选中最高） |
| 当前主版本 | **Zod 4.x**（README 使用 Zod 4 的 API 与错误结构；精确 `4.x.y` 待核实） |
| **Standard Schema** | ✅ **实现 Standard Schema V1 接口**，可直接供支持该标准的表单、AI SDK 与验证工具消费 |
| 环境变量校验 | ✅ 支持。`z.object({...}).parse(process.env)` + `z.coerce.number()` 处理 env 字符串 |
| Tree-shaking | ✅ 无副作用、可摇树模块结构；核心包约 **2 KB gzip**、零外部依赖 |
| TypeScript 支持 | 官方建议使用与依赖库相同或更高版本的 TypeScript |

**判定：引入，作为「统一栈」的真正抓手。** 它同时覆盖 `FR-CORE-6`（环境变量）、`FR-CORE-1/2`（包络与错误明细）、`FR-CONTRACT-1`（数值约束单一来源）、`FR-POST-2`（`.strict()` 拒绝未声明字段）、`FR-AGENT-2/7`（工具入参与结构化输出）。**Standard Schema V1 是关键——它使 Zod 同时被 tRPC、Vercel AI SDK、Nuxt Content 消费，无需为每个栈各写一套校验。**

  ⚠️ **落地注意两点**：①「0 是有效值」需用 `z.coerce.number().min(0)` 而非 `.positive()`（现状 `nonNegativeSetting` 专门处理此语义）②「两个 JWT 密钥相同则启动失败」需用 `.refine()`。

### 16.4 Hono 与 Nuxt Nitro

| 候选 | 核实结果 | 判定 |
| --- | --- | --- |
| Hono | 本轮**未单独抓取**（时间与上下文预算），其服务端适配器能力待补 | 🔶 待核实 |
| Nuxt Nitro server routes | 未单独抓取内置路由能力边界 | 🔶 **D11 相关**：若要把后端并入 Nuxt 进程（运行时从 2 降到 1），需评估 Nitro 能否承接现有 12 个业务模块 + 5 个 cron 触发端点 |

**判定：暂不引入。** 「运行时从 2 降到 1」的收益需要先证明 Nitro 能承载现有后端职责（14 个集合的 DDL migration、pgvector 长连接、SSE 流式、Swagger 文档），属于需要实机验证的架构级判断，不宜在文档选型阶段拍板。**建议列为 D11 的子决策，在 P1 之后单独评估。**

---

## 17. 通用能力补配候选

### 17.1 OpenTelemetry JS（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/open-telemetry/opentelemetry-js  |
| 许可证 | **Apache 2.0** |
| Star | 3.5k（forks 1.2k，watchers 49，**3,573 commits**） |
| **Node 支持** | **Node.js v26 / v24 / v22 全部支持**；仅支持 Active 或 Maintenance LTS |
| 核心包 | `@opentelemetry/api`（接口 + no-op）、`@opentelemetry/sdk-node`、`@opentelemetry/auto-instrumentations-node`、`@opentelemetry/sdk-trace`、`@opentelemetry/sdk-metrics`、`@opentelemetry/resources`、`@opentelemetry/semantic-conventions` |
| **HTTP 自动埋点** | ✅ `@opentelemetry/instrumentation-http`（Node 核心 instrumentation 之一） |
| 初始化方式 | `sdk.start()` + `process.on('SIGTERM', ...)` 优雅关闭；`-r ./tracing.js app.js` 预加载 |
| 版本兼容 | 稳定包 2.0.x（`@opentelemetry/api` 1.30.x / experimental 0.57.x），三档包同版本发布 |
| **信号成熟度** | **Tracing = Stable，Metrics = Stable，Logs = Development** |
| 治理 | **CNCF 治理**。Maintainer 来自 Bloomberg、Datadog、Dynatrace、Elastic、Grafana Labs、Microsoft、Splunk、Uber |

**判定：引入。** 覆盖 `FR-CORE-3`（W3C trace context 自动传播，`ApiSuccessBody.requestId` 改读 traceId）与 `FR-CORE-4`（`tracer.startSpan('posts.findAll.db')` 替代 169 行的 `withTiming` + 慢请求拦截器）。

  **两点必须在报告与 PoC 中显式标注**：
  ① **Logs 信号仍是 Development** —— 「401/404 完全不记日志」「访问日志按状态码分级」不能依赖 OTel 的日志管道，仍需保留自研的分级逻辑。OTel 承担 trace 与 span 计时。
  ② **star 数会误导** —— 3.5k 看似偏低，但 CNCF 治理 + 8 家大型厂商 maintainer，用 star 数判断稳定性会误判。

**collector 与后端未核实**：Jaeger / Grafana Tempo / ClickHouse 的选型与配置需补（本轮未抓取）。这是自托管方案的主要工作量所在。

### 17.2 Octokit（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/octokit/octokit.js  |
| 许可证 | **MIT License** |
| Star | **7.9k**（forks 1.3k，watchers 180，473 commits，40 open issues / 12 PR） |
| 定位 | GitHub 官方「all-batteries-included」SDK，覆盖 Browsers / Node.js / Deno |
| 三个客户端 | API client（REST + GraphQL + Auth）、App client（GitHub App + Webhooks + OAuth）、Action client |
| **`userAgent` 选项** | ✅ 构造选项，`request` 与 `authStrategy` 同级。**对应现状「必须带 `User-Agent` 否则 GitHub 403」** |
| **限流** | ✅ `@octokit/plugin-throttling`：`onRateLimit` / `onSecondaryRateLimit` 钩子，**默认重试一次并打日志**；**集群场景支持 Redis 后端** |
| **重试** | ✅ `@octokit/plugin-retry`，可通过 `retry: { enabled: false }` 关闭 |
| 分页 | ✅ `octokit.paginate` / `octokit.paginate.iterator`（异步迭代器最省内存） |
| 错误处理 | ✅ `RequestError` 提供 `status` / `request`（含 headers 与 body）/ `response` |
| Node 要求 | **Node 18+**（含原生 fetch） |
| 测试覆盖 | README 声称 100% test coverage |

**判定：引入。** 覆盖 `FR-GH-1`（替代现状自研 259 行 client）、`FR-GH-2`（throttle 替代表内的最小刷新间隔节流）、`FR-GH-5`（`RequestError.status` 支撑「403 → 很可能是触发了 Search API 限流」的转译）。

**Octokit 不覆盖、需保留自研的部分**：`git/trees` 响应 `truncated` 字段的业务级处理（现状 `scripts/scan-learning-materials.mjs` 已处理）、三级回退层次定义、「不打印完整响应体」的日志纪律。

### 17.3 rate-limiter-flexible（**部分引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/animir/node-rate-limiter-flexible  |
| 许可证 | **ISC License** |
| Star | **3.6k**（forks 195，911 commits） |
| **后端** | ✅ `RateLimiterMemory`（注明可用于浏览器）+ Redis（原子与非原子计数器，兼容 `redis` / `ioredis` 客户端） |
| 已明确支持的算法 | ✅ **Flexible Fixed Window**（窗口从首次请求到达时开始计时） |
| 其他算法 | `BurstyRateLimiter`（突发流量）、`RateLimiterQueue`（FIFO 队列）、`RateLimiterUnion`（组合多个限流器）。**令牌桶 / 漏桶 / 滑动窗口未在 README 明确说明** → 待核实 |
| **⚠️ `duration` 单位** | **秒**（`blockDuration` 同）。返回对象的 `msBeforeNext` 虽以毫秒表示，但只是等待时间返回值，**不代表支持毫秒级配置** |

**判定：部分引入。**
- ✅ **用于 `FR-CORE-5` 限流**（默认 30/min、逐路由、热门榜单豁免）
- ❌ **不用于 `FR-AIQA-3` 每日额度** —— 每日额度是「按自然日重置 + 软上限」，不是滑动窗口；且秒级 `duration` 与现状毫秒级 `ttl` 语义冲突。**每日额度改用 PG `INSERT ... ON CONFLICT DO UPDATE` 原子累加**（这同时消除了现状「先读再增」的并发超限，是换库带来的实质改进）

  **待核实**：是否接受小数秒（需查源码或 Wiki，README 未给保证）。

### 17.4 lru-cache（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/isaacs/node-lru-cache  |
| 许可证 | ⚠️ **BlueOak-1.0.0**（OSI 认可的宽松许可，MIT + BSD 合并；**但不是 MIT，不能笼统标注**） |
| Star | **5.9k** |
| 当前主版本 | **v11** |
| **`ttl` 单位** | ✅ **毫秒**（与现状 `@Throttle({ttl: 60_000})` 一致） |
| TTL 行为 | 默认**非强制 TTL**：过期项读取时视为不存在并删除；`ttlAutopurge` 可开启自动清理；`allowStale` 可在删除前返回过期值 |
| 容量约束 | ⚠️ 若既无 `max` 也无 `maxSize`、仅设 TTL 且不启用自动清理，**缓存仍可能持续增长**。README 建议纯 TTL 场景考虑 `@isaacs/ttlcache` |
| 部署 | ✅ **纯进程内库，无需额外部署服务** |
| 替代项 | `@isaacs/ttlcache`（README 明确推荐的纯 TTL 场景替代） |

**判定：引入。** 覆盖 `FR-AIQA-2`（7 天答案缓存，进程内毫秒 TTL + 落库表）与 `FR-ASK-3`（`namespace` 选项实现键空间隔离，替代现状 `posts|` 手工前缀）。

  ⚠️ **两处需注意**：① 许可为 BlueOak-1.0.0，需在 `NOTICE` 保留原文条款；② 现状场景是「纯 TTL + 落库」，若不设 `max`/`maxSize` 需开启 `ttlAutopurge`，否则会增长。

### 17.5 BullMQ（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/taskforcesh/bullmq  |
| 许可证 | **MIT License** |
| Star | **9.5k** |
| **后端** | ✅ 仓库简介明确写 **"Redis or PostgreSQL"**；功能对照表的后端列为 Redis。**新版提供 PostgreSQL 支持，使用时应按具体版本文档确认** |
| Node 客户端建议 | `redis  = 5.0.0`（仅自托管 Redis 时需要） |
| **Repeatable jobs** | ✅ 功能对照表明确支持 |
| **Cron 风格调度** | ✅ job scheduler 支持 Cron 表达式（**具体 API 未在本次摘录中展示** → 待核实） |
| **去重** | ✅ **Debouncing**（队列中不要同时存在相同键的多个待处理任务）与 **Throttling**（指定时间窗口内限制相同键再次入队）两种模式 |
| **失败重试** | ✅ `attempts` + `backoff`（固定 / 指数 / 自定义），耗尽后进入 failed 状态 |
| **执行模型** | ⚠️ **「至少一次执行」**。README 明确即使启用重试，业务操作仍应设计成幂等 |

**判定：✅ 引入。** 覆盖 `FR-DIGEST-5`（调度）。**换 Postgres 后不需额外 Redis 服务**——这是 D10「不引 Redis」决策的关键支撑：队列用其 PostgreSQL 后端，缓存用 lru-cache（进程内）+ PG 落库，限流用 rate-limiter-flexible 内存后端，三处都不需要 Redis。

  BullMQ 的「至少一次」执行模型与本项目的幂等纪律（不可违反项 6、基线 6.1）**恰好吻合**：每日报道的九步流程已设计为幂等（占位写入依赖唯一键、11000 当并发安全退出），换 PG 后改为 `ON CONFLICT`。

### 17.6 ts-morph（**引入**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/dsherret/ts-morph  |
| 许可证 | **MIT License** |
| Star | **6.2k** |
| 定位 | TypeScript Compiler API 的封装，用于静态分析与程序化代码变更 |
| **抽取导出符号** | ✅ `SourceFile#getExportedDeclarations()` 返回导出名称及对应声明 |
| **抽取文件头注释** | ✅ 声明节点 `getJsDocs()` → `getDescription()` 取正文，`getTags()` / `getTagName()` / `getCommentText()` 取 `@param` `@returns` 等标签 |
| 相关包 | `ts-morph`、`@ts-morph/bootstrap`（**无 `ts-morph-internal` 独立包**） |

**判定：引入。** 覆盖 `FR-AIQA-4`。**其 API 与现状 `scripts/generate-code-index.mjs`（196 行）的抽取规则一一对应**——`getExportedDeclarations()` 替代「扫 `exports` 字段」，`getJsDocs().getDescription()` 替代「解析文件头注释」。

  ⚠️ **已知边界**：`export { x } from "./x"` 等重导出场景，取原始符号的 JSDoc 需沿 TypeScript Symbol 别名继续追踪。现状索引对重导出的处理需比对。
  「多路径探测」「启动预热」「加载失败永不抛」三条属工程约束，**保留自研（薄）**。

### 17.7 pgvector 深化（**引入**）

第一轮已核实，此处补充第二轮用到的能力：

| 能力 | 核实结果 |
| --- | --- |
| 版本 / 许可 | v0.8.7，**PostgreSQL License** |
| 索引 | HNSW（`m=16`、`ef_construction=64`、`hnsw.ef_search=40`）与 IVFFlat（`lists` / `ivfflat.probes`） |
| **迭代索引扫描** | v0.8.0+ 支持。`strict_order`（严格按距离排序）/ `relaxed_order`（可能偏离严格顺序但召回更好）。**解决「HNSW 下 `WHERE` 在索引扫描后应用，高选择性过滤导致返回不足」** |
| 部分索引 | 过滤值较少时可用**部分 HNSW 索引** |
| 列表分区 | 过滤值很多或多租户隔离时按类别/租户分区，避免互相影响召回 |
| 混合检索 | 向量相似度 + `plainto_tsquery` 全文 + `ts_rank_cd` 排名，RRF 或 Cross-Encoder 融合 |
| ⚠️ RRF 限制 | **RRF 融合器与 Cross-Encoder 不内置**，需 SQL / 存储过程 / 应用层自行实现 |
| 距离条件 | 建议通过物化 CTE 先取候选，外层再应用距离过滤 |

**第二轮用到的三点**：
1. **HNSW 替代内存点积** —— 取消现状 140 行代码中的 4 处易错设计（全量 Map、写端覆盖表含 `null` 墓碑、5min TTL、维度检查）
2. **`model` 列作混库防线** —— 落为普通列 + SQL 条件过滤，对应现状 `vector-store.service.ts:74`
3. **`vector(1024)` 维度固定在 DDL** —— ⚠️ **换 embedding 模型（3072 维）需 DDL 变更**，这是新增的迁移约束

### 17.8 Meilisearch 自定义排序（**部分能力不足**）

| 项 | 核实结果 |
| --- | --- |
| `rankingRules` 类型 | `string[]`。**Built-in rules + custom sort rules（`attribute:asc` 或 `attribute:desc`）** |
| `filterableAttributes` / `sortableAttributes` | 需提前声明；筛选与排序行为随声明变化 |
| 默认返回条数 | 1000（可在 settings 中调整） |

**判定：`FR-AIQA-5` 判0.5 的技术依据。** `rankingRules` **只能表达字段排序，无法表达「路径 3 / 导出 2 / 摘要 1」的加权求和**。中文 2 字滑窗分词亦无现成实现。

替代路径：Meilisearch 或 PG `tsvector` 做**候选集粗筛** → 自研精排打分。

---

## 18. 核实缺口汇总（第二轮更新）

| # | 待核实项 | 涉及候选 | 状态 |
| --- | --- | --- | --- |
| 1 | 精确稳定版本号 | Payload、NocoBase、LangGraph.js、Basecoat、tRPC、Zod、lru-cache | ⏳ 仍待核实（**需执行 `npm view <pkg  version` 实测**） |
| 2 | **Nuxt 4 兼容性** | Nuxt Content 3 | ⏳ **仍是阻塞项**。官方安装页未列 Nuxt 最低版本。**建议改查 `@nuxt/content` 的 `peerDependencies`（比查文档更确定）** → PoC P20 |
| 3 | Atlas Vector Search 在免费集群的当前可用性 | MongoDB Atlas | ➖ **第二轮已不需要**（换 Postgres + pgvector） |
| 4 | Local API 是否绕过访问控制 / 事务一致性 | Payload | ⏳ 仍待核实 → PoC |
| 5 | OpenCode Zen 的 OpenAI 兼容端点是否被 `@ai-sdk/*` 覆盖（L8 后端已由 NIM 切到 Zen） | Vercel AI SDK | ⏳ 仍待核实 → PoC P7 |
| 6 | Langfuse `ee/` 目录许可与所需功能归属 | Langfuse | ⏳ 仍待核实 → PoC P18 |
| 7 | Directus MSCL 具体条款 | Directus | ➖ 已否决，仅留档 |
| 8 | Better Auth 的 Nuxt 适配 / refresh 轮换 / Drizzle adapter | Better Auth | ✅ **已不影响主方案**（D1=A裁定采用 Payload auth，Better Auth 连带移出） |
| 9 | LangGraph.js recursion limit 能否精确映射到「8 轮」 | LangGraph.js | ⏳ 仍待核实 → PoC P9 |
| 10 | Basecoat 许可证 | Basecoat | ➖ 已否决，仅备查 |
| 11 | **OpenTelemetry 的 collector 与后端选型**（Jaeger / Tempo / ClickHouse） | OpenTelemetry | 🆕 **未核实**。自托管方案的主要工作量 |
| 12 | **rate-limiter-flexible 是否接受小数秒** | rate-limiter-flexible | 🆕 未核实（README 只说 `duration` 单位是秒） |
| 13 | **BullMQ 的 PostgreSQL 后端稳定性与 Cron API** | BullMQ | 🆕 仓库简介写「Redis or PostgreSQL」，但**功能表后端列为 Redis，需按版本确认** → PoC P28 |
| 14 | **Hono 的服务端适配器能力** | Hono | 🆕 本轮未抓取 |
| 15 | **Nuxt Nitro 能否承接现有后端职责**（运行时从 2 降到 1） | Nuxt | 🆕 本轮未抓取 → D11 子决策 |
| 16 | 现状 35 个索引的完整 DDL 清单 | pgvector / Drizzle Kit | 🆕 需从 6 处显式 `.index()` + 15 个 `@Prop` 内联声明逐个翻译 |

  **第二轮新增 6 项待核实（#11–#16）**，其中 #11（OTel collector）与 #16（DDL 清单）工作量最大。

---

# 第三轮 · 候选核实笔记（GitHub 实证调研）

  **核实时间**：2026-10-07（三轮同批）
 
  **调研范围**：针对第一/ 二轮判定为「保留自研」的缺口做GitHub 实证调研，覆盖 **11 个新候选**，针对 **4 条0 分项** 与 **4 条 0.5 分项**。
 
  **知识库检索**：第三轮未再检索（前两轮已两次确认知识库无相关沉淀）。

## 19. 阻塞项核实：Nuxt Content 的 Nuxt 4 兼容性（**P20 已解除**）

### 19.1 `@nuxt/content` npm 包元数据（**最关键的核实**）

来源：`https://registry.npmjs.org/@nuxt/content/latest`（**直接读包元数据而非文档**——这是 P20 设计意图）

| 字段 | 值 |
| --- | --- |
| 最新版本 | **3.16.1** |
| `engines.node` | **` = 20.19.0`** |
| `peerDependencies` | **不含 `nuxt`**。6 个 peer 全为 `optional: true`：`sqlite3: *`、`valibot: ^1.2.0`、`@libsql/client: *`、`better-sqlite3: ^12.5.0 \|\| ^13.0.0`、`@electric-sql/pglite: *`、`@valibot/to-json-schema: ^1.5.0` |
| `dependencies` 关键项 | **`@nuxt/kit ^4.5.2`**、`shiki ^4.4.3`、`unified ^11.0.5`、`remark-mdc ^3.11.1`、`@nuxtjs/mdc ^0.23.1`、`isomorphic-git ^1.42.2`、`socket.io-client ^4.8.3`、`db0 ^0.4.1`、`ufo`、`hookable`、`consola`、`nypm`、`scule`、`slugify` 等（共 **48 项**） |
| `devDependencies` 关键项 | **`nuxt ^4.5.2`**（与本项目 `nuxt ^4.5.2` **完全一致**） |
| 许可 | MIT（第一/ 二轮已核实） |

### 19.2 证据链三条

| # | 证据 | 说明 |
| --- | --- | --- |
| 1 | **`peerDependencies` 不含 `nuxt`** | **Nuxt module 的惯例是不把 `nuxt` 声明为 peer dependency**（框架版本由 Nuxt 自身解析）。因此 peer 缺失**不构成**否定证据 |
| 2 | **`dependencies` 含 `@nuxt/kit ^4.5.2`** | Nuxt Kit 4.x即 **Nuxt 4 的工具链**。它依赖 Nuxt 4 工具链，说明运行时按 Nuxt 4 API 编写 |
| 3 | **`devDependencies` 含 `nuxt ^4.5.2`** | 它自身开发与测试用的就是 **Nuxt 4.5.2**——与本项目版本号完全对齐 |

**结论：明确支持 Nuxt 4。** 决策 D3 的阻塞项解除，`FR-DOC-1` / `FR-DOC-2` 的目标态可行性从「未验证」变为「已确认」。**仍建议补跑 P19（实机构建 31 篇）作为端到端确认**，因为包元数据只能证明「支持」，不能证明「31 篇 + 5 组导航 + 旧链接重定向」这条完整需求链无意外。

### 19.3 附带发现

`@nuxt/content` 3.16.1 依赖 **`@nuxt/kit ^4.5.2`** 与 **`zod ^3.25.76`**——它自身就依赖 Zod（尽管它对 `valibot` 是 optional peer）。这对第 11.4 节「Zod 4 作为跨栈校验层」的判定是**正向证据**：Zod 在 Nuxt 生态内已被广泛使用，不是孤岛。

## 20. 编排引擎（对应 `FR-DIGEST-1` / `FR-DIGEST-4`）

### 20.1 Trigger.dev（**未纳入评估 · 待 D12**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/triggerdotdev/trigger.dev  |
| 许可证 | **Apache License 2.0** |
| Star | **16.5k** |
| 定位原文 | 「The open-source platform for building AI workflows in TypeScript」 |
| **自托管** | ✅支持。提供 **Docker Compose** 自托管指南 + **基于官方 Helm Chart** 的 Kubernetes 部署 |
| TypeScript | ✅ TypeScript-first / native。提供 JS/TS SDK（`@trigger.dev/sdk`），示例使用类型化 payload |
| 长任务 | ✅ 明确支持耗时与资源密集型任务，宣称任务执行**「没有超时」（no timeouts）** |
| **自动重试** | ✅ 未捕获异常触发自动重试 |
| 其他能力 | durable tasks、队列、**幂等性**、**检查点与版本控制**、**任务暂停/等待**、**human-in-the-loop** |
| ⚠️ **待核实** | ① **自托管是否需PostgreSQL / Redis / 对象存储—— README 未列**（不得断言）② **可配置的每任务超时**未说明 ③ **自动重试的最大次数、退避规则**未说明 |

**判定：未纳入评估（待 D12）。** 能力与 `FR-DIGEST-4`「中途失败停在安全状态」高度契合（durable execution + checkpoint + human-in-the-loop）。但**自托管依赖未核实**是关键缺口——若它需要 Redis，则与 D10「不引 Redis」直接冲突。

### 20.2 Temporal（**暂缓**）

| 项 | 核实结果 |
| --- | --- |
| 许可证 | **MIT** |
| 定位 | 开源 durable execution 平台（temporal.io） |
| 核心能力 | 崩溃后续跑（durable execution）、Web UI 开源（`temporalio/ui`、`temporalio/ui-server`） |
| Go SDK | `go.temporal.io/sdk/workflow` v1.49.0，MIT |

**判定：暂缓。** 需**独立服务集群**（Temporal Server + 其数据库），与 D10「不引额外服务」的取向冲突。Go SDK 是主要成熟实现；本项目是 Node 技术栈，采用它需引入跨语言 SDK 或 Java/Go 侧服务。

### 20.3 Windmill（**❌ 否决 · 许可陷阱**）

| 项 | 核实结果 |
| --- | --- |
| 许可证原文 | `https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE` |
| `backend/` | 主要 **AGPL-3.0**；带 `enterprise` 编译标志的代码属**专有商业许可** |
| `frontend/` | 主要 **AGPL-3.0**；需通过 *positive license check* 才能启用的代码属专有商业许可 |
| `python-client/`、`deno-client/`、`go-client/`、`powershell-client/` | **Apache License 2.0** |
| OpenAPI 文件与 OpenFlow 规范 | **Apache License 2.0** |
| 不启用 `enterprise` 标志从源码编译的二进制 | **AGPL-3.0** |
| CE的 Docker 镜像与 GitHub 二进制发行版 | 含 AGPL/Apache 代码，**但也包含非开源的专有代码和功能，适用额外的使用与分发限制** |
| 版权 | Windmill Labs, Inc. |

**LICENSE 原文的四条关键限制**：

1. **私有或公开 fork 不得包含这些专有商业代码**
2. **限制未经协议进行 modify 或 wrap**
3. 原样分发「as is」允许，但**禁止在未经明确协议的情况下出售、转售、作为托管服务提供、修改或包装**
4. 使用企业功能或企业代码需取得商业/专有许可

**判定：❌ 否决。** ① AGPL-3.0 传染性 ② **明文限制未经协议 modify 或 wrap** ③ 项目定位是「可上线产品」，若把 Windmill 当组件嵌入即落入禁止条款。仅「在自己服务器上部署供内部使用」是允许的（不受影响）——但那不解决「复用其代码减少自研」的诉求。

### 20.4 n8n（**❌ 否决 · 许可陷阱**）

| 项 | 核实结果 |
| --- | --- |
| 许可性质 | **fair-code（源码可见，非OSI 开源）** |
| 许可边界原文 | 自托管自己跑 OK；**「Building a product where your customers log into n8n, or bundling it into something you sell, is not」**；`ee in the directory path` 目录树下的文件**不在**上述条款内且**需要企业许可** |
| 能力 | 可视化 + 代码双模工作流、1000+ 集成、执行历史与 Insights 仪表板、凭据加密存储、自托管（含 air-gapped）、自定义 JavaScript/Python 节点 |

**判定：❌ 否决。** 官方许可条款明确禁止 **bundling into something you sell**，而本项目定位是「可上线产品」，落入禁止条款。仅自用部署是允许的，但那不减少自研。

### 20.5 流程参考型应用层项目（**非可复用组件**）

| 项目 | 形态 | 判定 |
| --- | --- | --- |
| `ai-daily-digest` | 脚本抓取多源原始数据 + AI 筛选 + 生成日报 | **流程参考，非组件**。整个项目是一个特定用途的脚本集合，无可导入的抽象 |
| `news-bot` | 通过 **GitHub Actions 定时运行**，自动抓取 arXiv 等源生成科研热点日报 | 同上 |
| `LLMDailyDigest` | 大模型研究日报 | 同上 |

**这一类项目的价值是「流程参考」**：它们证明「抓源 → AI 筛选 → 定时发布」这条路走得通，但代码本身是脚本集合，**无法作为库引入**。`FR-DIGEST-1` 的九步流程仍需自研。

## 21. 缓存层（对应 `FR-GH-4` 三级回退）

### 21.1 unstorage（**✅ 可选增强**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/unjs/unstorage  |
| 许可证 | **MIT License** |
| Star | **2.7k** |
| 生态 | 属 **UnJS** 组织（广义 Nuxt 官方生态的基础设施；非 `nuxt` 组织下核心仓库） |
| 多驱动 | ✅ 默认内存存储，支持将**多个驱动挂载到统一命名空间**。官方驱动含内存、Redis、文件系统等数十个 |
| **TTL** | ✅ 写入时可通过 `ttl` 设置数据过期时间（底层清理与精度因驱动而异） |
| **SWR** | ✅ 读取时可启用 **stale-while-revalidate**——优先返回已有数据并触发后台刷新（依赖驱动提供或模拟元数据能力） |
| 部署 | 纯库，随应用进程运行 |

典型 API 形态（官方示例，未执行）：

```ts
const storage = createStorage({ driver: "memory" });
await storage.setItem("cache:key", data, { ttl: 60_000 });
const value = await storage.getItem("cache:key", { swr: true });
```

**判定：✅ 可选增强（不改变 FR-GH-4 的 0.5 分）。** 它提供的正是 `FR-GH-4` 需要的**模式抽象**（陈旧数据 + 后台刷新），可省掉手写的「读缓存 → 判断陈旧 → 后台刷新」样板。

**价值边界**：**「哪三级、各级的陈旧阈值」仍是产品决策**——现状 `trending_caches` 的 `fetchedAt`（决定 360 分钟 TTL）与 `lastAttemptAt`（决定 60s最小刷新间隔）**刻意分离**（基线 4.8：若只用 `fetchedAt` 节流，上游持续不可用时每个请求都会重试），这个设计不交给 unstorage。

## 22. 代码检索（对应 `FR-AIQA-5`）

### 22.1 ast-grep（**✅ 可选增强 · 粗筛型**）

| 项 | 核实结果 |
| --- | --- |
| 仓库 | <https://github.com/ast-grep/ast-grep  |
| 许可证 | **MIT License** |
| Star | **16.1k**（468 forks，**4,379 commits**） |
| 实现 | **Rust**，基于 **tree-sitter** |
| **结构化搜索** | ✅ 不是文本 grep，而是按 **AST 节点结构**匹配。模式语法接近日常代码，用 `$MATCH` 类元变量匹配单个 AST 节点；支持 `--pattern` / `--rewrite` / `--lang` |
| **自定义规则** | ✅ 通过 **YAML** 定义新的 linting rules 或代码修改规则；页面提到实现 ESLint 规则的场景 |
| **作为代码索引的定位** | 页面**明确**：它是「构建代码索引的**搜索与分析引擎**」而**不是**开箱即用的代码索引产品 |
| **不提供** | ❌ 持久化代码索引数据库 ❌ 增量索引 ❌ 符号表/调用图 ❌ 跨仓库索引服务 ❌ 语义向量/embedding 检索 |

**判定：✅ 可选增强（不改变 FR-AIQA-5 的 0.5 分）。** 能承接「按语法模式检索」这一层——例如「找出所有调用 `findOneAndUpdate` 的地方」，这类查询比字符串 grep 精确得多。

**价值边界**：**`FR-AIQA-5` 的核心是「路径 3 / 导出符号 2 / 摘要 1」的三档加权求和 + 中文 2 字滑窗分词**，ast-grep 完全不表达加权打分。合理用法是**两段式**：ast-grep（或 Meilisearch）做候选粗筛 → 自研精排打分。

⚠️ **待核实**：ast-grep 对 TypeScript 的 `exports` 与 JSDoc 抽取能力（已知 ts-morph 完全覆盖此项，此项只影响粗筛型的可行性）。

### 22.2 Sourcebot（**场景不匹配**）

自托管的 Sourcegraph 替代方案，捆绑 **Zoekt**（1,441 commits），面向**跨仓库**代码搜索（把 GitHub/GitLab 托管平台的多仓库接进同一搜索界面）。

**判定：不匹配。** 本项目只索引自身 3 处源码（api / web / shared），不跨仓库。引入 Sourcebot 是为一个不存在的需求增加一套服务。

## 23. 中文文本处理（对应 `FR-GHINTRO-2` / `FR-AIQA-5` 的中文 2 字滑窗）

| 候选 | 形态 | 核实结果 | 判定 |
| --- | --- | --- | --- |
| **node-segment** | 纯 JS | 「一行 npm 安装」，无语言依赖（对比表：Jieba 需 Python/Java 环境、Bert 分词需深度学习框架） | ✅ 可替代自研分词 |
| **nodejieba** | C++ 扩展 | 「结巴」分词的 Node 版本，由 cppjieba 提供底层算法；**官方说明 npm 慢且墙的原因，建议用 cnpm** | 同上，但需原生编译且安装不便 |
| **chinese_text_normalization** | Python 系 | 中文文本规范化（非标准表述转标准），TTS/ASR 领域常用 | ❌ 非 Node 生态 |
| **punctuation-normalizer** | Rust | 检测并**跳过** Markdown 围栏代码块、行内代码片段、LaTeX 数学区（`$...$`、`$$...$$`） | ❌ 非 Node；且语义是「跳过保护」不是「标点处收尾」 |

**判定（`FR-GHINTRO-2`，0 分维持）**：**不存在 Node 原生的「去代码围栏 → 去前导非中英文数字 → 压空白 → 在 `。！？；` 处收尾且标点位置 < limit/2 时退回硬截」库。**

拆解来看四个动作的现成方案覆盖情况：

| 动作 | 是否有现成方案 |
| --- | --- |
| 去代码围栏 | ✅ `punctuation-normalizer` 思路可用，或简单正则 |
| 去前导非中英文数字 | ✅ 一行正则 |
| 压空白 | ✅ `String.replace(/\s+/g, ' ')` |
| **在 `。！？；` 处收尾且标点过早时退回硬截** | ❌ **无。这是本项目的输出质量基线** |

**「标点处收尾」本质上是提示词约束的不可靠替代品**——模型不保证遵守，必须是确定性代码。

**判定（`FR-AIQA-5` 的分词部分，0.5 维持）**：node-segment 可替代自研中文分词，但**三档加权求和仍无解**。

## 24. RAG 引用一致性（对应 `FR-ASK-1` / `FR-ASK-2`）

| 候选 | 性质 | 核实结果 | 判定 |
| --- | --- | --- | --- |
| **open-rag-eval** | **评估框架** | 实现 **Faithfulness**（答案是否基于给定上下文）、**Answer Relevance**（是否直接回答问题）、**Context Relevance**（检索到的上下文是否与问题相关）；基于规则的评估器（Rouge-L、BLEU、检索命中率 Hit Rate） | ❌ **事后评估** |
| **VerifAI** | **研究性方案**（IEEE） | 把生成答案分解为 **atomic claims**，再做事后 **claim verification**，确保事实一致性 | ❌ **事后验证** |

**判定：0.5 分维持。** 两者都是**事后评估**，**没有运行时的一致性保证机制**。

而 `FR-ASK-1` / `FR-ASK-2` 的核心正是**运行时行为**：
- 「检索为空即短路 `no-sources`，**一字不问模型**」——这是调用前的分支，必须在代码里
- 「`used` 过滤保证 prompt 里的 `[n]` 编号与返回的 `sources` 数组**同序**」——这是构造 prompt 与解析响应的实时一致性

**这两条不可能由评估工具保证。** 通用 RAG 框架的默认行为恰恰相反（会 fallback 到无检索回答），与基线 6.7「宁可说没有资料，也不能让模型自由发挥」相悖。

## 25. LangGraph 错误处理（对应 `FR-AGENT-5`，0.5 维持）

LangGraph 有**成体系**的错误处理与重试机制：

| 能力 | 细节 |
| --- | --- |
| **`RetryPolicy`** | 可配 `max_attempts`、`initial_interval`、`backoff`、`retry_on`（**函数动态判定**） |
| **默认重试判定**（`libs/langgraph/langgraph/_internal/_retry.py`） | `ConnectionError`（连接断开、握手失败）→ **重试**（典型瞬时网络问题）<br HTTP **5xx** → **重试**（是对方服务器的问题，不是你的请求有问题）<br HTTP **4xx** → **不重试**（参数错误、鉴权失败是调用方的问题） |
| **工具错误回喂** | `handle_tool_errors` 可配置工具错误如何处理，包括作为消息回喂模型 |

**判定：0.5 分维持，但实现路径更明确。**

- 「**异常分类 + 重试策略**」有现成方案——但**仅对比实现（LangGraph.js）能用**。主实现是 Vercel AI SDK 的 `ToolLoopAgent`，其步数上限与工具调度模型不同，需自研等价的分类逻辑。
- 「**回灌内容不含堆栈、凭据与内部文件路径**」是**项目安全基线**（对应不可违反项 7「对外错误不泄漏内部细节」与 8「日志不写敏感数据」），**脱敏必须自研**，任何框架都不提供。

## 26. 核实缺口汇总（第三轮更新）

| # | 待核实项 | 涉及候选 | 状态 |
| --- | --- | --- | --- |
| 1 | 精确稳定版本号 | Payload、NocoBase、LangGraph.js、Basecoat、tRPC、Zod、lru-cache | 🔶 **部分解决**：本轮实测 `@nuxt/content` = **3.16.1**；其余 14 项仍需 `npm view` 实测 |
| **2** | **Nuxt 4 兼容性** | Nuxt Content 3 | ✅ **已解决**（见 §19）。**P20 阻塞项解除** |
| 3 | Atlas Vector Search 在免费集群的当前可用性 | MongoDB Atlas | ➖ 第二轮已不需要（换 Postgres + pgvector） |
| 4 | Local API 是否绕过访问控制 / 事务一致性 | Payload | ⏳ 仍待核实 → PoC |
| 5 | NIM的 OpenAI 兼容端点是否被 `@ai-sdk/*` 覆盖 | Vercel AI SDK | ⏳ 仍待核实 → PoC P7 |
| 6 | Langfuse `ee/` 目录许可与所需功能归属 | Langfuse | ⏳ 仍待核实 → PoC P18 |
| 7 | Directus MSCL 具体条款 | Directus | ➖ 已否决，仅留档 |
| 8 | Better Auth 的 Nuxt 适配 / refresh 轮换 | Better Auth | ✅ 已不影响主方案（D1=A 连带移出） |
| 9 | LangGraph.js recursion limit 能否精确映射到「8 轮」 | LangGraph.js | ⏳ 仍待核实 → PoC P9 |
| 10 | Basecoat 许可证 | Basecoat | ➖ 已否决，仅备查 |
| 11 | **OpenTelemetry 的 collector 与后端选型**（Jaeger / Tempo / ClickHouse） | OpenTelemetry | ⏳ **仍未解决，自托管方案的主要工作量** |
| 12 | rate-limiter-flexible 是否接受小数秒 | rate-limiter-flexible | ⏳ 仍未解决（README 只说 `duration` 单位是秒） |
| 13 | **BullMQ 的 PostgreSQL 后端稳定性与 Cron API** | BullMQ | ⏳ 仍未解决（仓库简介写「Redis or PostgreSQL」但功能表后端列为 Redis）→ PoC P28 |
| 14 | Hono 的服务端适配器能力 | Hono | ⏳ 第三轮仍未抓取 |
| 15 | Nuxt Nitro 能否承接现有后端职责 | Nuxt | ⏳ 第三轮仍未抓取 |
| 16 | 现状 35 个索引的完整 DDL 清单 | pgvector / Drizzle Kit | ⏳ 仍未解决 |
| **17** | **Trigger.dev 自托管是否需 PostgreSQL / Redis / 对象存储** | Trigger.dev | 🆕 **未核实**（README 未列自托管依赖）。**不得断言它需要或不需要** → 若选它必须先查清 |
| **18** | **ast-grep 对 TypeScript 的 `exports` 与 JSDoc 抽取能力** | ast-grep | 🆕 未核实。已知 ts-morph 完全覆盖，此项只影响粗筛型可行性 |
| **19** | **Trigger.dev 可配置的每任务超时 / 重试次数 / 退避规则** | Trigger.dev | 🆕 未核实（README 只说「无超时」与「未捕获异常触发重试」，未给参数） |

  **第三轮解决 1 项（#2 P20 阻塞项）· 部分解决 1 项（#1）· 新增 3 项（#17 / #18 / #19）· 新否决 2 项（Windmill / n8n）**
 
  **#11 与 #16 仍是工作量最大的两项**。#17 必须在 D12 裁定为「选 Trigger.dev」后才需要查清。

---

# 第四轮 · 囊括关系核实笔记

  **核实时间**：2026-10-07（四轮同批）
 
  **动机**：用户提出「Nuxt 一个包囊括了 Vue + Vite + UI 组件库，栈项是否也有同样问题」。据此逐项审视 15 项清单的**囊括关系**，发现**四种类型**——其中「传递依赖」是前四轮都没发现的。

## 27. Payload 3 Jobs Queue（**✅ 采纳，替代 BullMQ**）

来源：`https://payloadcms.com/docs/jobs-queue/overview` + `https://payloadcms.com/docs/jobs-queue/tasks`

### 27.1 概念模型

| 概念 | 说明 |
| --- | --- |
| `Task` | 单个业务函数。配置项：`slug` / `handler` / `inputSchema` / `outputSchema` / `interfaceName` / `label` / `onSuccess` / `onFail` / `retries` / `concurrency` / `schedule` |
| `Workflow` | **多个 Task 的顺序组合** |
| `Job` | 一次执行实例 |
| `Queue` | Job 的分组（`schedule.queue` 与 `autoRun.queue` 必须一致） |

### 27.2 与 BullMQ 的逐项对比

| 能力 | BullMQ | Payload Jobs | 判定 |
| --- | --- | --- | --- |
| 额外服务 | PG 后端时无需 Redis | **无需 Redis**（队列在 `payload-jobs` collection，保存排队中Job、执行状态、重试信息、错误信息、可能的输入输出与日志） | ✅ 打平 |
| 周期调度 | Repeatable jobs / Cron | `schedule: [{ cron: '0 8 * * *', queue: 'daily' }]`。⚠️ **仅配置不会自动排队**，必须额外配 `autoRun`（如 `{ cron: '* * * * *', queue: 'daily', limit: 10 }`）/ `jobs:handle-schedules` 命令 / 外部 cron 调 API，否则 Job 只入队不执行 | ✅ |
| 顺序编排 | 需自研 | **`Workflow`** ✅ | ✅ **Payload 更强** |
| **从失败节点重试** | 需自研 | **`retries.shouldRestore`（默认 `true`）**——Workflow 重跑时，之前成功的任务直接返回上次 `output` 不重跑，失败的重新执行。也可传函数 `({ input }) =  boolean`（输入未变则恢复旧结果，变了则重跑） | ✅ **Payload 更强** |
| 重试次数 | `attempts` + `backoff` | **`retries`**（`retries: 2` = 首次 + 2 次重试 = 最多 3 次）。`0` = 明确禁用；未定义则继承 Workflow 的 retries | ✅ |
| **主动中止** | 需自研 | **`throw new JobCancelledError('...')`** 阻止整个 Job 继续重试。适合「参数已失效 / 资源已删除 / 当前状态明确不允许继续」 | ✅ **Payload 独有** |
| 并发互斥 | `concurrency` | **`concurrency`**（需 `jobs: { enableConcurrencyControl: true }`） | ✅ 打平 |
| **执行超时** | worker 侧可配 | ❌ **文档未定义任务级 `timeout`**，也未说明超时是否触发重试、超时错误如何区分于普通错误 | ⚠️ **缺口** |
| 一次性延迟 | job延迟 | ❌ **`waitUntil` 未在 Tasks 页出现**（可能属 Workflow 层能力） | ⚠️ **未确认** |
| cron 时区 | 可配 | ❌ **文档未说明**（页面只展示了标准 cron 与带秒字段的扩展 cron `*/3 * * * * *`） | ⚠️ **风险** |
| 幂等性 | 至少一次 | 至少一次 + **官方明确建议幂等**：用 Job ID 或业务 ID 作幂等键、DB 唯一约束 / upsert / 条件更新、第三方 API 用官方 idempotency key、关键 DB 修改放事务、「让已处理的请求返回已有结果而不是再次执行副作用」 | ✅ 与项目纪律吻合 |
| 安全默认值 | — | `payload-jobs` collection 在 Admin Panel 隐藏、默认拒绝通用访问；可信服务器代码可通过 Local API 检查。⚠️ 官方提醒 Job 数据可能含敏感输入输出，不建议开放原始 collection 权限 | ✅ |
| 日志 | — | `payload-jobs` 记录含 `hasError` / `error` / `log`（`state === 'failed'` 的任务记录）。经多次重试后日志中可能出现多个失败节点记录 | ✅ |

### 27.3 三个缺口对本项目的处置

| 缺口 | 影响的 FR | 处置 |
| --- | --- | --- |
| 无任务级 `timeout` | `FR-GHINTRO-1`（时间预算 20000ms）、`FR-AIQA`（超时 25000ms）、`FR-AGENT-6`（单次工具调用 10000ms） | ✅ **不构成阻塞**。现状的超时本来就是在 handler 内用 `AbortSignal.timeout` 做的（`nv-nim.client.ts` 的 `chat` / `embed` 均如此），**不是队列层职责** |
| `waitUntil` 未确认 | `FR-GH-2`（60s 最小刷新间隔） | ✅ **不构成阻塞**。现状用 `findOneAndUpdate` 原子抢占，换 PG 后可用 `INSERT ... ON CONFLICT DO UPDATE` 实现，与队列无关 |
| **cron 时区未说明** | `FR-DIGEST-5`（时区可配且非法时区名退回 UTC） | ⚠️ **需 PoC 验证 → 新增 P32**。这是本次替代的唯一未确认项 |

### 27.4 结论

**✅ 采纳，替代 BullMQ。** 且在「顺序编排 / 从失败节点重试 / 主动中止」三点上强于 BullMQ，代价是无任务级 `timeout`（不影响）与 cron 时区未确认（一个 PoC）。

**D12 的推荐选项由「维持 BullMQ」改为「Payload Jobs Queue」**——因为 Payload 已在栈内，Jobs 是其内置能力，**零新增依赖**。

## 28. Payload 的 PostgreSQL adapter 与 Drizzle 的关系（**✅ 重大发现：传递依赖囊括**）

来源：`https://payloadcms.com/docs/database/postgres`

| 项 | 核实结果 |
| --- | --- |
| adapter 包 | `@payloadcms/db-postgres`（标准）+ `@payloadcms/db-vercel-postgres`（Vercel 优化，未传配置时自动用 `process.env.POSTGRES_URL`，本地地址自动改用 `pg` pooling） |
| **底层 ORM** | ✅ **Drizzle ORM** + `node-postgres` |
| **公开底层实例** | ✅ **`payload.db.drizzle`** —— 官方示例：`payload.db.drizzle.query.posts.findMany()`、`payload.db.drizzle.select().from(posts).where(eq(posts.id, 50))` |
| **重导出 Drizzle API** | ✅ `import { eq, sql, and } from '@payloadcms/db-postgres/drizzle'` |
| 其他公开对象 | `payload.db.tables`（表）、`payload.db.enums`（枚举）、`payload.db.relations`（关系） |
| 原生 SQL | 可通过 `sql` 模板 + `payload.db.drizzle.execute(sql\`...\`)` 执行。⚠️ **`${}` 走参数绑定，不要拼接用户输入**；表名与排序字段等 SQL 标识符**不能**作为普通值参数化 |
| 类型安全 schema | `npx payload generate:db-schema` 生成带类型安全的 schema |
| SQLite adapter | `@payloadcms/db-sqlite` 同样基于 Drizzle + libSQL |

  ⚠️ **一个需注意的细节**：官方页面明确保证的访问路径是 `payload.db.drizzle`（**未带 `req.`**）。页面**未示例化** `req.payload.db.drizzle`——若 `req.payload` 指向完整 Payload 实例则理论上同样可用，但**需针对项目版本确认类型定义**（核实缺口 #21）。

**结论：✅ Drizzle 从「独立技术栈项」降级为「Payload 的传递依赖」。** 引入 Payload 就等于引入 Drizzle，`payload.db.drizzle` 可执行任意 Drizzle 查询与原生 SQL。第一轮把 Drizzle 列为独立项是**重复记账**。→ **栈项 15 → 14**

**⚠️ 但 `drizzle-kit`（DDL 迁移工具）仍需独立引入**——它解决 PG 无 `autoIndex` 的 35 个索引 DDL 缺口，Payload 自身的 `push` / `migrate` 走的是自己的机制。**不单独计入栈项**，作为 Payload 迁移流程的一个工具。

## 29. Nuxt Content `useSearchCollection`（**❌ 无法替代 Meilisearch**）

来源：`https://content.nuxt.com/docs/utils/use-search-collection`（官方页此前抓取 500，经中文文档镜像 `nuxt-content.zhcndoc.com` 取得同源内容）

### 29.1 能力核实

| 能力 | 结果 |
| --- | --- |
| 底层 | **SQLite FTS5**，内置，**零外部搜索库依赖** |
| 前缀匹配 | ✅ 输入 `compo` 可匹配 `composable` |
| BM25 排名 | ✅ 结果含 `rank`。`weights` 可调 `title`（默认 **20**）/ `content`（默认 **5**）/ `heading`（默认 **0.5**，0.5 为平方根曲线、1 为线性、0 为禁用）。⚠️ 文档未解释 `rank` 是越大越好还是越小越好，业务代码应直接用返回顺序 |
| 摘要片段 | ✅ `snippet: { columns: ['title','content'], around: 40, tag: 'mark' }`。`around` 按 **token** 数计（默认 30），**不是字符数** |
| 多集合 | ✅ 原生支持，传入数组即可；结果的 `collection` 字段可区分来源 |
| 章节拆分 | ✅ `minHeading`（默认 `h1`）/ `maxHeading`（默认 `h6`）/ `ignoredTags`（如 `['code']`） |
| 字段限定 | ⚠️ **`fields` 只支持 `title` 与 `content`**，且只是限制参与匹配的列，不会返回两个独立的结果分组 |
| `minTermLength` | ⚠️ 默认 `1`。**它不是中文分词配置**，只控制已被 tokenizer 识别出的短词项长度 |
| 延迟初始化 | ✅ `immediate: false` + `init()` |
| 索引重建 | ✅ 集合值变化时旧 FTS 索引会删除并针对新集合重建 |
| ⚠️ **中文分词** | ❌ **文档没有承诺**。公开 API 中**没有 `tokenizer` / `language` / 词典配置项**；未承诺中文分词、中文同义词、拼音搜索、模糊纠错、自定义 tokenizer、CJK n-gram tokenizer。官方明确：**「不能把 `minTermLength: 1` 当作中文分词方案」** |
| ⚠️ **运行环境** | ❌ **仅支持客户端**（索引通过浏览器中的 SQLite WASM 构建），**不应作为服务端搜索 API 使用** |
| 与 `queryCollection` 的关系 | 无直接组合 API（不是 `queryCollection(...).where(...)` 式构造器）。结果含 `collection` + `id`，可据此再用 `queryCollection` 取完整内容，**但文档未把此作为官方模式说明** |
| 替代方案 | `queryCollectionSearchSections` + Fuse.js / MiniSearch（适合模糊匹配与拼写容错；但需外部依赖、内存 O(n) 扫描、摘要片段需手实现、查询速度 O(log n) vs O(n)） |

### 29.2 结论

**❌ 无法替代 Meilisearch。** 两个独立的否决理由：

1. **中文分词未承诺且无配置入口**。本项目 `FR-DOC-3` 要求「文档纳入站内搜索」，而 `apps/docs` 31 篇**全是中文**。FTS5 默认 `unicode61` tokenizer 按空格/标点切分，对连续中文近乎失效。
2. **仅支持客户端**。若站内搜索是服务端 API（现状 `FR-SEARCH` / `FR-ASK` 的向量检索是服务端的），FTS5 的浏览器 WASM 索引架构不适用。

**⚠️ 官方文档指出需重点验证的四点**（若未来仍想评估）：① 输入中文词能否命中正文 ② 输入部分词能否前缀命中 ③ `snippet.around` 的 token 长度是否符合预期 ④ 是否存在底层自定义 tokenizer。

**附带发现**：社区有 `wangfenjin/simple`（支持中文和拼音的 SQLite FTS5 tokenizer 扩展，C++），但**这需要 Nuxt Content 开放 tokenizer 配置入口才能用**，而它没有。**若未来 Nuxt Content 开放该配置，Meilisearch 可省**（`FR-DOC-3` 得分保持 1，栈项 11 → 10）。

## 30. 第四轮核实缺口更新

| # | 项 | 状态 |
| --- | --- | --- |
| 1 | 精确稳定版本号 | 🔶 已实测 `@nuxt/content` = **3.16.1**、其 `@nuxt/kit` = **4.5.2**；其余 14 项仍需 `npm view` |
| **20** | **Payload Jobs 的 cron 时区** | 🆕 **未核实**（Tasks 页只展示标准 cron 与带秒字段的扩展 cron，未提时区）→ **PoC P32** |
| **21** | **`req.payload.db.drizzle` 是否与 `payload.db.drizzle` 等价** | 🆕 **未核实**。官方页面只保证后者（未带 `req.`）。若需在 custom endpoint 内使用，需确认类型定义 |
| 11 | OpenTelemetry 的 collector 与后端选型 | ⏳ 仍未解决（**自托管方案的主要工作量**） |
| 12 | rate-limiter-flexible 是否接受小数秒 | ⏳ 仍未解决（README 只说 `duration` 单位是秒） |
| **16** | 35 个索引的完整 DDL 清单 | ✅ **已关闭（第五轮）**：`gap-closing.md` §2.12 全量对照表已产出（21 显式 + 14 个 `_id` = 35） |
| 13 | BullMQ 的 PostgreSQL 后端稳定性 | ➖ **优先级下降**（第四轮已用 Payload Jobs 替代 BullMQ） |
| 17– 19 | Trigger.dev 自托管依赖 / ast-grep 抽取能力 / Trigger.dev 超时重试参数 | ⏳ 仍未解决，**但 Trigger.dev 已在第四轮降级，这三项优先级下降** |

  **第四轮净结果**：解决 0 项 · 新增 2 项（#20 / #21）· **发现 1 项重大结构发现（Drizzle 是 Payload 的传递依赖）** · 确认 1 项可替代（Payload Jobs → BullMQ）· 确认 1 项不可替代（Nuxt Content FTS5 → Meilisearch）。
 
  **栈项：15 → 11**（−2 重复计数，−1 传递依赖，−1 功能替代）。**得分分布不变**（108 + 12 + 4 = 124，覆盖率 91.9% / 73.7%）——本轮是**记账修正**，不是能力变化。

---

# 第五轮 · 风险与 PoC 解决方案的落地核实

  **核实时间**：2026-10-07
 
  **动机**：用户裁定 **D-R1 = 免费**（PG 部署区域）与 **D-R2 = A**（可观测性采纳 Langfuse 一体、不引 Collector），要求对三个真风险、8 项阻塞 PoC、8 项核实缺口提出解决方案。
 
  **本轮的三处「计划与实际不符」**：① Supabase **已用 Supavisor 替代 PgBouncer**（原方案写的「内建 PgBouncer」过时）② 端口 **5432 有二义性**（直连 vs Session pooling 是不同主机名）③ **Neon 的「5 分钟挂起」检索未命中，本轮无法核实**——已从判定依据中剔除。

## 31. Supabase Free 作为免费同区 PG 的实测（2026-10-07）

### 31.1 Free 计划额度

来源：`https://supabase.com/pricing`（实测抓取）

| 项 | 额度 |
| --- | --- |
| 数据库容量 | **500 MB/项目** |
| 月出网流量 | **5 GB/月** |
| 缓存出网流量 | 5 GB/月 |
| API 请求 | **不限** |
| **暂停策略** | **连续 1 周无活动后自动暂停** |
| 活跃项目数 | 最多 **2 个** |
| 其他 | 50,000 月活跃用户 · 1 GB 文件存储 · 共享 CPU / 500 MB 内存 |

**对本项目的适用性核对**：

| 维度 | 估算 | 判定 |
| --- | --- | --- |
| 数据量 | 14 个集合（社区帖子 + 评论 + 点赞 + 面试题 + 路线进度 + 向量表）+ 31 篇文档 + 45 个路线节点静态数据。向量表是最大项：千级 × 1024 维 float32 ≈ 4 MB | ✅ 远低于 500 MB |
| 出网流量 | **主要出网是 AI 调用**（NIM），走 Vercel 函数而非 DB；DB 出网只有 Payload 读数据 | ✅ 5 GB 够用 |
| 暂停策略 | `vercel.json` 的 cron `0 1 * * *`（每日）+ 用户日常访问 | ✅ 每天有活动，不触发 7 天暂停 |

### 31.2 ⚠️ 发现一：Supabase 已用 Supavisor 替代 PgBouncer

来源：`https://supabase.com/docs/guides/database/connection-management`（实测抓取）

官方原文：

  "Every Compute Add-On has a pre-configured direct connection count and **Supavisor pool size**."
  "You can change how many database connections **Supavisor** can manage by altering the pool size in the 'Connection pooling' section of the Database Settings."

**影响**：第四轮方案里写的「Supabase 内建 PgBouncer」**已过时**。Supabase 现在用自己的连接池器 **Supavisor**（Supabase 自研，非 PgBouncer 派生）。

**对方案的影响**：**无实质影响**——R-A 需要的是「有连接池」这个能力，具体是 PgBouncer 还是 Supavisor 都满足。但**文档表述必须改**，否则实施时会去找 PgBouncer 配置项而找不到。

官方给出的池大小经验值：

  "if you are heavily using the PostgREST database API, you should be conscientious about raising your pool size past **40%** of the Database Max Connections. Otherwise, you can commit **80%**."

（本项目不用 PostgREST，只用 node-postgres 直连或池化器，故按 80% 算即可。）

### 31.3 连接端口与池化模式

来源：`https://supabase.com/docs/guides/database/connecting-to-postgres`（实测抓取）

| 连接方式 | 主机名 | 端口 | 池化模式 | IP 支持 |
| --- | --- | --- | --- | --- |
| 直连（Direct） | `db.[PROJECT-REF].supabase.co` | `5432` | 不经过池化器 | 默认 IPv6；启用 IPv4 add-on 后为 IPv4 |
| **共享 Session pooler** | `aws-[INDEX]-[REGION].pooler.supabase.com` | `5432` | **Session pooling** | 所有套餐均仅 IPv4 |
| **共享 Transaction pooler** | `aws-[INDEX]-[REGION].pooler.supabase.com` | `6543` | **Transaction pooling** | 所有套餐均仅 IPv4 |
| 专用 Transaction pooler（**付费套餐**） | `db.[PROJECT-REF].supabase.co` | `6543` | 仅 Transaction pooling | 默认 IPv6 |

**用户名也因连接方式而异**：直连与专用池化器用 `postgres`；共享池化器用 `postgres.[PROJECT-REF]`。

  ⚠️ **发现二：端口 5432 有二义性**。
  `db.[PROJECT-REF].supabase.co:5432` = **直连，不经过池化**；
  `aws-[IDX]-[REGION].pooler.supabase.com:5432` = **Session pooling**。
  **混淆这两者会导致连接池完全失效**（以为在用池化器，实际每个请求直连并耗尽连接数）。

  ⚠️ **`[INDEX]` 不是区域编号的一部分**，是池化器集群索引，**不能从区域名推导**，须从 Dashboard 的 **Connect** 对话框复制完整主机名。

### 31.4 ⚠️ 发现三：prepared statement 支持情况（官方矩阵）

官方给出的支持矩阵：

| 连接方式 | prepared statement |
| --- | --- |
| 直连 | ✅ 支持 |
| **共享 Session pooler** | ✅ 支持 |
| **共享 Transaction pooler** | ❌ **不支持** |
| 专用 Transaction pooler | ❌ **不支持** |

**官方给出的原因**：

  "transaction pooling 会在每个事务结束后把连接归还池中，下一事务可能落到另一条数据库连接，因此依赖会话或特定后端连接的协议级 prepared statements 无法安全保留。"

**官方给出的各驱动处置**：

| 驱动 | 配置 |
| --- | --- |
| **Postgres.js / Drizzle** | **`prepare: false`** |
| Prisma | 连接串加 `pgbouncer=true` |
| **asyncpg** | **`statement_cache_size=0`** |
| JDBC | `prepareThreshold=0` |

  ⚠️ **官方矩阵未列 node-postgres**。而 Payload 3 的 `@payloadcms/db-postgres` 用的正是 **node-postgres（pg）**（第四轮已核实，来源 `payloadcms.com/docs/database/postgres`：「It leverages Drizzle ORM and node-postgres」）。
 
  本方案采用 `pg.Pool` 的 `options: '-c statement_cache_size=0'`——这是**把 PostgreSQL 的 GUC 通过连接参数传给服务端**，与 asyncpg 的**客户端参数**同名但机制不同。**此处置属机制推断，必须实测（P35）。**
 
  失败时的替代方案：**改用直连** `db.[PROJECT-REF].supabase.co:5432`。本项目现状 `maxPoolSize: 5`，直连连接数完全够用。

### 31.5 ⚠️ 发现四：Transaction pooling 的其他限制（此前完全遗漏）

官方明确列出 transaction mode **不只**影响 prepared statement：

| 限制 | 影响本项目的可能性 |
| --- | --- |
| **不支持 query pipelining** | 低——Payload 用 node-postgres，**默认不做 pipelining**（Postgres.js 才会） |
| 会话级状态不跨事务：`SET` / `RESET` | 中——若 Payload Jobs 用 `SET` 配置 session 参数会失效 |
| **session-level advisory lock** | ⚠️ **高**——若用于幂等控制或任务互斥则失效 |
| **`LISTEN` / `NOTIFY`** | ⚠️ **高**——若 Payload Jobs worker 用它做新任务通知则失效 |
| 临时表 | 低 |
| Cursor 只能在单个事务内；`WITH HOLD` cursor 归还连接后不可用 | 低 |

  ⚠️ **检索结论（P33）**：搜索「Payload CMS jobs queue worker pg_notify LISTEN advisory locks」**未找到 Payload Jobs 依赖 `LISTEN`/`NOTIFY` 的证据**，返回的全是 PostgreSQL 通用文档（腾讯云/CSDN 等第三方文章）。**但同样没找到它不依赖的证据。**
 
  **诚实结论：此项无法通过检索判定，必须在 PoC ③ 实测**——建最小 Payload 实例 + Jobs runner，观察是否在 `pg_stat_activity` 中出现 `LISTEN` 通道或 `pg_locks` 中的 advisory lock。**若依赖，transaction pooling 不可用，必须改用 Session pooling（`[POOLER-HOST]:5432`）或直连。**

### 31.6 区域选择（部分核实）

来源：`https://supabase.com/docs/guides/platform/regions`（实测抓取）

**17 个具体 AWS 区域中确认包含 `us-east-1`（East US · North Virginia）**——与 Vercel 默认 `iad`（美东弗吉尼亚）**同区**。

完整列表：`us-west-1`（北加州）· `us-west-2`（俄勒冈）· **`us-east-1`（弗吉尼亚北部）** · `us-east-2`（俄亥俄）· `ca-central-1` · `eu-west-1`（爱尔兰）· `eu-west-2`（伦敦）· `eu-west-3`（巴黎）· `eu-central-1`（法兰克福）· `eu-central-2`（苏黎世）· `eu-north-1`（斯德哥尔摩）· `ap-south-1`（孟买）· `ap-southeast-1`（新加坡）· `ap-northeast-1`（东京）· `ap-northeast-2`（首尔）· `ap-southeast-2`（悉尼）· `sa-east-1`（圣保罗）

另有 3 个「通用区域」（Americas / Europe / APAC），**动态分配到某具体 AWS 区域，不保证固定代码或城市**。

  ⚠️ **发现五：官方页面未说明 Free 计划能否选择全部区域**。页面只说明这些是「平台可用区域」，没有 Free / Pro 的区域权限对照。
 
  **本轮检索未找到明确答案 → 列为 P34。** 最可靠的确认方式是在 Supabase 控制台创建项目时查看 Free 组织实际显示的区域选项。
 
  **这一项直接决定 R-A 能否根治**：若 Free 不能选 `us-east-1`，则回退到「跨区 + 全部四层缓解」，R-A 从「根治」降为「缓解」。

### 31.7 Neon Free —— ⚠️ 检索未命中，本轮无法核实

**我此前断言「Neon 5 分钟 idle 自动挂起」，本轮检索未命中任何有效结果**（返回的全是 Gentoo bug 追踪、AI 销售模板等噪音）。

按写作纪律「无法核实的显式标注待核实，不得凭记忆断言」，**该断言已从判定依据中剔除**。

Neon 被否的**保留理由**（不依赖未核实项）：**存储额度约 0.5 GB**，约为 Supabase 的 1/10。本项目含 31 篇文档（`apps/docs`）+ `postembeddings` 向量表 + 14 个集合，0.5 GB 虽然大概率够用，但**余量远小于 Supabase**，且冷启动风险未排除。

| 待核实 | 状态 |
| --- | --- |
| Neon Free 存储额度确切值 | ⚠️ 未核实（本轮检索未命中） |
| Neon Free 空闲挂起策略 | ⚠️ 未核实 |
| Neon Free 可选区域 | ⚠️ 未核实 |

## 32. 索引盘点的四类偏差（`code-explorer` 实测）

  第五轮用 `code-explorer` 全量静态分析 14 个 `*.schema.ts`，**结论均带文件路径 + 行号**。对照表已落地 `gap-closing.md` §2.12。

| # | 文档原表述 | 实测 | 影响 |
| --- | --- | --- | --- |
| 1 | 「14 个索引」 | **21 个显式 + 14 个集合的 `_id_` 主键 = 35 个** | 20 处表述已批量修正 |
| 2 | 「3个唯一索引」/「4 个唯一索引」 | **14 个 unique**（含 2 个复合唯一：`likes.postId+userId`、`interview_questions.nodeId+question`） | P1 验证范围扩大 |
| 3 | 「5 处显式 `.index()` + 9 个集合 `@Prop`」 | **6 处显式 `.index()` + 15 个 `@Prop` 内联声明** | 同上 |
| 4 | R-B 方案「加真实外键 `REFERENCES posts(id)`」 | ❌ **不可行**：`daily_picks.postId` 是 `@Prop({ type: String })` **弱引用**，PG 的 `posts.id` 是 UUID，**类型与值域都不匹配** | R-B 方案改为「1a 建映射表 → 1b 改列类型为 `uuid` → 1c 再加外键」三步 |

### 32.1 四条不能照搬 Mongo 语义的点

| # | Mongo 做法 | 为什么 PG 不能照搬 | PG 正确做法 |
| --- | --- | --- | --- |
| 1 | `posts {tags:1, createdAt:-1}` | **PG 的 B-tree 复合索引对数组等值无效**——`tags:1` 只对包含全部元素的行命中 | `GIN (tags)` + `BTREE (created_at DESC)`，查询侧 `tags && ARRAY[...]` |
| 2 | `daily_pick_excludes.date` **非唯一** | `daily-pick-exclude.schema.ts:14-21` 注释：刻意不加唯一索引（同名不同选项会抛 `IndexOptionsConflict`） | **保持非唯一**，不要「顺手修正」 |
| 3 | `ai_answer_cache` **无 TTL** | `ai-usage.schema.ts:49-55` 注释：**刻意不用 TTL**（清理有 60s 延迟、时间写死不好调），改为查询时手动判过期 | **不得加 `pg_cron` 或 TTL 模拟**，否则语义变更 |
| 4 | `_id` 为 `ObjectId`、`author.id` 为 `String` | PG 无对应内置类型 | 主键改 `uuid` + 建映射表；`author.id` 保持 `text`（快照语义非引用语义） |

### 32.2 关联关系的实测分野

全仓 `ref:` 仅 **5 处**；`refPath` / `.virtual(` / `populate(` 均 **0 命中**——不存在动态 ref 或虚拟 populate 隐藏的关联关系。

| 类别 | 字段 | 能否加 FK |
| --- | --- | --- |
| **强引用**（`ObjectId` + `ref`） | `comments.postId`(`comment.schema.ts:44`) · `likes.postId`(`like.schema.ts:34`) · `likes.userId`(`like.schema.ts:37`) · `roadmap_progress.userId`(`roadmap-progress.schema.ts:36`) · `interview_questions.createdBy`(`interview-question.schema.ts:57`) | ✅ |
| **弱引用**（`String`） | `daily_picks.postId`(`daily-pick.schema.ts:58-59`) · `daily_pick_excludes.postId`(`daily-pick-exclude.schema.ts:59-60`) | ❌ 需先做类型迁移 |
| **有索引但无 `ref`** | `postembeddings.postId`(`post-embedding.schema.ts:19`) | ⚠️ 需决策 |

### 32.3 两条附带发现

| # | 发现 | 说明 |
| --- | --- | --- |
| 1 | **`autoIndex` 从未显式配置** | `app.module.ts:56-151` 的连接参数块中没有该项，**完全依赖 Mongoose 默认 `autoIndex: true`**。这正是「换 PG 后 35 个索引全部要手写 DDL」的根据 |
| 2 | **文档腐化实例**：`posts.service.ts:326` 注释写「阶段 6 会在这里级联删除它的评论」，但**实际 `remove()` 内无 `commentsService.deleteByPost` 调用**（级联只在 `daily-digest.service.ts:344`） | 注释已过期。**这类腐化正是「注释即规格」的反例**——它误导了本轮对 R-B 的第一版判断 |

### 32.4 `health` 模块的例外

`health` 模块**无 Schema**，且**不存在 `health.module.ts`**（已确认）；`auth` 模块只有 DTO 无 Schema。**12 个模块里只有 11 个贡献了集合**，13 个 schema 文件覆盖 14 个集合（`ai-usage.schema.ts` 承载 2 个集合）。

## 33. 第五轮新增的核实缺口与 PoC

| 编号 | 内容 | 状态 |
| --- | --- | --- |
| **P33** | Payload Jobs worker 是否依赖 `LISTEN`/`NOTIFY` 或 session-level advisory lock | 🆕 **检索无法判定**，必须 PoC 实测。**决定 transaction pooling 能否使用** |
| **P34** | Supabase Free 能否选 `us-east-1` 区域 | 🆕 **决定 R-A 能否根治**（而非缓解） |
| **P35** | `pg.Pool` 的 `options: '-c statement_cache_size=0'` 是否真能关闭 node-postgres 的 prepared statement | 🆕 官方矩阵未列 node-postgres，此处置属机制推断 |

### 33.1 缺口表状态更新（#16 已关闭）

| # | 项| 第五轮状态 |
| --- | --- | --- |
| **6** | Langfuse `ee/` 目录许可 | ✅ **可关闭**——第三/四轮已实测 MIT（`ee/` 除外），追踪 + 评测 + 基准均在 MIT 范围 |
| **13** | BullMQ PostgreSQL 后端稳定性 | ✅ **可关闭**——第四轮已改用 Payload Jobs Queue |
| **16** | 35 个索引的完整 DDL 清单 | ✅ **已关闭（第五轮）**——`gap-closing.md` §2.12 全量对照表已产出（21 显式 + 14 个 `_id`）。剩余「按表翻译成 DDL」属 schema 包内的机械工作 |
| **11** | OTel collector 与后端选型 | ✅ **决策已完成（D-R2 = A）** → Langfuse 一体，不引 Collector，降级为「1 个 Docker 服务 + 约 50 行应用层 sampler 代码」 |

**净剩余待查 6 项**：#1（版本号）· #4（Local API 语义，并入 schema 包）· #12（小数秒）· #20（cron 时区）· #21（`req.payload.db.drizzle` 等价性）· **#33/#34/#35（本轮新增 3 项，属 PoC 而非检索缺口）**。
