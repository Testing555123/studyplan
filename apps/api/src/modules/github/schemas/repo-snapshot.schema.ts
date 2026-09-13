import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

/**
 * 单个仓库的快照（集合 `repo_snapshots`）。
 *
 * ── 为什么需要它 ──
 *
 * 详情页是一个**可以被直接打开、被分享**的路由，
 * 而它的首选数据源是榜单缓存 —— 一旦缓存轮换、或项目掉出前 100 名，
 * 缓存里就没有它了。
 *
 * 没有这张表的话，每条分享出去的链接都会变成一次 GitHub 回源，
 * 未认证限流只有 10 次/分钟，几个人同时点开就打满了。
 * 有了它，**回源只会发生一次**，之后所有访问都从库里读。
 *
 * ── 为什么 `repo` 存成 Object 而不是展开成字段 ──
 *
 * 这里存的是"对外契约 `GithubRepo` 的一份拷贝"。
 * 展开成二十来个字段，等于把契约在数据库层又抄一遍 ——
 * 以后契约加字段，要同时改类型、改 Schema、改读取处的映射，三处都得记得。
 * 而这张表唯一的用途就是"原样存、原样取"，存整体最省事也最不容易错。
 */
@Schema({ timestamps: true, collection: 'repo_snapshots' })
export class RepoSnapshotDoc {
  @Prop({ required: true, unique: true, index: true })
  repoId!: number

  /** `owner/repo`。详情页按它查询，所以也要唯一索引 */
  @Prop({ required: true, unique: true, index: true })
  fullName!: string

  /** GithubRepo 契约的完整拷贝 */
  @Prop({ type: Object, required: true })
  repo!: Record<string, unknown>

  createdAt!: Date
  updatedAt!: Date
}

export type RepoSnapshotDocument = HydratedDocument<RepoSnapshotDoc>

export const RepoSnapshotSchema = SchemaFactory.createForClass(RepoSnapshotDoc)
