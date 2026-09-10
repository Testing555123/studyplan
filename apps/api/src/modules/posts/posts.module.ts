import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { Post, PostSchema } from './schemas/post.schema'
import { PostsController } from './posts.controller'
import { PostsService } from './posts.service'

/**
 * 帖子模块。
 *
 * `MongooseModule.forFeature` 做的事：把 `Post` 这个 Model
 * 注册到依赖注入容器里，只在本模块（及导出了它的模块）可见。
 *
 * 为什么不用 `forRoot` 统一注册所有 Model？
 *   那样任何模块都能注入任何 Model，模块边界就消失了。
 *   `forFeature` 强制你回答："这个模块到底需要哪几个 Model？"
 *
 * `exports: [PostsService]` 是为后续阶段准备的：
 *   - 阶段 6 的评论/点赞要复用它（更新 commentCount / likeCount）；
 *   - 阶段 7 的 AI 服务要复用它（把生成的摘要写回帖子）。
 * 模块**只有导出之后**，别的模块才能 import 它拿到里面的 provider ——
 * 这是 NestJS 里最容易被忽略、也最容易导致"注入不到"报错的一条规则。
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    /**
     * 阶段 7 追加：发帖后要用 AiService 生成摘要与标签。
     * 依赖方向是 posts → ai，单向，不会形成循环依赖。
     */
    AiModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
