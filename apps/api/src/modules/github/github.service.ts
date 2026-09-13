/**
 * 热门项目榜的核心逻辑：**缓存决策、语言聚合、降级**。
 *
 * ── 为什么缓存必须落数据库，不能放内存 ──
 * 线上是 Vercel 单容器，无流量 5 分钟缩容到零、且会多实例扩缩：
 * 内存缓存说没就没，实例之间也互不可见。
 * （这个坑本项目在限流上已经踩过一次，所以这次直接落 MongoDB。）
 *
 * ── 三种状态，都要让前端分辨得出来 ──
 *   · 新鲜     → 直接返回，完全不碰 GitHub
 *   · 软过期   → 尝试刷新；**刷新失败但有旧数据时返回旧数据并标记 stale**
 *   · 无缓存且刷新失败 → 这才报错
 * 中间那种"用旧数据顶上"最容易被漏掉，但它决定了上游抖动的表现：
 * 是"数据可能不是最新"的一行提示，还是整页打不开。
 *
 * ── 为什么只按时间档拉取、不带 language 条件 ──
 * Search API 未认证只有 10 次/分钟。若把语言也拼进查询，
 * 5 个时间档 × N 种语言会直接把限流打爆。
 * 所以每档只拉一次（per_page=100），语言筛选在**服务端**
 * 从已经缓存下来的 100 条里过滤并聚合，零额外外部请求。
 *
 * ── 为什么还要有"最小刷新间隔" ──
 * 缓存过期本身不设防：只要过期，十个并发请求就能同时打向 GitHub。
 * MIN_REFRESH_INTERVAL_MS 是一道**保护上游**的硬闸 ——
 * 无论多少人来、缓存多旧，每分钟最多一次请求真正出网。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { GithubRepo, TrendingRange, TrendingResponse } from '@studyplan/shared'
import { rangeToDays } from '@studyplan/shared'
import { GithubClient } from './github.client'
import { TrendingCache } from './schemas/trending-cache.schema'
import { resolveTrendingTtlMs } from './utils/trending-ttl'

/**
 * 两次真实请求之间的最小间隔（毫秒）。
 *
 * 这是**保护上游**的硬闸：哪怕缓存早就过期、哪怕有十个用户同时请求，
 * 每分钟最多只有一次请求能真正打到 GitHub。
 * 配合"未认证 10 次/分钟"的限流线，留了十倍余量。
 */
const MIN_REFRESH_INTERVAL_MS = 60_000

const MS_PER_DAY = 24 * 60 * 60 * 1000

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name)

  private readonly ttlMs: number

  constructor(
    @InjectModel(TrendingCache.name)
    private readonly cacheModel: Model<TrendingCache>,
    private readonly client: GithubClient,
    config: ConfigService,
  ) {
    this.ttlMs = resolveTrendingTtlMs(config)
  }

  /**
   * 取榜单数据。
   *
   * 整个方法是一条**降级链**，从最优到最差依次为：
   *   1. 缓存新鲜  → 直接返回，stale=false
   *   2. 缓存过期，但 60 秒内刚尝试过刷新 → 返回旧数据，stale=true
   *   3. 刷新成功   → 写缓存后返回，stale=false
   *   4. 刷新失败，但还有旧数据 → 返回旧数据，stale=true
   *   5. 刷新失败且无旧数据 → 抛错（这是唯一会让前端显示错误态的情况）
   *
   * 为什么要有 2 和 4 这两层"返回旧数据"？
   *   因为榜单是只读内容，用户看 6 小时前的数据也远好于看到一整页报错。
   *   **"陈旧但可用"胜过"新鲜但不可用"** —— 这是所有缓存型接口的通用取舍。
   */
  async getTrending(range: TrendingRange, language: string | null): Promise<TrendingResponse> {
    const now = Date.now()
    const cached = await this.cacheModel.findOne({ range }).lean()

    const isFresh =
      cached !== null && now - new Date(cached.fetchedAt).getTime() < this.ttlMs

    if (cached !== null && isFresh) {
      return this.buildResponse(cached.items as GithubRepo[], cached.languages, range, language, cached.fetchedAt, false)
    }

    // 缓存已过期（或压根没有），尝试刷新
    const claimed = cached === null ? true : await this.claimRefreshSlot(range, now)
    if (!claimed) {
      // 60 秒内已经有别的请求在刷了，先把手上的旧数据交出去
      return this.buildResponse(
        cached!.items as GithubRepo[],
        cached!.languages,
        range,
        language,
        cached!.fetchedAt,
        true,
      )
    }

    try {
      const since = new Date(now - rangeToDays(range) * MS_PER_DAY)
      const items = await this.client.searchTopNewRepos(since)
      const languages = aggregateLanguages(items)
      const fetchedAt = new Date()

      await this.saveCache(range, items, languages, fetchedAt)
      return this.buildResponse(items, languages, range, language, fetchedAt, false)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`拉取 GitHub 榜单失败（range=${range}）：${reason}`)

      // 有旧数据就降级返回，没有才真的失败
      if (cached !== null) {
        return this.buildResponse(
          cached.items as GithubRepo[],
          cached.languages,
          range,
          language,
          cached.fetchedAt,
          true,
        )
      }
      throw error
    }
  }

  /**
   * 原子地抢占"本轮刷新名额"。
   *
   * 为什么必须原子？
   *   线上是多实例 + 自动扩缩的 serverless 环境。冷启动后可能同时
   *   进来好几个请求，它们都会发现"缓存过期了"。
   *   如果各自去打 GitHub，就是典型的**惊群**——
   *   一分钟打出去十几次，直接撞上限流。
   *
   *   `findOneAndUpdate` 的条件里带了 `lastAttemptAt <= 阈值`，
   *   只有一个请求能匹配成功（MongoDB 保证单文档操作的原子性），
   *   其余的拿到 null，乖乖走降级分支。
   *
   * 注意这里**先占位再请求**：顺序反了的话，
   * 请求期间进来的并发请求会看到"还没更新"，于是全部放行。
   */
  private async claimRefreshSlot(range: TrendingRange, now: number): Promise<boolean> {
    const threshold = new Date(now - MIN_REFRESH_INTERVAL_MS)
    const result = await this.cacheModel
      .findOneAndUpdate(
        { range, lastAttemptAt: { $lte: threshold } },
        { $set: { lastAttemptAt: new Date(now) } },
        { new: false },
      )
      .lean()
    return result !== null
  }

  /** 写入缓存。upsert 让"首次创建"和"后续更新"走同一条代码路径 */
  private async saveCache(
    range: TrendingRange,
    items: GithubRepo[],
    languages: string[],
    fetchedAt: Date,
  ): Promise<void> {
    await this.cacheModel.updateOne(
      { range },
      { $set: { range, items, languages, fetchedAt, lastAttemptAt: fetchedAt } },
      { upsert: true },
    )
  }

  /**
   * 组装响应。
   *
   * 两个刻意的取舍：
   *
   * 1. **语言列表基于「筛选前」的全量数据**。
   *    如果基于筛选后的结果，用户选中 TypeScript 之后，
   *    筛选条里就只剩 TypeScript 一项 —— 想换语言得先取消选择，
   *    是很糟糕的体验。基于全量，切换时列表始终稳定。
   *
   * 2. **语言匹配用严格相等**，不做大小写模糊。
   *    GitHub 的语言名是规范化的（'TypeScript' 不会写成 'typescript'），
   *    模糊匹配只会让"选中了却匹配不上"这类 bug 更难排查。
   */
  private buildResponse(
    allItems: GithubRepo[],
    languages: string[],
    range: TrendingRange,
    language: string | null,
    fetchedAt: Date,
    stale: boolean,
  ): TrendingResponse {
    const items = language === null ? allItems : allItems.filter((item) => item.language === language)

    return {
      range,
      language,
      items,
      languages,
      total: items.length,
      fetchedAt: new Date(fetchedAt).toISOString(),
      stale,
    }
  }
}

/**
 * 从结果集里聚合出语言列表，按出现次数降序。
 *
 * 用 Map 而不是直接 `new Set()`：集合只能去重，拿不到"出现几次"，
 * 而按热度排序能让用户一眼看到这个区间的主流技术栈。
 */
function aggregateLanguages(items: GithubRepo[]): string[] {
  const counter = new Map<string, number>()

  for (const item of items) {
    // 没有语言的仓库不参与统计，否则列表里会出现一个没意义的 "null"
    if (!item.language) continue
    counter.set(item.language, (counter.get(item.language) ?? 0) + 1)
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
}
