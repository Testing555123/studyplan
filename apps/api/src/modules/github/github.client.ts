import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { GithubRepo } from '@studyplan/shared'

/**
 * GitHub Search API 的响应里我们真正用到的字段。
 *
 * 只声明用到的字段，而不是给整个响应写一份完整类型 ——
 * 完整响应有近百个字段，写全了既没人看，又要随 API 版本更新。
 * 这与 `GithubRepo` 契约只保留必需字段是同一个道理。
 */
interface GithubSearchItem {
  id: number
  full_name: string
  name: string
  owner: { login: string; avatar_url: string } | null
  html_url: string
  homepage: string | null
  description: string | null
  language: string | null
  topics?: string[]
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  created_at: string
  pushed_at: string
}

/** 拉取时保留的条数。取 100 是因为这是 Search API `per_page` 的上限 */
export const GITHUB_SEARCH_PER_PAGE = 100

/** 单次请求超时。GitHub 一般 1 秒内返回，给 10 秒足够容错又不至于拖垮请求 */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * GitHub API 客户端。
 *
 * 这个类是**唯一**知道"GitHub 长什么样"的地方：
 * 拼查询串、设请求头、处理超时、把非 2xx 转译成可诊断的错误。
 * Service 层完全不需要知道这些细节 —— 它只管"给我数据"或"抛错"。
 *
 * 这个边界很重要：如果有一天换成 GitLab 或镜像站，
 * 只需要改这一个文件，Service 与 Controller 一行都不用动。
 */
@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name)

  private readonly token: string | null

  constructor(config: ConfigService) {
    this.token = config.get<string>('GITHUB_TOKEN') ?? null

    if (!this.token) {
      /**
       * 没有 Token 也能用，只是限流从 30 次/分钟降到 10 次/分钟。
       * 所以这里是 warn 而不是 error —— 功能是完整的，只是额度小。
       */
      this.logger.warn('未配置 GITHUB_TOKEN，将以未认证模式访问 GitHub（限流 10 次/分钟）')
    }
  }

  /**
   * 查询"某个日期之后创建、按 star 降序"的仓库。
   *
   * @param createdSince 起始日期（含）。传当天则等价于"最近 1 天新建"
   */
  async searchTopNewRepos(createdSince: Date): Promise<GithubRepo[]> {
    const since = createdSince.toISOString().slice(0, 10)

    /**
     * 查询串刻意**不带 `language:` 限定符**。
     *
     * 理由在 trending-cache.schema.ts 里说过一遍，这里再强调：
     * 带语言就得"每语言一次请求"，组合爆炸且瞬间耗尽配额。
     * 语言筛选改在服务端从结果里过滤，代价是精度略微下降
     * （某个语言的第 101 名会漏掉），换来的是配额安全 —— 这笔交易划算。
     */
    const query = `created:>=${since}`
    const url =
      'https://api.github.com/search/repositories' +
      `?q=${encodeURIComponent(query)}` +
      '&sort=stars&order=desc' +
      `&per_page=${GITHUB_SEARCH_PER_PAGE}`

    const response = await this.request(url)
    const payload = (await response.json()) as { items?: GithubSearchItem[] }
    const items = Array.isArray(payload.items) ? payload.items : []

    return items.map((item) => this.toRepo(item))
  }

  /** 把 GitHub 的原始字段映射成我们的契约 */
  private toRepo(item: GithubSearchItem): GithubRepo {
    return {
      id: item.id,
      fullName: item.full_name,
      name: item.name,
      ownerLogin: item.owner?.login ?? '',
      ownerAvatarUrl: item.owner?.avatar_url ?? '',
      htmlUrl: item.html_url,
      homepage: item.homepage ?? null,
      description: item.description ?? null,
      language: item.language ?? null,
      topics: Array.isArray(item.topics) ? item.topics : [],
      stargazersCount: item.stargazers_count ?? 0,
      forksCount: item.forks_count ?? 0,
      openIssuesCount: item.open_issues_count ?? 0,
      createdAt: item.created_at,
      pushedAt: item.pushed_at,
    }
  }

  /**
   * 发起请求。
   *
   * 三个细节都来自真实的踩坑经验：
   *
   * 1. **必须带 `User-Agent`** —— GitHub 对没有它的请求直接返回 403。
   *    这条不是建议，是硬性要求。
   *
   * 2. **`AbortController` 做超时** —— `fetch` 本身没有超时概念，
   *    不主动中断的话，一个卡住的上游会让请求一直挂着，
   *    直到平台的执行时长上限（本项目是 300 秒）才被杀掉。
   *
   * 3. **错误信息里带上状态码**，并且 403 单独提示"可能是限流"。
   *    "请求失败"这种错误信息等于没说，排错时只会让人原地打转。
   */
  private async request(url: string): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'studyplan-app',
      }
      // Token 可选：有就带上，把限流从 10 次/分钟提到 30 次/分钟
      if (this.token) headers.Authorization = `Bearer ${this.token}`

      const response = await fetch(url, { headers, signal: controller.signal })

      if (!response.ok) {
        const hint = response.status === 403 ? '（很可能是触发了 Search API 限流）' : ''
        throw new Error(`GitHub 返回 ${response.status} ${response.statusText}${hint}`)
      }

      return response
    } catch (error) {
      // abort 是自己触发的，转成一句能看懂的话
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GitHub 请求超时（${REQUEST_TIMEOUT_MS}ms）`)
      }
      // 其余错误（DNS、连接重置…）把原因带上去，但**不要打完整响应体**
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      // 无论成功失败都要清掉定时器，否则进程里会残留
      clearTimeout(timer)
    }
  }
}
