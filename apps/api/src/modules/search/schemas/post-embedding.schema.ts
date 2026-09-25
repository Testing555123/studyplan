import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument, Types } from 'mongoose'

/**
 * 帖子的向量（对应 MongoDB 的 `postembeddings` 集合）。
 *
 * 为什么独立成集合而不是内嵌进 post 文档？
 *   向量是 1024 个浮点数（几 KB），塞进 post 会让每次列表查询
 *   都把它一起搬回来，而列表页根本不读这个字段。
 *
 * 为什么存 model 与 dim？
 *   换 embedding 模型后新旧向量不可混用（维度可能不同、语义空间正交）。
 *   把"哪个模型产出的"记在每条记录上，检索时按当前模型过滤，
 *   混库从"悄悄算出垃圾分数"变成"可检测的状态"。
 */
@Schema({ timestamps: true, collection: 'postembeddings' })
export class PostEmbedding {
  /** 对应 posts._id，一帖一向量 */
  @Prop({ type: Types.ObjectId, required: true, index: { unique: true } })
  postId!: Types.ObjectId

  @Prop({ required: true })
  model!: string

  @Prop({ required: true })
  dim!: number

  /** 写入前已做 L2 归一化，点积即余弦相似度 */
  @Prop({ type: [Number], required: true })
  vector!: number[]
}

export type PostEmbeddingDocument = HydratedDocument<PostEmbedding>

export const PostEmbeddingSchema = SchemaFactory.createForClass(PostEmbedding)
