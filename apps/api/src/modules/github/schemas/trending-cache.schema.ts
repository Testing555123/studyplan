import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'
import type { TrendingRange } from '@studyplan/shared'

/**
 * 单个仓库的快照（缓存文档的内嵌子文档）。
 *
 * 字段与 `packages/shared` 的 `GithubRepo` 契约一一对应，
 * 但**故意单独再声明一次**，而不是直接复用那个 interface：
 *
 *   - 契约是「前后端之间的约定」，改它是**破坏性变更**；
 *   - Schema 是「数据库的形状」，加字段只需要迁移数据。
 *
 * 两者放在一起（比如让 Schema 直接实现 GithubRepo），
 * 以后想给数据库加个内部字段（如 `cachedFrom`）时，
 * 就会被迫污染对外契约。这是本项目在 Post 上就定下的规矩。
 */
@Schema({ _id: false })
export class RepoSnapshot {
  @Prop({ required: true })
  id!: number

  @Prop({ required: true })
  fullName!: string

  @Prop({ required: true })
  name!: string

  @Prop({ required: true })
  ownerLogin!: string

  @Prop({ required: true })
  ownerAvatarUrl!: string

  @Prop({ required: true })
  htmlUrl!: string

  @Prop({ type: String, default: null })
  homepage!: string | null

  @Prop({ type: String, default: null })
  description!: string | null

  @Prop({ type: String, default: null })
  language!: string | null

  @Prop({ type: [String], default: [] })
  topics!: string[]

  @Prop({ type: Number, default: 0 })
  stargazersCount!: number

  @Prop({ type: Number, default: 0 })
  forksCount!: number

  @Prop({ type: Number, default: 0 })
  openIssuesCount!: number

  @Prop({ required: true })
  createdAt!: string

  @Prop({ required: true })
  pushedAt!: string
}

export const RepoSnapshotSchema = SchemaFactory.createForClass(RepoSnapshot)

/**
 * 榜单缓存文档（集合 `trending_caches`）。
 *
 * 设计要点：**一个时间档 = 一条文档**。
 *
 * 为什么不是「时间档 × 语言」一条？
 *   因为语言有几十种，组合会爆炸，而 GitHub Search API 的限流是
 *   **未认证 10 次/分钟、认证后也只有 30 次/分钟**（不是 core 的 5000/小时）。
 *   按语言缓存会在几分钟内把配额打光。
 *
 * 所以这里只按时间档存（5 条文档），语言筛选在**内存里**从这个数组过滤 ——
 * 一次全量刷新恰好 5 次请求，正好在限流线内。
 */
@Schema({ timestamps: true, collection: 'trending_caches' })
export class TrendingCache {
  /**
   * 缓存键，取值就是时间档（'1d' / '7d' / …）。
   *
   * 唯一索引是**必须的**：它让 upsert 变成幂等操作，
   * 多个实例并发刷新时不会插入重复文档。
   */
  @Prop({ required: true, unique: true, index: true })
  range!: TrendingRange

  @Prop({ type: [RepoSnapshotSchema], default: [] })
  items!: RepoSnapshot[]

  /** 该档数据里实际出现的语言，避免每次请求都重新聚合 */
  @Prop({ type: [String], default: [] })
  languages!: string[]

  /**
   * 数据**成功抓取**的时间。前端显示的"更新于 X 分钟前"取自它，
   * 也是判断软过期（是否该刷新）的依据。
   */
  @Prop({ required: true })
  fetchedAt!: Date

  /**
   * 最后一次**尝试**抓取的时间（不论成败）。
   *
   * 为什么要和 `fetchedAt` 分开？
   *   因为失败时 `fetchedAt` 不会变，如果只用它做节流，
   *   一旦上游持续不可用，每个请求都会去重试一次 ——
   *   请求放大，且全都注定失败。
   *
   * 有了 `lastAttemptAt`，就能实现"最小刷新间隔"：
   * 哪怕缓存早就过期了，只要 60 秒内刚尝试过，就先返回旧数据。
   * 这把外部请求频率**物理限制**在每分钟一次以内。
   */
  @Prop({ required: true })
  lastAttemptAt!: Date

  createdAt!: Date
  updatedAt!: Date
}

export type TrendingCacheDocument = HydratedDocument<TrendingCache>

export const TrendingCacheSchema = SchemaFactory.createForClass(TrendingCache)
