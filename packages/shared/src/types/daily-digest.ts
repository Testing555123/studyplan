/**
 * 「每日 GitHub 项目报道」的对外契约。
 *
 * ── 为什么响应里要带一串"自检"字段 ──
 *
 * 这个装置很可能**什么都没做却不报错**：
 * 总开关没开、定时令牌没配、AI 没配 Key……每一种都只会让"今天没有推荐"，
 * 而不是给出错误。用户（包括维护者自己）面对一个空白的界面，
 * 根本分不清是"还没到发布时间"还是"根本没启用"。
 *
 * 所以这里把开关状态**如实暴露给前端**，让页面能直接说清原因，
 * 而不是让人去翻环境变量、猜自己漏了哪一项。
 * 这也是本项目一贯的做法：降级可以，但要**说得出来**。
 */

/** 今日推荐的项目与其发布的帖子 */
export interface DailyDigestPick {
  /** `owner/repo` */
  fullName: string
  /** GitHub 仓库地址 */
  htmlUrl: string
  language: string | null
  stargazersCount: number
  /**
   * 已发布帖子的 id。
   * `null` 表示已经占了今天的名额，但发帖那一步失败了（很少见）。
   */
  postId: string | null
  /** `ai` = AI 撰写；`template` = 模板兜底版（AI 不可用时会走这条） */
  source: 'ai' | 'template'
}

export interface DailyDigestStatusResponse {
  /** 按配置时区算出的"今天"（YYYY-MM-DD），前端用它判断这篇是不是今天的 */
  date: string

  /** 今天推荐的项目；null 表示今天还没有（未到发布时间、未启用、或候选池为空） */
  pick: DailyDigestPick | null

  /** 自检：总开关（`DAILY_DIGEST_ENABLED`）是否已开 */
  enabled: boolean

  /**
   * 自检：是否配置了定时令牌（`DAILY_DIGEST_CRON_TOKEN`）。
   *
   * 为 false 时，外部调度器（Vercel Cron）打进来会直接 401，
   * 装置只能靠惰性触发，因此这个字段必须让用户看见。
   */
  cronConfigured: boolean

  /** 自检：是否允许"读取接口顺带补发"。关掉后只能靠外部 Cron */
  lazyTrigger: boolean

  /**
   * 自检：AI 是否可用（是否配了 `NVNIM_API_KEY`）。
   *
   * 为 false 时装置**仍然会发**，只是内容是模板兜底版 ——
   * 所以这不是错误状态，但值得让用户知道今天这篇不是 AI 写的。
   */
  aiEnabled: boolean

  /**
   * 每天从第几个小时起才允许生成（按配置时区，0-23）。
   *
   * 它存在的唯一理由是让前端**说得出"几点才行"**：
   * 只给一个 `canPublishNow: false` 而不说清时间，
   * 用户看到的仍然是一个没反应的按钮，问题只是从"为什么没动"
   * 变成了"到底要等到什么时候"。
   */
  publishHour: number

  /**
   * 现在是否可以生成。
   *
   * **已经包含了 `enabled`**，即 `enabled && 当前小时 >= publishHour`。
   * 之所以把它做成一个"拿来就能决定按钮灰不灰"的字段，而不是让前端
   * 自己拿 `enabled` 和 `publishHour` 去拼：这个判断只能有一份实现。
   * 放两份的结果就是"前端算出来能点、后端却拒绝"这类分歧，
   * 而那种 bug 只在特定时刻出现，最难查。
   */
  canPublishNow: boolean
}
