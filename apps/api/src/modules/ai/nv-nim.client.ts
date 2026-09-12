import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** NV NIM 的 OpenAI 兼容端点 */
const NVNIM_BASE_URL = 'https://integrate.api.nvidia.com/v1'

/**
 * 默认模型。
 *
 * ⚠️ 千万不要以为"写死一个当前能用的模型名"就够了 ——
 * NV NIM 的**模型会下线**。实测证据：请求 `meta/llama-3.1-8b-instruct`
 * 返回的是 410 Gone，正文写着
 *   "The model 'meta/llama-3.1-8b-instruct' has reached its end of life
 *    on 2026-08-26T09:00:00Z and is no longer available."
 * （写这段注释期间又实测到 `nvidia/nemotron-3-nano-30b-a3b` 与
 *  `meta/llama-3.3-70b-instruct` 同样返回 410，可见下线有多频繁。）
 *
 * 所以模型名必须能靠环境变量 `NVNIM_MODEL` 覆盖，
 * 且遇到 410/404 时要给出"模型已下线，请更换"这种**可诊断**的提示，
 * 而不是把一串 HTTP 状态码甩给用户。
 *
 * ── 为什么默认是 gpt-oss-20b，而不是名字里带 "flash" 的那个 ──
 * 实测（同一个中文问答 prompt，要求 300 字以内）：
 *   · `deepseek-ai/deepseek-v4-flash-0731` 22 秒，且 reasoning 占 508 字、
 *     正文只剩 58 字 —— 它是**推理模型**，时间大量花在思考链上，
 *     问题一复杂就直接撞上 60 秒超时（本项目实测踩到过）；
 *   · `openai/gpt-oss-20b` 约 **36 字/秒**，是实测中产出答案最快的。
 *
 * 教训：模型名里的 "flash" 只说明它的**定位**，不代表延迟低。
 * 选模型必须拿真实负载实测，不能看名字猜。
 */
const DEFAULT_MODEL = 'openai/gpt-oss-20b'

/** 单次调用超时。AI 问答是交互式的，25 秒是"能忍受"的上限 */
const DEFAULT_TIMEOUT_MS = 25_000

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * NVIDIA NIM 客户端。
 *
 * 与 GithubClient 一样，它是**唯一**知道"上游长什么样"的地方：
 * 端点、鉴权头、请求体格式、超时、错误转译。
 * Service 只管"给我一段回答"或"抛错"。
 *
 * 全程用 Node 内置的 `fetch` —— NIM 是 OpenAI 兼容接口，
 * 不需要任何 SDK，更不需要当初智谱方案里那套 LangChain 依赖。
 * **零新增依赖**是这个项目一直守住的底线。
 */
@Injectable()
export class NvNimClient {
  private readonly logger = new Logger(NvNimClient.name)

  private readonly apiKey: string | null
  private readonly model: string
  private readonly timeoutMs: number

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('NVNIM_API_KEY') ?? null
    this.model = config.get<string>('NVNIM_MODEL')?.trim() || DEFAULT_MODEL

    const rawTimeout = Number(config.get<string>('NVNIM_TIMEOUT_MS'))
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS

    if (!this.apiKey) {
      this.logger.warn('未配置 NVNIM_API_KEY，AI 功能已停用（应用其余部分正常）')
    }
  }

  /** 是否可用。未配置 Key 时为 false，调用方据此跳过整个流程 */
  get enabled(): boolean {
    return this.apiKey !== null
  }

  /** 当前生效的模型名（供 /ai/status 展示，排查"到底用的哪个模型"很方便） */
  get currentModel(): string {
    return this.model
  }

  /**
   * 发起一次对话，返回助手的回复文本。
   *
   * 失败时抛出的 Error 消息**必须可直接展示给用户** ——
   * 因为 Service 会把它原样放进响应的降级原因里。
   * "Error: request failed" 这种消息对用户毫无价值。
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('AI 功能未启用：服务端未配置 NVNIM_API_KEY')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(`${NVNIM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        /**
         * max_tokens 是**总输出上限**。
         *
         * ⚠️ 对推理模型来说，这个额度要**同时**装下思考链与正文 ——
         * 实测有的模型思考能占掉一半以上（508 字的思考配 58 字的答案）。
         * 所以它不只是"限制答案长度"，更直接决定**最坏等待时间**。
         *
         * 定 800 的依据：Prompt 要求"300 字以内"，中文 300 字约 450 token，
         * 再留出思考链与 Markdown 标记的余量。设得更大不会让答案更好，
         * 只会让等待时间线性变长，最终撞上 60 秒超时上限。
         */
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.4,
          max_tokens: 800,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await this.describeFailure(response))
      }

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = payload.choices?.[0]?.message?.content?.trim()

      if (!content) {
        // 上游返回 200 但内容是空的，这种"成功却不给东西"的情况必须当成失败
        throw new Error('AI 返回了空内容')
      }

      return content
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`AI 响应超时（${this.timeoutMs}ms），请稍后再试`)
      }
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 把 HTTP 状态码翻译成人话。
   *
   * 注意：这里**只读取状态码**，不解析响应体里的敏感信息，
   * 也不把完整响应体写进日志 —— Key 与上游细节都不该出现在日志里。
   */
  private async describeFailure(response: Response): Promise<string> {
    if (response.status === 401 || response.status === 403) {
      return 'AI 服务鉴权失败：NVNIM_API_KEY 无效或已过期'
    }

    if (response.status === 410 || response.status === 404) {
      return `模型「${this.model}」已下线或不存在，请在环境变量 NVNIM_MODEL 中更换一个可用模型`
    }

    if (response.status === 429) {
      return 'AI 服务限流（请求过于频繁），请稍后再试'
    }

    if (response.status >= 500) {
      return `AI 服务暂时不可用（上游返回 ${response.status}）`
    }

    return `AI 服务返回 ${response.status} ${response.statusText}`
  }
}
