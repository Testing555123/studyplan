import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

/**
 * 「不再推荐」名单（集合 `daily_pick_excludes`）。
 *
 * ── 它为什么单独存在 ──
 *
 * 报道发出去之后要能被撤回，而撤回要达到两件事：
 *
 *   1. 当天可以**换一个项目**补发 → 必须释放 `daily_picks` 里今天那一行；
 *   2. 被撤的项目**不再出现** → 又必须记住那个 `repoId`。
 *
 * 如果两件事都让 `daily_picks` 承担，就得把 `date` 的唯一索引改成
 * "只对未撤回的行生效"的部分唯一索引。但 `date` 上已经有一个同名唯一索引，
 * MongoDB 对**同名但选项不同**的索引会抛 `IndexOptionsConflict` ——
 * 于是新索引永远建不出来，`date` 仍是全量唯一，撤回后当天那个名额
 * 依然被占着。表现是"撤回之后今天就不再更新"，而且**一声不响**。
 *
 * 把"永久排除"独立成一张表就绕开了整件事：`daily_picks` 的索引语义
 * 一个字都不用改，也不需要任何索引迁移。
 *
 * 顺带它还是一本**撤回台账**：仓库快照留在这一行里，
 * 事后可以查"哪天推过什么、什么时候被撤的"。
 */
@Schema({ timestamps: true, collection: 'daily_pick_excludes' })
export class DailyPickExclude {
  /**
   * 被排除的仓库 id。唯一索引是这条规则的**最终权威**：
   * 同一项目被撤两次不会产生第二行，并发写入也只有一个能成功。
   */
  @Prop({ required: true, unique: true, index: true })
  repoId!: number

  /**
   * 原本发布的那一天（`YYYY-MM-DD`）。
   *
   * 这里**故意不加唯一索引**：同一天可以撤回多次
   * （先换一个补发、觉得仍不合适再撤），每次都是一条新记录。
   * 也正因为如此，它只是台账字段，不参与"一天一篇"的判断。
   */
  @Prop({ required: true, index: true })
  date!: string

  /** `owner/repo`，留快照是为了台账不依赖 GitHub 那边的数据还在不在 */
  @Prop({ required: true })
  fullName!: string

  @Prop({ required: true })
  htmlUrl!: string

  @Prop({ type: String, default: null })
  language!: string | null

  @Prop({ type: Number, default: 0 })
  stargazersCount!: number

  /** 被撤回的那篇帖子。`null` 表示占位时就没走到发帖那一步 */
  @Prop({ type: String, default: null })
  postId!: string | null

  /** 撤回时刻。只为台账可读，不参与任何逻辑判断 */
  @Prop({ type: Date, default: () => new Date() })
  revokedAt!: Date

  createdAt!: Date
  updatedAt!: Date
}

export type DailyPickExcludeDocument = HydratedDocument<DailyPickExclude>

export const DailyPickExcludeSchema = SchemaFactory.createForClass(DailyPickExclude)
