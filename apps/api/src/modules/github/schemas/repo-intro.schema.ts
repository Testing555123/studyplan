import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

/**
 * AI 润色后的项目简介（集合 `repo_intros`）。
 *
 * ── 为什么单独一张表，而不是塞进 `ai_answer_cache` ──
 *
 * `ai_answer_cache` 的键是"问题 + 上下文"的哈希，面向的是**自由提问**；
 * 而简介的键是**仓库 id**，而且要额外回答几个问题：
 * 这个简介是哪个模型写的？基于哪份输入生成的？什么时候生成的？
 * 强行塞进缓存表，这些字段就得挤进 `sources` 那类通用数组里，越用越乱。
 *
 * 分开之后，"这个项目的简介要不要重新生成"变成一个可判定的问题：
 * 比较 `inputHash` 即可（见 `repo-intro.service.ts`）。
 */
@Schema({ timestamps: true, collection: 'repo_intros' })
export class RepoIntroDoc {
  /** GitHub 仓库 id。唯一索引保证一个项目只存一条，也天然防并发重复写 */
  @Prop({ required: true, unique: true, index: true })
  repoId!: number

  /** `owner/repo`，排查与人工核对时用得上 */
  @Prop({ required: true })
  fullName!: string

  @Prop({ required: true })
  intro!: string

  /** 生成它的模型名 */
  @Prop({ required: true })
  model!: string

  /**
   * 输入指纹。
   *
   * 由「模型名 + 官方 description + 用到的 README 摘要」算出。
   * 任一项变了，指纹就变，简介会被重新生成 ——
   * 这解决了两个真实问题：模型升级后旧简介不再符合新模型的口径；
   * 作者改了官方简介后，我们还拿着旧的在展示。
   */
  @Prop({ required: true })
  inputHash!: string

  createdAt!: Date
  updatedAt!: Date
}

export type RepoIntroDocument = HydratedDocument<RepoIntroDoc>

export const RepoIntroSchema = SchemaFactory.createForClass(RepoIntroDoc)
