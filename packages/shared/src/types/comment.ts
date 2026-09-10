import type { PostAuthor } from './post'

/**
 * 评论契约。
 *
 * 评论在数据库里是**独立集合**（不是嵌在帖子文档里的数组）。
 * 原因：评论数量会持续增长，MongoDB 单文档有 16MB 上限；
 * 独立集合 + `postId` 索引，才能做到"取某帖评论"既快又不受上限约束。
 */
export interface Comment {
  id: string
  postId: string
  content: string
  author: PostAuthor
  createdAt: string
}

export interface CreateCommentPayload {
  content: string
}

/**
 * 评论列表不分页：单帖评论量在 MVP 阶段是可控的。
 * 如果将来要分页，在这里补 page/pageSize 即可，前端会同时收到类型错误提醒。
 */
export interface CommentListResponse {
  items: Comment[]
  total: number
}
