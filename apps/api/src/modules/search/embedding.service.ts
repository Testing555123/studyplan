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

      // Mongoose 的 Query 本身是 thenable，直接 await 等价于 .exec()
      await this.embeddingModel.updateOne(
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
      await this.embeddingModel.deleteOne({ postId })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`删除帖子向量失败（${postId}）：${reason}`)
    }
  }
}
