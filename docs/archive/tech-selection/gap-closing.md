# 附录 C · 缺口补全对照表（53 条）

> **✅ 2026-10-07：53 条缺口的归属结论已全部裁定。** 其中 41 条通用能力配现成方案，12 条业务编排保留自研。单页清单见 [`final-stack.md`](final-stack.md)。
>
> 裁定后移除 3 个候选：**tRPC**（D11）、**Redis 全家**（D10）、**Better Auth**（D1=A 连带——Payload auth 已覆盖，避免双认证实现并存）。
>
> **第三轮 GitHub 实证调研已完成**：6 组缺口补写了「已检索哪些候选 + 为何不适用」的实证段（见 §2 各小节的 **GitHub 实证** 块）。**结论：53 条的归属全部维持不变**——但阻塞项 P20 已解除，且新否决 2 个许可陷阱（Windmill / n8n）。
>
> **第四轮栈项收敛已完成**：**15 项技术栈 → 11 项**。受影响的两条缺口：
> - **`FR-DIGEST-1/4/5`（0 / 0 / 1 分，得分不变）**：**Payload Jobs Queue 替代 BullMQ**。`Workflow`（顺序编排）+ `retries.shouldRestore`（从失败节点重试）+ `JobCancelledError`（主动中止）+ `concurrency`（并发互斥）替代 `daily-digest.service.ts`（756 行）里手写的脚手架。**得分不变**——九步业务顺序与撤回四步仍必须自研。⚠️ cron 时区未确认 → PoC P32
> - **`FR-DOC-3`（1 分，不变）**：核实了 Nuxt Content `useSearchCollection`（SQLite FTS5）**无法替代 Meilisearch**——文档未承诺中文分词、无 tokenizer 配置入口、且仅支持客户端。**Meilisearch 保留**。
>
> **另有一项结构发现影响多条缺口的承接方写法**：**Drizzle 是 Payload 的传递依赖**（`@payloadcms/db-postgres` 基于 Drizzle ORM，公开 `payload.db.drizzle`）。因此 `FR-SEARCH-*`、`FR-INTERVIEW-3`、`FR-PROGRESS-3`、`FR-POST-5` 的承接方表述从「Drizzle ORM + Drizzle Kit」改为「**`payload.db.drizzle`**」，**得分全部不变**。

> **这份文档是什么**
> 把第一轮覆盖矩阵中得分 < 1 的 **53 条 FR**（23 条 0 分 + 30 条 0.5 分）逐条对照：缺口是什么 → 补配什么现成方案 → 目标得分 → 承接方 → 如何验证。可逐条勾选验收。
>
> **判定纪律**：每条结论都过「复用优先」闸门——先穷举成熟方案，确认无适配后才判自研。**判自研的必须写出「已检索过哪些方案、因什么不适用」**，杜绝「没调研就自研」。

---

## 0. 判定方法

### 0.1 两类缺口的分界线

| 类别 | 判定标准 | 处理 |
| --- | --- | --- |
| **通用能力** | 任何同类项目都会需要的基础设施 | 必须配现成方案，目标得分 1 |
| **业务编排** | 本产品的差异化逻辑 | 保留自研，写明理由 |

### 0.2 判自研的三条充分理由（满足任一即判自研）

| 理由 | 含义 | 典型案例 |
| --- | --- | --- |
| **R-1 语义专属** | 规则本身是产品决策，换成通用抽象会丢失产品语义 | 语言候选列表「基于筛选前全量」 |
| **R-2 顺序敏感** | 顺序本身是正确性的一部分，框架无法表达 | 撤回四步「名额释放必须最后」 |
| **R-3 抽象不匹配** | 现成方案的抽象粒度与需求粒度不符 | Meilisearch `rankingRules` 只能字段排序，无法表达三档加权求和 |

---

## 1. 通用能力补配（41 条）

### 1.1 可观测性（2 条，原 0 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-CORE-3` | 请求标识全链路传播（现状 112 行自研：中间件 55 + 拦截器 57） | **OpenTelemetry JS**（Apache-2.0，3.5k star，3,573 commits，稳定包 2.0.x） | **1** | `@opentelemetry/instrumentation-http` + `@opentelemetry/sdk-node` 自动生成并传播 W3C trace context；`api` 的 `ApiSuccessBody.requestId` 字段改读 traceId。**PoC：响应体 `requestId` 与响应头 `X-Request-Id`、OTel span 的 traceId 三者一致** |
| `FR-CORE-4` | 分段计时 + 慢请求日志（现状 169 行：timing 27 + with-timing 71 + slow-request 71） | **OpenTelemetry JS**（同一套） | **1** | `tracer.startSpan('posts.findAll.db')` 替代 `withTiming(name, fn)`；采样器按 span 时长配置 1000ms 告警 / 3000ms 错误。**PoC：慢请求 span 出现在链路视图，且 span 属性中不含 body/header/token** |

**已检索但不适用的方案**：

| 方案 | 不适用原因 |
| --- | --- |
| Sentry SaaS | 用户已明确排除（SaaS 数据出境 + 与「日志不写敏感数据」需额外审视） |
| Langfuse 顶替 | Langfuse 只覆盖 LLM 追踪（trace / eval / dataset / benchmark），**不覆盖 HTTP 全链路、慢请求与分段计时** |
| `pino` + `pino-http` | 只解决结构化日志，**无分布式 trace 传播**，无法跨服务串联 requestId（现状是单容器三进程，`entrypoint.mjs` 需按进程分隔日志） |

**⚠️ 已知限制（必须写入 PoC）**：OpenTelemetry JS 的 **Logs 信号仍是 Development 状态**（Tracing / Metrics 为 Stable）。因此「401 / 404 完全不记日志」「访问日志按状态码分级」这两条现状纪律**仍需保留自研的日志分级逻辑**，OTel 只承担 trace 与 span 计时。目标得分从「0」提升到「1」的前提是**分级判定在 span 属性层面实现**，而非依赖 OTel 的日志管道。

---

### 1.2 GitHub 上游客户端（3 条，原 0 分 / 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-GH-1` | 热门榜查询与缓存（现状自研 GitHub client 259 行：ETag / 限流 / 树截断） | **Octokit**（MIT，7.9k star，473 commits） | **1** | 内置 `@octokit/plugin-throttling`（`onRateLimit` / `onSecondaryRateLimit`，**支持 Redis 集群**）、`@octokit/plugin-retry`、`@octokit/plugin-paginate-rest`；`userAgent` 构造选项对应现状「必须带 UA 否则 403」。**PoC：Search API 10 次/分钟未认证配额下不被打爆** |
| `FR-GH-2` | 刷新节流与陈旧标记（现状 `findOneAndUpdate` 原子抢占 60s 名额） | **Octokit throttle** + **PG 原子占位** | **1** | Octokit 管上游配额，PG `INSERT ... ON CONFLICT` 管本地抢占名额。**PoC：10 并发请求只 1 个打到上游** |
| `FR-GH-5` | 上游失败降级（403 提示限流、README 失败返回 `null`） | **Octokit `RequestError`**（带 `error.status` / `error.response`） | **1** | `RequestError` 统一错误形态 → 映射层把 403 转「很可能是触发了 Search API 限流」。**PoC：403 响应文案与现状一致** |

**Octokit 不覆盖的部分（需保留自研）**：

| 事项 | 原因 |
| --- | --- |
| `git/trees` 响应截断处理 | 现状 `scripts/scan-learning-materials.mjs` 已处理 `truncated` 字段，Octokit 不提供业务级处理 |
| 三级回退（榜单缓存→快照→上游） | 见 1.6，属业务编排 |
| 不打印完整响应体的日志纪律 | 属项目安全基线 |

---

### 1.3 缓存、额度与限流（6 条，原 0 分 / 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-AIQA-2` | 问答缓存（7 天 TTL + 读取时手动判过期） | **lru-cache v11**（**BlueOak-1.0.0**，5.9k star）+ 落库表 | **1** | 进程内毫秒 TTL（`ttl` 单位毫秒，与现状一致）+ 7 天持久表。**PoC：7 天后命中判为失效、重复调用不耗额度** |
| `FR-ASK-3` | 缓存键空间隔离（现状 `posts|` 前缀） | **lru-cache `namespace`** | **1** | `namespace` 选项替代手工前缀。**PoC：问答缓存与站内检索缓存不互相覆盖** |
| `FR-AIQA-3` | 每日额度（现状落库「先读再增」，注释明确承认并发下可能略超限） | **rate-limiter-flexible**（**ISC**，3.6k star，911 commits）+ **PG `INSERT ... ON CONFLICT DO UPDATE` 原子累加** | **1** | 原子累加**消除现状的并发超限**——这是换库带来的实质改进，不是等价替换。**PoC：并发 50 次消耗只放行 300 次** |
| `FR-CORE-5` | 限流按路由粒度（默认 30/min，**毫秒单位**） | **rate-limiter-flexible** + 框架自带 rate limit | **1** | ⚠️ **已核实：该库的 `duration` 单位是秒，不是毫秒**。现状 `@Throttle({ttl: 60_000})` 需换算或改用框架原生毫秒配置。**PoC：14 处档位逐路由生效，热门榜单可豁免** |
| `FR-GH-2`（原子占位） | 见 1.2 | PG 原子占位 | **1** | — |
| `FR-DIGEST-5` | 触发方式与时间闸门 | **BullMQ**（MIT，9.5k star） | **1** | **已核实：BullMQ 新版支持 Redis 或 PostgreSQL 后端** → 换 Postgres 后**不需额外 Redis 服务**；支持 Repeatable jobs / Cron 风格调度 / Debouncing & Throttling 去重 / `attempts` + `backoff` 重试。**PoC：Cron 路径不受 `canPublishNow` 闸门约束，访客路径受约束** |

**已检索但不适用的方案**：

| 方案 | 不适用原因 |
| --- | --- |
| `rate-limiter-flexible` 作额度主方案 | 它的 `duration` 是**秒**级粒度，与现状毫秒级 `ttl` 语义冲突；且每日额度是「每日重置 + 软上限」，不是滑动窗口。**结论：限流用它，每日额度用 PG 原子累加** |
| Upstash Redis | 需引入外部服务（托管）或额外部署（自托管）。换 Postgres 后 BullMQ 已支持 PG 后端，**再引 Redis 是重复的运维面** |
| Redis / ioredis 作答案缓存 | 同上。现状缓存是「7 天 + 落库 + 手动判过期」，落库已在 PG 内，无需再引一层 |

---

### 1.4 代码索引与检索（2 条，原 0 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-AIQA-4` | 代码索引构建（现状 `scripts/generate-code-index.mjs` 196 行 + `code-index.service.ts` 207 行：构建期扫三处源码、提 exports 与文件头注释、多路径探测、启动预热、加载失败永不抛） | **ts-morph**（MIT，6.2k star） | **1** | `getExportedDeclarations()` 抽导出符号、`getJsDocs().getDescription()` 抽文件头注释——**与现状的抽取规则一一对应**。「加载失败永不抛」「多路径探测」「启动预热」三条属工程约束，保留自研（薄）。**PoC：索引内容与现状 `dist/code-index.json` 逐条一致** |
| `FR-AIQA-5` | 代码检索计分（中文 2 字滑窗分词 + 路径 3 / 导出 2 / 摘要 1 加权求和） | **部分自研** | **0.5** | 见下 |

**`FR-AIQA-5` 判 0.5 的理由（R-3 抽象不匹配）**：

已核实 **Meilisearch 的 `rankingRules` 只能表达 `attribute:asc` / `attribute:desc` 字段排序，无法表达三档加权求和**（如「路径命中 ×3 + 导出命中 ×2 + 摘要命中 ×1」）。中文 2 字滑窗分词也无现成实现。

结论：分词与计分保留自研，**但可复用 Meilisearch 做候选集的粗筛**（减少进入自研打分的条目数），或直接用 PG `tsvector` 全文粗筛 + 自研精排。

---

### 1.5 向量检索全套（7 条，原 0 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-SEARCH-1` | 向量生成与同步（title→summary→content 拼接、2000 字截断、L2 归一化、零向量不 NaN） | **pgvector**（PostgreSQL License，23.3k star，v0.8.7，Postgres 13+） | **1** | 拼接与归一化保留自研（`l2Normalize` 与 DB 无关，现状 `backfill-embeddings.mjs:58-63` 已有）；**`vector(1024)` 列 + HNSW 索引替代存储**。⚠️ **维度需在 DDL 固定**，换 embedding 模型（3072 维）需 DDL 变更。**PoC：`model` 列作混库防线，检索时过滤掉非当前模型的向量** |
| `FR-SEARCH-2` | 内存向量库（现状 140 行：全量 Map + 写端覆盖表含 `null` 墓碑 + 5min TTL + 混库防线 + 维度检查） | **pgvector HNSW** | **1** | **一次替代四样**：内存 Map（→ 索引扫描）、写端覆盖表（→ 事务保证，墓碑概念消失）、5min TTL（→ 不需要，索引实时）、维度检查（→ `vector_dims()`）。**PoC：删除向量后立即检索不到，无需等缓存过期** |
| `FR-SEARCH-3` | 语义检索降级原因（三态 `not-configured` / `error` / `index-empty`） | pgvector 就绪探测 | **1** | 三态 reason 的表达是薄适配。**PoC：向量库为空时返回 `index-empty` 而非报错；孤儿向量在检索时自愈剔除** |
| `FR-SEARCH-4` | 检索就绪状态自检 | pgvector（查 `pg_extension` 与 `count(*)`） | **1** | **PoC：索引加载失败时就绪标记为否，接口仍正常返回** |
| `FR-ASK-1` | 问全书短路与编号一致性 | pgvector + 自研收尾 | **0.5** | 检索现成；**「检索为空即短路、一字不问模型」是产品纪律**（`FUNCTIONALITY.md` 6.7），保留自研 |
| `FR-ASK-2` | 来源解析与展示 | pgvector + 自研收尾 | **0.5** | **「`used` 过滤保证 prompt 编号与 sources 同序」是产品约定**，保留自研 |
| `FR-ASK-3` | 缓存键空间隔离 | lru-cache `namespace` | **1** | 见 1.3 |

**已检索但不适用的方案**：

| 方案 | 不适用原因 |
| --- | --- |
| LanceDB（嵌入式，Apache-2.0） | 换 Postgres 后 pgvector 已在库内，**再引一个嵌入式库是重复的数据层** |
| Qdrant / Weaviate（独立服务） | **外部服务 = 新增运维面**，与「减少自研」初衷相反；且混库防线 / 墓碑 / 孤儿自愈仍需应用层实现 |
| MongoDB Atlas Vector Search | 需 Atlas M10+ 付费，取消 M0 免费额度；换 Postgres 后无此必要 |
| 保留自研内存点积（第一轮方案） | 换 Postgres 后 pgvector 是更成熟的等价物，且取消墓碑/TTL 两处易错设计 |

> **⚠️ 换库代价提示**：第一轮曾论证「千级向量 × 1024 维内存点积是毫秒级，不值得引外部依赖」。换 Postgres 后该论证**依然成立**——但 pgvector 不是「外部依赖」，它就在数据库内。**净收益是取消 140 行高风险代码（墓碑 + TTL + 混库防线三套语义），代价是数据迁移与连接池重调。**

---

### 1.6 聚合查询与统计（3 条，原 0 分 / 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-INTERVIEW-3` | 统计聚合（现状 `aggregate $group` + `$push` + `estimatedDocumentCount`，求各节点题量与加权最高频率 `FREQUENCY_WEIGHT = {high:3, medium:2, low:1}`） | **PG `GROUP BY` + `SUM(CASE WHEN ...)`** | **1** | 换库后从「Mongo 聚合管道 + 内存归约」变为单条 SQL。⚠️ `estimatedDocumentCount()` 无 PG 对应（会真扫表），但题量小（29→可能 60 道）影响可忽略。**PoC：一次查询返回各节点题量与最高频率，题库为空时返回空数组而非报错** |
| `FR-PROGRESS-3` | 云端进度的幂等接口（现状 `findOneAndUpdate` + `$set: {'steps.<courseId>': …}` + `upsert`） | **PG `jsonb_set` + `ON CONFLICT DO UPDATE`** | **1** | 「设为目标状态」语义天然幂等。⚠️ `courseId` 来自用户输入（经 `isKnownCourseId` 白名单），**必须保留白名单**防止 jsonb 路径被特殊字符污染。**PoC：重复 PUT 同一节点不漂移** |
| `FR-INTERVIEW-2` | 列表过滤与关键词转义（现状 `escapeRegex` + `$regex` + `$options:'i'`） | **PG `ILIKE` + `pg_trgm` GIN 索引** | **1** | ⚠️ **前导通配符无法用 B-tree**，必须 `pg_trgm`。转义逻辑从转义正则元字符改为转义 `%` `_`。**PoC：搜「C++」这类词不再报错或误匹配** |

---

### 1.7 契约、校验与包络（9 条，原 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-CORE-6` | 环境变量 fail fast / 增强项降级（现状 `env.validation.ts` 485 行 + `config-values.ts` 72 行，class-validator DTO 式） | **Zod 4**（MIT，44.1k star） | **1** | `z.coerce.number()` 直接处理 env 字符串、`safeParse` 区分 fail fast 与可选。⚠️ **「0 是有效值」需用 `z.coerce.number().min(0)` 而非 `.positive()`**（现状 `nonNegativeSetting` 专门处理这一点）；「两 JWT 密钥相同则启动失败」用 `refine`。**PoC：缺 `MONGODB_URI` 启动失败；缺 `NVNIM_API_KEY` 启动成功** |
| `FR-CORE-1` | 统一响应包络（`ApiSuccessBody`，排除 `/health` `/docs`） | Zod 4 schema + 框架 hook | **1** | 包络本身是 schema 定义 + 序列化。**PoC：204 时 `data` 收敛为 `null`；健康检查不被包裹；解包入口对豁免端点原样返回** |
| `FR-CORE-2` | 统一错误包络（`ApiErrorBody`，校验明细进 `details`，堆栈只进日志） | **Zod 4 issue → `details`** | **1** | Zod 的 issue 数组天然是「逐条违规明细」。**PoC：参数校验失败时 `details` 逐条列出；响应体无堆栈** |
| `FR-CONTRACT-1` | 数值约束单一来源 | Zod 4 作为唯一来源 | **1** | 前端表单与后端 DTO 共用同一 schema。**PoC：改动任一边界后前端无需单独修改即跟随** |
| `FR-CONTRACT-2` | 契约包只承载契约 | Zod 4 生成类型 | **1** | — |
| `FR-CONTRACT-3` | 路线数据与派生算法一致（`roadmap-data.ts` 884 行 + `computeRoadmapProgress` 等纯函数） | 类型由 Zod 4 / Payload 生成；**纯函数与数据本体保留 shared** | **1** | **数据本体 1,669 行（roadmap-data 884 + learning-materials 461 + interview-bank 324）是产品内容，任何方案都不可替换**。**PoC：后端返回的进度与前端本地计算在相同输入下完全相等** |
| `FR-CONTRACT-4` | 展示类常量前后端同算法（6 个头像渐变、32 种语言色、标签映射） | 纯函数保留 shared | **1** | **PoC：同一用户名在前后端得到相同颜色；同一仓库在榜单页与详情页得到相同标签集合** |
| `FR-POST-2` | 发帖时未知字段必须 400（现状 `forbidNonWhitelisted`） | **Zod 4 `.strict()`** | **1** | **PoC：请求体含 `authorId` 时返回 400** |
| `FR-PAGE-LOGIN-2` | 前端校验与错误分层展示 | Zod 4 与后端共用 schema | **1** | — |

**Zod 4 的关键优势（已核实）**：实现 **Standard Schema V1** 接口，可直接供 tRPC、Vercel AI SDK、Nuxt Content 等消费——这使它成为统一栈的校验层首选，而不是又一个独立依赖。

---

### 1.8 鉴权（4 条，原 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-AUTH-3` | 双令牌与刷新轮换（不同密钥 + `type:'refresh'` + `jti` + 同秒两次必不同） | **Better Auth**（MIT，30.2k star，7,668 commits，framework-agnostic TS） | **1** | session rotation 内置。**PoC：用访问令牌调用刷新接口返回 401；同一秒内连续两次签发的刷新令牌不相同** |
| `FR-AUTH-4` | 刷新令牌 Cookie 属性（httpOnly / sameSite 可配 / secure / **path 限定 `/api/auth`**） | Better Auth 部分覆盖 | **0.5** | **判 0.5 的理由**：`httpOnly` / `sameSite` / `secure` 可配，但 **Cookie path 限定在认证前缀下（最小暴露面）**需薄自研。**PoC：Cookie 路径不覆盖其他路由** |
| `FR-AUTH-5` | 登出与当前用户读取（**logout 不校验 token 有效性**） | Better Auth 内置 | **1** | **PoC：过期令牌也能登出** |
| `FR-USER-1` | 用户字段与唯一性（`select:false` 密码哈希 + 邮箱唯一 + 小写归一化） | Drizzle schema + PG 唯一约束 | **1** | ⚠️ **PG 无 `select: false` 等价物**，需显式重建（现状是「schema `select:false` + `users.mapper.ts` 逐字段挑选」双保险）；**邮箱小写归一化需 `citext` 扩展或 `UNIQUE ON lower(btrim(email))`**。**PoC：密码哈希不出现在默认查询结果中** |

**已检索但不适用的方案**：

| 方案 | 不适用原因 |
| --- | --- |
| Auth.js / NextAuth | 深度绑定 Next.js，与 Nuxt 前端不适配（第一轮已否决 Next.js 化的核心理由） |
| 在 Payload 与 Better Auth 之间二选一 | **不建议同时引入**。双认证实现并存是双 Token 轮换语义冲突的高风险点。**建议：若选 Payload 基座则用 Payload auth（不引 Better Auth）；仅当弃用 Payload 时才启用 Better Auth** |

---

### 1.9 调度与任务（1 条，原 0.5 分）

见 1.3 的 `FR-DIGEST-5`（BullMQ）。

**已检索但不适用的方案**：

| 方案 | 不适用原因 |
| --- | --- |
| Inngest | 托管 SaaS 为主，用户已排除第三方 SaaS；自托管版引入额外服务 |
| Payload 自带 jobs | Payload 有 cron，但**换库到 Drizzle 后 Payload 的 jobs 优势减弱**；且 BullMQ 支持 PG 后端，不引 Redis |

---

### 1.10 CRUD 与集合操作（5 条，原 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-POST-4` | 删除与级联清理 | **PG `ON DELETE CASCADE`** + 框架 hook | **1** | **PoC：删帖后该帖向量数据被移除；权限条件写在删除条件内，不存在「先查后删」的中间态** |
| `FR-POST-5` | 互动计数维护（现状 Mongoose `updatePipeline: true` + `$max([0,$add])` 防负数） | **`GREATEST(0, col + delta)`** | **1** | **比现状更直白**：一条 `UPDATE ... RETURNING` 即可，不需要聚合管道开关。**PoC：重复扣减不产生负值；计数下限为 0** |
| `FR-CMT-3` | 评论删除与系统级清理（不调整计数） | PG 级联 / `deleteMany` | **1** | **PoC：系统级清理可按帖子批量删除评论，且不调整评论数** |
| `FR-LIKE-1` | 点赞幂等（现状捕获 11000 当成功幂等且不重复计数） | **PG 唯一约束 + `ON CONFLICT DO NOTHING RETURNING`** | **1** | **比现状更直接**：不依赖错误码翻译，数据库直接告诉「是否插入」。**PoC：并发重复点赞只导致一次计数递增；重复点赞时点赞数不再增加** |
| `FR-LIKE-2` | 取消点赞幂等（本来没赞过也返回成功） | `DELETE ... RETURNING` 行数判断 | **1** | **PoC：对本来未赞过的帖子取消点赞返回成功，点赞数不再减少** |
| `FR-POST-3` | 403 / 404 区分 | 存在性检查 | **0.5** | **判 0.5 的理由**：「帖子存在但不属于自己返 403 而非 404」是**产品决策**（基线 6.11），框架的 access control 倾向统一拒绝。保留现状那一次刻意付出的 `exists()` 查询。**PoC：越权更新返回 403 且响应体不含帖子内容；不存在的返回 404** |

---

### 1.11 健康检查与内容渲染（2 条，原 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-HEALTH-1` | 健康检查反映依赖可达性（现状 Terminus + `pingCheck`，61 行） | 框架自带健康指示器 | **1** | **PoC：数据库不可达时返回 503 而不是 200；探测超时上限 5000ms** |
| `FR-HEALTH-2` | 可被编排系统判定 | 同上 | **1** | **PoC：不需要凭据即可访问；不写业务数据** |
| `FR-DOC-1` | 文档内容与路由（31 篇） | **Nuxt Content v3**（MIT，3.7k star） | **0.5** | ⚠️ **Nuxt 4 兼容性仍未确认（阻塞项）**。已核实：可用 **Node 22.5.0+ 原生 SQLite**（`experimental.sqliteConnector`），无需 `better-sqlite3` 原生编译。**PoC：31 篇全部可达且 SSR 首屏含正文** |
| `FR-DOC-2` | 导航结构与上下页 | Nuxt Content + 自研导航 | **0.5** | 5 组侧栏分组 + 上下页需移植 `.vitepress/config.ts` 194 行的结构，属项目特定 |

---

### 1.12 Agent 收尾（3 条，原 0.5 分）

| FR | 缺口 | 补配技术 | 目标 | 承接方与验证 |
| --- | --- | --- | --- | --- |
| `FR-AGENT-3` | 工具集的数据边界（4 个只读工具 + 不绕过可见性规则） | 自研 | **0.5** | 保留自研。**技术手段（读帖子/读用户/读路线节点）现成，但「不返回邮箱」「不返回未发布内容」「工具数量固定为 4」是产品边界** |
| `FR-AGENT-4` | 循环轮次上限与收敛 | `ToolLoopAgent` 步数上限 + 自研收尾 | **0.5** | SDK 提供上限；**「超限收敛为信息不足并列已调用工具与尚未解决的问题」是产品收尾逻辑** |
| `FR-AGENT-5` | 工具异常回灌 | SDK 能力待 PoC + 自研脱敏 | **0.5** | **「回灌内容不含堆栈、凭据与内部文件路径」是项目安全基线**（对应不可违反项 7、8），必须自研 |
| `FR-AGENT-6` | 超时与取消 | `AbortSignal`（SDK 原生） | **1** | **PoC：客户端断开时中止上游请求；取消的请求不消耗每日额度** |
| `FR-AGENT-7` | 输出结构化收敛 | `Output.object` + Zod 4 逐轮收窄 | **1** | **「引用来源必须对应实际工具返回」仍需自研校验**（不可违反项 11）。**PoC：重试时收窄约束而非放宽；重试耗尽时降级为纯文本并标记未通过结构校验** |

---

## 2. 业务编排保留自研（12 条）

以下条目**判为保留自研**。每条都列出「已检索过哪些现成方案、因什么不适用」。

### 2.1 `FR-DIGEST-1` 每日报道生成流程（0 分）

**内容**：九步不抛异常流程（开关检查 → 当日已发检查 → 候选挑选 → 占位写入 → 抓 README → 内容生成 → 模板兜底 → 发帖 → 回填关联），返回 `published | already-published | no-candidate | disabled | failed` 五态。现状 756 行。

**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 许可证 | 关键能力 | 为何不适用 |
| --- | --- | --- | --- |
| **Trigger.dev** | Apache-2.0，16.5k star | TypeScript-first，自托管（Docker Compose + Helm），durable execution、自动重试、幂等性、检查点、human-in-the-loop | **只提供运行时骨架，不表达业务顺序**。九步流程（尤其「占位写入必须在发帖之前」）仍需自研。⚠️ 自托管是否需 PG/Redis **未核实** |
| **Temporal** | MIT | durable execution 崩溃后续跑，Web UI 开源 | **需独立服务集群**（Temporal Server + DB），与 D10「不引额外服务」冲突；主生态是 Java/Go |
| **Windmill** | **AGPL-3.0** + Apache-2.0 混合 | 「Retool 与 Temporal 的开源替代」，多语言脚本，DAG 工作流 | ❌ **否决**。LICENSE 原文「**限制未经协议进行 modify 或 wrap**」「禁止出售、转售、作为托管服务提供、修改或包装」 |
| **n8n** | fair-code（非OSI 开源） | 可视化 + 代码双模工作流、1000+ 集成 | ❌ **否决**。官方条款明确禁止「**bundling it into something you sell**」——本项目是「可上线产品」 |
| BullMQ（已选） | MIT，9.5k star | Repeatable jobs / Cron / Debouncing / Throttling 去重 / attempts+backoff | 任务队列只管「何时执行」，不管「执行什么」 |
| Airflow / Dagster | — | 数据管道 DAG | 粒度是「任务 DAG」而非「单次发布的九步事务」，且引入 Python |
| 现成 CMS 的定时发布 | — | 内容发布 | 内容模型不匹配（需候选池筛选 + AI 生成 + 标签映射 + 双表台账） |
| `ai-daily-digest` / `news-bot` | — | 抓源 + AI 筛选 + 定时发布 | **流程参考型应用层项目，非可复用组件**。它们证明这条路走得通，但代码是特定用途脚本集合，无法作为库引入 |

**结论**：无现成方案。**保留自研，理由编号 R-2（顺序敏感）。** 九步顺序本身就是正确性。基线 6.12 明确「占位写入依赖唯一键，并发执行时重复者安全退出」——这是业务规则不是技术机制。

### 2.2 `FR-DIGEST-2` 候选筛选（0 分）

**内容**：并行查 `daily_picks` + `daily_pick_excludes` 建黑名单 → 过滤 `minStars` / `createdAt` lookback / 语言白名单（空 = 不限）。

**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 为何不适用 |
| --- | --- |
| Trigger.dev / Temporal / Windmill / n8n / BullMQ | 全部是**执行引擎**，不提供「候选筛选规则」。四个维度的口径（星标下限、创建时间回溯窗口、语言白名单、黑名单）必须由本项目定义 |
| 推荐系统类项目（recsys / bandit） | 目标是「点击率最大化」，本项目是「每天挑 1 个仓库」的单次选择，**无训练、无反馈回路、无排序目标** |
| `ai-daily-digest` / `news-bot` | 流程参考型应用层项目，其筛选规则与本项目的四个维度不同（它们按 arXiv 分类而非 GitHub star/时间/语言） |

**结论**：无现成方案。**保留自研，理由编号 R-1（语义专属）。** 特别地，「星标下限配置为 0 时按 0 生效，不被替换为默认值」这类细节（现状 `nonNegativeSetting` 专门处理）是产品决策。

### 2.3 `FR-DIGEST-4` 撤回的固定次序（0 分）

**内容**：严格四步——① upsert 排除表 ② 删帖（权限内嵌，不可能删用户帖） ③ 删评论与点赞 ④ **最后才释放名额**。中途失败停在安全状态。

**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 为何不适用 |
| --- | --- |
| **数据库事务** | **这是四步而非一步。若用事务包裹，「名额释放」与「删帖」变成原子，反而破坏了「宁可名额被占，也不留下半清理的数据」的设计意图**（基线 6.12 明确此意图）。这是本条最容易被误判为「用事务就行」的地方 |
| Trigger.dev（durable execution + checkpoint） | 能保证「失败后从断点续跑」，但**不表达「停在哪一步」**。本条要求的是「中途失败停在安全状态」——即失败时主动**不**继续，而非自动恢复 |
| BullMQ（已选） | `attempts` + `backoff` 的自动重试与本条要求**方向相反**。九步流程已设计为幂等（11000 当并发安全退出），重试安全；但撤回四步的重试会重复执行「释放名额」，需自研控制 |
| Windmill / n8n | 编排引擎只管执行顺序，不表达「最后一步必须成功才继续」 |
| Temporal（saga / 补偿） | saga 编排能力有余，但这条流程只有 4 步且需要「精确控制失败后停在哪一步」，用 saga 表达反而更绕 |

**结论**：无现成方案。**保留自研，理由编号 R-2（顺序敏感）。** 不可违反项与基线 6.12 都把这条顺序列为「破坏后症状隐蔽」的高风险项。它是安全设计，不是技术编排。

#### 2.3.1 ⚠️ 第五轮新识别：第二层静默失效（本条的风险面比原判断更大）

代码实测（`apps/api/src/modules/daily-digest/daily-digest.service.ts`）：

```
:330  if (pick.postId) {
:331    try {
:332      await this.postsService.remove(pick.postId, bot)
:333    } catch (error) {
:334-337  this.logger.warn(...)      // ← 第一层：只 warn，不抛，不区分 404 与 403
:338    }
:339  }
:342-347  commentsService.deleteByPost(...) / likesService.deleteByPost(...)
                                      // ← 第二层：不检查 :332 是否成功
:350  await this.pickModel.deleteOne({ date: targetDate })   // 最后才释放名额
```

**第一层**：删帖 404（帖子已不存在）只 `logger.warn` 不抛 → 表现为「撤回成功但帖子还在」。

**第二层（本轮新识别）**：`:342-347` 的级联删互动**无条件执行**，不检查 `:332` 是否成功 → **删帖失败时帖子留存，但评论与点赞已被清空**，`commentCount` / `likeCount` **永久错误且不可事后修复**。

> **原判断 vs 实际**：原判断是「数据冗余」（帖子还在，可人工清理）；**实际是「数据丢失」**（互动数据已删且无法恢复）。**这改变了风险等级**——从「需要人工清理」升级为「需要数据恢复」。

**实测确认因果链**：`posts.service.ts:327-347` 的 `remove()` 用 `findOneAndDelete({ _id, 'author.id': actor.id })` 删除，**全程不接触 `daily_picks`** → 删帖后 `daily_picks.postId` 必然成为悬挂字符串。

**换库时的处置**（详见主报告 §8.5.2）：① 建ObjectId → UUID 映射表 ② `post_id` 列类型从 `varchar` 改 `uuid` ③ **再加** `REFERENCES posts(id) ON DELETE SET NULL` ④ 修第一层错误处理（区分 404 info / 403 error+告警）⑤ **修第二层前置条件**（删帖失败时不执行级联，直接中止）⑥ 幂等语义。

> ⚠️ **不能直接加外键**：`daily-pick.schema.ts:58-59` 的 `postId` 声明为 `@Prop({ type: String, default: null })`，是**弱引用字符串**（无 `ref`、无 `Types.ObjectId`、无索引），而 PG 的 `posts.id` 是 UUID。**类型与值域都不匹配，直接加约束会失败。**

> ⚠️ **附带发现（文档腐化实例）**：`posts.service.ts:326` 的注释写「阶段 6 会在这里级联删除它的评论」，但**实际 `remove()` 内无 `commentsService.deleteByPost` 调用**（级联只在 `daily-digest.service.ts:344`）。注释已过期。

### 2.4 `FR-GHINTRO-2` 简介失效与内容清洗（0 分）

**内容**：`cleanIntro` 去代码围栏 → 去前导非中英文数字 → 压空白；长度 `< 10` 视为无效；`truncateAtSentence` 在 `。！？；` 处收尾，**标点位置 `< limit/2` 时退回硬截**。

**GitHub 实证（2026-10-07 第三轮）**

拆解为四个动作逐一检索：

| 动作 | 现成方案 | 覆盖情况 |
| --- | --- | --- |
| 去代码围栏 | `punctuation-normalizer`（Rust）的思路可用，或简单正则 | ✅ 有 |
| 去前导非中英文数字 | 一行正则 | ✅ 有 |
| 压空白 | `String.replace(/\s+/g, ' ')` | ✅ 有 |
| **在 `。！？；` 处收尾且标点位置 < limit/2 时退回硬截** | — | ❌ **无** |

| 已检索候选 | 许可证 / 形态 | 为何不适用 |
| --- | --- | --- |
| **node-segment** | 纯 JS，一行 npm 安装 | **只做分词**，不做文本清洗与标点收尾 |
| **nodejieba** | C++ 扩展（cppjieba） | 同上；且需原生编译，官方说明 npm 慢且墙的问题、建议用 cnpm |
| **chinese_text_normalization** | Python 系 | 非 Node 生态；且面向 TTS/ASR 的非标准表述转标准（数字读法、缩写展开），与本场景不同 |
| **punctuation-normalizer** | Rust | 语义是「**跳过**围栏代码块/行内代码/LaTeX 数学区」的保护逻辑，不是「在标点处**收尾**」 |
| Vercel AI SDK `Output.object` | Apache-2.0 | 能保证 JSON 形态，**不能保证文本风格** |
| LLM structured output + schema | — | schema 能约束字段，不能约束「在 `。！？；` 处收尾且标点过早时退回硬截」 |

**结论**：**标点处收尾本质上是提示词约束的不可靠替代品**——模型不保证遵守，必须是确定性代码。**保留自研，理由编号 R-1（语义专属）。** 这三条清洗规则是本产品的输出质量基线。

### 2.5 `FR-GH-3` 语言筛选与语言列表（0.5）

**内容**：语言筛选为**严格相等**（不做大小写模糊）；**`languages` 列表基于筛选前的全量**（否则选中 TypeScript 后筛选条只剩 TS，得先取消才能换选）；`aggregateLanguages` 用 Map 计数（不是 Set），**无语言的仓库不参与统计**。

**GitHub 实证（2026-10-07 第三轮）**

| 层 | 现成方案 | 覆盖情况 |
| --- | --- | --- |
| 聚合与排序 | PG `GROUP BY` + `count(*)` + `ORDER BY count DESC, name ASC` | ✅ 有 |
| 严格相等过滤 | SQL `WHERE language = $1` | ✅ 有 |
| **「`languages` 列表基于筛选前的全量」** | — | ❌ **无**。这是交互设计：避免筛选条自我锁死 |
| **「不做大小写模糊」** | — | ❌ **无**。基线 4.8 明确「按 `item.language` **严格相等**过滤（不做大小写模糊）」 |

**结论**：技术手段现成，**产品口径自研**。**保留 0.5，理由编号 R-1（语义专属）。** 前者是交互设计（避免筛选条自我锁死），后者是刻意的严格性。

### 2.6 `FR-GH-4` 仓库详情三级回退（0.5）

**内容**：榜单缓存（`stale = age >= ttl`）→ `repo_snapshots`（`stale = ageDays > 7`）→ 上游回源并 upsert。另有 `findRepoById()` **不回源**。

**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 许可证 | Star | 为何不适用 / 适用方式 |
| --- | --- | --- | --- |
| **unstorage** | **MIT** | **2.7k** | ✅ **适用作骨架**。UnJS 生态（广义 Nuxt 官方基础设施）。多驱动挂载（内存/Redis/文件系统）；写入支持 `ttl`；读取支持 **`swr: true`（stale-while-revalidate）——优先返回已有数据并触发后台刷新**。**但「哪三级、各级的陈旧阈值」仍是产品决策** |
| 各语言平台的 stale-while-revalidate 模式 | — | — | 模式参考，非可引入的代码 |
| Sourcebot | — | — | ❌ 场景不匹配（跨仓库代码搜索，本项目只索引自身 3 处源码） |

**结论**：**模式有现成抽象（三档具体定义自研）**。**维持 0.5，理由编号 R-1。**

**价值边界（重要）**：现状 `trending_caches` 的 `fetchedAt`（决定 360 分钟 TTL）与 `lastAttemptAt`（决定 60s 最小刷新间隔）**刻意分离**——基线 4.8 的理由是「若只用 `fetchedAt` 节流，上游持续不可用时每个请求都会重试」。**这个设计不交给 unstorage**，unstorage 只提供「陈旧数据 + 后台刷新」的单层机制。

### 2.7 `FR-AIQA-5` 代码检索计分（0.5）

见 [1.4](#14-代码索引与检索2-条原-0-分)。**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 许可证 | Star | 为何不适用 / 适用方式 |
| --- | --- | --- | --- |
| **ast-grep** | **MIT** | **16.1k**（468 forks，4,379 commits） | ✅ **适用作粗筛**。Rust 实现，基于 **tree-sitter**，按 **AST 节点结构**匹配而非文本 grep；`$MATCH` 元变量；支持 `--pattern` / `--rewrite` / `--lang`；**YAML 自定义规则**。⚠️ 页面明确它是「构建代码索引的**搜索与分析引擎**」而**不是**开箱即用的代码索引产品——不提供持久化索引、增量索引、符号表/调用图、跨仓库索引、语义向量检索 |
| Sourcebot | — | — | ❌ 跨仓库代码搜索，场景不匹配 |
| **Meilisearch**（已选） | MIT (CE) | — | `rankingRules` 只能 `attribute:asc`/`desc` 字段排序 → 只能做粗筛 |
| **node-segment** | 纯 JS | — | ✅ **可替代自研中文分词**（替代「中文按 2 字滑窗提词」中的分词部分） |
| nodejieba | C++ 扩展 | — | 同上，但需原生编译且安装不便 |

**判定：维持 0.5，理由编号 R-3（抽象不匹配）。** `rankingRules` 与 ast-grep **都不表达加权求和**。合理用法是**两段式**：ast-grep（或 Meilisearch）做候选粗筛 → 自研三档加权精排。

⚠️ **待核实**：ast-grep 对 TypeScript 的 `exports` 与 JSDoc 抽取能力（已知 ts-morph 完全覆盖此项，此项只影响粗筛型可行性）。

### 2.8 `FR-ASK-1` / `FR-ASK-2` 问全书短路与来源（各 0.5）

**内容**：「缓存 → 检索 → 额度 → 生成」的固定顺序；**检索为空即短路 `no-sources`，一字不问模型**；`used` 过滤保证 prompt 里的 `[n]` 编号与返回的 `sources` 数组**同序**。

**GitHub 实证（2026-10-07 第三轮）**

| 已检索候选 | 性质 | 为何不适用 |
| --- | --- | --- |
| **open-rag-eval** | **评估框架**：Faithfulness（答案是否基于给定上下文）、Answer Relevance、Context Relevance；规则型评估器（Rouge-L / BLEU / Hit Rate） | ❌ **事后评估**。本条要求的是**调用前的分支**（检索为空就不问模型），评估工具不参与运行时 |
| **VerifAI**（IEEE） | **研究性方案**：把答案分解为 atomic claims + 事后 claim verification | ❌ **事后验证**，同上 |
| LangChain / LlamaIndex 等 RAG 框架 | 运行时编排 | ❌ 通用框架的默认行为**恰恰相反**——会 fallback 到无检索回答，与基线 6.7「宁可说没有资料，也不能让模型自由发挥」相悖 |
| Langfuse（已选） | 追踪 / 评测 | 观测与评估，不保证运行时一致性 |

**结论**：**只有事后评估工具，没有运行时的一致性保证机制。**

这两条本质是**运行时行为**：「检索为空即短路」是调用前的分支，必须在代码里；「编号同序」是构造 prompt 与解析响应的实时一致性。

**维持 0.5，理由编号 R-1（语义专属）。**

### 2.9 `FR-AUTH-4` Cookie path 最小暴露面（0.5）

**内容**：Refresh Cookie 路径限定 `/api/auth`，不覆盖其他路由。

**GitHub 实证（2026-10-07 第三轮）**：Better Auth（MIT，30.2k star，7,668 commits，framework-agnostic TS）**技术上完全可行**——其 session 配置可设 `httpOnly` / `sameSite` / `secure`。但 **Cookie path 的最小暴露面设计需薄自研**。**且因 D1=A 裁定采用 Payload auth，Better Auth 连带移出**（避免双认证实现并存，这是双 Token 轮换语义冲突的高风险点）。

**维持 0.5，理由编号 R-1。** 这与 `FR-WEBINFRA-4`「Access Token 只在内存、不进 SSR payload」同属项目刻意的安全基线。

### 2.10 `FR-AGENT-3` / `-4` / `-5` Agent 收尾（各 0.5）

见 [1.12](#112-agent-收尾3-条原-05-分)。共同点：**技术手段现成，但收尾规则是产品决策。**

**GitHub 实证（2026-10-07 第三轮）· 针对 `FR-AGENT-5`**

LangGraph 有**成体系**的错误处理与重试：

| 能力 | 细节 |
| --- | --- |
| **`RetryPolicy`** | 可配 `max_attempts`、`initial_interval`、`backoff`、`retry_on`（**函数动态判定**） |
| **默认重试判定**（`libs/langgraph/langgraph/_internal/_retry.py`） | `ConnectionError`（连接断开、握手失败）→ **重试**（典型瞬时网络问题）<br>HTTP **5xx** → **重试**（是对方服务器的问题，不是你的请求有问题）<br>HTTP **4xx** → **不重试**（参数错误、鉴权失败是调用方的问题） |
| **工具错误回喂** | `handle_tool_errors` 可配置工具错误如何处理，包括作为消息回喂模型 |

**维持 0.5，理由编号 R-1。** 三条的价值边界：

| FR | 现成方案覆盖 | 仍需自研 |
| --- | --- | --- |
| `FR-AGENT-5` 异常回灌 | 异常分类 + 重试策略（**仅对比实现 LangGraph.js 能用**） | **「回灌内容不含堆栈、凭据与内部文件路径」的脱敏**——对应不可违反项 7「对外错误不泄漏内部细节」与 8「日志不写敏感数据」，任何框架都不提供 |
| `FR-AGENT-4` 轮次上限与收敛 | `ToolLoopAgent` 步数上限 | 「超限收敛为信息不足并列已调用工具与尚未解决的问题」 |
| `FR-AGENT-3` 工具集的数据边界 | 读帖子/读用户/读路线节点的手段现成 | 「不返回邮箱」「不返回未发布内容」「工具数量固定为 4」 |

### 2.11 `FR-DOC-1` / `FR-DOC-2` 文档渲染与导航（各 0.5）

见 [1.11](#111-健康检查与内容渲染2-条原-05-分)。

**GitHub 实证（2026-10-07 第三轮）· P20 阻塞项已解除**

来源：`https://registry.npmjs.org/@nuxt/content/latest`（**直接读 npm 包元数据而非文档**）

| 字段 | 值 |
| --- | --- |
| 最新版本 | **3.16.1** |
| `engines.node` | **`>= 20.19.0`** |
| `peerDependencies` | **不含 `nuxt`**。6 个 peer 全为 `optional: true`（`sqlite3`、`valibot`、`@libsql/client`、`better-sqlite3`、`@electric-sql/pglite`、`@valibot/to-json-schema`） |
| `dependencies` 关键项 | **`@nuxt/kit ^4.5.2`**、`shiki`、`unified`、`remark-mdc`、`@nuxtjs/mdc`、`isomorphic-git`、`db0` 等（共 48 项） |
| `devDependencies` 关键项 | **`nuxt ^4.5.2`**（与本项目完全一致） |

**证据链三条**：

| # | 证据 | 说明 |
| --- | --- | --- |
| 1 | `peerDependencies` 不含 `nuxt` | **Nuxt module 的惯例是不把 `nuxt` 声明为 peer**（框架版本由 Nuxt 自身解析）。peer 缺失**不构成**否定证据 |
| 2 | `dependencies` 含 `@nuxt/kit ^4.5.2` | Nuxt Kit 4.x 即 **Nuxt 4 的工具链**，说明运行时按 Nuxt 4 API 编写 |
| 3 | `devDependencies` 含 `nuxt ^4.5.2` | 它自身开发与测试用的就是 **Nuxt 4.5.2**，与本项目版本号完全对齐 |

**结论：明确支持 Nuxt 4，决策 D3 的阻塞项解除。** 仍建议补跑 **P19**（实机构建 31 篇）作为端到端确认——包元数据只能证明「支持」，不能证明「31 篇 + 5 组导航 + 旧链接重定向」这条完整需求链无意外。

**维持 0.5**：5 组侧栏分组 + 上下页需移植现状 `.vitepress/config.ts` 194 行的结构，属项目特定（理由 R-1）。

---

### 2.12 索引迁移对照表（关闭核实缺口 #16 的输入）

> **第五轮新增**。缺口 #16 原文是「14 个索引的完整 DDL 清单，需从 5 处显式 `.index()` + 9 个集合的 `@Prop` 声明逐个翻译」——**这个前提已实测修正**：实际是 **21 个显式声明索引 + 14 个集合的隐式 `_id_` 主键索引 = 35 个**，构成是 **6 处显式 `.index()` + 15 个 `@Prop` 内联声明**。
>
> **实测方式**：`code-explorer` 全量静态分析 `apps/api/src/**` 的 14 个 `*.schema.ts`（全文读取）+ `apps/api/src/common/schemas/`，关键字覆盖 `Schema.index(` / `index:` / `unique:` / `expireAfterSeconds` / `partialFilterExpression` / `sparse` / `autoIndex` / `createIndex` / `ensureIndex` / `ref:` / `refPath` / `.virtual(` / `populate(`。**结论均带文件路径 + 行号。**

#### 2.12.1 全量索引清单（21 个显式）

| 集合 | 索引 | 字段顺序 | unique | 定义位置 | 目标 PG DDL |
| --- | --- | --- | --- | --- | --- |
| `users` | `email_1` | `email:1` | ✅ | `users/schemas/user.schema.ts:26`（`@Prop`） | `CREATE UNIQUE INDEX users_email ON users (email)` |
| `posts` | `createdAt_-1` | `createdAt:-1` | ❌ | `posts/schemas/post.schema.ts:126`（独立 `.index()`） | `CREATE INDEX posts_created_at ON posts (created_at DESC)` |
| `posts` | `tags_1_createdAt_-1` | `tags:1` → `createdAt:-1`（**等值在前、排序在后**） | ❌ | `post.schema.ts:127`（独立 `.index()`） | ⚠️ **PG 必须改为 GIN 索引**：数组等值用 `USING GIN (tags)` + `USING BTREE (created_at DESC)`，**不能照搬复合索引** |
| `comments` | `postId_1_createdAt_1` | `postId:1` → `createdAt:1` | ❌ | `comments/schemas/comment.schema.ts:69` | `CREATE INDEX comments_post_created ON comments (post_id, created_at)` |
| `likes` | `postId_1_userId_1` | `postId:1` → `userId:1` | ✅ | `likes/schemas/like.schema.ts:65` | `CREATE UNIQUE INDEX likes_post_user ON likes (post_id, user_id)` · **幂等点赞的正确性基石** |
| `ai_daily_usage` | `date_1` | `date:1` | ✅ | `ai/schemas/ai-usage.schema.ts:17`（`@Prop`） | `CREATE UNIQUE INDEX ai_usage_date ON ai_daily_usage (date)` |
| `ai_answer_cache` | `hash_1` | `hash:1` | ✅ | `ai-usage.schema.ts:39`（`@Prop`） | `CREATE UNIQUE INDEX ai_cache_hash ON ai_answer_cache (hash)` |
| `postembeddings` | `postId_1` | `postId:1` | ✅ | `search/schemas/post-embedding.schema.ts:19`（`@Prop`） | `CREATE UNIQUE INDEX embeddings_post ON postembeddings (post_id)` |
| `trending_caches` | `range_1` | `range:1` | ✅ | `github/schemas/trending-cache.schema.ts:89`（`@Prop`） | `CREATE UNIQUE INDEX trending_range ON trending_caches (range)` |
| `repo_snapshots` | `repoId_1` | `repoId:1` | ✅ | `github/schemas/repo-snapshot.schema.ts:26` | `CREATE UNIQUE INDEX repo_snap_repo ON repo_snapshots (repo_id)` |
| `repo_snapshots` | `fullName_1` | `fullName:1` | ✅ | `repo-snapshot.schema.ts:30` | `CREATE UNIQUE INDEX repo_snap_fullname ON repo_snapshots (full_name)` |
| `repo_intros` | `repoId_1` | `repoId:1` | ✅ | `github/schemas/repo-intro.schema.ts:20` | `CREATE UNIQUE INDEX repo_intro_repo ON repo_intros (repo_id)` |
| `daily_picks` | `date_1` | `date:1` | ✅ | `daily-digest/schemas/daily-pick.schema.ts:31` | `CREATE UNIQUE INDEX picks_date ON daily_picks (date)` |
| `daily_picks` | `repoId_1` | `repoId:1` | ✅ | `daily-pick.schema.ts:35` | `CREATE UNIQUE INDEX picks_repo ON daily_picks (repo_id)` |
| `daily_pick_excludes` | `repoId_1` | `repoId:1` | ✅ | `daily-digest/schemas/daily-pick-exclude.schema.ts:32` | `CREATE UNIQUE INDEX excludes_repo ON daily_pick_excludes (repo_id)` |
| `daily_pick_excludes` | `date_1` | `date:1` | ❌ **非唯一** | `daily-pick-exclude.schema.ts:42` | `CREATE INDEX excludes_date ON daily_pick_excludes (date)` · ⚠️ **刻意非唯一**，见下 |
| `roadmap_progress` | `userId_1` | `userId:1` | ✅ | `roadmap/schemas/roadmap-progress.schema.ts:59` | `CREATE UNIQUE INDEX roadmap_user ON roadmap_progress (user_id)` · **每人一份文档** |
| `interview_questions` | `nodeId_1` | `nodeId:1` | ❌ | `interview/schemas/interview-question.schema.ts:33` | `CREATE INDEX q_node ON interview_questions (node_id)` |
| `interview_questions` | `company_1` | `company:1` | ❌ | `interview-question.schema.ts:40` | `CREATE INDEX q_company ON interview_questions (company)` |
| `interview_questions` | `priority_1` | `priority:1` | ❌ | `interview-question.schema.ts:47` | `CREATE INDEX q_priority ON interview_questions (priority)` |
| `interview_questions` | `nodeId_1_question_1` | `nodeId:1` → `question:1` | ✅ | `interview-question.schema.ts:74` | `CREATE UNIQUE INDEX q_node_question ON interview_questions (node_id, question)` · **种子幂等灌入前提** |

**统计**：21 个显式 = **14 个 unique**（其中 2 个复合唯一：`likes`、`interview_questions`）+ 4 个复合索引（2 复合唯一 + 2 复合非唯一）+ 7 个单字段非唯一。**0 个 TTL · 0 个 sparse · 0 个 partial**（三者全仓 0 命中，PG 侧无对应物，迁移无额外工作量）。

加上 14 个集合各自的隐式 `_id_` 主键索引 → **共 35 个索引需翻译成 PG DDL**。

#### 2.12.2 ⚠️ 五处不能照搬 Mongo 语义的点

| # | Mongo 做法 | PG 不能照搬的原因 | PG 正确做法 |
| --- | --- | --- | --- |
| 1 | `posts {tags:1, createdAt:-1}` 复合索引 | **PG 的 B-tree 复合索引对数组等值无效**——`tags` 是数组字段，`tags:1` 只对**包含全部元素**的行命中 | 拆成 `GIN (tags)` + `BTREE (created_at DESC)`，查询侧用 `tags && ARRAY[...]` |
| 2 | `daily_pick_excludes.date` **非唯一** | `daily-pick-exclude.schema.ts:14-21` 注释说明：`date` 刻意不加唯一索引（同名不同选项会抛 `IndexOptionsConflict`） | **保持非唯一**，不要「顺手修正」为唯一——这是刻意设计 |
| 3 | `ai_answer_cache` **无 TTL** | `ai-usage.schema.ts:49-55` 注释说明是**刻意不用 TTL**（清理有 60s 延迟、时间写死不好调），改为**查询时手动判过期** | **不得加 `pg_cron` 清理或 TTL 模拟**，否则语义变更（把「查询时判过期」变成「后台物理删除」） |
| 4 | `_id` 为 `ObjectId`（12 字节） | PG 无对应内置类型；Payload 默认用 UUID | 全部主键改 `uuid`，并建ObjectId → UUID 映射表（见 §2.3.1） |
| 5 | `author.id` 声明为 **`String`**（`common/schemas/author.schema.ts:30-31`），非 ObjectId | 内嵌作者快照是**字符串 id**，不是引用 | PG 侧保持 `text`/`varchar`，**不要**改成 `uuid` 外键（快照语义，不是引用语义） |

#### 2.12.3 关联关系的实测分野（决定哪些字段能加 FK）

全仓 `ref:` 仅 **5 处**命中；`refPath` / `.virtual(` / `populate(` 均 **0 命中**——**不存在动态 ref 或虚拟 populate 隐藏的关联关系**。

| 类别 | 字段 | 能否加 FK |
| --- | --- | --- |
| **强引用**（`Types.ObjectId` + `ref`） | `comments.postId`(`comment.schema.ts:44`) · `likes.postId`(`like.schema.ts:34`) · `likes.userId`(`like.schema.ts:37`) · `roadmap_progress.userId`(`roadmap-progress.schema.ts:36`) · `interview_questions.createdBy`(`interview-question.schema.ts:57`) | ✅ 类型已匹配，可直接加 |
| **弱引用**（`String`，无 `ref`） | `daily_picks.postId`(`daily-pick.schema.ts:58-59`) · `daily_pick_excludes.postId`(`daily-pick-exclude.schema.ts:59-60`) | ❌ **必须先做类型迁移** |
| **有索引但无 `ref`** | `postembeddings.postId`(`post-embedding.schema.ts:19`) | ⚠️ **需决策**：补 FK，还是保持弱引用（向量表的删除时机由应用层控制更安全） |

#### 2.12.4 三条诚实说明（实测的边界）

| # | 说明 |
| --- | --- |
| 1 | **没有显式命名的索引**。全仓搜 `name:` 在索引选项中0 命中。上表的索引名全是按 MongoDB 默认命名规则推导的**预期名**。若线上有存量索引，实际名字可能因历史操作不同 → **PoC 应用 `db.collection.getIndexes()` 拉真实名字做基线** |
| 2 | **未连接线上实例**。全部基于源码静态分析。源码里 `autoIndex` **从未显式配置**（`app.module.ts:56-151` 的连接参数块中没有该项），即现状**完全依赖 Mongoose 默认 `autoIndex: true`**。这正是「换 PG 后 35 个索引全部要手写 DDL」的根据，也意味着**「源码声明的索引」与「线上实际存在的索引」理论上可能不一致** |
| 3 | **`health` 模块无 Schema**，且**不存在 `health.module.ts`**（已确认）；`auth` 模块只有 DTO 无 Schema。12 个模块里只有 11 个贡献了集合，13 个 schema 文件覆盖 14 个集合（`ai-usage.schema.ts` 承载 2 个集合） |

---

## 3. 汇总

| 分类 | 条目数 | 目标得分分布 |
| --- | --- | --- |
| 通用能力补配到位 | **41** | 全部 ≥ 0.5，其中 33 条达 1 分 |
| 业务编排保留自研 | **12** | 4 条 0 分 + 8 条 0.5 分 |
| 合计 | **53** | — |

### 3.1 通用能力段得分分布

| 目标得分 | 条目数 | FR |
| --- | --- | --- |
| 1 分 | 33 | `FR-CORE-1/2/3/4/5/6`、`FR-CONTRACT-1/2/3/4`、`FR-HEALTH-1/2`、`FR-AUTH-1/2/3/5`、`FR-USER-1/2/3`、`FR-PAGE-LOGIN-1/2/3`、`FR-POST-1/2/4/5`、`FR-CMT-1/2/3`、`FR-LIKE-1/2/3`、`FR-PAGE-POST-1..5`、`FR-GH-1/2/5`、`FR-GHINTRO-1/3`、`FR-AI-1/2/3`、`FR-AIQA-1/2/3/4`、`FR-PAGE-AI-1/2`、`FR-SEARCH-1/2/3/4`、`FR-ASK-3`、`FR-DIGEST-3/5`、`FR-PAGE-DIGEST-1/2`、`FR-ROADMAP-1..4`、`FR-PROGRESS-1..5`、`FR-INTERVIEW-1/2/3/4`、`FR-PAGE-ROADMAP-1..5`、`FR-WEBINFRA-1..6`、`FR-HOME-1..3`、`FR-SEO-1..3`、`FR-AGENT-1/2/6/7/8/9/10`、`FR-DOC-3/4/5/6` |
| 0.5 分 | 8 | `FR-POST-3`、`FR-GH-3`、`FR-GH-4`、`FR-AIQA-5`、`FR-ASK-1`、`FR-ASK-2`、`FR-AUTH-4`、`FR-DOC-1`、`FR-DOC-2`（部分条目跨段） |

### 3.2 业务编排段保留自研的 12 条

| FR | 名称 | 得分 | 保留理由编号 |
| --- | --- | --- | --- |
| `FR-DIGEST-1` | 每日报道生成流程 | 0 | R-2 顺序敏感 |
| `FR-DIGEST-2` | 候选筛选 | 0 | R-1 语义专属 |
| `FR-DIGEST-4` | 撤回的固定次序 | 0 | R-2 顺序敏感 |
| `FR-GHINTRO-2` | 简介失效与内容清洗 | 0 | R-1 语义专属 |
| `FR-GH-3` | 语言筛选与语言列表 | 0.5 | R-1 语义专属 |
| `FR-GH-4` | 仓库详情三级回退 | 0.5 | R-1 语义专属 |
| `FR-AIQA-5` | 代码检索计分 | 0.5 | R-3 抽象不匹配 |
| `FR-ASK-1` | 问全书短路与编号一致性 | 0.5 | R-1 语义专属 |
| `FR-ASK-2` | 来源解析与展示 | 0.5 | R-1 语义专属 |
| `FR-AUTH-4` | 刷新令牌的 Cookie 属性 | 0.5 | R-1 语义专属 |
| `FR-AGENT-3` | 工具集的数据边界 | 0.5 | R-1 语义专属 |
| `FR-AGENT-4` | 循环轮次上限与收敛 | 0.5 | R-1 语义专属 |
| `FR-AGENT-5` | 工具异常回灌 | 0.5 | R-1 语义专属 |
| `FR-DOC-1` | 文档内容与路由 | 0.5 | 阻塞未解（Nuxt 4 兼容性） |
| `FR-DOC-2` | 导航结构与上下页 | 0.5 | R-1 语义专属 |

> **判自研的共同特征**：技术手段在现成方案里都有，但**参数值、阈值、执行顺序、边界范围全部是产品自己定的**。这类需求无论换什么框架，产出的都是「框架 + 一堆 if」，而 if 才是真正承载产品逻辑的部分。把它交给框架不会减少自研量，只会把它藏得更深。
