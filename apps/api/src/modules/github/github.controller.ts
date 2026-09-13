import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { RepoDetailResponse, RepoIntroBatchResponse, TrendingResponse } from '@studyplan/shared'
import { BatchIntroDto } from './dto/batch-intro.dto'
import { GithubService } from './github.service'
import { QueryTrendingDto } from './dto/query-trending.dto'
import { RepoDetailService } from './github-detail.service'
import { RepoIntroService } from './repo-intro.service'

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
  constructor(
    private readonly githubService: GithubService,
    private readonly detailService: RepoDetailService,
    private readonly introService: RepoIntroService,
  ) {}

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

  @Get('repos/:owner/:repo')
  @ApiOperation({
    summary: '获取单个仓库的详情',
    description:
      '数据按「榜单缓存 → 已落库快照 → 现取 GitHub」三级回退。' +
      '前两级不消耗 GitHub 配额；走了第三级时会落库，同一个仓库只回源一次。',
  })
  async getRepoDetail(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ): Promise<RepoDetailResponse> {
    return this.detailService.getDetail(`${owner}/${repo}`)
  }

  /**
   * 轮询接口：只读取，**不触发生成**。
   *
   * 它必须廉价 —— 轮询本身就是为了等一个慢任务，
   * 如果每次轮询自己也很重，那就变成第二个压力来源了。
   */
  @Get('intros')
  @ApiOperation({ summary: '读取已生成的 AI 简介（不触发生成）' })
  async getIntros(@Query('ids') ids: string): Promise<RepoIntroBatchResponse> {
    return this.introService.getIntros(parseIdList(ids))
  }

  /**
   * 触发接口：读取 + 限量生成。
   *
   * 这里**要**限流，和上面两个只读接口不同：
   * 它是唯一会真正消耗 AI 额度的入口，一旦被刷，
   * 全站的问答与简介会一起不可用。
   */
  @Post('intros/batch')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: '批量取 AI 简介，并为缺失的项目限量生成',
    description:
      '先返回已缓存的简介，再按 star 降序限量生成缺失项。' +
      '一次调用的工作量受条数上限与时间预算双重约束，' +
      '没做完的会放进 pending，前端据此再轮询一次。',
  })
  async ensureIntros(@Body() dto: BatchIntroDto): Promise<RepoIntroBatchResponse> {
    return this.introService.ensureIntros(dto.repoIds)
  }
}

/**
 * 把 `?ids=1,2,3` 解析成数字数组。
 *
 * 这里**不校验、只丢弃**：非法项直接跳过，而不是返回 400。
 * 因为它是给前端轮询用的，前端拼错一个 id 就让整个轮询失败，
 * 代价太大；少返回一条简介则完全无感。
 */
function parseIdList(raw: string | undefined): number[] {
  if (!raw) return []

  return raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value))
    .slice(0, 100)
}
