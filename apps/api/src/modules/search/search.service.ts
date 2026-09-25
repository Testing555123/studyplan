import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { SemanticPostResult, SemanticSearchResponse } from '@studyplan/shared'
import { NvNimClient } from '../ai/nv-nim.client'
import { Post } from '../posts/schemas/post.schema'
import { PostLean, toPostContract } from '../posts/posts.mapper'
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
