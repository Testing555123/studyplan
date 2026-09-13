import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { createHash } from 'node:crypto'
import { Model } from 'mongoose'
import type { AiPostMeta, AiStatus, AskAiResponse, RepoQuestionContext } from '@studyplan/shared'
import { AiAnswerCache } from './schemas/ai-usage.schema'
import { AiDailyUsage } from './schemas/ai-usage.schema'
import { CodeIndexService } from './code-index.service'
import { NvNimClient } from './nv-nim.client'
import type { PostMeta } from './dto/post-meta.dto'
import { buildAskQuestionPrompt } from './prompts/ask-question.prompt'
import { buildPostMetaPrompt } from './prompts/post-meta.prompt'
import { sanitizePostMeta } from './utils/post-meta.sanitizer'

/** 每日真实调用上限的默认值（命中缓存的不计） */
const DEFAULT_DAILY_LIMIT = 300

/** 答案缓存保留时长（毫秒）。7 天足够长，又不会让内容永远陈旧 */
const ANSWER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * AI 服务：对外提供两类能力 ——
 *   1. `generatePostMeta`  发帖时生成摘要与标签（**旁路**，失败返回 null）
 *   2. `answerQuestion`    用户主动提问（返回结构化的降级原因）
 *
 * ── 这个类的设计原则只有一条：**它永远不抛异常** ──
 *
 * 所有失败都表达成返回值（`null` 或 `reason`），由调用方决定怎么办。
 * 为什么？因为它的调用方是"发帖"与"页面交互"这两条**用户能感知**的链路。
 * 如果 AI 失败会抛异常，那么每一个调用点都要写 try/catch ——
 * 写漏一处，用户的文章就发不出去、页面就白屏。
 *
 * 把"失败"表达成返回值而不是异常，是**旁路组件**的标准做法：
 * 异常是给"必须处理的问题"用的，而 AI 失败不是必须处理的问题。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  private readonly limitPerDay: number

  constructor(
    private readonly client: NvNimClient,
    private readonly codeIndex: CodeIndexService,
    @InjectModel(AiDailyUsage.name)
    private readonly usageModel: Model<AiDailyUsage>,
    @InjectModel(AiAnswerCache.name)
    private readonly cacheModel: Model<AiAnswerCache>,
    config: ConfigService,
  ) {
    const rawLimit = Number(config.get<string>('NVNIM_DAILY_LIMIT'))
    this.limitPerDay =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_DAILY_LIMIT
  }

  /** AI 功能是否可用。调用方据此决定要不要发起调用 */
  get enabled(): boolean {
    return this.client.enabled
  }

  /**
   * 生成摘要与推荐标签。
   *
   * @returns 清洗后的元数据；任何一步失败都返回 null
   */
  async generatePostMeta(input: { title: string; content: string }): Promise<AiPostMeta | null> {
    // 没有配置 Key 时**不让应用启动失败**，而是把功能标记为"未启用"
    if (!this.client.enabled) return null

    try {
      const prompt = buildPostMetaPrompt(input)
      const raw = await this.client.chat([{ role: 'user', content: prompt }])

      /**
       * 模型返回的是一段文本，里面应该有一个 JSON。
       * 直接 JSON.parse 是不行的：它经常附带 ```json 包裹或一句前言。
       */
      /**
       * 这里有一次**类型断言**，值得说明它为什么是安全的：
       *
       * `extractJsonObject` 拿到的是模型自由输出的文本，编译期只能知道
       * 它是 `unknown`。而 `sanitizePostMeta` 的职责恰恰就是
       * **校验任意输入**：字段缺失、类型不对、标签不在白名单，
       * 全都会被它拦下并返回 null。
       *
       * 也就是说，真正的类型检查发生在运行时的 sanitizer 里，
       * 这里的断言只是把"交给它去验"这件事告诉编译器。
       * 反过来，如果为了让类型好看而去掉 sanitizer，那就本末倒置了。
       */
      const parsed = extractJsonObject(raw) as PostMeta | null
      if (!parsed) {
        this.logger.warn('AI 返回的不是合法 JSON，已跳过摘要生成')
        return null
      }

      // sanitizePostMeta 是纯逻辑，覆盖了"字段缺失/类型不对/标签不在白名单"等全部情形
      return sanitizePostMeta(parsed)
    } catch (error) {
      // 只记原因，不打印 Key 与完整响应体
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`AI 摘要生成失败，已降级为无摘要：${reason}`)
      return null
    }
  }

  /**
   * 回答用户的提问。
   *
   * 返回结构而不是抛异常，所以调用方（Controller）不需要 try/catch。
   * 四种"拿不到答案"的情况都通过 `reason` 区分，前端据此显示不同提示 ——
   * 这对用户来说差别很大："今天额度用完了"和"AI 出错了"，
   * 前者他知道明天再来，后者他只会反复重试。
   */
  async answerQuestion(input: {
    question: string
    context?: RepoQuestionContext | null
  }): Promise<AskAiResponse> {
    const emptySources: string[] = []

    if (!this.client.enabled) {
      return { answer: null, reason: 'not-configured', sources: emptySources, cached: false, remainingToday: 0 }
    }

    const hash = hashQuestion(input.question, input.context)

    // ① 先看缓存：命中就完全不消耗额度
    const cached = await this.readCache(hash)
    if (cached !== null) {
      const remaining = await this.remainingQuota()
      return {
        answer: cached.answer,
        reason: null,
        sources: cached.sources,
        cached: true,
        remainingToday: remaining,
      }
    }

    // ② 再看额度：超了就明确告诉用户"今天用完了"
    const quota = await this.consumeQuota()
    if (!quota.allowed) {
      return {
        answer: null,
        reason: 'quota-exceeded',
        sources: emptySources,
        cached: false,
        remainingToday: 0,
      }
    }

    try {
      /**
       * 只有在"没有项目上下文"时，才去检索本站代码。
       * 带了项目上下文说明用户在问某个开源项目，
       * 此时塞一堆本站代码进去只会干扰模型。
       */
      let sources: string[] = []
      let snippets: { path: string; summary: string }[] | undefined

      if (!input.context) {
        const matched = await this.codeIndex.search(input.question)
        sources = matched.map((item) => item.path)
        snippets = matched.map((item) => ({ path: item.path, summary: item.summary }))
      }

      const prompt = buildAskQuestionPrompt({
        question: input.question,
        repoContext: input.context,
        codeSnippets: snippets,
      })

      const answer = await this.client.chat([{ role: 'user', content: prompt }])

      // 缓存与计数都失败也没关系 —— 它们只是优化，不该让"已经拿到的答案"丢掉
      await this.writeCache(hash, answer, sources)

      return {
        answer,
        reason: null,
        sources,
        cached: false,
        remainingToday: quota.remaining,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`AI 问答失败：${reason}`)

      // 上游限流单独区分：用户稍等一下就能重试
      const isRateLimited = reason.includes('限流')
      return {
        answer: null,
        reason: isRateLimited ? 'rate-limited' : 'error',
        sources: emptySources,
        cached: false,
        remainingToday: quota.remaining,
      }
    }
  }

  /** 供 /ai/status 使用：前端据此决定要不要渲染 AI 入口 */
  async getStatus(): Promise<AiStatus> {
    // `enabled` 与 `keyConfigured` 同源：都来自 client.enabled（key 是否非空）。
    // 不做第二个事实来源，只是给"部署自检"一个语义更直白的字段。
    const enabled = this.client.enabled
    const indexFiles = this.codeIndex.fileCount

    return {
      enabled,
      keyConfigured: enabled,
      model: this.client.currentModel,
      remainingToday: await this.remainingQuota(),
      limitPerDay: this.limitPerDay,
      codeIndexLoaded: indexFiles > 0,
      codeIndexFiles: indexFiles,
    }
  }

  /** 今日剩余额度 */
  private async remainingQuota(): Promise<number> {
    const used = await this.currentUsage()
    return Math.max(0, this.limitPerDay - used)
  }

  private async currentUsage(): Promise<number> {
    const today = todayKey()
    const doc = await this.usageModel.findOne({ date: today }).lean()
    return doc?.count ?? 0
  }

  /**
   * 消耗一次额度。
   *
   * 实现是"先读再增"而不是原子的 findOneAndUpdate，原因要说清楚：
   * 原子写法需要在查询条件里带 `count < limit`，配合 upsert 时
   * 一旦条件不匹配，MongoDB 会尝试**插入**一条新文档而撞上唯一索引，
   * 反而更难处理。
   *
   * 代价是并发下可能略微超出上限（几个请求同时读到同一个值）。
   * 对这个场景完全可以接受：额度是**软保护**，不是账务系统 ——
   * 宁可偶尔多花几次调用，也不要为它引入分布式锁。
   */
  private async consumeQuota(): Promise<{ allowed: boolean; remaining: number }> {
    const used = await this.currentUsage()
    if (used >= this.limitPerDay) return { allowed: false, remaining: 0 }

    const today = todayKey()
    await this.usageModel.updateOne({ date: today }, { $inc: { count: 1 } }, { upsert: true })

    return { allowed: true, remaining: Math.max(0, this.limitPerDay - used - 1) }
  }

  /** 读缓存；过期或不存在都返回 null */
  private async readCache(
    hash: string,
  ): Promise<{ answer: string; sources: string[] } | null> {
    try {
      const doc = await this.cacheModel.findOne({ hash }).lean()
      if (!doc) return null

      const age = Date.now() - new Date(doc.createdAt).getTime()
      if (age > ANSWER_CACHE_TTL_MS) return null

      return { answer: doc.answer, sources: doc.sources }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`读取 AI 答案缓存失败（按未命中处理）：${reason}`)
      return null
    }
  }

  private async writeCache(hash: string, answer: string, sources: string[]): Promise<void> {
    try {
      await this.cacheModel.updateOne(
        { hash },
        { $set: { hash, answer, sources, createdAt: new Date() } },
        { upsert: true },
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`写入 AI 答案缓存失败：${reason}`)
    }
  }
}

/** 今天的 UTC 日期键（YYYY-MM-DD） */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 问题指纹。
 *
 * 参与哈希的只有"问题 + 上下文标识"，并在哈希前做归一化
 * （去首尾空白、转小写）—— 否则多打一个空格就是一次新调用，
 * 缓存命中率会低得可怜。
 */
function hashQuestion(question: string, context?: RepoQuestionContext | null): string {
  const normalized = `${question.trim().toLowerCase()}|${context?.fullName ?? ''}`
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

/**
 * 从一段文本里抠出第一个 JSON 对象。
 *
 * 为什么不能 `JSON.parse(raw)`？
 *   因为大模型非常喜欢在 JSON 外面裹一层 ```json 代码块，
 *   或者加一句"好的，这是结果："。直接 parse 的成功率低得让人怀疑人生。
 *   取第一个 `{` 到最后一个 `}` 之间的内容，能覆盖绝大多数实际情况。
 */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
