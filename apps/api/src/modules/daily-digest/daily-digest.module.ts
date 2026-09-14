import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { CommentsModule } from '../comments/comments.module'
import { GithubModule } from '../github/github.module'
import { LikesModule } from '../likes/likes.module'
import { PostsModule } from '../posts/posts.module'
import { UsersModule } from '../users/users.module'
import { DailyDigestController } from './daily-digest.controller'
import { DailyDigestService } from './daily-digest.service'
import { DailyPickExclude, DailyPickExcludeSchema } from './schemas/daily-pick-exclude.schema'
import { DailyPick, DailyPickSchema } from './schemas/daily-pick.schema'

/**
 * 每日 GitHub 项目报道模块。
 *
 * ── 为什么单独建一个模块，而不是塞进 github 或 ai ──
 *
 * 这个装置其实是三种职责的组合：选项目（GitHub）、写稿（AI）、发帖（Posts）。
 * 把它塞进任何一个已有模块，都会让那个模块同时背上另外两种职责，
 * 变更原因立刻变成三个 —— 这正是本项目划模块时最忌讳的事。
 *
 * 独立成模块之后，它对三个上游都是**单向依赖**：
 *
 * ```text
 *   DailyDigestModule ──▶ GithubModule（候选池 + README）
 *                    ──▶ AiModule（NvNimClient）
 *                    ──▶ PostsModule（发帖 / 删帖）
 *                    ──▶ UsersModule（bot 账号）
 *                    ──▶ CommentsModule / LikesModule（撤回时级联删互动）
 * ```
 *
 * 没有任何一个上游需要知道"每日报道"的存在，
 * 所以关掉这个模块（或它整个失败）都不可能影响用户的正常流程。
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DailyPick.name, schema: DailyPickSchema },
      // 「不再推荐」名单。索引同样由 Mongoose 的 autoIndex 自动创建，
      // 与 daily_picks 一个机制，不需要手工建索引
      { name: DailyPickExclude.name, schema: DailyPickExcludeSchema },
    ]),
    UsersModule,
    GithubModule,
    PostsModule,
    AiModule,
    // 撤回报道时要连带删掉那篇帖子的评论与点赞
    CommentsModule,
    LikesModule,
  ],
  controllers: [DailyDigestController],
  providers: [DailyDigestService],
  exports: [DailyDigestService],
})
export class DailyDigestModule {}
