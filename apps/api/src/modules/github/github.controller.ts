import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { TrendingResponse } from '@studyplan/shared'
import { GithubService } from './github.service'
import { QueryTrendingDto } from './dto/query-trending.dto'

/**
 * GitHub 相关接口。
 *
 * 注意这个文件有多薄：整个方法只有一行。
 * 这不是偷懒，而是**分层是否清晰的直接体现** ——
 * 本项目在 posts.controller.ts 里就定下了一条规矩：
 * Controller 里但凡出现 `if`，通常意味着某个业务判断放错了地方。
 *
 * 它真正做的只有三件事：
 *   1. 用装饰器把 HTTP 请求翻译成函数调用；
 *   2. 用 DTO 声明"什么输入是合法的"（校验由全局管道执行）；
 *   3. 用 Swagger 装饰器把接口文档化。
 *
 * 这里**没有 @UseGuards(ThrottlerGuard)**：
 * 这是只读接口，加上限流会让正常浏览的用户被自己挡在门外。
 * 保护 GitHub 配额的责任在 Service 层（最小刷新间隔 + 缓存），
 * 而不是在入口拦用户 —— 两者要解决的问题并不相同。
 */
@ApiTags('github')
@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('trending')
  @ApiOperation({
    summary: '获取 GitHub 热门项目榜',
    description:
      '返回指定时间区间内**创建**的项目中 star 最高的一批。' +
      '数据由后端代理并缓存，浏览器不直连 GitHub。',
  })
  @ApiOkResponse({
    description: '榜单数据。stale 为 true 表示返回的是过期缓存（上游请求失败或限流）',
  })
  async getTrending(@Query() query: QueryTrendingDto): Promise<TrendingResponse> {
    // 空字符串也按"全部"处理：前端清空筛选时会传 ?language=
    return this.githubService.getTrending(query.range, query.language?.trim() || null)
  }
}
