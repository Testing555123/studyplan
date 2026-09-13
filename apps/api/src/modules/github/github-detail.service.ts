import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { GithubRepo, RepoDetailResponse } from '@studyplan/shared'
import { GithubClient } from './github.client'
import { TrendingCache } from './schemas/trending-cache.schema'
import { RepoSnapshotDoc } from './schemas/repo-snapshot.schema'
import { resolveTrendingTtlMs } from './utils/trending-ttl'

/** 快照超过这个天数就认为"可能不是最新" */
const SNAPSHOT_STALE_DAYS = 7

/**
 * 单个仓库的详情查询。
 *
 * ── 三级回退，是为了同时满足两个互相矛盾的目标 ──
 *
 *   1. 详情页是**可分享的路由**（URL 能直接打开、能发给别人），
 *      所以它不能依赖"当前榜单缓存里正好有这个项目"；
 *   2. GitHub 未认证限流只有 10 次/分钟，
 *      所以也不能每次打开都回源。
 *
 * 解法是按成本从低到高逐级找，并且**每一级命中后都尽量不再往下走**：
 *
 * ```text
 *   榜单缓存（免费）→ 已落库的快照（免费）→ 现取 GitHub（付费，取到就落库）
 * ```
 *
 * 最后一级"取到就落库"是关键：它让回源对每个仓库**只发生一次**，
 * 之后所有访问（包括别人打开你分享的链接）都从库里读。
 */
@Injectable()
export class RepoDetailService {
  private readonly logger = new Logger(RepoDetailService.name)

  private readonly ttlMs: number

  constructor(
    @InjectModel(TrendingCache.name)
    private readonly cacheModel: Model<TrendingCache>,
    @InjectModel(RepoSnapshotDoc.name)
    private readonly snapshotModel: Model<RepoSnapshotDoc>,
    private readonly client: GithubClient,
    config: ConfigService,
  ) {
    this.ttlMs = resolveTrendingTtlMs(config)
  }

  /**
   * 按 `owner/repo` 取详情。
   *
   * @throws NotFoundException 三级都没找到（仓库真的不存在，或已被删除/转为私有）
   */
  async getDetail(fullName: string): Promise<RepoDetailResponse> {
    // ① 榜单缓存：绝大多数情况下这里就命中了，零额外请求
    const fromCache = await this.findInTrendingCache(
      { 'items.fullName': fullName },
      (repo) => repo.fullName === fullName,
    )
    if (fromCache) {
      return { repo: fromCache.repo, stale: fromCache.stale, source: 'trending-cache' }
    }

    // ② 已落库的快照：项目掉出榜单、或缓存轮换之后靠它兜住分享链接
    const snapshot = await this.snapshotModel.findOne({ fullName }).lean()
    if (snapshot) {
      const ageDays = (Date.now() - new Date(snapshot.updatedAt).getTime()) / 86_400_000
      return {
        repo: snapshot.repo as unknown as GithubRepo,
        stale: ageDays > SNAPSHOT_STALE_DAYS,
        source: 'snapshot',
      }
    }

    // ③ 现取 GitHub，取到就落库，保证同一个仓库只回源一次
    const repo = await this.client.fetchRepo(fullName)
    if (!repo) {
      throw new NotFoundException(`找不到仓库 ${fullName}，它可能已被删除或转成了私有仓库`)
    }

    await this.snapshotModel.updateOne(
      { repoId: repo.id },
      { $set: { repoId: repo.id, fullName: repo.fullName, repo: repo as unknown as Record<string, unknown> } },
      { upsert: true },
    )
    this.logger.log(`仓库详情回源一次并落库：${fullName}`)

    return { repo, stale: false, source: 'github' }
  }

  /**
   * 按仓库 id 找仓库数据（生成简介时要用）。
   *
   * 与 `getDetail` 的区别：这里**不回源**。
   * 生成简介只需要"已经有的一份数据"作为素材；
   * 为一个没见过的 id 专门去打 GitHub，不值得。
   */
  async findRepoById(repoId: number): Promise<GithubRepo | null> {
    const fromCache = await this.findInTrendingCache(
      { 'items.id': repoId },
      (repo) => repo.id === repoId,
    )
    if (fromCache) return fromCache.repo

    const snapshot = await this.snapshotModel.findOne({ repoId }).lean()
    return snapshot ? (snapshot.repo as unknown as GithubRepo) : null
  }

  /**
   * 在榜单缓存里找仓库。
   *
   * 过滤交给 MongoDB（按 `items.fullName` 或 `items.id` 查内嵌子文档数组），
   * 只把可能命中的那 0-1 个文档取回来。
   * 不这么做的话，每次详情请求都要捞出 5 个时间档共约 500 条子文档，
   * 再在 JS 里逐条比对 —— 绝大多数数据传过来只为被丢掉。
   *
   * 同一个项目命中多个时间档是可能的（可以同时出现在 1d 和 7d 里），
   * 而详情页不关心用户从哪个档点进来 —— 找到就算命中。
   */
  private async findInTrendingCache(
    filter: Record<string, unknown>,
    predicate: (repo: GithubRepo) => boolean,
  ): Promise<{ repo: GithubRepo; stale: boolean } | null> {
    const caches = await this.cacheModel.find(filter, { items: 1, fetchedAt: 1 }).lean()

    for (const cache of caches) {
      const found = (cache.items as unknown as GithubRepo[]).find(predicate)
      if (found) {
        const age = Date.now() - new Date(cache.fetchedAt).getTime()
        return { repo: found, stale: age >= this.ttlMs }
      }
    }

    return null
  }
}
