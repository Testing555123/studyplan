/**
 * AI 助手的契约类型。
 *
 * 这个模块承接两类提问：
 *   1. 问「榜上的开源项目」—— 上下文由前端从卡片带过来；
 *   2. 问「studyplan 本站代码」—— 上下文由后端从代码索引里检索。
 *
 * 两者共用同一个接口，是因为对用户来说它们就是同一件事："我不懂，问一句"。
 * 把接口按内部实现拆成两个，只会让前端多一处 if，用户毫无感知。
 */

/**
 * 提问时附带的「项目上下文」。
 *
 * 为什么不由后端自己按 fullName 去查 GitHub？
 *   因为榜单数据**已经**在前端手里了，直接带过来零成本；
 *   让后端再查一次既浪费 GitHub 配额，又因为榜单可能已刷新而对不上。
 * 所以这里只带"渲染与组织 prompt 必需"的几个字段，不塞整个仓库对象。
 */
export interface RepoQuestionContext {
  type: 'repo'
  fullName: string
  description: string | null
  language: string | null
  htmlUrl: string
}

/** 提问入参。不传 context 即视为"问本站代码" */
export interface AskAiRequest {
  question: string
  context?: RepoQuestionContext | null
}

/**
 * AI 不可用的原因。
 *
 * 为什么要细分，而不是统一返回"AI 出错了"？
 *   因为这几种情况的**用户该做的下一步完全不同**：
 *     · not-configured  → 功能没开，去找管理员（对你是"去配 Key"）
 *     · quota-exceeded  → 今天额度用完了，明天再来
 *     · rate-limited    → 你点太快了，稍等一下
 *     · error           → 上游真的出问题了，可以重试
 * 统一成一句"出错了"，用户就只能瞎猜。
 */
export type AiUnavailableReason =
  | 'not-configured'
  | 'quota-exceeded'
  | 'rate-limited'
  | 'error'

export interface AskAiResponse {
  /**
   * 答案正文（Markdown）。
   * 为 null 表示这次没拿到答案 —— 此时看 `reason`，前端据此显示对应提示。
   *
   * 为什么用 `null + reason` 而不是直接抛 HTTP 错误？
   *   因为 AI 是**旁路功能**：它失败不应该让调用方走异常分支。
   *   这跟发帖时 AI 摘要失败返回 null 是同一条设计原则 ——
   *   把"失败"表达成返回值而不是异常，调用方就不需要在每个调用点写 try/catch。
   */
  answer: string | null
  reason: AiUnavailableReason | null

  /**
   * 回答时引用到的本站代码文件（相对路径）。
   * 问开源项目时为空数组。
   *
   * 返回它是为了让答案**可验证**：用户可以顺着路径去看真实代码，
   * 而不是盲信模型的一面之词 —— 对一个学习项目来说这比答案本身更重要。
   */
  sources: string[]

  /** 本次是否命中缓存。命中则不消耗额度，前端可显示"来自缓存" */
  cached: boolean

  /** 今日剩余可用次数，用于前端显示"还能问 N 次" */
  remainingToday: number
}

/** `GET /ai/status` 的返回：前端用来决定要不要渲染 AI 入口 */
export interface AiStatus {
  enabled: boolean
  model: string
  remainingToday: number
  limitPerDay: number

  /**
   * Key 是否已配置。
   *
   * 与 `enabled` 同源（都来自 `client.enabled`），但语义更直白。
   * 加它的唯一目的是**部署自检**：运维在平台上配完环境变量后，
   * 不用去翻日志、不用读代码，直接打这个接口就知道"配进去了没有"。
   *
   * ⚠️ 一律可选：新前端 + 旧后端（没有这个字段）时，前端用可选链兜底，
   * 不能因为缺字段而报错。
   */
  keyConfigured?: boolean

  /**
   * 代码索引是否真正可用。
   *
   * 以"加载到了文件（fileCount > 0）"为准，而不是"读过文件"。
   * 原因见 `CodeIndexService`：它的 `loaded` 在"文件缺失 `load()` 返回空数组"
   * 时也是 `true` —— 两个截然不同的处境给出同一个信号，
   * 恰恰是部署排查时最该分清的。
   */
  codeIndexLoaded?: boolean

  /**
   * 索引里的文件条数。0 表示没加载到（文件缺失或内容非法）。
   * 单独给一个数量，是为了让"索引随镜像进去了吗"这条验证有个可核对的数字，
   * 而不是只给一个真假。
   */
  codeIndexFiles?: number
}
