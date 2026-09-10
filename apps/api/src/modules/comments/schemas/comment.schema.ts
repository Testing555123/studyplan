import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, SchemaTypes, Types } from 'mongoose'
import { COMMENT_MAX_LENGTH } from '@studyplan/shared'
import { AuthorEmbedded } from '../../../common/schemas/author.schema'
import { Post } from '../../posts/schemas/post.schema'

/**
 * 评论文档（对应 MongoDB 的 `comments` 集合）。
 *
 * ── 最关键的建模决定：为什么评论是**独立集合**，不是内嵌在帖子里？ ──
 *
 * 内嵌的写法看起来更自然：
 *   ```js
 *   { title: '...', comments: [ {...}, {...} ] }
 *   ```
 *
 * 但它有一个硬性天花板：**MongoDB 单个文档最大 16MB**。
 * 一条热门帖子的评论迟早会把这个空间撑爆 —— 而那一天到来时，
 * 表现是"这个帖子的评论突然发不出去了"，且不会有任何预警。
 *
 * 独立集合则没有这个上限，而且带来了额外的好处：
 *   - 评论可以独立分页、独立排序、独立删除；
 *   - 不会因为一条评论的写入而锁定整个帖子文档。
 *
 * 代价是每次要按 `postId` 再查一次 —— 所以**必须有 postId 索引**。
 * 没有索引的代价不是"慢一点"，而是"每条评论都要扫全集合"。
 */
@Schema({
  timestamps: true,
  collection: 'comments',
})
export class Comment {
  /**
   * 用 `SchemaTypes.ObjectId` 而不是 `String` 存外键。
   *
   * 两者都能用，但 ObjectId 有实际好处：
   *   - 只占 12 字节，而同样的字符串要 24 字节；
   *   - Mongoose 会自动把传入的字符串转成 ObjectId，
   *     传一个非法字符串会直接报错，而不是静默写入脏数据。
   *
   * `ref: Post.name` 建立"引用关系"，将来用 `populate` 时
   * Mongoose 知道该去哪个集合找。
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: Post.name, required: true })
  postId!: Types.ObjectId

  @Prop({ required: true, trim: true, maxlength: COMMENT_MAX_LENGTH })
  content!: string

  /** 与帖子共用同一份作者快照定义 */
  @Prop({ type: AuthorEmbedded, required: true })
  author!: AuthorEmbedded

  createdAt!: Date
  updatedAt!: Date
}

export type CommentDocument = HydratedDocument<Comment>

export const CommentSchema = SchemaFactory.createForClass(Comment)

/**
 * 索引：按帖子取评论，且按时间正序（最早的在前，符合阅读习惯）。
 *
 * 字段顺序同样是"等值在前、排序在后"：
 *   { postId: 1, createdAt: 1 }   ✅ 能同时用于筛选和排序
 *   { createdAt: 1, postId: 1 }   ❌ 前导字段不是查询条件，用不上
 */
CommentSchema.index({ postId: 1, createdAt: 1 })
