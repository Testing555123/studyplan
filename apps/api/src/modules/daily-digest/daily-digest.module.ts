import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiModule } from '../ai/ai.module'
import { GithubModule } from '../github/github.module'
import { PostsModule } from '../posts/posts.module'
import { UsersModule } from '../users/users.module'
import { DailyDigestController } from './daily-digest.controller'
import { DailyDigestService } from './daily-digest.service'
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
 *                    ──▶ PostsModule（发帖）
 *                    ──▶ UsersModule（bot 账号）
 * ```
 *
 * 没有任何一个上游需要知道"每日报道"的存在，
 * 所以关掉这个模块（或它整个失败）都不可能影响用户的正常流程。
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: DailyPick.name, schema: DailyPickSchema }]),
    UsersModule,
    GithubModule,
    PostsModule,
    AiModule,
  ],
  controllers: [DailyDigestController],
  providers: [DailyDigestService],
  exports: [DailyDigestService],
})
export class DailyDigestModule {}
