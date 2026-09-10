import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PostsModule } from '../posts/posts.module'
import { Like, LikeSchema } from './schemas/like.schema'
import { LikesController } from './likes.controller'
import { LikesService } from './likes.service'

/**
 * 点赞模块。
 *
 * 与评论模块同构：注册自己的集合 + import PostsModule 以便调整计数。
 *
 * 注意这一句在 PostsModule 里的存在，是整个跨模块协作的前提：
 *   `exports: [PostsService]`
 * 如果哪天有人清理"看起来没被用到"的 exports，评论和点赞会同时在
 * 启动时报依赖解析失败。这是删除"冗余"代码时最容易踩中的雷。
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Like.name, schema: LikeSchema }]),
    PostsModule,
  ],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
