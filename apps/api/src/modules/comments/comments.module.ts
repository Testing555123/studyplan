import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PostsModule } from '../posts/posts.module'
import { Comment, CommentSchema } from './schemas/comment.schema'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'

/**
 * 评论模块。
 *
 * 注意 `imports` 里的 `PostsModule` —— 这是**跨模块协作**的标准做法：
 *
 * ```text
 * CommentsModule ──imports──▶ PostsModule
 *                                 └── exports: [PostsService]   ← 必须有这一句
 * ```
 *
 * 如果 PostsModule 忘了写 `exports: [PostsService]`，
 * CommentsService 的构造函数在启动时就会报
 * `Nest can't resolve dependencies of the CommentsService (..., ?)`。
 *
 * 那个 `?` 就是在说"这个位置我找不到可注入的东西"。
 * 遇到这个报错时，第一个要检查的就是：**目标模块到底导出它了吗？**
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
    PostsModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  /**
   * 导出给"每日 GitHub 报道"用：撤回一篇报道时要连带删掉它的评论。
   *
   * 和上面那句 `exports: [PostsService]` 属于同一类东西 ——
   * 它们看起来"暂时没人用"，但删掉会让**别的模块启动时**直接报依赖解析失败。
   */
  exports: [CommentsService],
})
export class CommentsModule {}
