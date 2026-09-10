import type { PublicUser } from '@studyplan/shared'

/**
 * 从数据库读出来的用户的"形状"。
 * 与 PostLean 同理：`.lean()` 或 `toObject()` 之后就是纯对象了。
 *
 * 注意这里**没有** `passwordHash` 字段。
 * 不是忘了写 —— 是刻意不写：
 * 这样任何试图在这个形状上读 passwordHash 的代码都会编译报错。
 */
export interface UserLean {
  _id: unknown
  email: string
  username: string
  bio?: string | null
  avatarColor: string
  createdAt: Date
}

/**
 * 用户文档 → 对外契约。
 *
 * 这个函数是**密码哈希不泄漏的最后一道闸门**。
 * 前两道是：
 *   1. Schema 上的 `select: false`（默认查不出来）；
 *   2. 这一层的逐字段挑选（即使查出来了也不会被带出去）。
 *
 * 你会发现它和 posts.mapper.ts 是同一个模式：
 * **显式列出要发送的字段，而不是"整体发送再删掉敏感的"**。
 *
 * 为什么后者危险？因为"删掉敏感的"是一个容易漏的动作 ——
 * 将来给 User 加了 `phoneNumber`、`resetToken`，
 * 你必须记得回来加一行 delete。而"显式列出"不需要记得任何事：
 * 新字段默认不发送，必须有人主动加进来。
 *
 * 安全的默认值应该是"不发送"，而不是"发送后记得删"。
 */
export function toPublicUser(doc: UserLean): PublicUser {
  return {
    id: String(doc._id),
    email: doc.email,
    username: doc.username,
    avatarColor: doc.avatarColor,
    bio: doc.bio ?? undefined,
    createdAt: doc.createdAt.toISOString(),
  }
}
