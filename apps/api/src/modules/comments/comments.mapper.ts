import type { Comment as CommentContract } from '@studyplan/shared'

/**
 * 从数据库读出来的评论的"形状"。
 * 与 PostLean 同理：`.lean()` 或 `toObject()` 之后就是纯对象了。
 */
export interface CommentLean {
  _id: unknown
  postId: unknown
  content: string
  author: { id: string; username: string }
  createdAt: Date
}

/**
 * 数据库形状 → 接口契约形状。
 *
 * 注意 `postId` 和 `_id` 都要 `String()` 转一次：
 * 它们在数据库里是 ObjectId 对象，而契约里声明的是 string。
 * 不转换的话，前端拿到的会是一个 `{}` 形状的序列化结果 ——
 * 因为 ObjectId 的 JSON 表现是 `{"$oid": "..."}` 这类包装，
 * 或者直接变成一个空对象。这是很经典的"字段看起来有但读不出内容"的问题。
 */
export function toCommentContract(doc: CommentLean): CommentContract {
  return {
    id: String(doc._id),
    postId: String(doc.postId),
    content: doc.content,
    author: {
      id: doc.author.id,
      username: doc.author.username,
    },
    createdAt: doc.createdAt.toISOString(),
  }
}
