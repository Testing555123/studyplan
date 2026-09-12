import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { CodeIndexService } from './code-index.service'
import { NvNimClient } from './nv-nim.client'
import { AiAnswerCache, AiAnswerCacheSchema, AiDailyUsage, AiDailyUsageSchema } from './schemas/ai-usage.schema'

/**
 * AI 模块。
 *
 * ── 关于 imports：这里只有 Mongoose，没有别的业务模块 ──
 *
 * 这一点是本项目刻意维持的边界，值得解释：
 *
 *   ```text
 *   PostsModule ──imports──▶ AiModule
 *   ```
 *
 * 依赖是**单向**的。AiService 不认识"帖子"这个概念，
 * 它只做"给文本，还我元数据"；回填落库由 PostsService 负责。
 * 如果反过来（AiModule 也 import PostsModule）就形成了循环依赖，
 * NestJS 会要求你用 `forwardRef()` 包起来 ——
 * 而 `forwardRef` 是一个明确的信号：**你的模块边界划错了**。
 *
 * 现在新增的两个 Mongoose Model 只服务于 AI 自己的用量与缓存，
 * 属于本模块的**内部实现**，不破坏这条单向依赖。
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiDailyUsage.name, schema: AiDailyUsageSchema },
      { name: AiAnswerCache.name, schema: AiAnswerCacheSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, NvNimClient, CodeIndexService],
  // PostsModule 要用它，所以必须导出
  exports: [AiService],
})
export class AiModule {}
