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
  /**
   * 写端覆盖表：put/remove 记在这里，reload 时用数据库行重建底座后重新叠加。
   * 没有它，并发进行中的 reload 会把刚 put 的条目整体冲掉。
   * null = 已删除（重建后也不能复活，防孤儿向量）。
   */
  private readonly overrides = new Map<string, StoredVector | null>()
  private loadedAt = 0
  private loading: Promise<void> | null = null

  constructor(
    @InjectModel(PostEmbedding.name)
    private readonly embeddingModel: Model<PostEmbedding>,
    config: ConfigService,
  ) {
    // 启动即载入：失败/为空要第一时间在日志里可见，不等第一个用户请求
    // 走 ensureFresh 而不是直接 reload：复用 loading 去重，避免与首个检索各触发一次查询
    void this.ensureFresh()
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
    const stored = { vector: Float32Array.from(vector), model }
    this.cache.set(postId, stored)
    this.overrides.set(postId, stored)
    this.loadedAt = Date.now()
  }

  remove(postId: string): void {
    this.cache.delete(postId)
    this.overrides.set(postId, null)
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
      const rebuilt = new Map<string, StoredVector>(
        rows.map((row) => [
          String(row.postId),
          { vector: Float32Array.from(row.vector as number[]), model: row.model as string },
        ]),
      )
      // 数据库是底座，写端覆盖叠在上层：reload 期间/之前的 put、remove 不丢
      for (const [postId, override] of this.overrides.entries()) {
        if (override === null) rebuilt.delete(postId)
        else rebuilt.set(postId, override)
      }
      this.cache = rebuilt
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
