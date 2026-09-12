import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AiPostMeta } from '@studyplan/shared'

/**
 * ⚠️ AI 调用依赖已移除（LangChain 三件套 + zod），本服务当前**恒为停用状态**。
 *
 * 为什么移除：`ZHIPUAI_API_KEY` 一直为空，该功能从未真正启用，
 * 却让项目长期背着 4 个与学习目标栈无关的第三方依赖。
 * 这里刻意保留"降级不中断"的契约，是为了让将来能一键恢复。
 *
 * ── 如何恢复 ──
 *   1. pnpm --filter @studyplan/api add @langchain/community @langchain/core @langchain/openai zod
 *   2. 恢复这些导入：
 *        import { ChatZhipuAI } from '@langchain/community/chat_models/zhipuai'
 *        import { HumanMessage, SystemMessage } from '@langchain/core/messages'
 *        import { buildPostMetaPrompt } from './prompts/post-meta.prompt'
 *        import { describeError, redactApiKey, sanitizePostMeta } from './utils/post-meta.sanitizer'
 *   3. 恢复 SYSTEM_PROMPT 常量与 generatePostMeta 里的调用逻辑
 *      （原实现可从 Git 历史找回，搜索 `withStructuredOutput`）
 *   4. 配上 ZHIPUAI_API_KEY 后重启
 *
 * prompt、sanitizer 及其单测都原样保留着，不必重写。
 */

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

  private readonly apiKey: string | null

  constructor(config: ConfigService) {
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
    if (!this.apiKey) {
      this.logger.warn('未配置 ZHIPUAI_API_KEY，AI 摘要与标签功能已停用（应用其余部分正常）')
    }
  }

  /** AI 功能是否可用。调用方据此决定要不要发起调用 */
  get enabled(): boolean {
    return this.apiKey !== null
  }

  /**
   * 生成摘要与推荐标签。
   *
   * @returns 清洗后的元数据；任何一步失败都返回 null
   */
  async generatePostMeta(input: { title: string; content: string }): Promise<AiPostMeta | null> {
    if (!this.apiKey) return null

    /**
     * AI 依赖已移除（恢复步骤见文件顶部注释），这里保留**降级契约**：
     * 不抛异常、直接返回 null，调用方（PostsService）照常完成发帖。
     *
     * 为什么不让这里直接抛"未实现"？
     *   因为它是核心链路（发帖）上的旁路组件。一旦改成抛异常，
     *   恢复依赖前的所有发帖都会失败 —— 这正是当初设计成"永远不抛异常"的原因。
     */
    this.logger.debug(`AI 能力当前停用，已跳过摘要生成（标题 ${input.title.length} 字）`)
    return null
  }

  /**
   * （已移除）给模型调用加超时。
   *
   * 原实现同时做两件事，恢复 AI 能力时必须一并恢复：
   *   ① `Promise.race` —— 保证应用层一定会往下走，不阻塞发帖主流程；
   *   ② `AbortController` —— 尽力真正取消底层请求，省带宽与服务端资源。
   * 原代码可从 Git 历史找回（搜索 `invokeWithTimeout`）。
   */
}
