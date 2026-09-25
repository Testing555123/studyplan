import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, SchemaTypes, Types } from 'mongoose'
import { User } from '../../users/schemas/user.schema'

/** 覆盖层里单个节点的值。形状与 shared 的 RoadmapOverrides 条目一致 */
export interface RoadmapStepEntry {
  status: string
  updatedAt: string
}

/**
 * 用户学习路线进度（对应 MongoDB 的 `roadmap_progress` 集合）。
 *
 * ── 为什么是"每人一份文档"，而不是"每人每节点一份文档"？ ──
 *
 * 点赞那种"数量无上限、还在持续增长"的数据必须拆独立集合
 * （见 like.schema.ts 的说明）。但学习节点不一样：
 *   · 数量固定（当前 18 个），且由 shared 常量裁决合法范围，
 *     用户可以"创造"出新键的机会为零；
 *   · 读写模式是"整包取回 + 单点更新"，一份文档两头都满足；
 *   · 18 个节点 × 一条短记录远碰不到 16MB 上限。
 * 拆成 18 份文档换来的只有更多次查询，没有任何收益。
 *
 * ── 为什么 steps 不做深层 schema 校验？ ──
 *
 * 合法性不靠 Mongo 的嵌套校验，而是**在 service 层用 shared 的
 * `isKnownCourseId` + DTO 的 `@IsIn(COURSE_STATUSES)` 拦截** ——
 * 校验规则的源头是共享契约，不是数据库；把规则抄一份进 schema
 * 等于制造第二个真相来源（路线一加节点就得改 schema）。
 */
@Schema({
  timestamps: true,
  collection: 'roadmap_progress',
})
export class RoadmapUserProgress {
  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId

  /** 写入时的路线版本号（shared 的 ROADMAP_VERSION），供将来迁移判断 */
  @Prop({ required: true, default: 1 })
  roadmapVersion!: number

  /** courseId → { status, updatedAt }，即前端同名的"覆盖层" */
  @Prop({ type: Object, default: {} })
  steps!: Record<string, RoadmapStepEntry>

  createdAt!: Date
  updatedAt!: Date
}

export type RoadmapUserProgressDocument = HydratedDocument<RoadmapUserProgress>

export const RoadmapUserProgressSchema = SchemaFactory.createForClass(RoadmapUserProgress)

/**
 * 一人一条：唯一索引把"同一用户两份进度文档"变成数据库层面的不可能。
 * service 里的 upsert 语义（先查后插的并发漏洞）同样靠它兜底。
 */
RoadmapUserProgressSchema.index({ userId: 1 }, { unique: true })
