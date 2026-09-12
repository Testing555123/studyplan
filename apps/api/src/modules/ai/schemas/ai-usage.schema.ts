import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

/**
 * AI 每日用量计数（集合 `ai_daily_usage`）。
 *
 * 为什么要落数据库而不是放内存？
 *   线上是**多实例 + 缩容到零**的 serverless 环境。内存计数在实例
 *   重启或扩容后就清零了，等于没有上限 —— 而这恰恰是免费额度最怕的事。
 *   落库之后，无论同时跑几个实例，看到的都是同一份计数。
 *
 * 一条文档 = 一天。用日期字符串而不是 Date 做键，
 * 是因为"哪一天"必须是明确的时区口径（这里统一用 UTC 日期）。
 */
@Schema({ collection: 'ai_daily_usage' })
export class AiDailyUsage {
  /** YYYY-MM-DD（UTC） */
  @Prop({ required: true, unique: true, index: true })
  date!: string

  /** 当天已消耗的真实调用次数（命中缓存的不计） */
  @Prop({ type: Number, default: 0, min: 0 })
  count!: number
}

export const AiDailyUsageSchema = SchemaFactory.createForClass(AiDailyUsage)

/**
 * 答案缓存（集合 `ai_answer_cache`）。
 *
 * 这一条是**省钱的关键**：同样的问题（尤其"这个项目是干什么的"）
 * 会被反复问到。命中缓存就完全不消耗额度。
 *
 * 键用"问题 + 上下文"的哈希，而不是原始问题字符串 ——
 * 因为 MongoDB 的 _id / 唯一索引对超长字段不友好，
 * 而且问题里可能有各种空白字符差异，哈希前会先归一化。
 */
@Schema({ collection: 'ai_answer_cache' })
export class AiAnswerCache {
  @Prop({ required: true, unique: true, index: true })
  hash!: string

  @Prop({ required: true })
  answer!: string

  /** 回答时引用到的本站代码文件 */
  @Prop({ type: [String], default: [] })
  sources!: string[]

  /**
   * 缓存写入时间。
   *
   * 这里**不用 MongoDB 的 TTL 索引**，而是查询时手动判断过期：
   * TTL 索引的清理有最长 60 秒的延迟，且过期时间写死在索引里不好调；
   * 而我们的读远多于写，多读一个时间字段的成本可以忽略。
   */
  @Prop({ required: true, default: () => new Date() })
  createdAt!: Date
}

export const AiAnswerCacheSchema = SchemaFactory.createForClass(AiAnswerCache)
