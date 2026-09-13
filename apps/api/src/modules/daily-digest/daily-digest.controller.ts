import { Controller, Get, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import { UseGuards } from '@nestjs/common'
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
   * 今天的报道状态（公开、只读、限流）。
   *
   * 它同时承担惰性触发：在没有配置 Cron 的环境里，
   * 只要有人访问过这个接口（例如前端的每日推荐位），
   * 当天该发的那篇就会被补上。
   */
  @Get('daily-digest/today')
  @ApiExcludeEndpoint()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async today(): Promise<{ date: string | null; pick: TodayPickView | null }> {
    await this.dailyDigestService.maybeTriggerOnRead()

    const pick = await this.dailyDigestService.getTodayPick()
    if (!pick) return { date: null, pick: null }

    return {
      date: pick.date,
      pick: {
        fullName: pick.fullName,
        htmlUrl: pick.htmlUrl,
        language: pick.language,
        stargazersCount: pick.stargazersCount,
        postId: pick.postId,
        source: pick.source,
      },
    }
  }
}

interface TodayPickView {
  fullName: string
  htmlUrl: string
  language: string | null
  stargazersCount: number
  postId: string | null
  source: 'ai' | 'template'
}
