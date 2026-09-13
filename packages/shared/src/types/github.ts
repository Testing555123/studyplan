/**
 * GitHub 热门项目的契约类型 —— 前后端共用。
 *
 * 这个模块存在的理由：榜单数据要**同时**被三处使用
 *   · 后端 Service（从 GitHub 拉取并写入缓存）
 *   · 后端 Controller（作为接口响应返回）
 *   · 前端页面（渲染卡片与筛选器）
 * 三处各写一份类型的话，任何一端改字段都不会报错，只会在运行时拿到 undefined。
 * 放在这里，改一次三处同时编译报错 —— 让**类型系统**替我们做回归测试。
 */

/**
 * 时间档。
 *
 * 口径是「该区间内**创建**的项目中 star 最高者」，不是「这段时间涨粉最快」。
 * 这个区别很大：前者是 GitHub Search API 能直接回答的（稳定、有官方文档），
 * 后者需要爬 Trending 页面（无官方 API、慢且易失效）—— 本项目明确不做后者。
 */
export type TrendingRange = '1d' | '7d' | '1m' | '3m' | '1y'

/**
 * 单个仓库的快照。
 *
 * 注意这里**不是** GitHub API 原始响应的照搬，而是"前端真正需要的字段"。
 * 原始仓库对象有近百个字段（permissions、license、各种 *_url 等），
 * 全存下来的后果是：
 *   1. 缓存文档体积暴涨（100 条 × 5 个时间档）；
 *   2. 前端 bundle 里塞进一堆用不到的类型定义；
 *   3. 最关键的 —— 以后想换字段时要分不清"哪些是真在用"。
 * 所以只保留写进卡片与 prompt 的字段，多余的在后端转换时就丢掉。
 */
export interface GithubRepo {
  /** GitHub 的仓库 id（数字）。用作去重键：同一个项目可能出现在多个时间档里 */
  id: number
  /** 形如 `owner/repo`，可直接展示 */
  fullName: string
  name: string
  ownerLogin: string
  ownerAvatarUrl: string
  /** 仓库主页，卡片标题的外链目标 */
  htmlUrl: string
  /** 项目自带官网，可能为 null（很多仓库不填这一项） */
  homepage: string | null

  /**
   * 项目简介，即 GitHub 官方的 `description`，可能是 null。
   *
   * 它是**事实来源**：作者自己写的一句话，比任何转述都准确。
   *
   * 页面上另外展示的 AI 润色版（见 `RepoIntro`）由它（或在它缺失时由 README）
   * 派生而来，展示时会替换掉这个值 —— 但**原始数据始终保留并可对照**。
   * 这样即使模型理解偏了，用户也还有一处准确信息可以退回。
   */
  description: string | null

  /**
   * 主要编程语言，即"按技术栈分类"的依据。
   * 明确可能为 null —— 空仓库或纯文档仓库没有语言，前端要归入「其他」。
   */
  language: string | null

  /** 仓库 topics，比 description 更能说明技术方向 */
  topics: string[]
  stargazersCount: number
  forksCount: number
  openIssuesCount: number

  /** ISO 8601。它是时间档筛选的**唯一判据**，所以必须保留 */
  createdAt: string
  /** 最后推送时间，用来判断项目是否还活跃 */
  pushedAt: string
}

/**
 * 榜单接口的返回结构。
 *
 * `languages` 为什么要单独返回，而不是让前端自己从 items 里聚合？
 *   因为服务端已经做过一次筛选与排序，由它给出"当前结果集里实际有哪些语言"
 *   最准确。若前端自己算，一旦服务端以后改了排序或截断规则，
 *   就会出现"筛选器里有这个语言，但点进去一条结果都没有"的鬼打墙。
 */
export interface TrendingResponse {
  range: TrendingRange
  /** 当前生效的语言筛选，null 表示「全部」 */
  language: string | null
  items: GithubRepo[]
  /** 当前结果集中实际出现的语言，按出现次数降序 */
  languages: string[]
  /** 筛选后的条数（不是 GitHub 上的总数，后者对榜单意义不大且要额外请求） */
  total: number

  /**
   * 数据抓取时间（ISO 8601）。
   * 前端据此显示"数据更新于 X 分钟前"。
   */
  fetchedAt: string

  /**
   * 本次返回的是否为**过期缓存**。
   *
   * 这是降级契约的一部分：GitHub 请求失败或触发限流时，
   * 只要数据库里还有旧数据就照常返回，但把这个标记置为 true，
   * 让前端显示"数据可能不是最新"。
   *
   * 为什么是"返回旧数据"而不是"报错"？
   *   因为榜单是只读的、允许略微陈旧的内容。用户宁愿看到
   *   "6 小时前的数据 + 一句提示"，也不愿看到一整页错误信息 ——
   *   后者会让人以为网站坏了。
   */
  stale: boolean
}

/**
 * AI 润色后的项目简介。
 *
 * 为什么它是**独立的对象**而不是直接改写 `GithubRepo.description`：
 *   `description` 是 GitHub 的事实，润色版是模型的演绎。
 *   两者混在一个字段里，就等于用演绎覆盖了事实 ——
 *   一旦模型理解偏了，用户看到的是一段通顺但错误的介绍，而且无从对照。
 *   分开之后，展示时可以替换，数据上各自保留。
 *
 * `repoId` 而不是 `fullName` 做键，理由与去重键一致：仓库会改名、会转移，
 * 而 GitHub 的数字 id 永久不变。
 */
export interface RepoIntro {
  repoId: number

  /**
   * 润色后的中文简介。
   *
   * `null` 表示**还没生成出来**（正在生成、额度耗尽、或 AI 未启用），
   * 此时前端应回退显示官方 `description`，而不是留出空白。
   */
  intro: string | null

  /** 生成它的模型名。排查"换了模型要不要重生成"时有用 */
  model: string | null

  /** 生成时间（ISO 8601） */
  updatedAt: string | null
}

/** 批量取简介的入参 */
export interface RepoIntroBatchRequest {
  repoIds: number[]
}

/**
 * 批量取简介的返回。
 *
 * 为什么用「批量」而不是每个项目一个接口：
 *   榜单一次要展示上百个项目，逐个请求会产生上百个并发连接，
 *   且每个都要各自去查一次缓存。批量接口让"查缓存"变成一次数据库查询，
 *   也让"限额生成"有了统一的调度点。
 */
export interface RepoIntroBatchResponse {
  /** 已经生成好的简介（可能少于请求的数量） */
  intros: RepoIntro[]

  /**
   * 还没生成的仓库 id。
   * 前端据此决定要不要再轮询一次 —— 生成是异步的，一次调用只会做有限的工作量。
   */
  pending: number[]

  /**
   * 本次是否整体降级（AI 未启用，或当日额度已耗尽）。
   * 为 true 时前端**不应继续轮询**：再问也是同样的结果。
   */
  degraded: boolean
}

/**
 * 单个仓库的详情响应。
 *
 * `source` 为什么要在响应里如实交代：
 *   详情页是可分享的路由，而数据来自三级回退（榜单缓存 → 已落库的快照 → 现取 GitHub）。
 *   前端拿它决定要不要提示"数据可能不是最新"，排查时也能一眼看出走了哪条路径。
 */
export interface RepoDetailResponse {
  repo: GithubRepo

  /** 是否来自过期缓存（与榜单的 `stale` 同义） */
  stale: boolean

  /**
   * 数据来源：
   *   · `trending-cache` 榜单缓存里就有（零额外请求）
   *   · `snapshot`       之前回源过并落库（零额外请求）
   *   · `github`         本次刚从 GitHub 取的（会写进 snapshot）
   */
  source: 'trending-cache' | 'snapshot' | 'github'
}
