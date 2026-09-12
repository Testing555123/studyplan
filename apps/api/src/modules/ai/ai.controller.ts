import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { AiStatus, AskAiResponse, RepoQuestionContext } from '@studyplan/shared'
import { AiService } from './ai.service'
import { AskAiDto } from './dto/ask-ai.dto'

/** 提问配额：10 次/分钟。AI 每次调用都真实消耗额度，比普通接口严格得多 */
const ASK_LIMIT_PER_MINUTE = 10
const ONE_MINUTE_MS = 60_000

/**
 * AI 接口。
 *
 * 与 github.controller.ts 一样保持"薄"：方法体一行，业务全在 Service。
 *
 * 这里**加了限流**，而 github 那个只读接口没有 —— 差别在于：
 *   · 榜单走缓存，绝大多数请求不产生外部调用；
 *   · `/ai/ask` 每次都在真金白银地消耗额度。
 * 是否限流不看"是不是只读"，而看"这个请求会不会消耗稀缺资源"。
 */
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  @ApiOperation({
    summary: 'AI 功能状态',
    description: '返回是否启用、当前模型与今日剩余额度。前端据此决定要不要渲染 AI 入口。',
  })
  @ApiOkResponse({ description: 'AI 状态' })
  async getStatus(): Promise<AiStatus> {
    return this.aiService.getStatus()
  }

  @Post('ask')
  @Throttle({ default: { limit: ASK_LIMIT_PER_MINUTE, ttl: ONE_MINUTE_MS } })
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: '向 AI 提问',
    description:
      '带 context 时询问某个开源项目；不带时基于本站代码索引作答。' +
      '失败不抛错，而是在响应里给出 reason。',
  })
  @ApiOkResponse({ description: '答案；answer 为 null 时看 reason' })
  async ask(@Body() dto: AskAiDto): Promise<AskAiResponse> {
    /**
     * DTO → 契约的映射。
     *
     * 为什么在这里转，而不是把 `dto.context` 直接传下去？
     *   因为 `type: 'repo'` 这个判别字段是**服务端补的** ——
     *   前端只关心"我在问哪个仓库"，没理由知道内部的上下文类型标记，
     *   让它传就是把这个实现细节泄漏到接口上。
     *
     *   顺带把 DTO 里的可选字段（description / language）收敛成明确的 null，
     *   下游只需处理一种"空"，不必再区分 undefined 与 null。
     *
     * 这是**数据形状转换**而非业务判断，所以留在 Controller 是合适的
     * （业务判断不在这里 —— 那部分全在 Service 里）。
     */
    const context: RepoQuestionContext | null = dto.context
      ? {
          type: 'repo',
          fullName: dto.context.fullName,
          description: dto.context.description ?? null,
          language: dto.context.language ?? null,
          htmlUrl: dto.context.htmlUrl,
        }
      : null

    return this.aiService.answerQuestion({ question: dto.question, context })
  }
}
