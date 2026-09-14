import { Controller, Get, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { UseGuards } from '@nestjs/common'
import type { DailyDigestStatusResponse } from '@studyplan/shared'
import { DailyDigestService, type DailyDigestResult } from './daily-digest.service'

/**
 * 每日报道的触发入口。
 *
 * ── 为什么定时任务要给自己加一把锁 ──
 *
 * 这个端点一旦暴露，任何人打它都会触发一次 GitHub 搜索 + 一次 AI 调用。
 * 所以它要求请求头里带上 `DAILY_DIGEST_CRON_TOKEN`：
 * **没配这个令牌时端点直接 401，等于功能关闭。**
 *
 * 这和"总开关"是两把独立的锁：
 * 总开关防的是"在错误的环境里跑起来"，
 * 令牌防的是"被不相干的人跑起来"。
 * 只留一把的话，配错了环境变量就等于把内部端点开在了公网上。
 *
 * 即便真被大量调用也不会重复发帖 —— `daily_picks` 的 `date` 唯一索引
 * 保证一天至多一篇。限流在这里只是省资源，正确性不依赖它。
 */
@Controller()
export class DailyDigestController {
  private readonly logger = new Logger(DailyDigestController.name)

  constructor(
    private readonly dailyDigestService: DailyDigestService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 供外部调度器（Vercel Cron）调用。
   *
   * 返回 200 而不是 2xx 之外的状态码：
   * 调度器看到非 2xx 通常会重试，而这个端点内部已经把所有错误
   * 转成 `status: 'failed'` 了 —— 重试只会多打一次 GitHub 与 AI，
   * 不会让结果变好。
   */
  @Post('internal/daily-digest')
  @ApiExcludeEndpoint()
  @HttpCode(200)
  async trigger(
    @Headers('x-daily-token') token: string | undefined,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<DailyDigestResult> {
    const expected = this.config.get<string>('DAILY_DIGEST_CRON_TOKEN')

    // 没配令牌 = 端点未启用。这里不区分"令牌错"和"没启用"，避免信息泄漏
    if (!expected || !this.matchesToken(expected, token, authorization)) {
      throw new UnauthorizedException('定时令牌无效')
    }

    this.logger.log('收到每日报道触发请求')
    return this.dailyDigestService.runDailyDigest()
  }

  /**
   * 同时认两种写法：自定义头 `x-daily-token`，和标准 `Authorization: Bearer`。
   *
   * 为什么要认第二种：Vercel Cron 不允许自定义请求头，
   * 它只会把平台的 `CRON_SECRET` 放在 `Authorization: Bearer` 里发过来。
   * 认下标准头之后，把 `DAILY_DIGEST_CRON_TOKEN` 设成和 `CRON_SECRET`
   * 一样的值就能直接用，不需要额外的转发层。
   */
  private matchesToken(
    expected: string,
    token: string | undefined,
    authorization: string | undefined,
  ): boolean {
    if (token === expected) return true

    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
    return bearer === expected
  }

  /**
   * 今天的报道状态 + 自检信息（公开、只读、限流）。
   *
   * 它同时承担惰性触发：在没有配置 Cron 的环境里，
   * 只要有人访问过这个接口（例如前端的每日推荐位），
   * 当天该发的那篇就会被补上。
   *
   * 返回体里带上了各项开关状态，是为了让前端能**说清楚为什么没有推荐**，
   * 而不是只给一个空白区块让人去猜环境变量。
   */
  @Get('daily-digest/today')
  @ApiExcludeEndpoint()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async today(): Promise<DailyDigestStatusResponse> {
    /**
     * 惰性补发**不等待**。
     *
     * 生成一篇报道要真调一次模型（实测 20-40 秒），
     * 而这个接口是**页面一加载就会打**的 —— 等它就意味着用户对着一个
     * 转圈区块干等半分钟，还可能撞上网关超时。
     *
     * 所以这里 fire-and-forget：立刻把"当前状态"交出去，
     * 补发在后台继续跑，前端过几秒再取一次就能看到结果。
     * （本项目的部署形态是常驻 Node 容器的入口进程，
     *   响应返回后进程仍然活着，后台任务不会像纯 serverless 那样被冻结。）
     */
    void this.dailyDigestService.maybeTriggerOnRead()

    // 把"今天有没有、为什么没有"如实报给前端
    return this.dailyDigestService.getStatusResponse()
  }

  /**
   * 手动生成今天的报道（公开、限流）。
   *
   * 这是页面「立即生成」按钮打的那个接口 —— 用户明确点了，所以这里**可以等**。
   *
   * 为什么公开端点也敢给触发能力：
   *   `daily_picks.date` 唯一索引保证一天至多一篇，再多的人点，
   *   也只会有一篇真正被发出来（其余拿到 already-published 并立刻返回）。
   *   限流负责挡住"拿它当压力源"的用法，**正确性不依赖限流**。
   */
  @Post('daily-digest/generate')
  @ApiExcludeEndpoint()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async generate(): Promise<DailyDigestStatusResponse> {
    await this.dailyDigestService.runDailyDigest()
    return this.dailyDigestService.getStatusResponse()
  }
}
