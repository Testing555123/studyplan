# 最终技术栈（收敛结论）

> **这份文档是什么**
> 四轮选型（共 31 个候选、124 条 FR 逐条评分）收敛后的**单页确定结论**。交棒给重构实施阶段的唯一入口。
>
> **最终栈 11 项**（原报告 15 项，第四轮按「囊括」关系收敛）。收敛依据见 §⓪⓪「栈项收敛记录」。
>
> **决策已全部裁定**（2026-10-07）：**15 条决策点**全部有结论，见 §6（第三轮新增 D12、第四轮新增 D13、第五轮新增 D-R1 / D-R2）；**最终裁定 T1–T5 见上方 §⓪⓪ 摘要卡**。
>
> **核实时间**：2026-10-07（四轮同批）。所有第三方项目的版本、许可证、维护状态均基于官方仓库页 / 官方文档 / npm Registry 实际抓取，明细见 [candidate-notes.md](candidate-notes.md)。

---

## ⓪⓪ 最终裁定摘要卡（2026-10-07）

> **⚠️ 本卡与 [`TECH-SELECTION.md`](../../../TECH-SELECTION.md) §0「最终裁定」同源，以 §0 为准。** 本卡是摘要，**内容分叉时以 §0 为准**。
>
> **本卡是「已决策的既成事实」，不是候选方案。** 前五轮中标为「待验证 / 待裁定」的项，凡未在下表出现的，**均已裁定完毕，不必再评估**。

| 裁定 | 结论 | 消解了什么 |
| --- | --- | --- |
| **T1 连接模式** | **使用 Session pooling**（`aws-[IDX]-[REGION].pooler.supabase.com:5432`）。**否决 transaction pooling（6543）**——它省的是连接数（现状 `maxPoolSize: 5`，从来不是瓶颈），代价是 prepared statement · query pipelining · 会话级状态（含 `LISTEN`/`NOTIFY` 与 advisory lock）三项失效，后两项**正是 Payload Jobs 可能依赖的机制** | ✅ **一次性关闭 P33 与 P35** |
| **T2 同区可行性** | **三级降级，任一层级都能开工**：① Supabase Free `us-east-1`（根治）② Neon Free `us-east-1`（根治，余量小）③ 跨区 + 四层缓解（**显式接受残留延迟**）。**R-A 不再阻塞开工**——它是性能问题，不触及 14 条不可违反项中的任何一条 | ✅ **关闭 P34** |
| **T3 任务队列** | **D12 = A（Payload Jobs Queue）**，零新增依赖。**P32 降级为非阻塞**——失败可回退 C（BullMQ），代价仅栈项 11 → 12 | ✅ 关闭 P32 |
| **T4 R8 监控** | 改为**客观阈值**：`interview_questions` > 500 条 或 `roadmap_progress` > 1000 行 → 重新评估 Payload admin 双进程方案 | ✅ 消除「运营实体 10+」的不可执行表述 |
| **T5 残余风险** | **5 项全部显式接受**并落盘为既成事实（见 §0 完整清单） | — |

### 三条由裁定产生的配置硬约束

| # | 约束 | 处置 |
| --- | --- | --- |
| 1 | **端口 5432 有二义性** | `db.[REF].supabase.co:5432` 是**直连（无池化）**；`[POOLER-HOST]:5432` 才是 **Session pooling**。混淆会导致连接池完全失效 |
| 2 | **`[INDEX]` 不是区域编号** | 是池化器集群索引，不能从区域名推导，须从 Dashboard 的 **Connect** 对话框复制完整主机名 |
| 3 | **T2 层级 1 依赖 Supabase Free 的区域可选性**（原 P34） | 官方区域页只列 17 个「平台可用区域」，**未说明 Free 的权限**。若不可选 → 自动降级到层级 2/3，**不阻塞开工** |

---

## ⓪ 前三轮结论速览

### 第三轮：GitHub 实证调研的四个结论

> 完整候选笔记见 [附录 B §19–§26](candidate-notes.md)，逐条缺口实证见 [附录 C §2](gap-closing.md)。

| # | 结论 | 影响 |
| --- | --- | --- |
| **1** | **【阻塞项解除】`@nuxt/content` 3.16.1 明确支持 Nuxt 4** | 证据链：`peerDependencies` 不含 `nuxt`（Nuxt module 惯例，不构成否定证据）+ `dependencies` 含 `@nuxt/kit ^4.5.2`（Nuxt 4 工具链）+ `devDependencies` 含 `nuxt ^4.5.2`（与本项目完全一致）。**决策 D3 解除，阻塞 PoC 从 8 项降至 7 项** |
| **2** | **【实证确认】4 条 0 分项的判定正确** | 逐一检索了 Trigger.dev / Temporal / Windmill / n8n / BullMQ / Airflow / Dagster / `ai-daily-digest` / `news-bot`（编排与流程）、nodejieba / node-segment / chinese_text_normalization / punctuation-normalizer（中文处理）、open-rag-eval / VerifAI（引用一致性），**全部无法表达业务顺序或运行时一致性** |
| **3** | **【新否决 2 项】Windmill 与 n8n 的许可陷阱** | Windmill `backend/`+`frontend/` 为 AGPL-3.0 且 LICENSE **限制未经协议 modify 或 wrap**；n8n 官方条款**禁止 bundling into something you sell**——本项目定位「可上线产品」，落入禁止条款 |
| **4** | **【新发现 3 个可复用组件】** | **unstorage**（MIT, 2.7k）提供 TTL + SWR 骨架 → `FR-GH-4`；**ast-grep**（MIT, 16.1k）提供 AST 级粗筛 → `FR-AIQA-5`；**Trigger.dev**（Apache-2.0, 16.5k）提供 durable execution → `FR-DIGEST-1/4`（**第四轮已降级**，见 §⓪⓪） |

### 第四轮：技术栈收敛（囊括关系审视）

> 动机：用户提出「Nuxt 一个包囊括了 Vue + Vite + UI 组件库，栈项是否也有同样问题」。

| # | 结论 | 影响 |
| --- | --- | --- |
| **1** | **【重复计数 ×2】Payload auth 与 `ToolLoopAgent` 本是各自包的子能力** | 第一轮把「Payload 3」与「Payload auth」列成两项（但 auth 是 Payload 内置，见附录 B §1「Auth out of the box」）、把「Vercel AI SDK」与「SDK 内的 `ToolLoopAgent`」列成两项（附录 B §4 已核实 `ToolLoopAgent` 是 SDK 6.x 内置 API）。**这是记账错误** → **−2 项** |
| **2** | **【传递依赖 · 本轮新发现】Payload 的 PostgreSQL adapter 本身就基于 Drizzle ORM** | `@payloadcms/db-postgres` 用 **Drizzle ORM + node-postgres**，官方公开 `payload.db.drizzle`（可用完整 Drizzle 能力及 `sql` 模板）、`payload.db.tables` / `enums` / `relations`，并从 `@payloadcms/db-postgres/drizzle` 重导出 `eq` / `sql` / `and`；`npx payload generate:db-schema` 可生成带类型安全的 schema。**引入 Payload 即等于引入 Drizzle** → Drizzle 从独立项降级为传递依赖 → **−1 项** |
| **3** | **【功能替代】Payload Jobs Queue 可替代 BullMQ，且三点更强** | `Workflow` 顺序编排 · `retries.shouldRestore`（默认 `true`，成功的不重跑、失败的重新执行 = **从失败节点重试**）· **`JobCancelledError`主动中止整个 Job**（BullMQ 无此能力）。**不需 Redis**（队列在 `payload-jobs` collection）。⚠️ 无任务级 `timeout`（不影响，超时在 handler 内做）+ cron 时区未说明（PoC P32）→ **−1 项** |
| **4** | **【未成立】Nuxt Content FTS5 无法替代 Meilisearch** | `useSearchCollection` 确实存在（SQLite FTS5 + BM25 + 前缀匹配 + 摘要片段 + 多集合），但**文档没有承诺中文分词**，公开 API 中**没有 `tokenizer` / `language` / 词典配置项**，`minTermLength` 只控制最短词项长度而非分词；**且它仅支持客户端**（浏览器 SQLite WASM 索引），不应作为服务端搜索 API。→ **Meilisearch 保留** |
| **5** | **【性质改变】Langfuse 降为 OTel 的 sink，不减少项数** | Langfuse 自 v3.22.0 起支持 OTLP 摄入（`/api/public/otel`），**能接收非 LLM 的通用 HTTP span**。但「401/404 不记日志」「1000/3000ms 分级」的采样与分级**必须在 OTel SDK / Collector 层做**，Langfuse 不做 → **OTel 仍是独立项** |

> **覆盖率维持不变**：91.9% / 73.7%。本轮是**记账修正**（第一轮把同一个包的两个部分当两项，且漏认传递依赖），**不是能力变化**。`coverage-matrix.md` 的任何得分数字**未改动**，得分分布 108 + 12 + 4 = 124 不变。

---

## ① 最终技术栈（11 项 · 第四轮收敛后）

> **原15 项 → 11 项。** 收敛依据见 §⓪⓪「栈项收敛记录」。**4 项差额全部来自「囊括」关系的识别**——其中 3 项是重复计数修正，1 项是传递依赖发现。

| # | 层 | 选择 | 许可证 | Star | **这一项囊括了什么** | 承担哪几条 FR | 取代了什么 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 运行时 | **Node.js ≥ 22** / pnpm workspace | — | — | 四处依赖的共同下限（见下方「运行时要求」小节） | 前置条件 | — |
| 2 | 数据 | **PostgreSQL 16** | PostgreSQL License | — | **pgvector**（向量）· **tsvector**（全文）· **pg_trgm**（模糊）· JSONB（`steps` 动态键）· `GREATEST` / `ON CONFLICT`（幂等） | `FR-SEARCH-1/2/3/4`、`FR-ASK-1/2/3`、`FR-INTERVIEW-3`、`FR-POST-5`、`FR-LIKE-1/2`、`FR-PROGRESS-3`、`FR-DOC-3` | MongoDB 14 集合 + 自研 140 行内存向量库（含墓碑 + TTL 两处易错设计） |
| 3 | 后端基座 | **Payload 3** | MIT | 45.1k | 集合/字段定义 · REST + GraphQL · **auth**（含 access control）· document/field hooks · **Jobs Queue**（Task / Workflow / cron / concurrency）· **内置 Drizzle**（`payload.db.drizzle` + `sql` 模板）· migrations · 文件上传 · env 校验 | `FR-AUTH-1/2/5`、`FR-USER-1/2/3`、`FR-POST-1/4`、`FR-CMT-1/2/3`、`FR-INTERVIEW-1`、`FR-PROGRESS-5`、`FR-GHINTRO-3`、`FR-DIGEST-1/5` | NestJS 自研 12 模块 + 887 行横切中的 3 项（限流、env 校验、任务队列）+ **独立 Drizzle 项** |
| 4 | 校验与契约 | **Zod 4**（Standard Schema V1） | MIT | 44.1k | 后端 DTO 校验 · 前端表单校验 · AI 工具入参校验 · 环境变量校验 · 手写 `escapeRegex` 的替代 | `FR-CORE-1/2/6`、`FR-CONTRACT-1/2/3/4`、`FR-POST-2`、`FR-PAGE-LOGIN-2`、`FR-AGENT-2/7` | class-validator DTO 式校验（`env.validation.ts` 485 行 + `config-values.ts` 72 行） |
| 5 | 限流 | **rate-limiter-flexible**（内存后端） | ISC | 3.6k | 逐路由 14 处档位 · 热门榜单显式豁免 · 失败计数 | `FR-CORE-5` | `@nestjs/throttler` 6.5.0 + 12 处 `@Throttle` |
| 6 | 缓存 | **lru-cache v11**（进程内）+ PG 落库 | **BlueOak-1.0.0** | 5.9k | 7 天答案缓存 · 键空间隔离（`namespace`）· 毫秒 TTL · 零部署 | `FR-AIQA-2`、`FR-ASK-3` | 手写 `posts|` 前缀隔离；**不引 Redis**（见 §2 #3） |
| 7 | GitHub 客户端 | **Octokit** | MIT | 7.9k | ETag 条件请求 · 限流与重试（`plugin-throttling`）· 分页 · `User-Agent` 构造 | `FR-GH-1/2/5` | 自研 GitHub REST client 259 行 |
| 8 | 可观测性 | **OpenTelemetry JS** + **Langfuse**（OTLP sink） | Apache-2.0 / MIT（`ee/` 除外） | 3.5k / 35.5k | OTel：W3C trace 传播 · 命名 span（分段计时）· 采样与分级 · Collector 路由<br>Langfuse：LLM 追踪 · dataset / LLM-as-a-Judge / 基准（自托管 v3.22.0+ 可作 OTLP 后端） | `FR-CORE-3/4`、`FR-AGENT-10`、`FR-AGENT-4/5/7` 的可观测部分 | 自研requestId 112 行 + 分段计时 169 行 + 自建评测门禁；**不用 Sentry**（见 §2 #9） |
| 9 | AI 调用与 Agent | **Vercel AI SDK 6.x**（含 `ToolLoopAgent`） | Apache-2.0 | 27.2k | `chat` / `streamText` · `embed`（见缺口 #5「embed 待独立方案」） · `Output.object` 结构化输出 · 工具声明与入参校验 · **`ToolLoopAgent` 工具调用循环 + 步数上限** · 流式（AI 后端：OpenCode Zen / `space-bunny-free`，OpenAI 兼容；`chat` 半已确认） | `FR-AI-1/2/3`、`FR-AIQA-1`、`FR-GHINTRO-1`、`FR-DIGEST-3`、`FR-AGENT-1/2/6/7/9` | 裸 `fetch` LLM client 303 行 + 手写 `extractJsonObject` + 手写 ReAct 循环 |
| 10 | Agent 对比实现 | **LangGraph.js**（可选项） | MIT | 3.3k | 图编排对照 · `RetryPolicy` 异常分类（`ConnectionError` 重试 / 5xx 重试 / 4xx 不重试） | `FR-AGENT-8` | —（批次 9 全部） |
| 11 | 前端与文档 | **Nuxt 4** + **Nuxt UI 4** + **Nuxt Content 3** + **Meilisearch CE** | — / MIT / MIT（CE） | — / 3.7k | Nuxt 4：Vue 3.5 · Vite · Nitro · Vue Router · unhead（SEO）<br>Nuxt UI 4：Tailwind 4 · **Reka UI** · Lucide · 40+ 组件（含 `UCommandPalette` = ⌘K）· 仪表盘布局组件<br>Nuxt Content 3：markdown 渲染 · Shiki · SQLite · MDC · 类型化 collections<br>Meilisearch：文档站内检索（`FR-DOC-3`） | `FR-PAGE-*`、`FR-WEBINFRA-*`、`FR-HOME-*`、`FR-SEO-*`、`FR-ROADMAP-2/3/4`、`FR-PROGRESS-1/2/4`、`FR-DOC-1..6` | VitePress 独立站 31 篇（`FR-DOC-1` 不可违反项要求弃用） |

### 统一栈的落点

| 层 | 统一手段 |
| --- | --- |
| 语言 | 100% TypeScript |
| **类型与契约** | **Zod 4 schema 为唯一来源** —— 后端作 DTO 校验、前端作表单校验、AI SDK 作工具入参校验，Standard Schema V1 使其可被三方消费 |
| **数据访问** | **Payload 集合（CRUD）+ `payload.db.drizzle`（复杂查询）共用同一 Postgres schema** —— Drizzle 不是独立依赖，是 Payload 的内部依赖 |
| 请求层 | 前端 `useApi` 唯一入口不变（`FR-WEBINFRA-2`） |
| 运行时 | Node 22+ —— **Vercel AI SDK 硬要求 22、OTel 支持 22/24/26、Nuxt Content 原生 SQLite 需 22.5+** |

### 运行时要求的一致性

`Node.js ≥ 22` 是**四处依赖的共同下限**，这也是选它的直接理由：

| 依赖 | 要求 |
| --- | --- |
| Vercel AI SDK 6.x | **Node 22+**（硬要求） |
| OpenTelemetry JS | Node 22 / 24 / 26（仅Active 或 Maintenance LTS） |
| Nuxt Content 3.16.1 | `>= 20.19.0`；用原生 SQLite 需 **22.5.0+** |
| BullMQ | `redis >= 5.0.0`（**仅自托管 Redis 时**，本方案已用 Payload Jobs 替代 → 该约束消失） |
| Drizzle Kit（迁移工具） | Node 20+ |

### 许可证结论

11 项中 **10 项为 MIT / Apache-2.0 / PostgreSQL License / ISC**。唯一非标准宽松许可是 **lru-cache 的 BlueOak-1.0.0**（OSI 认可，但**不能笼统标注为 MIT**，需在 `NOTICE` 保留原文条款）。

**无 AGPL / SSPL / MSCL / GPL 风险**——这是相对 Directus、Typesense、Windmill、n8n 的决定性优势。

---

## ⓪⓪ 栈项收敛记录（第四轮）

> **动机**：用户提出「Nuxt 一个包囊括了 Vue + Vite + UI 组件库，栈项是否也有同样问题」。按此逐项审视后，发现**四种「囊括」关系**，其中一种是此前四轮都没发现的**传递依赖**。

### 已确认的合并（15 → 11 项）

| # | 收敛类型 | 原状态 | 修正后 | 依据 |
| --- | --- | --- | --- | --- |
| 1 | **重复计数** | #3 Payload 3 与 #6 Payload auth 是两项 | 合并为「Payload 3（含 auth）」 | Payload auth 是 Payload 内置能力。第一轮附录 B §1 已核实「Auth out of the box」+「Extremely granular Access Control」，**它本来就不该单列** |
| 2 | **重复计数** | #12 Vercel AI SDK 与 #13 内的 `ToolLoopAgent` 是两项 | `ToolLoopAgent` 并入 Vercel AI SDK | `ToolLoopAgent` 是 SDK 6.x 的内置 API。第一轮附录 B §4 已核实 |
| 3 | **传递依赖（本轮新发现）** | #4 Drizzle ORM + Drizzle Kit 是独立一项 | **降级为 Payload 的传递依赖** | **Payload 的 PostgreSQL adapter `@payloadcms/db-postgres` 本身就基于 Drizzle ORM + node-postgres**，且官方公开 `payload.db.drizzle`（含 `sql` 模板）与 `payload.db.tables` / `enums` / `relations`，还从 `@payloadcms/db-postgres/drizzle` 重新导出 `eq` / `sql` / `and`。**引入 Payload 就等于引入了 Drizzle** |
| 4 | **功能替代** | #9 BullMQ 是独立一项 | **被 Payload Jobs Queue 替代** | 见下|

### Payload Jobs Queue 替代 BullMQ 的核实结论

来源：`https://payloadcms.com/docs/jobs-queue/overview` + `https://payloadcms.com/docs/jobs-queue/tasks`

| 能力 | BullMQ | Payload Jobs | 判定 |
| --- | --- | --- | --- |
| 额外服务 | PG 后端时无需Redis | **无需 Redis**（队列在 `payload-jobs` collection） | ✅ 打平 |
| 周期调度 | Repeatable jobs / Cron | `schedule: [{ cron, queue }]` ✅（⚠️ **必须配 `autoRun` 或 runner**，否则 Job 只入队不执行） | ✅ |
| 顺序编排 | 需自研 | **`Workflow`（多 Task 顺序组合）** ✅ | ✅ **Payload 更强** |
| **从失败节点重试** | 需自研 | **`retries.shouldRestore`（默认 `true`）**——之前成功的任务不重跑（返回上次 `output`），失败的重新执行。也可传函数按输入判断 | ✅ **Payload 更强** |
| 重试次数 | `attempts` + `backoff` | **`retries`**（`retries: 2` = 首次 + 2 次重试）；`0` = 禁用；未定义则继承 Workflow | ✅ |
| **主动中止** | 需自研 | **`throw new JobCancelledError(...)`** 阻止整个 Job 继续重试 | ✅ **Payload 独有** |
| 并发互斥 | `concurrency` | **`concurrency`**（需 `jobs.enableConcurrencyControl: true`） | ✅ 打平 |
| **执行超时** | worker 侧可配 | ❌ **文档未定义任务级 `timeout`** | ⚠️ **缺口** |
| 一次性延迟 | job 延迟 | ❌ **`waitUntil` 未在 Tasks 页出现**（可能属Workflow 层） | ⚠️ **未确认** |
| cron 时区 | 可配 | ❌ **文档未说明** | ⚠️ **风险** |
| 幂等性 | 至少一次 | 至少一次 + **官方明确建议幂等**（Job ID 作幂等键、DB 唯一约束/upsert、条件更新、事务） | ✅ 与项目纪律吻合 |

**三个缺口的处置**：

| 缺口 | 影响 | 处置 |
| --- | --- | --- |
| **无任务级 `timeout`** | `FR-GHINTRO-1` 的「时间预算 20000ms」、`FR-AIQA` 的「超时 25000ms」 | ✅ **不构成阻塞**。现状的超时本来就是在 handler 内用 `AbortSignal.timeout` 做的，**不是队列层职责** |
| **`waitUntil` 未确认** | `FR-GH-2` 的「60s 最小刷新间隔」 | ✅ **不构成阻塞**。现状用 `findOneAndUpdate` 原子抢占，换 PG 后可用 `INSERT ... ON CONFLICT DO UPDATE` 实现，与队列无关 |
| **cron 时区未说明** | `FR-DIGEST-5` 要求「时区可配且非法时区名退回 UTC」 |⚠️ **需 PoC 验证**（见 §5 PoC 清单新增 P32） |

**结论**：Payload Jobs Queue 可替代 BullMQ，**且在「顺序编排 / 从失败节点重试 / 主动中止」三点上强于 BullMQ**。代价是无任务级 `timeout`（不影响）与 cron 时区未确认（一个 PoC）。

### 未成立的囊括（已检索但不适用）

| 候选 | 想替代什么 | 为什么不成立 |
| --- | --- | --- |
| **Nuxt Content `useSearchCollection`**（SQLite FTS5） | Meilisearch | ⚠️ **文档没有承诺中文分词**。公开 API 中**没有 `tokenizer` / `language` / 词典配置项**；`minTermLength` 只控制最短词项长度，**不是中文分词**。若底层用 FTS5 默认 tokenizer，连续中文会被识别成较长词项。**且它仅支持客户端**（浏览器 SQLite WASM 索引），**不应作为服务端搜索 API 使用**。→ **Meilisearch 保留** |
| **Drizzle Kit 独立工具** | — | ⚠️ Drizzle 本身已被 Payload 囊括，但 **DDL 迁移工具**（解决 PG 无 `autoIndex` 的 35 个索引）仍需独立引入。→ **不单独计入栈项**，作为 Payload 迁移流程的一个工具 |
| **unstorage**（MIT, 2.7k，UnJS 生态） | lru-cache | 能力上覆盖（TTL + 命名空间 + SWR），**但 lru-cache 已在栈内且更轻**。unstorage 的价值在 `FR-GH-4` 的 SWR 骨架（第三轮结论），**不构成替代 lru-cache 的理由** |
| **Langfuse 作为 OTel 后端** | 独立的可观测性栈 | ⚠️ **不减少项数，但改变性质**：Langfuse 自 v3.22.0 起支持 OTLP 摄入，**能接收非 LLM 的通用 HTTP span**（映射到 `metadata.attributes.*`）。但「401/404 不记日志」「1000ms 告警 / 3000ms 错误」的**采样与分级必须在 OTel SDK / Collector 层做，Langfuse 不做**。→ **OTel 仍是独立项，Langfuse 降为它的 sink** |

### 三项待核实的可能合并（**未计入最终项数**）

| 候选 | 可能省掉 | 阻塞项 |
| --- | --- | --- |
| **Nuxt Content FTS5 替代 Meilisearch** | Meilisearch（1 项） | **中文分词未承诺 + 仅客户端**。若后续实测中文命中可接受且能改造成服务端，可省 1 项 |
| **Drizzle 判定为非必需** | 无（已合并进 Payload） | ✅ **已实质解决**——Drizzle 本就是 Payload 的内部依赖，不是额外引入 |
| **Payload Jobs 替代 BullMQ** | BullMQ（1 项） | ⚠️ **cron 时区未确认**（PoC P32）。**已计入 11 项**，但若 PoC 失败需回退到 12 项 |

### 栈项数演进

| 阶段 | 项数 | 变化原因 |
| --- | --- | --- |
| 第一轮报告 | 15 | — |
| **第四轮收敛后** | **11** | −1（Payload auth 并入）−1（`ToolLoopAgent` 并入）−1（Drizzle 是 Payload 传递依赖）−1（BullMQ 被 Payload Jobs 替代） |
| 理论下限 | 10 | 若 Nuxt Content FTS5 的中文分词实测通过，可再省 Meilisearch |
| **第五轮风险处置后** | **11（不变）** | ✅ **本轮处置未新增任何栈项**——见下方复用校验 |

### 第五轮风险处置的栈项复用校验

> 本轮处置三个真风险 + 重组 PoC + 关闭核实缺口。**每一项都要先问「栈内第 N 项能不能做」，再做「引不引入新东西」的判断。**

| 方案步骤 | 复用栈内第 N 项 | 判定 |
| --- | --- | --- |
| R-A ① 根因：同区部署 | 栈内**无**可复用的能力（同区是部署形态，不是库） | ✅ **确属新增必要**，但不计入栈项——它是**部署平台选择**（Supabase），与 Vercel 并列 |
| R-A ② 连接池：PgBouncer transaction pooling | — | ✅ **不作为独立栈项**：Supabase **内建**，属平台自带能力。**若改用自建 PG 才需单独引入** |
| R-A ③ 服务端：`idle_session_timeout` + TCP keepalive | — | ✅ **零新增**：都是 PostgreSQL 与 Node 的内置参数 |
| R-A ④ 应用层：死连接首次失败重试 | — | ✅ **零新增**：`pg.Pool` 自带连接错误事件 |
| R-B 1a/1b ObjectId → UUID 映射与列类型迁移 | — | ✅ **零新增**：迁移脚本属一次性工具，不是运行期依赖 |
| R-B 1c 加真实外键 | 栈内第 2 项（PostgreSQL） | ✅ **零新增**：FK 是 PG 内建能力 |
| R-B 2/3/4 错误处理 / 级联前置条件 / 幂等语义 | — | ✅ **零新增**：纯业务逻辑修复 |
| R-C 三道闸门重建 | 栈内第 4 项（Zod 4，Standard Schema V1） | ✅ **复用**：编译期闸门可用 Zod schema 的 `.omit()` / `.pick()` 组合表达，**不需要 `zod-mapper` 之类的额外工具** |
| R-C 专用认证查询只 SELECT 三列 | 栈内第 3 项（`payload.db.drizzle`） | ✅ **复用**：Drizzle 的显式列选择是内置能力，不需要 ORM 之外的查询层 |
| R-C 补两条最小测试 | — | ✅ **零新增**：`node:test` 内置；若沿用现状测试框架则复用 |
| PoC ② PG 实例 | 栈内第 2 项 | ✅ **零新增**：PG 是栈内既有选择 |
| D-R2 Langfuse 作 OTLP 后端 | 栈内第 8 项（Langfuse 已在栈内） | ✅ **复用栈内项，不新增** |
| D-R2 省掉 Collector | — | ✅ **确认不需要引入**——这正是本轮最大的一次**减法** |
| D-R2 应用层 `CustomSampler` | 栈内第 8 项（OpenTelemetry JS SDK 内置） | ✅ **复用**：SDK 自带 `CustomSampler` 抽象，**不需要自研采样算法** |
| Meilisearch CE | 栈内第 11 项 | ✅ **复用**：第四轮已核实 Nuxt Content FTS5 无法替代它（中文分词未承诺 + 仅客户端） |

**结论**：**第五轮处置未新增任何技术栈项，仍为 11 项。** 其中两处是**减法**（省掉 BullMQ、省掉 OpenTelemetry Collector），一处是**转化**（Drizzle 从独立项变 Payload 传递依赖）。

### 第五轮新核实：免费同区 PG 方案的实测结论（2026-10-07）

> D-R1 裁定「免费」后，以下事实**全部经官方文档实测**，未凭记忆断言。

#### Supabase Free 额度（来源：`supabase.com/pricing`）

| 项 | 额度 |
| --- | --- |
| 数据库容量 | **500 MB/项目** |
| 月出网流量 | **5 GB/月**（另有缓存出网 5 GB/月） |
| API 请求 | 不限 |
| **暂停策略** | **连续 1 周无活动后自动暂停** |
| 活跃项目数 | 最多 **2 个** |
| 其他 | 50,000 月活跃用户 · 1 GB 文件存储 · 共享 CPU / 500 MB 内存 |

**对本项目的适用性**：数据量（14 个集合 + 31 篇文档 + 45 个路线节点静态数据）远低于 500 MB；出网主要是 AI 调用（走 Vercel 函数而非 DB），5 GB 够用。**每日报道 cron 保证每天有活动**，不会触发 7 天暂停。✅

#### 区域选择（来源：`supabase.com/docs/guides/platform/regions`）

**17 个具体 AWS 区域中确认包含 `us-east-1`（East US · North Virginia）**——与 Vercel 默认 `iad` **同区**。

> ⚠️ **待核实**：官方区域页**未说明 Free 计划能否选择全部区域**，只说明这些是「平台可用区域」。**最可靠的确认方式是在 Supabase 控制台创建项目时查看 Free 组织实际显示的区域选项。** 本方案的 R-A 根治效果**依赖此项成立**。

#### 连接端口与池化模式（来源：`supabase.com/docs/guides/database/connecting-to-postgres`）

| 连接方式 | 主机名 | 端口 | 模式 | IP |
| --- | --- | --- | --- | --- |
| 直连 | `db.[REF].supabase.co` | `5432` | 无池化 | 默认 IPv6 |
| **共享 Session pooler** | `aws-[IDX]-[REGION].pooler.supabase.com` | `5432` | **Session pooling** | 仅 IPv4 |
| **共享 Transaction pooler** | `aws-[IDX]-[REGION].pooler.supabase.com` | `6543` | **Transaction pooling** | 仅 IPv4 |
| 专用 Transaction pooler（**付费**） | `db.[REF].supabase.co` | `6543` | Transaction pooling | 默认 IPv6 |

> ⚠️ **端口 5432 有二义性**——`db.[REF].supabase.co:5432` 是**直连**（无池化），`[POOLER-HOST]:5432` 才是 **Session pooling**。混淆这两者会导致连接池完全失效。

### 四条硬约束（写进实施计划的必须项）

| # | 约束 | 后果与处置 |
| --- | --- | --- |
| **1** | **Transaction pooling（6543）不支持 prepared statement** | 官方确认：直连 ✅ /共享 Session pooler ✅ / **共享 Transaction pooler ❌ / 专用 Transaction pooler ❌**。原因：transaction pooling 在事务结束后归还连接，下一事务可能落到另一条连接，会话级 prepared statement 无法安全保留。<br>**处置**：Payload 的 `@payloadcms/db-postgres` 用 **node-postgres（pg）**，设 `pg.Pool` 的 `options: '-c statement_cache_size=0'`（把 PG 的 GUC 关掉）。⚠️ 官方表格**未列 node-postgres**，此处置是按「`options` 传服务端 GUC」的机制推断，**需在 PoC ② 中实测确认**。替代方案：改用 `db.[REF].supabase.co:5432` **直连**（免费直连连接数有限，但本项目 `maxPoolSize` 只需 5） |
| **2** | **Transaction pooling 还不支持** query pipelining · 会话级状态（`SET`/`RESET` · session-level advisory lock · **`LISTEN`/`NOTIFY`** · 临时表）· `WITH HOLD` cursor | ⚠️ **`LISTEN`/`NOTIFY` 与 advisory lock 不可用，可能影响 Payload Jobs Queue 的 worker 通知机制与幂等控制**。检索未找到 Payload Jobs 依赖 `LISTEN`/`NOTIFY` 的证据，但**也没找到它不依赖的证据** → **待核实（P33）**。<br>**处置**：若 PoC ③ 发现依赖，**必须改用 Session pooling（`[POOLER-HOST]:5432`）或直连** |
| **3** | **`ai_answer_cache` 刻意无 TTL**（`ai-usage.schema.ts:49-55`：清理有 60s 延迟、时间写死不好调），改为查询时手动判过期 | **不得**在 PG 侧加 `pg_cron` 清理或 TTL 模拟，否则语义变更（把「查询时判过期」变成「后台物理删除」） |
| **4** | **`posts.tags` 数组等值 + `createdAt` 排序在 PG 中不能用一个复合索引** | 拆成 `GIN (tags)` + `BTREE (created_at DESC)`。照搬Mongo 的 `{tags:1, createdAt:-1}` 会对数组行**漏命中** |

---

## ② 明确否决清单（12 项）

> **纪律**：每项否决都附「已检索过什么、因什么不适用」。缺少检索记录的项从「否决」降级为「未纳入评估」（见 §2 末尾）。

| # | 否决项 | 理由 | 已检索 / 已核实的内容 |
| --- | --- | --- | --- |
| 1 | **NestJS 11** | Payload 3 + Drizzle 已完整覆盖其职责。保留双后端会制造比现状更复杂的边界，违背最小栈目标 | **本项目现状即NestJS**（208 文件 / 28,800 行）。第二轮实测了换库影响面：纯 Mongo 代码仅占后端 10-12%（1,500–1,800 行 / 14,477 行），换 ORM 后归零 |
| 2 | **tRPC** | 官方 README **未列 Nuxt / Nitro adapter**（仅 Next.js / Express.js / Fastify + 未枚举的社区 adapter），需依赖社区 adapter，与「统一栈减少开发」相悖 | 附录 B §16.1：MIT、**40.7k star**（第三高星）、框架级对等 Zod 但缺 Nuxt 集成 |
| 3 | **Redis / Upstash Redis / ioredis** | 换 Postgres 后 BullMQ 支持 PG 后端；缓存用进程内 lru-cache + PG 落库；限流用内存后端。**引 Redis 等于新增一个运维面，与「减少自研」初衷相反** | 附录 C §1.3：已检索并对比三种Redis 方案的运维面 |
| 4 | **Better Auth** | Payload auth 已覆盖 `FR-AUTH-1/2/5`。**双认证实现并存是双 Token 轮换语义冲突的高风险点** | 附录 B：MIT、**30.2k star**、7,668 commits、framework-agnostic。技术上完全可行，是**主动不引入**而非不适用 |
| 5 | **Directus 12** | **MSCL 1.0（source-available，非 OSI 开源）**，源自 Fair Core License；免费门槛为年收入 <500 万美元且员工 <50 人| 附录 B §3：38.2k star、能力面与 Payload 相当。v12（2026-05）从 BSL 1.1 改 MSCL 并引入注册密钥机制 |
| 6 | **NocoBase 2.x** | **自带 React 客户端**，与 Nuxt 二选一。采用它意味着 8,677 行前端全部重写，且 `FR-WEBINFRA-4`「Access Token 存模块级变量、不进 SSR payload」这条 Vue 专属安全技巧无等价物 | 附录 B §2：**Apache-2.0**（2026-02-26 从 AGPL-3.0 调整，PR #8682）、24.5k star。覆盖度测算：收口批次 12 条 FR 中 **8 条判 0** |
| 7 | **LangGraph（Python）** | Python-first，主实现用它需整个项目背一个 Python 运行时，部署复杂度翻倍，且与Nuxt/Node 技术栈割裂 | 附录 B §5：MIT、**42.8k star**（star 数最高）。JS 版仅 3.3k star / 106 open issues，成熟度明显低于同为Node 原生的 Vercel AI SDK |
| 8 | **LanceDB / Qdrant** | pgvector 已在数据库内，再引一个数据层是重复运维。混库防线（`model` 字段）、写端墓碑、孤儿向量自愈仍需应用层实现，换成外部库这三处一个都不省| 附录 C §1.5：已检索并对比运维面与能力边界 |
| 9 | **Sentry** | SaaS 意味着数据出境，与「日志不写敏感数据」（不可违反项 8）需额外审视。OpenTelemetry 自托管无此问题 | 附录 C §1.1：已检索。自托管的代价是需自配采样、告警、仪表盘（collector 与后端选型见 §5 待核实项 #11） |
| 10 | **保留 VitePress 1.6** | `FR-DOC-1` 是不可违反项：「文档由主站构建产出，不再由独立文档站产出」+ 准出条件「构建链不再产出独立文档站」 | 附录 B §13：MIT、现状 31 篇 + `.vitepress/config.ts` 194 行。**必须迁移** |
| **11** | **Windmill**（第三轮新增） | **`backend/` 与 `frontend/` 为 AGPL-3.0**，且 LICENSE **明文限制未经协议进行 modify 或 wrap**、禁止出售/转售/作为托管服务提供。带 `enterprise` 编译标志的代码属专有商业许可，**私有或公开 fork 不得包含** | 附录 B §20.3：LICENSE 原文（`raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE`）四条限制已逐条核实。定位是「Retool 与 Temporal 的开源替代」，多语言脚本 + DAG 工作流，能力面与 Trigger.dev 重叠 |
| **12** | **n8n**（第三轮新增） | fair-code（源码可见，**非 OSI 开源**）。官方许可条款明确：自托管自己跑 OK，但 **「Building a product where your customers log into n8n, or bundling it into something you sell, is not」**——本项目定位「可上线产品」，落入禁止条款 | 附录 B §20.4：另有 `ee in the directory path` 目录树下的文件不在上述条款内且需企业许可。能力：可视化 + 代码双模工作流、1000+ 集成、执行历史与 Insights 仪表板 |

### 未纳入评估（不是否决）

| 项 | 状态 |
| --- | --- |
| **Trigger.dev**（第三轮新增，第四轮降级） | **Apache-2.0，16.5k star，TypeScript-first，自托管（Docker Compose + 官方 Helm Chart）**。durable execution、自动重试、幂等性、检查点、任务暂停/等待、human-in-the-loop。⚠️ **自托管是否需 PostgreSQL / Redis 未核实**（不得断言）→ **第四轮已降级**：Payload Jobs Queue 已在栈内且覆盖了「顺序编排 + 从失败节点重试 + 主动中止」三点，**再引一个队列引擎是栈膨胀** |
| **Temporal**（第三轮新增） | MIT，durable execution 崩溃后续跑，Web UI 开源。**需独立服务集群**（Temporal Server + DB），与 D10「不引额外服务」冲突 → **暂缓** |
| **Hono** | 第二/三轮均未抓取核实。若未来弃用 Payload，可作为统一栈第三块候选 |
| **Nuxt Nitro 承接后端** | 第二/三轮均未核实。若能承载，可把运行时从 2 个降到 1 个——属需实机验证的架构级判断 |

### 三个可复用组件（**可选增强，不改变任何 FR 得分**）

> 这三个组件是在**既有得分内**提供更强的骨架。它们能省掉样板代码，但不改变「该 FR 的验收标准能否被现成方案完整表达」这个判断。

| 组件 | 许可证 | Star | 对应缺口 | 能省什么 | 不能省什么 |
| --- | --- | --- | --- | --- | --- |
| **unstorage** | MIT | 2.7k | `FR-GH-4` 三级回退（0.5） | 「读缓存 → 判断陈旧 → 后台刷新」的样板。UnJS 生态，多驱动挂载，写入支持 `ttl`，读取支持 **`swr: true`** | **「哪三级、各级的陈旧阈值」**。现状 `fetchedAt`（360 分钟 TTL）与 `lastAttemptAt`（60s 节流）**刻意分离**的设计不交给它 |
| **ast-grep** | MIT | 16.1k | `FR-AIQA-5` 代码计分（0.5） | 基于 tree-sitter 的 **AST 级结构化搜索** + YAML 自定义规则。适合做候选粗筛（如「找出所有调用 `findOneAndUpdate` 的地方」） | **「路径 3 / 导出符号 2 / 摘要 1」的三档加权求和**。它是「搜索与分析引擎」而非代码索引产品——无持久化索引、无符号表、无向量检索 |
| **Trigger.dev** | Apache-2.0 | 16.5k | `FR-DIGEST-1/4`（0） | durable execution + checkpoint + human-in-the-loop，可替代 `daily-digest.service.ts`（756 行）里手写的重试/检查点脚手架 | **九步业务顺序与撤回四步**。⚠️ **第四轮已降级**：Payload Jobs Queue 已在栈内且覆盖了「顺序编排 + 从失败节点重试 + 主动中止」三点（强于 BullMQ），**再引一个队列引擎是栈膨胀** → **待 D12** |

### 两个实现的路径明确化（得分不变）

| 缺口 | 发现 |
| --- | --- |
| `FR-AGENT-5` 异常回灌 | LangGraph 有成体系的 **`RetryPolicy`**（`max_attempts` / `initial_interval` / `backoff` / `retry_on` 函数判定）。默认判定：`ConnectionError` 重试、HTTP 5xx 重试、HTTP 4xx 不重试；工具错误可配置为回喂模型。**但仅对比实现（LangGraph.js）能用**；且「回灌内容不含堆栈/凭据/内部路径」的脱敏是项目安全基线，必须自研 |
| `FR-AIQA-5` 中文分词 | **node-segment**（纯 JS，一行 npm 安装）可替代自研中文分词。**三档加权仍无解** |

---

## ③ 覆盖率结论

> **第四轮说明**：本轮是**记账修正**（第一轮把同一个包的两个部分当两项，以及漏认传递依赖），**不是能力变化**。`coverage-matrix.md` 的任何得分数字**未改动**。

| 方案 | 原始覆盖率 | 加权覆盖率 |
| --- | --- | --- |
| 丙（沿用现状全自研） | 95.2%（118.0/124） | — |
| 甲（第一轮推荐栈） | 66.1%（82.0/124） | 55.3%（136.5/247） |
| **最终栈** | **91.9%（114.0/124）** | **73.7%（182.0/247）** |

> 丙的 95.2% 是「自研实现出来的覆盖」，提供上界参照：124 条全部可实现（基线已交付），但需 208 文件 / 28,800 行自研，且批次 9 的 6 条为 0。

**得分分布校验**：1 分 108 条 + 0.5 分 12 条 + 0 分 4 条 = 108 + 6 + 0 = **114** ✅与原始合计一致

**加权分子校验**：一梯队（批次 0/1/2/7/8，69 条）68.0 × 2 + 二三梯队（55 条）46.0 = **182.0**；分母 69×2 + 55×1 = **247**

### 剩余 4 条 0 分（全部为业务编排）

| FR | 名称 | 保留自研理由 |
| --- | --- | --- |
| `FR-DIGEST-1` | 每日报道生成流程（九步不抛异常） | **R-2 顺序敏感**：九步顺序本身是正确性。任务队列只管「何时执行」不管「执行什么」 |
| `FR-DIGEST-2` | 候选筛选（黑名单 / minStars / lookback / 语言白名单） | **R-1 语义专属**：四个维度的产品口径 |
| `FR-DIGEST-4` | 撤回的固定次序（四步，名额最后释放） | **R-2 顺序敏感**：用数据库事务包裹反而**破坏**「宁可名额被占，也不留半清理数据」的设计意图 |
| `FR-GHINTRO-2` | 简介失效与内容清洗 | **R-1 语义专属**：去围栏 / 去前导字符 / 在 `。！？；` 处收尾且标点过早时退回硬截——确定性代码不可被prompt 约束替代 |

### 加权天花板约 78%

一梯队已 68.0/69（只剩 `FR-POST-3` 的 0.5，判 0.5 的理由是「存在但非本人 403 / 不存在 404」是产品决策），二三梯队 46.0/55。

**再往上必须把 8 条「产品口径」也交给框架**——那等于把产品逻辑藏进框架黑盒，与「可上线产品 + 可维护性」的定位相悖。**91.9% / 73.7% 就是这个项目在「不自研」约束下的合理落点。**

---

## ④ 自研量变化

| 项 | 现状 | 最终栈 | 变化 |
| --- | --- | --- | --- |
| 后端生产代码 | 10,266 行 | 约 5,600 行 | **−4,666 行** |
| ├ 纯 MongoDB API 调用 | 约 1,500–1,800 行 | 归零 | 换 ORM |
| ├ 向量检索 `vector-store.service.ts` | 140 行 | 归零 | pgvector |
| ├ GitHub REST client | 259 行 | 归零 | Octokit |
| ├ LLM 裸 fetch `nv-nim.client.ts` | 303 行 | 归零 | Vercel AI SDK |
| └ 代码索引构建 + 检索 | 207 + 196 行 | 归零 | ts-morph（构建）/ 自研打分（检索） |
| 后端横切 | 887 行 | 约 550 行 | −337 行（OTel + Zod 替requestId / 计时 / env 校验） |
| 前端源码 | 8,677 行 | 8,677 行 |持平（+ 文档内容层） |
| 契约包 | 3,291 行 | 约 1,700 行 | −1,591 行（类型由 Zod 4 生成，数据本体 1,669 行保留） |
| 部署与工具链 | 2,300 行 | 约 3,100 行 | +800 行（PG migration 集 + 数据迁移脚本 + pgvector 初始化） |
| **合计** | **28,800 行** | **约 21,500 行** | **−7,300 行（−25.3%）** |

> **对「省了多少行」的正确解读**：行数不是主要收益。主要收益是**不再自己承担 auth、访问控制、CRUD、迁移、种子、向量检索、缓存、额度、限流、HTTP 客户端、代码索引、评测门禁这十二类的正确性责任**。省下的 7,300 行里，真正的价值是「不再自己写」而非「少写了几千行」。
>
> **口径说明**：本表为「换库连带的自研量重估」（含纯 Mongo 代码归零）。第一轮曾给出「−3,900 行」，那是**只算技术栈替换、不含换库**的口径，已统一为−7,300 行。

---

## ⑤ 风险与阻塞 PoC

### 四个风险（3 个真风险 + 1 个已缓解）

> **⚠️ 第五轮修正**：R8 已由 D4=A 规避，**不需要现在行动**，但需写明触发条件避免遗忘。其余三个是**真风险**，本表补齐完整方案。

| # | 风险 | 失败模式 | 完整缓解方案 |
| --- | --- | --- | --- |
| **R-A** | `maxIdleTimeMS:45000` 掩盖的 **6.6s 延迟尖峰**换库后无对应解 | 尖峰复活。现状实测记录：连续请求 TTFB 严格交替 `0.49s → 6.65s`。**根因是物理链路**（容器美东 → Atlas asia 跨区 + 出网 NAT + LB 双重空闲超时），**不是连接池问题**——`maxIdleTimeMS:45000` 只是把它掩盖了 | **四层方案，见下表**。✅ **D-R1 裁定「免费」后仍可根治**（Supabase Free 支持 `us-east-1`，与 Vercel 默认 iad 同区） |
| **R-B** | `daily_picks.postId` 是 `String` 类型、**无 ref 无外键** | **两层静默失效**（第二层为本轮新识别，后果**更严重且不可事后修复**） | **五步方案，见下表**。数据库层加外键是根治手段 |
| **R-C** | `select: false` 密码哈希保护无 PG 等价物 | **静默通过**：该路径**零测试覆盖**（`common/` 887 行与全部 11 个 controller 约 1,090 行均 0 spec）→ 回归时**静默通过率 100%** | **四步重建三道闸门 + 补两条最小测试**，见下表 |
| R8 | Payload admin 绑 Next.js | 未来运营需求增长时改造代价高于现在直接引入 | ✅ **D4=A 已规避**（不引入独立 admin 运行时）。**监控条件：运营实体增长到 10+ 时**，改为「独立 Payload admin 进程 + Nuxt 前端」双进程 |

---

#### R-A 的四层方案

**关键判断：这是物理链路问题，换库解决不了它。**

| 层 | 措施 | 判定 |
| --- | --- | --- |
| **① 根因** | **PG 与应用同区部署**。已核实 `vercel.json` **无 `region` 字段** → Vercel 默认 **iad（美东弗吉尼亚）**；而现状 Atlas 在 **asia（新加坡）** → **现状本来就是跨区**，这正是 6.6s 尖峰的根源 | ✅ **根治**。Supabase Free 提供 `us-east-1`（与 iad 同区）→ **免费也能同区** |
| **② 连接池** | **连接池（必配）**。Supabase 内建 **Supavisor**（Supabase 自研，**已替代 PgBouncer**），非额外组件；自建 PG 时用 PgBouncer transaction pooling | ✅ 必配 |
| **③ 服务端** | `idle_session_timeout` + TCP keepalive | ✅ |
| **④ 应用层** | Node 端 keepAlive；连接池取到已死连接时**首次失败重试一次** | ✅ 兜底 |

> ⚠️ **必须重新实测，不能沿用现状结论**。现状的 `0.49s → 6.65s` 是 Mongo 环境下的观测值；换库后链路、驱动、连接池全变，**必须重新测量才能确认缓解是否生效**。

**免费同区方案选定（2026-10-07，D-R1 = 免费）**：

| 候选 | 区域选择 | 内建池 | 空闲挂起 | 免费额度 | 判定 |
| --- | --- | --- | --- | --- | --- |
| **Supabase Free** | ✅ `us-east-1`（与 Vercel iad 同区） | ✅ PgBouncer | 7 天无活动才暂停 | 500MB / 5GB 出网·月 | ✅ **推荐** |
| Neon Free | ✅ `us-east-1` | ✅ pooling | ⚠️ **5 分钟 idle 自动挂起** → 冷启动延迟，**对 R-A 不利** | 0.5GB | ❌ |
| 自建 PG（Docker） | ✅ 任意 | 需自建 | 无 | 完全免费 | ❌ Vercel 无持久磁盘，须第三方托管 |

**选 Supabase Free 的三个理由**：① 同区可选，使 R-A 有望免费根治 ② 内建连接池 **Supavisor**（Supabase 自研，已替代 PgBouncer），满足 ② 层要求且非额外组件 ③ 每日报道 cron（`vercel.json` 的 `0 1 * * *`）保证每天有活动，不会触发 7 天暂停。

> ⚠️ **硬约束：Supabase transaction pooling 端口 6543 不支持 prepared statement**，而 Drizzle + node-postgres 默认会使用。**遗漏此项会导致 Payload 启动或首次查询直接失败。** 处置：设置 `pg.Pool` 的 `options: '-c statement_cache_size=0'`，或改用 session pooling 端口 5432。

**注**：`DAILY_DIGEST_TIMEZONE` 默认 `Asia/Shanghai` 只影响报道发布时间（cron 在 Vercel 侧触发），**与 DB 部署区域无关**，不构成回归。

---

#### R-B 的五步方案

**代码证据**（`apps/api/src/modules/daily-digest/daily-digest.service.ts`）：

```
:330  if (pick.postId) {
:331    try {
:332      await this.postsService.remove(pick.postId, bot)
:333    } catch (error) {
:334-337  this.logger.warn(...)        // ← 第一层：只 warn，不抛，不区分 404 与 403
:338    }
:339  }
:342-347  commentsService.deleteByPost(...) / likesService.deleteByPost(...)
                                        // ← 第二层【本轮新识别】：不检查 :332 是否成功
:350  await this.pickModel.deleteOne({ date: targetDate })   // 最后才释放名额
```

**⚠️ 第二层静默失效的后果比原判断更严重**：`:342-347` 的级联删互动**无条件执行**。删帖失败时 → **帖子留存，但评论与点赞已被清空** → `commentCount` / `likeCount` **永久错误且不可事后修复**（原始互动数据已删）。

原判断只是「撤回成功但帖子还在」（数据冗余，可人工清理）；**实际是「帖子还在但互动数据永久丢失」**（数据丢失，无法恢复）。

> ⚠️ **⚠️ 第五轮修正：原方案第 1 步「直接加外键」不可行。**
>
> 索引盘点实测确认：`daily-pick.schema.ts:58-59` 的 `postId` 声明为 **`@Prop({ type: String, default: null })`**——是**弱引用字符串**（无 `ref`、无 `Types.ObjectId`、无索引），存的是 MongoDB ObjectId 的字符串形式（如 `"507f1f77bcf86cd799439011"`）。
>
> 而 PG 侧 `posts.id` 是 UUID（Payload 默认）。**两者类型与值域都不匹配，直接加 `REFERENCES` 约束会因类型不兼容而失败。** 方案必须改为「**先做类型迁移，再加约束**」两步。

| 步 | 措施 | 说明 |
| --- | --- | --- |
| **1a** | **建 ObjectId → UUID 映射表** | MongoDB ObjectId 是 12 字节（4 字节时间戳 + 5 字节随机 + 3 字节计数器），可确定性映射为 UUID。但**更稳妥的是建显式映射表**，因为 `posts.author.id` 与 `comments.author.id` 也是字符串形式（`author.schema.ts:30-31` 的 `id` 声明为 `String`），需要一致的转换规则 |
| **1b** | **迁移 `postId` 列类型** | `daily_picks.post_id` 与 `daily_pick_excludes.post_id` 从 `varchar` 改为 **`uuid`**，与 `posts.id` 同类型。**转换前必须校验**：值必须是合法的 24 位 hex，否则置 `NULL` 并记录（不能强行转换） |
| **1c** | **再加真实外键** | `daily_picks.post_id REFERENCES posts(id) ON DELETE SET NULL`。此时数据库层才能保证无孤儿引用——**应用层检查可以被遗忘，约束不能** |
| **2** | **修第一层错误处理**（`:332-337`） | 区分 **404**（帖子已不存在 → `info`，属幂等正常态）与 **403**（不属 bot → `error` + **告警**，属权限异常） |
| **3** | **修第二层前置条件**（`:342-347`） | 级联删互动**必须检查 `:332` 的成功状态**。删帖失败时**不执行级联**，直接中止并保持安全状态——**宁可名额被占，也不留下半清理的数据**（这与基线 6.2 的撤回设计意图一致） |
| **4** | **幂等语义** | 第二次撤回返回 `already-revoked` 而非失败（基线已定义该枚举，但需确保删帖 404 时走这条路径而非报错） |
| **5** | **迁移前置校验** | 校验现有 `postId` 值是否为合法 24 位 hex、对应 `posts` 行是否存在。**有孤儿则先修数据再上约束**（否则 `ADD CONSTRAINT` 直接失败） |

> ⚠️ **弱引用与强引用的分野（索引盘点实测）**：
>
> | 类别 | 字段 | 能否加 FK |
> | --- | --- | --- |
> | **强引用**（`Types.ObjectId` + `ref`） | `comments.postId` · `likes.postId` · `likes.userId` · `roadmap_progress.userId` · `interview_questions.createdBy` | ✅ 类型已匹配，可直接加 |
> | **弱引用**（`String`，无 `ref`） | `daily_picks.postId` · `daily_pick_excludes.postId` | ❌ **必须先做 1a/1b 的类型迁移** |
> | **有索引但无 `ref`** | `postembeddings.postId`（`post-embedding.schema.ts:19`） | ⚠️ 换库时**需决策**：是否补 FK，还是保持弱引用（向量表的删除时机由应用层控制更安全） |
>
> 全仓 `ref:` 仅 **5 处**命中，`refPath` / `.virtual(` / `populate(` 均 **0 命中**——不存在动态 ref 或虚拟 populate 隐藏的关联关系。

> ✅ **`:326-328` 注释说明了走 `PostsService.remove` 的理由**（权限条件内嵌在查询里，传机器人身份后物理上不可能删用户帖）——**这个设计必须保留**，不能改成直接删 posts 表。
>
> ✅ **实测确认因果链**：`posts.service.ts:327-347` 的 `remove()` 用 `findOneAndDelete({ _id, 'author.id': actor.id })` 删除，**全程不接触 `daily_picks`** → 删帖后 `daily_picks.postId` 必然成为悬挂字符串。
>
> ⚠️ **附带发现（文档腐化实例）**：`posts.service.ts:326` 的注释写「阶段 6 会在这里级联删除它的评论」，但**实际 `remove()` 内无 `commentsService.deleteByPost` 调用**（级联只在 `daily-digest.service.ts:344`）。注释已过期。

---

#### R-C 的四步方案

**代码证据：现状是三道闸门，不是一道**

| 闸门 | 位置 | 机制 |
| --- | --- | --- |
| **1 · 查询期** | `users/schemas/user.schema.ts:57` | `@Prop({ required: true, select: false })` |
| **2 · 编译期** | `users/users.mapper.ts:11-18` | `UserLean` 接口**不含** `passwordHash`。注释明言「任何试图在这个形状上读 `passwordHash` 的代码都会编译报错」 |
| **3 · 输出期** | `users/users.mapper.ts:38-47` | `toPublicUser()` 显式列出 6 个字段。注释说明「显式列出不需要记得任何事，新字段默认不发送」 |
| **受控例外** | `users/users.service.ts:65-73` | `findByEmailWithPassword` 显式 `.select('+passwordHash')`，方法名刻意带 `WithPassword`，让调用处一眼看出在取敏感字段 |

**⚠️ 上一轮文档只覆盖了第 1 道闸门。** 三道全部需要重建，且**第 2 道在 Drizzle 下的实现手法完全不同**。

| 步 | 措施 | 说明 |
| --- | --- | --- |
| **1** | **重建三道闸门** | ① 查询期——Drizzle 无 `select: false`，需用**显式 column 选择清单**代替「查全表再删字段」；② 编译期——从「接口不含字段」改为「**类型 + 显式 select 组合**」，让 `passwordHash` 只在受控类型上可见；③ 输出期——`toPublicUser()` 逐字段挑选可直接移植（这是**纯 TypeScript，与数据库无关**） |
| **2** | **专用认证查询** | `findAuthByEmail` **只 SELECT 三列**（`id` / `email` / `passwordHash`），不查全表再删字段 |
| **3** | **补两条最小测试** | 全项目可以无测试，**但这两条路径必须有**：① 按 email 查认证数据 → 结果**含** `passwordHash` ② 按 id 查公开数据 → 结果**不含** `passwordHash` |
| **4** | **约定禁止 `select *`** | 代码评审卡住。**这是三道闸门失效后的唯一兜底** |

> **为什么必须补测试**：现状这三道闸门**全部零测试覆盖**——它们能工作是因为**代码写对了**，不是因为**有东西保证它对**。一旦有人重构掉其中一道（例如「简化」`toPublicUser()`），**没有任何机制会失败**。步骤 3 是把「靠自觉」变成「靠测试」。

### PoC 重组：8 项阻塞 → 6 组执行，**真阻塞 4 项**

> **演进记录**：第二轮 8 项 → 第三轮 7 项（P20 解除）→ 第四轮 8 项（新增 P32）。
>
> **⚠️ 第五轮修正（风险与 PoC 解决方案轮）**：前四轮只增不减，**判断依据是「这项验证是否真的挡住了开工」**。本轮发现两个问题：① 有 4 项成本极低（合计 3.5 小时）且**其结果不影响任何处置代码**，算作「阻塞」是错误的 ② 有 3 项共用同一份 PG schema，拆开跑等于建三次库。
>
> **结论：8 项阻塞 → 6 组执行，真阻塞 4 项。**

| # | PoC | 关联 |
| --- | --- | --- |
| **P1** | Payload 定义 14 个集合，验证 14 个唯一索引与 4 个复合索引语义等价 | 数据模型 |
| **P2** | `trust proxy` 配置点与限流取客户端 IP 的时序 | 不可违反项；基线明确「退化成全站共用一个桶」的症状 |
| **P3** | `afterOperation` 是否等待钩子 Promise | 不可违反项 3（核心链路等待中不得含旁路调用） |
| **P7** | Vercel AI SDK 直连 OpenCode Zen 的 `https://opencode.ai/zen/v1`（`space-bunny-free`，OpenAI 兼容） | L8 落地可行性（chat 半；embed 移出见缺口 #5） |
| **P19** | Nuxt 4 + Nuxt Content 3 实机构建 31 篇文档 | `FR-DOC-1` 的端到端确认（P20 已证明「支持」，P19 证明「31 篇 + 5 组导航 + 旧链接重定向」这条链无意外） |
| **P30** | `daily_picks.postId` 的 UUID 改写 | **R-B** |
| **P31** | `select: false` 密码哈希保护在 Drizzle 下的重建 | **R-C** |
| **P32**（第四轮新增） | **Payload Jobs 的 cron 时区**——非法时区名是否退回 UTC | `FR-DIGEST-5` 的时区可配要求。**这是「BullMQ → Payload Jobs」替代方案的唯一未确认项** |
| **P33**（第五轮新增） | **Payload Jobs 的 worker 是否依赖 `LISTEN`/`NOTIFY` 或 session-level advisory lock** | `FR-DIGEST-5` · D-R1。**若依赖 → transaction pooling 不可用**，必须改用 Session pooling 或直连 |
| **P34**（第五轮新增） | **Supabase Free 能否选择 `us-east-1` 区域** | **R-A 的根治前提**。若 Free 不能选该区域，R-A 只能缓解不能根治 |
| **P35**（第五轮新增） | **`pg.Pool` 的 `options: '-c statement_cache_size=0'` 是否真能关闭 node-postgres 的 prepared statement** | 硬约束 #1。官方未列 node-postgres，此处置为机制推断，**必须实测** |

> **✅ P20 已解除**（2026-10-07）：`@nuxt/content` **3.16.1**，`dependencies` 含 `@nuxt/kit ^4.5.2`、`devDependencies` 含 `nuxt ^4.5.2`（与本项目一致），且 `peerDependencies` 不含 `nuxt`（Nuxt module 惯例）。证据链见 §⓪ 与附录 B §19。

非阻塞 PoC 另有 20 项（P4/P5/P8–P18/P21–P29），详见 [TECH-SELECTION.md](../../../TECH-SELECTION.md) 第 9 章与 11.6 节。

#### ⬇️ 第五轮修正：P30 与 P31 的内容不完整

| PoC | 文档原描述 | 问题 | 完整内容 |
| --- | --- | --- | --- |
| **P30** | 「`daily_picks.postId` 的 UUID 改写」 | ❌ **只覆盖了迁移前置校验这一步**。真正的风险是**两处静默失效**，UUID 改写只是它的第 4 步 | ① 加真实外键 `ON DELETE SET NULL` ② 修 `:332` 删帖失败的错误处理（区分 404/403） ③ **修 `:342-347` 级联删互动不检查删帖是否成功（第二层静默失效）** ④ 迁移前置校验孤儿数据（含 UUID 改写） |
| **P31** | 「`select: false` 密码哈希保护在 Drizzle 下的重建」 | ❌ **只覆盖了第 1 道闸门**。现状是**三道闸门**，且第 2 道（编译期）在 Drizzle 下实现手法完全不同 | ① 重建 `select: false` 等价机制 ② **重建编译期类型隔离**（`UserLean` 接口不含 `passwordHash` → 改为类型 + 显式 select 组合） ③ 重建 `toPublicUser()` 逐字段挑选 ④ **补两条最小测试**（全项目零测试，这两条路径必须有） |

> **这两项的描述偏差是本轮从代码证据中发现的**（第五轮执行时核实 `daily-digest.service.ts:330-350` 与 `users.mapper.ts:11-18 / 38-47`）。**「有 PoC 编号」不等于「PoC 内容完整」**——编号相同但验收范围差一倍，会让验证包漏掉一半。

### 六组执行顺序

| 组 | 原编号 | 内容 | 环境依赖 | 工作量 | 阻塞性 |
| --- | --- | --- | --- | --- | --- |
| **①** | P2 · P3 · P7 · P32 | 四个低成本的独立验证（详见下方对照表） | 无（仅 P7 需 API key） | **3.5h** | ⬇️ P3 / P32 降级为非阻塞 |
| **②** | — | 建立 PG 实例 + 确定部署区域 + 验证 R-A 缓解措施 | **需先决策** | **0.5d** | 🔴 R-A 根因前置 |
| **③** | **P1 + P30 + P31**（+ #4） | **schema 迁移验证包** | PG 实例 | **2d** | 🔴 **真阻塞** |
| **④** | P19 | 31 篇文档迁移 + 实机构建 | 无 | **1d** | 🔴 真阻塞 |

**总工期约 5 天。** 第 ① 组无任何环境依赖，**应当立即做掉**。

**🔴 真阻塞从 8 项降到 4 项**：P1 / P30 / P31（三合一）+ P7 + P19。

#### ⬇️ 两项降级的依据

| PoC | 为什么可以降级 |
| --- | --- |
| **P3** `afterOperation` | **无论答案是「等待」还是「不等待」，处置代码完全一样**：钩子内 `void` + `.catch()` 不 await，与现状 `void this.enrichWithAi(...)`（基线 4.4）一致。**答案不改变任何一行实现代码** → 不构成开工前置条件 |
| **P32** cron 时区 | 唯一影响 **D12 的选择**（A Payload Jobs 还是 C BullMQ），而 **D12 已有回退方案**，回退代价仅是栈项数 11 → 12。**不应因一个「有回退方案的验证点」卡住整个重构开工** |

#### ③ schema 迁移验证包（P1 + P30 + P31 + #4 合并）

**合并理由**：四项都需要同一个 PostgreSQL 实例。拆开跑等于建四次库、迁四次数据。

| 子项 | 验证内容 | 关联 |
| --- | --- | --- |
| **P1** | 14 个集合 + 14 个唯一索引 + 4 个复合索引语义等价；**35 个索引的显式 DDL 全部落地**（PG 无 `autoIndex`，漏一个静默失去唯一性或性能） | 数据模型 |
| **P30** | `daily_picks` 加外键 + **修两处静默失效**（见风险表 R-B） | **R-B** |
| **P31** | 密码哈希**三道闸门**重建 + 补两条最小测试 | **R-C** |
| #4 | Payload Local API 的访问控制 / 事务一致性语义 | `FR-CORE-2` · `FR-POST-3` |

---

### 八项核实缺口仍未解决

> **⚠️ 数字修正（第五轮）**：本小节原标题写「六项」但只列了 6 行，**漏了第四轮新增的 #20 / #21**。现已补齐为 8 项。

| # | 待核实 | 影响 | 关闭方式 |
| --- | --- | --- | --- |
| 1 | 精确稳定版本号（需 `npm view <pkg> version` 实测） | 锁定依赖 | 🔶 第三轮已实测 `@nuxt/content` = 3.16.1，其余 14 项待测 · **0.5h** |
| 4 | Payload Local API 的访问控制 / 事务一致性语义 | 影响 `FR-CORE-2` 与 `FR-POST-3` 正确性 | 并入 schema 验证包 · **2h** |
| 6 | Langfuse `ee/` 目录许可与所需功能归属 | `FR-AGENT-10` 可用性 | ✅ **已实测 MIT（`ee/` 除外），追踪 + 评测 + 基准均在 MIT 范围内 → 立即关闭** |
| **11** | **OpenTelemetry 的 collector 与后端选型**（Jaeger / Tempo / ClickHouse） | 自托管方案的主要工作量 | ✅ **D-R2 = A 已裁定** → Langfuse 一体，**不引 Collector**，降级为 1 个 Docker 服务 + 约 50 行应用层 sampler 代码 |
| 12 | rate-limiter-flexible 是否接受小数秒（`duration` 官方单位是秒） | `FR-CORE-5` 档位换算 | 读源码 `duration` 类型定义 + 实测 0.5s · **1h** |
| **16** | ~~35 个索引的完整 DDL 清单~~ | PG 无 `autoIndex` | ✅ **已关闭（第五轮）**：`gap-closing.md` §2.12 已产出 21 个显式索引的全量对照表 + 14 个 `_id` 主键索引 = **35 个**，含 5 处不能照搬 Mongo 语义的点与关联关系分野。剩余工作只是「按表翻译成 DDL」，属 schema 包内的机械工作 |
| **20** | **Payload Jobs 的 cron 时区**（第四轮新增） | `FR-DIGEST-5` | 源码 grep `timezone` · **1h** |
| **21** | **`req.payload.db.drizzle` 是否与 `payload.db.drizzle` 等价**（第四轮新增，官方只保证后者） | 复杂查询写法 | TypeScript 类型定义 grep · **1h** |

**汇总**：可**立即关闭 2 项**（#6 已实测、#13 已降级）· **机械可解 5 项**（#1 / #12 / #16 / #20 / #21，合计约 8 小时）· **并入 schema 包 1 项**（#4）· **决策已完成 1 项**（#11）。**净剩余待查 6 项。**

**第三轮新增 3 项待核实**（若 D12 裁定选 Trigger.dev 则 #17 变为必查）：

| # | 待核实 | 影响 |
| --- | --- | --- |
| **17** | **Trigger.dev 自托管是否需 PostgreSQL / Redis / 对象存储** | **不得断言**。README 未列自托管依赖。若它需要 Redis，则与 D10 直接冲突 |
| **18** | ast-grep 对 TypeScript 的 `exports` 与 JSDoc 抽取能力 | 只影响 `FR-AIQA-5` 的粗筛型可行性（ts-morph 已完全覆盖抽取） |
| **19** | Trigger.dev 可配置的每任务超时 / 重试次数 / 退避规则 | 只影响 D12 的选择 |

---

## ⑥ 决策裁定记录

| # | 决策点 | 裁定 | 连带影响 |
| --- | --- | --- | --- |
| **D1** | 后端基座 | **A · 接受 Payload 3** | `Better Auth` 从「备选」变为「不需要」（§2 #4） |
| **D2** | Node 22+ 升级 | **A · 接受** | 与 OTel、Nuxt Content、Vercel AI SDK 的要求一致 |
| **D3** | Nuxt Content 3 的 Nuxt 4 兼容性 | **A · 先验证再定** | **仍是唯一未解阻塞项**。P20 → P19 顺序执行 |
| **D4** | 独立后台管理运行时 | **A · 不引入** | R8 规避，触发条件：运营实体 10+ |
| **D5** | 迁移方式 | **A · 分批** | **换库必须是第一批**（后续技术全部依赖 Postgres） |
| **D6** | 路线数据本体位置 | **A · 继续放 `packages/shared`** | 1,669 行数据本体不入库（不可违反项 13） |
| **D7** | README 定位变更时机 | **A · 选型确认后立即改** | **本轮已执行**：从「全栈教学项目」改为「项目复盘」 |
| **D8** | 保留 NestJS 作为第二后端 | **否** | `NestJS` 从「降级方案」变为「明确否决」（§2 #1） |
| **D9** | 换 Postgres 的 61 个文件改动量 | **接受** | 收益与代价可比；R-A 性能风险必须先跑 PoC |
| **D10** | 是否引 Redis | **否** | Redis / Upstash Redis / ioredis 全部移入否决清单（§2 #3） |
| **D11** | 是否引 tRPC | **否** | 移入否决清单（§2 #2） |

### 第三/四轮新增的决策点

| # | 决策点 | 选项 | 倾向 | 影响 |
| --- | --- | --- | --- | --- |
| **D12** | 用哪个任务队列 | **A. Payload Jobs Queue（第四轮新增推荐）**；B. Trigger.dev；C. BullMQ（第三轮原推荐）；D. 双栈 | **A** | **第四轮前提已变**：原D12 是「BullMQ vs Trigger.dev」，但 Payload Jobs Queue 的能力核实后，**它在「顺序编排 / 从失败节点重试 / 主动中止」三点上强于 BullMQ，且不需额外服务**。倾向 A 的理由：① Payload 已在栈内，Jobs 是其内置能力，**零新增依赖** ② `Workflow` + `shouldRestore` 正是 `FR-DIGEST-1` 九步流程与 `FR-DIGEST-4` 撤回四步需要的骨架 ③ `JobCancelledError` 能在不可恢复时主动停止，**替代「不抛异常 + 安全状态」的组合写法** ④ 唯一未确认项是 cron 时区（PoC P32），而 D12 的 B 选项连自托管依赖都未核实 |
| **D13**（第四轮新增） | 是否接受 Drizzle 从「独立技术栈项」降级为「Payload 内部依赖」 | A. 接受；B. 保持独立 | **A** | Payload 的 `@payloadcms/db-postgres` **本身就基于 Drizzle ORM**，且公开 `payload.db.drizzle` 与 `sql` 模板，**引入 Payload 即等于引入 Drizzle**。保持「独立」只是重复记账。⚠️ 但 **DDL 迁移工具（`drizzle-kit`）仍需独立引入**（解决 PG 无 `autoIndex` 的 35 个索引） |

> ⚠️ **D12 若选 B，必须先查清核实缺口 #17**（Trigger.dev 自托管是否需 PostgreSQL / Redis / 对象存储）。**不得凭 README 未列就断言它不需要。**
>
> ⚠️ **D12 若选 A 且 PoC P32 失败**（cron 时区不可配），回退到 **C（BullMQ）**，栈项数回到 12 项。

---

## ⑦ 交接给重构实施阶段的入口

| 需要什么 | 去哪看 |
| --- | --- |
| 124 条 FR 的逐条覆盖情况与得分 | [coverage-matrix.md](coverage-matrix.md)（附录 A） |
| 27 个候选的许可证 / 版本 / 维护状态核实笔记 | [candidate-notes.md](candidate-notes.md)（附录 B） |
| 53 条缺口的逐条补配对照与判自研理由 | [gap-closing.md](gap-closing.md)（附录 C） |
| 选型方法论、12 层收敛链、被否决方案与硬约束核对 | [TECH-SELECTION.md](../../../TECH-SELECTION.md)（主报告，12 章） |
| 现状功能基线（124 条 FR 的来源） | [FUNCTIONALITY.md](../../../FUNCTIONALITY.md)（冻结） |
| 重构需求基线（11 个批次） | [REFRACTOR-SPEC.md](../../../REFRACTOR-SPEC.md)（冻结） |

**下一步不是写代码，而是跑 6 组 PoC（真阻塞 4 项）。** 其中**第 ① 组 4 项（P2 / P3 / P7 / P32）无任何环境依赖、合计 3.5 小时，应立即做掉**；真阻塞的是第 ③ 组 schema 迁移验证包（P1 + P30 + P31 + 缺口 #4）与第 ④ 组 31 篇文档构建。P20 已于第三轮解除。
