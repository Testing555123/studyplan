import { Prop, Schema } from '@nestjs/mongoose'
import { USERNAME_MAX_LENGTH } from '@studyplan/shared'

/**
 * 内嵌的"作者快照"，被帖子与评论共用。
 *
 * ── 为什么把它提到 common/ 下？ ──
 * 阶段 3 时它只属于帖子，写在 post.schema.ts 里就够了。
 * 阶段 6 加评论时，"评论也要显示作者名"是同一个需求 ——
 * 如果各自再定义一遍，两份定义迟早会漂移
 * （比如一处加了 maxlength、另一处忘了），而这种不一致极难排查。
 *
 * > 判断该不该抽取的信号：**第二个使用者出现的时候。**
 * > 只有一个人用的时候提前抽，只是把代码拆到两个文件里，反而更难读。
 *
 * ── 为什么存快照而不是只存 userId？ ──
 * 因为列表页要显示作者名。只存 id 的话，取 10 条评论要再查 10 次用户表
 * （经典的 N+1 问题）。而把整个用户文档嵌进来又会把密码哈希
 * 这类敏感字段带进评论集合 —— 一个集合里不该出现另一个集合的敏感数据。
 *
 * 折中做法就是**存最小快照**：读取效率最高，代价是用户名变更后
 * 历史内容显示旧名。对技术社区来说，"发布时作者叫这个名字"
 * 甚至更符合直觉，所以这个代价我们是主动接受的。
 *
 * `@Schema({ _id: false })`：内嵌文档不需要自己的 _id，
 * 否则 MongoDB 会给它生成一个没人用的 ObjectId，白白占空间。
 */
@Schema({ _id: false })
export class AuthorEmbedded {
  @Prop({ required: true, trim: true })
  id!: string

  @Prop({ required: true, trim: true, maxlength: USERNAME_MAX_LENGTH })
  username!: string
}
