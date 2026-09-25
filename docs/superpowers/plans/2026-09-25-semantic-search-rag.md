# 语义搜索与「问全书」RAG 问答 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为站内帖子建立基于 NVIDIA NIM embedding 的语义搜索与「问全书」RAG 问答（前端 `/search` 双 Tab 页）。

**Architecture:** 新增后端 `search` 模块（向量存储 + 检索 + RAG 编排），`ai` 模块只扩充 `embed()` 方法；向量存 MongoDB `postembeddings` 集合、内存点积检索（Atlas M0 不支持 `$vectorSearch`）。依赖方向单向：posts → search → ai。

**Tech Stack:** NestJS 11、Mongoose、NVIDIA NIM（OpenAI 兼容 `/embeddings`）、Nuxt 4 + Nuxt UI、Jest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-25-semantic-search-rag-design.md`

## Global Constraints

- Node ≥ 20.19.0；pnpm workspace，包名：`@studyplan/api`、`@studyplan/web`、`@studyplan/shared`。
- **零新增运行时依赖**（embedding 用 Node 内置 `fetch` 直调 NIM）。
- 后端单测命令：`pnpm --filter @studyplan/api test -- <关键字>`；shared 构建：`pnpm build:shared`；全量：`pnpm test`。
- 注释用简体中文、解释"为什么"，密度跟随周围代码。
- AI 是旁路：任何 embedding/LLM 失败**不得**让发帖、评论、登录失败；Service 层永不抛异常，失败表达为返回值（`reason`）。
- 契约先行：新类型一律先加到 `packages/shared`，前端禁止 import 后端内部类型。
- 环境变量必须可选且带默认值（不得让未配置的新变量炸掉任何环境的启动）。
- 每个 Task 结束 commit 一次；提交信息用 Conventional Commits（仓库现状风格）。

## Review Focus

spec 隐含但单个 task 的测试容易漏掉的输入类别，逐条列出并已在对应 task 里钉死测试：

1. **纯空白查询**（`"   "`）→ DTO `@Trim()+@MinLength(1)` 返回 400，不是 500、也不是全零分结果（Task 5）。
2. **孤儿向量**（帖子已删、向量还在库里）→ 结果里过滤掉、并从缓存中顺手剔除（Task 5）。
3. **模型混库**（库里同时存在新旧两种 model 的向量）→ 检索只取 `model === 当前配置` 的记录，错位的静默排除而不是算出错误分数（Task 3、8）。
4. **零范数向量**（embedding 返回全零）→ `l2Normalize` 除零防护，该向量得 0 分被过滤，绝不产生 `NaN` 分数（Task 4）。
5. **AI Key 中途失效** → 发帖仍成功、新帖停止入库、问答返回 `reason: 'error'`，全程无 500（Task 6、7）。

---

## 文件结构总览

```text
packages/shared/src/types/search.ts          （新建）搜索/问答/状态契约
packages/shared/src/index.ts                 （修改）re-export search
apps/api/src/config/env.validation.ts        （修改）+NVNIM_EMBED_MODEL
apps/api/src/modules/ai/nv-nim.client.ts     （修改）+embed() +currentEmbedModel
apps/api/src/modules/ai/ai.service.ts        （修改）+公开的缓存读写
apps/api/src/modules/search/
  schemas/post-embedding.schema.ts           （新建）
  vector-store.service.ts                    （新建）内存向量库
  embedding.service.ts                       （新建）embedding 生成/归一化/落库
  search.service.ts                          （新建）语义检索 + RAG 编排
  prompts/ask-posts.prompt.ts                （新建）
  dto/semantic-search.dto.ts / ask-posts.dto.ts（新建）
  search.controller.ts                       （新建）
  search.module.ts                           （新建）
  *.spec.ts                                  （新建，随各 task）
apps/api/src/modules/posts/posts.service.ts  （修改）摘要后顺带 embedding
apps/api/src/modules/posts/posts.module.ts   （修改）imports SearchModule
apps/api/src/app.module.ts                   （修改）注册 SearchModule
apps/api/scripts/backfill-embeddings.mjs     （新建）
package.json（根）                            （修改）+backfill:embeddings
apps/web/app/components/PostCard.vue         （新建，从 posts/index.vue 提取）
apps/web/app/pages/search.vue                （新建）
apps/web/app/composables/useSemanticSearch.ts / useAskSearch.ts（新建）
apps/web/app/components/AppSidebar.vue       （修改）导航 +「智能搜索」
apps/web/e2e/studyplan.spec.ts               （修改）新增用例
```

---

### Task 1: shared 契约类型

**Files:**
- Create: `packages/shared/src/types/search.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: 现有 `Post`（`types/post.ts`）
- Produces: `SemanticPostResult`、`SearchUnavailableReason`、`SemanticSearchResponse`、`AskSource`、`AskPostsUnavailableReason`、`AskSearchResponse`、`SearchStatus`、`SEARCH_QUERY_MAX_LENGTH = 200`、`ASK_QUESTION_MAX_LENGTH = 500`（后续所有 task 与前端引用）

- [ ] **Step 1: 写 `packages/shared/src/types/search.ts`**

```ts
import type { Post } from './post'

/** 语义搜索的查询文本长度上限（DTO 校验与后端截断共用同一个数字） */
export const SEARCH_QUERY_MAX_LENGTH = 200
/** 「问全书」单次问题长度上限 */
export const ASK_QUESTION_MAX_LENGTH = 500

/** 一条语义搜索结果：帖子本体 + 相关度（[0,1]，归一化向量点积） */
export interface SemanticPostResult {
  post: Post
  score: number
}

/**
 * 搜索不可用的原因。细分理由与 AskAiResponse 同一套路：
 * 用户该做的下一步完全不同（'index-empty' 是内容不够，'not-configured' 是没配 Key）。
 */
export type SearchUnavailableReason = 'index-empty' | 'not-configured' | 'error'

export interface SemanticSearchResponse {
  results: SemanticPostResult[]
  reason: SearchUnavailableReason | null
}

/** 问答引用到的来源帖子。sources 里的 postId 与 answer 正文中的 [1][2] 编号一一对应 */
export interface AskSource {
  postId: string
  title: string
  score: number
}

/** 与 AiUnavailableReason 同构，多一个 'no-sources'（检索为空时不硬编答案） */
export type AskPostsUnavailableReason =
  | 'not-configured'
  | 'quota-exceeded'
  | 'rate-limited'
  | 'no-sources'
  | 'error'

export interface AskSearchResponse {
  answer: string | null
  reason: AskPostsUnavailableReason | null
  sources: AskSource[]
  cached: boolean
  remainingToday: number
}

/** GET /search/status：前端据此决定空态文案，部署者据此自检 */
export interface SearchStatus {
  aiEnabled: boolean
  embedModel: string
  vectorCount: number
  vectorStoreReady: boolean
}
```

- [ ] **Step 2: 在 `packages/shared/src/index.ts` 追加导出**

在现有 `export * from './types/ai'` 附近追加一行（保持分组风格）：

```ts
export * from './types/search'
```

- [ ] **Step 3: 构建验证**

Run: `pnpm build:shared`
Expected: `tsc` 无输出、退出码 0

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/search.ts packages/shared/src/index.ts
git commit -m "feat(shared): add semantic search & RAG contracts"
```

---

### Task 2: NvNimClient.embed()

**Files:**
- Modify: `apps/api/src/modules/ai/nv-nim.client.ts`
- Modify: `apps/api/src/config/env.validation.ts`（追加 `NVNIM_EMBED_MODEL`）
- Test: `apps/api/src/modules/ai/nv-nim.embed.spec.ts`（新建，独立文件避免动现有 spec）

**Interfaces:**
- Consumes: `ConfigService` 的 `NVNIM_API_KEY` / `NVNIM_EMBED_MODEL`
- Produces: `NvNimClient.embed(texts: string[]): Promise<number[][]>`（原始未归一化向量，顺序与输入一致）、`NvNimClient.currentEmbedModel: string`（getter）。Task 4 依赖这两个签名。

- [ ] **Step 1: env.validation.ts 追加配置**

在 `NVNIM_MODEL` 字段之后追加（注释按周围风格补"为什么独立于对话模型"）：

```ts
  /**
   * Embedding 模型名。**独立于 NVNIM_MODEL 单独可配**：
   * 对话模型下线不该连累整个向量库重建，两者的生命周期完全不同。
   * baai/bge-m3 为多语言模型（中英通吃），1024 维。
   */
  @IsOptional()
  @IsString()
  NVNIM_EMBED_MODEL: string = 'baai/bge-m3'
```

- [ ] **Step 2: 写失败的测试 `nv-nim.embed.spec.ts`**

```ts
import { ConfigService } from '@nestjs/config'
import { NvNimClient } from './nv-nim.client'

function createClient(values: Record<string, string | undefined> = {}): NvNimClient {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService
  return new NvNimClient(config)
}

const originalFetch = global.fetch

describe('NvNimClient.embed', () => {
  afterEach(() => {
    global.fetch = originalFetch
  })

  it('未配置 Key 时抛可诊断错误', async () => {
    await expect(createClient().embed(['hi'])).rejects.toThrow('AI 功能未启用')
  })

  it('批量输入按 index 对齐返回向量，请求体带 model 与 input 数组', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k', NVNIM_EMBED_MODEL: 'test/embed' })
    const vectors = await client.embed(['a', 'b'])

    // 乱序返回也必须按 index 排回输入顺序
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ])
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.model).toBe('test/embed')
    expect(body.input).toEqual(['a', 'b'])
  })

  it('410 时提示更换 NVNIM_EMBED_MODEL 而不是 NVNIM_MODEL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 410,
      statusText: 'Gone',
    }) as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k', NVNIM_EMBED_MODEL: 'old/model' })
    await expect(client.embed(['a'])).rejects.toThrow('NVNIM_EMBED_MODEL')
  })

  it('上游返回空 data 视为失败', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch

    const client = createClient({ NVNIM_API_KEY: 'k' })
    await expect(client.embed(['a'])).rejects.toThrow('向量')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- nv-nim.embed`
Expected: FAIL（`embed is not a function`）

- [ ] **Step 4: 实现 embed()**

在 `nv-nim.client.ts` 中：字段区追加常量与成员（跟随现有注释风格说明"为什么 10 秒"）：

```ts
/** NIM 的 embeddings 端点与 chat 同 baseURL */
const EMBED_PATH = '/embeddings'
/** embedding 是短请求，10 秒足够；不给 chat 级的 25 秒是因为回填脚本要连续跑几百次 */
const EMBED_TIMEOUT_MS = 10_000
```

constructor 里追加 `this.embedModel = config.get<string>('NVNIM_EMBED_MODEL')?.trim() || DEFAULT_EMBED_MODEL`（新增 `const DEFAULT_EMBED_MODEL = 'baai/bge-m3'`，理由与 `DEFAULT_MODEL` 同款注释：模型会下线，必须可覆盖）。

在 `chat()` 之后追加：

```ts
  /** 当前生效的 embedding 模型名（供 /search/status 与混库检测使用） */
  get currentEmbedModel(): string {
    return this.embedModel
  }

  /**
   * 批量向量化。返回顺序与入参一致（上游按 index 标注，这里负责重排对齐）。
   * 失败时抛出的消息与 chat() 同约定：可直接展示、不含密钥。
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('AI 功能未启用：服务端未配置 NVNIM_API_KEY')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS)

    try {
      const response = await fetch(`${NVNIM_BASE_URL}${EMBED_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.embedModel,
          input: texts,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await this.describeEmbedFailure(response))
      }

      const payload = (await response.json()) as {
        data?: { index: number; embedding: number[] }[]
      }
      const rows = payload.data ?? []
      if (rows.length !== texts.length) {
        throw new Error(`AI 返回的向量数量与输入条数不一致（${rows.length}/${texts.length}）`)
      }

      return [...rows]
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`embedding 请求超时（${EMBED_TIMEOUT_MS}ms）`)
      }
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
    }
  }
```

并把 `describeFailure` 的 410/404 分支复用出来（不复制整段逻辑，抽第二个方法，只改模型名与环境变量名）：

```ts
  /** 与 describeFailure 同结构，唯一区别是提示换 NVNIM_EMBED_MODEL */
  private async describeEmbedFailure(response: Response): Promise<string> {
    if (response.status === 410 || response.status === 404) {
      return `Embedding 模型「${this.embedModel}」已下线或不存在，请在环境变量 NVNIM_EMBED_MODEL 中更换`
    }
    return this.describeFailure(response)
  }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @studyplan/api test -- nv-nim.embed`
Expected: PASS（4 个用例）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/nv-nim.client.ts apps/api/src/modules/ai/nv-nim.embed.spec.ts apps/api/src/config/env.validation.ts
git commit -m "feat(api): add batch embeddings call to NvNimClient"
```

---

### Task 3: postembeddings Schema 与 VectorStoreService

**Files:**
- Create: `apps/api/src/modules/search/schemas/post-embedding.schema.ts`
- Create: `apps/api/src/modules/search/vector-store.service.ts`
- Test: `apps/api/src/modules/search/vector-store.service.spec.ts`

**Interfaces:**
- Consumes: `NvNimClient.currentEmbedModel`（Task 2，仅测试提示语用，不直接依赖）
- Produces:
  - `PostEmbedding`（schema 类，`collection: 'postembeddings'`）
  - `VectorStoreService.search(query: Float32Array, options?: { topK?: number; currentModel?: string }): Promise<VectorHit[]>`，其中 `VectorHit = { postId: string; score: number }`
  - `VectorStoreService.put(postId: string, vector: number[], model: string): void`
  - `VectorStoreService.remove(postId: string): void`
  - `VectorStoreService.get size(): number`
  - `VectorStoreService.markStale(): void`

- [ ] **Step 1: 写 schema**

```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { Types } from 'mongoose'

/**
 * 帖子的向量（对应 MongoDB 的 `postembeddings` 集合）。
 *
 * 为什么独立成集合而不是内嵌进 post 文档？
 *   向量是 1024 个浮点数（几 KB），塞进 post 会让每次列表查询
 *   都把它一起搬回来，而列表页根本不读这个字段。
 *
 * 为什么存 model 与 dim？
 *   换 embedding 模型后新旧向量不可混用（维度可能不同、语义空间正交）。
 *   把"哪个模型产出的"记在每条记录上，检索时按当前模型过滤，
 *   混库从"悄悄算出垃圾分数"变成"可检测的状态"。
 */
@Schema({ timestamps: true, collection: 'postembeddings' })
export class PostEmbedding {
  /** 对应 posts._id，一帖一向量 */
  @Prop({ type: Types.ObjectId, required: true, index: { unique: true } })
  postId!: Types.ObjectId

  @Prop({ required: true })
  model!: string

  @Prop({ required: true })
  dim!: number

  /** 写入前已做 L2 归一化，点积即余弦相似度 */
  @Prop({ type: [Number], required: true })
  vector!: number[]
}

export type PostEmbeddingDocument = HydratedDocument<PostEmbedding>

export const PostEmbeddingSchema = SchemaFactory.createForClass(PostEmbedding)
```

- [ ] **Step 2: 写失败的测试**

```ts
import { VectorStoreService } from './vector-store.service'

/** find().lean().exec() 链式替身，返回固定行 */
function createStore(rows: Array<{ postId: string; model: string; vector: number[] }>) {
  const modelStub = {
    find: jest.fn().mockReturnValue({
      lean: () => ({
        exec: () =>
          Promise.resolve(rows.map((r) => ({ ...r, _id: r.postId }))),
      }),
    }),
  }
  // 该服务只依赖这一个 Model，直接 new（与 posts.service.spec 同款风格）
  const service = new VectorStoreService(
    modelStub as never,
    { get: () => 'test/model' } as never,
  )
  return { service, modelStub }
}

const v = (...nums: number[]) => Float32Array.from(nums)

describe('VectorStoreService', () => {
  it('按点积降序返回 topK', async () => {
    const { service } = createStore([
      { postId: 'a', model: 'test/model', vector: [0, 1] },
      { postId: 'b', model: 'test/model', vector: [1, 0] },
      { postId: 'c', model: 'test/model', vector: [0.6, 0.8] },
    ])

    const hits = await service.search(v(0.8, 0.6), { topK: 2 })

    expect(hits.map((h) => h.postId)).toEqual(['c', 'b'])
    expect(hits[0].score).toBeCloseTo(0.84)
  })

  it('排除与当前模型不一致的记录（混库防线）', async () => {
    const { service } = createStore([
      { postId: 'new', model: 'test/model', vector: [1, 0] },
      { postId: 'old', model: 'legacy/model', vector: [1, 0] },
    ])

    const hits = await service.search(v(1, 0), { currentModel: 'test/model' })

    expect(hits.map((h) => h.postId)).toEqual(['new'])
  })

  it('put 立即进缓存、remove 立即生效，不等 TTL', async () => {
    const { service } = createStore([])

    service.put('x', [1, 0], 'test/model')
    expect(await service.search(v(1, 0))).toHaveLength(1)

    service.remove('x')
    expect(await service.search(v(1, 0))).toHaveLength(0)
    expect(service.size).toBe(0)
  })

  it('markStale 之后重新从库载入', async () => {
    const { service, modelStub } = createStore([{ postId: 'a', model: 'test/model', vector: [1, 0] }])
    await service.search(v(1, 0))
    expect(modelStub.find).toHaveBeenCalledTimes(1)

    service.markStale()
    await service.search(v(1, 0))
    expect(modelStub.find).toHaveBeenCalledTimes(2)
  })

  it('数据库读失败时降级为空结果而不是抛异常', async () => {
    const badModel = {
      find: () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) }),
    }
    const service = new VectorStoreService(badModel as never, { get: () => 'm' } as never)

    await expect(service.search(v(1, 0))).resolves.toEqual([])
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- vector-store`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 VectorStoreService**

```ts
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { PostEmbedding } from './schemas/post-embedding.schema'

export interface VectorHit {
  postId: string
  score: number
}

interface StoredVector {
  vector: Float32Array
  model: string
}

/** 兜底重载周期：写端会即时更新缓存，这个 TTL 只是防漏网 */
const CACHE_TTL_MS = 5 * 60 * 1000

/** 检索默认返回条数：搜索与问答共用 */
const DEFAULT_TOP_K = 8

/**
 * 内存向量库：全量载入 → 点积扫描 → topK。
 *
 * 刻意不上向量数据库：M0 不支持 $vectorSearch，而本项目的量级
 * （千级向量 × 1024 维）内存扫描就是毫秒级。
 * 这是"先证明问题存在，再引入解决它的复杂度"的现成例子。
 * 契约与 AiService 同款：**永不抛异常**，失败降级为空结果。
 */
@Injectable()
export class VectorStoreService {
  private readonly logger = new Logger(VectorStoreService.name)

  private cache = new Map<string, StoredVector>()
  private loadedAt = 0
  private loading: Promise<void> | null = null

  constructor(
    @InjectModel(PostEmbedding.name)
    private readonly embeddingModel: Model<PostEmbedding>,
    config: ConfigService,
  ) {
    // 启动即载入：失败/为空要第一时间在日志里可见，不等第一个用户请求
    void this.reload()
  }

  get size(): number {
    return this.cache.size
  }

  /** 让下一次检索前先重载（回填脚本跑完后手动调用没有意义——跨进程，保留给测试与未来） */
  markStale(): void {
    this.loadedAt = 0
  }

  async search(
    query: Float32Array,
    options: { topK?: number; currentModel?: string } = {},
  ): Promise<VectorHit[]> {
    await this.ensureFresh()

    const topK = options.topK ?? DEFAULT_TOP_K
    const hits: VectorHit[] = []

    for (const [postId, stored] of this.cache.entries()) {
      if (options.currentModel && stored.model !== options.currentModel) continue
      if (stored.vector.length !== query.length) continue

      hits.push({ postId, score: dotProduct(query, stored.vector) })
    }

    return hits
      .filter((hit) => Number.isFinite(hit.score) && hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** 写端即时同步：embedding 落库成功后调用，新帖不用等 TTL */
  put(postId: string, vector: number[], model: string): void {
    this.cache.set(postId, { vector: Float32Array.from(vector), model })
    this.loadedAt = Date.now()
  }

  remove(postId: string): void {
    this.cache.delete(postId)
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.loadedAt < CACHE_TTL_MS) return
    if (this.loading) return this.loading
    this.loading = this.reload().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async reload(): Promise<void> {
    try {
      const rows = await this.embeddingModel.find().lean().exec()
      this.cache = new Map(
        rows.map((row) => [
          String(row.postId),
          { vector: Float32Array.from(row.vector as number[]), model: row.model as string },
        ]),
      )
      this.loadedAt = Date.now()
      this.logger.log(`向量缓存已加载：${this.cache.size} 条`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`加载向量失败（按空库降级）：${reason}`)
      this.loadedAt = Date.now()
    }
  }
}

/** 归一化向量的点积 = 余弦相似度；调用方保证两侧均已 L2 归一化 */
function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @studyplan/api test -- vector-store`
Expected: PASS（5 个用例）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/search
git commit -m "feat(api): add post embedding schema and in-memory vector store"
```

---

### Task 4: EmbeddingService（文本构造、归一化、落库）

**Files:**
- Create: `apps/api/src/modules/search/embedding.service.ts`
- Test: `apps/api/src/modules/search/embedding.service.spec.ts`

**Interfaces:**
- Consumes: `NvNimClient.embed()`（Task 2）、`VectorStoreService.put/remove`（Task 3）
- Produces:
  - `buildEmbeddingText(post: { title: string; summary?: string | null; content: string }): string`
  - `l2Normalize(vector: number[]): Float32Array`
  - `EmbeddingService.syncForPost(post: { id: string; title: string; summary?: string | null; content: string }): Promise<boolean>`
  - `EmbeddingService.removeForPost(postId: string): Promise<void>`
  - `EmbeddingService.embedQuery(text: string): Promise<Float32Array | null>`
  - `EmbeddingService.enabled: boolean`

- [ ] **Step 1: 写失败的测试**

```ts
import { EmbeddingService, buildEmbeddingText, l2Normalize } from './embedding.service'

describe('buildEmbeddingText', () => {
  it('拼接标题、摘要与正文，缺摘要时跳过空行', () => {
    expect(buildEmbeddingText({ title: 'T', content: 'C' })).toBe('T\nC')
    expect(buildEmbeddingText({ title: 'T', summary: 'S', content: 'C' })).toBe('T\nS\nC')
  })

  it('总长截断到 2000 字符', () => {
    const text = buildEmbeddingText({ title: 'T', content: 'x'.repeat(5000) })
    expect(text.length).toBeLessThanOrEqual(2001) // 2000 + 换行
    expect(text.startsWith('T\n')).toBe(true)
  })
})

describe('l2Normalize', () => {
  it('归一化后范数为 1', () => {
    const out = l2Normalize([3, 4])
    expect(out[0]).toBeCloseTo(0.6)
    expect(out[1]).toBeCloseTo(0.8)
  })

  it('零范数输入不产生 NaN（Review Focus #4）', () => {
    const out = l2Normalize([0, 0])
    expect(out.every(Number.isFinite)).toBe(true)
  })
})

describe('EmbeddingService.syncForPost', () => {
  function createService(options: { embed?: jest.Mock } = {}) {
    const embed = options.embed ?? jest.fn().mockResolvedValue([[1, 0]])
    const client = { enabled: true, embed, currentEmbedModel: 'test/model' }
    const model = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    }
    const store = { put: jest.fn(), remove: jest.fn() }
    const service = new EmbeddingService(
      client as never,
      store as never,
      model as never,
    )
    return { service, embed, model, store }
  }

  it('embed → 归一化 → upsert 入库 → 写端即时进缓存', async () => {
    const { service, embed, model, store } = createService()

    const ok = await service.syncForPost({ id: 'p1', title: 'T', content: 'C' })

    expect(ok).toBe(true)
    expect(embed).toHaveBeenCalledWith(['T\nC'])
    expect(model.updateOne).toHaveBeenCalledWith(
      { postId: 'p1' },
      expect.objectContaining({
        $set: expect.objectContaining({ model: 'test/model', dim: 2 }),
      }),
      { upsert: true },
    )
    expect(store.put).toHaveBeenCalledWith('p1', [1, 0], 'test/model')
  })

  it('embed 失败返回 false 且不抛（旁路纪律，Review Focus #5）', async () => {
    const { service, store } = createService({
      embed: jest.fn().mockRejectedValue(new Error('410 gone')),
    })

    await expect(service.syncForPost({ id: 'p1', title: 'T', content: 'C' })).resolves.toBe(false)
    expect(store.put).not.toHaveBeenCalled()
  })

  it('AI 未启用时静默跳过', async () => {
    const client = { enabled: false }
    const service = new EmbeddingService(client as never, {} as never, {} as never)

    await expect(service.syncForPost({ id: 'p1', title: 'T', content: 'C' })).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- embedding`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 EmbeddingService**

```ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { NvNimClient } from '../ai/nv-nim.client'
import { VectorStoreService } from './vector-store.service'
import { PostEmbedding } from './schemas/post-embedding.schema'

/** 参与向量化的文本上限。bge-m3 支持 8192 token，2000 字符（中英混排）远在限内 */
const EMBED_TEXT_MAX = 2000

/** 拼进 embedding 的文本：标题权重最高放最前，摘要次之（它本身就是 AI 浓缩） */
export function buildEmbeddingText(post: {
  title: string
  summary?: string | null
  content: string
}): string {
  const parts = [post.title]
  if (post.summary) parts.push(post.summary)
  parts.push(post.content)
  return parts.join('\n').slice(0, EMBED_TEXT_MAX)
}

/** L2 归一化。零向量原样返回——除零会产生 NaN，让它在下游过滤里自然得 0 分 */
export function l2Normalize(vector: number[]): Float32Array {
  const out = Float32Array.from(vector)
  let norm = 0
  for (const value of out) norm += value * value
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < out.length; i++) out[i] /= norm
  }
  return out
}

/**
 * 帖子 → 向量的一条龙：生成、归一化、落库、同步内存缓存。
 * 与 AiService 同契约：所有失败返回 false/null + warn，永不抛出。
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)

  constructor(
    private readonly client: NvNimClient,
    private readonly vectorStore: VectorStoreService,
    @InjectModel(PostEmbedding.name)
    private readonly embeddingModel: Model<PostEmbedding>,
  ) {}

  get enabled(): boolean {
    return this.client.enabled
  }

  async syncForPost(post: {
    id: string
    title: string
    summary?: string | null
    content: string
  }): Promise<boolean> {
    if (!this.client.enabled) return false

    try {
      const [raw] = await this.client.embed([buildEmbeddingText(post)])
      const normalized = l2Normalize(raw)

      await this.embeddingModel
        .updateOne(
          { postId: post.id },
          {
            $set: {
              postId: post.id,
              model: this.client.currentEmbedModel,
              dim: normalized.length,
              vector: Array.from(normalized),
            },
          },
          { upsert: true },
        )
        .exec()

      this.vectorStore.put(post.id, Array.from(normalized), this.client.currentEmbedModel)
      this.logger.log(`帖子向量已更新：${post.id}`)
      return true
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`帖子向量生成失败（${post.id}），可由回填脚本兜底：${reason}`)
      return false
    }
  }

  /** 给查询文本用：失败返回 null，调用方降级为 reason: 'error' */
  async embedQuery(text: string): Promise<Float32Array | null> {
    if (!this.client.enabled) return null
    try {
      const [raw] = await this.client.embed([text.slice(0, EMBED_TEXT_MAX)])
      return l2Normalize(raw)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`查询向量生成失败：${reason}`)
      return null
    }
  }

  async removeForPost(postId: string): Promise<void> {
    this.vectorStore.remove(postId)
    try {
      await this.embeddingModel.deleteOne({ postId }).exec()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`删除帖子向量失败（${postId}）：${reason}`)
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @studyplan/api test -- embedding`
Expected: PASS（6 个用例）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/search/embedding.service.ts apps/api/src/modules/search/embedding.service.spec.ts
git commit -m "feat(api): add embedding service with L2 normalization and store sync"
```

---

### Task 5: SearchModule + 语义搜索端点 + 状态端点

**Files:**
- Create: `apps/api/src/modules/search/search.service.ts`
- Create: `apps/api/src/modules/search/dto/semantic-search.dto.ts`
- Create: `apps/api/src/modules/search/search.controller.ts`
- Create: `apps/api/src/modules/search/search.module.ts`
- Modify: `apps/api/src/app.module.ts`（imports 追加 `SearchModule`）
- Test: `apps/api/src/modules/search/search.service.spec.ts`

**Interfaces:**
- Consumes: `EmbeddingService.embedQuery/enabled`（Task 4）、`VectorStoreService.search/remove`（Task 3）、`NvNimClient.currentEmbedModel`（Task 2）、`toPostContract`（`posts/posts.mapper.ts` 现成）、契约 `SemanticSearchResponse` / `SearchStatus`（Task 1）
- Produces: `SearchService.semanticSearch(query: string): Promise<SemanticSearchResponse>`；HTTP `POST /api/search/semantic`、`GET /api/search/status`；`SearchModule`（exports `[EmbeddingService, SearchService]`，Task 6/7 依赖）

- [ ] **Step 1: 写失败的测试 `search.service.spec.ts`**

```ts
import { SearchService } from './search.service'

function createService(options: {
  enabled?: boolean
  embedQuery?: jest.Mock
  hits?: Array<{ postId: string; score: number }>
  posts?: Array<{ _id: string; title: string }>
} = {}) {
  const embeddingStub = {
    enabled: options.enabled ?? true,
    embedQuery: options.embedQuery ?? jest.fn().mockResolvedValue(Float32Array.from([1, 0])),
  }
  const storeStub = {
    search: jest.fn().mockResolvedValue(options.hits ?? []),
    remove: jest.fn(),
    size: 0,
  }
  const postModelStub = {
    find: jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(options.posts ?? []) }),
    }),
  }
  const clientStub = { currentEmbedModel: 'test/model' }
  const service = new SearchService(
    embeddingStub as never,
    storeStub as never,
    postModelStub as never,
    clientStub as never,
  )
  return { service, embeddingStub, storeStub, postModelStub }
}

describe('SearchService.semanticSearch', () => {
  it('AI 未配置时返回 not-configured 而不抛', async () => {
    const { service } = createService({ enabled: false })
    const res = await service.semanticSearch('任意问题')
    expect(res).toEqual({ results: [], reason: 'not-configured' })
  })

  it('查询向量生成失败时返回 error', async () => {
    const { service } = createService({ embedQuery: jest.fn().mockResolvedValue(null) })
    const res = await service.semanticSearch('任意问题')
    expect(res.reason).toBe('error')
  })

  it('向量库为空时返回 index-empty', async () => {
    const { service } = createService({ hits: [] })
    const res = await service.semanticSearch('任意问题')
    expect(res).toEqual({ results: [], reason: 'index-empty' })
  })

  it('过滤孤儿向量并顺手从缓存剔除（Review Focus #2）', async () => {
    const { service, storeStub } = createService({
      hits: [
        { postId: 'alive', score: 0.9 },
        { postId: 'ghost', score: 0.8 },
      ],
      posts: [
        {
          _id: 'alive',
          title: 'T',
          content: 'C',
          tags: [],
          summary: null,
          aiTags: [],
          author: { id: 'u1', username: 'n' },
          likeCount: 0,
          commentCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        },
      ],
    })

    const res = await service.semanticSearch('任意问题')

    expect(res.results.map((r) => r.post.id)).toEqual(['alive'])
    expect(res.reason).toBeNull()
    expect(storeStub.remove).toHaveBeenCalledWith('ghost')
  })

  it('检索时按当前 embedding 模型过滤混库记录（Review Focus #3）', async () => {
    const { service, storeStub } = createService()
    await service.semanticSearch('q')
    expect(storeStub.search).toHaveBeenCalledWith(
      expect.any(Float32Array),
      { currentModel: 'test/model' },
    )
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- search.service`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 SearchService**

```ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { SemanticPostResult, SemanticSearchResponse } from '@studyplan/shared'
import { NvNimClient } from '../ai/nv-nim.client'
import { Post, PostLean } from '../posts/schemas/post.schema'
import { toPostContract } from '../posts/posts.mapper'
import { EmbeddingService } from './embedding.service'
import { VectorStoreService } from './vector-store.service'

/**
 * 检索编排：查询向量化 → 内存 topK → 回 posts 取详情。
 * 与 AiService 同契约：永不抛异常，失败都是返回值。
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name)

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    @InjectModel(Post.name)
    private readonly postModel: Model<Post>,
    private readonly client: NvNimClient,
  ) {}

  async semanticSearch(query: string): Promise<SemanticSearchResponse> {
    if (!this.embeddingService.enabled) {
      return { results: [], reason: 'not-configured' }
    }

    const queryVector = await this.embeddingService.embedQuery(query)
    if (!queryVector) {
      return { results: [], reason: 'error' }
    }

    const hits = await this.vectorStore.search(queryVector, {
      currentModel: this.client.currentEmbedModel,
    })
    if (hits.length === 0) {
      return { results: [], reason: 'index-empty' }
    }

    const docs = await this.postModel
      .find({ _id: { $in: hits.map((hit) => hit.postId) } })
      .lean()
      .exec()

    const byId = new Map(
      (docs as unknown as PostLean[]).map((doc) => [String(doc._id), doc]),
    )

    const results: SemanticPostResult[] = []
    for (const hit of hits) {
      const doc = byId.get(hit.postId)
      if (!doc) {
        // 孤儿向量：帖子已删但向量还在。自愈式剔除，不等全量重载
        this.vectorStore.remove(hit.postId)
        continue
      }
      results.push({ post: toPostContract(doc), score: hit.score })
    }

    if (results.length === 0) {
      return { results: [], reason: 'index-empty' }
    }

    return { results, reason: null }
  }
}
```

注意：`posts/schemas/post.schema.ts` 与 `posts.mapper.ts` 被跨模块 import，这是**文件级引用**不是模块依赖，不构成循环（search 不 import PostsModule）。若 `PostLean` 未被 mapper 文件导出，改为在 `posts.mapper.ts` 补 `export`（它现在是 `export interface PostLean`，已导出，无需改动）。

- [ ] **Step 4: DTO 与 Controller**

`dto/semantic-search.dto.ts`：

```ts
import { IsString, MaxLength, MinLength, Trim } from 'class-validator'
import { SEARCH_QUERY_MAX_LENGTH } from '@studyplan/shared'

export class SemanticSearchDto {
  @IsString({ message: 'query 必须是字符串' })
  @Trim()
  @MinLength(1, { message: 'query 不能是空白' })
  @MaxLength(SEARCH_QUERY_MAX_LENGTH, {
    message: `query 最多 ${SEARCH_QUERY_MAX_LENGTH} 个字符`,
  })
  query!: string
}
```

（纯空白串会在 Trim 后变成空字符串，被 MinLength 拦下返回 400 —— 这是 Review Focus #1 的落点。）

`search.controller.ts`：

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { SearchStatus } from '@studyplan/shared'
import { AiService } from '../ai/ai.service'
import { NvNimClient } from '../ai/nv-nim.client'
import { EmbeddingService } from './embedding.service'
import { VectorStoreService } from './vector-store.service'
import { SearchService } from './search.service'
import { SemanticSearchDto } from './dto/semantic-search.dto'

/** 语义搜索每次消耗一发 embedding 调用；比读接口严、比问答松 */
const SEMANTIC_LIMIT_PER_MINUTE = 30
const ONE_MINUTE_MS = 60_000

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly client: NvNimClient,
    private readonly aiService: AiService,
  ) {}

  @Post('semantic')
  @Throttle({ default: { limit: SEMANTIC_LIMIT_PER_MINUTE, ttl: ONE_MINUTE_MS } })
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: '语义搜索帖子',
    description: '输入自然语言，按向量相似度返回相关帖子。失败不抛错，在 reason 里给原因。',
  })
  async semantic(@Body() dto: SemanticSearchDto) {
    return this.searchService.semanticSearch(dto.query)
  }

  @Get('status')
  @ApiOperation({
    summary: '语义搜索状态',
    description: '返回向量库就绪状态与当前 embedding 模型，供前端空态与部署自检。',
  })
  async status(): Promise<SearchStatus> {
    return {
      aiEnabled: this.aiService.enabled,
      embedModel: this.client.currentEmbedModel,
      vectorCount: this.vectorStore.size,
      vectorStoreReady: this.vectorStore.size > 0,
    }
  }
}
```

`search.module.ts`：

```ts
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { Post, PostSchema } from '../posts/schemas/post.schema'
import { EmbeddingService } from './embedding.service'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'
import { PostEmbedding, PostEmbeddingSchema } from './schemas/post-embedding.schema'
import { VectorStoreService } from './vector-store.service'

/**
 * 语义搜索模块。依赖方向：posts → search → ai，单向。
 *
 * 这里重复 forFeature 注册了 PostsModule 的 Post schema ——
 * 为的是直接对 posts 集合做 $in 读，避免 import PostsModule 造成
 * posts ↔ search 的循环依赖（那个循环的正解是 forwardRef，
 * 而 forwardRef 在本项目里是「边界划错了」的信号，禁止引入）。
 * 同一个 schema 定义注册两次得到的是等价的 Model，没有第二份事实来源。
 */
@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: PostEmbedding.name, schema: PostEmbeddingSchema },
      { name: Post.name, schema: PostSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [VectorStoreService, EmbeddingService, SearchService],
  exports: [EmbeddingService, SearchService],
})
export class SearchModule {}
```

`app.module.ts`：import 区按字母序插入 `import { SearchModule } from './modules/search/search.module'`，imports 数组在 `RoadmapModule` 之后追加 `SearchModule`，注释一句话说明职责（跟随周围风格）。

- [ ] **Step 5: 跑测试确认通过 + 全量回归**

Run: `pnpm --filter @studyplan/api test -- search.service` → PASS
Run: `pnpm --filter @studyplan/api test` → 全绿（确认没碰坏 posts/ai 现有用例）

- [ ] **Step 6: 接口冒烟（本地 API 在跑时）**

Run: `curl.exe -s -X POST http://localhost:3000/api/search/semantic -H "Content-Type: application/json" -d '{"query":"   "}'`
Expected: 400，message 含「query 不能是空白」（Review Focus #1 的实证）

若本地 API 未运行，跳过并在汇报中注明「冒烟已推迟到 Task 11」。

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/search apps/api/src/app.module.ts
git commit -m "feat(api): add semantic search and status endpoints"
```

---

### Task 6: 发帖链路接入（摘要成功后顺带 embedding）

**Files:**
- Modify: `apps/api/src/modules/posts/posts.module.ts`（imports 追加 `SearchModule`）
- Modify: `apps/api/src/modules/posts/posts.service.ts`（constructor + enrichWithAi + update + remove）
- Modify: `apps/api/src/modules/posts/posts.service.spec.ts`（构造参数补 embedding 替身 + 新增用例）

**Interfaces:**
- Consumes: `EmbeddingService.syncForPost/removeForPost`（Task 4）、`SearchModule`（Task 5）
- Produces: 发帖/更新/删除后 `postembeddings` 与 posts 保持一致的生命周期（Task 8 回填脚本依赖这个不变量：**库里缺的向量都可以安全地补**）

- [ ] **Step 1: 先改测试（红）**

`posts.service.spec.ts` 顶部的服务构造辅助里，第三个参数补替身：

```ts
function createEmbeddingStub() {
  return {
    syncForPost: jest.fn().mockResolvedValue(true),
    removeForPost: jest.fn().mockResolvedValue(undefined),
  }
}
```

所有 `new PostsService(postModelStub, aiServiceStub)` 改为 `new PostsService(postModelStub, aiServiceStub, embeddingStub)`（文件内统一替换）。

新增两个用例：

```ts
it('embedding 失败不影响发帖结果（Review Focus #5）', async () => {
  const embedding = createEmbeddingStub()
  embedding.syncForPost.mockRejectedValue(new Error('boom'))
  const { service, postModel } = createService({
    ai: { enabled: true, generatePostMeta: async () => ({ summary: 's', tags: [] }) },
    embedding,
  })

  const result = await service.create({ title: 'T', content: 'C', tags: [] } as never, actorStub)

  expect(result.title).toBe('T')
})

it('删帖时级联删除向量', async () => {
  const { service, embedding } = createService()
  await service.remove('p1', actorStub)
  expect(embedding.removeForPost).toHaveBeenCalledWith('p1')
})
```

（`createService` 的签名按该 spec 文件现有辅助函数的形状适配：如果它现在不是 options 风格，就直接把 embedding 替身作为第三个构造参数传入，保持该文件现有风格为先。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- posts.service`
Expected: FAIL（PostsService 构造参数个数不符 / removeForPost 未被调用）

- [ ] **Step 3: 实现**

`posts.module.ts`：imports 数组追加 `SearchModule`（`import { SearchModule } from '../search/search.module'`）。

`posts.service.ts`：

1. constructor 追加 `private readonly embeddingService: EmbeddingService`（注释一句：依赖方向 posts → search → ai 保持单向）。
2. `enrichWithAi` 里，`updateOne` 回填摘要成功之后追加：

```ts
      // 摘要成功后顺带生成向量。传的是手里已有的数据，不再回读数据库：
      // 刚写入的 summary 就在 meta 里，回读反而可能读到副本延迟的旧数据。
      await this.embeddingService.syncForPost({
        id: postId,
        title,
        summary: meta.summary,
        content,
      })
```

（外层已有 try/catch，syncForPost 自身也永不抛，双保险。）

3. `update()` 成功分支、`return toPostContract(...)` 之前追加：

```ts
    // 内容变了向量必须跟着变。只判断 title/content ——
    // 改标签不影响语义文本，不该重烧一次 embedding。
    if (patch.title !== undefined || patch.content !== undefined) {
      const fresh = updated as unknown as PostLean
      void this.resyncEmbedding(fresh)
    }
```

并新增私有方法（放在 `enrichWithAi` 旁边，同款旁路纪律注释）：

```ts
  /** 更新后的向量重算。失败不重试：删掉旧向量，让回填脚本补新的 */
  private async resyncEmbedding(doc: PostLean): Promise<void> {
    const ok = await this.embeddingService.syncForPost({
      id: String(doc._id),
      title: doc.title,
      summary: doc.summary ?? null,
      content: doc.content,
    })
    if (!ok) {
      await this.embeddingService.removeForPost(String(doc._id))
    }
  }
```

4. `remove()` 里日志行之前追加（removeForPost 永不抛，可直接 await 本地操作）：

```ts
    await this.embeddingService.removeForPost(id)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @studyplan/api test -- posts` → PASS
Run: `pnpm --filter @studyplan/api test` → 全绿

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/posts
git commit -m "feat(api): sync post embeddings on create/update/delete"
```

---

### Task 7: 「问全书」RAG 端点

**Files:**
- Create: `apps/api/src/modules/search/prompts/ask-posts.prompt.ts`
- Create: `apps/api/src/modules/search/dto/ask-posts.dto.ts`
- Modify: `apps/api/src/modules/search/search.service.ts`（追加 askPosts）
- Modify: `apps/api/src/modules/search/search.controller.ts`（追加 POST ask）
- Modify: `apps/api/src/modules/ai/ai.service.ts`（追加两个公开缓存方法）
- Test: `apps/api/src/modules/search/ask-posts.spec.ts`（新建，不塞进 search.service.spec 保持单主题）

**Interfaces:**
- Consumes: `AiService.tryConsumeQuota()`（现成 public）、`AiService.getCachedAnswer/cacheAnswer`（本 task 新增）、`NvNimClient.chat/embed`、`SearchService` 已有的向量检索路径
- Produces: `SearchService.askPosts(question: string): Promise<AskSearchResponse>`；HTTP `POST /api/search/ask`（JwtAuthGuard）；`buildAskPostsPrompt(input): string`

- [ ] **Step 1: AiService 追加公开缓存方法**

在 `ai.service.ts` 的 `tryConsumeQuota` 之后追加（把已有 private 的 readCache/writeCache 暴露成语义化入口，而不是复制逻辑）：

```ts
  /**
   * 读答案缓存（供 search 模块的「问全书」复用同一份缓存设施）。
   * 缓存键由调用方生成，这里只认 hash —— 两个功能的键空间靠调用方加前缀区分。
   */
  async getCachedAnswer(hash: string): Promise<{ answer: string; sources: string[] } | null> {
    return this.readCache(hash)
  }

  /** 写答案缓存。失败静默（缓存只是优化，不该让已拿到的答案丢掉） */
  async cacheAnswer(hash: string, answer: string, sources: string[]): Promise<void> {
    return this.writeCache(hash, answer, sources)
  }
```

- [ ] **Step 2: 写失败的测试 `ask-posts.spec.ts`**

```ts
import { SearchService } from './search.service'
import { buildAskPostsPrompt } from './prompts/ask-posts.prompt'

function createRig(options: {
  hits?: Array<{ postId: string; score: number }>
  cached?: { answer: string; sources: string[] } | null
  quotaAllowed?: boolean
} = {}) {
  const chat = jest.fn().mockResolvedValue('答案 [1]')
  const embeddingStub = {
    enabled: true,
    embedQuery: jest.fn().mockResolvedValue(Float32Array.from([1, 0])),
  }
  const storeStub = {
    search: jest.fn().mockResolvedValue(options.hits ?? [{ postId: 'p1', score: 0.9 }]),
    remove: jest.fn(),
  }
  const postDoc = {
    _id: 'p1', title: 'Nest 入门', content: '正文', tags: [], summary: '摘要',
    aiTags: [], author: { id: 'u1', username: 'n' }, likeCount: 0, commentCount: 0,
    createdAt: new Date(), updatedAt: new Date(), __v: 0,
  }
  const postModelStub = {
    find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve([postDoc]) }) }),
    findById: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(postDoc) }) }),
  }
  const aiStub = {
    getCachedAnswer: jest.fn().mockResolvedValue(options.cached ?? null),
    cacheAnswer: jest.fn().mockResolvedValue(undefined),
    tryConsumeQuota: jest
      .fn()
      .mockResolvedValue({ allowed: options.quotaAllowed ?? true, remaining: 42 }),
  }
  const clientStub = { currentEmbedModel: 'test/model', chat }

  const service = new SearchService(
    embeddingStub as never, storeStub as never, postModelStub as never,
    clientStub as never, aiStub as never,
  )
  return { service, chat, aiStub, embeddingStub }
}

describe('SearchService.askPosts', () => {
  it('检索为空时短路 no-sources，一个字都不问模型（防幻觉 + 省额度）', async () => {
    const { service, chat } = createRig({ hits: [] })

    const res = await service.askPosts('站内没有的话题')

    expect(res.reason).toBe('no-sources')
    expect(chat).not.toHaveBeenCalled()
  })

  it('额度耗尽时返回 quota-exceeded，不调模型', async () => {
    const { service, chat } = createRig({ quotaAllowed: false })

    const res = await service.askPosts('Nest 怎么学')

    expect(res.reason).toBe('quota-exceeded')
    expect(chat).not.toHaveBeenCalled()
  })

  it('命中缓存时不耗额度不调模型', async () => {
    const { service, chat, aiStub } = createRig({ cached: { answer: '旧答案', sources: ['p1'] } })

    const res = await service.askPosts('Nest 怎么学')

    expect(res).toMatchObject({ answer: '旧答案', cached: true, reason: null })
    expect(chat).not.toHaveBeenCalled()
    expect(aiStub.tryConsumeQuota).not.toHaveBeenCalled()
  })

  it('成功路径：answer + 来源与 [n] 编号同序 + 写缓存', async () => {
    const { service, aiStub } = createRig()

    const res = await service.askPosts('Nest 怎么学')

    expect(res.answer).toBe('答案 [1]')
    expect(res.sources).toEqual([{ postId: 'p1', title: 'Nest 入门', score: 0.9 }])
    expect(aiStub.cacheAnswer).toHaveBeenCalledWith(
      expect.any(String), '答案 [1]', ['p1'],
    )
  })

  it('prompt 包含编号材料、引用要求与「资料不足要明说」', () => {
    const prompt = buildAskPostsPrompt({
      question: 'Nest 怎么学',
      posts: [{ id: 'p1', title: 'Nest 入门', summary: '摘要', content: '正文' }],
    })
    expect(prompt).toContain('[1] Nest 入门')
    expect(prompt).toContain('Nest 怎么学')
    expect(prompt).toContain('只依据')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @studyplan/api test -- ask-posts`
Expected: FAIL（SearchService 构造签名不符 / buildAskPostsPrompt 不存在）

- [ ] **Step 4: 实现 prompt 与 askPosts**

`prompts/ask-posts.prompt.ts`（跟随 `ai/prompts/ask-question.prompt.ts` 的导出形状）：

```ts
/** 拼进 prompt 的单帖正文截断。topK=8 时 8×500 字仍在安全预算内 */
const CONTENT_SNIPPET_MAX = 500

export interface AskPostsInput {
  question: string
  posts: Array<{ id: string; title: string; summary?: string | null; content: string }>
}

/**
 * 「问全书」的 prompt。
 * 三条硬要求各自拦一类失败：
 *   只依据资料 → 拦幻觉；[n] 标注 → 让答案可点回原文验证；
 *   资料不足明说 → 给模型一个「不知道」的合法出口，
 *   否则它宁可编也不会承认。
 */
export function buildAskPostsPrompt(input: AskPostsInput): string {
  const materials = input.posts
    .map((post, index) => {
      const summary = post.summary ? `\n摘要：${post.summary}` : ''
      const excerpt = post.content.slice(0, CONTENT_SNIPPET_MAX)
      return `[${index + 1}] ${post.title}${summary}\n内容节选：${excerpt}`
    })
    .join('\n\n')

  return [
    '你是 studyplan 学习社区的问答助手。请只依据下面提供的站内帖子资料回答问题。',
    '要求：',
    '1. 只依据资料回答，资料里没有的不要编造；',
    '2. 引用来源时使用 [1] [2] 这样的编号标记；',
    '3. 如果资料不足以支撑回答，直接说明「站内的帖子还没有覆盖这个问题」，不要硬编。',
    '4. 用简体中文回答，300 字以内。',
    '',
    '## 站内资料',
    materials,
    '',
    '## 问题',
    input.question,
  ].join('\n')
}
```

`search.service.ts` 追加（constructor 第 5 个参数 `private readonly aiService: AiService`，import 自 `../ai/ai.service`；SearchModule 已 import AiModule，无需改模块）：

```ts
  /**
   * 「问全书」：检索 → 组装材料 → 生成 → 带引用返回。
   * 三道闸与 AiService.answerQuestion 同构：缓存 → 额度 → 生成，
   * 多出来的一道「检索为空即短路」放在最前面 —— 它比额度闸更便宜。
   */
  async askPosts(question: string): Promise<AskSearchResponse> {
    if (!this.embeddingService.enabled) {
      return { answer: null, reason: 'not-configured', sources: [], cached: false, remainingToday: 0 }
    }

    const hash = hashAskPosts(question)

    const cached = await this.aiService.getCachedAnswer(hash)
    if (cached !== null) {
      const sources = await this.resolveSources(cached.sources, new Map())
      return { answer: cached.answer, reason: null, sources, cached: true, remainingToday: await this.remaining() }
    }

    const queryVector = await this.embeddingService.embedQuery(question)
    if (!queryVector) {
      return { answer: null, reason: 'error', sources: [], cached: false, remainingToday: 0 }
    }

    const hits = await this.vectorStore.search(queryVector, {
      currentModel: this.client.currentEmbedModel,
    })
    if (hits.length === 0) {
      // 检索为空就不问模型：既防幻觉也省额度。这是本方法与 /ai/ask 最大的差异
      return { answer: null, reason: 'no-sources', sources: [], cached: false, remainingToday: await this.remaining() }
    }

    const quota = await this.aiService.tryConsumeQuota()
    if (!quota.allowed) {
      return { answer: null, reason: 'quota-exceeded', sources: [], cached: false, remainingToday: 0 }
    }

    const postsById = await this.loadPosts(hits)
    try {
      const answer = await this.client.chat([
        {
          role: 'user',
          content: buildAskPostsPrompt({
            question,
            posts: hits
              .filter((hit) => postsById.has(hit.postId))
              .map((hit) => {
                const doc = postsById.get(hit.postId) as PostLean
                return { id: hit.postId, title: doc.title, summary: doc.summary, content: doc.content }
              }),
          }),
        },
      ])

      const usedIds = hits.filter((hit) => postsById.has(hit.postId)).map((hit) => hit.postId)
      await this.aiService.cacheAnswer(hash, answer, usedIds)

      const sources = hits
        .filter((hit) => postsById.has(hit.postId))
        .map((hit) => ({
          postId: hit.postId,
          title: (postsById.get(hit.postId) as PostLean).title,
          score: hit.score,
        }))

      return { answer, reason: null, sources, cached: false, remainingToday: quota.remaining }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`问全书失败：${reason}`)
      return {
        answer: null,
        reason: reason.includes('限流') ? 'rate-limited' : 'error',
        sources: [],
        cached: false,
        remainingToday: quota.remaining,
      }
    }
  }
```

同时抽出两个私有辅助（`semanticSearch` 里已有的取文档逻辑复用之，避免两处各写一遍）：

```ts
  /** 按命中顺序取帖子文档，Map 保持插入序即相关度序 */
  private async loadPosts(hits: VectorHit[]): Promise<Map<string, PostLean>> {
    const docs = await this.postModel
      .find({ _id: { $in: hits.map((hit) => hit.postId) } })
      .lean()
      .exec()
    const byId = new Map(
      (docs as unknown as PostLean[]).map((doc) => [String(doc._id), doc]),
    )
    for (const hit of hits) {
      if (!byId.has(hit.postId)) this.vectorStore.remove(hit.postId)
    }
    return byId
  }

  /** 缓存命中路径的来源解析：缓存里只存了 id，标题按当前库重取 */
  private async resolveSources(postIds: string[], _fallback: Map<string, PostLean>): Promise<AskSource[]> {
    const hits = postIds.map((postId) => ({ postId, score: 0 }))
    const byId = await this.loadPosts(hits)
    return postIds
      .filter((postId) => byId.has(postId))
      .map((postId) => ({ postId, title: (byId.get(postId) as PostLean).title, score: 0 }))
  }

  private async remaining(): Promise<number> {
    const status = await this.aiService.getStatus()
    return status.remainingToday
  }
```

（`semanticSearch` 重构为调用 `loadPosts`，行为不变、测试不改。）

文件头 imports 追加：`AskSearchResponse`、`AskSource`（来自 @studyplan/shared）、`AiService`、`buildAskPostsPrompt`、`createHash`（node:crypto）、`VectorHit`（本模块 vector-store.service）。并在类外加：

```ts
/** 问题指纹。前缀 posts| 与 /ai/ask 的键空间隔离，共用同一张缓存表也不互相污染 */
function hashAskPosts(question: string): string {
  return createHash('sha256')
    .update(`posts|${question.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
}
```

- [ ] **Step 5: Controller 与 DTO**

`dto/ask-posts.dto.ts`：

```ts
import { IsString, MaxLength, MinLength, Trim } from 'class-validator'
import { ASK_QUESTION_MAX_LENGTH } from '@studyplan/shared'

export class AskPostsDto {
  @IsString({ message: 'question 必须是字符串' })
  @Trim()
  @MinLength(1, { message: 'question 不能是空白' })
  @MaxLength(ASK_QUESTION_MAX_LENGTH, {
    message: `question 最多 ${ASK_QUESTION_MAX_LENGTH} 个字符`,
  })
  question!: string
}
```

`search.controller.ts` 追加方法（imports 补 `UseGuards` 已有，加 `JwtAuthGuard`（`../../common/guards/jwt-auth.guard`）、`AskPostsDto`）：

```ts
  @Post('ask')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: ONE_MINUTE_MS } })
  @ApiOperation({
    summary: '问全书（需登录）',
    description: '基于站内帖子的 RAG 问答。检索不到相关内容时直接返回 no-sources，不问模型。',
  })
  async ask(@Body() dto: AskPostsDto): Promise<AskSearchResponse> {
    return this.searchService.askPosts(dto.question)
  }
```

（限流阈值 10/分钟与 `/ai/ask` 同档，因为消耗同量级的模型 token；`JwtAuthGuard` 保证未登录直接 401 —— 这是 Review Focus 之外由验收标准 #3 钉死的行为。）

- [ ] **Step 6: 跑测试确认通过 + 全量回归**

Run: `pnpm --filter @studyplan/api test` → 全绿

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/search apps/api/src/modules/ai/ai.service.ts
git commit -m "feat(api): add RAG ask endpoint with no-sources short circuit"
```

---

### Task 8: 回填脚本

**Files:**
- Create: `apps/api/scripts/backfill-embeddings.mjs`
- Modify: `package.json`（仓库根，追加 script）

**Interfaces:**
- Consumes: `MONGODB_URI` / `NVNIM_API_KEY` / `NVNIM_EMBED_MODEL`（从 `apps/api/.env` 读）；集合形状与 Task 3/4 一致（`postembeddings.postId` 为 ObjectId）
- Produces: `pnpm backfill:embeddings`（默认补缺）与 `pnpm backfill:embeddings -- --rebuild`（全库重算）；退出码 0=成功 / 1=模型混库拒绝或批失败 / 2=配置缺失

对 spec 的唯一偏差（位置，不是行为）：脚本放 `apps/api/scripts/` 而非仓库根 `scripts/`，因为 pnpm 隔离式 node_modules 下只有 apps/api 目录内的文件才能 `import 'mongoose'`。

- [ ] **Step 1: 写脚本**

完整实现如下（注释密度跟随现有 scripts/ 下的 .mjs 风格）：

```js
#!/usr/bin/env node
/**
 * 存量帖子的向量回填。
 *
 * 为什么是独立脚本而不是启动时自动回填？
 *   回填要真实烧 API 额度。启动自动跑意味着每一次冷启动都可能
 *   不可预测地花掉配额 —— 可选项不该有这种权力。和 code-index 一样，
 *   生成发生在构建期/运维期，不是启动期。
 *
 * 用法：
 *   pnpm backfill:embeddings              只补库里缺向量的帖子
 *   pnpm backfill:embeddings -- --rebuild 全库重算（换了 embedding 模型时用）
 *
 * 退出码：0 成功；1 模型混库拒绝或存在失败批；2 配置缺失。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'

const here = dirname(fileURLToPath(import.meta.url))

// 自己解析 .env：不为一个脚本引入 dotenv。只处理 KEY=VALUE 行，够用。
function loadEnv() {
  const values = {}
  try {
    const text = readFileSync(join(here, '..', '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line.trim())
      if (match) values[match[1]] = match[2].replace(/^"|"$/g, '')
    }
  } catch {
    // 没有 .env 就全靠进程环境变量
  }
  return { ...values, ...process.env }
}

const env = loadEnv()
const REBUILD = process.argv.includes('--rebuild')
const BATCH_SIZE = 32
const NIM_BASE = 'https://integrate.api.nvidia.com/v1'
const EMBED_MODEL = env.NVNIM_EMBED_MODEL?.trim() || 'baai/bge-m3'
const EMBED_TEXT_MAX = 2000

if (!env.MONGODB_URI || !env.NVNIM_API_KEY) {
  console.error('缺 MONGODB_URI 或 NVNIM_API_KEY（读 apps/api/.env 或环境变量）')
  process.exit(2)
}

function buildText(post) {
  return [post.title, post.summary || '', post.content].filter(Boolean).join('\n').slice(0, EMBED_TEXT_MAX)
}

/** 与后端 l2Normalize 同逻辑：写进库的向量必须都是归一化过的 */
function l2Normalize(vector) {
  let norm = 0
  for (const v of vector) norm += v * v
  norm = Math.sqrt(norm)
  return norm > 0 ? vector.map((v) => v / norm) : vector
}

async function embedBatch(texts) {
  const response = await fetch(`${NIM_BASE}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.NVNIM_API_KEY}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const hint = response.status === 410 || response.status === 404
      ? `（模型 ${EMBED_MODEL} 可能已下线，改 NVNIM_EMBED_MODEL 后 --rebuild）`
      : ''
    throw new Error(`embedding 请求失败 HTTP ${response.status} ${hint}`)
  }
  const payload = await response.json()
  if ((payload.data ?? []).length !== texts.length) {
    throw new Error(`返回条数 ${payload.data?.length ?? 0} ≠ 请求条数 ${texts.length}`)
  }
  return [...payload.data].sort((a, b) => a.index - b.index).map((row) => row.embedding)
}

const db = await mongoose.connect(env.MONGODB_URI).then(() => mongoose.connection)
const posts = db.collection('posts')
const embeddings = db.collection('postembeddings')

// 混库防呆：库里只要存在异模型记录，默认模式直接拒绝 ——
// 新旧向量混在一起时点积没有意义，这不是补几条能救的，必须全库重算。
if (!REBUILD) {
  const foreign = await embeddings.countDocuments({ model: { $ne: EMBED_MODEL } })
  if (foreign > 0) {
    console.error(`检测到 ${foreign} 条向量由其它模型生成（当前：${EMBED_MODEL}）。请改用：pnpm backfill:embeddings -- --rebuild`)
    await mongoose.disconnect()
    process.exit(1)
  }
}

const existing = (await embeddings.find({}, { projection: { postId: 1 } }).toArray()).map((r) => r.postId)
const filter = REBUILD ? {} : { _id: { $nin: existing } }
const targets = await posts.find(filter, { projection: { title: 1, content: 1, summary: 1 } }).toArray()
console.log(`待处理 ${targets.length} 篇（模式：${REBUILD ? 'rebuild' : 'fill'}，模型：${EMBED_MODEL}）`)

let done = 0
let failed = 0
for (let i = 0; i < targets.length; i += BATCH_SIZE) {
  const batch = targets.slice(i, i + BATCH_SIZE)
  try {
    const vectors = await embedBatch(batch.map(buildText))
    for (let j = 0; j < batch.length; j++) {
      const vector = l2Normalize(vectors[j])
      await embeddings.updateOne(
        { postId: batch[j]._id },
        {
          $set: { postId: batch[j]._id, model: EMBED_MODEL, dim: vector.length, vector, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      )
      done++
    }
  } catch (error) {
    // 单批失败不中断：幂等 upsert 意味着重跑一次就能接着补
    failed += batch.length
    console.warn(`第 ${i / BATCH_SIZE + 1} 批失败，跳过：${error.message}`)
  }
  process.stdout.write(`\r进度：${done + failed}/${targets.length}`)
}

console.log(`\n完成：补 ${done} / 跳过 0 / 失败 ${failed}`)
await mongoose.disconnect()
process.exit(failed === 0 ? 0 : 1)
```

- [ ] **Step 2: 语法检查**

Run: `node --check apps/api/scripts/backfill-embeddings.mjs`
Expected: 无输出（语法合法；.mjs 后缀天然按 ESM 解析，顶层 await 合法）

- [ ] **Step 3: 注册根 script**

仓库根 `package.json` 的 scripts 里，`"test": "pnpm -r test"` 附近追加：

```json
    "backfill:embeddings": "node apps/api/scripts/backfill-embeddings.mjs",
```

- [ ] **Step 4: 真实验证（需要 apps/api/.env 已配好 Key）**

Run: `pnpm backfill:embeddings` → 打印「待处理 N 篇」并逐批推进；完成后抽查 `postembeddings` 条数与 `dim`。
Run: 再执行一次 → 预期「待处理 0 篇…补 0」（幂等，验收标准 #5）。
若 Key 不可用：临时设 `NVNIM_EMBED_MODEL=nope/x` 跑一次验证失败路径（每批失败不中断、退出码 1），汇报中注明真实回填待部署者执行。

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/backfill-embeddings.mjs package.json
git commit -m "feat(scripts): add idempotent embedding backfill with rebuild guard"
```

---

### Task 9: 前端——PostCard 提取 + /search 页（语义搜索 Tab）+ 导航

**Files:**
- Create: `apps/web/app/components/PostCard.vue`
- Modify: `apps/web/app/pages/posts/index.vue`（卡片块替换为组件）
- Create: `apps/web/app/pages/search.vue`
- Create: `apps/web/app/composables/useSemanticSearch.ts`
- Modify: `apps/web/app/components/AppSidebar.vue`（links 数组 +1）

**Interfaces:**
- Consumes: 契约 `SemanticSearchResponse`、`SearchStatus`（Task 1）；`useApi`（现成）；后端 `POST /search/semantic`、`GET /search/status`（Task 5）
- Produces: 全局组件 `PostCard`（props：`post: Post`、可选 `score?: number`）；`useSemanticSearch()` 返回 `{ query, results, pending, reason, status }`（均为 ref，Task 10 在同页补 ask Tab）

- [ ] **Step 1: 提取 PostCard 组件**

打开 `apps/web/app/pages/posts/index.vue`，找到列表 `v-for` 里渲染单张帖子的整个卡片模板块（含标题、摘要、作者、标签、点赞/评论数的那棵节点），**原样剪切**进新建的 `PostCard.vue`：

```vue
<script setup lang="ts">
import type { Post } from '@studyplan/shared'

/**
 * 帖子卡片：从 posts/index.vue 原样提取，渲染行为零变更。
 * score 只在 /search 页传，列表页不传就不渲染徒章 ——
 * 用可选 prop 而不是另建一个组件，因为差异只是一个徒章。
 */
const props = defineProps<{ post: Post; score?: number }>()

const scorePercent = computed(() =>
  props.score === undefined ? null : `${Math.round(Math.max(0, Math.min(1, props.score)) * 100)}%`,
)
</script>

<template>
  <!-- 此处为从 index.vue 剪切来的完整卡片模板，一个字都不改；
       唯一新增是在标题行末尾插入下面这个徒章 -->
  <UBadge v-if="scorePercent" color="primary" variant="subtle" size="sm">
    相关度 {{ scorePercent }}
  </UBadge>
</template>
```

执行时以真实卡片模板为准：只加 `UBadge` 与 `scorePercent` 计算，不动任何 class/结构；`posts/index.vue` 原位置替换为 `<PostCard v-for="post in items" :key="post.id" :post="post" />`（v-for 表达式保持原有变量名）。

- [ ] **Step 2: 写 useSemanticSearch**

```ts
import type {
  SearchUnavailableReason,
  SemanticPostResult,
  SemanticSearchResponse,
  SearchStatus,
} from '@studyplan/shared'

/** 防抖等待。400ms 与 roadmap 页同款手感：比回车搜索随意，比即输即查克制 */
const DEBOUNCE_MS = 400

/**
 * 语义搜索的组合式入口：输入驱动，debounce 自动查。
 * 服务端错误不弹全局提示 —— 搜索框还在、只是没结果，
 * 与 posts 列表页的错误处理策略一致。
 */
export function useSemanticSearch() {
  const api = useApi()
  const route = useRoute()

  const query = ref<string>(typeof route.query.q === 'string' ? route.query.q : '')
  const results = ref<SemanticPostResult[]>([])
  const pending = ref(false)
  const reason = ref<SearchUnavailableReason | null>(null)
  const status = ref<SearchStatus | null>(null)

  // 状态拉取失败不拦页面：status 为 null 时只是少一条空态文案
  api.get<SearchStatus>('/search/status')
    .then((res) => {
      status.value = res
    })
    .catch(() => undefined)

  let timer: ReturnType<typeof setTimeout> | undefined
  let latestToken = 0

  async function run(value: string): Promise<void> {
    const text = value.trim()
    if (!text) {
      results.value = []
      reason.value = null
      return
    }
    pending.value = true
    // 竞态防护：慢请求后到时用序号判断它还是不是最新一次，不是就丢弃。
    // 否则用户删字删到一半，旧结果会盖回来。
    const token = ++latestToken
    try {
      const res = await api.post<SemanticSearchResponse>('/search/semantic', { query: text })
      if (token !== latestToken) return
      results.value = res.results
      reason.value = res.reason
    } catch {
      if (token !== latestToken) return
      results.value = []
      reason.value = 'error'
    } finally {
      if (token === latestToken) pending.value = false
    }
  }

  watch(query, (value) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void run(value), DEBOUNCE_MS)
  })

  // ?q= 直达：进页面就替用户查一次（分享链接的预期）
  if (query.value.trim()) void run(query.value)

  return { query, results, pending, reason, status }
}
```

- [ ] **Step 3: 写 /search 页（骨架 + 语义搜索 Tab）**

```vue
<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const semantic = useSemanticSearch()

/** Tab 写进 URL（?mode=）：刷新/分享后停在原地 */
const mode = ref(route.query.mode === 'ask' ? 'ask' : 'semantic')
watch(mode, (value) => {
  void router.replace({
    query: { ...route.query, mode: value === 'ask' ? 'ask' : undefined },
  })
})

const tabs = [
  { label: '语义搜索' },
  { label: '问全书' },
]

const exampleChips = ['如何学 NestJS？', '前端性能从哪下手？', 'MongoDB 索引怎么建？']
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-6">
    <h1 class="text-title-lg font-semibold tracking-tight text-highlighted">智能搜索</h1>

    <UTabs v-model="mode" :items="tabs" />

    <section v-show="mode === 'semantic'" class="space-y-4">
      <UInput
        v-model="semantic.query"
        icon="i-lucide-search"
        placeholder="用一句自然语言描述你想找什么…"
        size="xl"
        class="w-full"
        :loading="semantic.pending"
      />

      <!-- 空查询时给示例 chip，而不是一个死寂的禁用界面 -->
      <div v-if="!semantic.query.trim()" class="flex flex-wrap gap-2">
        <UButton
          v-for="chip in exampleChips"
          :key="chip"
          color="neutral"
          variant="subtle"
          size="sm"
          :label="chip"
          @click="semantic.query = chip"
        />
      </div>

      <p v-if="semantic.reason === 'not-configured'" class="text-sm text-muted">
        AI 服务未启用，语义搜索暂不可用。
      </p>
      <p v-else-if="semantic.reason === 'index-empty'" class="text-sm text-muted">
        站内内容还不够，去发几篇帖子吧。
      </p>
      <p v-else-if="semantic.reason === 'error'" class="text-sm text-muted">
        搜索服务出了点问题，稍后再试。
      </p>

      <div class="space-y-4">
        <PostCard
          v-for="item in semantic.results"
          :key="item.post.id"
          :post="item.post"
          :score="item.score"
        />
      </div>
    </section>

    <!-- Task 10 在这里填「问全书」面板 -->
    <section v-show="mode === 'ask'" />
  </div>
</template>
```

（Nuxt 组件/组合式函数自动导入：`useSemanticSearch`、`PostCard` 不需要 import；若项目 tsconfig 未覆盖 components/ 目录自动导入则显式 import，以 `posts/index.vue` 现有写法为准。）

- [ ] **Step 4: 侧栏导航追加**

`AppSidebar.vue` 的 `links` 数组，在「帖子流」条目之后插入：

```ts
  { label: '智能搜索', description: '语义检索与问全书', to: '/search', icon: 'i-lucide-sparkles' },
```

（`isActive` 用 `startsWith`，`/search` 无需特殊处理。）

- [ ] **Step 5: 验证**

Run: `pnpm --filter @studyplan/web build`
Expected: 构建成功，无类型错误
手动（dev 在跑时）：访问 `http://localhost:3001/search?q=NestJS` 能看到结果卡片且带「相关度 NN%」徒章；列表页 `posts/index.vue` 行为与提取前完全一致。

- [ ] **Step 6: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): add /search page with semantic search tab and PostCard component"
```

---

### Task 10: 前端——问全书 Tab（登录门槛 + 引用脚注）

**Files:**
- Create: `apps/web/app/composables/useAskSearch.ts`
- Modify: `apps/web/app/pages/search.vue`（填充 ask 面板）

**Interfaces:**
- Consumes: 契约 `AskSearchResponse`（Task 1）、`POST /search/ask`（Task 7）、现有 `useMarkdown` 与 `useAuth`（`auth.user` 判登录态，以现有调用习惯为准）
- Produces: `useAskSearch()` 返回 `{ question, answer, sources, reason, pending, cached, remainingToday, ask, reset }`（均为 ref）

- [ ] **Step 1: 写 useAskSearch**

```ts
import type {
  AskPostsUnavailableReason,
  AskSearchResponse,
  AskSource,
} from '@studyplan/shared'

/**
 * 「问全书」的调用入口。
 * 与语义搜索不同：这是显式提交（回车/点按钮），不做 debounce 自动查 ——
 * 每次提问都消耗真实额度，"输入即发送"在这里是反模式。
 */
export function useAskSearch() {
  const api = useApi()

  const question = ref('')
  const answer = ref<string | null>(null)
  const sources = ref<AskSource[]>([])
  const reason = ref<AskPostsUnavailableReason | null>(null)
  const pending = ref(false)
  const cached = ref(false)
  const remainingToday = ref<number | null>(null)

  async function ask(): Promise<void> {
    const text = question.value.trim()
    if (!text || pending.value) return

    pending.value = true
    reason.value = null
    answer.value = null
    sources.value = []
    try {
      const res = await api.post<AskSearchResponse>('/search/ask', { question: text })
      answer.value = res.answer
      sources.value = res.sources
      reason.value = res.reason
      cached.value = res.cached
      remainingToday.value = res.remainingToday
    } catch {
      reason.value = 'error'
    } finally {
      pending.value = false
    }
  }

  function reset(): void {
    question.value = ''
    answer.value = null
    sources.value = []
    reason.value = null
  }

  return { question, answer, sources, reason, pending, cached, remainingToday, ask, reset }
}
```

- [ ] **Step 2: 填充 search.vue 的 ask 面板**

script 区追加：

```ts
const askBox = useAskSearch()
const auth = useAuth()

/**
 * 把答案里的 [n] 引用标成锚点链接，点击跳到下方来源列表对应项。
 * 在 markdown 渲染产物上做替换是安全的：[1] 不是合法 HTML 标签，
 * 只会出现于文本节点；来源列表本身是结构化数据不是 HTML。
 */
const renderedAnswer = computed(() => {
  if (!askBox.answer.value) return ''
  return askBox.sources.length
    ? renderMarkdown(askBox.answer.value).replace(
        /\[(\d+)\]/g,
        (_m, n) => `<a href="#ask-source-${n}" class="text-primary font-medium hover:underline">[${n}]</a>`,
      )
    : renderMarkdown(askBox.answer.value)
})
```

（`renderMarkdown` 以 `useMarkdown` 实际导出的函数名为准；若该 composable 导出的是 `render(text)` 形则改用 `render(...)`。未登录时不能崩：`askBox.sources.length` 天然为 0，走纯渲染分支。）

模板里替换 `<section v-show="mode === 'ask'" />` 占位：

```vue
<template>
  <section v-show="mode === 'ask'" class="space-y-4">
    <!-- 未登录：整个回答区替换为登录引导。输完才被弹走是最差的体验 -->
    <UCard v-if="!auth.user.value">
      <p class="text-sm">「问全书」需要登录后使用，登录后即可向站内内容提问。</p>
      <UButton
        class="mt-3"
        label="去登录"
        icon="i-lucide-log-in"
        @click="navigateTo('/login?redirect=' + encodeURIComponent('/search?mode=ask'))"
      />
    </UCard>

    <template v-else>
      <div class="flex gap-2">
        <UInput
          v-model="askBox.question"
          placeholder="问一个站内帖子能回答的问题…（回车提交）"
          size="lg"
          class="flex-1"
          :loading="askBox.pending"
          @keyup.enter="askBox.ask"
        />
        <UButton label="提问" :disabled="!askBox.question.trim() || askBox.pending" @click="askBox.ask" />
      </div>

      <p v-if="askBox.remainingToday !== null" class="text-caption text-muted">
        今日还可提问 {{ askBox.remainingToday }} 次<span v-if="askBox.cached">· 本次来自缓存</span>
      </p>

      <!-- reason 的每一种人话都告诉用户下一步该做什么（与 AiUnavailableReason 同源思想） -->
      <UAlert v-if="askBox.reason === 'no-sources'" color="neutral" variant="subtle" icon="i-lucide-help-circle" title="站内的帖子还没有覆盖这个问题" />
      <UAlert v-else-if="askBox.reason === 'quota-exceeded'" color="warning" variant="subtle" title="今天的提问额度用完了，明天再来" />
      <UAlert v-else-if="askBox.reason === 'rate-limited'" color="warning" variant="subtle" title="你问得太快了，稍等一下再试" />
      <UAlert v-else-if="askBox.reason" color="error" variant="subtle" title="AI 服务出了点问题，可以稍后重试" />

      <div v-if="askBox.answer" class="space-y-4">
        <!-- 与帖子详情页同源：内容都是经 markdown 渲染器白名单过后的 HTML -->
        <div class="prose prose-sm max-w-none" v-html="renderedAnswer" />

        <UCard v-if="askBox.sources.length">
          <p class="mb-2 text-eyebrow font-semibold uppercase text-muted">参考来源</p>
          <ol class="space-y-2">
            <li v-for="(source, index) in askBox.sources" :key="source.postId">
              <NuxtLink
                :id="`ask-source-${index + 1}`"
                :to="`/posts/${source.postId}`"
                class="flex items-center justify-between gap-3 text-sm no-underline hover:text-primary"
              >
                <span>[{{ index + 1 }}] {{ source.title }}</span>
                <UBadge color="neutral" variant="subtle" size="xs">{{ Math.round(Math.max(0, source.score) * 100) }}%</UBadge>
              </NuxtLink>
            </li>
          </ol>
        </UCard>
      </div>
    </template>
  </section>
</template>
```

锚点一致性检查（执行时必做）：脚注 href `#ask-source-n` 与列表 `:id="ask-source-${index + 1}"` 同一套编号；浏览器原生锚点跳转即满足验收标准 #2，不需手写 scrollTo。

- [ ] **Step 3: 验证**

Run: `pnpm --filter @studyplan/web build` → 构建成功
手动（dev 在跑时）：未登录时 ask Tab 只显示登录卡（无输入框）；登录后提问看到答案、[1] 可点击、来源列表编号对齐；`?mode=ask&q=xx` 直达 URL 行为正确。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app
git commit -m "feat(web): add ask-the-site RAG tab with login gate and citation footnotes"
```

---

### Task 11: E2E + 全量回归 + 人工验收

**Files:**
- Create: `apps/web/e2e/semantic-search.spec.ts`

**Interfaces:**
- Consumes: 前面全部 task 的产物；`playwright.config.ts` 现成基配置（baseURL/webServer 沿用，新文件不重复配置）
- Produces: spec §8 六条验收标准的逐项证据

- [ ] **Step 1: 写 E2E（不依赖站内数据内容，只验结构、门槛与校验）**

```ts
import { expect, test } from '@playwright/test'

/**
 * 用例刻意不依赖"库里恰好有什么帖子"：只验结构、门槛与参数校验。
 * 数据相关的验收（语义泛化召回）属于人工标准，列在 Step 4 清单。
 */
test.describe('语义搜索页', () => {
  test('页面可达，双 Tab 渲染', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: '智能搜索' })).toBeVisible()
    await expect(page.getByRole('tab', { name: '问全书' })).toBeVisible()
  })

  test('侧栏入口可到达 /search', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /智能搜索/ }).first().click()
    await expect(page).toHaveURL(/\/search/)
  })

  test('未登录时问全书显示登录引导而非输入框', async ({ page }) => {
    await page.goto('/search?mode=ask')
    await expect(page.getByText('「问全书」需要登录后使用')).toBeVisible()
    await expect(page.getByPlaceholder(/问一个站内帖子能回答的问题/)).toHaveCount(0)
  })

  test('未登录直连 API 被 401 拦截（验收 #3 的绕过 UI 路径）', async ({ request }) => {
    const res = await request.post('/api/search/ask', { data: { question: '测试' } })
    expect(res.status()).toBe(401)
  })

  test('纯空白查询返回 400（Review Focus #1 的端到端复验）', async ({ request }) => {
    const res = await request.post('/api/search/semantic', { data: { query: '   ' } })
    expect(res.status()).toBe(400)
  })
})
```

- [ ] **Step 2: 跑 E2E**

Run: `pnpm --filter @studyplan/web exec playwright test semantic-search`
Expected: 5 passed（本地前后端服务需在跑，除非 playwright.config 自带 webServer）

- [ ] **Step 3: 全量回归**

Run: `pnpm test`（仓库根）→ 全绿
Run: `pnpm exec prettier --write . && pnpm exec eslint . --fix` 后再 `pnpm test` → 无 lint 残留、测试仍绿（若仓库根没有直接的 eslint/prettier 脚本，以 CI 配置 `ci.yml` 里跑的命令为准）

- [ ] **Step 4: 人工验收清单（逐条执行并记录结果）**

1. 搜「前端框架怎么选」→ 召回标题正文均不含这五字但主题相关的帖子（验收 #1；召回为空先跑 Task 8 回填）；
2. 问答回答带 [1][2]，点击跳到来源并定位（验收 #2）；
3. 未登录 UI 无提问入口；直连 API 401（验收 #3，Step 1 已自动化）；
4. 临时把 `NVNIM_API_KEY` 改错重启 API：发帖仍成功、/search 显示降级提示、日志无密钥（验收 #4）；验完改回；
5. `pnpm backfill:embeddings` 连跑两次，第二次补 0；改 `NVNIM_EMBED_MODEL` 后默认模式拒绝并提示 --rebuild（验收 #5）；
6. `pnpm test` 全绿，CI 通过（验收 #6）。

- [ ] **Step 5: 收尾 Commit（若有文件改动）**

```bash
git add apps/web/e2e
git commit -m "test(e2e): cover semantic search page and ask login gate"
```

（若前面步骤无额外改动，只提交 e2e 新文件，不要造空 commit。）

---

## 计划自审记录（已执行）

- **Spec 覆盖**：§2 架构→T3–T7；§3 数据模型→T3/T4；§4 契约→T1/T5/T7；§5 前端→T9/T10；§6 配置与失败→T2/T6/T8；§7 测试→各 task 内置 + T11；§8 验收→T11 Step 4。无缺口。
- **两处对 spec 的有意偏差**（已在计划内标出，供执行前确认）：① 状态端点由「扩展 /ai/status」改为独立 `GET /search/status`，避免 ai↔search 模块循环依赖（forwardRef 在本项目禁用）；字段语义不变，只是换了宿主。② 回填脚本位于 `apps/api/scripts/`（pnpm 依赖解析边界）。契约字段与行为语义均未变。
- **类型一致性**：`embed / currentEmbedModel / syncForPost / removeForPost / embedQuery / search(VectorHit) / put / remove / size / markStale / semanticSearch / askPosts / getCachedAnswer / cacheAnswer / buildAskPostsPrompt / buildEmbeddingText / l2Normalize` 在各 task 间签名互校一致。
- **占位符扫描**：无 TBD/TODO；两处"以现有代码为准"的说明（PostCard 模板提取、renderMarkdown 导出名）是对**现存代码**的引用方式，不是未决定的需求。
