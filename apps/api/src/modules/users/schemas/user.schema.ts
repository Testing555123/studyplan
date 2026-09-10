import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@studyplan/shared'

/**
 * 用户文档（对应 MongoDB 的 `users` 集合）。
 *
 * 这个 Schema 里最重要的一个决定是第三个字段：`passwordHash`。
 */
@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  /**
   * `unique: true` 会在 MongoDB 上创建一个**唯一索引**。
   *
   * 这是"邮箱不能重复注册"这条业务规则的**最终防线**：
   *   应用层可以先用 findOne 查一次（为了给用户友好提示），
   *   但那有并发漏洞 —— 两个请求同时查到"没被注册"，然后都去插入。
   *   唯一索引是数据库层面保证的，任何并发都绕不过去。
   *
   * `lowercase: true` 让 `A@x.com` 和 `a@x.com` 被当作同一个邮箱 ——
   * 否则用户可以靠大小写注册出多个账号。
   */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string

  @Prop({
    required: true,
    trim: true,
    minlength: USERNAME_MIN_LENGTH,
    maxlength: USERNAME_MAX_LENGTH,
  })
  username!: string

  /**
   * 密码**哈希**，永远不存明文。
   *
   * 两个细节：
   *
   * 1. **字段名带 `Hash`**。这不是啰嗦 —— 它让任何读代码的人
   *    （包括三个月后的你）一眼就知道这里不能放明文，
   *    也给"把 password 直接存进来"这个错误增加了心理阻力。
   *
   * 2. **`select: false`**。默认情况下查询不会带出这个字段，
   *    必须显式 `.select('+passwordHash')` 才能拿到。
   *    这样"不小心把用户文档直接返回给前端"的路径就自动断掉了 ——
   *    因为字段根本不在查询结果里。
   *
   * 为什么用 bcrypt 而不是 SHA-256？
   *   因为 bcrypt 是**故意设计得慢**的，并且自带随机盐（salt）。
   *   SHA-256 快得离谱，攻击者一秒能试几十亿次；
   *   而 bcrypt 一次哈希要几十毫秒，暴力破解的成本高出若干个数量级。
   *   对密码这种"低熵输入"来说，慢就是安全。
   */
  @Prop({ required: true, select: false })
  passwordHash!: string

  /** 简介，选填 */
  @Prop({ type: String, default: null })
  bio!: string | null

  /**
   * 生成式头像的配色（一个 Tailwind 渐变类名）。
   *
   * 为什么把"颜色"存进数据库，而不是每次算？
   *   因为它是由算法从用户名推导出来的，存下来可以保证
   *   **即使将来调色板变了，老用户的头像颜色也不会突然改变**。
   *   如果每次都现算，你改一次色板，全站用户头像一起换色。
   */
  @Prop({ required: true })
  avatarColor!: string

  /** 由 `timestamps: true` 自动写入，这里只声明类型 */
  createdAt!: Date
  updatedAt!: Date
}

export type UserDocument = HydratedDocument<User>

export const UserSchema = SchemaFactory.createForClass(User)
