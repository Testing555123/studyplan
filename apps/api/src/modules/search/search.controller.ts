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
