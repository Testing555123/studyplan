# 语义搜索与「问全书」RAG 问答 · 设计规格

- 日期：2026-09-25
- 状态：已与项目所有者逐节评审通过（口头确认），待书面复核
- 范围：后端新 `search` 模块 + `ai` 模块扩展 `embed()` + 前端新 `/search` 页 + 回填脚本

## 1. 背景与目标

StudyPlan 站内已有帖子（posts）、评论、点赞、GitHub 榜单与 AI 摘要，但内容发现只有关键词/标签筛选。本项目已有一个 RAG 雏形——`/ai/ask` 学习助手（`code-index.service.ts`），它的检索是关键词匹配，且注释里明确写了「刻意没有用向量检索」。本功能把这块欠补上：

1. **语义搜索**：输入一句自然语言，按语义相关度返回帖子列表；
2. **问全书（RAG 问答）**：对全站帖子内容做检索增强问答，回答带 `[n]` 引用来源。

**成功标准**：见 §8 验收标准。核心一条是语义泛化——搜「前端框架怎么选」能召回不含这五个字但主题相关的帖子。

**约束**（项目既有底线，全部保持）：

- 零新增运行时依赖（NIM 是 OpenAI 兼容接口，`fetch` 直调）；
- MongoDB Atlas M0 免费层可用（M0 不支持 `$vectorSearch`，需 M10+，见 §9 否决项）;
- AI 是旁路不是主链路：任何 AI/embedding 故障不得阻断发帖与浏览；
- 前后端类型契约先行，全部进 `@studyplan/shared`。

## 2. 总体架构

```text
前端 /search 页（双 Tab）
   │
   ├─ Tab1 语义搜索 ──▶ POST /api/search/semantic   （公开，IP 限流 30 次/分钟）
   └─ Tab2 问全书   ──▶ POST /api/search/ask        （JWT 守卫，用户级限流 10 次/分钟）
                              │
                    ┌─────────┴──────────┐
                    │  search 模块（新增）│
                    │  VectorStoreService │◀── postembeddings 集合
                    │  SearchService      │     （向量 + 元数据）
                    └─────────┬──────────┘
                              │ embed()        │ chat()
                    ┌─────────┴──────────┐     │
                    │  ai 模块（扩充）    │◀────┘
                    │  NvNimClient + /embeddings 端点
                    └────────────────────┘
```

关键决策：

| 决策 | 理由 |
|---|---|
| 新 `search` 模块而非塞进 `ai` | `ai` 模块职责是「模型调用」（旁路、永不抛异常）；检索有自己的生命周期（向量缓存、回填、失效）。`ai` 只加 `embed()` 方法，既有契约不变。 |
| RAG 问答复用 `AiService` 三道闸 | 先查缓存（`AiAnswerCache`，hash 问题）→ 再耗额度（`tryConsumeQuota()` 已是 public）→ 生成。失败语义沿用 `AskAiResponse.reason` 分类。 |
| 写入链路搭现成异步旁路 | 发帖 → 异步摘要 → 摘要成功后用 `title + summary + content` 生成 embedding 写入 `postembeddings`。AI 未配置时整条链路静默降级。 |
| 存量回填用独立脚本 | 不做启动自动回填，避免冷启动不可预测地烧 API 额度。 |

## 3. 数据模型与向量存储

### 3.1 `postembeddings` 集合

独立集合，不内嵌进 post 文档——向量数组几 KB，会让每次列表查询拖着它走。

```text
{
  postId:    ObjectId   ← 唯一索引，对应 posts._id
  model:     string     ← 产生该向量的模型名，如 'baai/bge-m3'
  dim:       number     ← 维度，如 1024
  vector:    [number]   ← 写入前做 L2 归一化
  createdAt/updatedAt: Date  ← timestamps: true
}
```

- `model` + `dim` 入库而不是只记在环境变量：换 embedding 模型时启动比对「记录 model ≠ 配置 model」，报明确 warn 提示全库重建，防止新旧向量混库让点积悄悄算出错误结果。与 `NVNIM_MODEL` 下线防御同源。
- 向量写入前 L2 归一化：余弦相似度退化为点积，热路径省开方与除法。

### 3.2 被向量化的文本

`title + '\n' + (summary ?? '') + '\n' + content`，截断到 2000 字符。不做 chunking——帖子受 `CONTENT_MAX_LENGTH` 上限约束本来就不长，单段向量够用（YAGNI，见 §9）。

### 3.3 VectorStoreService

内存结构：`Map<postId, { vector: Float32Array, model: string }>` + `loadedAt` 时间戳。

- **惰性全量载入 + TTL 失效（5 分钟）**，不做 ChangeStream 实时同步。写端（embedding 生成成功时）顺手把新向量放进缓存，新帖几秒内可搜，TTL 只是兜底。
- **查询**：遍历 Map 算点积取 topK（K=8，搜索与问答共用），再 `find({ _id: { $in: ids } })` 回 posts 取详情、按分数排序。千级向量 × 1024 维毫秒级。
- **降级**：载入失败/集合为空 → 空 Map → 返回空结果 + `reason: 'index-empty'`。永不抛异常，与 `AiService` 同契约。
- **启动预热**：`onModuleInit` 载入并打日志「已加载 N 条向量」，延续 code-index「启动即暴露问题」的教训。

## 4. API 契约（`@studyplan/shared` 新增）

### 4.1 `POST /api/search/semantic`（公开）

请求 DTO：`{ query: string }`，trim 后 1~200 字符（class-validator，与 `create-post.dto.ts` 同风格）。

```ts
interface SemanticPostResult {
  post: Post;        // 复用现有 Post 契约，前端卡片组件零改动渲染
  score: number;     // ∈ [0,1]，归一化向量点积即余弦相似度
}
interface SemanticSearchResponse {
  results: SemanticPostResult[];           // 按 score 降序
  reason: null | 'index-empty' | 'not-configured' | 'error';
}
```

限流：ThrottlerGuard，IP 30 次/分钟。

### 4.2 `POST /api/search/ask`（需登录）

请求 DTO：`{ question: string }`，trim 后 1~500 字符。

```ts
interface AskSource {
  postId: string;
  title: string;
  score: number;
}
interface AskSearchResponse {
  answer: string | null;
  reason: null | 'quota-exceeded' | 'rate-limited' | 'not-configured'
           | 'no-sources' | 'error';       // 与 AskAiResponse 同构，仅新增 no-sources
  sources: AskSource[];                     // answer 正文以 [1][2] 标注引用
  cached: boolean;
  remainingToday: number;
}
```

- `no-sources`：检索为空时**不调用 chat、直接短路返回**，防幻觉最便宜的闸门，同时省额度。
- 限流：JwtAuthGuard + 用户级 10 次/分钟 + 复用 `NVNIM_DAILY_LIMIT` 每日额度闸。

### 4.3 RAG Prompt 结构

topK 帖子的「编号 + 标题 + 摘要 + 正文前 500 字符」拼入 system prompt，要求：只依据资料回答、用 `[n]` 标注引用、资料不足明说。输出上限沿用 `chat()` 默认 800 token。Prompt 文件放 `search/prompts/ask-posts.prompt.ts`，与现有 prompts 目录惯例一致。

### 4.4 状态端点扩展

`GET /api/ai/status` 契约新增三个字段：

```ts
embedModel: string;          // 当前生效的 embedding 模型名
vectorCount: number;         // 已入库向量条数
vectorStoreReady: boolean;   // vectorCount > 0
```

前端据此渲染 `/search` 的空态；部署者多一条自检线索。

## 5. 前端（`/search` 页）

`apps/web/app/pages/search.vue`，UTabs 双 Tab，Bento 风格延续现状。URL 即状态：`/search?mode=ask&q=...`，刷新/分享保留 Tab 并自动执行（与 `roadmap.vue` 参数处理同惯例）。

**Tab 1 语义搜索**：

- 顶部大搜索框 + 示例问题 chip（「如何学 NestJS？」「前端性能从哪下手？」）；
- debounce 400ms 自动搜索（沿用 `useRoadmapSearch` 模式）；
- 结果复用帖子卡片——从 `posts/index.vue` 抽出卡片组件（顺手的局部重构，仅限此目的，不做无关重构）；
- 卡片右上角相关度徽章（如 `92%`）；
- 降级文案：`index-empty` → 「站内内容还不够」；`not-configured` → 「AI 服务未启用」（与 AiAssistant 语气一致）。

**Tab 2 问全书**：

- 未登录：整个回答区替换为登录引导卡（`navigateTo('/login?redirect=/search')`），不允许输完问题才被弹走；
- 回答用现有 `useMarkdown` 渲染；`[n]` 引用后处理成可点击脚注，点击滚动到来源列表并高亮；
- 来源列表：topK 迷你卡（标题 + 分数），点击进详情；
- 显示 `remainingToday`（与 AiAssistant 抽屉同款小字）。

**导航**：`AppHeader` 新增「搜索」入口。命令面板不接入（本期不做）。

**Composables**：`useSemanticSearch.ts`、`useAskSearch.ts`，请求走 `useApi` 现有封装。

## 6. 配置与失败处理

### 6.1 配置项（进 `env.validation.ts`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `NVNIM_EMBED_MODEL` | `baai/bge-m3` | 独立于 `NVNIM_MODEL`：对话模型下线不该连累向量库重建 |
| `NVNIM_API_KEY` | 现有 | 复用，同一 NIM 账号 |
| `NVNIM_DAILY_LIMIT` | 现有 | 复用问答额度；**embedding 调用不计额**（站内内容自身成本，非用户触发的对话成本） |

`NvNimClient.embed(texts: string[]): Promise<number[][]>`：`POST /embeddings`，支持批量；错误转译复用 `describeFailure()`（410 提示改 `NVNIM_EMBED_MODEL`）；超时 10 秒独立于 chat 的 25 秒。

### 6.2 失败矩阵

| 故障 | 行为 | 用户感知 |
|---|---|---|
| 发帖时 embed 失败 | warn 日志，帖子照常保存 | 无；该帖暂缺向量，回填兜底 |
| 问/搜时 query embed 失败 | `reason: 'error'` | 提示重试 |
| 向量缓存载入失败 | 空 Map + 启动日志暴露 | 搜索返回 `index-empty` |
| 模型下线（410） | `embed()` 抛可诊断消息 | 新帖停止入库，回填修复后自动接上 |

### 6.3 帖子生命周期同步（`posts.service`）

- 更新标题/正文 → 删旧向量 + 重新生成（异步旁路）；
- 删除帖子 → 级联删向量，位置与顺序同现有「先清关联集合再删主档」清理逻辑。

### 6.4 回填脚本 `scripts/backfill-embeddings.mjs`

- 默认模式：`posts._id` 与 `postembeddings.postId` 差集，只补缺失，幂等 upsert；
- `--rebuild`：全库重算。若库中存在 `model` ≠ 当前配置的记录，默认模式**拒绝运行**并提示改用 `--rebuild`（新旧向量混库时点积无意义，防呆必须硬）;
- 批量 32 条/请求，打印进度，结束报告「补 N / 跳过 M / 失败 K」；
- 注册为 `pnpm backfill:embeddings`。

## 7. 测试策略

**单元（Jest，mock fetch 风格同 `ai.service.spec.ts`）**：

- `VectorStoreService`：固定向量断言 topK 顺序与分数；维度不符/空库/模型混用边界；TTL 过期重载；
- `NvNimClient.embed()`：批量正常路径、410 转译指向 `NVNIM_EMBED_MODEL`、超时 AbortError；
- `SearchService`：文本拼接与 2000 字符截断；`no-sources` 短路（spy 断言未调用 chat）；
- RAG prompt 构建纯函数：快照测试。

**E2E（Playwright）**：

- 搜索 Tab：输入 → 出结果 → 点卡片进详情；
- 问答 Tab：未登录见登录引导卡；登录后提问见引用来源。

## 8. 验收标准（可执行、可肉眼确认）

1. 搜「前端框架怎么选」能召回标题正文均不含这五字但主题相关的帖子；
2. 问答回答带 `[1][2]` 引用，点击跳到来源并高亮对应帖子；
3. 未登录在 UI 上看不到提问入口；绕过 UI 直接调 `/api/search/ask` 返回 401；
4. `NVNIM_API_KEY` 改错 → 发帖依然成功、`/search` 显示降级提示、日志不泄漏密钥（阶段 7 验收续篇）；
5. `pnpm backfill:embeddings` 连跑两次，第二次报「补 0」；模型错位时默认模式拒绝并提示 `--rebuild`；
6. `pnpm test` 全绿，CI 通过。

## 9. 明确不做（YAGNI 清单）

| 不做 | 为什么 |
|---|---|
| Atlas `$vectorSearch` / 升级 M10+ | 免费层底线；且托管检索让项目失去「亲手算相似度」这个最好的教学点。内存扫描到万级帖子的性能余量足够。 |
| Postgres + pgvector | 第二套数据库与部署链路，重构面过大，收益与 M0 方案差距在本量级不可感知。 |
| 长文分段（chunking）检索 | 帖子受 `CONTENT_MAX_LENGTH` 约束，单向量够用。 |
| 搜评论区 / 电子书正文 | 本期语料只有 posts，扩展语料是下一个独立需求。 |
| ChangeStream 实时同步向量缓存 | 写端缓存 + 5 分钟 TTL 兜底已满足新鲜度要求。 |
| 命令面板接入语义搜索 | 独立 `/search` 页已覆盖入口需求。 |

## 10. 执行阶段的后续动作

本 spec 通过后，进入 `writing-plans` 编写实现计划；实现阶段遵循项目 TDD 惯例（先测后码），每步验收对应 §8。
