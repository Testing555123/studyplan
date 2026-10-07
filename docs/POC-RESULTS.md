# PoC 执行结果（2026-10-07）

> **范围**：TECH-SELECTION.md §9 的 ①/③/④ 组收尾。
> **环境**：`studyplan-pg` 容器（PG 16.15 + pgvector 0.8.7 + pg_trgm 1.6），宿主端口 **5433**（见文末「环境修正」）。

## ③ 组 · 环境修正（执行前置）

| 现象 | 实测 | 处置 |
| --- | --- | --- |
| `studyplan-pg` 状态 | **Exited (255)**，非「已在跑」 | 启动 Docker Desktop（WSL `docker-desktop` 处于 Stopped）后拉起 |
| 宿主 5432 应答者 | **原生 PostgreSQL 18**（Windows 服务 `postgresql-x64-18`），**非**容器 | 容器重建到宿主 **5433**：`docker rename studyplan-pg studyplan-pg-5432-legacy` 后用**原数据卷**起新容器，旧容器保留可回退 |
| 原生 PG 18 是否有 pgvector | **无**（`lib/` 与 `share/extension/` 下零 `vector*` 文件） | 不采用它；仍用容器的 PG 16 + pgvector |
| `node_modules` | **缺失** | `pnpm install --frozen-lockfile`（命中本地 store，离线完成） |

连接串：`postgresql://postgres:postgres@127.0.0.1:5433/<db>`

> ⚠️ **Windows 侧执行 SQL 的坑**：`Get-Content -Raw | docker exec -i ... psql` 会带上 UTF-8 BOM，
> 导致 `ERROR: syntax error at or near "﻿"`。**必须用 `docker cp` 拷进容器后用 `psql -f` 执行。**

## ③ 组 · P1（14 集合 + 35 索引）✅ 通过，并修复一处缺陷

复跑环境：`poc_verify` 库（每次 DROP/CREATE 保证干净）。

| 核查项 | 期望 | 实测 | 判定 |
| --- | --- | --- | --- |
| 表数 | 14 | **14** | ✅ |
| 主键索引 | 14 | **14** | ✅ |
| 唯一索引（非主键） | 14 | **14**（`uniq_idx=28` 减去 14 个 PK） | ✅ |
| 索引总数 | 36（14 PK + 21 Mongo 映射 + 1 HNSW） | **36** | ✅ |
| `pg_cron` | 0（硬约束 #3） | **0** | ✅ |
| `posts.tags` 用 GIN | 是（硬约束 #4） | **1** | ✅ |
| `daily_pick_excludes.date` 非唯一 | 是（硬约束 #2） | **0**（非唯一） | ✅ |
| pgvector | 0.8.7 | **0.8.7** | ✅ |

**🐞 修复的缺陷（原脚本真实存在）**：
`poc/p1-schema.sql` 同时创建了 `posts_created_at` 与 `posts_created_at_btree`，两者**完全重复**（同为 `ON posts (created_at DESC)`）。这是当初为硬约束 #4 拆 GIN 时留下的残留，会导致**写入放大**。已删除后者，索引总数 37 → **36**。

## ③ 组 · P30（`daily_picks` 外键）✅ 通过，并修复一处**静默数据丢失**缺陷

**🐞 修复的缺陷（原脚本真实存在，且后果严重）**：
原步骤顺序是「① 映射写回 → ② 非法值置 NULL」。而 ② 的判据是 `post_id !~ '^[0-9a-f]{24}$'` ——
**映射写回之后该列已是 36 字符带连字符的 UUID 字面量，同样不匹配 24 位 hex，会被无条件置 NULL。**

后果：**所有成功映射的 `post_id` 全被抹掉**，且 `ALTER COLUMN TYPE uuid` 静默成功、`ADD CONSTRAINT` 也成功，
**全程不报错**。另外它使后续「ON DELETE SET NULL」的验证退化成**假通过**（那行本来就已经是 NULL）。
这正是 R-B 要防的类型：不报错，但数据没了。

修复：顺序改为 **① 非法值置 NULL → ② 映射写回 → ③ 映射为空置 NULL**（清理必须先于写入）。

**断言（A1–A11 全绿）**：

| 断言 | 结果 |
| --- | --- |
| A1 合法 OID 已转 UUID | **1** ✅ |
| A2 / A10 合法 hex 但无目标帖 → NULL | **1 / 1** ✅ |
| A3 / A11 非法值 → NULL（不报错） | **1 / 1** ✅ |
| A4 列类型 | **uuid** ✅ |
| A5 外键存在 | **1** ✅ |
| A6 删帖后引用（阶段一） | **(NULL)** ✅ |
| A7 孤儿引用被拒 | **OK** ✅ |
| A8 目标帖子确已删除（排除假通过） | **OK** ✅ |
| A9 对照组删帖后（A1 已证明删前持有 uuid） | **(NULL)** ✅ |

> 📌 **复跑装置的教训**：阶段一里 `2026-10-07` 那行在脚本内部就被 `DELETE` 掉了，
> 若在脚本结束后才断言「映射成功」，恒为 0 —— 那是**假失败**。
> 故新增阶段二：新建一张 `varchar` 表（1b-2 之后原表的 `post_id` 已是 `uuid`，无法再插入 ObjectId 复现转换）
> 完整重跑 ①→⑤，用不会被删掉的对照帖子验证两个方向。

## ③ 组 · P31（密码哈希三道闸门）✅ 通过

**先修复了对现状的错误认知** —— code-explorer 全仓核实发现：

| 闸门 | 现状 | 真实状态 |
| --- | --- | --- |
| 1 · 查询期 `select: false` | `user.schema.ts:57` | ✅ 有效，但**换 Drizzle 后消失** |
| 2 · 编译期 `UserLean` | `users.mapper.ts:11-18` | ❌ **今天就已经失效** |
| 3 · 输出期 `toPublicUser()` | `users.mapper.ts:38-47` | ✅ 有效（纯 TS，可直接移植） |

**闸门 2 失效的实证**：`auth.service.ts:181` 与 `:195` 写的是
`toPublicUser(user.toObject() as unknown as UserLean)` —— `as unknown as X` 是**双重断言**，
会把 TypeScript 的结构化检查彻底关掉。所以「接口不含 passwordHash → 编译报错」这条注释，
在**注册 / 登录 / refresh / me 四条路径上一条都不成立**。
旁证：`users.service.ts` 全方法**一次 `.lean()` 都没用过**，`UserLean` 从未描述过任何真实查询结果，
它一直是「文档上的闸门」。

另：全仓读 `passwordHash` 只有 6 处，`users` 模块也无 Controller（无直接把文档丢给前端的出口）；
**`users` 模块 4 个文件零 spec**，且 `auth.service.spec.ts` 的假数据里根本没有 `passwordHash` 字段
—— 即便把 `toPublicUser` 改成全量展开，现有测试也照样通过。

**重建结果**（`poc/p31-gates.mjs` + `poc/p31-password-gates.test.mjs`）：

- 闸门 1：不存在默认全列查询，只有两个**列清单写死**的专用查询
  `findAuthByEmail`（3 列）/ `findPublicById`（6 列，不含 `password_hash` 与 `updated_at`）
- 闸门 2：`UserAuthRow`（含）与 `UserPublicRow`（不含）两个窄类型，**禁止 `as unknown as`**
- 闸门 3：`toPublicUser()` 逐字段挑选原样保留

测试（`node --test`，5/5 通过，跑在真实 PG 上）：

| # | 测试 | 结果 |
| --- | --- | --- |
| ① | 按 email 查认证数据 → 含 passwordHash | ✅ |
| ② | 按 id 查公开数据 → 不含 passwordHash | ✅ |
| ③ | `toPublicUser` 输出键集合**恰好**是 6 个键（防 `{...row}` 全量展开） | ✅ |
| ④ | 反证：`SELECT *` 确实带出 password_hash（故须禁止） | ✅ |
| ⑤ | 非法 uuid 不触达数据库（换库后不能让 PG 抛 invalid input syntax） | ✅ |

**闸门 2 的编译期验证**（`tsc --checkJs --strict`，故意的负面样本）：
```
error TS2339: Property 'passwordHash' does not exist on type 'UserPublicRow'.
error TS2345: Argument of type '{ id: string; }' is not assignable to parameter of type 'UserPublicRow'.
```
✅ 闸门 2 在按新写法重建后**真的会报错** —— 与现状的双重断言形成对照。

### 🔍 附带发现：文档「PG 无 `select:false` 等价物」这句不准确

TECH-SELECTION.md §8.5.3 断言 PG 没有对应物。实测（`poc/p31-password-gates.sql`）**PG 有原生等价物：列级 GRANT/REVOKE**。

| 实测项 | 结果 |
| --- | --- |
| `has_column_privilege(app, users, 'password_hash', 'SELECT')` | **false** |
| `has_column_privilege(app, users, 'username', 'SELECT')` | **true** |
| 受限角色 `SELECT *` | **ERROR: permission denied for table users** ✅ 被挡 |
| 受限角色 `SELECT password_hash` | **ERROR** ✅ 被挡 |
| 受限角色显式公开列清单 | ✅ 成功 |
| 受限角色 INSERT / UPDATE | **false** ⚠️ 代价 |

**裁定：不采纳为第一批强制项，记为可选纵深防御。** 理由：
① 应用需要写库（注册 / 改资料），列级 SELECT + 表级 INSERT/UPDATE 的组合可行但需角色分离；
② Payload / Drizzle 生成的 SQL 若出现 `SELECT *` 或 `RETURNING *` 会**直接报错**——
虽然是 fail-loud（比静默泄漏好），但会打断正常路径；③ 迁移需 DDL 权限，又要一个独立角色。
第一批采用「显式列清单 + 窄类型 + `toPublicUser` + 约定禁止 `select *` + 两条测试」即可满足 R-C。

---

# ④ 组 · P19（Nuxt Content 3 实机构建）✅ 通过，16/16

沙盒：`poc/p19-docs/`（独立 Nuxt 应用，`--ignore-workspace` 安装，**不改动 `apps/web`**）。

| 验收项 | 结果 |
| --- | --- |
| Nuxt 4.5.2 + @nuxt/content 3.16.1 构建 | ✅ 成功 |
| 内容篇数 | **29**（30 篇 md 减去 index.md） |
| 29 条内容路由均 200 且 **SSR 首屏含 `<h1>`** | ✅ |
| 5 组导航（开始之前/阶段正文/经验档案/设计/规划练习） | ✅ 全部存在 |
| `stages/stage-1` 与 `exercises/stage-1` 同名不同前缀互不吞掉 | ✅ |
| 旧路径 301 → `/ebook/...` | ✅ 4/4 |
| 新路径不被重定向（无自环）且重定向链只有一跳 | ✅ |

## P19 的五个关键发现（都会影响批次 10 的实施）

**① 必须显式安装 `better-sqlite3`** —— Nuxt Content 3 直接报
`Nuxt Content requires better-sqlite3 module to operate`，它不在 `@nuxt/content` 的依赖里。
且 **Node 24 没有预编译包，本次回退到 node-gyp 从源码编译**（MSVC）。
→ 容器（`node:24-alpine`）需要 `python3 make g++`，**Dockerfile 必须加构建依赖**。

**② Nuxt Content 3 不会自动为 `type: 'page'` 集合生成路由。**
模块源码（`dist/module.mjs`）里**没有** `extendPages` / `addPage` / `pages:extend` 任何一处。
必须自己建 catch-all 页面 + `queryCollection('docs').path(route.path).first()`。
这与「Nuxt Content 会接管路由」的直觉相反 —— 实测前我按「会自动生成」配置，29 条路由**全部 404**。

**③ 实际是 30 篇，不是文档记录的 31 篇** —— 缺 `guide/roadmap-rewrite-lessons.md`。
30 篇中**除 `index.md` 外都没有 frontmatter**，标题来自正文首个 `#`；
`index.md` 的 frontmatter 是 VitePress 专属（`layout: home` / `hero`），迁移时不能照搬。

**④ 最大的排查陷阱：构建静默失败、一直用旧产物。**
Nitro 每次构建会 `rm -rf .output`（1107 个文件），触发环境的批量删除保护（阈值 500）→
构建 **exit 1**，但 `.output` 仍是上一版。表现为「改了页面却 404」，极易误判为配置错误。
**务必检查 `nuxt build` 的退出码**；规避方式是把 `.output` 重命名而不是删除。

**⑤ 三个小坑**：块注释里出现「星号+星号+斜杠」会提前闭合注释（报错信息完全不指向真因）；
`app.vue` 必须用 `<NuxtPage />` 而非 `<slot />`（后者外壳在、内容空）；
`routeRules` 的简写 `{ redirect: '/x' }` 默认发 **307**，要 301 必须显式写 `statusCode`。

> 🧹 待手工清理：`poc/p19-docs/.output.bak-003631`（环境的批量删除保护拦截了自动清理）。

---

# ① 组残留 · P7 与缺口 #5（embed 方案）✅ 裁定完成

## P7（Zen chat 半）—— ❌ 保持阻塞

实测 `OPENCODE_API_KEY` / `NVNIM_API_KEY` / `NIM_API_KEY` / `AI_API_KEY` **全部为空**，且项目根**无 `.env`**。
与文档 §9.5 记录一致。按用户裁决：**保持阻塞、记录并跳过** —— P7 不阻塞开工（D12 有回退方案 BullMQ）。

## 缺口 #5（embed）→ ✅ 采用 transformers.js 本地嵌入（用户 2026-10-08 确认）

### 模型选择的实时修正

| 项 | 文档/我此前的假设 | 实时核实结论 |
| --- | --- | --- |
| 模型 id | `BAAI/bge-large-zh-v1.5` | ❌ **该仓库无 ONNX 文件**（tags 里没有 `onnx`），transformers.js **加载不了** |
| 正确模型 | — | ✅ **`Xenova/bge-large-zh-v1.5`**（`library_name: transformers.js`，含 `model_quantized.onnx` / `fp16` / `int8` / `q4` / `q4f16`） |
| 量化体积 | 约 400 MB | ❌ 实测 fp32 **1,238 MB**；✅ q8 **312 MB** |

### 实测结果（`poc/p5-embed-local.mjs`，真实 PG/真实模型）

| 档位 | 权重体积 | 热身加载 | 单条耗时 | 维度 | 中文相似度（相关 / 无关） |
| --- | --- | --- | --- | --- | --- |
| fp32 | **1,238 MB** | 3,599 ms | 79.0 ms | 1024 | 0.7655 · 0.7041 / **0.1990** |
| **q8（选定）** | **312 MB** | **1,478 ms** | **64.8 ms** | **1024** | **0.7706 · 0.7065 / 0.2111** |

判定全绿：① 维度 = 1024（与现状 `postembeddings.vector(1024)` **对齐，不需改表**）
② 相关 > 无关（0.7065 > 0.2111）③ 相关对 > 0.7 ④ L2 归一化（与现状写入口径一致）。

### 三个必须记住的坑

**① `quantized: true` 在 transformers.js v4 已被静默忽略。**
v4 改用 `dtype`（`fp32` / `q8` / `int8` / `fp16` / `q4` …）。我用 `quantized:true` 跑出来的相似度
与 fp32 **一字不差**（0.7655/0.7041/0.1990），查缓存才发现**只下载了 1,238 MB 的 fp32**，量化版根本没拉。
**危险在于它是静默的** —— 你会以为在用 312 MB 的量化版，实际在下载 1.2 GB。

**② 首次加载的 82.7s 里约 79s 是下载，不是推理。**
热身后再跑只要 1.5–3.6s。所以「冷启动慢」这个问题**必须用「把模型烤进镜像」解决**，而不是换模型。

**③ 模型缓存在 `node_modules` 内部**，路径是
`node_modules/.pnpm/@huggingface+transformers@4.3.1_.../node_modules/@huggingface/transformers/.cache/Xenova/bge-large-zh-v1.5/onnx/`
→ **`pnpm install` 会清空它**，Docker 构建时必须显式把该目录拷进镜像层，否则每次冷启动重下 312 MB。

### 对批次 4 的约束

- 依赖：`@huggingface/transformers@4.3.1`（Apache-2.0）+ **`dtype: 'q8'`**（不是 `quantized: true`）
- 模型：`Xenova/bge-large-zh-v1.5`，权重 312 MB，维度 1024
- Dockerfile.vercel 需：构建期预下载模型到镜像层 + 保留缓存目录
- 保留外部 provider 作为**可配置回退**（容器内存 / 冷启动仍是风险点）
