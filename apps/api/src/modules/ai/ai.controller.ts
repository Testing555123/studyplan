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
    description:
      '返回是否启用、当前模型、今日剩余额度，以及部署自检字段' +
      '（keyConfigured / codeIndexLoaded / codeIndexFiles）。' +
      '前端据此决定要不要渲染 AI 入口；部署者据此一眼看清"Key 配进去了没、索引随镜像进去了没"。',
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
     * 为什么 `type: 'repo'` 仍然在这里补、但 DTO 也要接收它？
     *   两者并不矛盾，职责不同：
     *     · DTO **必须**接收 `type` —— 共享契约 `RepoQuestionContext` 声明了它，
     *       而校验开了 `forbidNonWhitelisted`，DTO 若不接收，前端"卡片问 AI"
     *       每次都会被 400 拒掉（本项目踩过这个坑）。
     *     · 服务端**仍然重新推导** `type: 'repo'` —— 前端传什么**不构成信任**，
     *       这里只是把"为了兼容校验而不得不接收的字段"再归一化一遍。
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
