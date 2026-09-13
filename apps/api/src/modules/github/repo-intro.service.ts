import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { createHash } from 'node:crypto'
import { Model } from 'mongoose'
import type {
  GithubRepo,
  RepoIntro,
  RepoIntroBatchResponse,
} from '@studyplan/shared'
import { boolSetting, numberSetting } from '../../common/utils/config-values'
import { AiService } from '../ai/ai.service'
import { NvNimClient } from '../ai/nv-nim.client'
import { GithubClient } from './github.client'
import { RepoDetailService } from './github-detail.service'
import { buildRepoIntroPrompt } from './prompts/repo-intro.prompt'
import { RepoIntroDoc } from './schemas/repo-intro.schema'

/** 简介的长度上限。超过它卡片两行放不下，会被截断成半句话 */
const INTRO_MAX_LENGTH = 120

/** 短于这个长度的 AI 输出视为无效（通常是模型偷懒或中途被截断） */
const INTRO_MIN_LENGTH = 10

const DEFAULTS = {
  enabled: true,
  batchLimit: 3,
  timeBudgetMs: 20_000,
  aiMaxTokens: 300,
  aiTimeoutMs: 20_000,
  ttlDays: 30,
}

/**
 * AI 项目简介：读取与生成。
 *
 * ── 为什么一次调用只做"有限的工作量" ──
 *
 * 生成一条简介要真调一次模型，实测 20-40 秒。
 * 榜单一次要展示上百个项目，如果指望一次请求把它们全生成完，
 * 这个请求会挂几分钟，然后被平台掐断 —— 用户一条简介都看不到。
 *
 * 所以这里用**两个上限**把每次调用的工作量钉死：
 *   · 条数上限（`batchLimit`）：一次最多生成几条；
 *   · 时间预算（`timeBudgetMs`）：到了时间就交卷，不管还剩几条。
 *
 * 剩下的留给前端下一轮轮询。这样每次请求都在平台限制之内，
 * 而由于结果会落库，**第二次打开同一个榜单几乎全部命中缓存、瞬间全部显示**。
 *
 * ── 为什么"没有素材就跳过"而不是硬写 ──
 *
 * 简介的素材是官方 `description`，缺失时才破例抓一次 README。
 * 两者都没有的时候，模型手里只剩一个仓库名 ——
 * 那它只能编。所以这里直接跳过，`pending` 原样返回，
 * 前端继续显示"这个项目还没有填写简介"。
 * 宁可没有，也不能给读者一段看起来很专业、实际是编出来的介绍。
 */
@Injectable()
export class RepoIntroService {
  private readonly logger = new Logger(RepoIntroService.name)

  constructor(
    private readonly config: ConfigService,
    @InjectModel(RepoIntroDoc.name)
    private readonly introModel: Model<RepoIntroDoc>,
    private readonly detailService: RepoDetailService,
    private readonly githubClient: GithubClient,
    private readonly nvNimClient: NvNimClient,
    private readonly aiService: AiService,
  ) {}

  /**
   * 只读取已生成的简介，不触发任何生成。
   * 供轮询接口使用 —— 轮询必须是廉价的，否则它会变成第二次压力来源。
   */
  async getIntros(repoIds: number[]): Promise<RepoIntroBatchResponse> {
    if (repoIds.length === 0) return { intros: [], pending: [], degraded: false }

    const valid = await this.readValidIntros(repoIds)
    const readyIds = new Set(valid.map((item) => item.repoId))

    return {
      intros: valid,
      pending: repoIds.filter((id) => !readyIds.has(id)),
      degraded: !this.nvNimClient.enabled,
    }
  }

  /**
   * 读取已生成的简介，并**限量**为缺失的项目生成。
   *
   * 返回里 `intros` 是这次能给出的全部（含原本就有的），
   * `pending` 是还没有的 —— 前端据此决定要不要再轮询一次。
   */
  async ensureIntros(repoIds: number[]): Promise<RepoIntroBatchResponse> {
    if (repoIds.length === 0) return { intros: [], pending: [], degraded: false }

    const ready = await this.readValidIntros(repoIds)
    const readyIds = new Set(ready.map((item) => item.repoId))
    const missing = repoIds.filter((id) => !readyIds.has(id))

    if (missing.length === 0) return { intros: ready, pending: [], degraded: false }

    // AI 没配 Key：整体降级，前端不该再轮询
    if (!this.enabled || !this.nvNimClient.enabled) {
      return { intros: ready, pending: missing, degraded: true }
    }

    const missingRepos: GithubRepo[] = []
    for (const id of missing) {
      const repo = await this.detailService.findRepoById(id)
      if (repo) missingRepos.push(repo)
    }

    /**
     * 按 star 降序。
     *
     * 额度有限，先服务最可能被看到的项目：
     * 列表默认按 star 排，所以排在前面的项目就是用户最先看到的那几个。
     */
    missingRepos.sort((a, b) => b.stargazersCount - a.stargazersCount)

    const startedAt = Date.now()
    let degraded = false
    let generated = 0

    for (const repo of missingRepos) {
      if (generated >= this.batchLimit) break
      if (Date.now() - startedAt >= this.timeBudgetMs) break

      // 素材：有官方简介就不抓 README，抓 README 是"破例"而非常规路径
      let readme: string | null = null
      if (!repo.description) {
        readme = await this.githubClient.fetchReadme(repo.fullName)
        if (!readme) continue
      }

      const inputHash = hashInput(repo, readme, this.nvNimClient.currentModel)

      // 额度是复用的问答额度，耗尽就停止，但不算错误
      const quota = await this.aiService.tryConsumeQuota()
      if (!quota.allowed) {
        this.logger.warn('当日 AI 额度已耗尽，剩余简介本次不再生成')
        degraded = true
        break
      }

      try {
        const raw = await this.nvNimClient.chat(
          buildRepoIntroPrompt({
            fullName: repo.fullName,
            name: repo.name,
            language: repo.language,
            topics: repo.topics,
            description: repo.description,
            readme,
          }),
          { maxTokens: this.aiMaxTokens, timeoutMs: this.aiTimeoutMs },
        )

        const intro = cleanIntro(raw)
        if (!intro) continue

        await this.introModel.updateOne(
          { repoId: repo.id },
          {
            $set: {
              repoId: repo.id,
              fullName: repo.fullName,
              intro,
              model: this.nvNimClient.currentModel,
              inputHash,
            },
          },
          { upsert: true },
        )

        ready.push({
          repoId: repo.id,
          intro,
          model: this.nvNimClient.currentModel,
          updatedAt: new Date().toISOString(),
        })
        generated += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        this.logger.warn(`生成项目简介失败（${repo.fullName}）：${reason}`)
      }
    }

    const doneIds = new Set(ready.map((item) => item.repoId))
    return {
      intros: ready,
      pending: repoIds.filter((id) => !doneIds.has(id)),
      degraded,
    }
  }

  /**
   * 读取"仍然有效"的简介。
   *
   * 两条失效规则都是**能在读取时廉价判断**的：
   *   · 模型换了（存的 model 与当前不一致）；
   *   · 超过 TTL（作者可能已经改过官方简介）。
   *
   * 为什么不用 `inputHash` 判断：那需要重新算出输入指纹，
   * 而读取时手里只有 id，没有仓库数据 —— 为它把仓库全查一遍太贵。
   * 时间兜底（TTL）在"简介"这种低变化频率的内容上完全够用。
   */
  private async readValidIntros(repoIds: number[]): Promise<RepoIntro[]> {
    const docs = await this.introModel.find({ repoId: { $in: repoIds } }).lean()
    const ttlMs = this.ttlDays * 86_400_000
    const now = Date.now()
    const currentModel = this.nvNimClient.currentModel

    const result: RepoIntro[] = []

    for (const doc of docs) {
      const age = now - new Date(doc.updatedAt).getTime()
      if (doc.model !== currentModel) continue
      if (age > ttlMs) continue

      result.push({
        repoId: doc.repoId,
        intro: doc.intro,
        model: doc.model,
        updatedAt: new Date(doc.updatedAt).toISOString(),
      })
    }

    return result
  }

  private get enabled(): boolean {
    return boolSetting(this.config, 'GITHUB_INTRO_ENABLED', DEFAULTS.enabled)
  }

  private get batchLimit(): number {
    return numberSetting(this.config, 'GITHUB_INTRO_BATCH_LIMIT', DEFAULTS.batchLimit)
  }

  private get timeBudgetMs(): number {
    return numberSetting(this.config, 'GITHUB_INTRO_TIME_BUDGET_MS', DEFAULTS.timeBudgetMs)
  }

  private get aiMaxTokens(): number {
    return numberSetting(this.config, 'GITHUB_INTRO_AI_MAX_TOKENS', DEFAULTS.aiMaxTokens)
  }

  private get aiTimeoutMs(): number {
    return numberSetting(this.config, 'GITHUB_INTRO_AI_TIMEOUT_MS', DEFAULTS.aiTimeoutMs)
  }

  private get ttlDays(): number {
    return numberSetting(this.config, 'GITHUB_INTRO_TTL_DAYS', DEFAULTS.ttlDays)
  }
}

/** 输入指纹：模型、官方简介、README 三者任一变化都会导致重新生成 */
function hashInput(repo: GithubRepo, readme: string | null, model: string): string {
  const material = `${model}|${repo.description ?? ''}|${readme ?? ''}`
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}

/**
 * 清洗模型输出。
 *
 * 每一步都对应一种真实见过的输出：整段被引号包起来、裹一层代码块、
 * 前面加一句"简介："。这些都不会导致失败，但会直接显示给用户 ——
 * 与其指望模型每次都听话，不如在这里统一抹平。
 */
function cleanIntro(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .replace(/^[^一-龥A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length < INTRO_MIN_LENGTH) return null
  return text.slice(0, INTRO_MAX_LENGTH)
}
