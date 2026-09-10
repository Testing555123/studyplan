import type { Post as PostContract } from '@studyplan/shared'

/**
 * 从数据库读出来的帖子的"形状"。
 *
 * 为什么不用 PostDocument？
 *   因为列表查询里用了 `.lean()`，它绕过 Mongoose 的文档包装，
 *   直接返回纯 JS 对象（更快、更省内存），代价是丢掉文档实例方法。
 *   本文件只需要读字段，所以用这个更窄的接口来描述它。
 *
 * 注意 `_id` 声明成 `unknown`：它可能是 ObjectId、字符串，
 * 也可能是 lean 转换后的各种形态。我们只用 `String()` 取它的字符串形式，
 * 不需要知道具体类型 —— 这是"把不确定性收在一个地方"的写法。
 */
export interface PostLean {
  _id: unknown
  title: string
  content: string
  tags: string[]
  summary?: string | null
  aiTags?: string[]
  author: { id: string; username: string }
  likeCount?: number
  commentCount?: number
  createdAt: Date
}

/**
 * 数据库形状 → 接口契约形状。
 *
 * 为什么一定要有这一步？直接 `res.json(document)` 不行吗？
 *   不行，而且有害：
 *     1. 会把 `_id` / `__v` / `updatedAt` 这些内部字段发给前端，
 *        前端于是会开始依赖它们，你再想改结构就得同时改两端；
 *     2. 前端拿到的是 `_id` 而不是 `id`，每个页面都要写一次转换；
 *     3. 一旦某个字段是敏感信息（比如用户的 passwordHash），
 *        它就会**自动**泄漏出去 —— 因为你是"整体返回"而不是"逐字段挑选"。
 *
 * **显式挑选字段**是这一层的全部意义：默认不发送，要发就明确写出来。
 */
export function toPostContract(doc: PostLean): PostContract {
  return {
    id: String(doc._id),
    title: doc.title,
    content: doc.content,
    tags: doc.tags,
    // 数据库用 null 表示"没有摘要"，契约用可选字段（undefined）。
    // 统一成一个 `undefined`，前端就只需要判断一种"空"。
    summary: doc.summary ?? undefined,
    // 空数组也映射成 undefined，与 summary 的处理保持一致 ——
    // 契约里的"可选"只有一种空表示，前端不必同时判断 null / undefined / []
    aiTags: doc.aiTags?.length ? doc.aiTags : undefined,
    author: {
      id: doc.author.id,
      username: doc.author.username,
    },
    likeCount: doc.likeCount ?? 0,
    commentCount: doc.commentCount ?? 0,
    // Date 对象不能直接进 JSON 契约（契约里写的是 ISO 字符串），
    // 显式转一次，避免"有时候是 Date 有时候是字符串"这种不确定。
    createdAt: doc.createdAt.toISOString(),
  }
}
