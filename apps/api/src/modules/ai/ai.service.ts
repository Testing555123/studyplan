import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ChatZhipuAI } from '@langchain/community/chat_models/zhipuai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AiPostMeta } from '@studyplan/shared'
import { postMetaSchema, type PostMeta } from './dto/post-meta.dto'
import { buildPostMetaPrompt } from './prompts/post-meta.prompt'
import { describeError, redactApiKey, sanitizePostMeta } from './utils/post-meta.sanitizer'

/** 系统消息：定义角色与语气。与"任务描述"分开写，是因为它不随每次调用变化 */
const SYSTEM_PROMPT =
  '你是一个严谨的中文技术写作助手。你只输出符合要求的 JSON，从不添加额外解释。'

/**
 * AI 服务：把「文章标题 + 正文」变成「摘要 + 推荐标签」。
 *
 * ── 这个类的设计原则只有一条：**它永远不抛异常** ──
 *
 * 所有失败都返回 `null`，由调用方决定"没有元数据"该怎么办。
 * 为什么这样设计？
 *   因为它的调用方是"发帖"这条核心链路。如果 AI 失败会抛异常，
 *   那么每一个调用点都要写 try/catch —— 写漏一处，
 *   用户的文章就发不出去了。而作者真正在意的从来不是摘要。
 *
 * 把"失败"表达成返回值而不是异常，是**旁路组件**的标准做法：
 * 异常是给"必须处理的问题"用的，而 AI 失败不是必须处理的问题。
 *
 * ── 它不依赖任何数据库模块 ──
 * 这个类只负责"调用模型并清洗结果"，回填落库由 PostsService 做。
 * 这样依赖方向是单向的（posts → ai），不会形成循环依赖。
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name)

  private readonly model: ChatZhipuAI | null
  private readonly timeoutMs: number
  private readonly apiKey: string | null

  constructor(config: ConfigService) {
    this.timeoutMs = Number(config.get<string>('ZHIPUAI_TIMEOUT_MS') ?? 15000)
    this.apiKey = config.get<string>('ZHIPUAI_API_KEY') ?? null

    /**
     * 没有 Key 时**不让应用启动失败**，而是把功能标记为"未启用"。
     *
     * 这与 MONGODB_URI 的处理方式刻意不同：
     *   - 数据库是**核心依赖**，没有它整个后端没有意义 → 必须 fail fast；
     *   - AI 是**增强功能**，没有它应用依然完整可用（只是没有摘要）
     *     → 降级运行，并在日志里说清楚。
     *
     * > "哪些依赖必须存在"是一个产品判断，不是一个技术判断。
     * > 把增强功能也做成硬依赖，等于用一个可选项卡住了整个系统。
     */
    this.model = this.apiKey
      ? new ChatZhipuAI({
          apiKey: this.apiKey,
          model: config.get<string>('ZHIPUAI_MODEL') ?? 'glm-4-flash',
          /**
           * 温度调低。
           *
           * 摘要与标签是**信息提取**任务，不是创作任务 ——
           * 我们要的是"最可能正确的答案"，而不是"每次都不一样的答案"。
           * 同一个输入两次得到完全不同的摘要，会让用户觉得系统不稳定。
           */
          temperature: 0.3,
        })
      : null

    if (!this.model) {
      this.logger.warn('未配置 ZHIPUAI_API_KEY，AI 摘要与标签功能已停用（应用其余部分正常）')
    }
  }

  /** AI 功能是否可用。调用方据此决定要不要发起调用 */
  get enabled(): boolean {
    return this.model !== null
  }

  /**
   * 生成摘要与推荐标签。
   *
   * @returns 清洗后的元数据；任何一步失败都返回 null
   */
  async generatePostMeta(input: { title: string; content: string }): Promise<AiPostMeta | null> {
    if (!this.model) return null

    const startedAt = Date.now()

    try {
      const structured = this.model.withStructuredOutput(postMetaSchema)

      const raw = await this.invokeWithTimeout<PostMeta>((signal) =>
        structured.invoke(
          [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(buildPostMetaPrompt(input))],
          { signal },
        ),
      )

      const cleaned = sanitizePostMeta(raw)

      if (!cleaned) {
        /**
         * 走到这里说明"调用成功，但结果不可用" —— 比如标签全都
         * 不在白名单里、摘要是空的。
         *
         * 这是 AI 功能**最容易被忽略的一种失败**：
         * 它不会抛异常、不会超时，日志里一切正常，
         * 只是数据库里悄悄少了一个摘要。所以必须单独记一条 warn。
         */
        this.logger.warn(`AI 返回内容不可用，已跳过（耗时 ${Date.now() - startedAt}ms）`)
        return null
      }

      this.logger.log(
        `AI 生成完成：摘要 ${cleaned.summary.length} 字、标签 ${cleaned.tags.length} 个（耗时 ${Date.now() - startedAt}ms）`,
      )
      return cleaned
    } catch (error) {
      this.logger.warn(
        `AI 生成失败（耗时 ${Date.now() - startedAt}ms）：${redactApiKey(describeError(error), this.apiKey)}`,
      )
      return null
    }
  }

  /**
   * 给调用加上超时。
   *
   * 两件事同时做，缺一不可：
   *
   *   ① `Promise.race` —— **保证应用层一定会往下走**。
   *      不管底层的 HTTP 请求有没有真的结束，我们的代码
   *      在 timeoutMs 之后就会继续执行并发帖成功。
   *      这是"不阻塞主流程"的硬保证。
   *
   *   ② `AbortController` —— **尽力真正取消底层请求**。
   *      已确认 ChatZhipuAI 会把 signal 透传给底层的 fetch，
   *      所以这能真正省下带宽与服务端资源。
   *
   * 为什么不能只做 ②？因为"能不能取消"取决于第三方库的实现细节，
   * 而"不阻塞"是我们必须自己保证的。**依赖别人的承诺，不如自己兜底。**
   */
  private async invokeWithTimeout<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`调用超过 ${this.timeoutMs}ms 上限`))
      }, this.timeoutMs)
    })

    try {
      return await Promise.race([task(controller.signal), timeout])
    } finally {
      // 任务先完成时必须清掉定时器，否则它会一直挂到超时才触发，
      // 在进程退出时表现为"有一个未完成的定时器"这类难查的告警
      if (timer) clearTimeout(timer)
    }
  }
}
