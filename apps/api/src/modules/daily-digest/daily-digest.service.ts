/**
 * 每日 GitHub 项目报道：选项目 → 抓素材 → 生成 → 发帖。
 *
 * ── 这个装置最重要的性质：它失败时，用户毫无感觉 ──
 *
 * 它跑在定时任务里，不阻塞任何请求。GitHub 挂了、AI 超时了、
 * 模型下线了、甚至整个装置被关掉，用户都只是"今天没看到新报道"，
 * 而不会遇到报错或白屏。所以这里每一处外部调用都包了兜底：
 *
 *   · 候选池拿不到   → 当天跳过，记 warn
 *   · README 抓不到  → 退回官方描述（在 GithubClient 内部处理）
 *   · AI 不可用      → 退回模板数据卡片，照样发
 *   · 发帖失败       → 记录已在库里，不会重复补发
 *
 * ── 幂等靠数据库，不靠"先查再写" ──
 *
 * `daily_picks` 上 `date` 与 `repoId` 两个唯一索引是唯一的真相来源。
 * Cron 和惰性触发可能同时打进来，多实例也可能同时执行，
 * 但只有一个能插入成功。这是本项目在点赞那里就定下的规矩：
 * **能用唯一索引解决的并发，就不要用查询去判断。**
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { randomBytes } from 'crypto'
import { Model } from 'mongoose'
import {
  CONTENT_MAX_LENGTH,
  GITHUB_SOURCE_TAG,
  MAX_TAGS_PER_POST,
  isPostTag,
  mapRepoToTags,
  type DailyDigestPick,
  type DailyDigestStatusResponse,
  type GithubRepo,
  type TrendingRange,
} from '@studyplan/shared'
import type { AuthenticatedUser } from '../../common/types/authenticated-user'
import { boolSetting, numberSetting } from '../../common/utils/config-values'
import { isDuplicateKeyError } from '../../common/utils/mongo-errors'
import { NvNimClient } from '../ai/nv-nim.client'
import { GithubClient } from '../github/github.client'
import { GithubService } from '../github/github.service'
import { PostsService } from '../posts/posts.service'
import { UsersService } from '../users/users.service'
import { buildDailyReportPrompt } from './prompts/daily-report.prompt'
import { DailyPick } from './schemas/daily-pick.schema'
import { buildFallbackReport, buildReportTitle } from './utils/report-template'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * AI 输出短于这个长度就当成失败。
 *
 * 报道要求 400-800 字，如果模型只回了几十字，
 * 通常是它在偷懒或者中途被截断 —— 这种情况下模板版反而信息更全。
 */
const MIN_REPORT_LENGTH = 80

/** 各项配置的默认值。**总开关默认关**，保证没配置时装置完全不存在 */
const DEFAULTS = {
  enabled: false,
  timezone: 'Asia/Shanghai',
  publishHour: 9,
  minStars: 50,
  lookbackDays: 30,
  candidateLimit: 100,
  aiMaxTokens: 2000,
  aiTimeoutMs: 40_000,
  lazyTrigger: true,
  botUsername: 'github-daily',
}

interface DigestSettings {
  enabled: boolean
  timezone: string
  publishHour: number
  minStars: number
  lookbackDays: number
  /** 语言白名单。**空数组表示不限语言** */
  languages: string[]
  candidateLimit: number
  aiMaxTokens: number
  aiTimeoutMs: number
  lazyTrigger: boolean
  botUsername: string
}

export type DailyDigestStatus =
  | 'published'
  | 'already-published'
  | 'no-candidate'
  | 'disabled'
  | 'failed'

export interface DailyDigestResult {
  status: DailyDigestStatus
  /** 按配置时区算出的日期键 */
  date: string
  repo?: { fullName: string; htmlUrl: string }
  postId?: string
  source?: 'ai' | 'template'
  reason?: string
}

@Injectable()
export class DailyDigestService {
  private readonly logger = new Logger(DailyDigestService.name)

  constructor(
    private readonly config: ConfigService,
    @InjectModel(DailyPick.name)
    private readonly pickModel: Model<DailyPick>,
    private readonly usersService: UsersService,
    private readonly githubService: GithubService,
    private readonly githubClient: GithubClient,
    private readonly postsService: PostsService,
    private readonly nvNimClient: NvNimClient,
  ) {}

  /**
   * 跑一次每日报道。
   *
   * 这个方法**不抛异常** —— 任何失败都变成 `status: 'failed'`。
   * 因为调用它的是定时任务：抛出去的异常除了让 Cron 重试（从而放大故障）之外
   * 没有任何意义，而重试又会撞上 GitHub / AI 的限流。
   *
   * @param force 忽略总开关强制执行（手动调试用）
   */
  async runDailyDigest(options: { force?: boolean } = {}): Promise<DailyDigestResult> {
    const settings = this.readSettings()
    const date = this.todayKey(settings.timezone)

    if (!settings.enabled && options.force !== true) {
      return { status: 'disabled', date, reason: 'DAILY_DIGEST_ENABLED 未开启' }
    }

    try {
      // ── 1. 今天发过没有（快路径，避免白跑一次 GitHub 搜索）──
      const existing = await this.pickModel.findOne({ date }).lean()
      if (existing) {
        return {
          status: 'already-published',
          date,
          postId: existing.postId ?? undefined,
          repo: { fullName: existing.fullName, htmlUrl: existing.htmlUrl },
        }
      }

      // ── 2. 选项目 ──
      const candidate = await this.pickCandidate(settings)
      if (!candidate) {
        this.logger.warn(`每日报道跳过（${date}）：候选池里没有符合条件的新项目`)
        return { status: 'no-candidate', date, reason: '没有符合条件且未推荐过的项目' }
      }

      // ── 3. 占位。插入成功 == 抢到了"今天这一篇"的名额 ──
      try {
        await this.pickModel.create({
          date,
          repoId: candidate.id,
          fullName: candidate.fullName,
          htmlUrl: candidate.htmlUrl,
          language: candidate.language,
          stargazersCount: candidate.stargazersCount,
          postId: null,
          source: 'template',
        })
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          // 并发触发：另一个实例已经占位了，直接退出
          return { status: 'already-published', date, reason: '并发触发，已有实例在发布' }
        }
        throw error
      }

      // ── 4. 抓素材 + 生成正文 ──
      const readme = await this.githubClient.fetchReadme(candidate.fullName)
      const aiContent = await this.generateWithAi(candidate, readme, settings)

      const source: 'ai' | 'template' = aiContent ? 'ai' : 'template'
      const content = aiContent ?? buildFallbackReport(candidate, readme).content
      const title = buildReportTitle(candidate)
      const tags = this.resolveTags(candidate)

      // ── 5. 以 bot 身份发帖 ──
      const bot = await this.ensureBotUser(settings.botUsername)
      const post = await this.postsService.create({ title, content, tags }, bot)

      await this.pickModel.updateOne({ date }, { $set: { postId: post.id, source } })

      this.logger.log(
        `每日报道已发布：${candidate.fullName} → 帖子 ${post.id}（来源 ${source}）`,
      )

      return {
        status: 'published',
        date,
        postId: post.id,
        source,
        repo: { fullName: candidate.fullName, htmlUrl: candidate.htmlUrl },
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.error(`每日报道失败（${date}）：${reason}`)
      return { status: 'failed', date, reason }
    }
  }

  /**
   * 惰性触发：给"没有配置 Cron"的环境兜底。
   *
   * 它会在读取类接口被调用时顺带检查一次，因此**必须是廉价的**：
   * 命中"今天已发过"就直接返回，一次数据库查询而已。
   *
   * 为什么还要看 `publishHour`：
   *   否则凌晨三点有人访问一次就会把当天那篇发掉，
   *   用户早上起来看到的"今日推荐"其实是半夜发的。
   */
  async maybeTriggerOnRead(): Promise<void> {
    const settings = this.readSettings()
    if (!settings.enabled || !settings.lazyTrigger) return

    try {
      const date = this.todayKey(settings.timezone)
      const published = await this.pickModel.findOne({ date }).lean()
      if (published) return

      if (this.currentHour(settings.timezone) < settings.publishHour) return

      await this.runDailyDigest()
    } catch (error) {
      // 惰性触发是"顺手做的事"，失败绝不能影响本次读取
      this.logger.debug(
        `惰性触发失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * 今日状态 + 自检信息。
   *
   * 把"为什么没有推荐"的每一种原因都翻译成前端能直接展示的字段。
   * 这个装置最糟糕的表现不是失败，而是**静默地什么都不做** ——
   * 用户分不清"还没到点"和"根本没开"，只能去翻环境变量猜。
   */
  async getStatusResponse(): Promise<DailyDigestStatusResponse> {
    const settings = this.readSettings()
    const date = this.todayKey(settings.timezone)
    const pick = await this.pickModel.findOne({ date }).lean()

    return {
      date,
      pick: pick ? toPickView(pick) : null,
      enabled: settings.enabled,
      // 令牌本身绝不返回，只回答"配没配"
      cronConfigured: Boolean(this.config.get<string>('DAILY_DIGEST_CRON_TOKEN')?.trim()),
      lazyTrigger: settings.lazyTrigger,
      aiEnabled: this.nvNimClient.enabled,
    }
  }

  // ---------- 配置读取 ----------

  /**
   * 全部配置都从环境变量读，且**每一项都有默认值**。
   *
   * 这不是偷懒：`env.validation.ts` 在启动时 `fail fast`，
   * 只要新增一个没有默认值的必填项，所有没配它的环境都会启动失败。
   * 对"一个可选功能"来说，代价完全不成比例。
   */
  private readSettings(): DigestSettings {
    return {
      enabled: boolSetting(this.config, 'DAILY_DIGEST_ENABLED', DEFAULTS.enabled),
      timezone: this.config.get<string>('DAILY_DIGEST_TIMEZONE')?.trim() || DEFAULTS.timezone,
      publishHour: numberSetting(this.config, 'DAILY_DIGEST_PUBLISH_HOUR', DEFAULTS.publishHour),
      minStars: numberSetting(this.config, 'DAILY_DIGEST_MIN_STARS', DEFAULTS.minStars),
      lookbackDays: numberSetting(
        this.config,
        'DAILY_DIGEST_LOOKBACK_DAYS',
        DEFAULTS.lookbackDays,
      ),
      // 逗号分隔，例如 'TypeScript,JavaScript'；留空表示不限
      languages: (this.config.get<string>('DAILY_DIGEST_LANGUAGES') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      candidateLimit: numberSetting(
        this.config,
        'DAILY_DIGEST_CANDIDATE_LIMIT',
        DEFAULTS.candidateLimit,
      ),
      aiMaxTokens: numberSetting(this.config, 'DAILY_DIGEST_AI_MAX_TOKENS', DEFAULTS.aiMaxTokens),
      aiTimeoutMs: numberSetting(this.config, 'DAILY_DIGEST_AI_TIMEOUT_MS', DEFAULTS.aiTimeoutMs),
      lazyTrigger: boolSetting(this.config, 'DAILY_DIGEST_LAZY_TRIGGER', DEFAULTS.lazyTrigger),
      botUsername:
        this.config.get<string>('DAILY_DIGEST_BOT_USERNAME')?.trim() || DEFAULTS.botUsername,
    }
  }

  // ---------- 时间 ----------

  /**
   * 按指定时区算出今天的日期键 `YYYY-MM-DD`。
   *
   * 用 `formatToParts` 而不是 `toLocaleDateString()`：
   * 后者的输出格式**随 locale 变化**（'2026/09/13'、'09/13/2026' 都可能出现），
   * 当作数据库键用就是在赌博。这里手动拼，结果永远是 `YYYY-MM-DD`。
   */
  private todayKey(timezone: string): string {
    return this.formatInTimezone(timezone, ['year', 'month', 'day'], (p) => {
      const year = p.year ?? ''
      const month = p.month ?? ''
      const day = p.day ?? ''
      return `${year}-${month}-${day}`
    })
  }

  private currentHour(timezone: string): number {
    const hour = this.formatInTimezone(timezone, ['hour'], (p) => p.hour ?? '0')
    const parsed = Number(hour)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private formatInTimezone<T>(
    timezone: string,
    parts: Intl.DateTimeFormatPartTypes[],
    pick: (values: Partial<Record<Intl.DateTimeFormatPartTypes, string>>) => T,
  ): T {
    const options: Intl.DateTimeFormatOptions = { timeZone: timezone, hour12: false }
    for (const part of parts) {
      if (part === 'year') options.year = 'numeric'
      if (part === 'month') options.month = '2-digit'
      if (part === 'day') options.day = '2-digit'
      if (part === 'hour') options.hour = '2-digit'
    }

    try {
      const formatted = new Intl.DateTimeFormat('en-US', options).formatToParts(new Date())
      const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
      for (const item of formatted) values[item.type] = item.value
      return pick(values)
    } catch {
      // 时区名写错时 Intl 会抛错。退回 UTC，宁可日期差一天也不要让整个装置崩掉
      this.logger.warn(`时区「${timezone}」无效，已退回 UTC`)
      const formatted = new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: 'UTC',
      }).formatToParts(new Date())
      const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
      for (const item of formatted) values[item.type] = item.value
      return pick(values)
    }
  }

  // ---------- 选项目 ----------

  /**
   * 从候选池里挑一个今天可以推的项目。
   *
   * 候选池复用榜单的缓存（`GithubService.getTrending`），
   * 所以绝大多数情况下这一步**不消耗 GitHub 配额** ——
   * 缓存是 6 小时新鲜度，对"一天挑一次"绰绰有余。
   */
  private async pickCandidate(settings: DigestSettings): Promise<GithubRepo | null> {
    const range = rangeForDays(settings.lookbackDays)
    const { items } = await this.githubService.getTrending(range, null)

    const usedRepoIds = new Set(
      (await this.pickModel.find({}, { repoId: 1 }).lean()).map((pick) => pick.repoId),
    )

    const earliestCreatedAt = Date.now() - settings.lookbackDays * MS_PER_DAY
    const allowedLanguages = settings.languages

    return (
      items.slice(0, settings.candidateLimit).find((repo) => {
        if (usedRepoIds.has(repo.id)) return false
        if (repo.stargazersCount < settings.minStars) return false
        if (new Date(repo.createdAt).getTime() < earliestCreatedAt) return false
        // 语言白名单为空表示不限
        if (allowedLanguages.length > 0) {
          if (!repo.language || !allowedLanguages.includes(repo.language)) return false
        }
        return true
      }) ?? null
    )
  }

  // ---------- 生成 ----------

  /**
   * 调 AI 写报道，任何情况下都不抛异常。
   *
   * 失败返回 `null`，由调用方退回模板 ——
   * 这样"AI 不可用"就只是"内容朴素一点"，而不是"今天没有更新"。
   */
  private async generateWithAi(
    repo: GithubRepo,
    readme: string | null,
    settings: DigestSettings,
  ): Promise<string | null> {
    if (!this.nvNimClient.enabled) {
      this.logger.warn('AI 未启用（缺少 NVNIM_API_KEY），报道将使用模板兜底')
      return null
    }

    try {
      const messages = buildDailyReportPrompt({
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        homepage: repo.homepage,
        description: repo.description,
        language: repo.language,
        topics: repo.topics,
        stargazersCount: repo.stargazersCount,
        forksCount: repo.forksCount,
        openIssuesCount: repo.openIssuesCount,
        pushedAt: repo.pushedAt,
        readme,
      })

      const raw = await this.nvNimClient.chat(messages, {
        maxTokens: settings.aiMaxTokens,
        timeoutMs: settings.aiTimeoutMs,
      })

      const content = raw.trim()
      if (content.length < MIN_REPORT_LENGTH) {
        this.logger.warn(`AI 输出过短（${content.length} 字），改用模板兜底`)
        return null
      }

      return content.slice(0, CONTENT_MAX_LENGTH)
    } catch (error) {
      this.logger.warn(
        `AI 生成报道失败，改用模板兜底：${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  /**
   * 决定这篇报道打哪些标签。
   *
   * 来源标签 `GitHub` 放在最前面：它标志着"这篇是自动推荐"，
   * 前端靠它加角标，用户也可以靠它把这类内容筛出来。
   * 技术标签由语言与话题映射而来，映射不到就落 `工程化`。
   */
  private resolveTags(repo: GithubRepo): string[] {
    const mapped = mapRepoToTags({ language: repo.language, topics: repo.topics })
    const merged = [GITHUB_SOURCE_TAG, ...mapped.filter((tag) => tag !== GITHUB_SOURCE_TAG)]

    // 最后再过一次白名单并去重：宁可少打一个标签，也不要让发帖在校验层失败
    return [...new Set(merged)].filter(isPostTag).slice(0, MAX_TAGS_PER_POST)
  }

  // ---------- bot 账号 ----------

  /**
   * 取到机器人账号，没有就建一个。
   *
   * 为什么必须是 `users` 集合里的**真实文档**：
   *   帖子里存的是作者快照 `{ id, username }`，
   *   `id` 指向一个真实用户，前端的作者信息、头像才能正常渲染。
   *   随手编一个 id 也能存进去，但那会留下"点了作者名什么都打不开"的破窗。
   *
   * 为什么密码用随机串：
   *   这是**让账号无法登录**的最简单办法 ——
   *   没人知道明文，而哈希是不可逆的。机器人不该有登录能力。
   */
  private async ensureBotUser(username: string): Promise<AuthenticatedUser> {
    // 邮箱唯一索引是并发时的最终防线，所以这里用固定邮箱而不是随机邮箱
    const email = `${username}@studyplan.local`

    const existing = await this.usersService.findByEmail(email)
    if (existing) {
      return { id: String(existing._id), email: existing.email, username: existing.username }
    }

    try {
      const created = await this.usersService.create({
        email,
        username,
        password: randomBytes(32).toString('hex'),
      })
      this.logger.log(`已创建报道机器人账号：${username}`)
      return { id: String(created._id), email: created.email, username: created.username }
    } catch (error) {
      // 并发下另一个实例可能刚建好，再查一次而不是让今天的任务失败
      const raced = await this.usersService.findByEmail(email)
      if (raced) {
        return { id: String(raced._id), email: raced.email, username: raced.username }
      }
      throw error
    }
  }
}

/**
 * 把数据库里的推荐记录转成对外契约（只暴露前端要用的字段，不泄漏内部字段）。
 *
 * 参数用**结构化类型**而不是 `DailyPick`：这里的入参来自 `.lean()`，
 * 是一个普通对象而非 Mongoose 文档实例。写成结构化类型，
 * 既准确表达了"我只需要这几个字段"，也顺手告诉读代码的人：
 * 这个函数不会碰文档上的任何方法。
 */
function toPickView(pick: {
  fullName: string
  htmlUrl: string
  language: string | null
  stargazersCount: number
  postId: string | null
  source: 'ai' | 'template'
}): DailyDigestPick {
  return {
    fullName: pick.fullName,
    htmlUrl: pick.htmlUrl,
    language: pick.language,
    stargazersCount: pick.stargazersCount,
    postId: pick.postId,
    source: pick.source,
  }
}

/**
 * 把"往前看几天"换算成榜单的时间档。
 *
 * 取**能覆盖住它的最小档**：档位越大，缓存文档越大、聚合越慢，
 * 而多出来的那部分候选我们本来也会按 `lookbackDays` 过滤掉。
 */
function rangeForDays(days: number): TrendingRange {
  if (days <= 1) return '1d'
  if (days <= 7) return '7d'
  if (days <= 30) return '1m'
  if (days <= 90) return '3m'
  return '1y'
}
