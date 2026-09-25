import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type {
  AskSearchResponse,
  AskSource,
  SemanticPostResult,
  SemanticSearchResponse,
} from '@studyplan/shared'
import { AiService } from '../ai/ai.service'
import { NvNimClient } from '../ai/nv-nim.client'
import { Post } from '../posts/schemas/post.schema'
import { PostLean, toPostContract } from '../posts/posts.mapper'
import { EmbeddingService } from './embedding.service'
import { VectorHit, VectorStoreService } from './vector-store.service'
import { buildAskPostsPrompt } from './prompts/ask-posts.prompt'

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
    private readonly aiService: AiService,
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

    const byId = await this.loadPosts(hits)

    const results: SemanticPostResult[] = []
    for (const hit of hits) {
      const doc = byId.get(hit.postId)
      if (!doc) continue
      results.push({ post: toPostContract(doc), score: hit.score })
    }

    if (results.length === 0) {
      return { results: [], reason: 'index-empty' }
    }

    return { results, reason: null }
  }

  /**
   * 「问全书」：检索 → 组装材料 → 生成 → 带引用返回。
   * 三道闸与 AiService.answerQuestion 同构：缓存 → 额度 → 生成，
   * 多出来的一道「检索为空即短路」放在最前面 —— 它比额度闸更便宜。
   */
  async askPosts(question: string): Promise<AskSearchResponse> {
    if (!this.embeddingService.enabled) {
      return {
        answer: null,
        reason: 'not-configured',
        sources: [],
        cached: false,
        remainingToday: 0,
      }
    }

    const hash = hashAskPosts(question)

    const cached = await this.aiService.getCachedAnswer(hash)
    if (cached !== null) {
      const sources = await this.resolveSources(cached.sources)
      return {
        answer: cached.answer,
        reason: null,
        sources,
        cached: true,
        remainingToday: await this.remaining(),
      }
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
      return {
        answer: null,
        reason: 'no-sources',
        sources: [],
        cached: false,
        remainingToday: await this.remaining(),
      }
    }

    const quota = await this.aiService.tryConsumeQuota()
    if (!quota.allowed) {
      return {
        answer: null,
        reason: 'quota-exceeded',
        sources: [],
        cached: false,
        remainingToday: 0,
      }
    }

    const postsById = await this.loadPosts(hits)
    // 只把真实取到文档的命中喂给模型：编号与 sources 严格同序
    const used = hits.filter((hit) => postsById.has(hit.postId))
    if (used.length === 0) {
      return {
        answer: null,
        reason: 'no-sources',
        sources: [],
        cached: false,
        remainingToday: quota.remaining,
      }
    }

    try {
      const answer = await this.client.chat([
        {
          role: 'user',
          content: buildAskPostsPrompt({
            question,
            posts: used.map((hit) => {
              const doc = postsById.get(hit.postId) as PostLean
              return { id: hit.postId, title: doc.title, summary: doc.summary, content: doc.content }
            }),
          }),
        },
      ])

      await this.aiService.cacheAnswer(
        hash,
        answer,
        used.map((hit) => hit.postId),
      )

      const sources: AskSource[] = used.map((hit) => ({
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
      // 孤儿向量：帖子已删但向量还在。自愈式剔除，不等全量重载
      if (!byId.has(hit.postId)) this.vectorStore.remove(hit.postId)
    }
    return byId
  }

  /** 缓存命中路径的来源解析：缓存里只存了 id，标题按当前库重取 */
  private async resolveSources(postIds: string[]): Promise<AskSource[]> {
    const byId = await this.loadPosts(postIds.map((postId) => ({ postId, score: 0 })))
    return postIds
      .filter((postId) => byId.has(postId))
      .map((postId) => ({ postId, title: (byId.get(postId) as PostLean).title, score: 0 }))
  }

  private async remaining(): Promise<number> {
    const status = await this.aiService.getStatus()
    return status.remainingToday
  }
}

/** 问题指纹。前缀 posts| 与 /ai/ask 的键空间隔离，共用同一张缓存表也不互相污染 */
function hashAskPosts(question: string): string {
  return createHash('sha256')
    .update(`posts|${question.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32)
}
