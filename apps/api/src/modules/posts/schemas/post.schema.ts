import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { CONTENT_MAX_LENGTH, MAX_TAGS_PER_POST, TITLE_MAX_LENGTH, isPostTag } from '@studyplan/shared'
import { AuthorEmbedded } from '../../../common/schemas/author.schema'

/**
 * 帖子文档（对应 MongoDB 的 `posts` 集合）。
 *
 * 这一层是**数据库的形状**，而不是接口的形状。
 * 两者刻意分开：
 *   - 数据库里有 _id、updatedAt、__v 这些前端不关心的东西；
 *   - 接口契约（packages/shared 里的 Post）只有前端需要的字段。
 * 中间的转换由 posts.mapper.ts 负责。
 *
 * 把"数据库形状"和"接口形状"混成一个，是后期最痛的技术债之一：
 * 你会不小心把内部字段发给前端，然后不敢再改数据库结构。
 */
@Schema({
  // 自动维护 createdAt / updatedAt，不用手写
  timestamps: true,
  collection: 'posts',
})
export class Post {
  @Prop({ required: true, trim: true, maxlength: TITLE_MAX_LENGTH })
  title!: string

  @Prop({ required: true, maxlength: CONTENT_MAX_LENGTH })
  content!: string

  /**
   * 标签。
   *
   * 这里加了**第二道校验**（第一道在 DTO 上）。
   * 看起来重复，但两者拦的是不同的东西：
   *   - DTO 拦的是"通过 HTTP 进来的请求"；
   *   - Schema 拦的是"任何写入这个集合的代码"——
   *     将来你写一个定时脚本或数据迁移脚本，它会绕过 DTO，但绕不过 Schema。
   * 这叫纵深防御（defense in depth）。
   */
  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (tags: string[]) =>
        Array.isArray(tags) && tags.length <= MAX_TAGS_PER_POST && tags.every(isPostTag),
      /**
       * 为什么参数要写成 `{ value: unknown }` 而不是直接省略类型？
       *
       * 因为 Mongoose 内部用的是 `ValidatorProps` 这个接口，
       * 但它**没有从包根导出**，你 import 不到。
       * 而我们只需要用到 `value` 一个字段，所以就地写一个结构化类型即可 ——
       * TypeScript 是结构性类型系统，只要形状兼容就成立。
       *
       * 这也是"不要盲目 import 一个类型"的实例：
       * 依赖库的内部类型没有导出时，用它的一小部分形状，比想办法把它撬出来更稳妥。
       */
      message: (props: { value: unknown }) =>
        `标签不合法：最多 ${MAX_TAGS_PER_POST} 个，且必须来自全站白名单（收到 ${JSON.stringify(props.value)}）`,
    },
  })
  tags!: string[]

  /**
   * AI 生成的摘要。
   * 数据库里用 `null` 表示"还没有/生成失败"，而契约里是可选字段（undefined）。
   * 两者在 JSON 里的表现不同（null 会出现，undefined 会被省略），
   * 这个差异由 mapper 统一抹平，前端只需要处理一种"空"。
   */
  @Prop({ type: String, default: null })
  summary!: string | null

  /**
   * AI 推荐的标签。
   *
   * 与作者的 `tags` **分开存**：作者意图与机器建议混在一个数组里，
   * 用户就无法表达"我不要这个标签"，你也无法区分"这篇文章被归类为
   * Vue 是因为作者认为如此，还是因为模型猜的"。
   *
   * 默认值是空数组而不是 null —— 因为"没有 AI 标签"在这个场景里
   * 就是"空列表"，用 `[]` 表达比 `null` 更自然，
   * 前端也少一层判空。
   */
  @Prop({ type: [String], default: [] })
  aiTags!: string[]

  @Prop({ type: AuthorEmbedded, required: true })
  author!: AuthorEmbedded

  @Prop({ type: Number, default: 0, min: 0 })
  likeCount!: number

  @Prop({ type: Number, default: 0, min: 0 })
  commentCount!: number

  /**
   * 下面两个字段由 `timestamps: true` 自动写入。
   * 这里**只声明类型、不加 @Prop** —— 加了反而会和时间戳机制重复定义同一个路径。
   */
  createdAt!: Date
  updatedAt!: Date
}

/** HydratedDocument = 文档数据 + Mongoose 的实例方法（save / toObject / populate…） */
export type PostDocument = HydratedDocument<Post>

export const PostSchema = SchemaFactory.createForClass(Post)

/**
 * 索引设计。
 *
 * 判断该不该建索引的标准只有一个：**这个查询条件会出现在高频路径上吗？**
 *
 * 1) `{ createdAt: -1 }`
 *    对应"帖子列表按时间倒序"这个每个用户都会触发的查询。
 *    没有它，MongoDB 要把整个集合读出来再排序。
 *
 * 2) `{ tags: 1, createdAt: -1 }`
 *    对应"按标签筛选 + 按时间倒序"。
 *    注意字段顺序：**等值条件在前、范围/排序条件在后**。
 *    反过来写（createdAt 在前）这个复合索引就没法被用于标签筛选。
 *
 * 为什么不给 title / content 建索引？
 *   它们不参与查询条件，只在返回结果里出现。
 *   索引是"为了更快找到"，不是"为了更快读出"。
 */
PostSchema.index({ createdAt: -1 })
PostSchema.index({ tags: 1, createdAt: -1 })
