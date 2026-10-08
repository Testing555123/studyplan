# 重构批次实施规划（11 批次）

> **依据**：`TECH-SELECTION.md` §0 最终裁定 · `docs/DEPENDENCY-LOCK.md` · `docs/POC-RESULTS.md`
> **状态**：批次 1 的「换库 + 迁移」已验证完成；批次 1 的「Payload 基座」及批次 2–11 为本轮规划，未执行。
> **环境**：`studyplan-pg` 容器（PG 16.15 + pgvector 0.8.7 + pg_trgm），宿主端口 **5433**；
>          `studyplan-mongo`（mongo:7，27017）作迁移源。

---

## 已完成（本轮）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| PoC ①组残留 P7 | ❌ 阻塞（`OPENCODE_API_KEY` 为空） | `docs/POC-RESULTS.md` |
| PoC ③组 P1 | ✅ 14 表 / 36 索引 / 14 unique，并**修掉重复索引** | 同上 |
| PoC ③组 P30 | ✅ 11 条断言全绿，并**修掉静默数据丢失** | 同上 |
| PoC ③组 P31 | ✅ 5 条测试 + 编译期闸门实测生效 | `poc/p31-password-gates.test.mjs` |
| PoC ④组 P19 | ✅ 16/16（Nuxt Content 构建 30 篇 /ebook） | `poc/p19-docs/verify.mjs` |
| 缺口 #5 embed | ✅ 采用 transformers.js + `Xenova/bge-large-zh-v1.5` @ `dtype=q8` | `poc/p5-embed-local.mjs` |
| **批次 1①** PG schema + 数据迁移 | ✅ 14 表迁移 + 深度断言全绿 | `apps/api/scripts/mongo-to-pg.mjs` |

---

## 🔴 头号发现：Payload 3 在非 Next.js 环境**没有 HTTP 层**

这推翻了原计划「Payload 3 standalone Express 提供 REST」的架构假设。

**实测证据**（三重）：
1. `payload@3.90.2` 的 `package.json` **不含 express 依赖**；
2. `BasePayload` 类型里**没有任何 HTTP 成员**（无 `router` / `express` / `initHTTP`）；
3. 官方文档 `local-api/outside-nextjs` 原文：只提供 `getPayload()` **Local API**，
   用途是「running scripts」和「using Payload's Local API to fetch your data directly
   from your database in other frontend frameworks like SvelteKit, Remix, **Nuxt**」——
   **注意是"直接取数"，不是"提供 HTTP 接口"**。HTTP 层在 `@payloadcms/next`（Next.js 专用）。

> 文档 §11.4 写的「Payload 官方文档点名支持 Nuxt」是真的，但**只覆盖 Local API 同进程取数**；
> 本项目前端是**独立 Nuxt 进程**（`apps/web` 3001）通过 `useApi` 走 HTTP，用不了 Local API。

**现成方案调研**：搜索命中的 `payload.authenticate` / `payload.router` 是 **Payload 2** 的 API（v3 已移除）；
官方 `payloadcms/nextjs-custom-server` 模板仍绑 Next.js。**没有可用的现成方案。**

**三个候选**（待裁定，spike 未跑完）：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A | `apps/api` 保留 Express，路由只做「HTTP ↔ Local API」转接 | 约 45 条路由胶水；不动前端 |
| B | 引入 `@payloadcms/next` | 多一个 Next.js 运行时，与 D4/R8 冲突 |
| C | 后端并入 `apps/web/server`（Nitro），运行时 2→1 | 架构级改动；文档列为「未纳入评估 · 需实机验证」 |

**Spike 现状（未完成）**：已在 `poc/p19-docs/` 写好最小样例
（`server/utils/payload-spike.js` 用 `buildConfig()` 构造配置 + `server/routes/spike-payload.ts` 走 `getPayload`，
验证 create/find/count/login 以及「默认 find 是否带出 passwordHash」）。
**阻塞原因**：Nuxt 每次构建会强制跑 `pnpm install` 做依赖状态检查，而该调用落在**父 workspace root**，
报 `[ERR_PNPM_EPERM] ... rename vite_tmp_... -> vite` 失败 → `nuxt build` exit 1。
沙盒的 `.npmrc` 里 `ignore-workspace=true` 未被 pnpm 11 采纳。
**下一步**：先解决该 EPERM（清理 `node_modules/.pnpm/vite@*` 的文件锁，或把 spike 挪到 workspace 之外再跑）。

---

## ⚠️ 开工前必须先裁定的一件事：Payload schema 与手写 DDL 的关系（已裁定：A）

这是批次 1② 的**头号阻塞**，本轮实测后才暴露：

| 事实 | 说明 |
| --- | --- |
| Payload 的 `@payloadcms/db-postgres` 基于 Drizzle | 它会按集合定义**自己生成**表结构（`push: true` 或 `payload migrate`），命名与 P1 手写 DDL 不保证一致 |
| Payload 会额外建表 | 版本（`_rels` / `_*_versions`）、认证（`payload_*`）等，P1 DDL 里没有 |
| **Payload 不原生支持 GIN / HNSW** | 而硬约束 #4 要求 `posts.tags` 用 **GIN**，P23 要求向量用 **HNSW** —— 这两类索引必须由自定义迁移补 |
| P30 的外键 `ON DELETE SET NULL` | Payload 的 relationship 字段会建 FK，但删除语义需逐个核对 |

**三个候选方案**：

| 方案 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| **A（推荐）** Payload 主导 schema | 集合定义为准，用 Payload 迁移生成表；GIN / HNSW / 特殊 FK 用自定义 migration 补 | 与 Payload 生态一致，`generateTypes` / admin / jobs 全部可用 | P1 DDL 退化为「语义参考」，需写一段补齐迁移 |
| B 手写 DDL 主导 | 保留 P1 DDL，Payload 只做 CRUD 层（`push: false` + 只读映射） | 索引完全可控 | 与 Payload 迁移机制割裂，后续加字段要双份维护 |
| C 双份维护 | — | — | ❌ 直接否决（违反不可违反项 13） |

**建议**：选 **A**，并把 P1 DDL 中 Payload 无法表达的 4 项沉淀为补齐迁移：
① `posts_tags_gin`（GIN）② `embeddings_hnsw`（HNSW）③ `daily_picks.post_id` 的 `ON DELETE SET NULL`
④ `daily_pick_excludes.date` **刻意非唯一**（不要被迁移"顺手"唯一化）。

---

## ✅ 批次 1② 基座实测结果（2026-10-08）

**方案 A 已跑通**：`apps/api` 切为 **ESM**（Payload 硬性要求）+ Express + `trust proxy`（在 `getPayload()` 之前）+ 14 集合 + `rate-limiter-flexible`，Payload Local API 成功建表 22 张（14 业务表 + 8 张 Payload 系统表）。

冒烟（`PORT=3200`，真实 PG）：`/api/health` 200 · 注册 200（返回 user+token）· 登录 200 · **错误密码统一 401（不区分邮箱/密码，防账号枚举）** · **返回的用户字段恰好是 `avatarColor,createdAt,email,id,username`，无 `passwordHash`** —— R-C 闸门 3 在 Payload 下成立。

### 启动路上踩掉的三个坑（都会在新环境复发）

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| `pnpm exec` 触发自动 install | `[ERR_PNPM_EPERM] rename ..._tmp_ -> ...`，exit 1 | **绕过 pnpm，用 `node --import tsx` 直接跑** |
| 顶层 await 报错 | `Top-level await is currently not supported with the "cjs" output format` | 入口改名 **`server.mts`**（恒按 ESM 解析）+ `apps/api` 加 `"type":"module"` |
| `logger: {level}` 配置 | `this.logger.warn is not a function`（启动即崩） | **不要**在 Payload Config 传 logger 对象；日志脱敏留批次 3 用 pino redact |

### 🔴 两处与 P1 DDL 的偏差（必须在 1③ 前处理）

| # | 偏差 | 影响 | 处置 |
| --- | --- | --- | --- |
| 1 | **Payload 默认整型 ID**（实测 `id: "1"`），不是 P1 DDL 的 `uuid` | **迁移脚本的 `oidToUuid` 映射直接失效**，所有 FK 语义错位 | 在 `postgresAdapter` 加 `idType: 'uuid'`，然后重跑 `payload_dev` 建表并复测 |
| 2 | **`tags`（`hasMany: true` 的 text）被 Payload 存成子表 `posts_texts`**（`parent_id` + `path` + `text`），**不是 PG 数组** | P1 的 `tags text[]` + `GIN(tags)` 方案不成立；按标签筛帖要么查子表，要么改用 jsonb 数组 | 二选一：① 改 `type:'json'` 存数组（保持 GIN）② 保留子表，索引加在 `posts_texts(text)`。**建议 ①**，语义与现状 Mongo 一致 |

> 其余 13 张业务表与 P1 DDL 的表名、列名一致；`payload_migrations` / `payload_preferences` / `users_sessions` 等系统表为 Payload 正常产物，不影响迁移。

---

## 批次 1（本轮未完部分）

### 1② Payload 3 standalone 基座

- **前置**：上面的 schema 裁定（A/B）
- **改动**：
  - `apps/api/package.json` ✅ 已装 `payload@3.90.2` / `@payloadcms/db-postgres@3.90.2` / `zod@4.6.5` / `rate-limiter-flexible@11.2.1`
  - `apps/api/src/payload.config.ts`〔新〕：db-postgres、14 集合、auth、jobs
  - `apps/api/src/server.ts`〔新〕：Express standalone
  - `apps/api/src/collections/`〔新〕：14 个集合
  - `apps/api/src/middleware/rate-limit.ts`〔新〕：14 档 + 热门榜单豁免
- **两条不可违反的时序**（PoC 已实测，写错就静默失效）：
  1. **P2**：`app.set('trust proxy', …)` 必须在 **Express app 创建后、`payload.init()` 之前**。
     Payload Config **无 `trustProxy` 选项**，且 v3 **已移除内置全局限流**（issue #10321）。
     写晚 → `req.ip` 拿不到真实 IP → 限流退化成「全站共用一个桶」。
  2. **P3**：hook 要 fire-and-forget **就不能写 `async`**。
     `async ({result}) => { void doX() }` 仍会被 Payload 等待外层 Promise。
     正确写法：`({result}) => { void doX(result).catch(() => {}) }`。
- **限流**：`rate-limiter-flexible` 的 `duration` 单位是**秒**（不是毫秒），14 处档位需换算。
- **验收**：`payload.init()` 成功；14 张表在 PG 可见；`curl` 验证限流按 IP 分桶（两个 IP 各打 11 次登录 → 各自第 11 次 429）。

### 1③ 五个业务域迁移 + R-B / R-C

- 域：auth / users / posts / comments / likes
- **R-B 两层修复**（`daily-digest.service.ts`）：
  - 第一层 `:332-337`：区分 404（info，幂等正常态）/ 403（error + 告警）
  - **第二层 `:342-347`：级联删互动必须检查删帖是否成功**，失败即中止 —— 宁可名额被占，也不留下半清理的数据
- **R-C 三道闸门**：`poc/p31-gates.mjs` 已给出可移植实现，两条最小测试已就绪
- **验收**：`node --test` 全绿；越权返回 403 且不泄露内容；不存在的返回 404

### 1④ `packages/shared` CJS → ESM

- `"type": "module"` + exports 映射；移除 `apps/web/nuxt.config.ts` 里
  `vite.optimizeDeps.include: ['@studyplan/shared']` 的 CJS 兜底并验证客户端交互
  （该兜底失效的症状是「页面内容在但所有交互都是死的」）

---

## ✅ 批次 2 完成（2026-10-08）

**范围**：Zod 4 替 class-validator · lru-cache 替手写缓存 · Octokit 替 259 行 GitHub client（栈项 ④⑥⑦）。
**验证**：`apps/api` 全量 jest **12 suites / 169 tests 全绿**，`tsc --noEmit` 无报错，ESLint 无 error。
**验收边界**：本机无 docker、无 PG（5432/5433 均无监听），`node --test test/contract.rc-gates.test.mjs`
需要 :3200 上跑着的 Payload 服务，**本轮没跑**。批次 2 不触碰 Payload 路由，因此不算验收缺口，
但合入 main 前应在有容器的环境复跑一次。

### 2-1｜Zod 4（`apps/api/src/config/env.validation.ts`）

- 新增 `env.validation.spec.ts`，**15 条行为测试**。方法是先对**旧的 class-validator 实现**跑一遍：
  14 条直接通过（它们就是「保留语义」的证据），只有 1 条失败 ——
  「两个 JWT 密钥必须不同」这条规则在批次 2 之前**只写在注释和 `.env.example` 里，从来没有落成代码**。
  跨字段规则用 `.refine()` 补上，相同密钥现在直接启动失败。
- 错误文案形状保持 `【字段】原因、原因`，多个字段同时非法时**全部列出**；
  `config.get('PORT')` 仍然是 number，调用点一行没改（Nest `validate` 的签名没动）。
- 顺带消掉一个隐藏依赖：class-transformer 需要 `reflect-metadata`，纯单测里少 import 一次就
  `Reflect.getMetadata is not a function` —— 这正是这个文件此前**测不了**的直接原因。
- 口径未变：`DAILY_DIGEST_PUBLISH_HOUR=0`、`MIN_STARS=0`、`LANGUAGES=''` 仍是有效值。
  `config-values.ts` 的三个 reader 原样保留（它们读的是已校验过的值，不属于本批的替换范围）。

### 2-2｜lru-cache v11（`apps/api/src/modules/ai/ai.service.ts`）

- 答案缓存改成**两层**：进程内 lru-cache（`max: 200` + 毫秒 `ttl`）做热层，落库表继续当跨实例那层。
  新增 6 条测试：二次提问不打库、热层命中不耗额度、命中仍要落库、7 天后回源、
  换问题不串味、换项目上下文不共用条目。
- ⚠️ **选型文档有一处记错**：`coverage-matrix.md` 与 `final-stack.md` 写的「lru-cache `namespace` 选项」
  **v11 里不存在**（11.5.2 实测无该项）。键空间隔离改为用「一个键空间一个实例」表达 ——
  现在只有问答这一个空间；站内检索回来时再开第二个实例。
- `ttl` 显式指定 `perf: { now: () => Date.now() }`，两个理由：
  ① 与落库层的「读取时判新旧」用同一个钟，不然「7 天」有两套各算各的；
  ② lru-cache 在**模块加载时**就抓住了 `performance` 的引用，而 `jest.useFakeTimers()` 换掉的是
  **全局** `performance`，那个旧引用纹丝不动 —— 于是「推进 70 天」的 TTL 测试会**永不失效**，
  看着像覆盖了，其实什么都没测到。
- **没有违反缺口 #3**：库里不加 TTL、不加 `pg_cron`，仍然「查询时手动判过期」。

### 2-3｜Octokit（`apps/api/src/modules/github/github.client.ts`，259 → 294 行）

- 归零的是**手写 HTTP 层**：自己拼 URL、自己设 `Accept` / `X-GitHub-Api-Version` / `User-Agent`、
  自己判 `response.ok`。留下的是本项目独有的三件事：查询串规则（刻意不带 `language:`）、
  snake_case → 契约映射、**哪些失败返回 null**（可选能力）而哪些往上抛。
- 新增 `github.client.spec.ts`，**20 条测试** —— 这个类此前**零测试**。
  替身只打在 `@octokit/rest` 这一个符号上，其余全走真代码；并有一条断言
  `globalThis.fetch` **一次都不许被调用**，哪天有人把裸 fetch 加回来就红。
- 编译器抓出一个真差异：**Octokit v22 的 `search.repos` 具名参数是 `q`，不是旧文档里的 `query`**。
  手拼 URL 的旧写法不会报这个错，因为它根本不用具名参数 —— 这类差异正是替换的价值所在。
- 刻意**没挂** retry / throttling 插件：重试会吃掉 `GITHUB_INTRO_TIME_BUDGET_MS` 的时间预算，
  而选型文档给 Octokit 的能力清单里「限流重试」对应的 PoC **P26 仍未实测**。
  要开就等 P26 有结论，不能顺手加上当作已通过。

### 顺手修掉的批次 1 遗留（全是 CJS→ESM 的后坐力，此前无人发现）

| # | 问题 | 处置 |
| --- | --- | --- |
| 1 | `apps/api/jest.config.js` 是 CJS 语法，而包已经是 `"type": "module"` → jest 根本起不来，**整套后端单测自批次 1 之后一次都没跑过** | 改名 `jest.config.cjs`（`git mv`） |
| 2 | `packages/shared` 转 ESM 后源码里写 `./types/user.js`，jest 的解析器不会把 `.js` 退回 `.ts` → 8 个 suite 报 `Cannot find module` | `moduleNameMapper` 加一条剥后缀的映射 |
| 3 | 上面两条把第三件事盖住了：`daily-digest` 撤回用例把「帖子已不在」的桩写成普通 `Error`，而 R-B 第一层认的是 `NotFoundException` | 用例改抛 `NotFoundException`（**改测试不改实现**，实现是对的、注释也早就写清了） |
| 4 | `@octokit/rest` v22 整条依赖链 ESM-only，jest 的 CJS 侧载不动 | `transformIgnorePatterns: []`，全部交给 ts-jest 转译。实测代价：全套 67 秒（原本约 55 秒）。按包名开白名单能压到约 60 秒，但 Octokit 每升一次版就可能冒出新的 ESM-only 依赖，不值得背这笔维护债 |
| 5 | 要转译 node_modules 里的 ESM 依赖，ts-jest 需要 `allowJs` | `apps/api/tsconfig.json` 加 `allowJs: true`；`include` 仍只有 `src/**/*.ts`，产物与类型检查范围不变 |

### 🔴 本轮新发现的风险（不属于批次 2，但要记账）

`.github/workflows/ci.yml` 在**本分支**被提交 `d8ac2e1`（一次 docs 提交）删除，而 `origin/main` 上仍然存在。
看起来是误删。合入 main 之前要先定：**恢复 CI**，还是本来就打算换掉流水线。

---

## 批次 2–11 规划

| 批次 | 内容 | 栈项 | 前置 | 验收要点 | 回退 |
| --- | --- | --- | --- | --- | --- |
| ~~**2**~~ ✅ | **（2026-10-08 完成，见上节）** Zod 4 替 class-validator（557 行 env 校验）；lru-cache 替手写缓存；Octokit 替 259 行 GitHub client | ④⑥⑦ | 1③ | 两条语义都已落成代码并有测试 | — |
| **3** | OTel 替 requestId 112 行 + 分段计时 169 行；Langfuse 作 OTLP sink（**不引 Collector**） | ⑧ | 2 | span 属性不含 body/header/Cookie/token（不可违反项 8） | 保留自研 requestId |
| **4** | Vercel AI SDK 替裸 fetch 303 行；pgvector 替 140 行内存点积；**本地 embed** | ②⑨ | 1② | 见下方「批次 4 硬约束」 | 外部 provider 回退 |
| **5** | Payload Jobs Queue 承接 daily-digest 执行侧；九步流程 + 撤回四步 | ③ | 4 | **P32**：cron 只执行不触发，时区换算留应用层（Vercel Cron 仍为触发源） | 回退 BullMQ（栈项 11→12） |
| **6** | 错误包络映射层（`ApiErrorBody`）；Zod `.strict()` 替 `forbidNonWhitelisted` | ③④ | 1③ | 响应体无堆栈；多传 `authorId` 返回 400 | — |
| **7** | 额度原子化（`ON CONFLICT DO UPDATE`）；7 天答案缓存；代码索引 | ②⑤⑥⑨ | 4 | 并发 50 次只放行 300 次 | — |
| **8** | 收口：14 条不可违反项 + 7 条顺序敏感项逐条核对；403/404 区分；groupBy 统计 | ③② | 1③ | 逐项签字 | — |
| **9** | Agent：`ToolLoopAgent` 主实现 + LangGraph.js 对比实现（可选）+ Langfuse 30 条评测门禁 | ⑨⑩⑧ | 4 | 两套实现产出等价答案；未装 LangGraph 时以默认实现启动 | — |
| **10** | Nuxt Content 3 接管 30 篇（**`/ebook` 前缀**）+ Meilisearch + 重定向分两次发布 | ⑪ | P19 ✅ | 见下方「批次 10 硬约束」 | — |
| **11** | 部署收口：compose 去 mongo、Supabase Session pooling 连接串、**TTFB 实测** | ①② | 10 | 无 6.6s 尖峰 | 跨区 + 四层缓解 |

### 批次 4 硬约束（本轮实测得出）

- 依赖 `@huggingface/transformers@4.3.1`，模型 **`Xenova/bge-large-zh-v1.5`**，`dtype: 'q8'`
- ❌ **不要用 `BAAI/bge-large-zh-v1.5`** —— 该仓库**没有 ONNX 文件**，transformers.js 加载不了
- ❌ **不要用 `quantized: true`** —— v4 已改用 `dtype`，传旧参数会**静默回退到 fp32（1,238 MB）**
- 权重 312 MB，维度 **1024**（与现状 `postembeddings.vector(1024)` 对齐，**不需改表**）
- 模型缓存在 `node_modules` 内 → **`pnpm install` 会清空**；Docker 必须把该目录烤进镜像层，
  否则每次冷启动重下（实测首次 82.7s，其中约 79s 是下载；热身后仅 1.5s）

### 批次 10 硬约束（P19 实测得出）

- 必须显式装 **`better-sqlite3`**（Nuxt Content 3 的硬性要求，且 Node 24 无预编译包 → 从源码编译）
  → `node:24-alpine` 镜像需加 `python3 make g++`
- **Nuxt Content 3 不会自动为 `type: 'page'` 生成路由**，必须自建 catch-all + `queryCollection().path()`
- 实际 **30 篇**（非文档记录的 31 篇，缺 `guide/roadmap-rewrite-lessons.md`）；除 `index.md` 外**均无 frontmatter**
- `routeRules` 的 301 **必须在内容迁移完成后才启用**；简写 `{redirect:'/x'}` 发的是 **307**，要 301 须显式 `statusCode`
- 构建陷阱：nitro 每次 `rm -rf .output` 会触发环境的批量删除保护 → **构建 exit 1 但仍用旧产物**，
  务必检查退出码（规避：重命名 `.output` 而非删除）

---

## 已知未决项

| # | 事项 | 影响 |
| --- | --- | --- |
| 1 | Payload schema 与手写 DDL 的取舍（A/B） | 阻塞 1② |
| 2 | **`search` / `roadmap` / `interview` 三个模块已不存在**（后端只剩 10 个模块） | `postembeddings` / `roadmap_progress` / `interview_questions` 三张表无 Mongoose 源，只能按 DDL 从 Mongo 集合直接映射（迁移脚本已如此实现） |
| 3 | `P1` DDL 漏了 `users.bio`（本轮已补） | 已修 |
| 4 | 宿主 5432 被原生 PG 18 占用，容器改到 **5433** | 部署时需核对；生产走 Supabase 时注意 **5432 二义性**（直连 vs Session pooling） |
| 5 | `poc/p19-docs/.output.bak-003631` 残留 | 需手工清理（批量删除保护拦截） |
