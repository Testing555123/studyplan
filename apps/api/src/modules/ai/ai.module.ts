import { Module } from '@nestjs/common'
import { AiService } from './ai.service'

/**
 * AI 模块。
 *
 * ── 注意这里的 imports 是**空的** ──
 *
 * 它不 import PostsModule —— 因为 AiService 只做一件事：
 * "给一段文本，还我一个摘要与标签"。它不碰数据库，
 * 也不知道"帖子"这个概念。
 *
 * 回填落库由 PostsService 负责，所以依赖方向是：
 *
 * ```text
 * PostsModule ──imports──▶ AiModule
 * ```
 *
 * 单向。如果反过来（AiModule 也 import PostsModule），
 * 就形成了**循环依赖**，NestJS 会要求你用 `forwardRef()` 包起来 ——
 * 而 `forwardRef` 是一个明确的信号：**你的模块边界划错了**。
 *
 * > 遇到循环依赖时，不要第一反应去加 forwardRef，
 * > 先问："是不是有一个东西的职责放错了位置？"
 * > 本项目里，答案是"回填应该由数据的拥有者（帖子模块）来做"。
 */
@Module({
  providers: [AiService],
  // PostsModule 要用它，所以必须导出
  exports: [AiService],
})
export class AiModule {}
