import type { Post } from './post.js'

/** 语义搜索的查询文本长度上限（DTO 校验与后端截断共用同一个数字） */
export const SEARCH_QUERY_MAX_LENGTH = 200
/** 「问全书」单次问题长度上限 */
export const ASK_QUESTION_MAX_LENGTH = 500

/** 一条语义搜索结果：帖子本体 + 相关度（[0,1]，归一化向量点积） */
export interface SemanticPostResult {
  post: Post
  score: number
}

/**
 * 搜索不可用的原因。细分理由与 AskAiResponse 同一套路：
 * 用户该做的下一步完全不同（'index-empty' 是内容不够，'not-configured' 是没配 Key）。
 */
export type SearchUnavailableReason = 'index-empty' | 'not-configured' | 'error'

export interface SemanticSearchResponse {
  results: SemanticPostResult[]
  reason: SearchUnavailableReason | null
}

/** 问答引用到的来源帖子。sources 里的 postId 与 answer 正文中的 [1][2] 编号一一对应 */
export interface AskSource {
  postId: string
  title: string
  score: number
}

/** 与 AiUnavailableReason 同构，多一个 'no-sources'（检索为空时不硬编答案） */
export type AskPostsUnavailableReason =
  | 'not-configured'
  | 'quota-exceeded'
  | 'rate-limited'
  | 'no-sources'
  | 'error'

export interface AskSearchResponse {
  answer: string | null
  reason: AskPostsUnavailableReason | null
  sources: AskSource[]
  cached: boolean
  remainingToday: number
}

/** GET /search/status：前端据此决定空态文案，部署者据此自检 */
export interface SearchStatus {
  aiEnabled: boolean
  embedModel: string
  vectorCount: number
  vectorStoreReady: boolean
}
