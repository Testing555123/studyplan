import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Octokit } from '@octokit/rest'
import type { GithubRepo } from '@studyplan/shared'

/**
 * `toRepo` 的输入形状：只声明用到的字段，而不是给整个响应写一份完整类型
 * —— 这一点与替换前同理，也和 `GithubRepo` 契约只保留必需字段是同一个道理。
 *
 * 为什么要自己写窄类型、而不是直接用 Octokit 的响应类型：
 * 搜索结果与单仓库结果这两个端点在若干字段的可选性上并不一致
 * （例如 `has_downloads` 一边是 `boolean`、一边是 `boolean | undefined`），
 * 直接拿其中一个的类型当参数，另一个就接不进来。
 * 而我们真正读的只有下面这十几个字段，它们在两个响应里形状相同。
 */
interface RepoSource {
  id: number
  full_name: string
  name: string
  owner: { login: string; avatar_url: string } | null
  html_url: string
  homepage: string | null
  description: string | null
  language: string | null
  topics?: string[] | null
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  created_at: string
  pushed_at: string
}

/** 拉取时保留的条数。取 100 是因为这是 Search API `per_page` 的上限 */
export const GITHUB_SEARCH_PER_PAGE = 100

/**
 * README 清洗后保留的字符数上限。
 *
 * 这个数字是"信息量"和"token 成本"之间的取舍：
 * 前 2000 字通常已经包含项目介绍、特性与快速上手，
 * 再往后多是配置细节和贡献指南，对写报道没什么帮助，
 * 却会实打实地吃掉 prompt 的 token 配额。
 */
export const README_MAX_CHARS = 2000

/** 单次请求超时。GitHub 一般 1 秒内返回，给 10 秒足够容错又不至于拖垮请求 */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * GitHub API 客户端。
 *
 * 这个类是**唯一**知道"GitHub 长什么样"的地方。替换成 Octokit 之后，
 * 它负责的部分缩小到三件 SDK 不管的事：
 *   1. 查询怎么拼（刻意不带 language 限定符，见 `searchTopNewRepos`）；
 *   2. 原始字段 → 我们的契约 `GithubRepo` 的映射；
 *   3. 哪些失败抛错、哪些失败返回 null（这是本项目的降级语义，不是 GitHub 的）。
 *
 * 而 `User-Agent`、认证头、状态码到错误对象的转译、分页与响应类型，
 * 全部交回给 SDK —— 那 259 行手写 fetch 里有相当一部分是在重造这些。
 *
 * 这个边界同样重要：如果有一天换成镜像站，只需要改这一个文件，
 * Service 与 Controller 一行都不用动。
 */
@Injectable()
export class GithubClient {
  private readonly logger = new Logger(GithubClient.name)

  private readonly octokit: Octokit

  constructor(config: ConfigService) {
    const token = config.get<string>('GITHUB_TOKEN') ?? null

    if (!token) {
      /**
       * 没有 Token 也能用，只是限流从 30 次/分钟降到 10 次/分钟。
       * 所以这里是 warn 而不是 error —— 功能是完整的，只是额度小。
       */
      this.logger.warn('未配置 GITHUB_TOKEN，将以未认证模式访问 GitHub（限流 10 次/分钟）')
    }

    /**
     * `auth` 只在有 Token 时传，不能传 `null` / 空串：
     * Octokit 会把它当成一个真实凭据去签请求头，于是每个请求都带一个
     * `Authorization: Bearer ` 空值，GitHub 直接 401 —— 比不配 Token 更糟。
     *
     * 这里**没有**挂 retry / throttling 插件：那会改变"一次请求就是一次请求"的
     * 现有语义（重试会吃掉 `GITHUB_INTRO_TIME_BUDGET_MS` 的时间预算）。
     * 选型文档把「限流重试」列为 Octokit 的能力，但要等 P26（未认证配额下的实测）
     * 有结论再开，不能顺手加上就当已通过。
     */
    this.octokit = new Octokit({
      ...(token ? { auth: token } : {}),
      userAgent: 'studyplan-app',
    })
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
    try {
      const { data } = await this.withTimeout((options) =>
        this.octokit.search.repos({
          q: `created:>=${since}`,
          sort: 'stars',
          order: 'desc',
          per_page: GITHUB_SEARCH_PER_PAGE,
          // Octokit v22 的端点方法只收一个参数：`request` 这个键会被 endpoint
          // 合并逻辑单独摘出来当请求选项，不会当成查询串发给 GitHub
          ...options,
        }),
      )

      // items 缺失按空数组处理：调用方的降级链要的是"没有数据"，不是"未知形状的响应"
      const items = Array.isArray(data.items) ? data.items : []
      return items.map((item) => this.toRepo(item))
    } catch (error) {
      throw this.translate(error)
    }
  }

  /**
   * 取单个仓库的详情，失败返回 `null`。
   *
   * 为什么失败要返回 null 而不是抛错：
   *   详情页的数据是**三级回退**的（榜单缓存 → 已落库快照 → 现取 GitHub），
   *   这里是最后一级。它失败时调用方要能继续往下走、给出 404，
   *   而不是把一个上游错误原样甩给用户。
   *   与 `fetchReadme` 同理：**可选能力用 null 表达失败。**
   */
  async fetchRepo(fullName: string): Promise<GithubRepo | null> {
    const target = this.splitFullName(fullName)
    if (target === null) return null

    try {
      const { data } = await this.withTimeout((options) =>
        this.octokit.repos.get({ ...target, ...options }),
      )
      return this.toRepo(data)
    } catch (error) {
      this.logger.debug(`抓取仓库详情失败（${fullName}）：${this.messageOf(error)}`)
      return null
    }
  }

  /**
   * 抓取仓库 README 的纯文本，失败返回 `null`。
   *
   * 为什么失败要返回 null 而不是抛错：
   *   README 是**可选素材** —— 没有它，报道还可以靠官方 `description` 写出来。
   *   让一个"锦上添花"的东西把整条链路打断，不值得。
   *   所以这里吞掉所有异常（404 没有 README、超时、限流…），交给调用方降级。
   */
  async fetchReadme(fullName: string): Promise<string | null> {
    const target = this.splitFullName(fullName)
    if (target === null) return null

    try {
      const { data } = await this.withTimeout((options) =>
        this.octokit.repos.getReadme({ ...target, ...options }),
      )

      // 只认 base64。GitHub 现在只回这一种，但显式判断能避免哪天换了编码后静默产出乱码
      if (!data.content || data.encoding !== 'base64') return null

      const raw = Buffer.from(data.content, 'base64').toString('utf8')
      const cleaned = this.cleanReadme(raw)

      return cleaned.length > 0 ? cleaned : null
    } catch (error) {
      this.logger.debug(`抓取 README 失败（${fullName}）：${this.messageOf(error)}，将退回官方描述`)
      return null
    }
  }

  /**
   * 把 README 的 Markdown 洗成"给模型看的纯文本"。
   *
   * 每一步都有明确目的：
   *   - 去代码块：安装命令对"这项目解决什么问题"帮助很小，但非常占 token；
   *   - 去图片、去链接 URL 只留文字：徽章（stars / build status）占篇幅却无信息量；
   *   - 去 HTML 标签：不少 README 用 `<div align="center">` 做排版；
   *   - 压掉连续空行：Markdown 的空行对模型没有意义。
   */
  private cleanReadme(raw: string): string {
    return raw
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .slice(0, README_MAX_CHARS)
  }

  /** 把 GitHub 的原始字段映射成我们的契约 */
  private toRepo(item: RepoSource): GithubRepo {
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

  /** `owner/repo` 拆不成两段时返回 null —— 一次请求都不该发出去 */
  private splitFullName(fullName: string): { owner: string; repo: string } | null {
    const [owner, repo] = fullName.split('/')
    if (!owner || !repo) return null
    return { owner, repo }
  }

  /**
   * 每次请求自带超时。
   *
   * `AbortController` 仍然由我们掌管：Octokit 不替你决定"等多久"，
   * 但认这个 signal —— 到点就中断，不会让一个卡住的上游把请求一直挂到
   * 平台的执行时长上限（本项目 300 秒）。
   *
   * 用"包住请求"而不是"返回一份配置对象"，是为了让 `clearTimeout` 落在
   * `finally` 里：成功路径也要清。只 `unref()` 不清的话，每个请求都会在
   * 事件循环里留一个 10 秒的悬空定时器和它拽着的 controller。
   */
  private async withTimeout<T>(
    run: (options: { request: { signal: AbortSignal } }) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      return await run({ request: { signal: controller.signal } })
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 把 Octokit 的错误转成我们能诊断的东西。
   *
   * 三条都来自真实踩坑，一条都不能省：
   *   1. abort 是自己触发的，SDK 给的是 `AbortError`，要说成"超时（10000ms）"；
   *   2. **403 单独提示限流** —— Search API 未认证只有 10 次/分钟，
   *      不提示的话排错的人会以为是权限问题往 Token 上找原因；
   *   3. 状态码必须出现在文案里，"请求失败"等于没说。
   */
  private translate(error: unknown): Error {
    if (error instanceof Error && error.name === 'AbortError') {
      return new Error(`GitHub 请求超时（${REQUEST_TIMEOUT_MS}ms）`)
    }

    const status = (error as { status?: number })?.status
    const message = this.messageOf(error)

    if (typeof status === 'number') {
      const hint = status === 403 ? '（很可能是触发了 Search API 限流）' : ''
      return new Error(`GitHub 返回 ${status} ${message}${hint}`)
    }

    // 其余错误（DNS、连接重置…）把原因带上去，但**不要打完整响应体**
    return error instanceof Error ? error : new Error(message)
  }

  private messageOf(error: unknown): string {
    if (!(error instanceof Error)) return String(error)
    const status = (error as { status?: number }).status
    return typeof status === 'number' ? `${status} ${error.message}` : error.message
  }
}
