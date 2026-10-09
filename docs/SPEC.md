# 契约与验收规格

> 阶段 0 产出。后续所有 zod schema 都必须能追溯到本文条目；本文每条不变量都必须对应一个可执行的验收方式（测试或命令）。
> 从 `studyplan-v2.0` 继承的语义约定标注为 **[继承]**，v2.0 已知缺陷标注为 **[修正]**。

## 1. 通用包络

### 1.1 错误体（唯一形状）

所有失败路径（Server Action 抛错、Route Handler 抛错、zod 校验失败）都必须归一到同一结构：

```ts
export const ErrorBodySchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),           // 机器可读：BAD_REQUEST / UNAUTHORIZED / NOT_FOUND / CONFLICT / RATE_LIMITED / INTERNAL
  message: z.string(),        // 可直接展示给用户的中文提示
  requestId: z.string(),      // 与响应头 X-Request-Id 一致
  timestamp: z.string(),      // ISO 8601
  details: z.array(z.string()).optional(), // 字段级校验错误
})
```

**[修正]** v2.0 的 `shared/types/api.ts` 定义了 `ApiSuccessBody`（含 `statusCode / requestId / timestamp`），但 `routes/context.ts` 的 `ok()` 实际只产出 `{ data }`，`requestId` 从没进过响应体——契约定了、实现未落（v2.0 `request-id.ts:113` 自己也留下了这条注释）。**新项目必须让响应体真的带上 `requestId`。**

### 1.2 成功体

单进程架构下分两种形态，但都要求「可校验」：

- **Server Action 返回值**：直接返回领域对象（不套壳），但必须用 `shared/schemas` 里对应的 zod schema 做**出口校验**（`parse` 后再返回），避免把 Drizzle 内部字段透传出去。
- **Route Handler**（`/api/health` 等）：返回 `SuccessBodySchema`：

```ts
export const SuccessBodySchema = <T extends z.ZodType>(data: T) =>
  z.object({ statusCode: z.number().int(), data, requestId: z.string(), timestamp: z.string() })
```

### 1.3 字段白名单（[继承] v2.0 `toPostContract` / `toCommentContract`）

响应一律**逐字段显式挑选**，绝不直接返回数据库行对象。v2.0 的 `toPostContract()` 就是这么做的，新项目沿用该原则。

> 社区模块反转（D16）后 `toPostContract` / `toCommentContract` 不再需要；本原则保留，适用于仍存在的领域对象（如用户、电子书元数据）。

## 2. 领域契约

> 社区模块反转（D16）：`PostSchema` / `CommentSchema` / `LikeResultSchema` 废弃，主帖与点赞不再自研，评论改用 Giscus。以下仅保留仍生效的领域对象。

```ts
export const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  createdAt: z.string(),          // ISO 8601
})

// 废弃：社区模块反转（D16），主帖不再自研
export const PostSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  content: z.string(),            // MDX 原文
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  author: z.object({ id: z.string(), username: z.string() }),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  createdAt: z.string(),
})

// 废弃：评论改用 Giscus（D16）
export const CommentSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  content: z.string(),
  author: z.object({ id: z.string(), username: z.string() }),
  createdAt: z.string(),
})

// 废弃：点赞功能移除（D16）
export const LikeResultSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number().int().nonnegative(),   // 服务端真值，前端用它覆盖乐观值
})

export const HealthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptimeSeconds: z.number().int(),
  database: z.enum(['connected', 'disconnected']),
  timestamp: z.string(),
})
```

帖子详情的 `liked` 字段随社区模块反转移除（D16）。

## 3. 错误码表

| code | HTTP | 触发场景 | 用户可见 message |
| --- | ---:|---|---|---|
| `BAD_REQUEST` | 400 | zod 校验失败、`details` 带字段级提示 | 请求参数有误 |
| `UNAUTHORIZED` | 401 | `requireSession()` 拿不到会话 | 请先登录 |
| `FORBIDDEN` | 403 | 非作者删除资源（社区反转后评论/帖子不适用，D16） | 没有权限执行该操作 |
| `NOT_FOUND` | 404 | 非法 UUID（通用）；资源不存在 | 内容不存在或已被删除 |
| `CONFLICT` | 409 | 邮箱或用户名重复 | 该邮箱或用户名已被注册 |
| `RATE_LIMITED` | 429 | 触发限流 | 操作过于频繁，请稍后再试 |
| `INTERNAL` | 500 | 未分类内部错误 | 服务暂时不可用，请稍后重试 |

## 4. id 与命名规则

- **物理列名统一 snake_case**（`like_count`、`created_at`），TS 侧 camelCase 由 Drizzle schema 映射。
  **[修正]** v2.0 同时存在 camelCase（`likeCount`，collection 层）与 snake_case（`like_count`，SQL 层），`toPostContract` 读一种、`adjustPostCounter` 读另一种，是真实的 bug 源。新项目由 Drizzle 单一来源控制，不存在两套。
- **公开 id 一律 UUID v4**；非法 UUID 在访问数据库前转 404，避免 PostgreSQL 类型错误泄漏成 500（[继承] v2.0 `context.ts` 的 `UUID_RE` 前置校验）。
- **id 映射表 `id_migrations`**：第一批只建表与导入骨架，为后续 Mongo ObjectId → UUID 的历史链接兼容预留（见 §7）。

## 5. 不变量验收条目（源自文档 §4.6）

每条都写成「可执行的验收方式」，后续每阶段逐条勾选。

| # | 不变量 | 验收方式 |
| --- | --- | --- |
| V1 | 身份只来自后端验证过的会话，不信参数里的用户字段 | 契约测试：请求体塞 `authorId` / `role` 必须被 zod `.strict()` 拒绝（400）；单元测试断言 `requireSession()` 是唯一身份来源 |
| V2 | 应用级所有权判断留在 Server Action，并有契约测试（社区反转后暂无自研所有权，D16） | 测试：非作者删他人评论 → 403；作者删自己评论 → 204 |
| V3 | 复杂 SQL 收敛在少数有注释、有测试的位置 | 代码评审 + 测试：`lib/db/` 下每个自定义 SQL 函数都有对应测试 |
| V4 | 计数更新必须原子化（社区反转后暂无数可计，机制保留，D5/D16） | 迁移测试：并发 20 次点赞/取消后 `like_count` 与 `COUNT(likes)` 一致；`GREATEST(0, …)` 保证不为负 |
| V5 | 观测配置失效不能阻止业务启动；禁止裸 `console.*` 绕过脱敏 logger | 测试：logger 初始化失败时应用仍能启动；lint 规则禁止 `console.*`（除 logger 自身） |
| V6 | 生产入口、本地 compose、默认 dev 脚本指向同一架构 | CI 三条命令序列一致；`docker build` 后容器 smoke 与本地 smoke 命中相同端点 |

## 6. 继承的语义约定（来自 v2.0 只读提取）

### 6.1 点赞幂等（[继承] · 已移除，D16）

- 用 `PUT / DELETE` 而非 toggle：顺序重试天然幂等。
- 唯一索引 `(post_id, user_id)` 是正确性基石；重复 PUT 命中唯一冲突时**返回幂等成功且不加计数**。
- 取消时先查后删；行不存在时返回 `{ liked: false, likeCount: 真值 }`。
- **请求体压根不被读取**，`postId` 来自路径、`userId` 来自令牌。

### 6.2 计数原子（[继承] · 暂无数可计，机制保留，D5/D16）

v2.0 用 `UPDATE posts SET x = GREATEST(0, x + delta) RETURNING x` 绕过 ORM 的整对象赋值。新项目改用**数据库触发器**在 `comments` / `likes` 行增删时原子增减，但保留两条语义：

- `GREATEST(0, …)` 兜底，永不出现负计数；
- 服务层只写一条互动记录，**不手写两步更新**。

### 6.3 日志脱敏（[继承]）

- 路径 redact：`headers.authorization`、`cookie`、`password*`、`token*`、`secret`、`apiKey`、`DATABASE_URL` 等（v2.0 `REDACT_PATHS` 有完整清单）。
- 全字符串截断 160 字符 + 密钥原文替换为 `***`（防凭据混进自由文本）。
- **请求体整体不落日志**。
- span/日志只写错误 **code**，不写 message 原文（message 里常有 SQL 片段与路径）。

### 6.4 可选能力不得阻断启动（[继承]）

观测、AI、检索降级一律走「warn + 关闭」而非 throw。这条同样适用于第二批的本地模型——模型不可用必须降级到「LLM + 网络搜索」兜底。

## 7. 第一批不做的（显式边界）

真实嵌入与向量检索、HNSW 索引、AI 助手 UI、GitHub 趋势、每日推荐与 cron、Meilisearch、路线进度与面试题、帖子编辑/删除 UI、个人主页、真实 Mongo 数据导入、多实例全局限流、admin 后台。

> 社区互动模块移出第一批（D16）：主帖 `posts` 与点赞 `likes` 不再实现，评论改用 Giscus（数据存 GitHub Discussions，不在本仓库模型内）。RAG 检索对象仍为电子书。§2/§3/§5/§6 中相应条目标注为废弃或暂缓。
>
> **注意**：「不做」不等于「没有规格」。上述条目中与第二批相关的行为契约已继承到 §8（AI 缓存 / AI 状态与额度 / RAG 拒答 / 单实例限流档位），实现时直接按 §8 执行，不需要回读 v2.0 源码；§8.6 是唯一一处「暂缓且恢复时必须先读」的数据建模教训。

## 8. 继承功能契约（来自 v2.0 源码只读提取，2026-10-09）

> 本节是 README/主支中「有行为、无文档」的功能缺口的补写。事实来源为 v2.0 源码（非 README 转写），路径以 `v2.0/` 缩写指代 `C:\Users\User\Documents\studyplan-v2.0\apps\api\src`。每项标注归属：**[第一批]** / **[第二批]** / **[暂缓-恢复时须知]**。

### 8.1 健康检查 `/api/health`（[继承] · [第一批]）

- **只检查数据库连通性**（v2.0 用 terminus `pingCheck`，超时 5s；当前只有 MongoDB 一个指示器，新项目对应 PostgreSQL + pgvector 可达性）。
- **503 语义是本契约的核心**：任一依赖不可用 → 整个端点返回 **503**，平台据此判定容器「真的不健康」；200 才算健康。区别于「进程活着」（TCP 存活 ≠ 依赖可用，这是冷启动/断连场景的关键区分）。
- 响应体用本仓 §2 的 `HealthStatusSchema`（`status: ok | degraded` + `database: connected | disconnected`），HTTP 状态码与 `status` 字段联动：`degraded` ⇔ 503。
- 健康检查路径**不套统一响应包装**（v2.0 显式排除在 `transform.interceptor` 之外，理由：保持平台/探针约定形状）。新项目同理：`/api/health` 不走 §1.2 的 `SuccessBodySchema` 包装。
- 验收：断开数据库 → `/api/health` 返回 503 且 `database: 'disconnected'`；恢复 → 200 且 `status: 'ok'`。

### 8.2 单实例限流档位（[继承] · [第一批]）

多实例全局限流已在 §7 推迟（内存计数器多实例必然失效，v2.0 `deployment-lessons.md` 坑 9 已如实记录），但**单实例档位值照 v2.0 继承，实现时不得改动**。第一批实际生效的只有 default 与 register / login / refresh 四档（D16 后第一批无发帖与 AI 模块）；其余档位随对应模块启用（第二批或恢复时），值如下：

| 档位 | limit / 60s | 说明 |
| --- | --- | --- |
| default | 30 | 全局默认（v2.0 `app.module.ts`） |
| register | 5 | 注册 |
| login | 10 | 登录 |
| refresh | 60 | Token 刷新（高，因为前端静默续期） |
| createPost | 10 | 发帖 |
| aiAsk / agentAsk | 各 10 | AI 问答（两档同值，分开计数） |
| semanticSearch / askBook | 30 / 10 | 检索 / 电子书问答 |
| repoIntros | 10 | 仓库简介批量生成 |
| digestRead / digestGenerate | 20 / 10 | 每日报道读 / 生成 |

- **只读接口豁免**：trending 类只读路由不挂限流（v2.0 豁免 `/api/trending`、`/api/auth/logout`；`github.controller.ts` 注释原文：「保护 GitHub 配额的责任在 Service 层——最小刷新间隔 + 缓存，而不是限流」）。
- 触发限流 → §3 的 `RATE_LIMITED`（429，message「操作过于频繁，请稍后再试」）。
- 新项目实现载体未单独选型（README 目标态曾选 rate-limiter-flexible 内存后端）；第一批单实例下任意内存实现均可，**换库/换载体不得改变上表档位语义**。

### 8.3 AI 答案缓存（[继承] · [第二批]）

v2.0 事实：`ANSWER_CACHE_TTL_MS = 7 × 24h`（`v2.0/.../ai/ai.service.ts:27`），双层缓存 = 进程内 LRU（max 200 条）+ 持久表 `ai_answer_cache`（v2.0 为 Mongo 集合，新项目为 PG 表）。

- **键空间隔离**：`sha256(问题.trim().toLowerCase() + '|' + 上下文名).slice(0, 32)`——按「问题 + 检索上下文」隔离，**不含用户 id**（同一问题全局共享一份答案）。
- **禁 TTL**（硬约束，v2.0 `ai-usage.schema.ts:52-55` 注释原文）：不用数据库 TTL 索引/定时清理，过期判定放**读路径**（`now - createdAt > TTL` 视为未命中）。理由：TTL 索引清理有最长 60s 延迟、过期时间写死在索引里难调。新项目为 PG，同样禁用 cron 清理，读路径判定。
- **额度语义**：命中缓存**不消耗当日额度**，响应带 `cached: true`；未命中先扣额度再调模型，成功后回写缓存。
- **旁路降级**：缓存读写失败只 warn，不得影响答案返回（呼应 §6.4）。
- **[修正]** v2.0 键内**不含模型名**——换模型后旧缓存仍命中，属于隐性缺陷。新项目键必须加入模型标识。
- 验收：同一问题二次提问返回 `cached: true` 且额度计数不变；跨模型提问**不**命中旧缓存。

### 8.4 `/api/ai/status` 状态与每日额度（[继承] · [第二批]）

响应字段（v2.0 `ai.service.ts:275-290`，7 个）：`enabled` / `keyConfigured` / `model` / `remainingToday` / `limitPerDay` / `codeIndexLoaded` / `codeIndexFiles`。

- **未配 Key 照常启动**：Key 为空 → `enabled: false`、`keyConfigured: false`，问答接口返回 `reason: 'not-configured'`，应用其余部分完全正常（呼应 §6.4 与 V5）。
- **每日额度默认 300**，env 可覆盖；按**自然日重置**（v2.0 用 UTC 日期串做键，日期变更即自然清零，无重置任务）。**[修正]** v2.0 计数「先读再增」非原子，并发可略超——新项目必须用原子 upsert（`ON CONFLICT` + 单条 UPDATE）。
- **模型名必须配置化，绝不写死**：v2.0 经 env `NVNIM_MODEL` 注入（默认 `openai/gpt-oss-20b`）。理由（README 踩坑实录）：**上游模型会下线（实测 410 Gone）**，写死模型名 = 上游一动就全站 AI 失效。新项目对应 D10 的 baseURL / apiKey / model 三项环境变量（具体变量名实现时定，D10 只锁「全部可配置」这一决策）。
- `codeIndexLoaded` / `codeIndexFiles`：代码索引由**构建期脚本**生成 JSON（运行时容器内无源码），**启动时预热加载**（非懒加载，理由是可观测性——日志立刻能看到「已加载 N 个文件」）；加载失败置空数组不阻断启动。`codeIndexLoaded = fileCount > 0`，可区分「索引缺失」与「加载成功 N 条」。
- 验收：无 Key 启动 → `/api/ai/status` 返回 `enabled:false`、HTTP 200；配 Key 后问答 300 次后第 301 次返回额度用尽（限流/额度是**两种不同的失败**，用户该做的事不同，不得混为同一个错误码）。

### 8.5 RAG 拒答原则（[继承] · [第二批]）

**「检索为空时宁可拒答」**（README 四条贯穿取舍之一）。v2.0 实现事实：检索为空**不**短路返回，而是照常调模型，但 prompt 中**无条件注入**全局指令（`v2.0/.../ai/prompts/ask-question.prompt.ts:34`）：

> 「**只能依据下面给出的资料作答**。资料里没有的内容，直接说明『资料中没有提到』，绝不猜测或编造。」

配套要求：回答须引用确实看到的来源路径；检索片段总长截断（v2.0 为 6000 字符）。新项目把这条升级为**验收条目**：构造检索必空的提问，断言模型输出包含拒答语义且不含编造的来源引用。

### 8.6 弱引用级联删教训（[暂缓-恢复时须知] · [修正] 归档）

v2.0 `daily_picks.postId` 是 `String` 弱引用（无外键、无 ref 校验），撤回报道流程曾存在**两层静默失效**：删帖失败不检查仍级联删评论与点赞 → 帖子留存但互动数据永久丢失、计数永久错误，全程无报错。

**v2.0 当前源码已修复**（`v2.0/.../daily-digest/daily-digest.service.ts` `runRevoke()`，注释自证「R-B 第一层：失败必须分层处置」），修复后的语义即为将来恢复每日精选/互动模块时的正确范式：

1. 删帖 404 → 视为幂等成功，warn 后继续；
2. 删帖其它错误 → error 日志 + **立即中止**，不执行任何级联清理；
3. **只有删帖确认成功**才级联删评论/点赞；
4. 根因层面：新项目（PG）用**外键强引用 + 事务**替代弱引用，不存在此缺陷类别——但「级联清理必须以主资源删除成功为前提」这条顺序约束仍写进规格。

本条目恢复相关模块（每日推荐、互动）前无需实现，恢复时**必须先读本节**。
