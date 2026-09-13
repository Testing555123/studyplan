import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

/**
 * 「每日 GitHub 项目报道」的推荐记录（集合 `daily_picks`）。
 *
 * 一条文档 = 一天的一次推荐。它同时承担三件事：
 *
 * 1. **去重**：`repoId` 上的唯一索引让"同一个项目推两次"在数据库层就不可能发生，
 *    不需要"先查一遍再决定要不要写"（那有并发漏洞）。
 * 2. **节流**：`date` 上的唯一索引保证"一天至多一篇"，
 *    即使 Cron 和惰性触发同时打进来，也只有一个能写成功。
 * 3. **可追溯**：`postId` 回填后，可以反查"某篇报道对应哪个仓库"，
 *    将来要做"这个项目被推荐过，别再推了"或补发时都用得上。
 *
 * 为什么去重要用 `repoId`（数字 id）而不是 `fullName`？
 *   因为仓库会改名、会被转移给别的组织，`owner/repo` 是会变的；
 *   而 GitHub 的仓库 id 一旦分配就永久不变。
 *   用会变的东西当去重键，等于给将来埋一个"同名不同项目"的坑。
 */
@Schema({ timestamps: true, collection: 'daily_picks' })
export class DailyPick {
  /**
   * 日期键，格式 `YYYY-MM-DD`，按 `DAILY_DIGEST_TIMEZONE` 计算。
   *
   * 为什么不直接用 UTC 的日期？
   *   因为"每天一篇"是给人看的。用 UTC 的话，北京时间早上 9 点发的那篇
   *   会被记成前一天的日期，于是当天再触发一次时会被判成"已发过"而跳过 ——
   *   用户看到的是"今天没有更新"。
   */
  @Prop({ required: true, unique: true, index: true })
  date!: string

  /** GitHub 仓库 id：全局去重键 */
  @Prop({ required: true, unique: true, index: true })
  repoId!: number

  /** `owner/repo`，给人看和排查用 */
  @Prop({ required: true })
  fullName!: string

  @Prop({ required: true })
  htmlUrl!: string

  @Prop({ type: String, default: null })
  language!: string | null

  @Prop({ type: Number, default: 0 })
  stargazersCount!: number

  /**
   * 发帖成功后回填。
   *
   * `null` 有两种含义：「还没发」和「发失败了」。
   * 区分它们靠日志而不是靠这个字段 —— 因为失败是小概率事件，
   * 为了它再加一个 `failedAt` 字段不划算。
   */
  @Prop({ type: String, default: null })
  postId!: string | null

  /**
   * 这篇报道是 AI 写的还是模板兜底的。
   * 存下来是为了将来能统计"AI 到底有多少天是真正可用的"。
   */
  @Prop({ type: String, default: 'template' })
  source!: 'ai' | 'template'

  createdAt!: Date
  updatedAt!: Date
}

export type DailyPickDocument = HydratedDocument<DailyPick>

export const DailyPickSchema = SchemaFactory.createForClass(DailyPick)
