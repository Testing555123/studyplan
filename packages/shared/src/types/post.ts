/**
 * 帖子相关的契约类型 —— 本项目被前后端同时引用最多的一份定义。
 */

/** 帖子里内嵌的作者快照。"内嵌"而非"只存 id"，是为了列表页一次查询就能渲染完 */
export interface PostAuthor {
  id: string
  username: string
}

export interface Post {
  id: string
  title: string
  /** Markdown 原文。渲染成 HTML 是前端的事，后端只管存 */
  content: string
  tags: string[]
  /**
   * AI 生成的一句话摘要。
   * 为什么是可选的？因为 AI 调用可能超时或失败 —— 此时字段留空，
   * 但帖子必须已经发布成功。前端必须处理"没有摘要"的情况。
   */
  summary?: string

  /**
   * AI 推荐的标签（仅作展示与提示，**不影响作者自己选的 tags**）。
   *
   * ── 这是本项目第一次做"契约演进"，值得记住这个套路 ──
   *
   * 加一个**可选字段**是**向后兼容**的：
   *   - 旧的代码不读它，一切照常；
   *   - 新的代码可以不读（判空）或读（用起来）。
   *
   * 而如果加的是**必填字段**，所有构造 Post 的地方都会编译报错 ——
   * 那是一次破坏性变更。
   *
   * 所以演进契约的优先级是：
   *   加可选字段 ＞ 改字段名（要两端同时改）＞ 加必填字段（尽量避免）
   *
   * 为什么不把 AI 标签直接合进 `tags`？
   *   因为那样"哪些是作者自己选的、哪些是 AI 建议的"就分不清了。
   *   作者意图与机器建议混在一起，用户就无法表达"我不要这个标签"。
   *   分开存，展示时可以用不同样式区分，将来也允许用户"一键采纳"。
   */
  aiTags?: string[]
  author: PostAuthor
  likeCount: number
  commentCount: number
  /** ISO 8601 字符串，格式化展示交给前端 */
  createdAt: string
}

/** 列表接口的统一返回结构：分页必需三个数（本页数据、总数、当前页） */
export interface PostListResponse {
  items: Post[]
  total: number
  page: number
  pageSize: number
}

/** 发帖入参 */
export interface CreatePostPayload {
  title: string
  content: string
  tags: string[]
}

/** AI 结构化输出契约：Prompt 中明确要求模型返回这个 JSON，解析失败即触发降级 */
export interface AiPostMeta {
  summary: string
  tags: string[]
}

/** 列表查询参数（全部可选，后端给默认值） */
export interface PostQuery {
  page?: number
  pageSize?: number
  /** 传入某个标签时只返回带该标签的帖子 */
  tag?: string
  /** 多标签筛选（命中任意一个）；与 tag 二选一，优先于 tag */
  tags?: string[]
}
