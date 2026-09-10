import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, SchemaTypes, Types } from 'mongoose'
import { Post } from '../../posts/schemas/post.schema'
import { User } from '../../users/schemas/user.schema'

/**
 * 点赞记录（对应 MongoDB 的 `likes` 集合）。
 *
 * ── 为什么不把点赞的人存进帖子文档？ ──
 *
 * 直觉写法是在帖子上存一个数组：
 *   ```js
 *   { _id: postId, likedBy: ['u1', 'u2', ...] }
 *   ```
 * 它有两个致命问题：
 *
 *   1. **数组会无限增长**，最终撞上 16MB 单文档上限 ——
 *      一条爆款内容的点赞数会先把这个文档撑爆；
 *   2. **高并发下会写冲突**：每次点赞都要改同一个文档，
 *      MongoDB 对单文档的写入是串行的，热度一高就会拖慢整体响应。
 *
 * 独立集合把"一条点赞"变成一行独立记录，两个问题同时消失。
 *
 * ── 那"一个人不能重复点赞"靠什么保证？ ──
 *
 * 靠下面那个**复合唯一索引**。这是本文件最重要的一行。
 * 它不是"性能优化"，而是**业务规则的执行者**。
 */
@Schema({
  timestamps: true,
  collection: 'likes',
})
export class Like {
  @Prop({ type: SchemaTypes.ObjectId, ref: Post.name, required: true })
  postId!: Types.ObjectId

  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId

  createdAt!: Date
  updatedAt!: Date
}

export type LikeDocument = HydratedDocument<Like>

export const LikeSchema = SchemaFactory.createForClass(Like)

/**
 * 复合唯一索引：**同一个人对同一篇帖子只能有一条点赞记录**。
 *
 * 有了它，"重复点赞"这件事在数据库层面就变成了不可能 ——
 * 服务层不需要先查一次再插入（那有并发漏洞），
 * 直接插入，冲突了就知道"已经赞过了"。
 *
 * ── 顺带一个索引知识点 ──
 *
 * 复合索引 `{ postId: 1, userId: 1 }` 因为 `postId` 是**前导字段**，
 * 所以它同时能服务于"查某帖的所有点赞"这类只用 postId 的查询。
 * 因此**不需要**再单独建一个 `{ postId: 1 }` 索引 ——
 * 那是纯浪费：多占空间、拖慢写入。
 *
 * 判断原则：**看你的查询用得上哪个前缀**。
 * `{ a: 1, b: 1 }` 能服务 `a` 和 `a+b`，但服务不了单独的 `b`。
 */
LikeSchema.index({ postId: 1, userId: 1 }, { unique: true })
